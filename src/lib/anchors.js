// Sections below the fold use content-visibility, so their height is an estimate until drawn.
// Before an in-page jump, draw everything once so the browser scrolls to the right place.
function renderAll() {
  document.documentElement.classList.add('render-all');
}

function jump(id, smooth) {
  const el = id && document.getElementById(id);
  if (!el) return false;
  renderAll();
  el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  return true;
}

export function installAnchorFix() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href*="#"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
    const url = new URL(a.href, location.href);
    if (url.pathname !== location.pathname || !url.hash) return;
    if (jump(decodeURIComponent(url.hash.slice(1)), true)) {
      e.preventDefault();
      history.pushState(null, '', url.hash);
    }
  });
  // Arriving with a hash, e.g. /#pricing from another page.
  if (location.hash) requestAnimationFrame(() => jump(decodeURIComponent(location.hash.slice(1)), false));
}
