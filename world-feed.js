'use strict';
/* ════════════════════════════════════════════════════════════════════
   world-feed.js — "Mondo NCC" vivo
   Feed attività globale con SOLO eventi reali cross-player (tabella Supabase
   `global_news` + realtime). Nessun evento simulato: se il mondo è quiete,
   si vede la quiete — lo stato vuoto dedicato lo dice al giocatore.
   Il contatore online è solo il numero misurato dal server
   (window._worldRealOnline, scritto da ui-ranking.js): 0 se non c'è nulla.
   Esporta: window.renderWorldFeedHTML(), window._worldOnline()
   Caricato dopo engine.js (usa supabaseClient se presente).
   ════════════════════════════════════════════════════════════════════ */
(function () {
    // ── Pool nomi azienda (RIVALS reali + extra credibili) ────────────
    const NPC = [
        'Black Tie Chauffeurs', 'Royal Transports VIP', 'Milano Prestige Cars',
        'Elite Drive IT', 'Venezia Gondola VIP', 'Torino Luxury Drive',
        'NCC Napoli Express', 'Roma Transfer Srl', 'Sicilia Transfer Pro',
        'Costa Smeralda Limos', 'Dolomiti Executive', 'Firenze Noble Cars',
        'Adriatic Chauffeur Co', 'Lario Premium Drive', 'Capri Blue Transfers',
        'Aurelia Luxury NCC', 'Brera Black Cars', 'Trastevere VIP Lines',
        'Garda Elite Mobility', 'Etna Prestige Drive', 'Borghese Car Service',
        'Riviera Gold Transfers', 'Quirinale Executive', 'San Babila Limos',
    ];
    const PROV = ['Roma', 'Milano', 'Napoli', 'Venezia', 'Firenze', 'Catania',
        'Olbia', 'Genova', 'Torino', 'Bari', 'Como', 'Verona', 'Rimini',
        'Cortina', 'Portofino', 'Taormina', 'Forte dei Marmi'];

    const pick = a => a[Math.floor(Math.random() * a.length)];
    const rnd  = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
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
        } catch (e) { /* silenzioso: NPC riempiono comunque */ }
    }

    // ── Presenza: "N aziende online" — solo il numero reale dal server ─
    // ui-ranking.js scrive window._worldRealOnline contando le righe con
    // last_active fresche ricevute dal server. Nessuna base simulata: se il
    // server non misura nulla, il numero mostrato è 0 — mai inventato qui.
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

    // ── Conflitto del giorno (minaccia/opportunità) ───────────────────
    // NPC-driven ma agganciato allo stato reale del giocatore → urgenza + FOMO.
    window.renderConflictHTML = function () {
        const gs = window.gameState; if (!gs) return '';
        const hubs   = (gs.ownedHubs || []).length;
        const myDrv  = (gs.drivers || []).filter(d => d.id !== 'ceo');
        const best   = myDrv.slice().sort((a, b) => (b.level || 0) - (a.level || 0) || (b.xp || 0) - (a.xp || 0))[0];
        const rival  = pick(NPC);
        const prov   = pick(PROV);
        const hrs    = rnd(3, 9);

        // scegli lo scenario in base a cosa il giocatore ha da perdere/guadagnare
        let scn;
        const roll = (gs.day || 1) % 3;
        if (hubs > 0 && roll === 0) {
            scn = { type: 'threat', ic: '⚔️', accent: '#db5746', bg: 'linear-gradient(120deg,#2a1714,#3a1c18)',
                kicker: 'Minaccia in arrivo', title: `${esc(rival)} prepara un'OPA ostile su un tuo hub`,
                sub: `Hai ~${hrs}h per rinforzare la posizione prima dell'offerta.`,
                cta: `Difendi nella War Room →`, tab: 'provinces' };
        } else if (best && roll === 1) {
            scn = { type: 'poach', ic: '🎯', accent: '#e0922e', bg: 'linear-gradient(120deg,#2a2114,#3a2c18)',
                kicker: 'Caccia ai talenti', title: `${esc(rival)} ha messo gli occhi su ${esc(best.name)}`,
                sub: `Aumenta morale/stipendio o rischi di perderlo a fine giornata.`,
                cta: `Gestisci lo staff →`, tab: 'staff' };
        } else {
            scn = { type: 'opp', ic: '🏴', accent: '#c79a2a', bg: 'linear-gradient(120deg,#1c2433,#243043)',
                kicker: 'Opportunità del giorno', title: `${rnd(2, 6)} province libere intorno a ${prov}`,
                sub: `Conquista territorio ora: incassi una % su ogni corsa che vi transita.`,
                cta: `Espanditi nella War Room →`, tab: 'provinces' };
        }

        return `
        <div style="border-radius:9px;background:${scn.bg};border:1px solid ${scn.accent}55;padding:11px 14px;margin-bottom:7px;display:flex;align-items:center;gap:13px;color:#fff;position:relative;overflow:hidden">
            <div style="font-size:26px;line-height:1;flex-shrink:0">${scn.ic}</div>
            <div style="flex:1;min-width:0">
                <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${scn.accent}">${scn.kicker}</div>
                <div style="font-size:14px;font-weight:800;margin-top:1px;line-height:1.2">${scn.title}</div>
                <div style="font-size:10.5px;color:#c4cdd8;margin-top:2px">${scn.sub}</div>
            </div>
            <button ${ceAct('switchTab', [scn.tab])} style="flex-shrink:0;background:${scn.accent};color:#fff;border:none;border-radius:7px;padding:9px 14px;font-size:11.5px;font-weight:800;cursor:pointer;white-space:nowrap">${scn.cta}</button>
        </div>`;
    };

    // ── Avvio ─────────────────────────────────────────────────────────
    function boot() { loadReal(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
