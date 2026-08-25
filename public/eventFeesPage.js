(function () {
  var container = document.getElementById('event-fees-container');
  var api = window.intaheSession.apiRequest;
  var t = window.intaheT;
  var pathParts = location.pathname.split('/'); // '', organizations, :orgId, events, :eventId, fees
  var orgId = pathParts[2];
  var eventId = pathParts[4];

  // Ticket price and Intahe's commission use the ticket type's own
  // currency (per line item); the cumulative totals below use CAD, same
  // convention as orgDashboardPage.js — this backend doesn't yet return a
  // per-event currency on the cumulative totals object.
  function formatPrice(cents, currency) {
    return new Intl.NumberFormat(window.intaheLocaleTag(), {
      style: 'currency',
      currency: (currency || 'CAD').toUpperCase(),
    }).format(cents / 100);
  }

  function load() {
    container.textContent = '';
    var loader = document.createElement('div');
    loader.className = 'loader';
    container.appendChild(loader);

    api('/v1/organizations/' + orgId + '/events/' + eventId + '/fee-breakdown')
      .then(render)
      .catch(function () {
        container.textContent = '';
        var p = document.createElement('p');
        p.className = 'error';
        p.textContent = t('event_fees.load_error');
        container.appendChild(p);
      });
  }

  function statRow(label, value) {
    var row = document.createElement('div');
    row.className = 'row';
    row.style.margin = '4px 0';
    var labelEl = document.createElement('span');
    labelEl.className = 'text-secondary small';
    labelEl.style.flex = '1';
    labelEl.textContent = label;
    row.appendChild(labelEl);
    var valueEl = document.createElement('span');
    valueEl.className = 'small';
    valueEl.style.fontWeight = '700';
    valueEl.textContent = value;
    row.appendChild(valueEl);
    return row;
  }

  function render(breakdown) {
    container.textContent = '';

    var backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'ghost';
    backBtn.style.marginBottom = '16px';
    backBtn.textContent = t('event_fees.back_button');
    backBtn.addEventListener('click', function () {
      location.href = '/organizations/' + orgId + '/events/' + eventId;
    });
    container.appendChild(backBtn);

    var title = document.createElement('h1');
    title.textContent = t('event_fees.title');
    container.appendChild(title);

    var perTicketTitle = document.createElement('h2');
    perTicketTitle.textContent = t('event_fees.per_ticket_title');
    container.appendChild(perTicketTitle);

    if (breakdown.ticket_types.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'text-secondary';
      empty.textContent = t('event_fees.empty');
      container.appendChild(empty);
    }

    breakdown.ticket_types.forEach(function (row) {
      var card = document.createElement('div');
      card.className = 'card';
      card.style.marginTop = '12px';

      var name = document.createElement('strong');
      name.textContent = row.ticket_type_name;
      card.appendChild(name);

      var sold = document.createElement('span');
      sold.className = 'small text-secondary';
      sold.style.marginLeft = '8px';
      sold.textContent = t('event_fees.sold_label', { n: row.tickets_sold });
      card.appendChild(sold);

      card.appendChild(statRow(t('event_fees.price_label'), formatPrice(row.price_cents)));
      card.appendChild(statRow(t('event_fees.commission_label'), formatPrice(row.intahe_commission_cents)));

      var gross = document.createElement('p');
      gross.className = 'small text-secondary';
      gross.style.margin = '4px 0 0';
      gross.textContent = t('event_fees.gross_label', { amount: formatPrice(row.gross_cents) });
      card.appendChild(gross);

      container.appendChild(card);
    });

    var cumulativeTitle = document.createElement('h2');
    cumulativeTitle.style.marginTop = '32px';
    cumulativeTitle.textContent = t('event_fees.cumulative_title');
    container.appendChild(cumulativeTitle);

    var totalsCard = document.createElement('div');
    totalsCard.className = 'card';
    var totals = breakdown.totals;
    totalsCard.appendChild(statRow(t('event_fees.tickets_sold_label'), String(totals.tickets_sold)));
    totalsCard.appendChild(statRow(t('event_fees.gross_revenue_label'), formatPrice(totals.gross_ticket_revenue_cents)));
    totalsCard.appendChild(statRow(t('event_fees.stripe_fees_label'), formatPrice(totals.stripe_fees_cents)));
    totalsCard.appendChild(statRow(t('event_fees.intahe_fees_label'), formatPrice(totals.intahe_fees_cents)));
    totalsCard.appendChild(statRow(t('event_fees.net_revenue_label'), formatPrice(totals.net_revenue_cents)));
    container.appendChild(totalsCard);
  }

  load();
})();
