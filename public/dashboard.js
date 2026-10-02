const categorySelect = document.getElementById('category');
const subjectSelect = document.getElementById('subject');
const refreshButton = document.getElementById('refresh');
const refreshLabel = document.getElementById('refreshLabel');
const info = document.getElementById('info');
const content = document.getElementById('content');
const classSlug = new URLSearchParams(location.search).get('class') || '0ByADJgBHSrnWtxN';
document.getElementById('studentLink').href = `/student.html?class=${encodeURIComponent(classSlug)}`;
document.getElementById('adminLink').href = `/admin-login.html?class=${encodeURIComponent(classSlug)}`;
let structure = {}, configured = false, requestId = 0, activeRequest, serviceLocked = false;
function showState(text, className = 'empty') {
  const state = document.createElement('div');
  state.className = className;
  state.textContent = text;
  content.replaceChildren(state);
}
window.addEventListener('service-locked', event => {
  serviceLocked = true; cancelRequest();
  categorySelect.disabled = true; subjectSelect.disabled = true; refreshButton.disabled = true;
  showState(event.detail || 'Access temporarily unavailable. Please contact the app owner.', 'error');
  info.textContent = 'Access unavailable';
});
function busy(value) {
  content.setAttribute('aria-busy', String(value));
  refreshButton.disabled = value || (configured && (!categorySelect.value || !subjectSelect.value));
  refreshButton.classList.toggle('loading', value);
  refreshLabel.textContent = value ? 'Refreshing…' : 'Refresh';
}
async function getData(url, signal) {
  const response = await fetch(url, { cache: 'no-store', signal });
  const data = await response.json();
  if (data.code === 'SERVICE_LOCKED') window.dispatchEvent(new CustomEvent('service-locked', { detail: data.error }));
  if (!response.ok || !data.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
async function loadConfig() {
  busy(true);
  try {
    const data = await getData(`/api/config?class=${encodeURIComponent(classSlug)}`);
    if (serviceLocked) return;
    structure = data.structure || {};
    categorySelect.replaceChildren(new Option('Select category', ''));
    Object.keys(structure).forEach(value => categorySelect.add(new Option(value, value)));
    categorySelect.disabled = false;
    configured = true;
    document.getElementById('className').textContent = data.className || 'CSM presentations';
    document.getElementById('preview').hidden = !data.preview;
    showState('Select a category and subject to view PPTs.');
    info.textContent = 'Select a category and subject.';
  } catch (error) {
    showState(error.message, 'error');
    info.textContent = 'Could not load the dashboard. Use Refresh to retry.';
  } finally { if (!serviceLocked) busy(false); }
}
function cancelRequest() { requestId++; activeRequest?.abort(); }
categorySelect.addEventListener('change', () => {
  cancelRequest();
  subjectSelect.replaceChildren(new Option('Select subject', ''));
  (structure[categorySelect.value] || []).forEach(value => subjectSelect.add(new Option(value, value)));
  subjectSelect.disabled = !categorySelect.value;
  info.textContent = categorySelect.value ? 'Select a subject.' : 'Select a category and subject.';
  showState(info.textContent);
  busy(false);
});
subjectSelect.addEventListener('change', loadPPTs);
refreshButton.addEventListener('click', () => configured ? loadPPTs() : loadConfig());
async function loadPPTs() {
  cancelRequest();
  const currentId = requestId;
  const category = categorySelect.value, subject = subjectSelect.value;
  if (!category || !subject) {
    showState('Select a category and subject to view PPTs.');
    info.textContent = 'Select a category and subject.';
    busy(false);
    return;
  }
  activeRequest = new AbortController();
  busy(true);
  info.textContent = `${subject} · ${category}`;
  showState('Loading presentations…', 'loading-state');
  try {
    const data = await getData(`/api/ppts?class=${encodeURIComponent(classSlug)}&category=${encodeURIComponent(category)}&subject=${encodeURIComponent(subject)}`, activeRequest.signal);
    if (serviceLocked) return;
    if (currentId !== requestId) return;
    info.textContent = `${subject} · ${category} · ${data.count}/${data.totalStudents} submitted`;
    if (!data.submissions?.length) { showState('No PPTs submitted yet.'); return; }
    const grid = document.createElement('div'); grid.className = 'grid';
    data.submissions.forEach(item => {
      const card = document.createElement('article'); card.className = 'card';
      const top = document.createElement('div'); top.className = 'card-top';
      const icon = document.createElement('span'); icon.className = 'file-icon'; icon.textContent = 'PPT'; icon.setAttribute('aria-hidden', 'true');
      const roll = document.createElement('div'); roll.className = 'roll'; roll.textContent = item.roll || 'Presentation';
      top.append(icon, roll);
      const filename = document.createElement('div'); filename.className = 'filename'; filename.textContent = item.fileName;
      card.append(top, filename);
      const url = item.presentationUrl || item.driveUrl || '';
      if (/^https?:\/\//i.test(url)) {
        const link = document.createElement('a'); link.className = 'open'; link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = 'Open presentation';
        const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true'); link.append(arrow); card.append(link);
      } else {
        const note = document.createElement('p'); note.className = 'unavailable'; note.textContent = data.preview ? 'Sample presentation' : 'Presentation link unavailable.'; card.append(note);
      }
      grid.append(card);
    });
    content.replaceChildren(grid);
  } catch (error) {
    if (currentId !== requestId || error.name === 'AbortError') return;
    showState(error.message, 'error');
    info.textContent = 'Could not load presentations. Use Refresh to retry.';
  } finally { if (currentId === requestId && !serviceLocked) busy(false); }
}
loadConfig();
