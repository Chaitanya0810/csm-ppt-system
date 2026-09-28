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
let cfg, uploading = false;
function message(text, kind = '') { statusBox.className = kind; statusBox.textContent = text; }
function updateFile() {
  message('');
}
async function init() {
  if (!slug) { document.getElementById('className').textContent = 'Class link needed'; message('This link is missing its class code. Ask your admin for the correct link.', 'error'); return; }
  try {
    const response = await fetch(`/api/class/${encodeURIComponent(slug)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load this class. Please try again.');
    cfg = data;
    document.getElementById('className').textContent = data.name;
    data.rolls.forEach(value => roll.add(new Option(value, value)));
    Object.keys(data.structure).forEach(value => cat.add(new Option(value, value)));
    document.getElementById('preview').hidden = !data.preview;
    fields.disabled = false;
  } catch (error) { document.getElementById('className').textContent = 'Class unavailable'; message(error.message, 'error'); }
}
cat.onchange = () => {
  sub.replaceChildren(new Option('Select subject', ''));
  sub.disabled = !cat.value;
  (cfg?.structure[cat.value] || []).forEach(value => sub.add(new Option(value, value)));
};
fileInput.onchange = updateFile;
document.getElementById('submissionForm').onsubmit = event => {
  event.preventDefault();
  if (uploading || !cfg) return;
  const file = fileInput.files[0];
  if (!roll.value || !cat.value || !sub.value || !file) return message('Select your roll number, category, subject and a file.', 'error');
  if (!/\.(ppt|pptx)$/i.test(file.name)) return message('Only PPT and PPTX files are allowed.', 'error');
  if (file.size > 100 * 1024 * 1024) return message('Your presentation is larger than 100 MB. Please choose a smaller file.', 'error');
  if (cfg.preview) return message('Your selection is ready. This local preview does not upload files to Drive.', 'info');
  const data = new FormData();
  data.append('classSlug', slug); data.append('roll', roll.value); data.append('category', cat.value); data.append('subject', sub.value); data.append('file', file);
  const xhr = new XMLHttpRequest();
  uploading = true; fields.disabled = true; button.textContent = 'Uploading…'; progress.hidden = false; progress.value = 0;
  message('Uploading your presentation. Please keep this page open.', 'info');
  const finish = () => { uploading = false; fields.disabled = false; button.textContent = 'Upload PPT'; progress.hidden = true; };
  xhr.open('POST', '/api/upload');
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
