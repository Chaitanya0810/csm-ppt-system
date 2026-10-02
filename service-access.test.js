const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const express = require('express');

// Exercise the real multi-admin routing and authorization with isolated storage and Drive.
async function setup(t) {
  const key = '1'.repeat(64);
  const iv = Buffer.alloc(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const token = Buffer.concat([cipher.update('test-refresh-token'), cipher.final()]);
  const encrypted = [iv, cipher.getAuthTag(), token].map(v => v.toString('base64url')).join('.');
  const records = new Map([
    ['admins/owner', { email: 'owner@example.test', approved: true }],
    ['admins/cr', { email: 'cr@example.test', approved: true, refreshTokenEncrypted: encrypted }],
    ['admins/other', { email: 'other@example.test', approved: true }],
    ...['alpha', 'beta', 'other'].map(slug => [`classes/${slug}`, {
      slug, name: slug, adminId: slug === 'other' ? 'other' : 'cr', publicDashboard: true,
      rolls: ['ROLL1'], structure: { Theory: ['JAVA'], Project: ['SE'] }, rootFolderId: 'root'
    }]),
    ...['owner', 'cr', 'other'].map(id => [`adminSessions/${id}`, { adminId: id, expiresAt: { toMillis: () => Date.now() + 60000 } }])
  ]);
  let failReads = false, driveCalls = 0, fileParent = 'subject-folder';
  function collection(name, filters = []) {
    return {
      doc(id) {
        const path = `${name}/${id}`;
        const ref = { path, set: async (data, opts) => records.set(path, opts?.merge ? { ...records.get(path), ...data } : data), delete: async () => records.delete(path) };
        ref.get = async () => {
          if (failReads && name === 'admins') throw new Error('Storage unavailable');
          return { id, ref, exists: records.has(path), data: () => records.get(path) };
        };
        return ref;
      },
      where: (field, op, value) => collection(name, [...filters, data => op === '==' ? data[field] === value : data[field] < value]),
      limit() { return this; },
      async get() {
        const docs = [];
        for (const [path, data] of records) if (path.startsWith(name + '/') && filters.every(f => f(data))) docs.push(await this.doc(path.slice(name.length + 1)).get());
        return { docs, empty: docs.length === 0 };
      }
    };
  }
  const db = { collection, runTransaction: fn => fn({ get: ref => ref.get(), set: (ref, data) => ref.set(data), delete: ref => ref.delete() }) };
  const module = { exports: {} };
  const google = {
    auth: { OAuth2: class { setCredentials() {} } },
    drive: () => {
      driveCalls++;
      return { files: {
        list: async ({ q }) => ({ data: { files: q.includes("name = 'Theory'") ? [{ id: 'category-folder' }] : q.includes("name = 'JAVA'") ? [{ id: 'subject-folder' }] : [{ id: 'ppt1', name: 'ROLL1_JAVA.pptx' }] } }),
        get: async () => ({ data: { id: 'ppt1', name: 'ROLL1_JAVA.pptx', parents: [fileParent], trashed: false } })
      } };
    }
  };
  const mocks = {
    googleapis: { google }, nodemailer: {},
    'firebase-admin/app': { cert: x => x, initializeApp: () => ({}) },
    'firebase-admin/firestore': { getFirestore: () => db, FieldValue: {} },
    './se-sheet': { syncProjectSheet: () => { throw new Error('Unexpected sheet write'); } }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('./multiadmin'), 'utf8'), {
    module, require: id => mocks[id] || require(id), __dirname, Buffer, URL, console,
    setInterval: () => ({ unref() {} }),
    process: { env: { SUPER_ADMIN_EMAIL: 'owner@example.test', MULTI_ADMIN_ENCRYPTION_KEY: key,
      FIREBASE_SERVICE_ACCOUNT_JSON: '{}', GOOGLE_OAUTH_CREDENTIALS_JSON: '{"web":{"client_id":"test","client_secret":"test"}}' } }
  });
  const app = express();
  app.use(express.json());
  module.exports(app, { port: 0, loadTestMode: false });
  app.use(express.static('public'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  function request(path, { admin, method = 'GET', body, foreignOrigin = false } = {}) {
    const headers = { Origin: foreignOrigin ? 'https://untrusted.test' : origin };
    if (admin) headers.Cookie = `csm_admin_session=${admin}.${crypto.createHmac('sha256', Buffer.from(key, 'hex')).update(admin).digest('base64url')}`;
    if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
    return fetch(origin + path, { method, headers, body, redirect: 'manual' });
  }
  return { request, records, lock: (locked, admin = 'owner') => request('/api/owner/admins/cr/service-access', { admin, method: 'POST', body: { locked } }),
    failReads: () => { failReads = true; }, driveCalls: () => driveCalls, wrongFile: () => { fileParent = 'someone-elses-folder'; } };
}

test('owner lock covers all CR classes and direct student and admin APIs; unlock preserves data', async t => {
  const f = await setup(t);
  assert.equal((await f.request('/api/config?class=alpha')).status, 200);
  const originalToken = f.records.get('admins/cr').refreshTokenEncrypted;
  assert.equal((await f.lock(true)).status, 200);
  const routes = [
    ['/api/class/alpha'], ['/api/class/beta'], ['/api/config?class=alpha'], ['/api/structure?class=alpha'],
    ['/api/ppts?class=alpha&category=Theory&subject=JAVA'], ['/api/class/alpha/se-projects'],
    ['/api/class/alpha/se-projects', { method: 'POST', body: { roll: 'ROLL1' } }],
    ...['view', 'slides', 'download'].map(action => [`/api/class/alpha/presentations/ppt1/${action}?category=Theory&subject=JAVA`]),
    ['/api/admin/classes', { admin: 'cr' }],
    ['/api/admin/classes', { admin: 'cr', method: 'POST', body: {} }],
    ['/api/admin/classes/alpha', { admin: 'cr', method: 'DELETE' }],
    ['/api/upload?class=alpha', { method: 'POST' }]
  ];
  for (const [route, options] of routes) {
    const response = await f.request(route, options);
    assert.equal(response.status, 423, route);
    assert.equal((await response.json()).code, 'SERVICE_LOCKED', route);
  }
  assert.equal(f.driveCalls(), 0);
  assert.equal((await f.request('/student.html?class=alpha')).status, 200);
  assert.equal((await f.request('/dashboard.html?class=alpha')).status, 200);
  assert.equal((await f.request('/api/config?class=other')).status, 200);
  assert.equal((await f.request('/api/owner/admins', { admin: 'owner' })).status, 200);
  assert.equal((await (await f.request('/api/admin/me', { admin: 'cr' })).json()).serviceLocked, true);
  assert.equal((await f.lock(false)).status, 200);
  assert.equal((await f.request('/api/config?class=alpha')).status, 200);
  assert.equal((await f.request('/api/class/beta')).status, 200);
  assert.equal((await f.request('/api/admin/classes', { admin: 'cr' })).status, 200);
  assert.equal(f.records.get('admins/cr').refreshTokenEncrypted, originalToken);
  assert.equal(f.records.get('admins/cr').serviceAccessUpdatedBy, 'owner');
  assert.ok(f.records.has('adminSessions/cr'));
  assert.ok(f.records.has('classes/alpha'));
});

test('CRs and anonymous callers cannot change locks; owner and origin protections remain enforced', async t => {
  const f = await setup(t);
  assert.equal((await f.lock(true, 'cr')).status, 403);
  assert.equal((await f.lock(true, null)).status, 401);
  assert.equal((await f.request('/api/owner/admins/cr/service-access', { admin: 'owner', method: 'POST', foreignOrigin: true, body: { locked: true } })).status, 403);
  assert.equal((await f.lock('true')).status, 400);
  assert.equal((await f.request('/api/owner/admins/owner/service-access', { admin: 'owner', method: 'POST', body: { locked: true } })).status, 400);
  assert.equal((await f.request('/api/owner/admins/missing/service-access', { admin: 'owner', method: 'POST', body: { locked: true } })).status, 404);
  await f.lock(true);
  assert.equal((await f.lock(false, 'cr')).status, 423);
  assert.equal(f.records.get('admins/cr').serviceLocked, true);
});

test('multipart upload cannot bypass the lock by omitting or changing the URL class', async t => {
  const f = await setup(t);
  await f.lock(true);
  for (const route of ['/api/upload', '/api/upload?class=other']) {
    const form = new FormData();
    form.set('classSlug', 'alpha'); form.set('roll', 'ROLL1'); form.set('category', 'Theory'); form.set('subject', 'JAVA');
    form.set('file', new Blob([Buffer.from('504b030400000000', 'hex')]), 'test.pptx');
    const response = await f.request(route, { method: 'POST', body: form });
    assert.equal(response.status, 423);
    assert.equal((await response.json()).code, 'SERVICE_LOCKED');
  }
  assert.equal(f.driveCalls(), 0);
});

test('status endpoint reflects locks without exposing class data and fails closed on storage failure', async t => {
  const f = await setup(t);
  assert.deepEqual(await (await f.request('/api/class/alpha/access-status')).json(), { ok: true });
  await f.lock(true);
  assert.equal((await f.request('/api/class/alpha/access-status')).status, 423);
  await f.lock(false);
  f.failReads();
  assert.equal((await f.request('/api/class/alpha/access-status')).status, 503);
  assert.equal((await f.request('/api/ppts?class=alpha')).status, 503);
  assert.equal(f.driveCalls(), 0);
});
