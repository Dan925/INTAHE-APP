(function () {
  const container = document.getElementById('event-container');
  const eventId = location.pathname.split('/')[2];

  function formatDate(iso) {
    return new Date(iso).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function formatPrice(cents, currency) {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: currency.toUpperCase() }).format(
      cents / 100,
    );
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    const body = await res.json();
    if (!res.ok) {
      const err = new Error((body.error && body.error.message) || 'Erreur inconnue.');
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
      container.appendChild(showError('Impossible de charger cet événement. ' + err.message));
      return;
    }

    document.title = event.name + ' — Intahe';

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
    ticketsHeading.textContent = 'Billets';
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
        formatPrice(type.price_cents, type.currency) + ' · ' + remaining + ' restant(s)';
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
      p.textContent = 'Aucun billet disponible pour cet événement.';
      container.appendChild(p);
      return;
    }

    const form = document.createElement('div');
    form.innerHTML = `
      <div class="field">
        <label for="buyer-email">E-mail</label>
        <input id="buyer-email" type="email" required />
      </div>
      <div class="field">
        <label for="quantity">Quantité</label>
        <input id="quantity" type="number" min="1" value="1" required />
      </div>
      <div id="checkout-error"></div>
      <button id="order-btn" type="button">Commander</button>
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
        errorContainer.appendChild(showError('Renseigne ton e-mail et une quantité valide.'));
        return;
      }

      orderBtn.disabled = true;
      orderBtn.textContent = 'Un instant…';

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
        orderBtn.textContent = 'Commander';
        errorContainer.appendChild(showError(err.message));
        return;
      }

      if (!checkoutResult.client_secret) {
        errorContainer.appendChild(showError('Le paiement n’a pas pu être initialisé.'));
        orderBtn.disabled = false;
        orderBtn.textContent = 'Commander';
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
      payBtn.textContent = 'Payer';
      payBtn.style.marginTop = '16px';
      paymentContainer.after(payBtn);

      payBtn.addEventListener('click', async function () {
        payBtn.disabled = true;
        payBtn.textContent = 'Paiement en cours…';
        errorContainer.textContent = '';

        const ticketsUrl =
          location.origin +
          '/events/' +
          eventId +
          '/orders/' +
          checkoutResult.order.id +
          '/tickets?buyer_email=' +
          encodeURIComponent(buyerEmail);

        const { error } = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: ticketsUrl },
          redirect: 'if_required',
        });

        if (error) {
          errorContainer.appendChild(showError(error.message || 'Le paiement a échoué.'));
          payBtn.disabled = false;
          payBtn.textContent = 'Payer';
          return;
        }

        location.href = ticketsUrl;
      });
    });
  }

  main();
})();
