(function () {
  var pathname = String(window.location.pathname || '').replace(/\/+$/, '') || '/';
  var isSettingsPage = pathname === '/settings' || pathname === '/html/settings' || pathname === '/settings.html' || pathname === '/html/settings.html';
  if (!isSettingsPage) return;

  var params = new URLSearchParams(window.location.search || '');
  if (params.get('view') === 'desktop' || params.get('mobile') === '0') return;

  try {
    if (localStorage.getItem('lb_desktop_view') === 'true') return;
  } catch (_) {}

  var isMobileViewport = false;
  try {
    isMobileViewport = window.matchMedia('(max-width: 900px)').matches;
  } catch (_) {
    isMobileViewport = window.innerWidth <= 900;
  }

  if (!isMobileViewport) return;

  var nextUrl = '/settings-mobile' + (window.location.search || '') + (window.location.hash || '');
  window.location.replace(nextUrl);
})();
