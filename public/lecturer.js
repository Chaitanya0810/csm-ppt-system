const $ = id => document.getElementById(id);
let classes = [];
async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function options(select, items, placeholder) {
  select.replaceChildren(new Option(placeholder, ''), ...items.map(value => new Option(value, value)));
  select.disabled = !items.length;
}
function currentClass() { return classes.find(value => value.slug === $('classSelect').value); }
function makeSubmissionRow(file, classData, category, subject) {
  const item = document.createElement('li');
  item.className = 'submission';
  const title = document.createElement('div');
  title.className = 'submission-title';
  title.textContent = file.rolls.join(', ') || 'Roll number not identified';
  const form = document.createElement('form');
  form.className = 'review-form';
  const completedLabel = document.createElement('label');
  completedLabel.className = 'completed-control';
  const completed = document.createElement('input');
  completed.type = 'checkbox';
  completed.checked = file.completed;
  completedLabel.append(completed, document.createTextNode('Completed'));
  const marksLabel = document.createElement('label');
  marksLabel.className = 'marks-control';
  marksLabel.append(document.createTextNode('Marks (out of 10)'));
  const marks = document.createElement('input');
  marks.type = 'number'; marks.min = '0'; marks.max = '10'; marks.step = '0.5'; marks.inputMode = 'decimal';
  marks.placeholder = 'Not marked'; marks.value = file.marks ?? '';
  marksLabel.append(marks);
  const save = document.createElement('button');
  save.type = 'submit'; save.textContent = 'Save review';
  const status = document.createElement('span');
  status.className = 'review-status'; status.setAttribute('role', 'status');
  if (file.reviewedBy) status.textContent = `Last saved by ${file.reviewedBy}`;
  form.append(completedLabel, marksLabel, save, status);
  form.onsubmit = async event => {
    event.preventDefault();
    if (marks.value !== '' && (!Number.isFinite(Number(marks.value)) || Number(marks.value) < 0 || Number(marks.value) > 10)) {
      status.textContent = 'Enter marks from 0 to 10.'; marks.focus(); return;
    }
    save.disabled = true; status.textContent = 'Saving…';
    try {
      const data = await api(`/api/lecturer/classes/${encodeURIComponent(classData.slug)}/submissions/${encodeURIComponent(file.id)}/review`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, subject, completed: completed.checked, marks: marks.value === '' ? null : Number(marks.value) })
      });
      file.completed = data.review.completed; file.marks = data.review.marks; file.reviewedBy = data.review.reviewedBy;
      status.textContent = `Saved${file.reviewedBy ? ` by ${file.reviewedBy}` : ''}.`;
    } catch (error) { status.textContent = error.message; }
    finally { save.disabled = false; }
  };
  item.append(title, form);
  return item;
}
async function load() {
  try {
    const me = await api('/api/lecturer/me');
    if (!me.signedIn) { $('identity').textContent = 'Not signed in as a lecturer.'; $('signedOut').hidden = false; return; }
    $('identity').textContent = `Signed in as ${me.name || me.email}`; $('workspace').hidden = false; $('logout').hidden = false;
    const data = await api('/api/lecturer/classes'); classes = data.classes;
    options($('classSelect'), classes.map(value => value.name), 'Choose a class');
    classes.forEach((value, index) => { $('classSelect').options[index + 1].value = value.slug; });
    if (!classes.length) {
      $('classMessage').hidden = false;
      $('classMessage').textContent = data.unavailableCount ? 'No active classes are available. Ask the app owner to check that class admin access is enabled.' : 'There are no classes set up yet.';
    }
  } catch (error) { $('identity').textContent = error.message; $('signedOut').hidden = false; }
}
$('classSelect').onchange = () => {
  const c = currentClass(); $('results').hidden = true; $('notesPanel').hidden = true;
  options($('categorySelect'), c ? Object.keys(c.structure) : [], 'Choose category'); options($('subjectSelect'), [], 'Choose subject');
};
$('categorySelect').onchange = () => {
  const c = currentClass(); options($('subjectSelect'), c?.structure[$('categorySelect').value] || [], 'Choose subject');
  $('results').hidden = true; $('notesPanel').hidden = true;
};
$('subjectSelect').onchange = async () => {
  const c = currentClass(), category = $('categorySelect').value, subject = $('subjectSelect').value;
  if (!c || !subject) return;
  $('results').hidden = true; $('notesPanel').hidden = category !== 'Notes';
  if (category === 'Notes') return;
  try {
    const data = await api(`/api/lecturer/classes/${encodeURIComponent(c.slug)}/submissions?category=${encodeURIComponent(category)}&subject=${encodeURIComponent(subject)}`);
    $('submittedCount').textContent = data.submittedRolls.length; $('missingCount').textContent = data.missingRolls.length; $('totalCount').textContent = data.totalStudents;
    $('missingRolls').textContent = data.missingRolls.length ? data.missingRolls.join(' · ') : 'Everyone has submitted.';
    const list = $('submissionList'); list.replaceChildren();
    for (const file of data.submissions) list.append(makeSubmissionRow(file, c, category, subject));
    if (!data.submissions.length) { const empty = document.createElement('li'); empty.textContent = 'No presentations submitted for this subject yet.'; list.append(empty); }
    $('results').hidden = false;
  } catch (error) { $('missingRolls').textContent = error.message; $('results').hidden = false; }
};
$('notesForm').onsubmit = async event => {
  event.preventDefault(); const c = currentClass(), status = $('notesStatus'), form = event.currentTarget;
  status.textContent = 'Uploading…'; const body = new FormData(form); body.set('subject', $('subjectSelect').value);
  try { await api(`/api/lecturer/classes/${encodeURIComponent(c.slug)}/notes`, { method: 'POST', body }); status.textContent = 'Notes uploaded and shared with the class.'; form.reset(); }
  catch (error) { status.textContent = error.message; }
};
$('logout').onclick = async () => { await api('/api/lecturer/logout', { method: 'POST' }); location.href = '/lecturer.html'; };
load();
