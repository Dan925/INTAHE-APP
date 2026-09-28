(function () {
  var container = document.getElementById('reset-password-container');
  var token = new URLSearchParams(location.search).get('token');

  container.textContent = '';

  var title = document.createElement('h1');
  title.textContent = window.intaheT('reset_password.title');
  container.appendChild(title);

  // No token in the URL at all — nothing to submit against, so don't even
  // show the form (this is the state a mistyped/truncated link lands on,
  // not the "token exists but is expired/used" state, which the API tells
  // us about only once the form is actually submitted).
  if (!token) {
    var missing = document.createElement('p');
    missing.className = 'error';
    missing.textContent = window.intaheT('reset_password.missing_token_error');
    container.appendChild(missing);

    var requestLink = document.createElement('a');
    requestLink.href = '/forgot-password';
    requestLink.textContent = window.intaheT('reset_password.request_new_link');
    container.appendChild(requestLink);
    return;
  }

  var form = document.createElement('form');
  form.innerHTML =
    '<div class="field"><label for="new-password">' +
    window.intaheT('reset_password.new_password') +
    '</label><input id="new-password" type="password" autocomplete="new-password" minlength="8" required /></div>' +
    '<div class="field"><label for="confirm-password">' +
    window.intaheT('reset_password.confirm_password') +
    '</label><input id="confirm-password" type="password" autocomplete="new-password" minlength="8" required /></div>' +
    '<div id="error"></div>' +
    '<button type="submit" id="submit-btn">' +
    window.intaheT('reset_password.submit') +
    '</button>';
  container.appendChild(form);

  var successEl = document.createElement('div');
  container.appendChild(successEl);

  var newPasswordInput = form.querySelector('#new-password');
  var confirmPasswordInput = form.querySelector('#confirm-password');
  var errorEl = form.querySelector('#error');
  var submitBtn = form.querySelector('#submit-btn');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    errorEl.textContent = '';

    if (newPasswordInput.value !== confirmPasswordInput.value) {
      var mismatch = document.createElement('p');
      mismatch.className = 'error';
      mismatch.textContent = window.intaheT('reset_password.mismatch_error');
      errorEl.appendChild(mismatch);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = window.intaheT('reset_password.submit_wait');

    fetch('/v1/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, new_password: newPasswordInput.value }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw { code: body.error && body.error.code, message: body.error && body.error.message };
          return body;
        });
      })
      .then(function () {
        form.remove();
        var p = document.createElement('p');
        p.textContent = window.intaheT('reset_password.success_message');
        successEl.appendChild(p);
        var loginLink = document.createElement('a');
        loginLink.href = '/login';
        loginLink.textContent = window.intaheT('reset_password.login_link');
        successEl.appendChild(loginLink);
      })
      .catch(function (err) {
        var p = document.createElement('p');
        p.className = 'error';
        p.textContent =
          err && err.code === 'invalid_reset_token'
            ? window.intaheT('reset_password.invalid_token_error')
            : window.intaheT('reset_password.error_generic');
        errorEl.appendChild(p);
        submitBtn.disabled = false;
        submitBtn.textContent = window.intaheT('reset_password.submit');
      });
  });
})();
