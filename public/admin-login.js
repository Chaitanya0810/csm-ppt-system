const loginParams = new URLSearchParams(location.search);
const loginClass = loginParams.get('class');
if (loginClass) document.getElementById('back').href = `/student.html?class=${encodeURIComponent(loginClass)}`;
document.getElementById('adminLogin').onsubmit = async event => {
  event.preventDefault();
  const button = document.getElementById('unlock'), status = document.getElementById('status'), password = document.getElementById('password');
  button.disabled = true; status.textContent = '';
  try {
    const response = await fetch('/api/admin-unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: password.value }) });
    const data = await response.json();
    password.value = '';
    if (!response.ok) throw new Error(data.error || 'Could not verify password.');
    location.assign('/admin.html');
  } catch (error) { status.className = 'error'; status.textContent = error.message; password.focus(); }
  finally { button.disabled = false; }
};
