// Use the approved ivory palette by default; keep comparison variants available.
const requestedTheme = new URLSearchParams(location.search).get('theme') || 'ivory';
const previewTheme = ({ coral: 'graphite', burgundy: 'espresso' })[requestedTheme] || requestedTheme;
if (['graphite', 'cobalt', 'espresso', 'black', 'ivory', 'ice'].includes(previewTheme)) {
  document.documentElement.dataset.theme = previewTheme;
  document.addEventListener('DOMContentLoaded', () => {
    for (const id of ['studentLink', 'submissionsLink']) {
      const link = document.getElementById(id);
      if (!link) continue;
      const url = new URL(link.href);
      url.searchParams.set('theme', previewTheme);
      link.href = url.href;
    }
  });
}
