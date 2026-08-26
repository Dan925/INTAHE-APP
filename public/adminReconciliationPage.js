(function () {
  var container = document.getElementById('admin-reconciliation-container');
  var api = window.intaheSession.apiRequest;
  var t = window.intaheT;

  function formatPrice(cents) {
    return new Intl.NumberFormat(window.intaheLocaleTag(), { style: 'currency', currency: 'USD' }).format(
      cents / 100,
    );
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

    api('/v1/admin/reconciliation')
      .then(render)
      .catch(function (err) {
        container.textContent = '';
        var message =
          err && err.code === 'forbidden' ? t('admin_reconciliation.forbidden') : t('admin_reconciliation.load_error');
        showError(container, message);
      });
  }

  function render(overview) {
    container.textContent = '';

    var title = document.createElement('h1');
    title.textContent = t('admin_reconciliation.title');
    container.appendChild(title);

    var payoutsLink = document.createElement('a');
    payoutsLink.href = '/admin/payouts';
    payoutsLink.textContent = t('admin_reconciliation.payouts_link');
    container.appendChild(payoutsLink);

    var intro = document.createElement('p');
    intro.className = 'text-secondary small';
    intro.textContent = t('admin_reconciliation.intro');
    container.appendChild(intro);

    var actionError = document.createElement('div');
    container.appendChild(actionError);

    container.appendChild(renderOpenSection(overview.open, actionError));
    container.appendChild(renderResolvedSection(overview.resolved));
  }

  function renderOpenSection(open, actionError) {
    var section = document.createElement('div');
    var heading = document.createElement('h2');
    heading.textContent = t('admin_reconciliation.open_title');
    section.appendChild(heading);

    if (open.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'text-secondary';
      empty.textContent = t('admin_reconciliation.open_empty');
      section.appendChild(empty);
      return section;
    }

    open.forEach(function (incident) {
      var card = document.createElement('div');
      card.className = 'card';
      card.style.marginTop = '8px';
      card.style.borderColor = 'var(--destructive, #c0392b)';

      var headerRow = document.createElement('div');
      headerRow.className = 'row';
      headerRow.style.alignItems = 'center';
      var name = document.createElement('strong');
      name.style.flex = '1';
      name.textContent = incident.event_name + ' — ' + incident.organization_name;
      headerRow.appendChild(name);
      var badge = document.createElement('span');
      badge.className = 'badge badge-destructive';
      badge.textContent = t('admin_reconciliation.stuck_badge');
      headerRow.appendChild(badge);
      card.appendChild(headerRow);

      var detail = document.createElement('p');
      detail.className = 'small text-secondary';
      detail.style.margin = '6px 0 0';
      detail.textContent = t('admin_reconciliation.incident_detail', {
        buyer: incident.buyer_email,
        amount: formatPrice(incident.amount_cents),
        detected: new Date(incident.detected_at).toLocaleString(window.intaheLocaleTag()),
      });
      card.appendChild(detail);

      var piLine = document.createElement('p');
      piLine.className = 'small text-secondary';
      piLine.style.margin = '2px 0 0';
      piLine.style.fontFamily = 'monospace';
      piLine.textContent = incident.stripe_payment_intent_id;
      card.appendChild(piLine);

      var actionsRow = document.createElement('div');
      actionsRow.className = 'row';
      actionsRow.style.marginTop = '8px';

      var reconcileBtn = document.createElement('button');
      reconcileBtn.type = 'button';
      reconcileBtn.textContent = t('admin_reconciliation.reconcile_button');
      reconcileBtn.addEventListener('click', function () {
        if (!confirm(t('admin_reconciliation.reconcile_confirm'))) return;
        reconcileBtn.disabled = true;
        actionError.textContent = '';
        api('/v1/admin/orders/' + incident.order_id + '/reconcile', { method: 'POST' })
          .then(load)
          .catch(function (err) {
            showError(actionError, (err && err.message) || t('admin_reconciliation.action_error'));
            reconcileBtn.disabled = false;
          });
      });
      actionsRow.appendChild(reconcileBtn);

      card.appendChild(actionsRow);
      section.appendChild(card);
    });

    return section;
  }

  function renderResolvedSection(resolved) {
    var section = document.createElement('div');
    section.style.marginTop = '32px';
    var heading = document.createElement('h2');
    heading.textContent = t('admin_reconciliation.resolved_title');
    section.appendChild(heading);

    if (resolved.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'text-secondary';
      empty.textContent = t('admin_reconciliation.resolved_empty');
      section.appendChild(empty);
      return section;
    }

    resolved.forEach(function (incident) {
      var card = document.createElement('div');
      card.className = 'card';
      card.style.marginTop = '8px';

      var name = document.createElement('strong');
      name.textContent = incident.event_name + ' — ' + incident.organization_name;
      card.appendChild(name);

      var detail = document.createElement('p');
      detail.className = 'small text-secondary';
      detail.style.margin = '4px 0 0';
      detail.textContent = t('admin_reconciliation.resolved_detail', {
        amount: formatPrice(incident.amount_cents),
        resolution:
          incident.resolution === 'manual_reissue'
            ? t('admin_reconciliation.resolution_manual')
            : t('admin_reconciliation.resolution_webhook'),
        date: new Date(incident.resolved_at).toLocaleString(window.intaheLocaleTag()),
      });
      card.appendChild(detail);

      section.appendChild(card);
    });

    return section;
  }

  load();
})();
