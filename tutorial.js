'use strict';
/* ================================================================
   tutorial.js — Chauffeur Empire · Tutorial Interattivo v3
   Vittorio guida il CEO step-by-step attraverso l'interfaccia.

   CAMBIAMENTI v3:
   - 'action-tab' naviga AUTOMATICAMENTE (non aspetta click su
     elementi nascosti) — compatibile con il nav orizzontale EM.
   - Testi aggiornati (rimossi tutti i riferimenti a "barra laterale").
   - Nessuna dipendenza dalla struttura DOM del nav.
   ================================================================ */

const _TUT_KEY = 'chauffeurEmpireTutorialDone_v3';

// step.type:
//   'intro'     — schermata centrata, bottone "Inizia"
//   'spotlight' — evidenzia target, bottone "Avanti"
//   'auto-nav'  — naviga al tab automaticamente, spotlight su #tab-container, bottone "Avanti"
//   'outro'     — schermata centrata finale, bottone "Cominciamo"

const _TUT_STEPS = [
    {
        type: 'intro',
        title: 'Benvenuto, CEO.',
        body: 'Mi chiamo <em>Vittorio</em>. Conosco questo settore da trent\'anni — e ho visto aziende come la tua nascere e morire in un anno. Ti mostro le regole base. Poi sei da solo.',
    },
    {
        type: 'spotlight',
        target: '#tb-cash',
        arrow: 'bottom',
        title: '💰 La Cassa',
        body: 'Questo numero è il tuo respiro. Se va in rosso per più di tre giorni consecutivi, l\'agenzia <strong>fallisce</strong>. Ogni decisione parte da qui.',
    },
    {
        type: 'spotlight',
        target: '#tb-rep',
        arrow: 'bottom',
        title: '⭐ La Reputazione',
        body: 'Il mercato ha memoria. Corse puntuali e clienti soddisfatti fanno salire la stella. Più è alta, migliori sono i clienti, i contratti e gli autisti che ti scelgono.',
    },
    {
        type: 'spotlight',
        target: '#tb-energy-bar',
        arrow: 'bottom',
        title: '⚡ La Tua Energia',
        body: 'Anche tu ti stanchi. L\'energia scende col tempo reale — se crolla, le tue performance calano. Un hotel la recupera. <em>Non sottovalutarlo.</em>',
    },
    {
        type: 'auto-nav',
        tab: 'corse',
        title: '🚕 Il Dispatch Center',
        body: 'Qui nascono i soldi. Ti porto nella centrale operativa — da qui assegni le corse ai tuoi autisti.',
    },
    {
        type: 'spotlight',
        target: '#tab-container',
        arrow: 'center',
        title: '🚕 Assegna le Corse',
        body: 'Le corse arrivano in tempo reale. Clicca su una corsa e poi sull\'autista per assegnarla — o usa <strong>Smista tutte</strong>. Verde = Standard, Blu = Business, Viola = VIP, Nero = Ultra.',
        actionGate: 'rides',
    },
    {
        type: 'auto-nav',
        tab: 'fleet',
        title: '🚗 La Flotta',
        body: 'Un cliente VIP non sale su uno scassone. Ti mostro il tuo parco macchine.',
    },
    {
        type: 'spotlight',
        target: '#tab-container',
        arrow: 'center',
        title: '🚗 Gestisci i Veicoli',
        body: 'Ogni auto ha condizioni, pulizia e carburante. Dallo <strong>Showroom</strong> acquisti i nuovi modelli. Inizia con il Nexus H-Line. Non comprare ciò che non puoi mantenere.',
    },
    {
        type: 'auto-nav',
        tab: 'staff',
        title: '👔 Il Personale',
        body: 'Un autista stanco sbaglia. Un errore su una corsa VIP costa caro. Vediamo il personale.',
    },
    {
        type: 'spotlight',
        target: '#tab-container',
        arrow: 'center',
        title: '👔 Tienili in Forma',
        body: 'Monitora fatica, stress e morale di ogni autista. Mandali in riposo <em>prima</em> che siano esauriti, non dopo. Prevenire costa meno che curare.',
    },
    {
        type: 'auto-nav',
        tab: 'career',
        title: '🎯 Le Missioni',
        body: 'La tua strada è già tracciata — ma sei tu a percorrerla. Ti porto nelle missioni: da qui parti, da qui sali.',
    },
    {
        type: 'outro',
        title: 'Ora sei da solo.',
        body: 'Ho finito. Il mercato non aspetta spiegazioni — aspetta risultati. La tua <em>prima missione</em> è già attiva nella tab Missioni. Completala. Poi ne parleremo.',
    },
];

