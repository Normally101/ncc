'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   push-notifications.js — Chauffeur Empire
   PWA / notifiche di ritorno:
   1. Registra il service worker
   2. Chiede il permesso notifiche al primo login (non-intrusivo)
   3. Schedula una notifica "ritorna a giocare" se il giocatore resta offline
   4. Cancella le notifiche pendenti al ritorno (cleanup)

   Caricato dopo auth.js — si aggancia a window._onAuthSuccess via hook.
   NON dipende da server VAPID: usa browser Notification API locale.
   ═══════════════════════════════════════════════════════════════════════════ */

(function() {
  // ── Registrazione Service Worker ──────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => { window._swReg = reg; })
      .catch(() => {}); // silenzioso su http:// locale
  }

  // ── Chiedi permesso (dopo login, una volta sola) ──────────────────────────
  window._ceRequestNotifPerm = async function() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return _ceScheduleReturnNotif();
    if (Notification.permission === 'denied') return;
    // Mostra solo se l'utente è stato in gioco per almeno 90s (non sub-second popup)
    setTimeout(async () => {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') _ceScheduleReturnNotif();
    }, 90000); // 90s dopo il login
  };

  // ── Schedula notifica di ritorno ─────────────────────────────────────────
  // Se il giocatore non torna entro 22h, notifica.
  // La notifica viene cancellata al ritorno tramite _ceClearReturnNotif().
  const RETURN_KEY = 'ce_return_notif_at';
  const DELAY_MS   = 22 * 60 * 60 * 1000; // 22 ore

  window._ceScheduleReturnNotif = function() {
    if (Notification.permission !== 'granted') return;
    // Cancella eventuale precedente
    _ceClearReturnNotif();
    const fireAt = Date.now() + DELAY_MS;
    localStorage.setItem(RETURN_KEY, String(fireAt));
    const remaining = fireAt - Date.now();
    window._ceReturnNotifTimeout = setTimeout(_ceSendReturnNotif, remaining);
  };

  window._ceClearReturnNotif = function() {
    if (window._ceReturnNotifTimeout) {
      clearTimeout(window._ceReturnNotifTimeout);
      window._ceReturnNotifTimeout = null;
    }
    localStorage.removeItem(RETURN_KEY);
  };

  function _ceSendReturnNotif() {
    if (Notification.permission !== 'granted') return;
    const name = (typeof gameState !== 'undefined' && gameState.companyName) || 'Chauffeur Empire';
    const cash = (typeof gameState !== 'undefined') ? `€${(gameState.cash||0).toLocaleString('it')}` : '';
    new Notification('🚗 ' + name + ' ti aspetta', {
      body:  `Le tue corse continuano — ${cash ? 'hai ' + cash + ' in cassa. ' : ''}Torna a guidare l'impero.`,
      icon:  '/assets/ce-favicon.png',
      badge: '/assets/ce-favicon.png',
      tag:   'ce-return',
    });
  }

  // ── Al ritorno: cancella notifiche pending + reschedula ──────────────────
  function _ceOnReturn() {
    _ceClearReturnNotif();
    // Cancella la notifica "ritorna" se l'utente l'ha visto nel notification center
    if ('serviceWorker' in navigator && window._swReg) {
      window._swReg.getNotifications({ tag: 'ce-return' }).then(ns => ns.forEach(n => n.close()));
    }
    // Reschedula per il prossimo logout/inattività
    if (Notification.permission === 'granted') _ceScheduleReturnNotif();
  }

  // Ascolta visibilità pagina — "tornato al gioco" = tab torna visibile
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) _ceOnReturn();
  });

  // ── Check notifiche salvate in localStorage al load ──────────────────────
  // Se il browser è stato chiuso e riaperto, la notifica schedulata via timeout
  // è persa — ripristina dal timestamp salvato
  (function _ceMaybeRestoreNotif() {
    const savedAt = parseInt(localStorage.getItem(RETURN_KEY) || '0', 10);
    if (!savedAt) return;
    const remaining = savedAt - Date.now();
    if (remaining <= 0) {
      // Era già prevista — se l'utente è tornato adesso, pulisci
      localStorage.removeItem(RETURN_KEY);
    } else {
      window._ceReturnNotifTimeout = setTimeout(_ceSendReturnNotif, remaining);
    }
  })();

  // ── Hook su _onAuthSuccess (auth.js) ─────────────────────────────────────
  // auth.js chiama window._onAuthSuccessHooks (se esiste) dopo il login
  if (!window._onAuthSuccessHooks) window._onAuthSuccessHooks = [];
  window._onAuthSuccessHooks.push(function() {
    window._ceRequestNotifPerm();
    window._ceScheduleReturnNotif();
  });

})();
