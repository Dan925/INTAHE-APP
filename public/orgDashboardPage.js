(function () {
  var container = document.getElementById('dashboard-container');
  var api = window.intaheSession.apiRequest;
  var t = window.intaheT;
  var orgId = location.pathname.split('/')[2];

  function formatPrice(cents, currency) {
    return new Intl.NumberFormat(window.intaheLocaleTag(), { style: 'currency', currency: currency.toUpperCase() }).format(
      cents / 100,
    );
  }

  function stat(label, value) {
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
    return wrap;
  }

  function load() {
    container.textContent = '';
    var loader = document.createElement('div');
    loader.className = 'loader';
    container.appendChild(loader);

    api('/v1/organizations/' + orgId + '/dashboard')
      .then(render)
      .catch(function () {
        container.textContent = '';
        var p = document.createElement('p');
        p.className = 'error';
        p.textContent = t('org_dashboard.load_error');
        container.appendChild(p);
      });
  }

  function render(dashboard) {
    container.textContent = '';

    var statsRow = document.createElement('div');
    statsRow.className = 'stat-row';
    statsRow.appendChild(stat(t('org_dashboard.tickets_sold'), String(dashboard.totals.tickets_sold)));
    statsRow.appendChild(stat(t('org_dashboard.orders_paid'), String(dashboard.totals.orders_paid_count)));
    statsRow.appendChild(stat(t('org_dashboard.net_revenue'), formatPrice(dashboard.totals.net_revenue_cents, 'CAD')));
    container.appendChild(statsRow);

    var sectionTitle = document.createElement('h2');
    sectionTitle.textContent = t('org_dashboard.by_event');
    container.appendChild(sectionTitle);

    if (dashboard.events.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'text-secondary';
      empty.style.textAlign = 'center';
      empty.style.marginTop = '32px';
      empty.textContent = t('org_dashboard.empty');
      container.appendChild(empty);
      return;
    }

    dashboard.events.forEach(function (entry) {
      var card = document.createElement('div');
      card.className = 'card';
      var name = document.createElement('strong');
      name.textContent = entry.event_name;
      card.appendChild(name);
      var summary = document.createElement('p');
      summary.className = 'small text-secondary';
      summary.style.margin = '4px 0 0';
      summary.textContent = t('org_dashboard.orders_tickets_summary', {
        orders: entry.orders_paid_count,
        tickets: entry.tickets_sold,
      });
      card.appendChild(summary);
      var net = document.createElement('p');
      net.className = 'small text-secondary';
      net.style.margin = '2px 0 0';
      net.textContent = t('org_dashboard.net_prefix', { amount: formatPrice(entry.net_revenue_cents, 'CAD') });
      card.appendChild(net);
      container.appendChild(card);
    });
  }

  load();
})();
