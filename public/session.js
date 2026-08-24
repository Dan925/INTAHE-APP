(function () {
  var STORAGE_KEY = 'intahe.session';

  function get() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function set(session) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      // Storage can be unavailable (private browsing, disabled cookies) —
      // the session just won't persist across reloads, nothing to recover.
    }
  }

  function clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // See set() above.
    }
  }

  // Redirects to /login (preserving where the user was headed) when no
  // session is stored.
  function requireAuth() {
    var session = get();
    if (!session) {
      location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
      return null;
    }
    return session;
  }

  window.intaheSession = { get: get, set: set, clear: clear, requireAuth: requireAuth };

  // session.js is also loaded on /login and /signup (they need
  // window.intaheSession to store the session once auth succeeds), which
  // must never redirect an anonymous visitor away from themselves — so
  // the auto-guard below only fires on pages layout.ts actually marked
  // requireAuth: true (flagged via this body attribute), not merely
  // because session.js happens to be present. layout.ts always lists
  // session.js before the page's own script and both are `defer`red,
  // which preserves document order, so on a guarded page this redirect
  // happens before the page script's fetches would otherwise fire with
  // no token.
  if (document.body.getAttribute('data-require-auth') === 'true') {
    requireAuth();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        clear();
        location.href = '/login';
      });
    }
  });
})();
