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

      if (entry.capacity_overshoot_quantity > 0) {
        card.appendChild(renderCapacityWarning(entry));
      }

      container.appendChild(card);
    });
  }

  // A late-paid order can push a ticket type's quantity_sold past its
  // quantity_total ("payment always wins" — see the backend README's
  // "Capacity overshoot" section). Rare, but when it happens the organizer
  // needs to see it here rather than discover it at the door.
  function renderCapacityWarning(entry) {
    var wrap = document.createElement('div');
    wrap.style.marginTop = '8px';

    var badge = document.createElement('span');
    badge.className = 'badge badge-destructive';
    badge.textContent = t('org_dashboard.capacity_exceeded_badge', { n: entry.capacity_overshoot_quantity });
    wrap.appendChild(badge);

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ghost small-btn';
    toggle.style.marginLeft = '8px';
    toggle.textContent = t('org_dashboard.capacity_exceeded_view_details');
    wrap.appendChild(toggle);

    var details = document.createElement('div');
    details.style.marginTop = '8px';
    details.style.display = 'none';
    wrap.appendChild(details);

    var loaded = false;
    toggle.addEventListener('click', function () {
      var showing = details.style.display !== 'none';
      if (showing) {
        details.style.display = 'none';
        toggle.textContent = t('org_dashboard.capacity_exceeded_view_details');
        return;
      }
      details.style.display = 'block';
      toggle.textContent = t('org_dashboard.capacity_exceeded_hide_details');
      if (loaded) return;
      loaded = true;
      api('/v1/organizations/' + orgId + '/events/' + entry.event_id + '/capacity-incidents')
        .then(function (body) {
          details.textContent = '';
          body.items.forEach(function (incident) {
            var line = document.createElement('p');
            line.className = 'small text-secondary';
            line.style.margin = '2px 0';
            line.textContent = t('org_dashboard.capacity_incident_line', {
              ticket_type: incident.ticket_type_name,
              order: incident.order_id,
              email: incident.buyer_email,
              sold: incident.quantity_sold,
              total: incident.quantity_total,
            });
            details.appendChild(line);
          });
        })
        .catch(function () {
          details.textContent = '';
          var p = document.createElement('p');
          p.className = 'small error';
          p.textContent = t('org_dashboard.capacity_exceeded_load_error');
          details.appendChild(p);
        });
    });

    return wrap;
  }

  load();
})();
