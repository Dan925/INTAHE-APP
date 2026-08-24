(function () {
  var container = document.getElementById('members-container');
  var api = window.intaheSession.apiRequest;
  var t = window.intaheT;
  var orgId = location.pathname.split('/')[2];

  var ROLE_LABELS = {
    owner: t('roles.owner'),
    admin: t('roles.admin'),
    staff: t('roles.staff'),
    volunteer: t('roles.volunteer'),
  };
  var NEXT_ROLE = { admin: 'staff', staff: 'volunteer', volunteer: 'admin' };
  var INVITE_ERROR_MESSAGES = {
    invitee_not_found: t('org_members.invite_error_not_found'),
    already_a_member: t('org_members.invite_error_already_member'),
    invite_already_pending: t('org_members.invite_error_already_pending'),
  };

  function showError(parent, message) {
    var p = document.createElement('p');
    p.className = 'error';
    p.textContent = message;
    parent.appendChild(p);
  }

  function renderMemberList(members) {
    var wrap = document.createElement('div');
    if (members.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'text-secondary';
      empty.style.textAlign = 'center';
      empty.style.marginTop = '32px';
      empty.textContent = t('org_members.empty');
      wrap.appendChild(empty);
      return wrap;
    }
    members.forEach(function (member) {
      var card = document.createElement('div');
      card.className = 'card row';
      card.style.alignItems = 'center';

      var info = document.createElement('div');
      var name = document.createElement('strong');
      name.textContent = member.full_name;
      info.appendChild(name);
      var detail = document.createElement('p');
      detail.className = 'small text-secondary';
      detail.style.margin = '4px 0 0';
      detail.textContent =
        member.email +
        ' · ' +
        (ROLE_LABELS[member.role] || member.role) +
        (member.accepted_at ? '' : t('org_members.pending_invite_suffix'));
      info.appendChild(detail);
      card.appendChild(info);

      if (member.role !== 'owner') {
        var actions = document.createElement('div');
        actions.style.flex = 'none';
        actions.style.display = 'flex';
        actions.style.gap = '4px';

        var roleBtn = document.createElement('button');
        roleBtn.type = 'button';
        roleBtn.className = 'ghost small-btn';
        roleBtn.textContent = t('org_members.change_role_button');
        roleBtn.addEventListener('click', function () {
          roleBtn.disabled = true;
          api('/v1/organizations/' + orgId + '/members/' + member.id, {
            method: 'PATCH',
            body: { role: NEXT_ROLE[member.role] },
          })
            .then(load)
            .catch(function () {
              roleBtn.disabled = false;
            });
        });
        actions.appendChild(roleBtn);

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'destructive small-btn';
        removeBtn.textContent = t('org_members.remove_button');
        removeBtn.addEventListener('click', function () {
          removeBtn.disabled = true;
          api('/v1/organizations/' + orgId + '/members/' + member.id, { method: 'DELETE' })
            .then(load)
            .catch(function () {
              removeBtn.disabled = false;
            });
        });
        actions.appendChild(removeBtn);

        card.appendChild(actions);
      }

      wrap.appendChild(card);
    });
    return wrap;
  }

  function load() {
    container.textContent = '';
    var loader = document.createElement('div');
    loader.className = 'loader';
    container.appendChild(loader);

    api('/v1/organizations/' + orgId + '/members')
      .then(function (page) {
        render(page.items);
      })
      .catch(function () {
        container.textContent = '';
        showError(container, t('org_members.load_error'));
      });
  }

  function render(members) {
    container.textContent = '';

    var title = document.createElement('h1');
    title.textContent = t('org_members.invite_title');
    container.appendChild(title);

    var form = document.createElement('form');
    form.style.marginBottom = '24px';
    form.innerHTML =
      '<div class="field"><label for="invite-email">' +
      t('org_members.email_label') +
      '</label><input id="invite-email" type="email" autocapitalize="none" required /></div>' +
      '<div class="row" id="role-row" style="margin-bottom: 16px;"></div>' +
      '<div id="invite-error"></div>' +
      '<button type="submit" id="invite-submit">' +
      t('org_members.invite_button') +
      '</button>';
    container.appendChild(form);

    var emailInput = form.querySelector('#invite-email');
    var roleRow = form.querySelector('#role-row');
    var inviteError = form.querySelector('#invite-error');
    var submitBtn = form.querySelector('#invite-submit');
    var selectedRole = 'volunteer';

    ['admin', 'staff', 'volunteer'].forEach(function (role) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = role === selectedRole ? '' : 'ghost';
      btn.textContent = ROLE_LABELS[role];
      btn.addEventListener('click', function () {
        selectedRole = role;
        Array.prototype.forEach.call(roleRow.children, function (child, i) {
          child.className = ['admin', 'staff', 'volunteer'][i] === role ? '' : 'ghost';
        });
      });
      roleRow.appendChild(btn);
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      inviteError.textContent = '';
      submitBtn.disabled = true;
      api('/v1/organizations/' + orgId + '/members/invite', {
        method: 'POST',
        body: { email: emailInput.value.trim().toLowerCase(), role: selectedRole },
      })
        .then(function () {
          emailInput.value = '';
          load();
        })
        .catch(function (err) {
          var message = (err && err.code && INVITE_ERROR_MESSAGES[err.code]) || t('org_members.invite_error_generic');
          showError(inviteError, message);
          submitBtn.disabled = false;
        });
    });

    container.appendChild(renderMemberList(members));
  }

  load();
})();
