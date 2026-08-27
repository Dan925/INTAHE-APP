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

  // timeoutMs is opt-in (only the checkout POST below uses it) — the
  // discover/confirmation-polling call sites already have their own
  // timing behavior and shouldn't be affected by adding this.
  async function fetchJson(url, options) {
    options = options || {};
    let timeoutId;
    const controller = options.timeoutMs ? new AbortController() : null;
    if (controller) {
      timeoutId = setTimeout(function () {
        controller.abort();
      }, options.timeoutMs);
    }
    let res;
    try {
      res = await fetch(url, controller ? Object.assign({}, options, { signal: controller.signal }) : options);
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Error(window.intaheT('event.request_timeout'));
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
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

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const CONFIRMATION_POLL_INTERVAL_MS = 3000;
  const CONFIRMATION_POLL_TIMEOUT_MS = 2 * 60 * 1000;

  // Polls the confirmation route rather than redirecting straight to a
  // tickets link: the access token doesn't exist until the
  // payment_intent.succeeded webhook issues the tickets, which is
  // asynchronous and usually — but not always — done well within a couple
  // of seconds of the payment resolving here. A buyer standing at the door
  // on a bad connection needs to see their ticket now, not be told to go
  // check their email, which was the previous (rejected) behavior here.
  async function pollForTickets(eventId, orderId) {
    const deadline = Date.now() + CONFIRMATION_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      let confirmation;
      try {
        confirmation = await fetchJson('/v1/events/' + eventId + '/orders/' + orderId + '/confirmation');
      } catch {
        // Transient network hiccup or rate limit — keep trying rather than
        // giving up on the first blip; the loop's own deadline bounds this.
        await sleep(CONFIRMATION_POLL_INTERVAL_MS);
        continue;
      }
      if (confirmation.status === 'ready') {
        return confirmation.access_token;
      }
      if (confirmation.status !== 'pending') {
        // 'already_retrieved' or 'expired' — the one-time token is gone
        // either way; the email (sent the moment tickets existed) is the
        // remaining path to them.
        return null;
      }
      await sleep(CONFIRMATION_POLL_INTERVAL_MS);
    }
    return null;
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
          timeoutMs: 30000,
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

      let stripe;
      let elements;
      let paymentElement;
      try {
        // A direct-charge order's PaymentIntent lives in the connected
        // organizer's own Stripe account, not the platform's — Stripe.js
        // must be told that account via the `stripeAccount` option, or it
        // has no way to load/confirm a PaymentIntent it can't see. Omitted
        // entirely for a 'platform'-mode order (free event fallback),
        // whose PaymentIntent is on the platform account already.
        stripe = checkoutResult.stripe_account_id
          ? Stripe(document.body.dataset.stripePk, { stripeAccount: checkoutResult.stripe_account_id })
          : Stripe(document.body.dataset.stripePk);
        elements = stripe.elements({ clientSecret: checkoutResult.client_secret });
        paymentElement = elements.create('payment');
        paymentElement.mount(paymentContainer);
      } catch (err) {
        // Stripe(...) throws synchronously on a malformed publishable key —
        // without this catch, that exception was silently swallowed (an
        // unhandled rejection in this async click handler), leaving the
        // buyer looking at an empty page with no card form and no
        // explanation at all.
        errorContainer.appendChild(showError((err && err.message) || window.intaheT('event.payment_not_ready')));
        return;
      }

      const payBtn = document.createElement('button');
      payBtn.textContent = window.intaheT('event.pay_button');
      payBtn.style.marginTop = '16px';
      payBtn.disabled = true;
      paymentContainer.after(payBtn);

      // The Payment Element loads asynchronously inside its own iframe —
      // mount() returns immediately regardless of whether that load
      // actually succeeds. Without gating the pay button on 'ready', a
      // buyer could click "Payer" against a form that never finished
      // loading (blank card fields), and confirmPayment() would then have
      // nothing valid to submit. If 'ready' never fires within a few
      // seconds (network issue, ad blocker, restrictive proxy), tell the
      // buyer plainly instead of leaving a live-looking button that does
      // nothing useful.
      let paymentElementReady = false;
      const readyTimeout = setTimeout(function () {
        if (paymentElementReady) return;
        errorContainer.appendChild(showError(window.intaheT('event.payment_form_load_error')));
      }, 10000);
      paymentElement.on('ready', function () {
        paymentElementReady = true;
        clearTimeout(readyTimeout);
        payBtn.disabled = false;
      });
      paymentElement.on('loaderror', function () {
        clearTimeout(readyTimeout);
        errorContainer.appendChild(showError(window.intaheT('event.payment_form_load_error')));
      });

      payBtn.addEventListener('click', async function () {
        payBtn.disabled = true;
        payBtn.textContent = window.intaheT('event.pay_button_wait');
        errorContainer.textContent = '';

        // Only used if Stripe actually has to leave the page (e.g. an
        // off-site 3DS step) — redirect: 'if_required' resolves in place
        // otherwise, and the polling below picks up from there.
        const returnUrl = location.origin + '/events/' + eventId + '?lang=' + window.intaheLocale();

        // confirmPayment() is never force-cancelled here — a real
        // in-flight charge attempt must be allowed to finish rather than
        // being abandoned client-side. This only adds a visible note if
        // it's taking far longer than a normal confirmation (network
        // issue, blocked request), so "Paiement en cours..." never sits
        // there indefinitely with zero feedback.
        const slowNotice = setTimeout(function () {
          errorContainer.textContent = '';
          errorContainer.appendChild(showError(window.intaheT('event.payment_taking_long')));
        }, 15000);

        const { error } = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: returnUrl },
          redirect: 'if_required',
        });
        clearTimeout(slowNotice);
        errorContainer.textContent = '';

        if (error) {
          errorContainer.appendChild(showError(error.message || window.intaheT('event.payment_failed')));
          payBtn.disabled = false;
          payBtn.textContent = window.intaheT('event.pay_button');
          return;
        }

        payBtn.remove();
        paymentContainer.innerHTML = '';
        const waitingBox = document.createElement('div');
        waitingBox.className = 'success-box';
        waitingBox.textContent = window.intaheT('event.payment_confirming');
        paymentContainer.appendChild(waitingBox);

        const accessToken = await pollForTickets(eventId, checkoutResult.order.id);

        if (accessToken) {
          location.href =
            location.origin +
            '/events/' +
            eventId +
            '/orders/' +
            checkoutResult.order.id +
            '/tickets?token=' +
            encodeURIComponent(accessToken) +
            '&lang=' +
            window.intaheLocale();
          return;
        }

        waitingBox.textContent = window.intaheT('event.payment_succeeded');
      });
    });
  }

  main();
})();
