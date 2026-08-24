(function () {
  var container = document.getElementById('order-tickets-container');
  var api = window.intaheSession.apiRequest;
  var t = window.intaheT;
  var pathParts = location.pathname.split('/'); // '', organizations, :orgId, events, :eventId, tickets, :orderId
  var eventId = pathParts[4];
  var orderId = pathParts[6];

  api('/v1/events/' + eventId + '/orders/' + orderId + '/tickets')
    .then(function (body) {
      render(body.items);
    })
    .catch(function () {
      container.textContent = '';
      var p = document.createElement('p');
      p.className = 'error';
      p.textContent = t('tickets.load_error');
      container.appendChild(p);
    });

  function render(items) {
    container.textContent = '';

    if (items.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'text-secondary';
      empty.style.textAlign = 'center';
      empty.style.marginTop = '32px';
      empty.textContent = t('tickets.empty');
      container.appendChild(empty);
      return;
    }

    items.forEach(function (ticket) {
      var card = document.createElement('div');
      card.className = 'card';
      card.style.textAlign = 'center';

      var name = document.createElement('strong');
      name.textContent = ticket.ticket_type_name;
      card.appendChild(name);

      var img = document.createElement('img');
      img.src = ticket.qr_code_image;
      img.alt = t('tickets.qr_alt');
      img.style.width = '200px';
      img.style.height = '200px';
      img.style.display = 'block';
      img.style.margin = '12px auto';
      card.appendChild(img);

      var code = document.createElement('p');
      code.className = 'small text-secondary';
      code.style.fontFamily = 'ui-monospace, monospace';
      code.style.userSelect = 'all';
      code.textContent = ticket.qr_code;
      card.appendChild(code);

      var status = document.createElement('span');
      status.className = 'badge';
      status.textContent = ticket.checked_in_at ? t('tickets.scanned') : t('tickets.not_scanned');
      card.appendChild(status);

      container.appendChild(card);
    });
  }
})();
