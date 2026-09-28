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

  // Shared by the create-event form below — a collapsible "Generate with
  // AI" panel next to a description textarea. getEventName is a function
  // (not a value) because the name field is still being typed when this
  // is built; reading it lazily at generate-time gets whatever the
  // organizer has typed by then. textarea.dataset.aiGenerated tracks
  // whether the current text came straight from a generation (cleared the
  // moment the organizer types into the textarea themselves) — read by
  // the caller at submit time to set description_ai_generated.
  function buildAiDescriptionWidget(textarea, getEventName) {
    var wrap = document.createElement('div');
    wrap.style.margin = '8px 0 16px';

    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'ghost small-btn';
    toggleBtn.textContent = t('ai_description.toggle_button');
    wrap.appendChild(toggleBtn);

    var panel = document.createElement('div');
    panel.className = 'card';
    panel.style.display = 'none';
    panel.style.marginTop = '8px';

    var toneSelect = document.createElement('select');
    ['professional', 'festive', 'casual', 'warm', 'concise'].forEach(function (key) {
      var opt = document.createElement('option');
      opt.value = t('ai_description.tone_' + key);
      opt.textContent = t('ai_description.tone_' + key);
      toneSelect.appendChild(opt);
    });
    panel.appendChild(toneSelect);

    var instructionsInput = document.createElement('input');
    instructionsInput.type = 'text';
    instructionsInput.placeholder = t('ai_description.instructions_placeholder');
    instructionsInput.style.display = 'block';
    instructionsInput.style.marginTop = '8px';
    panel.appendChild(instructionsInput);

    var genError = document.createElement('div');
    panel.appendChild(genError);

    var genBtn = document.createElement('button');
    genBtn.type = 'button';
    genBtn.textContent = t('ai_description.generate_button');
    genBtn.style.marginTop = '8px';
    panel.appendChild(genBtn);

    wrap.appendChild(panel);

    toggleBtn.addEventListener('click', function () {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    genBtn.addEventListener('click', function () {
      genError.textContent = '';
      var eventName = getEventName();
      if (!eventName) {
        showError(genError, t('ai_description.name_required_error'));
        return;
      }

      genBtn.disabled = true;
      genBtn.textContent = t('ai_description.generate_button_wait');

      var body = {
        event_name: eventName,
        tone: toneSelect.value,
        locale: (window.intaheLocaleTag() || 'fr').slice(0, 2),
      };
      if (textarea.value.trim()) body.current_description = textarea.value.trim();
      if (instructionsInput.value.trim()) body.custom_instructions = instructionsInput.value.trim();

      api('/v1/organizations/' + orgId + '/events/ai-description', { method: 'POST', body: body })
        .then(function (result) {
          textarea.value = result.description;
          textarea.dataset.aiGenerated = 'true';
          genBtn.disabled = false;
          genBtn.textContent = t('ai_description.generate_button');
        })
        .catch(function (err) {
          var message =
            err && err.code === 'ai_not_configured'
              ? t('ai_description.not_configured_error')
              : (err && err.message) || t('ai_description.generate_error');
          showError(genError, message);
          genBtn.disabled = false;
          genBtn.textContent = t('ai_description.generate_button');
        });
    });

    textarea.addEventListener('input', function () {
      textarea.dataset.aiGenerated = 'false';
    });

    return wrap;
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

  // Blocking rule lives in ticketTypeService.assertOrganizationCanSellPaidTickets
  // (paid ticket types require a connected, charges-enabled account) — this
  // section is just visibility into that same status, plus the action to
  // fix it. A fully free event never needs any of this.
  function renderStripeSection() {
    var wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.style.marginBottom = '24px';
    var heading = document.createElement('h2');
    heading.style.margin = '0 0 8px';
    heading.textContent = t('org_stripe.section_title');
    wrap.appendChild(heading);
    var body = document.createElement('div');
    wrap.appendChild(body);

    var loader = document.createElement('div');
    loader.className = 'loader';
    body.appendChild(loader);

    api('/v1/organizations/' + orgId + '/stripe/status')
      .then(function (status) {
        renderStripeStatus(body, status);
      })
      .catch(function () {
        body.textContent = '';
        showError(body, t('org_stripe.load_error'));
      });

    return wrap;
  }

  function renderStripeStatus(body, status) {
    body.textContent = '';

    if (!status.connected) {
      var intro = document.createElement('p');
      intro.className = 'small text-secondary';
      intro.textContent = t('org_stripe.intro');
      body.appendChild(intro);

      var notConnected = document.createElement('p');
      notConnected.className = 'small';
      notConnected.textContent = t('org_stripe.status_not_connected');
      body.appendChild(notConnected);

      var agreementNotice = document.createElement('p');
      agreementNotice.className = 'small text-secondary';
      agreementNotice.textContent = t('org_stripe.agreement_notice');
      body.appendChild(agreementNotice);

      var connectError = document.createElement('div');
      body.appendChild(connectError);

      var connectBtn = document.createElement('button');
      connectBtn.type = 'button';
      connectBtn.textContent = t('org_stripe.connect_button');
      connectBtn.addEventListener('click', function () {
        connectBtn.disabled = true;
        connectError.textContent = '';
        // Best-effort, non-blocking: this logs that the organizer was sent
        // to Stripe's own hosted onboarding (where Stripe collects its own
        // Connected Account Agreement acceptance directly) — a failure here
        // must not stop the actual Stripe connection from proceeding.
        api('/v1/legal/acceptances', { method: 'POST', body: { document_type: 'stripe_connected_account_agreement' } }).catch(
          function () {},
        );
        api('/v1/organizations/' + orgId + '/stripe/onboarding-link', { method: 'POST' })
          .then(function (result) {
            // The Stripe redirect back (return_url/refresh_url) lands on a
            // static, organization-agnostic path — this is how that page
            // knows which organization to send the owner back to.
            try {
              sessionStorage.setItem('intahe.stripeConnectOrgId', orgId);
            } catch (e) {
              // sessionStorage unavailable (private browsing) — the return
              // page falls back to the organizations list in that case.
            }
            location.href = result.url;
          })
          .catch(function (err) {
            showError(connectError, (err && err.message) || t('org_stripe.connect_error'));
            connectBtn.disabled = false;
          });
      });
      body.appendChild(connectBtn);
      return;
    }

    if (!status.charges_enabled) {
      var pendingTitle = document.createElement('p');
      pendingTitle.style.fontWeight = '700';
      pendingTitle.style.margin = '0 0 4px';
      pendingTitle.textContent = t('org_stripe.status_pending_title');
      body.appendChild(pendingTitle);

      var pendingBody = document.createElement('p');
      pendingBody.className = 'small text-secondary';
      pendingBody.textContent = t('org_stripe.status_pending_body');
      body.appendChild(pendingBody);

      var refreshBtn = document.createElement('button');
      refreshBtn.type = 'button';
      refreshBtn.className = 'ghost';
      refreshBtn.textContent = t('org_stripe.refresh_button');
      refreshBtn.addEventListener('click', function () {
        refreshBtn.disabled = true;
        body.textContent = '';
        var loader = document.createElement('div');
        loader.className = 'loader';
        body.appendChild(loader);
        api('/v1/organizations/' + orgId + '/stripe/status')
          .then(function (fresh) {
            renderStripeStatus(body, fresh);
          })
          .catch(function () {
            body.textContent = '';
            showError(body, t('org_stripe.load_error'));
          });
      });
      body.appendChild(refreshBtn);
      return;
    }

    var active = document.createElement('p');
    active.className = 'small';
    active.textContent = t('org_stripe.status_active');
    body.appendChild(active);
  }

  // Ordinary array rows ([{ label, rate_percent }, ...]) rather than a
  // separate GST/QST-shaped structure — a fixed schema couldn't express
  // every province's actual combination (some have one HST line, some
  // have two separate GST+PST/QST lines), so this stays whatever the
  // organizer configures. Empty by default: see the migration comment on
  // organizations.tax_lines.
  function renderTaxSection(organization) {
    var wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.style.marginBottom = '24px';
    var heading = document.createElement('h2');
    heading.style.margin = '0 0 8px';
    heading.textContent = t('org_tax.section_title');
    wrap.appendChild(heading);

    var intro = document.createElement('p');
    intro.className = 'small text-secondary';
    intro.textContent = t('org_tax.intro');
    wrap.appendChild(intro);

    var rowsContainer = document.createElement('div');
    wrap.appendChild(rowsContainer);

    var errorContainer = document.createElement('div');
    wrap.appendChild(errorContainer);

    function addRow(line) {
      var row = document.createElement('div');
      row.className = 'row';
      row.style.alignItems = 'center';
      row.style.marginBottom = '8px';

      var labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.placeholder = t('org_tax.label_placeholder');
      labelInput.value = (line && line.label) || '';
      labelInput.style.flex = '2';

      var rateInput = document.createElement('input');
      rateInput.type = 'number';
      rateInput.step = 'any';
      rateInput.min = '0';
      rateInput.max = '100';
      rateInput.placeholder = t('org_tax.rate_placeholder');
      rateInput.value = line && typeof line.rate_percent === 'number' ? String(line.rate_percent) : '';
      rateInput.style.flex = '1';

      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'ghost';
      removeBtn.textContent = t('org_tax.remove_line');
      removeBtn.addEventListener('click', function () {
        row.remove();
      });

      row.appendChild(labelInput);
      row.appendChild(rateInput);
      row.appendChild(removeBtn);
      row._labelInput = labelInput;
      row._rateInput = rateInput;
      rowsContainer.appendChild(row);
    }

    (organization.tax_lines || []).forEach(addRow);

    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'ghost';
    addBtn.textContent = t('org_tax.add_line');
    addBtn.style.marginBottom = '16px';
    addBtn.addEventListener('click', function () {
      addRow(null);
    });
    wrap.appendChild(addBtn);

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = t('org_tax.save_button');
    wrap.appendChild(saveBtn);

    saveBtn.addEventListener('click', function () {
      errorContainer.textContent = '';
      var rows = Array.prototype.slice.call(rowsContainer.children);
      var taxLines = [];
      for (var i = 0; i < rows.length; i++) {
        var labelValue = rows[i]._labelInput.value.trim();
        var rateValue = parseFloat(rows[i]._rateInput.value);
        if (!labelValue) {
          showError(errorContainer, t('org_tax.validation_label_required'));
          return;
        }
        if (!isFinite(rateValue) || rateValue < 0 || rateValue > 100) {
          showError(errorContainer, t('org_tax.validation_rate_invalid'));
          return;
        }
        taxLines.push({ label: labelValue, rate_percent: rateValue });
      }

      saveBtn.disabled = true;
      api('/v1/organizations/' + orgId, { method: 'PATCH', body: { tax_lines: taxLines } })
        .then(function () {
          saveBtn.disabled = false;
          var success = document.createElement('p');
          success.className = 'small';
          success.textContent = t('org_tax.save_success');
          errorContainer.appendChild(success);
        })
        .catch(function (err) {
          saveBtn.disabled = false;
          showError(errorContainer, (err && err.message) || t('org_tax.save_error'));
        });
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
        document.title = results[0].organization.name + ' — Intahé';
        render(results[1].items, results[0].organization);
      })
      .catch(function () {
        container.textContent = '';
        showError(container, t('organization_detail.load_error'));
      });
  }

  function render(events, organization) {
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

    var payoutsBtn = document.createElement('button');
    payoutsBtn.type = 'button';
    payoutsBtn.className = 'ghost';
    payoutsBtn.textContent = t('organization_detail.payouts_button');
    payoutsBtn.addEventListener('click', function () {
      location.href = '/organizations/' + orgId + '/payouts';
    });
    navRow.appendChild(payoutsBtn);

    var quickSaleBtn = document.createElement('button');
    quickSaleBtn.type = 'button';
    quickSaleBtn.className = 'ghost';
    quickSaleBtn.textContent = t('organization_detail.quick_sale_button');
    quickSaleBtn.addEventListener('click', function () {
      location.href = '/organizations/' + orgId + '/quick-sale';
    });
    navRow.appendChild(quickSaleBtn);

    container.appendChild(navRow);

    container.appendChild(renderStripeSection());
    container.appendChild(renderTaxSection(organization));

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
      '<div class="field"><label for="event-description">' +
      t('organization_detail.description_label') +
      '</label><textarea id="event-description" rows="5"></textarea></div>' +
      '<div id="event-description-ai"></div>' +
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
    var descriptionInput = form.querySelector('#event-description');
    form
      .querySelector('#event-description-ai')
      .appendChild(buildAiDescriptionWidget(descriptionInput, function () { return nameInput.value.trim(); }));
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
      if (descriptionInput.value.trim()) {
        payload.description = descriptionInput.value.trim();
        payload.description_ai_generated = descriptionInput.dataset.aiGenerated === 'true';
      }
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
