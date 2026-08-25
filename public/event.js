(function () {
  const container = document.getElementById('event-container');
  const eventId = location.pathname.split('/')[2];

  function formatDate(iso) {
    return new Date(iso).toLocaleString(window.intaheLocaleTag(), { dateStyle: 'medium', timeStyle: 'short' });
  }

  function formatPrice(cents, currency) {
    return new Intl.NumberFormat(window.intaheLocaleTag(), { style: 'currency', currency: currency.toUpperCase() }).format(
      cents / 100,
    );
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    const body = await res.json();
    if (!res.ok) {
      const err = new Error((body.error && body.error.message) || window.intaheT('common.unknown_error'));
      err.code = body.error && body.error.code;
      throw err;
    }
    return body;
  }

  function showError(message) {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = message;
    return p;
  }

  async function main() {
    let event;
    let ticketTypes;
    try {
      [event, ticketTypes] = await Promise.all([
        fetchJson('/v1/discover/events/' + eventId).then((b) => b.event),
        fetchJson('/v1/discover/events/' + eventId + '/ticket-types').then((b) => b.items),
      ]);
    } catch (err) {
      container.textContent = '';
      container.appendChild(showError(window.intaheT('event.load_error') + err.message));
      return;
    }

    document.title = event.name + window.intaheT('event.title_suffix');

    let selectedTicketTypeId = ticketTypes[0] ? ticketTypes[0].id : null;

    container.innerHTML = '';

    const title = document.createElement('h1');
    title.textContent = event.name;
    container.appendChild(title);

    const date = document.createElement('p');
    date.className = 'text-secondary';
    date.textContent = formatDate(event.start_at) + ' — ' + formatDate(event.end_at);
    container.appendChild(date);

    if (event.address) {
      const address = document.createElement('p');
      address.className = 'text-secondary';
      address.textContent = event.address;
      container.appendChild(address);
    }

    if (event.description) {
      const description = document.createElement('p');
      description.textContent = event.description;
      container.appendChild(description);
    }

    const ticketsHeading = document.createElement('h2');
    ticketsHeading.textContent = window.intaheT('event.tickets_heading');
    container.appendChild(ticketsHeading);

    const ticketList = document.createElement('div');
    for (const type of ticketTypes) {
      const card = document.createElement('div');
      card.className = 'card' + (type.id === selectedTicketTypeId ? ' selected' : '');
      card.dataset.ticketTypeId = type.id;
      card.style.cursor = 'pointer';

      const name = document.createElement('strong');
      name.textContent = type.name;
      card.appendChild(name);

      const remaining = type.quantity_total - type.quantity_sold;
      const price = document.createElement('p');
      price.className = 'small text-secondary';
      price.textContent =
        formatPrice(type.price_cents, type.currency) + ' · ' + window.intaheT('event.remaining', { n: remaining });
      card.appendChild(price);

      card.addEventListener('click', function () {
        selectedTicketTypeId = type.id;
        ticketList.querySelectorAll('.card').forEach((el) => el.classList.remove('selected'));
        card.classList.add('selected');
      });

      ticketList.appendChild(card);
    }
    container.appendChild(ticketList);

    if (ticketTypes.length === 0) {
      const p = document.createElement('p');
      p.className = 'text-secondary';
      p.textContent = window.intaheT('event.tickets_empty');
      container.appendChild(p);
      return;
    }

    const form = document.createElement('div');
    form.innerHTML = `
      <div class="field">
        <label for="buyer-email">${window.intaheT('event.email_label')}</label>
        <input id="buyer-email" type="email" required />
      </div>
      <div class="field">
        <label for="quantity">${window.intaheT('event.quantity_label')}</label>
        <input id="quantity" type="number" min="1" value="1" required />
      </div>
      <div id="checkout-error"></div>
      <button id="order-btn" type="button">${window.intaheT('event.order_button')}</button>
      <div id="payment-container" style="margin-top: 16px;"></div>
    `;
    container.appendChild(form);

    const orderBtn = form.querySelector('#order-btn');
    const errorContainer = form.querySelector('#checkout-error');
    const paymentContainer = form.querySelector('#payment-container');

    orderBtn.addEventListener('click', async function () {
      errorContainer.textContent = '';
      const buyerEmail = form.querySelector('#buyer-email').value.trim();
      const quantity = parseInt(form.querySelector('#quantity').value, 10);
      if (!buyerEmail || !selectedTicketTypeId || !quantity || quantity < 1) {
        errorContainer.appendChild(showError(window.intaheT('event.missing_fields')));
        return;
      }

      orderBtn.disabled = true;
      orderBtn.textContent = window.intaheT('event.order_button_wait');

      let checkoutResult;
      try {
        checkoutResult = await fetchJson('/v1/events/' + eventId + '/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            buyer_email: buyerEmail,
            line_items: [{ ticket_type_id: selectedTicketTypeId, quantity: quantity }],
          }),
        });
      } catch (err) {
        orderBtn.disabled = false;
        orderBtn.textContent = window.intaheT('event.order_button');
        errorContainer.appendChild(showError(err.message));
        return;
      }

      if (!checkoutResult.client_secret) {
        errorContainer.appendChild(showError(window.intaheT('event.payment_not_ready')));
        orderBtn.disabled = false;
        orderBtn.textContent = window.intaheT('event.order_button');
        return;
      }

      orderBtn.style.display = 'none';
      form.querySelector('#buyer-email').disabled = true;
      form.querySelector('#quantity').disabled = true;

      const stripe = Stripe(document.body.dataset.stripePk);
      const elements = stripe.elements({ clientSecret: checkoutResult.client_secret });
      const paymentElement = elements.create('payment');
      paymentElement.mount(paymentContainer);

      const payBtn = document.createElement('button');
      payBtn.textContent = window.intaheT('event.pay_button');
      payBtn.style.marginTop = '16px';
      paymentContainer.after(payBtn);

      payBtn.addEventListener('click', async function () {
        payBtn.disabled = true;
        payBtn.textContent = window.intaheT('event.pay_button_wait');
        errorContainer.textContent = '';

        // Only used if Stripe actually has to leave the page (e.g. an
        // off-site 3DS step) — redirect: 'if_required' resolves in place
        // otherwise. There's no tickets link to send the buyer to here:
        // the access token doesn't exist until the payment_intent.succeeded
        // webhook issues the tickets, which hasn't necessarily happened yet
        // by the time this resolves — the confirmation email (sent from
        // that same webhook, once the token exists) is the reliable way to
        // reach them.
        const returnUrl = location.origin + '/events/' + eventId + '?lang=' + window.intaheLocale();

        const { error } = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: returnUrl },
          redirect: 'if_required',
        });

        if (error) {
          errorContainer.appendChild(showError(error.message || window.intaheT('event.payment_failed')));
          payBtn.disabled = false;
          payBtn.textContent = window.intaheT('event.pay_button');
          return;
        }

        payBtn.remove();
        paymentContainer.innerHTML = '';
        const successBox = document.createElement('div');
        successBox.className = 'success-box';
        successBox.textContent = window.intaheT('event.payment_succeeded');
        paymentContainer.appendChild(successBox);
      });
    });
  }

  main();
})();
