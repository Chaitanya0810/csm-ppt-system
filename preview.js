// Local UI preview only. No credentials or external storage are used.
require('./load-local-env');
const express = require('express');
const path = require('node:path');
const app = express();
app.use(express.json({ limit: '4kb' }));
app.get('/admin.html', (_req, res) => res.sendFile(path.join(__dirname, 'private', 'admin.html')));
app.get('/admin-login.html', (_req, res) => res.redirect(302, '/admin.html'));
app.get('/api/class/:slug', (_req, res) => res.json({
  ok: true, preview: true, name: 'CSE · Artificial Intelligence & Machine Learning · II Year',
  rolls: ['257R1A66C9', '257R1A66D0', '257R1A66D1', '257R1A66H1'],
  structure: { Theory: ['MSF', 'JAVA', 'COA', 'DBMS', 'SE'], Lab: ['Node-JS', 'CM', 'JAVA', 'DBMS', 'SE', 'GS'], Project: ['Node-JS', 'CM', 'JAVA', 'DBMS', 'SE'] }
}));
app.get('/api/config', (_req, res) => res.json({ ok: true, preview: true, className: 'CSE · Artificial Intelligence & Machine Learning · II Year', totalStudents: 4, structure: { Theory: ['MSF', 'JAVA', 'COA', 'DBMS', 'SE'], Lab: ['Node-JS', 'CM', 'JAVA', 'DBMS', 'SE', 'GS'], Project: ['Node-JS', 'CM', 'JAVA', 'DBMS', 'SE'] } }));
app.get('/api/ppts', (req, res) => {
  const submissions = req.query.category === 'Project' ? [] : ['257R1A66C9', '257R1A66D0', '257R1A66D1'].map(roll => ({ roll, fileName: `${roll}_${req.query.subject}_${req.query.category}.pptx`, presentationUrl: 'http://localhost:3001/preview-presentation' }));
  res.set('Cache-Control', 'no-store').json({ ok: true, preview: true, count: submissions.length, totalStudents: 4, submissions });
});
app.get('/preview-presentation', (_req, res) => res.type('html').send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sample presentation</title><link rel="stylesheet" href="/student.css?v=6"></head><body><main class="card"><header class="card-header"><h1>Sample presentation</h1></header><p style="padding:24px;line-height:1.6">This is a local preview. On the live site, this button opens the uploaded PPT.</p></main></body></html>'));
app.use('/api', (_req, res) => res.status(503).json({ ok: false, error: 'This is a local UI preview. Admin actions and Drive uploads require the configured application.' }));
app.use(express.static(path.join(__dirname, 'public')));
app.listen(3001, '127.0.0.1', () => console.log('UI preview: http://localhost:3001/student.html?class=preview'));
