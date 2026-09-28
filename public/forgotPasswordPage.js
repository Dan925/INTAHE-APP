(function () {
  var container = document.getElementById('forgot-password-container');

  if (window.intaheSession.get()) {
    location.href = '/organizations';
    return;
  }

  container.textContent = '';

  var title = document.createElement('h1');
  title.textContent = window.intaheT('forgot_password.title');
  container.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.className = 'text-secondary';
  subtitle.textContent = window.intaheT('forgot_password.subtitle');
  container.appendChild(subtitle);

  var form = document.createElement('form');
  form.innerHTML =
    '<div class="field"><label for="email">' +
    window.intaheT('forgot_password.email') +
    '</label><input id="email" type="email" autocomplete="email" required /></div>' +
    '<div id="error"></div>' +
    '<button type="submit" id="submit-btn">' +
    window.intaheT('forgot_password.submit') +
    '</button>';
  container.appendChild(form);

  var successEl = document.createElement('div');
  container.appendChild(successEl);

  var linksWrap = document.createElement('p');
  var loginLink = document.createElement('a');
  loginLink.href = '/login';
  loginLink.textContent = window.intaheT('forgot_password.back_to_login');
  linksWrap.appendChild(loginLink);
  container.appendChild(linksWrap);

  var emailInput = form.querySelector('#email');
  var errorEl = form.querySelector('#error');
  var submitBtn = form.querySelector('#submit-btn');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    errorEl.textContent = '';
    successEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = window.intaheT('forgot_password.submit_wait');

    fetch('/v1/auth/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput.value.trim().toLowerCase() }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw { code: body.error && body.error.code, message: body.error && body.error.message };
          return body;
        });
      })
      .then(function () {
        // Deliberately the same success message regardless of whether the
        // account exists — the backend already behaves this way (see
        // authService.requestPasswordReset) so this can't be used to
        // enumerate registered emails; showing a different message here
        // would defeat that.
        form.style.display = 'none';
        var p = document.createElement('p');
        p.textContent = window.intaheT('forgot_password.sent_message');
        successEl.appendChild(p);
      })
      .catch(function () {
        var p = document.createElement('p');
        p.className = 'error';
        p.textContent = window.intaheT('forgot_password.error_generic');
        errorEl.appendChild(p);
        submitBtn.disabled = false;
        submitBtn.textContent = window.intaheT('forgot_password.submit');
      });
  });
})();