/* ──────────────────────────────────────────────────────────────
   STATE
────────────────────────────────────────────────────────────── */
let _tutStep    = 0;
let _tutBox     = null;
let _tutCanvas  = null;
let _tutOverlay = null;
let _tutTarget  = null;
let _tutCleanup = null;
let _tutGateInterval = null;

/* ──────────────────────────────────────────────────────────────
   PUBLIC API
────────────────────────────────────────────────────────────── */
window.startTutorial = function() {
    _tutStep = 0;
    _render();
};

window.tutorialNext = function() {
    if (_tutGateInterval) { clearInterval(_tutGateInterval); _tutGateInterval = null; }
    if (_tutCleanup) { _tutCleanup(); _tutCleanup = null; }
    _tutStep++;
    if (_tutStep >= _TUT_STEPS.length) { _end(); } else { _render(); }
};

window.tutorialSkip = function() {
    if (_tutGateInterval) { clearInterval(_tutGateInterval); _tutGateInterval = null; }
    if (_tutCleanup) { _tutCleanup(); _tutCleanup = null; }
    _end();
};

window._maybeLaunchTutorial = function() {
    if (localStorage.getItem(_TUT_KEY)) return;
    // Supporto retrocompatibile: vecchia chiave v2 → non risomministrare il tutorial
    if (localStorage.getItem('chauffeurEmpireTutorialDone_v2')) {
        localStorage.setItem(_TUT_KEY, '1');
        return;
    }
    setTimeout(() => window.startTutorial(), 1200);
};

/* ──────────────────────────────────────────────────────────────
   CORE RENDER
────────────────────────────────────────────────────────────── */
function _render() {
    _clearDOM();
    const step = _TUT_STEPS[_tutStep];
    if (!step) { _end(); return; }

    const isCenter = step.type === 'intro' || step.type === 'outro';

    // auto-nav: naviga subito, poi spotlight il tab-container
    if (step.type === 'auto-nav') {
        if (typeof window.switchTab === 'function') window.switchTab(step.tab);
        // Breve ritardo per lasciare che il tab si renderizzi prima di fare spotlight
        setTimeout(() => {
            const container = document.getElementById('tab-container');
            _buildBackdrop(container, false);
            _buildBox(step, container);
            _watchActionGate(step);
        }, 250);
        return;
    }

    const target = (!isCenter && step.target) ? document.querySelector(step.target) : null;
    _buildBackdrop(target, isCenter);
    _buildBox(step, target);
    _watchActionGate(step);
}

/* ──────────────────────────────────────────────────────────────
   ACTION GATE — avanza automaticamente quando il giocatore compie
   DAVVERO l'azione dello step (non solo cliccando "Avanti").
   Il bottone "Avanti" resta comunque sempre cliccabile: nessun
   soft-lock, il gate è un bonus di progressione, non un blocco.
────────────────────────────────────────────────────────────── */
function _tutActionSignal(kind) {
    if (kind === 'rides') {
        return (window.ceOnb && typeof window.ceOnb.rides === 'function') ? window.ceOnb.rides() : null;
    }
    return null;
}

function _watchActionGate(step) {
    if (!step.actionGate) return;
    const baseline = _tutActionSignal(step.actionGate);
    if (baseline == null) return;
    _tutGateInterval = setInterval(() => {
        if (_tutActionSignal(step.actionGate) > baseline) {
            clearInterval(_tutGateInterval);
            _tutGateInterval = null;
            window.tutorialNext();
        }
    }, 1000);
}

/* ──────────────────────────────────────────────────────────────
   SPOTLIGHT ANCORATO — costruzione e posizionamento
   Direzione scelta da Vlad il 29/08/2026 (mock-up 5): si illumina il
   bersaglio e la spiegazione gli sta accanto.

   Tre regole che questo strato deve rispettare, in ordine di importanza:

   1. NON PUNTARE MAI AL VUOTO. Se il selettore non trova niente — perche'
      l'interfaccia e' cambiata, o perche' quel pezzo non e' ancora
      disegnato — la bolla si centra e l'anello non compare. Un tutorial
      che indica un punto vuoto e' peggio di nessun tutorial. Il guardrail
      test/guardrail/tutorial-bersagli.test.js verifica che ogni selettore
      dichiarato esista davvero, cosi' il cambiamento si vede in rosso
      nella suite invece che in faccia al giocatore.
   2. SEGUIRE IL BERSAGLIO. Anello e bolla si riposizionano a ogni scroll
      e resize. La versione precedente dipingeva il buco su un canvas una
      volta sola: bastava scorrere e il buio copriva la cosa illuminata.
   3. SOLO TOKEN. Nessun colore scritto a mano: sta tutto in .ce-spot-*
      dentro style.css, che legge --em-*.
────────────────────────────────────────────────────────────── */

