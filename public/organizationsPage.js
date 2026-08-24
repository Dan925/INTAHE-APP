(function () {
  var container = document.getElementById('organizations-container');
  var api = window.intaheSession.apiRequest;
  var t = window.intaheT;

  var ROLE_LABELS = {
    owner: t('roles.owner'),
    admin: t('roles.admin'),
    staff: t('roles.staff'),
    volunteer: t('roles.volunteer'),
  };

  function showError(parent, message) {
    var p = document.createElement('p');
    p.className = 'error';
    p.textContent = message;
    parent.appendChild(p);
  }

  function renderInvites(invites, onAccepted) {
    if (invites.length === 0) return null;
    var wrap = document.createElement('div');
    wrap.style.marginBottom = '24px';

    var title = document.createElement('h2');
    title.textContent = t('organizations_list.pending_invites_title');
    wrap.appendChild(title);

    invites.forEach(function (invite) {
      var card = document.createElement('div');
      card.className = 'card row';
      card.style.alignItems = 'center';

      var info = document.createElement('div');
      var name = document.createElement('strong');
      name.textContent = invite.organization_name;
      info.appendChild(name);
      var role = document.createElement('p');
      role.className = 'small text-secondary';
      role.style.margin = '4px 0 0';
      role.textContent = ROLE_LABELS[invite.role] || invite.role;
      info.appendChild(role);
      card.appendChild(info);

      var acceptBtn = document.createElement('button');
      acceptBtn.type = 'button';
      acceptBtn.style.flex = 'none';
      acceptBtn.textContent = t('organizations_list.accept_button');
      acceptBtn.addEventListener('click', function () {
        acceptBtn.disabled = true;
        api('/v1/organizations/' + invite.organization_id + '/members/accept', { method: 'POST' })
          .then(onAccepted)
          .catch(function () {
            acceptBtn.disabled = false;
          });
      });
      card.appendChild(acceptBtn);

      wrap.appendChild(card);
    });

    return wrap;
  }

  function renderOrgList(organizations) {
    var wrap = document.createElement('div');
    if (organizations.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'text-secondary';
      empty.style.textAlign = 'center';
      empty.style.marginTop = '32px';
      empty.textContent = t('organizations_list.empty');
      wrap.appendChild(empty);
      return wrap;
    }
    organizations.forEach(function (org) {
      var link = document.createElement('a');
      link.className = 'card card-link';
      link.href = '/organizations/' + encodeURIComponent(org.id);
      var name = document.createElement('strong');
      name.textContent = org.name;
      link.appendChild(name);
      var slug = document.createElement('p');
      slug.className = 'small text-secondary';
      slug.style.margin = '4px 0 0';
      slug.textContent = org.slug;
      link.appendChild(slug);
      wrap.appendChild(link);
    });
    return wrap;
  }

  function load() {
    container.textContent = '';
    var loader = document.createElement('div');
    loader.className = 'loader';
    container.appendChild(loader);

    Promise.all([api('/v1/organizations'), api('/v1/me/invites')])
      .then(function (results) {
        var orgs = results[0].items;
        var invites = results[1].items;
        render(orgs, invites);
      })
      .catch(function () {
        container.textContent = '';
        showError(container, t('organizations_list.load_error'));
      });
  }

  function render(orgs, invites) {
    container.textContent = '';

    var discoverBtn = document.createElement('button');
    discoverBtn.type = 'button';
    discoverBtn.className = 'ghost';
    discoverBtn.style.marginBottom = '16px';
    discoverBtn.textContent = t('organizations_list.discover_button');
    discoverBtn.addEventListener('click', function () {
      location.href = '/discover';
    });
    container.appendChild(discoverBtn);

    var invitesBlock = renderInvites(invites, load);
    if (invitesBlock) container.appendChild(invitesBlock);

    var createWrap = document.createElement('div');
    createWrap.style.marginBottom = '24px';
    var newOrgBtn = document.createElement('button');
    newOrgBtn.type = 'button';
    newOrgBtn.textContent = t('organizations_list.new_org_button');
    var form = document.createElement('form');
    form.style.display = 'none';
    form.innerHTML =
      '<div class="field"><label for="org-name">' +
      t('organizations_list.org_name_label') +
      '</label><input id="org-name" type="text" required /></div>' +
      '<div id="create-error"></div>' +
      '<div class="row">' +
      '<button type="button" class="ghost" id="cancel-create">' +
      t('organizations_list.cancel_button') +
      '</button>' +
      '<button type="submit" id="submit-create">' +
      t('organizations_list.create_button') +
      '</button>' +
      '</div>';

    newOrgBtn.addEventListener('click', function () {
      newOrgBtn.style.display = 'none';
      form.style.display = 'block';
    });
    createWrap.appendChild(newOrgBtn);
    createWrap.appendChild(form);
    container.appendChild(createWrap);

    var nameInput = form.querySelector('#org-name');
    var createError = form.querySelector('#create-error');
    var submitBtn = form.querySelector('#submit-create');

    form.querySelector('#cancel-create').addEventListener('click', function () {
      form.style.display = 'none';
      newOrgBtn.style.display = 'inline-block';
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      createError.textContent = '';
      submitBtn.disabled = true;
      api('/v1/organizations', { method: 'POST', body: { name: nameInput.value.trim() } })
        .then(load)
        .catch(function () {
          showError(createError, t('organizations_list.create_error'));
          submitBtn.disabled = false;
        });
    });

    container.appendChild(renderOrgList(orgs));
  }

  load();
})();
