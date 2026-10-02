// API checks enforce the lock; polling also clears controls on already-open pages.
(() => {
  const slug = new URLSearchParams(location.search).get('class') ||
    (location.pathname === '/dashboard.html' ? '0ByADJgBHSrnWtxN' : '');
  if (!slug) return;
  let locked = false, pending = false;
  window.addEventListener('service-locked', () => { locked = true; });
  async function check() {
    if (pending || document.hidden) return;
    pending = true;
    try {
      const response = await fetch(`/api/class/${encodeURIComponent(slug)}/access-status`, { cache: 'no-store' });
      const data = await response.json();
      if (data.code === 'SERVICE_LOCKED') {
        locked = true;
        window.dispatchEvent(new CustomEvent('service-locked', { detail: data.error }));
      } else if (response.ok && data.ok && locked) location.reload();
    } catch { /* A failed status check never unlocks the interface. */ }
    finally { pending = false; }
  }
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  setInterval(check, 15000);
  check();
})();
