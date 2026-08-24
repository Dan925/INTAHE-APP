(function () {
  var container = document.getElementById('manage-event-container');
  var api = window.intaheSession.apiRequest;
  var t = window.intaheT;
  var pathParts = location.pathname.split('/'); // '', organizations, :orgId, events, :eventId
  var orgId = pathParts[2];
  var eventId = pathParts[4];

  var ticketTypes = [];
  var selectedTypeId = null;

  function formatPrice(cents, currency) {
    return new Intl.NumberFormat(window.intaheLocaleTag(), { style: 'currency', currency: currency.toUpperCase() }).format(
      cents / 100,
    );
  }

  function showError(parent, message) {
    var p = document.createElement('p');
    p.className = 'error';
    p.textContent = message;
    parent.appendChild(p);
  }

  function statusBadge(status) {
    var span = document.createElement('span');
    span.className =
      status === 'published' ? 'badge' : status === 'cancelled' ? 'badge badge-destructive' : 'badge badge-neutral';
    span.textContent = t('event_status.' + status) || status;
    return span;
  }

  function load() {
    container.textContent = '';
    var loader = document.createElement('div');
    loader.className = 'loader';
    container.appendChild(loader);

    Promise.all([
      api('/v1/organizations/' + orgId + '/events/' + eventId),
      api('/v1/organizations/' + orgId + '/events/' + eventId + '/ticket-types'),
    ])
      .then(function (results) {
        document.title = results[0].event.name + ' — Intahe';
        ticketTypes = results[1].items;
        render(results[0].event);
      })
      .catch(function () {
        container.textContent = '';
        showError(container, t('manage_event.load_error'));
      });
  }

  function render(event) {
    container.textContent = '';

    var headerRow = document.createElement('div');
    headerRow.className = 'row';
    headerRow.style.alignItems = 'flex-start';
    var title = document.createElement('h1');
    title.style.flex = '1';
    title.style.margin = '0';
    title.textContent = event.name;
    headerRow.appendChild(title);
    var badgeWrap = document.createElement('div');
    badgeWrap.style.flex = 'none';
    badgeWrap.appendChild(statusBadge(event.status));
    headerRow.appendChild(badgeWrap);
    container.appendChild(headerRow);

    var dates = document.createElement('p');
    dates.className = 'text-secondary small';
    dates.textContent = t('manage_event.date_range', {
      start: new Date(event.start_at).toLocaleString(window.intaheLocaleTag()),
      end: new Date(event.end_at).toLocaleString(window.intaheLocaleTag()),
    });
    container.appendChild(dates);

    if (event.description) {
      var description = document.createElement('p');
      description.textContent = event.description;
      container.appendChild(description);
    }

    var actionError = document.createElement('div');
    container.appendChild(actionError);

    if (event.status === 'draft' || event.status === 'published') {
      var actionsRow = document.createElement('div');
      actionsRow.className = 'row';
      actionsRow.style.marginTop = '16px';
      actionsRow.style.marginBottom = '24px';

      if (event.status === 'draft') {
        var publishBtn = document.createElement('button');
        publishBtn.type = 'button';
        publishBtn.textContent = t('manage_event.publish_button');
        publishBtn.addEventListener('click', function () {
          publishBtn.disabled = true;
          api('/v1/organizations/' + orgId + '/events/' + eventId + '/publish', { method: 'POST' })
            .then(load)
            .catch(function (err) {
              showError(actionError, (err && err.message) || t('manage_event.action_error'));
              publishBtn.disabled = false;
            });
        });
        actionsRow.appendChild(publishBtn);
      }

      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'destructive';
      cancelBtn.textContent = t('manage_event.cancel_event_button');
      cancelBtn.addEventListener('click', function () {
        cancelBtn.disabled = true;
        api('/v1/organizations/' + orgId + '/events/' + eventId + '/cancel', { method: 'POST' })
          .then(load)
          .catch(function (err) {
            showError(actionError, (err && err.message) || t('manage_event.action_error'));
            cancelBtn.disabled = false;
          });
      });
      actionsRow.appendChild(cancelBtn);

      container.appendChild(actionsRow);
    }

    var managementTitle = document.createElement('h2');
    managementTitle.textContent = t('manage_event.management_title');
    container.appendChild(managementTitle);

    var managementRow = document.createElement('div');
    managementRow.className = 'row';
    managementRow.style.marginBottom = '24px';
    [
      ['orders', t('manage_event.orders_button')],
      ['guest-list', t('manage_event.guest_list_button')],
      ['check-in', t('manage_event.check_in_button')],
    ].forEach(function (entry) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost';
      btn.textContent = entry[1];
      btn.addEventListener('click', function () {
        location.href = '/organizations/' + orgId + '/events/' + eventId + '/' + entry[0];
      });
      managementRow.appendChild(btn);
    });
    container.appendChild(managementRow);

    renderTicketTypes();
    if (ticketTypes.length > 0) renderBuySection();
  }

  function renderTicketTypes() {
    var sectionHeader = document.createElement('div');
    sectionHeader.className = 'row';
    sectionHeader.style.alignItems = 'center';
    var heading = document.createElement('h2');
    heading.style.margin = '0';
    heading.textContent = t('manage_event.ticket_types_title');
    sectionHeader.appendChild(heading);

    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.style.flex = 'none';
    addBtn.textContent = t('manage_event.add_button');
    sectionHeader.appendChild(addBtn);
    container.appendChild(sectionHeader);

    var form = document.createElement('form');
    form.style.display = 'none';
    form.style.marginTop = '16px';
    form.innerHTML =
      '<div class="field"><label for="type-name">' +
      t('manage_event.ticket_name_label') +
      '</label><input id="type-name" type="text" required /></div>' +
      '<div class="field"><label for="type-price">' +
      t('manage_event.ticket_price_label') +
      '</label><input id="type-price" type="text" inputmode="decimal" required /></div>' +
      '<div class="field"><label for="type-quantity">' +
      t('manage_event.ticket_quantity_label') +
      '</label><input id="type-quantity" type="number" min="1" required /></div>' +
      '<div id="type-error"></div>' +
      '<div class="row">' +
      '<button type="button" class="ghost" id="type-cancel">' +
      t('manage_event.cancel_form_button') +
      '</button>' +
      '<button type="submit" id="type-submit">' +
      t('manage_event.create_type_button') +
      '</button>' +
      '</div>';
    container.appendChild(form);

    addBtn.addEventListener('click', function () {
      addBtn.style.display = 'none';
      form.style.display = 'block';
    });
    form.querySelector('#type-cancel').addEventListener('click', function () {
      form.style.display = 'none';
      addBtn.style.display = 'inline-block';
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var typeError = form.querySelector('#type-error');
      typeError.textContent = '';
      var priceCents = Math.round(Number(form.querySelector('#type-price').value.replace(',', '.')) * 100);
      var quantityTotal = Number(form.querySelector('#type-quantity').value);
      if (!Number.isFinite(priceCents) || priceCents < 0 || !Number.isInteger(quantityTotal) || quantityTotal < 1) {
        return;
      }
      var submitBtn = form.querySelector('#type-submit');
      submitBtn.disabled = true;
      api('/v1/organizations/' + orgId + '/events/' + eventId + '/ticket-types', {
        method: 'POST',
        body: {
          name: form.querySelector('#type-name').value.trim(),
          price_cents: priceCents,
          quantity_total: quantityTotal,
          currency: 'cad',
        },
      })
        .then(load)
        .catch(function (err) {
          showError(typeError, (err && err.message) || t('manage_event.create_ticket_type_error'));
          submitBtn.disabled = false;
        });
    });

    if (ticketTypes.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'text-secondary';
      empty.style.marginTop = '16px';
      empty.textContent = t('manage_event.ticket_types_empty');
      container.appendChild(empty);
      return;
    }

    ticketTypes.forEach(function (type) {
      var card = document.createElement('div');
      card.className = 'card' + (type.id === selectedTypeId ? ' selected' : '');
      card.style.cursor = 'pointer';
      card.style.marginTop = '12px';

      var name = document.createElement('strong');
      name.textContent = type.name;
      card.appendChild(name);

      var summary = document.createElement('p');
      summary.className = 'small text-secondary';
      summary.style.margin = '4px 0 0';
      summary.textContent = t('manage_event.sold_summary', {
        price: formatPrice(type.price_cents, type.currency),
        sold: type.quantity_sold,
        total: type.quantity_total,
      });
      card.appendChild(summary);

      if (type.id === selectedTypeId) {
        var selected = document.createElement('p');
        selected.className = 'small';
        selected.style.color = 'var(--primary)';
        selected.style.fontWeight = '700';
        selected.style.margin = '4px 0 0';
        selected.textContent = t('manage_event.selected');
        card.appendChild(selected);
      }

      card.addEventListener('click', function () {
        selectedTypeId = type.id;
        load();
      });

      container.appendChild(card);
    });
  }

  function renderBuySection() {
    var heading = document.createElement('h2');
    heading.style.marginTop = '32px';
    heading.textContent = t('manage_event.buy_tickets_title');
    container.appendChild(heading);

    var hint = document.createElement('p');
    hint.className = 'text-secondary small';
    hint.textContent = t('manage_event.buy_tickets_hint');
    container.appendChild(hint);

    var form = document.createElement('div');
    form.innerHTML =
      '<div class="field"><label for="buyer-email">' +
      t('event.email_label') +
      '</label><input id="buyer-email" type="email" required /></div>' +
      '<div class="field"><label for="quantity">' +
      t('event.quantity_label') +
      '</label><input id="quantity" type="number" min="1" value="1" required /></div>' +
      '<div id="order-error"></div>' +
      '<button id="order-btn" type="button">' +
      t('event.order_button') +
      '</button>' +
      '<div id="payment-container" style="margin-top: 16px;"></div>';
    container.appendChild(form);

    var orderBtn = form.querySelector('#order-btn');
    var errorContainer = form.querySelector('#order-error');
    var paymentContainer = form.querySelector('#payment-container');

    orderBtn.addEventListener('click', function () {
      errorContainer.textContent = '';
      var buyerEmail = form.querySelector('#buyer-email').value.trim();
      var quantity = parseInt(form.querySelector('#quantity').value, 10);
      if (!buyerEmail || !selectedTypeId || !quantity || quantity < 1) {
        showError(errorContainer, t('event.missing_fields'));
        return;
      }

      orderBtn.disabled = true;
      orderBtn.textContent = t('event.order_button_wait');

      api('/v1/events/' + eventId + '/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: {
          buyer_email: buyerEmail,
          line_items: [{ ticket_type_id: selectedTypeId, quantity: quantity }],
        },
      })
        .then(function (checkoutResult) {
          if (!checkoutResult.client_secret) {
            showError(errorContainer, t('event.payment_not_ready'));
            orderBtn.disabled = false;
            orderBtn.textContent = t('event.order_button');
            return;
          }

          orderBtn.style.display = 'none';
          form.querySelector('#buyer-email').disabled = true;
          form.querySelector('#quantity').disabled = true;

          var stripe = Stripe(document.body.dataset.stripePk);
          var elements = stripe.elements({ clientSecret: checkoutResult.client_secret });
          var paymentElement = elements.create('payment');
          paymentElement.mount(paymentContainer);

          var payBtn = document.createElement('button');
          payBtn.textContent = t('event.pay_button');
          payBtn.style.marginTop = '16px';
          paymentContainer.after(payBtn);

          payBtn.addEventListener('click', function () {
            payBtn.disabled = true;
            payBtn.textContent = t('event.pay_button_wait');
            errorContainer.textContent = '';

            var ticketsUrl =
              location.origin +
              '/organizations/' +
              orgId +
              '/events/' +
              eventId +
              '/tickets/' +
              checkoutResult.order.id +
              '?lang=' +
              window.intaheLocale();

            stripe
              .confirmPayment({ elements: elements, confirmParams: { return_url: ticketsUrl }, redirect: 'if_required' })
              .then(function (result) {
                if (result.error) {
                  showError(errorContainer, result.error.message || t('event.payment_failed'));
                  payBtn.disabled = false;
                  payBtn.textContent = t('event.pay_button');
                  return;
                }
                location.href = ticketsUrl;
              });
          });
        })
        .catch(function (err) {
          orderBtn.disabled = false;
          orderBtn.textContent = t('event.order_button');
          showError(errorContainer, (err && err.message) || t('common.unknown_error'));
        });
    });
  }

  load();
})();
