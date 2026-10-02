const LOCK_MESSAGE = 'Access temporarily unavailable. Please contact the app owner.';

function sendLocked(res) {
  return res.status(423).set('Cache-Control', 'no-store').json({ ok: false, code: 'SERVICE_LOCKED', error: LOCK_MESSAGE });
}

function createServiceAccess({ db, classDoc }) {
  async function classAllowed(c, res) {
    const account = await db.collection('admins').doc(c.adminId).get();
    const data = account.data();
    if (!account.exists || data.serviceLocked === true || data.disabled === true || data.approved === false) {
      sendLocked(res);
      return false;
    }
    return true;
  }
  function guard(slugFromRequest) {
    return async (req, res, next) => {
      try {
        const d = await classDoc(String(slugFromRequest(req) || ''));
        if (!d) return res.status(404).json({ ok: false, error: 'Class link not found.' });
        if (!await classAllowed(d.data(), res)) return;
        next();
      } catch (error) {
        console.error('Service access check failed:', error.message);
        res.status(503).json({ ok: false, error: 'Unable to verify access. Please try again shortly.' });
      }
    };
  }
  return { classAllowed, guard };
}

// Mount before the class routes so reads and writes share the same policy.
function mountServiceAccess(app, { ready, requireSameOrigin, requireOwner, db, classDoc, ownerEmail }) {
  const access = createServiceAccess({ db, classDoc });
  app.get('/api/class/:slug/access-status', ready, access.guard(req => req.params.slug), (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ ok: true });
  });
  app.use('/api/class/:slug', ready, access.guard(req => req.params.slug));
  app.get(['/api/ppts', '/api/config', '/api/structure'], ready, access.guard(req => req.query.class));
  // New clients send the class in the URL to reject locked uploads before receiving a file.
  // The multipart body is checked separately as well; this is not an authorization substitute.
  app.post('/api/upload', ready, (req, res, next) => req.query.class
    ? access.guard(req => req.query.class)(req, res, next) : next());
  app.post('/api/owner/admins/:adminId/service-access', requireSameOrigin, requireOwner, async (req, res) => {
    try {
      if (typeof req.body?.locked !== 'boolean') return res.status(400).json({ ok: false, error: 'Choose lock or unlock.' });
      const ref = db.collection('admins').doc(req.params.adminId);
      const target = await ref.get();
      if (!target.exists) return res.status(404).json({ ok: false, error: 'Admin not found.' });
      if (req.params.adminId === req.adminId || String(target.data().email || '').toLowerCase() === ownerEmail) {
        return res.status(400).json({ ok: false, error: 'The app owner cannot be locked.' });
      }
      await ref.set({ serviceLocked: req.body.locked, serviceAccessUpdatedAt: new Date(), serviceAccessUpdatedBy: req.adminId }, { merge: true });
      res.set('Cache-Control', 'no-store').json({ ok: true, serviceLocked: req.body.locked });
    } catch (error) {
      console.error('Service access update failed:', error.message);
      res.status(503).json({ ok: false, error: 'Could not update access. Please try again.' });
    }
  });
  return access;
}

module.exports = { LOCK_MESSAGE, sendLocked, createServiceAccess, mountServiceAccess };
