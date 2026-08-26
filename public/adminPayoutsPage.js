(function () {
  var container = document.getElementById('admin-payouts-container');
  var api = window.intaheSession.apiRequest;
  var t = window.intaheT;

  function formatPrice(cents, currency) {
    return new Intl.NumberFormat(window.intaheLocaleTag(), {
      style: 'currency',
      currency: (currency || 'usd').toUpperCase(),
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

    api('/v1/admin/payouts/overview')
      .then(render)
      .catch(function (err) {
        container.textContent = '';
        var message = err && err.code === 'forbidden' ? t('admin_payouts.forbidden') : t('admin_payouts.load_error');
        showError(container, message);
      });
  }

  function render(overview) {
    container.textContent = '';

    var title = document.createElement('h1');
    title.textContent = t('admin_payouts.title');
    container.appendChild(title);

    var reconciliationLink = document.createElement('a');
    reconciliationLink.href = '/admin/reconciliation';
    reconciliationLink.textContent = t('admin_payouts.reconciliation_link');
    container.appendChild(reconciliationLink);

    var actionError = document.createElement('div');
    container.appendChild(actionError);

    container.appendChild(renderDueSection(overview.due, actionError));
    container.appendChild(renderHistorySection('executed', overview.executed));
    container.appendChild(renderHistorySection('failed', overview.failed));
  }

  function renderDueSection(due, actionError) {
    var section = document.createElement('div');
    var heading = document.createElement('h2');
    heading.textContent = t('admin_payouts.due_title');
    section.appendChild(heading);

    if (due.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'text-secondary';
      empty.textContent = t('admin_payouts.due_empty');
      section.appendChild(empty);
      return section;
    }

    due.forEach(function (entry) {
      var card = document.createElement('div');
      card.className = 'card';
      card.style.marginTop = '8px';

      var headerRow = document.createElement('div');
      headerRow.className = 'row';
      headerRow.style.alignItems = 'center';
      var name = document.createElement('strong');
      name.style.flex = '1';
      name.textContent = entry.event_name + ' — ' + entry.organization_name;
      headerRow.appendChild(name);
      if (entry.hours_overdue > 0) {
        var overdueBadge = document.createElement('span');
        overdueBadge.className = 'badge badge-destructive';
        overdueBadge.textContent = t('admin_payouts.overdue_label', { n: Math.round(entry.hours_overdue) });
        headerRow.appendChild(overdueBadge);
      }
      if (entry.held) {
        var heldBadge = document.createElement('span');
        heldBadge.className = 'badge badge-neutral';
        heldBadge.style.marginLeft = '4px';
        heldBadge.textContent = t('admin_payouts.held_badge');
        headerRow.appendChild(heldBadge);
      }
      card.appendChild(headerRow);

      var actionsRow = document.createElement('div');
      actionsRow.className = 'row';
      actionsRow.style.marginTop = '8px';

      var holdBtn = document.createElement('button');
      holdBtn.type = 'button';
      holdBtn.className = 'ghost small-btn';
      holdBtn.textContent = entry.held ? t('admin_payouts.unhold_button') : t('admin_payouts.hold_button');
      holdBtn.addEventListener('click', function () {
        holdBtn.disabled = true;
        actionError.textContent = '';
        api('/v1/admin/events/' + entry.event_id + '/payouts/hold', { method: entry.held ? 'DELETE' : 'POST' })
          .then(load)
          .catch(function (err) {
            showError(actionError, (err && err.message) || t('admin_payouts.action_error'));
            holdBtn.disabled = false;
          });
      });
      actionsRow.appendChild(holdBtn);

      var triggerBtn = document.createElement('button');
      triggerBtn.type = 'button';
      triggerBtn.className = 'small-btn';
      triggerBtn.textContent = t('admin_payouts.trigger_button');
      triggerBtn.addEventListener('click', function () {
        if (!confirm(t('admin_payouts.trigger_confirm'))) return;
        triggerBtn.disabled = true;
        actionError.textContent = '';
        api('/v1/admin/events/' + entry.event_id + '/payouts/trigger', { method: 'POST' })
          .then(load)
          .catch(function (err) {
            showError(actionError, (err && err.message) || t('admin_payouts.action_error'));
            triggerBtn.disabled = false;
          });
      });
      actionsRow.appendChild(triggerBtn);

      card.appendChild(actionsRow);
      section.appendChild(card);
    });

    return section;
  }

  function renderHistorySection(kind, entries) {
    var section = document.createElement('div');
    section.style.marginTop = '32px';
    var heading = document.createElement('h2');
    heading.textContent = t('admin_payouts.' + kind + '_title');
    section.appendChild(heading);

    if (entries.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'text-secondary';
      empty.textContent = t('admin_payouts.' + kind + '_empty');
      section.appendChild(empty);
      return section;
    }

    entries.forEach(function (entry) {
      var card = document.createElement('div');
      card.className = 'card';
      card.style.marginTop = '8px';

      var name = document.createElement('strong');
      name.textContent = entry.event_name + ' — ' + entry.organization_name;
      card.appendChild(name);

      if (kind === 'executed' && entry.amount_cents != null) {
        var amount = document.createElement('p');
        amount.className = 'small text-secondary';
        amount.style.margin = '4px 0 0';
        amount.textContent = t('admin_payouts.amount_prefix', {
          amount: formatPrice(entry.amount_cents, entry.currency),
        });
        card.appendChild(amount);
      }

      if (kind === 'failed' && entry.error_message) {
        var error = document.createElement('p');
        error.className = 'small error';
        error.style.margin = '4px 0 0';
        error.textContent = t('admin_payouts.error_prefix', { message: entry.error_message });
        card.appendChild(error);
      }

      section.appendChild(card);
    });

    return section;
  }

  load();
})();
