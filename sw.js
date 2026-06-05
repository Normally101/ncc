'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   sw.js — Chauffeur Empire Service Worker
   • Cache-first per asset statici (app shell offline)
   • Gestione push server → notifica browser
   • notificationclick → focus sulla tab del gioco
   ═══════════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'ce-shell-v1';
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

// ── Fetch: cache-first per asset statici, network-first per API ──────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Passa al network le chiamate Supabase/Mapbox/API esterne
  if (url.hostname !== self.location.hostname) return;
  // Cache-first per asset statici
  if (e.request.method === 'GET') {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
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
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    })
  );
});
