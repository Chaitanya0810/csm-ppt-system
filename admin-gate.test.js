const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const adminGate = require('./admin-gate');

async function setup(t, password = 'test-password') {
  const app = express();
  app.use(express.json());
  adminGate(app, { password });
  app.get('/api/admin/me', (_req, res) => res.json({ ok: true }));
  app.post('/api/logout', (_req, res) => { res.append('Set-Cookie', 'other=; Max-Age=0'); res.json({ ok: true }); });
  app.use(express.static(path.join(__dirname, 'public')));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { request: (route, options) => fetch(origin + route, { redirect: 'manual', ...options }),
    login: (value, source = origin) => fetch(origin + '/api/admin-unlock', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: source }, body: JSON.stringify({ password: value }) }) };
}

test('direct admin access, encoded paths and APIs cannot bypass the gate', async t => {
  const { request } = await setup(t);
  assert.equal((await request('/admin.html')).status, 302);
  for (const route of ['/admin%2ehtml', '/ADMIN.HTML.', '/private/admin.html']) {
    const result = await request(route);
    assert.notEqual(result.status, 200);
  }
  assert.equal((await request('/api/admin/me')).status, 401);
  assert.equal((await request('/api/owner/admins')).status, 401);
  assert.equal((await request('/auth/google')).status, 302);
});
test('valid password unlocks page; cookie is HttpOnly and logout clears it', async t => {
  const { request, login } = await setup(t);
  assert.equal((await login('wrong')).status, 401);
  const result = await login('test-password');
  assert.equal(result.status, 200);
  const cookie = result.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/);
  const headers = { Cookie: cookie.split(';')[0] };
  assert.equal((await request('/admin.html', { headers })).status, 200);
  assert.equal((await request('/api/admin/me', { headers })).status, 200);
  const logout = await request('/api/logout', { method: 'POST', headers });
  assert.ok(logout.headers.getSetCookie().some(value => value.startsWith('csm_admin_gate=;')));
});
test('forged and expired sessions are rejected', async t => {
  const { request } = await setup(t);
  const token = `${Date.now() - 1000}.${'a'.repeat(32)}`;
  const key = crypto.createHash('sha256').update('test-password').digest();
  const signature = crypto.createHmac('sha256', key).update(token).digest('hex');
  for (const value of [`${token}.${signature}`, `${Date.now() + 60000}.${'a'.repeat(32)}.fake`]) {
    assert.equal((await request('/api/admin/me', { headers: { Cookie: `csm_admin_gate=${value}` } })).status, 401);
  }
});
test('cross-origin login and repeated wrong passwords are blocked', async t => {
  const { login } = await setup(t);
  assert.equal((await login('test-password', 'https://other.example')).status, 403);
  for (let i = 0; i < 5; i++) assert.equal((await login('wrong')).status, 401);
  assert.equal((await login('test-password')).status, 429);
});
test('missing production password fails closed', async t => {
  const { login, request } = await setup(t, '');
  assert.equal((await login('anything')).status, 503);
  assert.equal((await request('/api/admin/me')).status, 401);
});
