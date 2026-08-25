(function () {
  var container = document.getElementById('orders-container');
  var api = window.intaheSession.apiRequest;
  var t = window.intaheT;
  var pathParts = location.pathname.split('/'); // '', organizations, :orgId, events, :eventId, orders
  var orgId = pathParts[2];
  var eventId = pathParts[4];

  var STATUS_LABELS = {
    pending: t('org_orders.status_pending'),
    paid: t('org_orders.status_paid'),
    refunded: t('org_orders.status_refunded'),
    partial_refund: t('org_orders.status_partial_refund'),
    expired: t('org_orders.status_expired'),
  };

  var REFUND_REASON_LABELS = {
    organizer_cancellation: t('org_orders.refund_reason_cancel'),
    event_postponed: t('org_orders.refund_reason_postpone'),
    buyer_request: t('org_orders.refund_reason_buyer_request'),
  };

  // Only these two reasons reverse Intahe's commission — see
  // orderService.shouldReverseApplicationFee, mirrored here so the UI can
  // show the consequence before the organizer submits, not just after.
  function reverseApplicationFee(reason) {
    return reason === 'organizer_cancellation' || reason === 'event_postponed';
  }

  function formatPrice(cents, currency) {
    return new Intl.NumberFormat(window.intaheLocaleTag(), {
      style: 'currency',
      currency: (currency || 'CAD').toUpperCase(),
    }).format(cents / 100);
  }

  function showError(parent, message) {
    var p = document.createElement('p');
    p.className = 'error';
    p.textContent = message;
    parent.appendChild(p);
  }

  function load() {
    container.textContent = '';
    var loader = document.createElement('div');
    loader.className = 'loader';
    container.appendChild(loader);

    api('/v1/organizations/' + orgId + '/events/' + eventId + '/orders')
      .then(function (page) {
        render(page.items);
      })
      .catch(function () {
        container.textContent = '';
        showError(container, t('org_orders.load_error'));
      });
  }

  function render(orders) {
    container.textContent = '';

    if (orders.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'text-secondary';
      empty.style.textAlign = 'center';
      empty.style.marginTop = '32px';
      empty.textContent = t('org_orders.empty');
      container.appendChild(empty);
      return;
    }

    orders.forEach(function (order) {
      container.appendChild(renderOrderCard(order));
    });
  }

  function renderOrderCard(order) {
    var card = document.createElement('div');
    card.className = 'card';
    card.style.marginTop = '8px';

    var headerRow = document.createElement('div');
    headerRow.className = 'row';
    headerRow.style.alignItems = 'center';

    var info = document.createElement('div');
    info.style.flex = '1';
    var email = document.createElement('strong');
    email.textContent = order.buyer_email;
    info.appendChild(email);
    var amount = document.createElement('p');
    amount.className = 'small text-secondary';
    amount.style.margin = '2px 0 0';
    amount.textContent = formatPrice(order.total_cents, 'CAD');
    info.appendChild(amount);
    headerRow.appendChild(info);

    var badge = document.createElement('span');
    badge.className =
      order.status === 'paid'
        ? 'badge'
        : order.status === 'refunded' || order.status === 'partial_refund'
          ? 'badge badge-neutral'
          : 'badge badge-destructive';
    badge.textContent = STATUS_LABELS[order.status] || order.status;
    headerRow.appendChild(badge);

    card.appendChild(headerRow);

    if (order.refund_reason && order.refunded_at) {
      var refundedInfo = document.createElement('p');
      refundedInfo.className = 'small text-secondary';
      refundedInfo.style.margin = '6px 0 0';
      refundedInfo.textContent = t('org_orders.refunded_on_prefix', {
        date: new Date(order.refunded_at).toLocaleString(window.intaheLocaleTag()),
        reason: REFUND_REASON_LABELS[order.refund_reason] || order.refund_reason,
      });
      card.appendChild(refundedInfo);
    }

    var refundable = order.status === 'paid' || order.status === 'partial_refund';
    if (!refundable) return card;

    var actionArea = document.createElement('div');
    actionArea.style.marginTop = '8px';
    card.appendChild(actionArea);

    var refundBtn = document.createElement('button');
    refundBtn.type = 'button';
    refundBtn.className = 'ghost small-btn';
    refundBtn.textContent = t('org_orders.refund_button');
    refundBtn.addEventListener('click', function () {
      refundBtn.style.display = 'none';
      actionArea.appendChild(renderRefundForm(order, actionArea, refundBtn));
    });
    actionArea.appendChild(refundBtn);

    return card;
  }

  function renderRefundForm(order, actionArea, refundBtn) {
    var form = document.createElement('div');
    form.style.marginTop = '12px';
    form.style.paddingTop = '12px';
    form.style.borderTop = '1px solid var(--border, #e2e2e2)';

    // --- amount ---
    var amountLabel = document.createElement('p');
    amountLabel.className = 'small';
    amountLabel.style.fontWeight = '700';
    amountLabel.textContent = t('org_orders.refund_amount_label');
    form.appendChild(amountLabel);

    var fullRadioId = 'refund-amount-full-' + order.id;
    var partialRadioId = 'refund-amount-partial-' + order.id;

    var amountRow = document.createElement('div');
    amountRow.innerHTML =
      '<label style="margin-right:16px;"><input type="radio" name="refund-amount-' +
      order.id +
      '" id="' +
      fullRadioId +
      '" value="full" checked /> ' +
      t('org_orders.refund_amount_full') +
      '</label>' +
      '<label><input type="radio" name="refund-amount-' +
      order.id +
      '" id="' +
      partialRadioId +
      '" value="partial" /> ' +
      t('org_orders.refund_amount_partial') +
      '</label>';
    form.appendChild(amountRow);

    var partialField = document.createElement('div');
    partialField.className = 'field';
    partialField.style.display = 'none';
    partialField.innerHTML =
      '<label for="refund-partial-amount-' +
      order.id +
      '">' +
      t('org_orders.refund_amount_partial_input_label') +
      '</label><input id="refund-partial-amount-' +
      order.id +
      '" type="text" inputmode="decimal" />';
    form.appendChild(partialField);

    var fullRadio = amountRow.querySelector('#' + fullRadioId);
    var partialRadio = amountRow.querySelector('#' + partialRadioId);
    var partialInput = partialField.querySelector('input');
    partialRadio.addEventListener('change', function () {
      partialField.style.display = partialRadio.checked ? 'block' : 'none';
    });
    fullRadio.addEventListener('change', function () {
      partialField.style.display = partialRadio.checked ? 'block' : 'none';
    });

    // --- reason ---
    var reasonLabel = document.createElement('label');
    reasonLabel.className = 'small';
    reasonLabel.style.fontWeight = '700';
    reasonLabel.style.display = 'block';
    reasonLabel.style.marginTop = '12px';
    reasonLabel.textContent = t('org_orders.refund_reason_label');
    form.appendChild(reasonLabel);

    var reasonSelect = document.createElement('select');
    var placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = t('org_orders.refund_reason_placeholder');
    reasonSelect.appendChild(placeholderOpt);
    [
      ['organizer_cancellation', t('org_orders.refund_reason_cancel')],
      ['event_postponed', t('org_orders.refund_reason_postpone')],
      ['buyer_request', t('org_orders.refund_reason_buyer_request')],
    ].forEach(function (entry) {
      var opt = document.createElement('option');
      opt.value = entry[0];
      opt.textContent = entry[1];
      reasonSelect.appendChild(opt);
    });
    form.appendChild(reasonSelect);

    var reasonNote = document.createElement('p');
    reasonNote.className = 'small text-secondary';
    reasonNote.style.margin = '6px 0 0';
    form.appendChild(reasonNote);

    reasonSelect.addEventListener('change', function () {
      if (!reasonSelect.value) {
        reasonNote.textContent = '';
        return;
      }
      reasonNote.textContent = reverseApplicationFee(reasonSelect.value)
        ? t('org_orders.commission_refunded_note')
        : t('org_orders.commission_not_refunded_note');
    });

    var formError = document.createElement('div');
    form.appendChild(formError);

    var buttonRow = document.createElement('div');
    buttonRow.className = 'row';
    buttonRow.style.marginTop = '12px';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'ghost';
    cancelBtn.textContent = t('org_orders.refund_cancel_button');
    cancelBtn.addEventListener('click', function () {
      form.remove();
      refundBtn.style.display = 'inline-block';
    });
    buttonRow.appendChild(cancelBtn);

    var continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.textContent = t('org_orders.refund_continue_button');
    continueBtn.addEventListener('click', function () {
      formError.textContent = '';

      if (!reasonSelect.value) {
        showError(formError, t('org_orders.refund_reason_required'));
        return;
      }

      var amountCents = null; // null means "full refund" to the API
      if (partialRadio.checked) {
        var parsed = Math.round(Number(partialInput.value.replace(',', '.')) * 100);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          showError(formError, t('org_orders.refund_error'));
          return;
        }
        amountCents = parsed;
      }

      form.replaceWith(
        renderRefundConfirm(order, actionArea, refundBtn, amountCents, reasonSelect.value, function () {
          actionArea.appendChild(form);
        }),
      );
    });
    buttonRow.appendChild(continueBtn);

    form.appendChild(buttonRow);

    return form;
  }

  function renderRefundConfirm(order, actionArea, refundBtn, amountCents, reason, onBack) {
    var confirmBox = document.createElement('div');
    confirmBox.className = 'card';
    confirmBox.style.marginTop = '12px';
    confirmBox.style.background = 'var(--surface-alt, #f6f6f6)';

    var title = document.createElement('p');
    title.style.fontWeight = '700';
    title.style.margin = '0 0 8px';
    title.textContent = t('org_orders.refund_confirm_title');
    confirmBox.appendChild(title);

    var amountToShow = amountCents == null ? order.total_cents : amountCents;
    var amountLine = document.createElement('p');
    amountLine.className = 'small';
    amountLine.textContent = t('org_orders.refund_confirm_amount_prefix', {
      amount: formatPrice(amountToShow, 'CAD'),
    });
    confirmBox.appendChild(amountLine);

    var commissionLine = document.createElement('p');
    commissionLine.className = 'small';
    commissionLine.textContent = reverseApplicationFee(reason)
      ? t('org_orders.commission_refunded_note')
      : t('org_orders.commission_not_refunded_note');
    confirmBox.appendChild(commissionLine);

    var stripeWarning = document.createElement('p');
    stripeWarning.className = 'small text-secondary';
    stripeWarning.textContent = t('org_orders.stripe_fees_warning');
    confirmBox.appendChild(stripeWarning);

    var confirmError = document.createElement('div');
    confirmBox.appendChild(confirmError);

    var buttonRow = document.createElement('div');
    buttonRow.className = 'row';
    buttonRow.style.marginTop = '12px';

    var backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'ghost';
    backBtn.textContent = t('org_orders.refund_back_button');
    backBtn.addEventListener('click', function () {
      confirmBox.remove();
      onBack();
    });
    buttonRow.appendChild(backBtn);

    var confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'destructive';
    confirmBtn.textContent = t('org_orders.refund_confirm_button');
    confirmBtn.addEventListener('click', function () {
      confirmBtn.disabled = true;
      backBtn.disabled = true;
      var body = { reason: reason };
      if (amountCents != null) body.amount_cents = amountCents;

      api('/v1/organizations/' + orgId + '/events/' + eventId + '/orders/' + order.id + '/refund', {
        method: 'POST',
        body: body,
      })
        .then(load)
        .catch(function (err) {
          showError(confirmError, (err && err.message) || t('org_orders.refund_error'));
          confirmBtn.disabled = false;
          backBtn.disabled = false;
        });
    });
    buttonRow.appendChild(confirmBtn);

    confirmBox.appendChild(buttonRow);

    return confirmBox;
  }

  load();
})();
