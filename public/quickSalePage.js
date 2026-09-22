(function () {
  var container = document.getElementById('quick-sale-container');
  var api = window.intaheSession.apiRequest;
  var t = window.intaheT;
  var orgId = location.pathname.split('/')[2];

  function formatPrice(cents, currency) {
    return new Intl.NumberFormat(window.intaheLocaleTag(), {
      style: 'currency',
      currency: (currency || 'usd').toUpperCase(),
    }).format(cents / 100);
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString(window.intaheLocaleTag());
  }

  function showError(parent, message) {
    var p = document.createElement('p');
    p.className = 'error';
    p.textContent = message;
    parent.appendChild(p);
  }

  function load() {
    container.textContent = '';
    var loader = document.createElement('div');
    loader.className = 'loader';
    container.appendChild(loader);

    Promise.all([api('/v1/organizations/' + orgId + '/quick-sale-items'), api('/v1/organizations/' + orgId + '/quick-sales')])
      .then(function (results) {
        render(results[0].items, results[1].items);
      })
      .catch(function () {
        container.textContent = '';
        showError(container, t('quick_sale.load_error'));
      });
  }

  function render(items, sales) {
    container.textContent = '';

    var backLink = document.createElement('a');
    backLink.href = '/organizations/' + orgId;
    backLink.textContent = t('quick_sale.back_button');
    container.appendChild(backLink);

    var title = document.createElement('h1');
    title.textContent = t('quick_sale.title');
    container.appendChild(title);

    var intro = document.createElement('p');
    intro.className = 'text-secondary';
    intro.textContent = t('quick_sale.intro');
    container.appendChild(intro);

    // Where the card form for whichever item was just clicked "Vendre" on
    // gets mounted — a fixed slot near the top rather than inline per-item,
    // so there's only ever one payment in flight at a time.
    var saleArea = document.createElement('div');
    saleArea.id = 'quick-sale-active';
    container.appendChild(saleArea);

    container.appendChild(renderCatalog(items, saleArea));
    container.appendChild(renderRecentSales(sales));
  }

  function renderCatalog(items, saleArea) {
    var wrap = document.createElement('div');
    wrap.style.marginTop = '24px';

    var heading = document.createElement('h2');
    heading.textContent = t('quick_sale.catalog_title');
    wrap.appendChild(heading);

    if (items.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'text-secondary';
      empty.textContent = t('quick_sale.catalog_empty');
      wrap.appendChild(empty);
    } else {
      items.forEach(function (item) {
        var card = document.createElement('div');
        card.className = 'card row';
        card.style.alignItems = 'center';
        card.style.marginBottom = '8px';

        var info = document.createElement('div');
        info.style.flex = '1';
        var name = document.createElement('strong');
        name.textContent = item.name;
        info.appendChild(name);
        var price = document.createElement('p');
        price.className = 'small text-secondary';
        price.style.margin = '2px 0 0';
        price.textContent = formatPrice(item.price_cents, item.currency);
        info.appendChild(price);
        card.appendChild(info);

        var sellBtn = document.createElement('button');
        sellBtn.type = 'button';
        sellBtn.textContent = t('quick_sale.sell_button');
        sellBtn.addEventListener('click', function () {
          startSale(item, saleArea);
        });
        card.appendChild(sellBtn);

        var deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'ghost small-btn';
        deleteBtn.textContent = '×';
        deleteBtn.addEventListener('click', function () {
          if (!confirm(t('quick_sale.delete_item_confirm'))) return;
          api('/v1/organizations/' + orgId + '/quick-sale-items/' + item.id, { method: 'DELETE' })
            .then(load)
            .catch(function () {
              showError(wrap, t('quick_sale.delete_item_error'));
            });
        });
        card.appendChild(deleteBtn);

        wrap.appendChild(card);
      });
    }

    var form = document.createElement('div');
    form.className = 'row';
    form.style.marginTop = '16px';
    form.innerHTML =
      '<input id="new-item-name" placeholder="' +
      t('quick_sale.item_name_label') +
      '" />' +
      '<input id="new-item-price" type="number" min="0.01" step="0.01" placeholder="' +
      t('quick_sale.item_price_label') +
      '" style="max-width: 120px;" />' +
      '<select id="new-item-currency" style="max-width: 90px;">' +
      '<option value="cad">' +
      t('quick_sale.item_currency_cad') +
      '</option>' +
      '<option value="usd">' +
      t('quick_sale.item_currency_usd') +
      '</option>' +
      '</select>';
    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = t('quick_sale.add_item_button');
    form.appendChild(addBtn);
    wrap.appendChild(form);

    var formError = document.createElement('div');
    wrap.appendChild(formError);

    addBtn.addEventListener('click', function () {
      formError.textContent = '';
      var name = form.querySelector('#new-item-name').value.trim();
      var priceCents = Math.round(Number(form.querySelector('#new-item-price').value) * 100);
      var currency = form.querySelector('#new-item-currency').value;
      if (!name || !Number.isFinite(priceCents) || priceCents < 1) return;
      addBtn.disabled = true;
      api('/v1/organizations/' + orgId + '/quick-sale-items', {
        method: 'POST',
        body: { name: name, price_cents: priceCents, currency: currency },
      })
        .then(load)
        .catch(function (err) {
          addBtn.disabled = false;
          showError(formError, err.message || t('quick_sale.create_item_error'));
        });
    });

    return wrap;
  }

  function renderRecentSales(sales) {
    var wrap = document.createElement('div');
    wrap.style.marginTop = '32px';

    var heading = document.createElement('h2');
    heading.textContent = t('quick_sale.recent_sales_title');
    wrap.appendChild(heading);

    if (sales.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'text-secondary';
      empty.textContent = t('quick_sale.recent_sales_empty');
      wrap.appendChild(empty);
      return wrap;
    }

    sales.forEach(function (sale) {
      var card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '8px';

      var headerRow = document.createElement('div');
      headerRow.className = 'row';
      headerRow.style.alignItems = 'center';
      var name = document.createElement('strong');
      name.style.flex = '1';
      name.textContent = sale.item_name + ' — ' + formatPrice(sale.total_cents, sale.currency);
      headerRow.appendChild(name);
      var statusBadge = document.createElement('span');
      statusBadge.className =
        sale.status === 'paid' ? 'badge' : sale.status === 'failed' ? 'badge badge-destructive' : 'badge badge-neutral';
      statusBadge.textContent = t('quick_sale.status_' + sale.status);
      headerRow.appendChild(statusBadge);
      card.appendChild(headerRow);

      var date = document.createElement('p');
      date.className = 'small text-secondary';
      date.style.margin = '4px 0 0';
      date.textContent = formatDate(sale.created_at);
      card.appendChild(date);

      if (sale.status === 'paid') {
        var payoutRow = document.createElement('div');
        payoutRow.className = 'row';
        payoutRow.style.alignItems = 'center';
        payoutRow.style.marginTop = '4px';
        var payoutLabel = document.createElement('span');
        payoutLabel.className = 'small text-secondary';
        payoutLabel.style.flex = '1';
        payoutLabel.textContent = t('quick_sale.payout_status_' + sale.payout_status);
        payoutRow.appendChild(payoutLabel);
        if (sale.payout_status === 'failed') {
          var retryBtn = document.createElement('button');
          retryBtn.type = 'button';
          retryBtn.className = 'small-btn';
          retryBtn.textContent = t('quick_sale.retry_payout_button');
          retryBtn.addEventListener('click', function () {
            retryBtn.disabled = true;
            api('/v1/organizations/' + orgId + '/quick-sales/' + sale.id + '/retry-payout', { method: 'POST' })
              .then(load)
              .catch(function () {
                retryBtn.disabled = false;
                showError(card, t('quick_sale.retry_payout_error'));
              });
          });
          payoutRow.appendChild(retryBtn);
        }
        card.appendChild(payoutRow);
      }

      wrap.appendChild(card);
    });

    return wrap;
  }

  function startSale(item, saleArea) {
    saleArea.textContent = '';
    var card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '16px';

    var heading = document.createElement('strong');
    heading.textContent = item.name + ' — ' + formatPrice(item.price_cents, item.currency);
    card.appendChild(heading);

    var errorContainer = document.createElement('div');
    card.appendChild(errorContainer);

    var status = document.createElement('p');
    status.className = 'small text-secondary';
    status.textContent = t('quick_sale.sell_button_wait');
    card.appendChild(status);

    saleArea.appendChild(card);

    api('/v1/organizations/' + orgId + '/quick-sales', { method: 'POST', body: { quick_sale_item_id: item.id } })
      .then(function (result) {
        status.remove();
        if (!result.client_secret) {
          showError(errorContainer, t('quick_sale.payment_not_ready'));
          return;
        }

        var sale = result.quick_sale;
        if (sale.total_cents !== sale.subtotal_cents) {
          var summary = document.createElement('div');
          summary.className = 'small text-secondary';
          summary.style.marginTop = '8px';
          var subtotalLine = document.createElement('p');
          subtotalLine.textContent = t('event.order_summary_subtotal', {
            amount: formatPrice(sale.subtotal_cents, sale.currency),
          });
          summary.appendChild(subtotalLine);
          (sale.tax_lines || []).forEach(function (taxLine) {
            var taxLineEl = document.createElement('p');
            taxLineEl.textContent = t('event.order_summary_tax_line', {
              label: taxLine.label,
              rate: taxLine.rate_percent,
              amount: formatPrice(taxLine.amount_cents, sale.currency),
            });
            summary.appendChild(taxLineEl);
          });
          var feesLine = document.createElement('p');
          feesLine.textContent = t('event.order_summary_fees', {
            amount: formatPrice(sale.total_cents - sale.subtotal_cents - sale.tax_cents, sale.currency),
          });
          summary.appendChild(feesLine);
          var totalLine = document.createElement('p');
          totalLine.style.fontWeight = 'bold';
          totalLine.textContent = t('event.order_summary_total', {
            amount: formatPrice(sale.total_cents, sale.currency),
          });
          summary.appendChild(totalLine);
          card.appendChild(summary);
        }

        var paymentContainer = document.createElement('div');
        paymentContainer.style.marginTop = '12px';
        card.appendChild(paymentContainer);

        // Same fix as public/event.js and manageEventPage.js: a direct
        // charge's PaymentIntent lives in the connected organizer's own
        // Stripe account, not the platform's — Stripe.js needs that
        // account via stripeAccount, or it has nothing valid to work
        // against.
        var stripe = result.quick_sale.stripe_account_id
          ? Stripe(document.body.dataset.stripePk, { stripeAccount: result.quick_sale.stripe_account_id })
          : Stripe(document.body.dataset.stripePk);
        var elements = stripe.elements({ clientSecret: result.client_secret });
        var paymentElement = elements.create('payment');
        paymentElement.mount(paymentContainer);

        var payBtn = document.createElement('button');
        payBtn.type = 'button';
        payBtn.textContent = t('quick_sale.pay_button');
        payBtn.style.marginTop = '12px';
        card.appendChild(payBtn);

        payBtn.addEventListener('click', function () {
          payBtn.disabled = true;
          payBtn.textContent = t('quick_sale.pay_button_wait');
          errorContainer.textContent = '';

          stripe
            .confirmPayment({ elements: elements, redirect: 'if_required' })
            .then(function (confirmResult) {
              if (confirmResult.error) {
                showError(errorContainer, confirmResult.error.message || t('quick_sale.payment_failed'));
                payBtn.disabled = false;
                payBtn.textContent = t('quick_sale.pay_button');
                return;
              }
              var success = document.createElement('p');
              success.className = 'success-box';
              success.textContent = t('quick_sale.payment_succeeded');
              card.appendChild(success);
              payBtn.remove();
              load();
            });
        });
      })
      .catch(function (err) {
        status.remove();
        showError(errorContainer, err.message || t('quick_sale.sell_error'));
      });
  }

  load();
})();
