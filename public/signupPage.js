(function () {
  var container = document.getElementById('signup-container');

  if (window.intaheSession.get()) {
    location.href = '/organizations';
    return;
  }

  container.textContent = '';

  var title = document.createElement('h1');
  title.textContent = window.intaheT('signup.title');
  container.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.className = 'text-secondary';
  subtitle.textContent = window.intaheT('signup.subtitle');
  container.appendChild(subtitle);

  var form = document.createElement('form');
  form.innerHTML =
    '<div class="field"><label for="full_name">' +
    window.intaheT('signup.full_name') +
    '</label><input id="full_name" type="text" autocomplete="name" required /></div>' +
    '<div class="field"><label for="email">' +
    window.intaheT('signup.email') +
    '</label><input id="email" type="email" autocomplete="email" required /></div>' +
    '<div class="field"><label for="password">' +
    window.intaheT('signup.password') +
    '</label><input id="password" type="password" autocomplete="new-password" minlength="8" required /></div>' +
    '<div id="error"></div>' +
    '<button type="submit" id="submit-btn">' +
    window.intaheT('signup.submit') +
    '</button>';
  container.appendChild(form);

  var linksWrap = document.createElement('p');
  var loginLink = document.createElement('a');
  loginLink.href = '/login';
  loginLink.textContent = window.intaheT('signup.already_account');
  linksWrap.appendChild(loginLink);
  container.appendChild(linksWrap);

  var fullNameInput = form.querySelector('#full_name');
  var emailInput = form.querySelector('#email');
  var passwordInput = form.querySelector('#password');
  var errorEl = form.querySelector('#error');
  var submitBtn = form.querySelector('#submit-btn');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = window.intaheT('signup.submit_wait');

    fetch('/v1/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailInput.value.trim().toLowerCase(),
        password: passwordInput.value,
        full_name: fullNameInput.value.trim(),
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
        location.href = '/organizations';
      })
      .catch(function (err) {
        var p = document.createElement('p');
        p.className = 'error';
        p.textContent =
          err && err.code === 'email_already_registered'
            ? window.intaheT('signup.email_taken')
            : window.intaheT('signup.error_generic');
        errorEl.textContent = '';
        errorEl.appendChild(p);
        submitBtn.disabled = false;
        submitBtn.textContent = window.intaheT('signup.submit');
      });
  });
})();
