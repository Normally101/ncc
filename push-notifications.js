'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   push-notifications.js — Chauffeur Empire
   PWA / notifiche di ritorno. Due livelli, con degradazione graziosa:

   ① SERVER PUSH (VAPID) — preferito quando disponibile:
      - pushManager.subscribe() con la chiave pubblica VAPID (config.js)
      - salva la subscription in Supabase (`push_subscriptions`, RLS per-utente)
      - heartbeat `last_seen` su login + ritorno tab
      - l'Edge Function `send-push` (cron orario) notifica gli inattivi >22h
      → funziona anche a browser CHIUSO (vero push del SO)

   ② FALLBACK LOCALE (Notification API + setTimeout) — quando il push server
      non è disponibile (permesso negato, niente VAPID key, iOS PWA non installata,
      subscribe fallito). Notifica solo se la tab è viva in background.

   Caricato dopo auth.js — si aggancia a window._onAuthSuccessHooks.
   ═══════════════════════════════════════════════════════════════════════════ */

(function() {
  const RETURN_KEY = 'ce_return_notif_at';
  const DELAY_MS   = 22 * 60 * 60 * 1000; // 22 ore
  let   _serverPushActive = false;        // true se la subscription server è viva

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    const out     = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function _bufToB64url(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function _currentUserId() {
    try {
      if (!window.supabaseClient) return null;
      const { data } = await window.supabaseClient.auth.getSession();
      return data?.session?.user?.id || null;
    } catch { return null; }
  }

  // ── Registrazione Service Worker ──────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => { window._swReg = reg; })
      .catch(() => {}); // silenzioso su http:// locale
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ① SERVER PUSH (VAPID)
  // ─────────────────────────────────────────────────────────────────────────

  // Sottoscrive il push server e salva la subscription su Supabase.
  // Ritorna true se la subscription server è attiva.
  window._cePushSubscribe = async function() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
      const vapid = window.GAME_CONFIG && window.GAME_CONFIG.VAPID_PUBLIC_KEY;
      if (!vapid) return false; // nessuna chiave configurata → fallback locale
      if (Notification.permission !== 'granted') return false;

      const reg = window._swReg || await navigator.serviceWorker.ready;
      if (!reg || !reg.pushManager) return false;

      // Riusa la subscription esistente se presente, altrimenti creane una nuova.
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: _urlBase64ToUint8Array(vapid),
        });
      }

      const ok = await _ceStoreSubscription(sub);
      _serverPushActive = ok;
      return ok;
    } catch (e) {
      // NotAllowedError, AbortError, ecc. → fallback locale
      return false;
    }
  };

  // Upsert della subscription nella tabella push_subscriptions (RLS per-utente).
  async function _ceStoreSubscription(sub) {
    try {
      const userId = await _currentUserId();
      if (!userId || !window.supabaseClient) return false;
      const json = sub.toJSON();
      const p256dh = (json.keys && json.keys.p256dh) || _bufToB64url(sub.getKey('p256dh'));
      const auth   = (json.keys && json.keys.auth)   || _bufToB64url(sub.getKey('auth'));
      if (!sub.endpoint || !p256dh || !auth) return false;

      const { error } = await window.supabaseClient
        .from('push_subscriptions')
        .upsert({
          user_id:   userId,
          endpoint:  sub.endpoint,
          p256dh:    p256dh,
          auth:      auth,
          last_seen: new Date().toISOString(),
        }, { onConflict: 'endpoint' });
      return !error;
    } catch { return false; }
  }

  // Heartbeat: aggiorna last_seen della subscription corrente (esce dalla finestra
  // "inattivo" → il cron non lo notifica mentre sta giocando).
  window._cePushHeartbeat = async function() {
    try {
      if (!_serverPushActive || !window.supabaseClient) return;
      const reg = window._swReg || await navigator.serviceWorker.ready;
      const sub = reg && reg.pushManager && await reg.pushManager.getSubscription();
      if (!sub) return;
      await window.supabaseClient
        .from('push_subscriptions')
        .update({ last_seen: new Date().toISOString() })
        .eq('endpoint', sub.endpoint);
    } catch {}
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ② FALLBACK LOCALE (solo se il server push NON è attivo)
  // ─────────────────────────────────────────────────────────────────────────

  window._ceScheduleReturnNotif = function() {
    if (_serverPushActive) return;                       // il server gestisce tutto
    if (Notification.permission !== 'granted') return;
    _ceClearReturnNotif();
    const fireAt = Date.now() + DELAY_MS;
    localStorage.setItem(RETURN_KEY, String(fireAt));
    window._ceReturnNotifTimeout = setTimeout(_ceSendReturnNotif, fireAt - Date.now());
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
      icon:  'assets/ce-favicon.png',
      badge: 'assets/ce-favicon.png',
      tag:   'ce-return',
    });
  }

  // ── Richiesta permesso (dopo login, una volta sola) ───────────────────────
  window._ceRequestNotifPerm = async function() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'denied') return;
    if (Notification.permission === 'granted') {
      // Già concesso (utente di ritorno): sottoscrivi subito + heartbeat.
      const ok = await window._cePushSubscribe();
      if (ok) window._cePushHeartbeat(); else window._ceScheduleReturnNotif();
      return;
    }
    // 'default' → chiedi solo dopo 90s di gioco reale (non popup sub-second).
    setTimeout(async () => {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
      const ok = await window._cePushSubscribe();
      if (ok) window._cePushHeartbeat(); else window._ceScheduleReturnNotif();
    }, 90000);
  };

  // ── Al ritorno alla tab: heartbeat + pulizia notifiche pending ────────────
  function _ceOnReturn() {
    if (_serverPushActive) {
      window._cePushHeartbeat();
    } else {
      _ceClearReturnNotif();
      _ceScheduleReturnNotif();
    }
    // Chiudi la notifica "ritorna" eventualmente ancora nel centro notifiche.
    if ('serviceWorker' in navigator && window._swReg && window._swReg.getNotifications) {
      window._swReg.getNotifications({ tag: 'ce-return' }).then(ns => ns.forEach(n => n.close())).catch(() => {});
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) _ceOnReturn();
  });

  // ── Ripristino fallback locale al load (timeout perso a tab chiusa) ────────
  (function _ceMaybeRestoreNotif() {
    const savedAt = parseInt(localStorage.getItem(RETURN_KEY) || '0', 10);
    if (!savedAt) return;
    const remaining = savedAt - Date.now();
    if (remaining <= 0) localStorage.removeItem(RETURN_KEY);
    else window._ceReturnNotifTimeout = setTimeout(_ceSendReturnNotif, remaining);
  })();

  // ── Hook su _onAuthSuccess (auth.js) ──────────────────────────────────────
  if (!window._onAuthSuccessHooks) window._onAuthSuccessHooks = [];
  window._onAuthSuccessHooks.push(function() {
    window._ceRequestNotifPerm();
  });

})();
