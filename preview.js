// Local UI preview only. No credentials or external storage are used.
require('./load-local-env');
const express = require('express');
const path = require('node:path');
const app = express();
app.use(express.json({ limit: '4kb' }));
require('./admin-gate')(app);
app.get('/api/class/:slug', (_req, res) => res.json({
  ok: true, preview: true, name: 'CSE · Artificial Intelligence & Machine Learning · II Year',
  rolls: ['257R1A66C9', '257R1A66D0', '257R1A66D1', '257R1A66H1'],
  structure: { Theory: ['MSF', 'JAVA', 'COA', 'DBMS', 'SE'], Lab: ['Node-JS', 'CM', 'JAVA', 'DBMS', 'SE', 'GS'], Project: ['Node-JS', 'CM', 'JAVA', 'DBMS', 'SE'] }
}));
app.get('/api/config', (_req, res) => res.json({ ok: true, preview: true, className: 'CSE · Artificial Intelligence & Machine Learning · II Year', totalStudents: 4, structure: { Theory: ['MSF', 'JAVA', 'COA', 'DBMS', 'SE'], Lab: ['Node-JS', 'CM', 'JAVA', 'DBMS', 'SE', 'GS'], Project: ['Node-JS', 'CM', 'JAVA', 'DBMS', 'SE'] } }));
app.get('/api/ppts', (req, res) => {
  const submissions = req.query.category === 'Project' ? [] : ['257R1A66C9', '257R1A66D0', '257R1A66D1'].map(roll => ({ roll, fileName: `${roll}_${req.query.subject}_${req.query.category}.pptx` }));
  res.set('Cache-Control', 'no-store').json({ ok: true, preview: true, count: submissions.length, totalStudents: 4, submissions });
});
app.use('/api', (_req, res) => res.status(503).json({ ok: false, error: 'This is a local UI preview. Admin actions and Drive uploads require the configured application.' }));
app.use(express.static(path.join(__dirname, 'public')));
app.listen(3001, '127.0.0.1', () => console.log('UI preview: http://localhost:3001/student.html?class=preview'));
