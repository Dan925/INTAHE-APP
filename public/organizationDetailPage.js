(function () {
  var container = document.getElementById('organization-container');
  var api = window.intaheSession.apiRequest;
  var t = window.intaheT;
  var orgId = location.pathname.split('/')[2];

  var coords = null;

  function showError(parent, message) {
    var p = document.createElement('p');
    p.className = 'error';
    p.textContent = message;
    parent.appendChild(p);
  }

  function statusBadge(status) {
    var span = document.createElement('span');
    var cls =
      status === 'published' ? 'badge' : status === 'cancelled' ? 'badge badge-destructive' : 'badge badge-neutral';
    span.className = cls;
    span.textContent = t('event_status.' + status) || status;
    return span;
  }

  function renderEventList(events) {
    var wrap = document.createElement('div');
    if (events.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'text-secondary';
      empty.style.textAlign = 'center';
      empty.style.marginTop = '32px';
      empty.textContent = t('organization_detail.empty');
      wrap.appendChild(empty);
      return wrap;
    }
    events.forEach(function (event) {
      var link = document.createElement('a');
      link.className = 'card card-link row';
      link.style.alignItems = 'center';
      link.href = '/organizations/' + orgId + '/events/' + encodeURIComponent(event.id);

      var info = document.createElement('div');
      var name = document.createElement('strong');
      name.textContent = event.name;
      info.appendChild(name);
      var date = document.createElement('p');
      date.className = 'small text-secondary';
      date.style.margin = '4px 0 0';
      date.textContent = new Date(event.start_at).toLocaleString(window.intaheLocaleTag());
      info.appendChild(date);
      link.appendChild(info);

      var badgeWrap = document.createElement('div');
      badgeWrap.style.flex = 'none';
      badgeWrap.appendChild(statusBadge(event.status));
      link.appendChild(badgeWrap);

      wrap.appendChild(link);
    });
    return wrap;
  }

  function load() {
    container.textContent = '';
    var loader = document.createElement('div');
    loader.className = 'loader';
    container.appendChild(loader);

    Promise.all([api('/v1/organizations/' + orgId), api('/v1/organizations/' + orgId + '/events')])
      .then(function (results) {
        document.title = results[0].organization.name + ' — Intahe';
        render(results[1].items);
      })
      .catch(function () {
        container.textContent = '';
        showError(container, t('organization_detail.load_error'));
      });
  }

  function render(events) {
    container.textContent = '';

    var navRow = document.createElement('div');
    navRow.className = 'row';
    navRow.style.marginBottom = '16px';

    var membersBtn = document.createElement('button');
    membersBtn.type = 'button';
    membersBtn.className = 'ghost';
    membersBtn.textContent = t('organization_detail.members_button');
    membersBtn.addEventListener('click', function () {
      location.href = '/organizations/' + orgId + '/members';
    });
    navRow.appendChild(membersBtn);

    var dashboardBtn = document.createElement('button');
    dashboardBtn.type = 'button';
    dashboardBtn.className = 'ghost';
    dashboardBtn.textContent = t('organization_detail.dashboard_button');
    dashboardBtn.addEventListener('click', function () {
      location.href = '/organizations/' + orgId + '/dashboard';
    });
    navRow.appendChild(dashboardBtn);

    container.appendChild(navRow);

    var createWrap = document.createElement('div');
    createWrap.style.marginBottom = '24px';
    var newEventBtn = document.createElement('button');
    newEventBtn.type = 'button';
    newEventBtn.textContent = t('organization_detail.new_event_button');

    var form = document.createElement('form');
    form.style.display = 'none';
    form.innerHTML =
      '<div class="field"><label for="event-name">' +
      t('organization_detail.event_name_label') +
      '</label><input id="event-name" type="text" required /></div>' +
      '<div class="field"><label for="event-start">' +
      t('organization_detail.start_label') +
      '</label><input id="event-start" type="datetime-local" required /></div>' +
      '<div class="field"><label for="event-end">' +
      t('organization_detail.end_label') +
      '</label><input id="event-end" type="datetime-local" required /></div>' +
      '<div class="field"><label for="event-address">' +
      t('organization_detail.address_label') +
      '</label><input id="event-address" type="text" /></div>' +
      '<button type="button" id="locate-btn" class="ghost" style="margin-bottom:16px;">' +
      t('organization_detail.use_current_location') +
      '</button>' +
      '<div class="switch-row">' +
      '<div class="switch-text"><strong>' +
      t('organization_detail.discoverable_title') +
      '</strong><p class="small text-secondary" style="margin:2px 0 0;">' +
      t('organization_detail.discoverable_subtitle') +
      '</p></div>' +
      '<input type="checkbox" id="event-discoverable" />' +
      '</div>' +
      '<div id="create-error"></div>' +
      '<div class="row">' +
      '<button type="button" class="ghost" id="cancel-create">' +
      t('organization_detail.cancel_button') +
      '</button>' +
      '<button type="submit" id="submit-create">' +
      t('organization_detail.create_button') +
      '</button>' +
      '</div>';

    newEventBtn.addEventListener('click', function () {
      newEventBtn.style.display = 'none';
      form.style.display = 'block';
    });
    createWrap.appendChild(newEventBtn);
    createWrap.appendChild(form);
    container.appendChild(createWrap);

    var nameInput = form.querySelector('#event-name');
    var startInput = form.querySelector('#event-start');
    var endInput = form.querySelector('#event-end');
    var addressInput = form.querySelector('#event-address');
    var discoverableInput = form.querySelector('#event-discoverable');
    var locateBtn = form.querySelector('#locate-btn');
    var createError = form.querySelector('#create-error');
    var submitBtn = form.querySelector('#submit-create');

    form.querySelector('#cancel-create').addEventListener('click', function () {
      form.style.display = 'none';
      newEventBtn.style.display = 'inline-block';
    });

    locateBtn.addEventListener('click', function () {
      if (!('geolocation' in navigator)) {
        showError(createError, t('organization_detail.geo_unavailable'));
        return;
      }
      locateBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        function (position) {
          coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          locateBtn.textContent = t('organization_detail.location_saved');
          locateBtn.disabled = false;
        },
        function () {
          locateBtn.disabled = false;
        },
        { timeout: 10000 },
      );
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      createError.textContent = '';
      submitBtn.disabled = true;

      var payload = {
        name: nameInput.value.trim(),
        start_at: new Date(startInput.value).toISOString(),
        end_at: new Date(endInput.value).toISOString(),
        is_public_discoverable: discoverableInput.checked,
      };
      if (addressInput.value.trim()) payload.address = addressInput.value.trim();
      if (coords) {
        payload.latitude = coords.latitude;
        payload.longitude = coords.longitude;
      }

      api('/v1/organizations/' + orgId + '/events', { method: 'POST', body: payload })
        .then(function () {
          coords = null;
          load();
        })
        .catch(function (err) {
          showError(createError, (err && err.message) || t('organization_detail.create_event_error'));
          submitBtn.disabled = false;
        });
    });

    container.appendChild(renderEventList(events));
  }

  load();
})();
