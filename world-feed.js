'use strict';
/* ════════════════════════════════════════════════════════════════════
   world-feed.js — "Mondo NCC" vero
   Feed di eventi REALI cross-player (tabella Supabase `global_news` + realtime).
   Decisione del 22/08 (playtest Vlad): niente eventi simulati spacciati per
   reali e niente numeri finti — se il server non ha nulla da raccontare la
   home mostra lo stato vuoto, e il contatore online vale solo la presenza
   reale letta dalla classifica (ui-ranking.js → window._worldRealOnline).
   Esporta: window.renderWorldFeedHTML(), window._worldOnline()
   Caricato dopo engine.js (usa supabaseClient se presente).
   ════════════════════════════════════════════════════════════════════ */
(function () {
    const esc  = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // ── Mappa messaggio reale → icona ─────────────────────────────────
    function mapReal(msg) {
        const m = (msg || '').toLowerCase();
        if (m.includes('conquist') || m.includes('provinc')) return { i: '🏴', bg: '#fff3cf' };
        if (m.includes('opa') || m.includes('ostil'))        return { i: '⚔️', bg: '#fde8e4' };
        if (m.includes('diamond'))                            return { i: '💎', bg: '#ece4f7' };
        if (m.includes('governator'))                         return { i: '🏛️', bg: '#e7f6ee' };
        if (m.includes('auto') || m.includes('flotta') || m.includes('acquis')) return { i: '🚗', bg: '#e7f0fb' };
        if (m.includes('milion') || m.includes('€') || m.includes('liquidit')) return { i: '💰', bg: '#e7f6ee' };
        return { i: '📢', bg: '#e7f0fb' };
    }

    // ── Stato feed ────────────────────────────────────────────────────
    const FEED = [];          // {i,bg,x,ts,real}
    window._worldFeed = FEED;
    function add(ev, real) {
        ev.ts = Date.now();
        ev.real = !!real;
        FEED.unshift(ev);
        if (FEED.length > 50) FEED.length = 50;
    }

    // Niente seed: a feed vuoto la home mostra lo stato vuoto. Riempirlo con
    // eventi inventati era esattamente il difetto beccato nel playtest.

    // ── Eventi REALI da Supabase global_news (best-effort) ────────────
    async function loadReal() {
        try {
            if (!window.supabaseClient) return;
            const { data } = await window.supabaseClient
                .from('global_news').select('message,created_at')
                .order('created_at', { ascending: false }).limit(8);
            (data || []).reverse().forEach(r => {
                const mr = mapReal(r.message);
                add({ i: mr.i, bg: mr.bg, x: esc(r.message) }, true);
            });
            FEED.sort((a, b) => b.ts - a.ts);
            // realtime: nuovi eventi reali in cima
            window.supabaseClient.channel('world_feed_rt')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_news' },
                    payload => {
                        const msg = payload?.new?.message;
                        if (!msg) return;
                        const mr = mapReal(msg);
                        add({ i: mr.i, bg: mr.bg, x: esc(msg) }, true);
                    })
                .subscribe();
        } catch (e) { /* silenzioso: senza rete il feed resta vuoto e lo dice */ }
    }

    // ── Presenza: "N aziende online" — SOLO il numero vero ────────────
    // Il valore lo scrive ui-ranking.js leggendo `last_active` dal server
    // (window._worldRealOnline). Qui dentro non si calcola nulla: prima c'era
    // una curva locale che produceva il «137 ONLINE» finto del playtest.
    function onlineCount() {
        return window._worldRealOnline || 0;
    }
    window._worldOnline = onlineCount;

    // ── "tempo fa" compatto ───────────────────────────────────────────
    function ago(ts) {
        const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        if (s < 45) return 'ora';
        if (s < 3600) return Math.floor(s / 60) + 'm fa';
        if (s < 86400) return Math.floor(s / 3600) + 'h fa';
        return Math.floor(s / 86400) + 'g fa';
    }

    // ── Render HTML (newest first) per la colonna destra della home ───
    window.renderWorldFeedHTML = function (limit) {
        const n = limit || 7;
        if (!FEED.length) return `<div class="em-empty">Il mondo NCC si sta svegliando…</div>`;
        return FEED.slice(0, n).map(e => `
            <div class="em-ev">
                <div class="em-evi" style="background:${e.bg};font-size:14px;line-height:1">${e.i}</div>
                <div style="flex:1;min-width:0">
                    <div class="em-evt" style="white-space:normal;line-height:1.35">${e.x}</div>
                    <div class="em-evd">${ago(e.ts)}${e.real ? ' · <span style="color:var(--em-green-d);font-weight:700">live</span>' : ''}</div>
                </div>
            </div>`).join('');
    };

    // ── Avvio ─────────────────────────────────────────────────────────
    // Solo eventi reali: niente generatore NPC da avviare.
    function boot() { loadReal(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
