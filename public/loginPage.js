(function () {
  var container = document.getElementById('login-container');

  var params = new URLSearchParams(location.search);
  var next = params.get('next') || '/organizations';

  // Already signed in? Skip straight past the login form.
  if (window.intaheSession.get()) {
    location.href = next;
    return;
  }

  container.textContent = '';

  var title = document.createElement('h1');
  title.textContent = window.intaheT('login.brand');
  container.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.className = 'text-secondary';
  subtitle.textContent = window.intaheT('login.subtitle');
  container.appendChild(subtitle);

  var form = document.createElement('form');
  form.innerHTML =
    '<div class="field"><label for="email">' +
    window.intaheT('login.email') +
    '</label><input id="email" type="email" autocomplete="email" required /></div>' +
    '<div class="field"><label for="password">' +
    window.intaheT('login.password') +
    '</label><input id="password" type="password" autocomplete="current-password" required /></div>' +
    '<div id="error"></div>' +
    '<button type="submit" id="submit-btn">' +
    window.intaheT('login.submit') +
    '</button>';
  container.appendChild(form);

  var linksWrap = document.createElement('p');
  var signupLink = document.createElement('a');
  signupLink.href = '/signup';
  signupLink.textContent = window.intaheT('login.no_account');
  linksWrap.appendChild(signupLink);
  container.appendChild(linksWrap);

  var discoverWrap = document.createElement('p');
  var discoverLink = document.createElement('a');
  discoverLink.href = '/discover';
  discoverLink.className = 'text-secondary small';
  discoverLink.textContent = window.intaheT('login.discover_link');
  discoverWrap.appendChild(discoverLink);
  container.appendChild(discoverWrap);

  var emailInput = form.querySelector('#email');
  var passwordInput = form.querySelector('#password');
  var errorEl = form.querySelector('#error');
  var submitBtn = form.querySelector('#submit-btn');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = window.intaheT('login.submit_wait');

    fetch('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailInput.value.trim().toLowerCase(),
        password: passwordInput.value,
      }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw { code: body.error && body.error.code, message: body.error && body.error.message };
          return body;
        });
      })
      .then(function (body) {
        window.intaheSession.set({ user: body.user, token: body.access_token });
        location.href = next;
      })
      .catch(function (err) {
        var p = document.createElement('p');
        p.className = 'error';
        p.textContent =
          err && err.code === 'invalid_credentials'
            ? window.intaheT('login.invalid_credentials')
            : window.intaheT('login.error_generic');
        errorEl.textContent = '';
        errorEl.appendChild(p);
        submitBtn.disabled = false;
        submitBtn.textContent = window.intaheT('login.submit');
      });
  });
})();