const _SPOT_MARGINE = 8;    // aria fra bersaglio e anello
const _SPOT_STACCO  = 18;   // aria fra anello e bolla
const _SPOT_BORDO   = 12;   // aria minima dai bordi dello schermo

/** Il bersaglio e' utilizzabile? Un elemento c'e' ma puo' avere misura zero
 *  (tab non aperto, display:none): in quel caso vale come assente. */
function _spotVisibile(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
}

function _buildBackdrop(target, isCenter) {
    const scrim = document.createElement('div');
    scrim.id = 'tut-overlay';
    scrim.className = 'ce-spot-scrim';
    document.body.appendChild(scrim);
    _tutOverlay = scrim;

    const usabile = !isCenter && _spotVisibile(target);
    if (!usabile) {
        // Nessun bersaglio: il buio lo fa lo scrim e non si illumina niente.
        scrim.classList.add('senza-bersaglio');
        return;
    }

    const ring = document.createElement('div');
    ring.id = 'tut-ring';
    ring.className = 'ce-spot-ring';
    document.body.appendChild(ring);
    _tutCanvas = ring;   // stesso slot di pulizia della vecchia canvas

    /* Il bersaglio va sollevato sopra lo scrim, altrimenti resta illuminato
       ma non cliccabile — e diversi passi aspettano proprio che il giocatore
       lo clicchi (actionGate). */
    _tutTarget = target;
    target.dataset.tutOrigZ   = target.style.zIndex   || '';
    target.dataset.tutOrigPos = target.style.position || '';
    const posizione = (typeof window.getComputedStyle === 'function')
        ? window.getComputedStyle(target).position
        : (target.style.position || 'static');
    if (posizione === 'static') target.style.position = 'relative';
    target.style.zIndex = '9510';   // = --z-spotlight + 10
}

function _buildBox(step, target) {
    const isCenter = step.type === 'intro' || step.type === 'outro';
    const isLast   = step.type === 'outro';
    const isFirst  = step.type === 'intro';
    const passo    = _tutStep + 1;
    const totale   = _TUT_STEPS.length;

    const bolla = document.createElement('div');
    bolla.id = 'tut-box';
    bolla.className = 'ce-spot-bolla';
    bolla.innerHTML = `
        <div class="freccia" style="display:none"></div>
        <div class="eti">Passo ${passo} di ${totale}</div>
        <h4>${step.title}</h4>
        <p>${step.body}</p>
        ${step.actionGate ? '<div class="gate">✓ Avanza da solo appena lo fai davvero</div>' : ''}
        <div class="azioni">
            <button class="ok" ${ceAct('tutorialNext', [])}>${isLast ? 'Cominciamo' : isFirst ? 'Inizia' : 'Ho capito'}</button>
            <button class="salta" ${ceAct('tutorialSkip', [])}>Salta il tutorial</button>
            <span class="conta">${passo} / ${totale}</span>
        </div>`;
    document.body.appendChild(bolla);
    _tutBox = bolla;

    const ancorata = !isCenter && _spotVisibile(target);
    _spotAggiorna(step, ancorata ? target : null);
    if (ancorata) _spotSegui(step, target);
}

