(function () {
  var container = document.getElementById('stripe-connect-return-container');
  var t = window.intaheT;

  // Stripe's return_url/refresh_url are static, organization-agnostic
  // paths (set once in STRIPE_CONNECT_RETURN_URL/REFRESH_URL) — the
  // organization id was stashed in sessionStorage right before redirecting
  // to Stripe (see organizationDetailPage.js's connect button) so this
  // page can send the owner back to the right place either way.
  var orgId = null;
  try {
    orgId = sessionStorage.getItem('intahe.stripeConnectOrgId');
  } catch (e) {
    orgId = null;
  }

  container.textContent = '';

  if (orgId) {
    var message = document.createElement('p');
    message.textContent = t('stripe_connect_return.message');
    container.appendChild(message);
    location.href = '/organizations/' + orgId;
    return;
  }

  var noOrg = document.createElement('p');
  noOrg.className = 'text-secondary';
  noOrg.textContent = t('stripe_connect_return.no_org_message');
  container.appendChild(noOrg);

  var link = document.createElement('a');
  link.href = '/organizations';
  link.textContent = t('stripe_connect_return.organizations_link');
  container.appendChild(link);
})();
