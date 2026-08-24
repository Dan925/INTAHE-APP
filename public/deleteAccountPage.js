(function () {
  var container = document.getElementById('delete-account-container');
  var api = window.intaheSession.apiRequest;
  var t = window.intaheT;
  var session = window.intaheSession.get();
  if (!session) return; // session.js already redirected to /login in this case.

  var needsPassword = !!session.user.has_password;

  container.textContent = '';

  var title = document.createElement('h1');
  title.textContent = t('delete_account.title');
  container.appendChild(title);

  var warning = document.createElement('p');
  warning.className = 'text-secondary small';
  warning.textContent = t('delete_account.warning');
  container.appendChild(warning);

  var form = document.createElement('form');
  var passwordFieldHtml = needsPassword
    ? '<div class="field"><label for="password">' +
      t('delete_account.password_label') +
      '</label><input id="password" type="password" autocomplete="current-password" /></div>'
    : '';
  form.innerHTML =
    passwordFieldHtml +
    '<div id="error"></div>' +
    '<button type="submit" id="submit-btn" class="destructive">' +
    t('delete_account.confirm_button') +
    '</button>';
  container.appendChild(form);

  var passwordInput = form.querySelector('#password');
  var errorEl = form.querySelector('#error');
  var submitBtn = form.querySelector('#submit-btn');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    errorEl.textContent = '';

    if (needsPassword && !passwordInput.value) {
      var p = document.createElement('p');
      p.className = 'error';
      p.textContent = t('delete_account.password_required');
      errorEl.appendChild(p);
      return;
    }

    if (!confirm(t('delete_account.confirm_dialog_message'))) return;

    submitBtn.disabled = true;
    var body = needsPassword ? { password: passwordInput.value } : {};

    api('/v1/me', { method: 'DELETE', body: body })
      .then(function () {
        window.intaheSession.clear();
        location.href = '/login';
      })
      .catch(function (err) {
        var message =
          err && err.code === 'invalid_password'
            ? t('delete_account.invalid_password')
            : err && err.code === 'owns_organizations'
              ? t('delete_account.owns_organizations')
              : t('delete_account.error_generic');
        var errP = document.createElement('p');
        errP.className = 'error';
        errP.textContent = message;
        errorEl.textContent = '';
        errorEl.appendChild(errP);
        submitBtn.disabled = false;
      });
  });
})();
