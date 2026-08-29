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
        // amount arriva anche dal bottone del modal, che non ha data-ce-args: in quel
        // caso events.js passa l'Event come primo argomento. Solo un numero finito è
        // un importo; qualunque altra cosa significa «ripaga quanto consente la cassa».
        var requested = Number.isFinite(amount) ? amount : cash;
        var pay = Math.max(0, Math.min(requested, d.outstanding, cash));
        if (!Number.isFinite(pay) || pay <= 0) {
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
            // Il tetto vive in money.js (sempre caricato prima in gioco); la guardia
            // regge i banchi di prova minimi che non lo caricano.
            if (window.CE_money && typeof window.CE_money.addReputation === 'function')
                window.CE_money.addReputation(0.3);
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
        /* Colori dai token --em-*: il pannello aveva un rosso, un oro e un verde
           tutti suoi, diversi da quelli del gioco (stessa correzione fatta il
           30/08 alle due schermate di zero-to-hero.js). */
        ov.style.cssText = 'position:fixed;inset:0;z-index:var(--z-modal,9000);background:rgba(2,3,8,0.9);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px)';
        var flipBtn = (g.prestige || 0) >= 1
            ? '<button data-ce-act="flipVittorio" style="background:var(--em-gold);color:#0d1117;font-weight:800;font-size:12.5px;padding:12px;border-radius:8px;border:none;cursor:pointer">🤝 Ribalta Vittorio — diventa tuo socio</button>'
            : '';
        ov.innerHTML =
            '<div style="max-width:460px;width:100%;background:var(--em-card);border:1px solid var(--em-red);border-radius:12px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.7)">'
          +   '<div style="display:flex;align-items:center;gap:10px;padding:11px 20px;border-bottom:1px solid var(--em-line);background:rgba(255,255,255,.02)">'
          +     '<span style="font-size:16px;line-height:1">📵</span>'
          +     '<span style="font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--em-red)">Debito con Vittorio</span>'
          +   '</div>'
          +   '<div style="padding:18px 20px 6px">'
          +     '<div style="border-left:2px solid var(--em-gold);padding:2px 0 2px 14px;margin-bottom:16px;font-size:13px;line-height:1.65;color:var(--em-ink)">'
          +       '"Ti ho prestato i soldi per riscattare l\'auto dal pignoramento. Quel debito è mio. Salda."'
          +       '<span style="display:block;margin-top:8px;font-size:11px;font-weight:800;color:var(--em-gold)">— Vittorio</span>'
          +     '</div>'
          +     '<div style="display:flex;border-top:1px solid var(--em-line);border-bottom:1px solid var(--em-line);margin-bottom:18px">'
          +       '<div style="flex:1;padding:11px 0;border-right:1px solid var(--em-line)">'
          +         '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--em-dim)">Residuo</div>'
          +         '<div style="font-size:22px;font-weight:800;margin-top:4px;color:var(--em-red);font-variant-numeric:tabular-nums">€' + fmt(d.outstanding) + '</div>'
          +       '</div>'
          +       '<div style="flex:1;padding:11px 0;border-right:1px solid var(--em-line)">'
          +         '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--em-dim)">In cassa</div>'
          +         '<div style="font-size:22px;font-weight:800;margin-top:4px;color:var(--em-green);font-variant-numeric:tabular-nums">€' + fmt(g.cash || 0) + '</div>'
          +       '</div>'
          +       '<div style="flex:1;padding:11px 0">'
          +         '<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--em-dim)">Interesse</div>'
          +         '<div style="font-size:22px;font-weight:800;margin-top:4px;color:var(--em-amber);font-variant-numeric:tabular-nums">+' + (DAILY_INTEREST * 100) + '%<span style="font-size:10px;font-weight:600;color:var(--em-dim)">/g</span></div>'
          +       '</div>'
          +     '</div>'
          +   '</div>'
          +   '<div style="padding:0 20px 20px;display:flex;flex-direction:column;gap:8px">'
          +     '<button data-ce-act="repayVittorio" data-ce-args=\'[' + canPay + ']\' ' + (canPay > 0 ? '' : 'disabled') + ' style="background:' + (canPay > 0 ? 'var(--em-green-d)' : 'var(--em-line)') + ';color:' + (canPay > 0 ? '#fff' : 'var(--em-dim)') + ';font-weight:800;font-size:13px;padding:13px;border-radius:8px;border:none;cursor:' + (canPay > 0 ? 'pointer' : 'not-allowed') + '">' + (canPay > 0 ? 'Ripaga ' + (canPay >= d.outstanding ? 'tutto — €' + fmt(d.outstanding) : '€' + fmt(canPay)) : 'Non hai contanti per pagare') + '</button>'
          +     flipBtn
          +     '<button data-ce-act="_closeVittorioModal" style="background:transparent;border:1px solid var(--em-line);color:var(--em-muted);font-size:12px;padding:10px;border-radius:8px;cursor:pointer">Più tardi — gli interessi salgono</button>'
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
