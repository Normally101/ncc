'use strict';
/* ════════════════════════════════════════════════════════════════════
   vanity.js — Tab "Prestigio": cosmetici di status acquistabili in DC.
   Stemma aziendale (visibile agli altri nel feed/broadcast), colore
   azienda premium, titolo onorifico. Sink di DC puro, niente vantaggio
   di gioco → monetizzazione "status" pulita per il fantasy luxury.
   ════════════════════════════════════════════════════════════════════ */
(function () {
    const EMBLEMS = [
        { e: '👁️', c: 0 }, { e: '⚜️', c: 5 }, { e: '👑', c: 8 }, { e: '🦅', c: 8 },
        { e: '🛡️', c: 6 }, { e: '⭐', c: 5 }, { e: '💎', c: 12 }, { e: '♛', c: 10 },
        { e: '🔱', c: 10 }, { e: '🦁', c: 12 }, { e: '🏆', c: 15 }, { e: '🌐', c: 8 },
        { e: '🐎', c: 8 }, { e: '⚓', c: 6 }, { e: '🌟', c: 10 }, { e: '🔥', c: 9 },
    ];
    const COLORS = [
        { n: 'Oro',         v: '#c79a2a', c: 0 },  { n: 'Platino',     v: '#8aa0b5', c: 6 },
        { n: 'Cremisi',     v: '#c0392b', c: 6 },  { n: 'Zaffiro',     v: '#2f74c0', c: 6 },
        { n: 'Smeraldo',    v: '#1aa06a', c: 6 },  { n: 'Ossidiana',   v: '#2b2f36', c: 10 },
        { n: 'Viola Reale', v: '#7c5fc9', c: 8 },  { n: 'Rosa Oro',    v: '#d98aa0', c: 10 },
    ];
    const TITLES = [
        { t: 'Imprenditore', c: 0 }, { t: 'Magnate', c: 8 }, { t: 'Barone della Strada', c: 12 },
        { t: 'Tycoon del Lusso', c: 18 }, { t: 'Sua Eccellenza', c: 25 },
    ];

    const dc = () => (window.gameState && gameState.driverCoins) || 0;

    function _ensure() {
        const gs = window.gameState; if (!gs) return;
        if (!gs.ownedEmblems) gs.ownedEmblems = ['👁️'];
        if (!gs.ownedColors)  gs.ownedColors  = ['#c79a2a'];
        if (!gs.ownedTitles)  gs.ownedTitles  = ['Imprenditore'];
        if (!gs.companyLogo)  gs.companyLogo  = '👁️';
        if (!gs.companyColor) gs.companyColor = '#c79a2a';
        if (!gs.companyTitle) gs.companyTitle = 'Imprenditore';
    }

    function _applyBrand() {
        const gs = window.gameState; if (!gs) return;
        const bm = document.querySelector('.emc-bm'); if (bm) bm.textContent = gs.companyLogo || 'CE';
        if (typeof window._applyBrandColor === 'function') { try { window._applyBrandColor(gs.companyColor); } catch (e) {} }
    }
    window._vanityApplyBrand = _applyBrand;   // chiamabile al boot per ripristinare lo stemma

    window.renderTabPrestigio = function () {
        const c = document.getElementById('tab-container'); if (!c) return;
        _ensure();
        const gs = gameState;

        const emblemCell = it => {
            const owned = gs.ownedEmblems.includes(it.e);
            const equipped = gs.companyLogo === it.e;
            return `<button ${ceAct('_vanityEmblem', [it.e])}
                style="aspect-ratio:1;border-radius:10px;border:2px solid ${equipped ? 'var(--em-gold)' : 'var(--em-line)'};background:${equipped ? '#fff8e8' : '#fff'};font-size:24px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;position:relative">
                ${it.e}
                <span style="font-size:8px;font-weight:800;color:${equipped ? 'var(--em-gold)' : owned ? 'var(--em-green-d)' : 'var(--em-muted)'}">${equipped ? 'IN USO' : owned ? 'Equipaggia' : '🪙 ' + it.c}</span>
            </button>`;
        };
        const colorCell = it => {
            const owned = gs.ownedColors.includes(it.v);
            const equipped = gs.companyColor === it.v;
            return `<button ${ceAct('_vanityColor', [it.v])}
                style="border-radius:9px;border:2px solid ${equipped ? 'var(--em-ink)' : 'var(--em-line)'};background:#161b22;cursor:pointer;padding:8px;display:flex;align-items:center;gap:8px">
                <span style="width:22px;height:22px;border-radius:6px;background:${it.v};flex-shrink:0;border:1px solid rgba(0,0,0,.1)"></span>
                <span style="flex:1;text-align:left"><span style="font-weight:700;font-size:11.5px;color:var(--em-ink)">${it.n}</span></span>
                <span style="font-size:9px;font-weight:800;color:${equipped ? 'var(--em-ink)' : owned ? 'var(--em-green-d)' : 'var(--em-muted)'}">${equipped ? 'IN USO' : owned ? '✓' : '🪙 ' + it.c}</span>
            </button>`;
        };
        const titleCell = it => {
            const owned = gs.ownedTitles.includes(it.t);
            const equipped = gs.companyTitle === it.t;
            return `<button ${ceAct('_vanityTitle', [it.t])}
                style="border-radius:9px;border:2px solid ${equipped ? 'var(--em-gold)' : 'var(--em-line)'};background:${equipped ? '#fff8e8' : '#fff'};cursor:pointer;padding:9px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px">
                <span style="font-weight:800;font-size:12px;color:${equipped ? 'var(--em-gold)' : 'var(--em-ink)'}">${it.t}</span>
                <span style="font-size:9px;font-weight:800;color:${equipped ? 'var(--em-gold)' : owned ? 'var(--em-green-d)' : 'var(--em-muted)'}">${equipped ? 'IN USO' : owned ? 'Equipaggia' : '🪙 ' + it.c}</span>
            </button>`;
        };

        c.innerHTML = `<div class="em em-page"><div class="em-wrap">
            <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:10px">
                <div>
                    <div class="em-sec">Status &amp; Prestigio</div>
                    <div style="font-size:20px;font-weight:800;margin-top:3px">Vetrina Prestigio</div>
                    <div style="font-size:11px;color:var(--em-muted);margin-top:3px">Distingui la tua azienda. Lo stemma è visibile agli altri nel feed globale.</div>
                </div>
                <div class="em-pill em-pill--gold" style="font-size:12px;padding:6px 12px">🪙 ${dc()} DC</div>
            </div>

            <div class="em-card" style="margin-bottom:7px;padding:14px 16px;display:flex;align-items:center;gap:14px;background:linear-gradient(120deg,#243243,#19222e);border:none">
                <div style="font-size:38px;line-height:1">${gs.companyLogo}</div>
                <div>
                    <div style="font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7fd6a0">Anteprima</div>
                    <div style="font-size:18px;font-weight:800;color:${gs.companyColor}">${(gameState.companyName || 'Chauffeur Empire')}</div>
                    <div style="font-size:11px;color:#9fb1c2">${gs.companyTitle}</div>
                </div>
            </div>

            <div class="em-card" style="margin-bottom:7px">
                <div class="em-ch"><span class="t">🛡️ Stemma Aziendale</span><span class="a" style="color:var(--em-muted)">visibile agli altri</span></div>
                <div style="padding:12px;display:grid;grid-template-columns:repeat(8,1fr);gap:8px">${EMBLEMS.map(emblemCell).join('')}</div>
            </div>

            <div class="em-card" style="margin-bottom:7px">
                <div class="em-ch"><span class="t">🎨 Colore Azienda</span></div>
                <div style="padding:12px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${COLORS.map(colorCell).join('')}</div>
            </div>

            <div class="em-card" style="margin-bottom:7px">
                <div class="em-ch"><span class="t">🎖️ Titolo Onorifico</span></div>
                <div style="padding:12px;display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${TITLES.map(titleCell).join('')}</div>
            </div>

            <div class="em-card" style="padding:13px 15px;display:flex;align-items:center;justify-content:space-between;gap:12px">
                <div><div style="font-weight:700">🏴 Targa Nera Presidenziale</div><div style="font-size:10.5px;color:var(--em-muted);margin-top:1px">${gameState.hasPrestigiousPlate ? 'Già applicata — prestigio massimo.' : 'Cosmetico esclusivo · sblocca clienti d\'élite.'}</div></div>
                ${gameState.hasPrestigiousPlate
                    ? `<span class="em-pill em-pill--gold">Posseduta</span>`
                    : `<button class="em-goldbtn" ${ceAct('ceTargaPresidenziale', [])}>🪙 500 DC</button>`}
            </div>

            <div style="text-align:center;font-size:10px;color:var(--em-dim);margin-top:10px">I cosmetici sono puro status: nessun vantaggio di gioco. Servono DC — acquistabili nell'<span class="em-link" ${ceAct('switchTab', ['store'])}>Executive Club</span>.</div>
        </div></div>`;
    };

    // ── acquisto/equip ────────────────────────────────────────────────
    window._vanityEmblem = function (e) {
        _ensure();
        const it = EMBLEMS.find(x => x.e === e); if (!it) return;
        if (!gameState.ownedEmblems.includes(e)) {
            if (it.c > 0 && !window.CE_money.spendDC(it.c, 'vanity_emblem')) return;
            gameState.ownedEmblems.push(e);
        }
        gameState.companyLogo = e;
        _applyBrand();
        if (typeof showNotification === 'function') showNotification(`Stemma ${e} equipaggiato.`, 'success');
        _save();
    };
    window._vanityColor = function (v) {
        _ensure();
        const it = COLORS.find(x => x.v === v); if (!it) return;
        if (!gameState.ownedColors.includes(v)) {
            if (it.c > 0 && !window.CE_money.spendDC(it.c, 'vanity_color')) return;
            gameState.ownedColors.push(v);
        }
        gameState.companyColor = v;
        _applyBrand();
        if (typeof showNotification === 'function') showNotification(`Colore aggiornato.`, 'success');
        _save();
    };
    window._vanityTitle = function (t) {
        _ensure();
        const it = TITLES.find(x => x.t === t); if (!it) return;
        if (!gameState.ownedTitles.includes(t)) {
            if (it.c > 0 && !window.CE_money.spendDC(it.c, 'vanity_title')) return;
            gameState.ownedTitles.push(t);
        }
        gameState.companyTitle = t;
        if (typeof showNotification === 'function') showNotification(`Titolo: ${t}.`, 'success');
        _save();
    };
    function _save() {
        if (typeof updateUI === 'function') updateUI();
        if (typeof saveGame === 'function') saveGame();
        if (typeof window.renderTabPrestigio === 'function') window.renderTabPrestigio();
    }
})();
