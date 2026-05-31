(function () {
  function getTokenSafe() {
    try {
      if (typeof getToken === 'function') return getToken() || '';
      return sessionStorage.getItem('token') || localStorage.getItem('token') || '';
    } catch (_) {
      return '';
    }
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value || '—';
  }

  function formatPlan(subscription) {
    if (!subscription) return 'Basic / Free';
    var tier = subscription.effectiveTier || subscription.tier || subscription.plan || subscription.planCode || subscription.plan_code || '';
    var status = subscription.status || subscription.subscription_status || '';
    var normalizedTier = String(tier || '').trim().toLowerCase();
    var label = (normalizedTier === 'business' || normalizedTier === 'v2')
      ? 'Pro'
      : String(tier || 'Basic').replace(/[_-]+/g, ' ');
    label = label.charAt(0).toUpperCase() + label.slice(1);
    if (status) label += ' · ' + String(status).replace(/[_-]+/g, ' ');
    return label;
  }

  async function loadStatus() {
    var token = getTokenSafe();
    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      var response = await fetch('/api/me', {
        headers: { Authorization: 'Bearer ' + token },
        credentials: 'include'
      });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!response.ok) throw new Error('Unable to load profile.');
      var profile = await response.json();
      var business = profile.active_business || profile.business || profile.current_business || {};
      setText('mobileActiveBusiness', business.name || profile.business_name || profile.activeBusinessName || 'Current workspace');
      setText('mobilePlanStatus', formatPlan(profile.subscription));
      var mfaEnabled = Boolean(profile.mfa_enabled || profile.mfaEnabled || profile.security?.mfa_enabled);
      setText('mobileSecurityStatus', mfaEnabled ? 'MFA on' : 'MFA not enabled');
    } catch (_) {
      setText('mobileActiveBusiness', 'Open full settings');
      setText('mobilePlanStatus', 'Open billing');
      setText('mobileSecurityStatus', 'Open security');
    }
  }

  document.addEventListener('DOMContentLoaded', loadStatus);
})();
