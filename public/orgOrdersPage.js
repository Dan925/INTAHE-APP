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
    partially_refunded: t('org_orders.status_partially_refunded'),
  };

  function formatPrice(cents, currency) {
    return new Intl.NumberFormat(window.intaheLocaleTag(), { style: 'currency', currency: currency.toUpperCase() }).format(
      cents / 100,
    );
  }

  api('/v1/organizations/' + orgId + '/events/' + eventId + '/orders')
    .then(function (page) {
      render(page.items);
    })
    .catch(function () {
      container.textContent = '';
      var p = document.createElement('p');
      p.className = 'error';
      p.textContent = t('org_orders.load_error');
      container.appendChild(p);
    });

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

    var table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<tbody></tbody>';
    var tbody = table.querySelector('tbody');

    orders.forEach(function (order) {
      var row = document.createElement('tr');

      var emailCell = document.createElement('td');
      emailCell.textContent = order.buyer_email;
      row.appendChild(emailCell);

      var totalCell = document.createElement('td');
      totalCell.textContent = formatPrice(order.total_cents, 'CAD');
      row.appendChild(totalCell);

      var statusCell = document.createElement('td');
      statusCell.className = 'text-secondary';
      statusCell.textContent = STATUS_LABELS[order.status] || order.status;
      row.appendChild(statusCell);

      tbody.appendChild(row);
    });

    container.appendChild(table);
  }
})();
