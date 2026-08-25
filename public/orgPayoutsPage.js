(function () {
  var container = document.getElementById('payouts-container');
  var api = window.intaheSession.apiRequest;
  var t = window.intaheT;
  var orgId = location.pathname.split('/')[2];

  function formatPrice(cents, currency) {
    return new Intl.NumberFormat(window.intaheLocaleTag(), {
      style: 'currency',
      currency: (currency || 'usd').toUpperCase(),
    }).format(cents / 100);
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString(window.intaheLocaleTag());
  }

  function statusLabel(status) {
    return t('org_payouts.status_' + status) || status;
  }

  function stat(label, value, hint) {
    var wrap = document.createElement('div');
    wrap.className = 'stat';
    var labelEl = document.createElement('p');
    labelEl.className = 'small text-secondary';
    labelEl.style.margin = '0 0 4px';
    labelEl.textContent = label;
    wrap.appendChild(labelEl);
    var valueEl = document.createElement('p');
    valueEl.className = 'value';
    valueEl.style.margin = '0';
    valueEl.textContent = value;
    wrap.appendChild(valueEl);
    if (hint) {
      var hintEl = document.createElement('p');
      hintEl.className = 'small text-secondary';
      hintEl.style.margin = '4px 0 0';
      hintEl.textContent = hint;
      wrap.appendChild(hintEl);
    }
    return wrap;
  }

  function load() {
    container.textContent = '';
    var loader = document.createElement('div');
    loader.className = 'loader';
    container.appendChild(loader);

    api('/v1/organizations/' + orgId + '/stripe/payouts')
      .then(render)
      .catch(function () {
        container.textContent = '';
        var p = document.createElement('p');
        p.className = 'error';
        p.textContent = t('org_payouts.load_error');
        container.appendChild(p);
      });
  }

  function render(overview) {
    container.textContent = '';

    var backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'ghost';
    backBtn.style.marginBottom = '16px';
    backBtn.textContent = t('org_payouts.back_button');
    backBtn.addEventListener('click', function () {
      location.href = '/organizations/' + orgId;
    });
    container.appendChild(backBtn);

    var title = document.createElement('h1');
    title.textContent = t('org_payouts.title');
    container.appendChild(title);

    if (!overview.connected) {
      var notConnected = document.createElement('p');
      notConnected.className = 'text-secondary';
      notConnected.textContent = t('org_payouts.not_connected');
      container.appendChild(notConnected);
      return;
    }

    var currency = (overview.balance && overview.balance.currency) || 'usd';
    var statsRow = document.createElement('div');
    statsRow.className = 'stat-row';
    statsRow.appendChild(
      stat(
        t('org_payouts.collected_balance_label'),
        formatPrice(overview.balance ? overview.balance.pending_cents : 0, currency),
        t('org_payouts.collected_balance_hint'),
      ),
    );
    statsRow.appendChild(
      stat(
        t('org_payouts.available_balance_label'),
        formatPrice(overview.balance ? overview.balance.available_cents : 0, currency),
        t('org_payouts.available_balance_hint'),
      ),
    );
    container.appendChild(statsRow);

    var upcomingTitle = document.createElement('h2');
    upcomingTitle.textContent = t('org_payouts.upcoming_title');
    container.appendChild(upcomingTitle);

    var delayNote = document.createElement('p');
    delayNote.className = 'small text-secondary';
    delayNote.textContent = t('org_payouts.delay_note');
    container.appendChild(delayNote);

    if (overview.upcoming.length === 0) {
      var upcomingEmpty = document.createElement('p');
      upcomingEmpty.className = 'text-secondary';
      upcomingEmpty.textContent = t('org_payouts.upcoming_empty');
      container.appendChild(upcomingEmpty);
    } else {
      overview.upcoming.forEach(function (entry) {
        var card = document.createElement('div');
        card.className = 'card';
        card.style.marginTop = '8px';
        card.textContent = t('org_payouts.next_payout_line', {
          event: entry.event_name,
          date: formatDate(entry.scheduled_for),
        });
        container.appendChild(card);
      });
    }

    var historyTitle = document.createElement('h2');
    historyTitle.style.marginTop = '32px';
    historyTitle.textContent = t('org_payouts.history_title');
    container.appendChild(historyTitle);

    if (overview.history.length === 0) {
      var historyEmpty = document.createElement('p');
      historyEmpty.className = 'text-secondary';
      historyEmpty.textContent = t('org_payouts.history_empty');
      container.appendChild(historyEmpty);
      return;
    }

    overview.history.forEach(function (entry) {
      var card = document.createElement('div');
      card.className = 'card';
      card.style.marginTop = '8px';

      var headerRow = document.createElement('div');
      headerRow.className = 'row';
      headerRow.style.alignItems = 'center';
      var name = document.createElement('strong');
      name.style.flex = '1';
      name.textContent = entry.event_name;
      headerRow.appendChild(name);
      var badge = document.createElement('span');
      badge.className =
        entry.status === 'succeeded' ? 'badge' : entry.status === 'failed' ? 'badge badge-destructive' : 'badge badge-neutral';
      badge.textContent = statusLabel(entry.status);
      headerRow.appendChild(badge);
      card.appendChild(headerRow);

      if (entry.status === 'succeeded' && entry.amount_cents != null) {
        var amount = document.createElement('p');
        amount.className = 'small text-secondary';
        amount.style.margin = '4px 0 0';
        amount.textContent = t('org_payouts.amount_prefix', {
          amount: formatPrice(entry.amount_cents, entry.currency || currency),
        });
        card.appendChild(amount);
      }

      if (entry.status === 'failed' && entry.error_message) {
        var error = document.createElement('p');
        error.className = 'small error';
        error.style.margin = '4px 0 0';
        error.textContent = t('org_payouts.error_prefix', { message: entry.error_message });
        card.appendChild(error);
      }

      container.appendChild(card);
    });
  }

  load();
})();
