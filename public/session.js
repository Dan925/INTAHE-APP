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

  // Shared fetch wrapper for every organizer page: attaches the bearer
  // token, parses the JSON body either way, and throws { code, message }
  // (matching the shape the mobile app's ApiError carries) on a non-2xx
  // response so callers can branch on err.code like they already do
  // elsewhere in this codebase. A 401 means the token is no longer valid
  // (expired, or the account was deleted) — clear it and bounce to
  // /login rather than leaving the page stuck on a confusing error.
  function apiRequest(path, options) {
    options = options || {};
    var session = get();
    var headers = { 'Content-Type': 'application/json' };
    if (session) headers['Authorization'] = 'Bearer ' + session.token;
    if (options.headers) {
      for (var key in options.headers) headers[key] = options.headers[key];
    }
    return fetch(path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    }).then(function (res) {
      if (res.status === 401) {
        clear();
        location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
        // Never resolves — the redirect above is already underway, and
        // nothing downstream should run against a session that's gone.
        return new Promise(function () {});
      }
      if (res.status === 204) return null;
      return res.text().then(function (text) {
        var body = text ? JSON.parse(text) : null;
        if (!res.ok) {
          var err = new Error((body && body.error && body.error.message) || 'Unknown error.');
          err.code = body && body.error && body.error.code;
          err.field = body && body.error && body.error.field;
          throw err;
        }
        return body;
      });
    });
  }

  window.intaheSession = { get: get, set: set, clear: clear, requireAuth: requireAuth, apiRequest: apiRequest };

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
