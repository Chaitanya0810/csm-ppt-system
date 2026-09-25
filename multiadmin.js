// Multi-admin routes. Google OAuth tokens and class configuration are stored in
// Firestore; OAuth tokens are encrypted at rest with MULTI_ADMIN_ENCRYPTION_KEY.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const { google } = require('googleapis');
const firebaseAdmin = require('firebase-admin');

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const TOKEN_COOKIE = 'csm_admin_session';

function createMultiAdmin(app, { port, loadTestMode }) {
  if (loadTestMode || process.env.MULTI_ADMIN_ENABLED === 'false') return;
  let db;
  let oauthConfig;
  let configError;
  const ownerEmail = String(process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  const upload = multer({
    dest: path.join(__dirname, 'uploads'),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      if (!/\.(ppt|pptx)$/i.test(file.originalname)) return cb(new Error('Only PPT and PPTX files are allowed.'));
      cb(null, true);
    }
  });

  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
    if (!process.env.GOOGLE_OAUTH_CREDENTIALS_JSON) throw new Error('GOOGLE_OAUTH_CREDENTIALS_JSON is not set.');
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const oauth = JSON.parse(process.env.GOOGLE_OAUTH_CREDENTIALS_JSON);
    const appCredentials = oauth.web || oauth.installed;
    if (!appCredentials?.client_id || !appCredentials?.client_secret) throw new Error('Google OAuth credentials are invalid.');
    if (!/^[0-9a-f]{64}$/i.test(process.env.MULTI_ADMIN_ENCRYPTION_KEY || '')) throw new Error('MULTI_ADMIN_ENCRYPTION_KEY must be a 64-character hex key.');
    oauthConfig = { ...appCredentials, clientId: appCredentials.client_id, clientSecret: appCredentials.client_secret };
    firebaseAdmin.initializeApp({ credential: firebaseAdmin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
    db = firebaseAdmin.firestore();
  } catch (e) { configError = e.message; }

  const ready = (req, res, next) => {
    if (loadTestMode) return res.status(503).json({ ok: false, error: 'Admin sign-in is disabled in load test mode.' });
    if (!db) return res.status(503).json({ ok: false, error: `Multi-admin setup is incomplete: ${configError}` });
    next();
  };
  const oauthClient = (redirectUri) => new google.auth.OAuth2(oauthConfig.clientId, oauthConfig.clientSecret, redirectUri);
  const redirectUri = (req) => `${req.protocol}://${req.get('host')}/auth/google/callback`;
  const key = () => Buffer.from(process.env.MULTI_ADMIN_ENCRYPTION_KEY, 'hex');
  const encrypt = (value) => {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
  };
  const decrypt = (value) => {
    const [iv, tag, data] = value.split('.'), decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  };
  const sign = (id) => crypto.createHmac('sha256', key()).update(id).digest('base64url');
  const safeEqual = (a, b) => { const aa = Buffer.from(a || ''), bb = Buffer.from(b || ''); return aa.length === bb.length && crypto.timingSafeEqual(aa, bb); };
  const parseCookies = (header = '') => Object.fromEntries(header.split(';').map(v => v.trim().split('=').map(decodeURIComponent)).filter(v => v.length === 2));
  async function currentAdmin(req) {
    const cookie = parseCookies(req.headers.cookie)[TOKEN_COOKIE] || '';
    const [id, mac] = cookie.split('.');
    if (!id || !safeEqual(mac, sign(id))) return null;
    const snap = await db.collection('adminSessions').doc(id).get();
    if (!snap.exists || snap.data().expiresAt.toMillis() < Date.now()) return null;
    const adminId = snap.data().adminId;
    const admin = await db.collection('admins').doc(adminId).get();
    if (!admin.exists || admin.data().disabled === true) return null;
    return adminId;
  }
  const requireAdmin = (req, res, next) => ready(req, res, async () => {
    try {
      req.adminId = await currentAdmin(req);
      if (!req.adminId) return res.status(401).json({ ok: false, error: 'Sign in as an admin first.' });
      const account = await db.collection('admins').doc(req.adminId).get();
      req.adminEmail = String(account.data()?.email || '').toLowerCase();
      req.isOwner = Boolean(ownerEmail && req.adminEmail === ownerEmail);
      if (!req.isOwner && account.data()?.approved === false) return res.status(403).json({ ok: false, error: 'Your admin access is waiting for approval from the app owner.' });
      next();
    }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  const requireOwner = (req, res, next) => requireAdmin(req, res, () => {
    if (!ownerEmail) return res.status(503).json({ ok: false, error: 'The app owner account is not configured.' });
    if (!req.isOwner) return res.status(403).json({ ok: false, error: 'Only the app owner can manage all admins.' });
    next();
  });
  async function classDoc(slug) {
    const q = await db.collection('classes').where('slug', '==', slug).limit(1).get();
    return q.empty ? null : q.docs[0];
  }
  async function getDrive(adminId) {
    const ref = db.collection('admins').doc(adminId), snap = await ref.get();
    if (!snap.exists) throw new Error('Admin account is missing. Sign in again.');
    const auth = oauthClient(oauthConfig.redirect_uris?.[0]);
    auth.setCredentials({ refresh_token: decrypt(snap.data().refreshTokenEncrypted) });
    return google.drive({ version: 'v3', auth });
  }
  function publicClass(data) { return { name: data.name, slug: data.slug, structure: data.structure, rolls: data.rolls }; }
  function cleanName(value) { return String(value || '').trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 180); }
  function escapeQuery(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  async function locateFolder(drive, parentId, name, create = false) {
    const found = await drive.files.list({ q: `'${parentId}' in parents and name = '${escapeQuery(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: 'files(id,name)', pageSize: 1 });
    if (found.data.files?.[0]) return found.data.files[0].id;
    if (!create) throw new Error(`Folder not found: ${name}`);
    const created = await drive.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' });
    return created.data.id;
  }
  async function subjectFolder(drive, c, category, subject) {
    if (!c.structure?.[category]?.includes(subject)) throw new Error('Invalid category or subject.');
    const catId = await locateFolder(drive, c.rootFolderId, category, true);
    return locateFolder(drive, catId, subject, true);
  }

  // Keep the isolated load-test deployment on its existing no-Drive endpoints.
  if (loadTestMode) return;

  app.get('/auth/google', ready, async (req, res) => {
    const state = crypto.randomBytes(24).toString('base64url');
    await db.collection('oauthStates').doc(state).set({ expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
    res.redirect(oauthClient(redirectUri(req)).generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['openid', 'email', ...SCOPES], state }));
  });
  app.get('/auth/google/callback', ready, async (req, res) => {
    try {
      const stateRef = db.collection('oauthStates').doc(String(req.query.state || ''));
      const state = await stateRef.get();
      if (!state.exists || state.data().expiresAt.toMillis() < Date.now()) return res.status(400).send('Sign-in expired. Return to the admin page and try again.');
      await stateRef.delete();
      const { tokens } = await oauthClient(redirectUri(req)).getToken(String(req.query.code || ''));
      if (!tokens.refresh_token) throw new Error('Google did not return a refresh token. Revoke this app in your Google account and retry sign-in.');
      const auth = oauthClient(redirectUri(req)); auth.setCredentials(tokens);
      const userInfo = await google.oauth2({ version: 'v2', auth }).userinfo.get();
      if (userInfo.data.verified_email !== true || !userInfo.data.email) throw new Error('Google did not verify this email address.');
      const adminId = userInfo.data.id;
      const adminRef = db.collection('admins').doc(adminId), existingAdmin = await adminRef.get();
      if (existingAdmin.exists && existingAdmin.data().disabled === true) return res.status(403).send('This admin account has been disabled by the app owner.');
      const isOwner = Boolean(ownerEmail && String(userInfo.data.email).toLowerCase() === ownerEmail);
      const account = { email: userInfo.data.email, name: userInfo.data.name || '', refreshTokenEncrypted: encrypt(tokens.refresh_token), updatedAt: new Date() };
      if (!existingAdmin.exists) { account.disabled = false; account.approved = isOwner; }
      else if (isOwner) account.approved = true;
      await adminRef.set(account, { merge: true });
      const sessionId = crypto.randomBytes(32).toString('base64url');
      await db.collection('adminSessions').doc(sessionId).set({ adminId, expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) });
      res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=${encodeURIComponent(`${sessionId}.${sign(sessionId)}`)}; HttpOnly; ${req.secure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=1209600`);
      res.redirect('/admin.html');
    } catch (e) { console.error('OAuth callback failed:', e.message); res.status(500).send('Google sign-in failed. Check Render logs and OAuth redirect URI settings.'); }
  });
  app.post('/api/logout', ready, async (req, res) => {
    const cookie = parseCookies(req.headers.cookie)[TOKEN_COOKIE] || '', id = cookie.split('.')[0];
    if (id) await db.collection('adminSessions').doc(id).delete().catch(() => {});
    res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=; HttpOnly; ${req.secure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0`); res.json({ ok: true });
  });
  app.get('/api/admin/me', ready, async (req, res) => {
    try { const id = await currentAdmin(req); if (!id) return res.json({ ok: true, signedIn: false }); const d = (await db.collection('admins').doc(id).get()).data(); const owner = Boolean(ownerEmail && String(d.email || '').toLowerCase() === ownerEmail); res.json({ ok: true, signedIn: true, email: d.email, name: d.name, owner, approved: owner || d.approved !== false }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  app.get('/api/admin/classes', requireAdmin, async (req, res) => {
    const q = req.isOwner ? await db.collection('classes').get() : await db.collection('classes').where('adminId', '==', req.adminId).get();
    const classes = [];
    for (const doc of q.docs) {
      const c = doc.data();
      const item = { ...publicClass(c), adminId: c.adminId };
      if (req.isOwner) item.adminEmail = (await db.collection('admins').doc(c.adminId).get()).data()?.email || 'Unknown admin';
      classes.push(item);
    }
    res.json({ ok: true, owner: req.isOwner, classes });
  });
  app.get('/api/owner/admins', requireOwner, async (req, res) => {
    const [admins, classes] = await Promise.all([db.collection('admins').get(), db.collection('classes').get()]);
    const counts = new Map();
    for (const doc of classes.docs) counts.set(doc.data().adminId, (counts.get(doc.data().adminId) || 0) + 1);
    res.json({ ok: true, admins: admins.docs.map(doc => {
      const a = doc.data();
      return { id: doc.id, email: a.email || '', name: a.name || '', disabled: a.disabled === true, approved: a.approved !== false || String(a.email || '').toLowerCase() === ownerEmail, classCount: counts.get(doc.id) || 0 };
    }) });
  });
  app.post('/api/owner/admins/:adminId/access', requireOwner, async (req, res) => {
    const targetId = String(req.params.adminId || '');
    const action = req.body?.action;
    if (!targetId || !['approve', 'disable', 'enable', 'revoke'].includes(action)) return res.status(400).json({ ok: false, error: 'Choose a valid admin access action.' });
    if (targetId === req.adminId) return res.status(400).json({ ok: false, error: 'The owner account cannot disable itself.' });
    const ref = db.collection('admins').doc(targetId), target = await ref.get();
    if (!target.exists) return res.status(404).json({ ok: false, error: 'Admin not found.' });
    if (String(target.data().email || '').toLowerCase() === ownerEmail) return res.status(400).json({ ok: false, error: 'The owner account cannot be disabled.' });
    const changes = { accessUpdatedAt: new Date() };
    if (action === 'approve') Object.assign(changes, { approved: true, disabled: false });
    if (action === 'disable') changes.disabled = true;
    if (action === 'enable') changes.disabled = false;
    if (action === 'revoke') Object.assign(changes, { approved: false, disabled: true });
    const removeAccess = action === 'disable' || action === 'revoke';
    if (removeAccess) changes.refreshTokenEncrypted = firebaseAdmin.firestore.FieldValue.delete();
    await ref.set(changes, { merge: true });
    if (removeAccess) {
      const sessions = await db.collection('adminSessions').where('adminId', '==', targetId).get();
      for (let i = 0; i < sessions.docs.length; i += 450) {
        const batch = db.batch();
        for (const session of sessions.docs.slice(i, i + 450)) batch.delete(session.ref);
        await batch.commit();
      }
    }
    res.json({ ok: true, approved: action === 'approve' || (action !== 'revoke' && target.data().approved !== false), disabled: action === 'disable' || action === 'revoke' || (action === 'enable' ? false : target.data().disabled === true) });
  });
  app.post('/api/admin/classes', requireAdmin, async (req, res) => {
    try {
      const { name, rootFolderId, structure, rolls } = req.body || {};
      if (!String(name || '').trim() || !String(rootFolderId || '').trim()) return res.status(400).json({ ok: false, error: 'Enter a class name and the Google Drive folder ID.' });
      if (!structure || typeof structure !== 'object' || !Object.keys(structure).length || Object.values(structure).some(v => !Array.isArray(v) || !v.length)) return res.status(400).json({ ok: false, error: 'Add at least one category and subject.' });
      const cleanRolls = [...new Set((Array.isArray(rolls) ? rolls : String(rolls || '').split(/[\s,;]+/)).map(v => String(v).trim().toUpperCase()).filter(Boolean))];
      if (!cleanRolls.length || cleanRolls.some(v => !/^[A-Z0-9-]{2,30}$/.test(v))) return res.status(400).json({ ok: false, error: 'Enter valid student roll numbers (letters, numbers, hyphens).'});
      const drive = await getDrive(req.adminId);
      const root = await drive.files.get({ fileId: String(rootFolderId).trim(), fields: 'id,mimeType' });
      if (root.data.mimeType !== 'application/vnd.google-apps.folder') return res.status(400).json({ ok: false, error: 'The Drive ID must be a folder.' });
      const safeStructure = {};
      for (const [cat, subjects] of Object.entries(structure)) {
        const c = String(cat).trim().slice(0, 50), s = [...new Set(subjects.map(x => String(x).trim().slice(0, 80)).filter(Boolean))];
        if (!c || !s.length) return res.status(400).json({ ok: false, error: 'Every category must have a subject.' });
        safeStructure[c] = s;
      }
      const slug = crypto.randomBytes(12).toString('base64url');
      await db.collection('classes').doc(crypto.randomUUID()).set({ adminId: req.adminId, slug, name: String(name).trim().slice(0, 100), rootFolderId: root.data.id, structure: safeStructure, rolls: cleanRolls, createdAt: new Date() });
      res.json({ ok: true, slug, studentUrl: `${req.protocol}://${req.get('host')}/?class=${slug}` });
    } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  app.delete('/api/admin/classes/:slug', requireAdmin, async (req, res) => {
    const d = await classDoc(req.params.slug);
    if (!d || (!req.isOwner && d.data().adminId !== req.adminId)) return res.status(404).json({ ok: false, error: 'Class not found.' });
    await d.ref.delete(); res.json({ ok: true });
  });

  app.get('/api/class/:slug', ready, async (req, res) => {
    const d = await classDoc(req.params.slug); if (!d) return res.status(404).json({ ok: false, error: 'Class link not found.' });
    res.json({ ok: true, ...publicClass(d.data()) });
  });
  app.post('/api/upload', ready, upload.single('file'), async (req, res) => {
    let temp = req.file?.path;
    try {
      if (!req.file) return res.status(400).json({ ok: false, error: 'Choose a PPT/PPTX file.' });
      const d = await classDoc(String(req.body.classSlug || '')); if (!d) return res.status(404).json({ ok: false, error: 'Class link not found.' });
      const c = d.data(), roll = String(req.body.roll || '').trim().toUpperCase(), category = String(req.body.category || ''), subject = String(req.body.subject || '');
      if (!c.rolls.includes(roll)) return res.status(400).json({ ok: false, error: 'This roll number is not in the class roster.' });
      const drive = await getDrive(c.adminId), folderId = await subjectFolder(drive, c, category, subject);
      const existing = await drive.files.list({ q: `'${folderId}' in parents and name contains '${escapeQuery(roll)}_' and trashed = false`, fields: 'files(id,name)', pageSize: 100 });
      if ((existing.data.files || []).some(f => f.name.toUpperCase().startsWith(`${roll}_`))) return res.status(409).json({ ok: false, error: 'This roll number has already submitted for this subject and category.' });
      const filename = `${roll}_${subject.replace(/[^a-zA-Z0-9-]/g, '_')}_${category}_${cleanName(req.file.originalname)}`;
      const mimeType = /\.ppt$/i.test(filename) ? 'application/vnd.ms-powerpoint' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      const result = await drive.files.create({ requestBody: { name: filename, parents: [folderId], mimeType }, media: { mimeType, body: fs.createReadStream(temp) }, fields: 'id,name,webViewLink' });
      res.json({ ok: true, message: 'PPT uploaded successfully.', fileName: result.data.name, driveUrl: result.data.webViewLink || `https://drive.google.com/file/d/${result.data.id}/view` });
    } catch (e) { console.error('Multi-admin upload:', e.message); res.status(500).json({ ok: false, error: e.message || 'Upload failed.' }); }
    finally { if (temp) fs.promises.unlink(temp).catch(() => {}); }
  });
  app.get('/api/ppts', requireAdmin, async (req, res) => {
    try {
      const d = await classDoc(String(req.query.class || ''));
      if (!d || (!req.isOwner && d.data().adminId !== req.adminId)) return res.status(404).json({ ok: false, error: 'Class not found.' });
      const c = d.data(), category = String(req.query.category || ''), subject = String(req.query.subject || ''), drive = await getDrive(c.adminId), folderId = await subjectFolder(drive, c, category, subject);
      const files = await drive.files.list({ q: `'${folderId}' in parents and trashed = false`, fields: 'files(id,name,createdTime,webViewLink)', pageSize: 1000, orderBy: 'name' });
      const submissions = (files.data.files || []).filter(f => /\.(ppt|pptx)$/i.test(f.name)).map(f => ({ roll: c.rolls.find(r => f.name.toUpperCase().startsWith(`${r}_`)) || '', fileName: f.name, fileId: f.id, driveUrl: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`, createdAt: f.createdTime }));
      res.json({ ok: true, subject, category, count: submissions.length, totalStudents: c.rolls.length, submissions });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  app.get('/api/config', ready, async (req, res) => {
    const slug = String(req.query.class || ''); const d = await classDoc(slug);
    if (!d) return res.status(404).json({ ok: false, error: 'Class link not found.' });
    const c = d.data();
    const signedInAdmin = await currentAdmin(req);
    const signedInAccount = signedInAdmin ? await db.collection('admins').doc(signedInAdmin).get() : null;
    const signedInEmail = String(signedInAccount?.data()?.email || '').toLowerCase();
    if (signedInAdmin !== c.adminId && (!ownerEmail || signedInEmail !== ownerEmail)) return res.status(401).json({ ok: false, error: 'Sign in as the class admin or app owner to view submissions.' });
    res.json({ ok: true, structure: c.structure, className: c.name, totalStudents: c.rolls.length });
  });
  app.get('/api/health', ready, async (req, res) => { res.json({ ok: true, multiAdmin: true, storage: 'firestore' }); });
}

module.exports = createMultiAdmin;
