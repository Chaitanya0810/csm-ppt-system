const crypto = require('node:crypto');
const path = require('node:path');

module.exports = function adminGate(app, { password = process.env.ADMIN_PAGE_PASSWORD || '' } = {}) {
  const cookieName = 'csm_admin_gate';
  const digest = value => crypto.createHash('sha256').update(value).digest();
  const signingKey = digest(password);
  const sign = value => crypto.createHmac('sha256', signingKey).update(value).digest('hex');
  const equal = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));
  const attempts = new Map();
  function allowed(req) {
    if (!password) return false;
    const cookie = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`));
    const [expires, nonce, signature] = (cookie || '').slice(cookieName.length + 1).split('.');
    return /^\d+$/.test(expires || '') && Number(expires) > Date.now() && /^[a-f0-9]{32}$/.test(nonce || '') && equal(signature || '', sign(`${expires}.${nonce}`));
  }
  const clearCookie = res => res.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', path: '/' });
  app.post('/api/admin-unlock', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.get('origin') !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ ok: false, error: 'Request origin was not accepted.' });
    if (!password) return res.status(503).json({ ok: false, error: 'The admin password has not been configured on the server.' });
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const key = req.ip;
    const attempt = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    if (attempt.count >= 5 || (!attempts.has(key) && attempts.size >= 10000)) return res.status(429).json({ ok: false, error: 'Too many attempts. Try again in 15 minutes.' });
    if (typeof req.body?.password !== 'string' || req.body.password.length > 1024 || !equal(req.body.password, password)) {
      attempt.count++; attempts.set(key, attempt); clearCookie(res);
      return res.status(401).json({ ok: false, error: 'Incorrect password.' });
    }
    attempts.delete(key);
    const token = `${now + 60 * 60 * 1000}.${crypto.randomBytes(16).toString('hex')}`;
    res.cookie(cookieName, `${token}.${sign(token)}`, { httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 1000 });
    res.json({ ok: true });
  });
  app.get('/admin.html', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!allowed(req)) return res.redirect('/admin-login.html');
    res.sendFile(path.join(__dirname, 'private', 'admin.html'));
  });
  app.use((req, res, next) => {
    let pathname;
    try { pathname = decodeURIComponent(req.path).toLowerCase(); } catch { return res.sendStatus(400); }
    const protectedRoute = /^\/api\/(admin|owner)(\/|$)/.test(pathname) || /^\/auth\/google(\/|$)/.test(pathname);
    if (protectedRoute && !allowed(req)) {
      if (pathname.startsWith('/auth/')) return res.redirect('/admin-login.html');
      return res.status(401).json({ ok: false, error: 'Enter the admin password first.' });
    }
    if (pathname === '/api/logout') clearCookie(res);
    next();
  });
};