/* Ricalcola anello e bolla dalle misure VERE del bersaglio in questo istante. */
function _spotAggiorna(step, target) {
    const bolla = _tutBox;
    if (!bolla) return;
    const freccia = bolla.querySelector('.freccia');
    const vW = window.innerWidth, vH = window.innerHeight;

    if (!_spotVisibile(target)) {
        if (freccia) freccia.style.display = 'none';
        bolla.style.left = '50%';
        bolla.style.top  = '50%';
        bolla.style.transform = 'translate(-50%,-50%)';
        return;
    }
    bolla.style.transform = '';

    const r = target.getBoundingClientRect();
    if (_tutCanvas) {
        _tutCanvas.style.left   = (r.left   - _SPOT_MARGINE) + 'px';
        _tutCanvas.style.top    = (r.top    - _SPOT_MARGINE) + 'px';
        _tutCanvas.style.width  = (r.width  + _SPOT_MARGINE * 2) + 'px';
        _tutCanvas.style.height = (r.height + _SPOT_MARGINE * 2) + 'px';
    }

    const bW = bolla.offsetWidth  || 346;
    const bH = bolla.offsetHeight || 200;
    const spazio = {
        destra:  vW - r.right,
        sinistra: r.left,
        sotto:   vH - r.bottom,
        sopra:   r.top,
    };
    /* Il lato lo sceglie lo spazio disponibile, non la dichiarazione dello
       step: `arrow` resta il suggerimento, ma se da quella parte la bolla
       uscirebbe dallo schermo si prende il lato piu' largo. Senza questo,
       un bersaglio vicino al bordo spinge la bolla fuori vista. */
    const preferito = step.arrow === 'left' ? 'sinistra'
                    : step.arrow === 'right' ? 'destra'
                    : step.arrow === 'top' ? 'sopra'
                    : step.arrow === 'center' ? null
                    : 'sotto';
    const serve = { destra: bW, sinistra: bW, sotto: bH, sopra: bH };
    let lato = (preferito && spazio[preferito] >= serve[preferito] + _SPOT_STACCO) ? preferito : null;
    if (!lato) {
        lato = ['destra', 'sotto', 'sinistra', 'sopra']
            .find(l => spazio[l] >= serve[l] + _SPOT_STACCO) || null;
    }

    let left, top, latoFreccia;
    if (!lato) {
        // Non c'e' spazio da nessuna parte: la bolla si centra e non punta.
        left = vW / 2 - bW / 2;
        top  = vH / 2 - bH / 2;
        latoFreccia = null;
    } else if (lato === 'destra' || lato === 'sinistra') {
        left = lato === 'destra' ? r.right + _SPOT_STACCO : r.left - bW - _SPOT_STACCO;
        top  = r.top + r.height / 2 - bH / 2;
        latoFreccia = lato === 'destra' ? 'da-sinistra' : 'da-destra';
    } else {
        left = r.left + r.width / 2 - bW / 2;
        top  = lato === 'sotto' ? r.bottom + _SPOT_STACCO : r.top - bH - _SPOT_STACCO;
        latoFreccia = lato === 'sotto' ? 'da-sopra' : 'da-sotto';
    }

    left = Math.max(_SPOT_BORDO, Math.min(left, vW - bW - _SPOT_BORDO));
    top  = Math.max(_SPOT_BORDO, Math.min(top,  vH - bH - _SPOT_BORDO));
    bolla.style.left = left + 'px';
    bolla.style.top  = top  + 'px';

    if (freccia) {
        if (!latoFreccia) { freccia.style.display = 'none'; }
        else {
            freccia.className = 'freccia ' + latoFreccia;
            freccia.style.display = '';
            // La punta insegue il centro del bersaglio, non il centro della bolla.
            if (latoFreccia === 'da-sinistra' || latoFreccia === 'da-destra') {
                const y = r.top + r.height / 2 - top - 7;
                freccia.style.top = Math.max(12, Math.min(y, bH - 26)) + 'px';
            } else {
                const x = r.left + r.width / 2 - left - 7;
                freccia.style.left = Math.max(12, Math.min(x, bW - 26)) + 'px';
            }
        }
    }
}

/* Scroll e resize: si riposiziona, non si ridisegna. Un rAF per giro, cosi'
   lo scorrimento non paga un ricalcolo per evento. */
function _spotSegui(step, target) {
    /* Riposizionare e' un'operazione pubblica: la chiamano gli eventi, e la
       puo' chiamare chiunque muova l'interfaccia sotto al tutorial (un tab che
       finisce di disegnarsi, un pannello che si apre). */
    window._tutRiposiziona = () => _spotAggiorna(step, target);

    let inCoda = false;
    const rAF = (typeof requestAnimationFrame === 'function')
        ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    const suEvento = () => {
        if (inCoda) return;
        inCoda = true;
        rAF(() => { inCoda = false; _spotAggiorna(step, target); });
    };
    const suTasto = (ev) => { if (ev.key === 'Escape') window.tutorialSkip(); };
    /* scroll e keydown vanno su `document`: lo scroll di un pannello interno
       non arriva a window se non in cattura, e su document si intercetta
       comunque. resize esiste solo su window. */
    document.addEventListener('scroll', suEvento, true);
    document.addEventListener('keydown', suTasto);
    window.addEventListener('resize', suEvento);
    _tutCleanup = () => {
        document.removeEventListener('scroll', suEvento, true);
        document.removeEventListener('keydown', suTasto);
        window.removeEventListener('resize', suEvento);
        window._tutRiposiziona = null;
    };
}

/* ──────────────────────────────────────────────────────────────
   CLEANUP & END
────────────────────────────────────────────────────────────── */
function _clearDOM() {
    document.getElementById('tut-box')?.remove();
    document.getElementById('tut-overlay')?.remove();
    document.getElementById('tut-ring')?.remove();
    _tutBox = _tutOverlay = _tutCanvas = null;
    if (_tutTarget) {
        _tutTarget.style.zIndex   = _tutTarget.dataset.tutOrigZ   || '';
        _tutTarget.style.position = _tutTarget.dataset.tutOrigPos || '';
        delete _tutTarget.dataset.tutOrigZ;
        delete _tutTarget.dataset.tutOrigPos;
        _tutTarget = null;
    }
}


function _end() {
    _clearDOM();
    if (_tutCleanup) { _tutCleanup(); _tutCleanup = null; }
    localStorage.setItem(_TUT_KEY, '1');
}
