(function () {
  const container = document.getElementById('tickets-container');
  const pathParts = location.pathname.split('/'); // '', events, :eventId, orders, :orderId, tickets
  const eventId = pathParts[2];
  const orderId = pathParts[4];
  const buyerEmail = new URLSearchParams(location.search).get('buyer_email');

  async function main() {
    container.textContent = '';

    const title = document.createElement('h1');
    title.textContent = 'Mes billets';
    container.appendChild(title);

    let items;
    try {
      const query = buyerEmail ? '?buyer_email=' + encodeURIComponent(buyerEmail) : '';
      const res = await fetch('/v1/events/' + eventId + '/orders/' + orderId + '/tickets' + query);
      const body = await res.json();
      if (!res.ok) throw new Error((body.error && body.error.message) || 'Erreur inconnue.');
      items = body.items;
    } catch (err) {
      const p = document.createElement('p');
      p.className = 'error';
      p.textContent =
        'Impossible de charger les billets (le paiement n’a peut-être pas encore été confirmé — réessaie dans quelques secondes). ' +
        err.message;
      container.appendChild(p);
      return;
    }

    if (items.length === 0) {
      const p = document.createElement('p');
      p.className = 'text-secondary';
      p.textContent =
        'Aucun billet pour l’instant — si tu viens de payer, le paiement est peut-être encore en cours de confirmation. Recharge la page dans quelques secondes.';
      container.appendChild(p);
      return;
    }

    for (const ticket of items) {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.textAlign = 'center';

      const name = document.createElement('strong');
      name.textContent = ticket.ticket_type_name;
      card.appendChild(name);

      const img = document.createElement('img');
      img.src = ticket.qr_code_image;
      img.alt = 'QR code du billet';
      img.style.width = '200px';
      img.style.height = '200px';
      img.style.display = 'block';
      img.style.margin = '12px auto';
      card.appendChild(img);

      const code = document.createElement('p');
      code.className = 'small text-secondary';
      code.style.fontFamily = 'ui-monospace, monospace';
      code.style.userSelect = 'all';
      code.textContent = ticket.qr_code;
      card.appendChild(code);

      const status = document.createElement('span');
      status.className = 'badge';
      status.textContent = ticket.checked_in_at ? 'Scanné' : 'Pas encore scanné';
      card.appendChild(status);

      container.appendChild(card);
    }
  }

  main();
})();
