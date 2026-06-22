'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   vittorio.js — Chauffeur Empire · Debito con Vittorio (lo strozzino)
   Backbone tutorial/missioni — pezzo 4. Trasforma il debito da TESTO COSMETICO
   in MECCANICA reale: è il gancio emotivo dell'apertura "povero → ricco".

   Modello (deciso con Vlad, delega): RATE/INTERESSE DOLCE.
   • Principal €500 = il prestito con cui hai riscattato l'auto dal pignoramento
     (la berlina starter). Parti a €0 PROPRIO perché li devi a lui.
   • +3%/giorno-gioco sul residuo (pressione, non scadenza brutale → no soft-lock).
   • Ripaghi quando vuoi dalla cassa (server-authoritative come i fix P0).
   • SMS minatori periodici; "ultima chiamata" se il debito cresce troppo.
   • BIVIO: Ripaga (pulito) · Più tardi (interessi salgono) · Ribalta (prestige≥1:
     diventa tuo socio silenzioso).
   Auto-contenuto: nessun edit ai sistemi esistenti se non hook su processDailyRoutines.
   Espone: _vittorioDebt(), openVittorioModal(), repayVittorio(), flipVittorio().
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
    var PRINCIPAL          = 500;
    var DAILY_INTEREST     = 0.03;   // +3%/giorno-gioco sul residuo
    var FINAL_NOTICE_MULT  = 2.5;    // residuo ≥ 2.5× principal → ultima chiamata
    var NAG_EVERY_DAYS     = 2;

    function gs()  { return window.gameState; }
    function fmt(n){ return (Math.round(n || 0)).toLocaleString('it-IT'); }

    // Inizializza (idempotente) e restituisce lo stato debito. null per i veterani.
    function ensureDebt() {
        var g = gs(); if (!g) return null;
        if (window.ceOnb.veteran()) return null;         // veterani/NG+: niente debito (sorgente unica)
        if (!g.vittorioDebt) {
            g.vittorioDebt = {
                principal: PRINCIPAL, outstanding: PRINCIPAL, status: 'active',
                startDay: g.day || 1, lastAccrualDay: g.day || 1,
                lastNagDay: g.day || 1, finalNoticeShown: false
            };
        }
        return g.vittorioDebt;
    }
    window._vittorioDebt = function () { return ensureDebt(); };

    var NAGS = [
        '"Dove sono i miei soldi?" — Vittorio',
        '"Il tempo passa, e gli interessi pure." — Vittorio',
        '"Non farmi venire a cercarti di persona." — Vittorio',
        '"Ti ho tirato fuori dal fango. Non scordartelo." — Vittorio'
    ];
    function nag() {
        if (typeof window.showNotification === 'function')
            window.showNotification('📵 ' + NAGS[Math.floor(Math.random() * NAGS.length)], 'error');
    }

    // Accrual giornaliero — chiamato dal daily tick (anche per ogni giorno offline).
    function dailyTick() {
        var g = gs(); if (!g) return;
        var d = g.vittorioDebt;
        if (!d || d.status !== 'active') return;
        if (d.lastAccrualDay === g.day) return;          // una sola volta per giorno
        d.lastAccrualDay = g.day;
        d.outstanding = Math.round(d.outstanding * (1 + DAILY_INTEREST));
        if ((g.day - (d.lastNagDay || 0)) >= NAG_EVERY_DAYS) { d.lastNagDay = g.day; nag(); }
        if (!d.finalNoticeShown && d.outstanding >= d.principal * FINAL_NOTICE_MULT) {
            d.finalNoticeShown = true;
            if (typeof window.showBigEvent === 'function')
                window.showBigEvent('📵', 'VITTORIO HA PERSO LA PAZIENZA',
                    'Il debito è salito a €' + fmt(d.outstanding) + '. "Pensavi di dimenticarti di me? Salda, o ti rovino."');
            openModal();
        }
    }

    // Ripaga quanto consente la cassa (o l'importo passato).
    window.repayVittorio = function (amount) {
        var g = gs(); var d = g && g.vittorioDebt;
        if (!d || d.status !== 'active') return;
        var cash = g.cash || 0;
        var pay = Math.max(0, Math.min(amount != null ? amount : cash, d.outstanding, cash));
        if (pay <= 0) {
            if (typeof window.showNotification === 'function')
                window.showNotification('Non hai contanti per pagare Vittorio.', 'error');
            return;
        }
        g.cash = cash - pay;
        d.outstanding -= pay;
        // Mirror server-authoritative (stesso pattern dei fix P0).
        if (typeof window.ServerState !== 'undefined' && typeof window.ServerState.syncCash === 'function')
            window.ServerState.syncCash(g.cash).catch(function () {});
        if (d.outstanding <= 0) {
            d.outstanding = 0; d.status = 'repaid';
            g.reputation = Math.min(5.0 + (g.prestige || 0), (g.reputation || 0) + 0.3);
            if (typeof window.showBigEvent === 'function')
                window.showBigEvent('✅', 'DEBITO SALDATO',
                    'Hai chiuso col passato. Vittorio sparisce — per ora. Da qui in poi l\'impero è solo tuo.');
        } else if (typeof window.showNotification === 'function') {
            window.showNotification('Pagati €' + fmt(pay) + ' a Vittorio. Residuo: €' + fmt(d.outstanding) + '.', 'success');
        }
        closeModal(); refresh();
    };

    // Ribalta lo strozzino (solo a impero forte): diventa socio passivo.
    window.flipVittorio = function () {
        var g = gs(); var d = g && g.vittorioDebt;
        if (!d || d.status !== 'active') return;
        if ((g.prestige || 0) < 1) {
            if (typeof window.showNotification === 'function')
                window.showNotification('Non hai ancora il potere per ribaltare Vittorio.', 'error');
            return;
        }
        d.status = 'flipped'; d.outstanding = 0; g.vittorioPartner = true;
        if (typeof window.showBigEvent === 'function')
            window.showBigEvent('🤝', 'VITTORIO ORA LAVORA PER TE',
                'Hai ribaltato i ruoli. Lo strozzino di quartiere è il tuo nuovo socio silenzioso. Debito cancellato.');
        closeModal(); refresh();
    };

    // ── Modal ──────────────────────────────────────────────────────────────
    window.openVittorioModal = function () { openModal(); };
    function openModal() {
        var g = gs(); var d = ensureDebt(); if (!d || d.status !== 'active') return;
        if (document.getElementById('vittorio-modal')) return;
        var canPay = Math.min(d.outstanding, g.cash || 0);
        var ov = document.createElement('div');
        ov.id = 'vittorio-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:var(--z-modal,9000);background:rgba(2,3,8,0.9);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px)';
        var flipBtn = (g.prestige || 0) >= 1
            ? '<button data-ce-act="flipVittorio" style="background:linear-gradient(135deg,#d4af37,#b8860b);color:#000;font-weight:800;padding:12px;border-radius:8px;border:none;cursor:pointer">🤝 Ribalta Vittorio (diventa tuo socio)</button>'
            : '';
        ov.innerHTML =
            '<div style="max-width:480px;background:#0b0d14;border:1px solid #b91c1c;border-radius:14px;padding:30px;text-align:center;box-shadow:0 0 50px rgba(185,28,28,0.25)">'
          +   '<div style="font-size:40px;line-height:1">📵</div>'
          +   '<h1 style="color:#ef4444;font-size:20px;letter-spacing:2px;margin:8px 0 4px;font-weight:900">DEBITO CON VITTORIO</h1>'
          +   '<p style="color:#cbd2dc;font-size:13px;line-height:1.6;margin:0 0 6px">"Ti ho prestato i soldi per riscattare l\'auto dal pignoramento. Quel debito è mio. Salda."</p>'
          +   '<div style="font-size:30px;font-weight:900;color:#ef4444;margin:12px 0 2px">€' + fmt(d.outstanding) + '</div>'
          +   '<div style="font-size:11px;color:#6b7280;margin-bottom:18px">Interesse +' + (DAILY_INTEREST * 100) + '%/giorno · Cassa: €' + fmt(g.cash || 0) + '</div>'
          +   '<div style="display:flex;flex-direction:column;gap:8px">'
          +     '<button data-ce-act="repayVittorio" ' + (canPay > 0 ? '' : 'disabled') + ' style="background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;font-weight:800;padding:12px;border-radius:8px;border:none;cursor:' + (canPay > 0 ? 'pointer' : 'not-allowed') + ';opacity:' + (canPay > 0 ? 1 : 0.5) + '">💸 Ripaga ' + (canPay >= d.outstanding ? 'tutto (€' + fmt(d.outstanding) + ')' : '€' + fmt(canPay)) + '</button>'
          +     flipBtn
          +     '<button data-ce-act="_closeVittorioModal" style="background:transparent;border:1px solid #30363d;color:#9ca3af;padding:10px;border-radius:8px;cursor:pointer">Più tardi (gli interessi salgono)</button>'
          +   '</div>'
          + '</div>';
        ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
        document.body.appendChild(ov);
    }
    function closeModal() { var el = document.getElementById('vittorio-modal'); if (el) el.remove(); }
    window._closeVittorioModal = closeModal;

    function refresh() { if (typeof window.updateUI === 'function') { try { window.updateUI(); } catch (e) {} } }

    // Hook sul daily tick (accrual + nag), come updateUI/tracker.
    function hookDaily() {
        if (window.__vittorioHooked) return;
        var orig = window.processDailyRoutines;
        if (typeof orig === 'function') {
            window.processDailyRoutines = function () {
                var r = orig.apply(this, arguments);
                try { ensureDebt(); dailyTick(); } catch (e) {}
                return r;
            };
            window.__vittorioHooked = true;
        }
    }
    window.addEventListener('load', function () {
        hookDaily();
        setTimeout(function () { hookDaily(); try { ensureDebt(); } catch (e) {} }, 1500);
    });
})();
