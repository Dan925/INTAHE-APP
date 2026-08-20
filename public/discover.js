(function () {
  const statusEl = document.getElementById('status');
  const resultsEl = document.getElementById('results');
  const locateBtn = document.getElementById('locate-btn');

  function formatDate(iso) {
    return new Date(iso).toLocaleString('fr-CA', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  function renderEvents(events) {
    resultsEl.textContent = '';
    if (events.length === 0) {
      const p = document.createElement('p');
      p.className = 'text-secondary';
      p.textContent = 'Aucun événement découvrable pour le moment.';
      resultsEl.appendChild(p);
      return;
    }
    for (const event of events) {
      const link = document.createElement('a');
      link.className = 'card card-link';
      link.href = '/events/' + encodeURIComponent(event.id);

      const title = document.createElement('h2');
      title.textContent = event.name;
      link.appendChild(title);

      const date = document.createElement('p');
      date.className = 'small text-secondary';
      date.textContent = formatDate(event.start_at);
      link.appendChild(date);

      if (event.address) {
        const address = document.createElement('p');
        address.className = 'small text-secondary';
        address.textContent = event.address;
        link.appendChild(address);
      }

      if (typeof event.distance_km === 'number') {
        const distance = document.createElement('span');
        distance.className = 'badge';
        distance.textContent = event.distance_km.toFixed(1) + ' km';
        link.appendChild(distance);
      }

      resultsEl.appendChild(link);
    }
  }

  async function load(params) {
    resultsEl.innerHTML = '<div class="loader">Chargement…</div>';
    try {
      const query = params ? '?' + new URLSearchParams(params).toString() : '';
      const res = await fetch('/v1/discover/events' + query);
      const body = await res.json();
      if (!res.ok) throw new Error((body.error && body.error.message) || 'Erreur inconnue.');
      renderEvents(body.items);
    } catch (err) {
      resultsEl.textContent = '';
      const p = document.createElement('p');
      p.className = 'error';
      p.textContent = 'Impossible de charger les événements. ' + err.message;
      resultsEl.appendChild(p);
    }
  }

  locateBtn.addEventListener('click', function () {
    if (!('geolocation' in navigator)) {
      statusEl.innerHTML = '<p class="error">La géolocalisation n’est pas disponible sur cet appareil.</p>';
      return;
    }
    locateBtn.disabled = true;
    statusEl.innerHTML = '<p class="text-secondary small">Localisation en cours…</p>';
    navigator.geolocation.getCurrentPosition(
      function (position) {
        statusEl.textContent = '';
        locateBtn.disabled = false;
        load({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      function () {
        statusEl.innerHTML =
          '<p class="text-secondary small">Position refusée — affichage de tous les événements à venir.</p>';
        locateBtn.disabled = false;
      },
      { timeout: 10000 },
    );
  });

  load();
})();
