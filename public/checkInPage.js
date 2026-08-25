(function () {
  var container = document.getElementById('check-in-container');
  var api = window.intaheSession.apiRequest;
  var t = window.intaheT;
  var pathParts = location.pathname.split('/'); // '', organizations, :orgId, events, :eventId, check-in
  var orgId = pathParts[2];
  var eventId = pathParts[4];

  var ERROR_MESSAGES = {
    ticket_not_found: t('check_in.error_not_found'),
    ticket_already_checked_in: t('check_in.error_already'),
  };

  container.textContent = '';

  var hint = document.createElement('p');
  hint.className = 'text-secondary small';
  hint.textContent = t('check_in.hint');
  container.appendChild(hint);

  var form = document.createElement('form');
  form.innerHTML =
    '<div class="field"><label for="qr-code">' +
    t('check_in.code_label') +
    '</label><input id="qr-code" type="text" autocapitalize="none" autocomplete="off" required /></div>' +
    '<div id="message"></div>' +
    '<button type="submit" id="submit-btn">' +
    t('check_in.submit_button') +
    '</button>';
  container.appendChild(form);

  var resultCard = document.createElement('div');
  resultCard.style.display = 'none';
  resultCard.className = 'card';
  resultCard.style.marginTop = '16px';
  container.appendChild(resultCard);

  var codeInput = form.querySelector('#qr-code');
  var messageEl = form.querySelector('#message');
  var submitBtn = form.querySelector('#submit-btn');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    messageEl.textContent = '';
    resultCard.style.display = 'none';
    var code = codeInput.value.trim();
    if (!code) return;

    submitBtn.disabled = true;
    api('/v1/organizations/' + orgId + '/events/' + eventId + '/check-in', {
      method: 'POST',
      body: { qr_code: code },
    })
      .then(function (result) {
        codeInput.value = '';
        resultCard.textContent = '';
        var title = document.createElement('p');
        title.className = 'small';
        title.style.color = 'var(--success)';
        title.style.fontWeight = '700';
        title.style.margin = '0';
        title.textContent = t('check_in.success_title');
        resultCard.appendChild(title);
        var detail = document.createElement('p');
        detail.className = 'small text-secondary';
        detail.style.margin = '4px 0 0';
        detail.textContent = result.ticket.ticket_type_name + ' — ' + (result.ticket.attendee_name || result.ticket.buyer_email);
        resultCard.appendChild(detail);

        // Never blocks the scan — this ticket is valid and was just
        // checked in regardless — but staff should know the venue may be
        // running over this ticket type's listed capacity.
        if (result.ticket.ticket_type_capacity_exceeded) {
          var warning = document.createElement('p');
          warning.className = 'small';
          warning.style.color = 'var(--destructive)';
          warning.style.fontWeight = '700';
          warning.style.margin = '8px 0 0';
          warning.textContent = t('check_in.capacity_warning', { n: result.ticket.ticket_type_overshoot_quantity });
          resultCard.appendChild(warning);
        }

        resultCard.style.display = 'block';
      })
      .catch(function (err) {
        var p = document.createElement('p');
        p.className = 'error';
        p.textContent = (err && err.code && ERROR_MESSAGES[err.code]) || t('check_in.error_generic');
        messageEl.appendChild(p);
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });
})();
