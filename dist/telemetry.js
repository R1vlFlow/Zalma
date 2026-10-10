/* Privacy-preserving client diagnostics with optional remote delivery. */
(function () {
  'use strict';
  var config = window.ZALMA_RUNTIME_CONFIG || {};
  var ERROR_KEY = 'almazov.client-errors.v1';
  var EVENT_KEY = 'almazov.client-events.v1';
  function safeRead(key) {
    try { var v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; }
    catch (_) { return []; }
  }
  function compact(value, max) {
    return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/https?:\/\/\S+/gi, '[url]')
      .replace(/(token|password|authorization|cookie)\s*[:=]\s*\S+/gi, '$1=[redacted]').slice(0, max);
  }
  function sendRemote(record) {
    var endpoint = String(config.errorEndpoint || '');
    if (!endpoint || !/^https:\/\//i.test(endpoint)) return;
    try {
      var body = JSON.stringify(record);
      if (navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))) return;
      fetch(endpoint, { method: 'POST', mode: 'cors', credentials: 'omit', keepalive: true,
        headers: { 'content-type': 'application/json' }, body: body }).catch(function () {});
    } catch (_) {}
  }
  function capture(kind, message, stack) {
    if (config.telemetryEnabled === false) return;
    var record = { at: new Date().toISOString(), kind: compact(kind, 40), message: compact(message, 500),
      stack: compact(stack, 1400), page: location.pathname, buildId: document.documentElement.dataset.buildId || 'unknown' };
    try {
      var rows = safeRead(ERROR_KEY); rows.push(record);
      localStorage.setItem(ERROR_KEY, JSON.stringify(rows.slice(-30)));
    } catch (_) {}
    sendRemote(record);
    try { window.dispatchEvent(new CustomEvent('zalma:client-error', { detail: { kind: record.kind } })); } catch (_) {}
  }
  window.addEventListener('error', function (event) {
    capture('error', event.message || 'Resource or script error', event.error && event.error.stack || '');
  });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    capture('unhandledrejection', reason && reason.message || reason || 'Unhandled promise rejection', reason && reason.stack || '');
  });
  window.zalmaTrack = function (name) {
    var eventName = compact(name, 64);
    try {
      var rows = safeRead(EVENT_KEY); rows.push({ at: Date.now(), name: eventName });
      localStorage.setItem(EVENT_KEY, JSON.stringify(rows.slice(-200)));
    } catch (_) {}
    if (typeof window.gtag === 'function' && /^G-[A-Z0-9]+$/.test(config.googleAnalyticsId || '')) {
      window.gtag('event', eventName);
    }
    if (typeof window.ym === 'function' && /^\d+$/.test(String(config.yandexMetrikaId || ''))) {
      window.ym(Number(config.yandexMetrikaId), 'reachGoal', eventName);
    }
  };
  function script(src) { var s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); }
  if (/^G-[A-Z0-9]+$/.test(config.googleAnalyticsId || '')) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date()); window.gtag('config', config.googleAnalyticsId, { anonymize_ip: true });
    script('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(config.googleAnalyticsId));
  }
  if (/^\d+$/.test(String(config.yandexMetrikaId || ''))) {
    var id = Number(config.yandexMetrikaId);
    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = Date.now(); window.ym(id, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });
    script('https://mc.yandex.ru/metrika/tag.js');
  }
  // Track only stable UI identifiers; never send names, task text, file names or form values.
  document.addEventListener('click', function (event) {
    var target = event.target instanceof Element ? event.target.closest('[data-page], [data-action]') : null;
    if (!target || !window.zalmaTrack) return;
    var page = target.getAttribute('data-page');
    var action = target.getAttribute('data-action');
    if (page && /^[a-z0-9_-]{1,40}$/i.test(page)) window.zalmaTrack('navigation_' + page.toLowerCase());
    else if (action && /^[a-z0-9_-]{1,40}$/i.test(action)) window.zalmaTrack('action_' + action.toLowerCase());
  }, true);
  window.addEventListener('appinstalled', function () { if (window.zalmaTrack) window.zalmaTrack('pwa_installed'); });
})();
