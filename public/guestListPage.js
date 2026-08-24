(function () {
  var container = document.getElementById('guest-list-container');
  var api = window.intaheSession.apiRequest;
  var t = window.intaheT;
  var pathParts = location.pathname.split('/'); // '', organizations, :orgId, events, :eventId, guest-list
  var orgId = pathParts[2];
  var eventId = pathParts[4];

  api('/v1/organizations/' + orgId + '/events/' + eventId + '/guest-list')
    .then(function (page) {
      render(page.items);
    })
    .catch(function () {
      container.textContent = '';
      var p = document.createElement('p');
      p.className = 'error';
      p.textContent = t('guest_list.load_error');
      container.appendChild(p);
    });

  function render(entries) {
    container.textContent = '';

    if (entries.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'text-secondary';
      empty.style.textAlign = 'center';
      empty.style.marginTop = '32px';
      empty.textContent = t('guest_list.empty');
      container.appendChild(empty);
      return;
    }

    var table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<tbody></tbody>';
    var tbody = table.querySelector('tbody');

    entries.forEach(function (entry) {
      var row = document.createElement('tr');

      var nameCell = document.createElement('td');
      var name = document.createElement('strong');
      name.textContent = entry.attendee_name || entry.buyer_email;
      nameCell.appendChild(name);
      row.appendChild(nameCell);

      var typeCell = document.createElement('td');
      typeCell.textContent = entry.ticket_type_name;
      typeCell.className = 'text-secondary';
      row.appendChild(typeCell);

      var statusCell = document.createElement('td');
      var status = document.createElement('span');
      status.className = 'small';
      status.style.color = entry.checked_in_at ? 'var(--success)' : 'var(--text-secondary)';
      status.style.fontWeight = '700';
      status.textContent = entry.checked_in_at ? t('guest_list.scanned') : t('guest_list.pending');
      statusCell.appendChild(status);
      row.appendChild(statusCell);

      tbody.appendChild(row);
    });

    container.appendChild(table);
  }
})();
