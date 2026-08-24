(function () {
  var container = document.getElementById('profile-container');
  var t = window.intaheT;
  var session = window.intaheSession.get();
  if (!session) return; // session.js already redirected to /login in this case.

  container.textContent = '';

  var card = document.createElement('div');
  card.className = 'card';
  card.style.marginBottom = '24px';
  var name = document.createElement('strong');
  name.textContent = session.user.full_name;
  card.appendChild(name);
  var email = document.createElement('p');
  email.className = 'small text-secondary';
  email.style.margin = '4px 0 0';
  email.textContent = session.user.email;
  card.appendChild(email);
  container.appendChild(card);

  var logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.className = 'destructive';
  logoutBtn.style.display = 'block';
  logoutBtn.style.marginBottom = '24px';
  logoutBtn.textContent = t('profile.logout');
  logoutBtn.addEventListener('click', function () {
    window.intaheSession.clear();
    location.href = '/login';
  });
  container.appendChild(logoutBtn);

  var deleteLink = document.createElement('a');
  deleteLink.href = '/profile/delete-account';
  deleteLink.className = 'text-secondary small';
  deleteLink.textContent = t('profile.delete_account_link');
  container.appendChild(deleteLink);
})();
