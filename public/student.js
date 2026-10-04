const params = new URLSearchParams(location.search);
const slug = params.get('class');
document.getElementById('submissionsLink').href = `/dashboard.html?class=${encodeURIComponent(slug || '0ByADJgBHSrnWtxN')}`;
document.getElementById('adminLink').href = `/admin-login.html?class=${encodeURIComponent(slug || '0ByADJgBHSrnWtxN')}`;
const roll = document.getElementById('roll');
const cat = document.getElementById('category');
const sub = document.getElementById('subject');
const statusBox = document.getElementById('status');
const fields = document.getElementById('fields');
const fileInput = document.getElementById('file');
const progress = document.getElementById('progress');
const button = document.getElementById('submit');
const teamSection = document.getElementById('projectTeam');
const teamSize = document.getElementById('teamSize');
const teammates = document.getElementById('teammates');
const notesSection = document.getElementById('notesSection');
const noteTitle = document.getElementById('noteTitle');
const noteFile = document.getElementById('noteFile');
const postNote = document.getElementById('postNote');
const noteStatus = document.getElementById('noteStatus');
const pptFileLabel = document.getElementById('pptFileLabel');
let serviceLocked = false;
let noteSubmitting = false;
window.addEventListener('service-locked', event => {
  serviceLocked = true; fields.disabled = true; button.disabled = true;
  postNote.disabled = true;
  document.getElementById('className').textContent = 'Access unavailable'; message(event.detail, 'error');
});
function checkServiceAccess(data) { if (data.code === 'SERVICE_LOCKED') window.dispatchEvent(new CustomEvent('service-locked', { detail: data.error })); }
function updateTeamForm() {
  if (serviceLocked) { fields.disabled = true; button.disabled = true; return; }
  const project = cat.value === 'Project', notes = cat.value === 'Notes';
  teamSection.hidden = !project; teamSize.disabled = !project; teamSize.required = project;
  pptFileLabel.hidden = notes; fileInput.hidden = notes; fileInput.disabled = notes; button.hidden = notes; button.disabled = false;
  teammateSelects().forEach(select => { select.disabled = !roll.value; });
  updateNotesControls();
}
function updateNotesControls() {
  const notes = !!cfg && cat.value === 'Notes';
  notesSection.hidden = !notes;
  noteTitle.disabled = serviceLocked || noteSubmitting;
  noteFile.disabled = serviceLocked || noteSubmitting;
  postNote.disabled = serviceLocked || noteSubmitting || !roll.value || !sub.value || !noteTitle.value.trim() || !noteFile.files?.length;
}
async function submitNote() {
  if (!roll.value || cat.value !== 'Notes' || !sub.value || !noteTitle.value.trim() || !noteFile.files?.length || noteSubmitting || serviceLocked) return;
  if (noteFile.files[0].size > 25 * 1024 * 1024) { noteStatus.textContent = 'Notes files must be 25 MB or smaller.'; return; }
  noteSubmitting = true; updateNotesControls(); noteStatus.textContent = 'Uploading note…';
  try {
    const form = new FormData();
    form.append('roll', roll.value); form.append('subject', sub.value); form.append('title', noteTitle.value.trim()); form.append('file', noteFile.files[0]);
    const response = await fetch(`/api/class/${encodeURIComponent(slug)}/notes`, {
      method: 'POST', body: form
    });
    const data = await response.json(); checkServiceAccess(data);
    if (!response.ok) throw new Error(data.error || 'Could not upload your note.');
    noteTitle.value = ''; noteFile.value = ''; noteStatus.textContent = 'Notes uploaded. You can view them from View Submissions under Notes.';
  } catch (error) { noteStatus.textContent = error.message; }
  finally { noteSubmitting = false; updateNotesControls(); }
}
noteTitle.addEventListener('input', updateNotesControls);
noteFile.addEventListener('change', updateNotesControls);
postNote.addEventListener('click', submitNote);
function teammateSelects() { return [...teammates.querySelectorAll('select')]; }
function refreshTeammates() {
  const selects = teammateSelects(); selects.forEach(select => { if (select.value === roll.value) select.value = ''; });
  const selected = selects.map(select => select.value);
  selects.forEach((select, index) => {
    const value = selected[index]; select.replaceChildren(new Option('Select roll number', ''));
    (cfg?.rolls || []).filter(value => value !== roll.value && !selected.some((other, i) => i !== index && other === value)).forEach(value => select.add(new Option(value, value)));
    select.value = value; select.disabled = !roll.value;
  }); updateTeamForm();
}
function renderTeammates() {
  const previous = teammateSelects().map(select => select.value); teammates.replaceChildren();
  const count = ['3', '4'].includes(teamSize.value) ? Number(teamSize.value) - 1 : 0;
  for (let i = 0; i < count; i++) {
    const label = document.createElement('label'); label.htmlFor = 'teammate' + (i + 1); label.textContent = 'Teammate ' + (i + 1);
    const select = document.createElement('select'); select.id = label.htmlFor; select.required = true; select.add(new Option('Select roll number', ''));
    if (previous[i]) { select.add(new Option(previous[i], previous[i])); select.value = previous[i]; }
    select.addEventListener('change', refreshTeammates); teammates.append(label, select);
  } refreshTeammates();
}
teamSize.onchange = renderTeammates;
roll.addEventListener('change', refreshTeammates);
sub.addEventListener('change', refreshTeammates);
let cfg, uploading = false;
function message(text, kind = '') { statusBox.className = serviceLocked ? 'error' : kind; statusBox.textContent = serviceLocked ? 'Access temporarily unavailable. Please contact the app owner.' : text; }
function updateFile() {
  message('');
}
async function init() {
  if (!slug) { document.getElementById('className').textContent = 'Class link needed'; message('This link is missing its class code. Ask your admin for the correct link.', 'error'); return; }
  try {
    const response = await fetch(`/api/class/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    const data = await response.json();
    checkServiceAccess(data);
    if (!response.ok) throw new Error(data.error || 'Could not load this class. Please try again.');
    cfg = data;
    document.getElementById('className').textContent = data.name;
    data.rolls.forEach(value => roll.add(new Option(value, value)));
    Object.keys(data.structure).forEach(value => cat.add(new Option(value, value)));
    document.getElementById('preview').hidden = !data.preview;
    if (data.preview) {
      document.getElementById('preview').textContent='Local preview - Uploads disabled';
    }
    fields.disabled = serviceLocked;
    updateNotesControls();
  } catch (error) { document.getElementById('className').textContent = 'Class unavailable'; message(error.message, 'error'); }
}
cat.onchange = () => {
  sub.replaceChildren(new Option('Select subject', ''));
  sub.disabled = !cat.value;
  (cfg?.structure[cat.value] || []).forEach(value => sub.add(new Option(value, value)));
  const project = cat.value === 'Project';
  teamSection.hidden = !project; teamSize.disabled = !project; teamSize.required = project;
  teamSize.value = ''; teammates.replaceChildren();
  updateTeamForm();
};
fileInput.onchange = updateFile;
document.getElementById('submissionForm').onsubmit = event => {
  event.preventDefault();
  if (cat.value === 'Notes') return;
  if (uploading || serviceLocked || !cfg) return;
  const file = fileInput.files[0];
  if (!roll.value || !cat.value || !sub.value || !file) return message('Select your roll number, category, subject and a file.', 'error');
  if (!/\.(ppt|pptx)$/i.test(file.name)) return message('Only PPT and PPTX files are allowed.', 'error');
  if (file.size > 100 * 1024 * 1024) return message('Your presentation is larger than 100 MB. Please choose a smaller file.', 'error');
  let projectTeam;
  if (cat.value === 'Project') {
    const members = teammateSelects().map(select => select.value);
    if (!['3', '4'].includes(teamSize.value) || members.length !== Number(teamSize.value) - 1 || members.some(value => !cfg.rolls.includes(value)) || new Set([roll.value, ...members]).size !== Number(teamSize.value)) {
      return message('Select your team size and a different roll number for each teammate.', 'error');
    }
    projectTeam = { size: Number(teamSize.value), members };
  }
  if (cfg.preview) return message('Your selection is ready. This local preview does not upload files to Drive.', 'info');
  const data = new FormData();
  data.append('classSlug', slug); data.append('roll', roll.value); data.append('category', cat.value); data.append('subject', sub.value); data.append('file', file);
  if (projectTeam) data.append('projectTeam', JSON.stringify(projectTeam));
  const xhr = new XMLHttpRequest();
  uploading = true; fields.disabled = true; button.textContent = 'Uploading…'; progress.hidden = false; progress.value = 0;
  message('Uploading your presentation. Please keep this page open.', 'info');
  const finish = () => { uploading = false; fields.disabled = serviceLocked; button.textContent = 'Upload PPT'; progress.hidden = true; updateTeamForm(); };
  xhr.open('POST', `/api/upload?class=${encodeURIComponent(slug)}`);
  xhr.timeout = 10 * 60 * 1000;
  xhr.upload.onprogress = event => {
    if (event.lengthComputable) {
      const percent = Math.round(event.loaded / event.total * 100); progress.value = percent;
      message(percent === 100 ? 'File transferred. Waiting for upload confirmation…' : `Uploading your presentation… ${percent}%`, 'info');
    }
  };
  xhr.onload = () => {
    finish(); let data = {};
    try { data = JSON.parse(xhr.responseText); } catch {}
    checkServiceAccess(data);
    if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
      fileInput.value = ''; updateFile();
      message('PPT uploaded successfully.', 'success');
    } else message(data.error || 'Upload failed. Please try again.', 'error');
  };
  xhr.onerror = () => { finish(); message('Network error. Check your connection and try again.', 'error'); };
  xhr.ontimeout = () => { finish(); message('Upload confirmation timed out. Check with your admin whether the file arrived before retrying.', 'error'); };
  xhr.send(data);
};
init();

