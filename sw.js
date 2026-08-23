'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   sw.js — Chauffeur Empire Service Worker
   • Cache-first per asset statici (app shell offline)
   • Gestione push server → notifica browser
   • notificationclick → focus sulla tab del gioco
   ═══════════════════════════════════════════════════════════════════════ */

/* v3, 23/08/2026: la mappa non e' piu' Mapbox. La cache va invalidata o
   i browser che hanno il vecchio index.html continuano a chiedere
   api.mapbox.com, che ora la CSP blocca. */
const CACHE_NAME = 'ce-shell-v3';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/premium-ui.css',
  '/assets/ce-favicon.png',
  '/assets/ce-logo.png',
  '/assets/cities/bg_milano.jpg',
];

// ── Install: pre-cache app shell ─────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: rimuovi vecchie cache ──────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────
// NETWORK-FIRST per il codice che cambia ad ogni deploy (HTML/CSS/JS) → i
// giocatori ricevono SEMPRE l'ultima versione (niente più index.html stantio
// che caricava script vecchi). Fallback alla cache solo offline.
// CACHE-FIRST per media/font (cambiano di rado) → veloci + shell offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Esterni (Supabase/Mapbox/CDN): lascia gestire al browser.
  if (url.hostname !== self.location.hostname) return;

  const p = url.pathname;
  const isHTML = e.request.mode === 'navigate' || p === '/' || p.endsWith('.html');
  const isCode = p.endsWith('.js') || p.endsWith('.css');

  const putCopy = res => {
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, copy)).catch(() => {});
    }
    return res;
  };

  if (isHTML || isCode) {
    // network-first
    e.respondWith(
      fetch(e.request).then(putCopy).catch(() =>
        caches.match(e.request).then(cached => cached || caches.match('/index.html'))
      )
    );
    return;
  }
  // cache-first per il resto (immagini, font, audio…)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(putCopy))
  );
});

// ── Push: mostra notifica dal server ─────────────────────────────────────────
self.addEventListener('push', e => {
  let data = { title: 'Chauffeur Empire', body: 'Il tuo impero ti aspetta!', icon: '/assets/ce-favicon.png' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon || '/assets/ce-favicon.png',
      badge:   '/assets/ce-favicon.png',
      tag:     data.tag || 'ce-push',
      data:    data,
    })
  );
});

// ── Notification click: apri / focalizza la finestra del gioco ────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); return; }
      return self.clients.openWindow(target);
    })
  );
});
