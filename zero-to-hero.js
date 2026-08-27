'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   zero-to-hero.js — Chauffeur Empire · Modalità Sopravvivenza iniziale
   Spec: ~/.gemini/.../zero_to_hero_design.md

   • < 10 corse  → SURVIVAL: guida manuale (no nav, no chrome). "Il fondo del barile".
   • == 10 corse → evento "SVEGLIATI, SCHIAVO": rivelazione idle → assumi il primo autista.
   • 10–24 corse → nav ridotta: visibili SOLO "Corse" e "Staff".
   • < 25 corse  → Staff in fase transitoria: unico assumibile = "Ragazzo di Quartiere" (gratis).
   • Veterani (prestige > 0 / NG+) → ESENTI da tutto (non si intrappola chi ha già un impero).

   Caricato DOPO dispatcher.js + ui-sidebar.js (patcha switchTab a valle dei loro).
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
    // Stato derivato dalla sorgente unica (onboarding-core.js). Wrapper locali mantenuti
    // perché usati internamente (executeManualDrive, switchTab patch, render).
    function _rides()    { return window.ceOnb.rides(); }
    function _veteran()  { return window.ceOnb.veteran(); }

    // Stato Zero-to-Hero corrente (alias storico → ceOnb.phase()).
    window._z2hState = function () { return window.ceOnb.phase(); };
    // Per ui-staff.js: fase transitoria (recruit ridotto, niente HR/Academy).
    window._z2hRestricted = function () { return window.ceOnb.restricted(); };

    const ALLOWED_RESTRICTED = ['corse', 'staff'];

    // Applica il tema survival + la visibilità delle voci di sidebar.
    window._z2hApplyNav = function () {
        const st = window._z2hState();
        document.body.classList.toggle('theme-survival', st === 'survival');
        document.querySelectorAll('.sidebar-item').forEach(el => {
            const tab = el.dataset.tab;
            if (st === 'restricted') el.style.display = ALLOWED_RESTRICTED.includes(tab) ? '' : 'none';
            else el.style.display = ''; // 'free' mostra tutto; 'survival' nasconde la nav via CSS
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // SURVIVAL VIEW — sostituisce interamente la tab Corse (< 10 corse)
    // ─────────────────────────────────────────────────────────────────────────
    window.renderManualSurvivalMode = function () {
        const container = document.getElementById('tab-container');
        if (!container) return;
        const gs     = window.gameState || {};
        const energy = (gs.energy == null) ? 100 : gs.energy;
        const _vd    = (typeof window._vittorioDebt === 'function') ? window._vittorioDebt() : null;
        const debt   = _vd ? _vd.outstanding : 500; // debito REALE (vittorio.js)

        let html = `
        <div id="manual-drive-container">
            <h1 style="color:red; font-size: 20px; letter-spacing: 3px;">IL FONDO DEL BARILE</h1>
            <div style="background: #111; border-left: 4px solid #d4af37; padding: 15px; margin: 20px; max-width: 500px; text-align: left; font-style: italic; color: #ccc;">
                "Ti ho prestato i soldi per riscattare l'auto dal pignoramento. Ora hai un debito con me. Muoviti, accendi il motore e lavora. Non mi importa se sei stanco." <br><b style="color:#d4af37">- Vittorio</b>
            </div>
            <div style="color: #666; margin-bottom: 20px;">Debito con Vittorio: <b style="color:red">€${(debt||0).toLocaleString('it-IT')}</b> <span style="font-size:10px;color:#555">(guadagna e ripagalo)</span></div>

            <div style="margin-bottom: 10px; font-weight: bold; color: ${energy < 10 ? 'red' : '#22c55e'};">Energia: ${Math.round(energy)}%</div>
        `;

        if (energy >= 10) {
            html += `<button id="manual-drive-btn" ${ceAct('executeManualDrive', [])}>[🕹️] GUIDA MANUALMENTE<br><span style="font-size:12px; font-weight:normal;">(-10% Energia, mancia variabile)</span></button>`;
        } else {
            html += `<button id="manual-drive-btn" disabled>SEI TROPPO STANCO</button>
                     <button id="sleep-car-btn" ${ceAct('executeSleepInCar', [])}>Dormi in auto (Recupera Energia)</button>`;
        }

        html += `</div>`;
        container.innerHTML = html;
    };

    /* Quanto rende una corsa guidata a mano.
       Era +15€ FISSI a ogni clic: una cifra prevedibile e' un contatore, non una
       ricompensa — e nella prima fase e' l'unica cosa che il giocatore fa.
       Ora ogni corsa e' un'estrazione: quasi sempre 12-18€, e un cliente su dieci
       lascia una mancia da 45-60€. La media sale a ~19€ (6 corse ≈ 112€ invece di
       90€), il che aiuta anche la partenza; ma il punto e' l'incertezza, che e'
       cio' che rende una ricompensa tale. */
    const MANUALE_MIN = 12, MANUALE_MAX = 18;
    const GENEROSO_PROB = 0.10, GENEROSO_MIN = 45, GENEROSO_MAX = 60;

    window._z2hGuadagnoCorsa = function () {
        const generoso = Math.random() < GENEROSO_PROB;
        const [min, max] = generoso ? [GENEROSO_MIN, GENEROSO_MAX] : [MANUALE_MIN, MANUALE_MAX];
        return { importo: Math.floor(min + Math.random() * (max - min + 1)), generoso };
    };

    // GUIDA MANUALMENTE: -10% energia, guadagno variabile, +1 corsa. Alla 6ª → evento capitalismo.
    window.executeManualDrive = function () {
        const gs = window.gameState;
        if (!gs || (gs.energy || 0) < 10) return;

        const { importo, generoso } = window._z2hGuadagnoCorsa();
        gs.energy = (gs.energy || 0) - 10;
        gs.cash   = (gs.cash   || 0) + importo;
        gs.questStats = gs.questStats || {};
        gs.questStats.totalRides = (gs.questStats.totalRides || 0) + 1;

        if (generoso && typeof window.showNotification === 'function')
            window.showNotification(`💸 Cliente generoso: +€${importo}!`, 'success');

        try {
            if (typeof window.spawnMoneyParticles === 'function')
                window.spawnMoneyParticles(window.innerWidth / 2, window.innerHeight * 0.4, importo);
        } catch (e) {}

        if (typeof window.saveGame === 'function') window.saveGame();
        // Server-authoritative mirror: persisti SUBITO il guadagno. Senza questo, al
        // reload il bridge col server (che parte a 0) azzererebbe quanto guadagnato
        // → soft-lock dell'onboarding (non raggiungi mai il passo "assumi il ragazzo").
        if (typeof window.ServerState !== 'undefined' && typeof window.ServerState.syncCash === 'function')
            window.ServerState.syncCash(gs.cash).catch(() => {});

        // Deve restare = soglia survival di onboarding-core.js (phase(), oggi 6).
        if (gs.questStats.totalRides === 6) {
            window.triggerCapitalismEvent();
        } else {
            window.renderManualSurvivalMode();
            if (typeof window.updateUI === 'function') window.updateUI();
        }
    };

    // DORMI IN AUTO: ripristina l'energia. NB: NON avanzo gameState.hour — l'orologio
    // è sincronizzato col tempo reale italiano nel gameLoop, quindi un +8h verrebbe
    // sovrascritto al tick successivo. Il recupero energia è l'effetto reale.
    window.executeSleepInCar = function () {
        const gs = window.gameState;
        if (!gs) return;
        gs.energy = 100;
        if (typeof window.saveGame === 'function') window.saveGame();
        window.renderManualSurvivalMode();
        if (typeof window.updateUI === 'function') window.updateUI();
        if (typeof window.showNotification === 'function')
            window.showNotification('Hai dormito in auto. Energia recuperata.', 'success');
    };

    // ─────────────────────────────────────────────────────────────────────────
    // EVENTO CAPITALISMO — alla 6ª corsa: rivelazione idle → diventa manager
    // ─────────────────────────────────────────────────────────────────────────
    window.triggerCapitalismEvent = function () {
        if (document.getElementById('z2h-capitalism')) return;
        /* La cifra si legge dalla cassa, non si scrive a mano: il testo diceva
           «150€» perche' era tarato su 10 corse, ma la soglia e' 6 (vedi sopra) e
           il giocatore ne aveva 90. Una promessa che non torna e' la prima cosa
           che gli fa perdere fiducia nel gioco. Cosi' non puo' piu' divergere. */
        const _cassa = Math.round((window.gameState && window.gameState.cash) || 0);
        const ov = document.createElement('div');
        ov.id = 'z2h-capitalism';
        ov.style.cssText = 'position:fixed;inset:0;z-index:var(--z-takeover);background:rgba(2,3,8,0.96);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px)';
        ov.innerHTML = `
        <div style="max-width:560px;background:#0b0d14;border:1px solid #d4af37;border-radius:14px;padding:34px 30px;text-align:center;box-shadow:0 0 60px rgba(212,175,55,0.25)">
            <h1 style="color:#d4af37;font-size:26px;letter-spacing:4px;margin:0 0 18px;font-weight:900">SVEGLIATI, SCHIAVO.</h1>
            <p style="color:#cbd2dc;font-size:15px;line-height:1.7;margin:0 0 26px">Non diventerai mai ricco se usi il tuo tempo. I ricchi usano il tempo degli altri. Hai ${_cassa}€ in tasca ora. Nel tab STAFF c'è un ragazzino di quartiere che cerca lavoro. Assumilo, metti lui al volante, tu vai a dormire e guarda i soldi arrivare da soli.</p>
            <button ${ceAct('_ceCapitalismAck', [])} style="background:linear-gradient(135deg,#d4af37 0%,#b8860b 100%);color:#000;font-weight:900;font-size:16px;padding:16px 26px;border-radius:10px;border:2px solid #fff;cursor:pointer">Ho capito. Fammi diventare un manager.</button>
        </div>`;
        document.body.appendChild(ov);
    };

    window._ceCapitalismAck = function () {
        const ov = document.getElementById('z2h-capitalism');
        if (ov) ov.remove();
        document.body.classList.remove('theme-survival');
        window._z2hApplyNav();                         // ora 'restricted' → mostra corse+staff
        if (typeof window.switchTab === 'function') window.switchTab('staff');
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RAGAZZO DI QUARTIERE — primo autista: ingaggio 0€, salario bassissimo,
    // statistiche mediocri. NON usa hireDriver() (che deduce salary×2 d'anticipo).
    // ─────────────────────────────────────────────────────────────────────────
    window.hireNeighborhoodKid = function () {
        const gs = window.gameState;
        if (!gs) return;
        if ((gs.drivers || []).some(d => d.name === 'Ragazzo di Quartiere')) {
            if (typeof window.showNotification === 'function')
                window.showNotification('Hai già assunto il Ragazzo di Quartiere.', 'info');
            return;
        }
        gs.drivers = gs.drivers || [];
        gs.drivers.push({
            id: 'd_' + Date.now(), name: 'Ragazzo di Quartiere', salary: 40,
            status: 'idle', assignedCarId: null, queue: [],
            fatigue: 0, restHoursLeft: 0, xp: 0, level: 0, morale: 100,
            trait: null, upgrades: [], hiredDay: gs.day,
            skill_efficiency: 35, skill_charisma: 30, skill_speed: 38,
            stress_level: 0, burnout_until: null,
        });
        // Il Ragazzo eredita le chiavi della berlina starter del CEO: così guida e genera
        // reddito SENZA dover comprare un'auto (impossibile con €0) → niente soft-lock.
        // L'auto-dispatch nel gameLoop lo manda in strada da solo.
        const _kid     = gs.drivers[gs.drivers.length - 1];
        const _starter = (gs.fleet || []).find(c => c.isStarter) || (gs.fleet || [])[0];
        if (_kid && _starter) _kid.assignedCarId = _starter.id;
        if (typeof window.showNotification === 'function')
            window.showNotification(_starter
                ? 'Ragazzo di Quartiere al volante della tua berlina. Vai a dormire: i soldi arrivano da soli.'
                : 'Ragazzo di Quartiere assunto! Assegnagli un’auto e vai a dormire.', 'success');
        if (typeof window.updateUI === 'function') window.updateUI();
        if (typeof window.saveGame === 'function') window.saveGame();
        if (typeof window.renderTabStaff === 'function') window.renderTabStaff();
    };

    // ─────────────────────────────────────────────────────────────────────────
    // HOOKS — patch switchTab (redirect in survival) + applica nav su nav/boot
    // ─────────────────────────────────────────────────────────────────────────
    const _origSwitch = window.switchTab;
    if (_origSwitch) {
        window.switchTab = function (tab) {
            // In survival la nav è nascosta: qualunque destinazione → 'corse'.
            if (window._z2hState() === 'survival' && tab !== 'corse') tab = 'corse';
            _origSwitch.call(this, tab);
            window._z2hApplyNav();
        };
    }

    window.addEventListener('load', function () { try { window._z2hApplyNav(); } catch (e) {} });
})();
