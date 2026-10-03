const params = new URLSearchParams(location.search);
const slug = params.get('class');
document.getElementById('submissionsLink').href = `/dashboard.html?class=${encodeURIComponent(slug || '0ByADJgBHSrnWtxN')}`;
document.getElementById('adminLink').href = `/admin.html?class=${encodeURIComponent(slug || '0ByADJgBHSrnWtxN')}`;
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
function teammateSelects() { return [...teammates.querySelectorAll('select')]; }
function refreshTeammates() {
  const selects = teammateSelects();
  // Changing the submitting student clears any teammate that now matches them.
  selects.forEach(select => { if (select.value === roll.value) select.value = ''; });
  const selected = selects.map(select => select.value);
  selects.forEach((select, index) => {
    const value = selected[index];
    select.replaceChildren(new Option('Select roll number', ''));
    (cfg?.rolls || []).filter(value => value !== roll.value && !selected.some((other, i) => i !== index && other === value))
      .forEach(value => select.add(new Option(value, value)));
    select.value = value;
    select.disabled = !roll.value;
  });
}
function renderTeammates() {
  const previous = teammateSelects().map(select => select.value);
  teammates.replaceChildren();
  const count = ['3', '4'].includes(teamSize.value) ? Number(teamSize.value) - 1 : 0;
  for (let i = 0; i < count; i++) {
    const label = document.createElement('label');
    label.htmlFor = `teammate${i + 1}`; label.textContent = `Teammate ${i + 1}`;
    const select = document.createElement('select');
    select.id = label.htmlFor; select.required = true;
    select.add(new Option('Select roll number', ''));
    if (previous[i]) { select.add(new Option(previous[i], previous[i])); select.value = previous[i]; }
    select.addEventListener('change', refreshTeammates);
    teammates.append(label, select);
  }
  refreshTeammates();
}
teamSize.onchange = renderTeammates;
roll.addEventListener('change', refreshTeammates);
let cfg, uploading = false, serviceLocked = false;
function message(text, kind = '') { statusBox.className = serviceLocked ? 'error' : kind; statusBox.textContent = serviceLocked ? 'Access temporarily unavailable. Please contact the app owner.' : text; }
window.addEventListener('service-locked', () => {
  serviceLocked = true; fields.disabled = true; button.disabled = true;
  document.getElementById('className').textContent = 'Access unavailable';
  message('Access temporarily unavailable. Please contact the app owner.', 'error');
});
function checkServiceAccess(data) { if (data.code === 'SERVICE_LOCKED') window.dispatchEvent(new CustomEvent('service-locked')); }
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
    if (serviceLocked) return;
    cfg = data;
    document.getElementById('className').textContent = data.name;
    data.rolls.forEach(value => roll.add(new Option(value, value)));
    Object.keys(data.structure).forEach(value => cat.add(new Option(value, value)));
    document.getElementById('preview').hidden = !data.preview;
    fields.disabled = serviceLocked;
  } catch (error) { document.getElementById('className').textContent = 'Class unavailable'; message(error.message, 'error'); }
}
cat.onchange = () => {
  sub.replaceChildren(new Option('Select subject', ''));
  sub.disabled = !cat.value;
  (cfg?.structure[cat.value] || []).forEach(value => sub.add(new Option(value, value)));
  const project = cat.value === 'Project';
  teamSection.hidden = !project; teamSize.disabled = !project; teamSize.required = project;
  teamSize.value = ''; teammates.replaceChildren();
};
fileInput.onchange = updateFile;
document.getElementById('submissionForm').onsubmit = event => {
  event.preventDefault();
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
  const finish = () => { uploading = false; fields.disabled = serviceLocked; button.textContent = 'Upload PPT'; progress.hidden = true; };
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
