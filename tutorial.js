'use strict';
/* ================================================================
   tutorial.js — Chauffeur Empire · Tutorial Interattivo v2
   Vittorio guida il CEO step-by-step attraverso l'interfaccia.
   ================================================================ */

const _TUT_KEY = 'chauffeurEmpireTutorialDone_v2';

// step.type:
//   'intro'        — schermata centrata, nessun target (bottone "Inizia")
//   'spotlight'    — evidenzia target, bottone "Avanti" per proseguire
//   'action-tab'   — evidenzia voce sidebar, player DEVE cliccarla per avanzare
//   'outro'        — schermata centrata finale (bottone "Cominciamo")

const _TUT_SPEAKER = { name: 'Vittorio', faction: 'Mentore', initial: 'V', color: '#d4af37' };

const _TUT_STEPS = [
    {
        type: 'intro',
        title: 'Benvenuto, CEO.',
        body: 'Mi chiamo <strong style="color:#d4af37">Vittorio</strong>. Conosco questo settore da trent\'anni — e ho visto aziende come la tua nascere e morire in un anno. Ti mostro le regole base. Poi sei da solo.',
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
        body: 'Anche tu ti stanchi. L\'energia scende col tempo reale — se crolla, le tue performance calano. Un hotel recupera tutto. <em>Non sottovalutarlo.</em>',
    },
    {
        type: 'action-tab',
        tab: 'corse',
        target: '[data-tab="corse"]',
        arrow: 'right',
        title: '🚕 Il Dispatch Center',
        body: 'Qui nascono i soldi. <strong>Clicca su Dispatch</strong> nella barra laterale per aprire la centrale operativa.',
    },
    {
        type: 'spotlight',
        target: '#tab-container',
        arrow: 'center',
        title: '🚕 Assegna le Corse',
        body: 'Le corse arrivano in tempo reale. <strong>Trascina un autista su una corsa</strong> per assegnarla — o viceversa. Verde = Standard, Blu = Business, Viola = VIP, Nero = Ultra.',
    },
    {
        type: 'action-tab',
        tab: 'fleet',
        target: '[data-tab="fleet"]',
        arrow: 'right',
        title: '🚗 La Flotta',
        body: 'Un cliente VIP non sale su uno scassone. <strong>Clicca Flotta</strong> — ti mostro il parco macchine.',
    },
    {
        type: 'spotlight',
        target: '#tab-container',
        arrow: 'center',
        title: '🚗 Gestisci i Veicoli',
        body: 'Ogni auto ha condizioni, pulizia e carburante. Nello Showroom acquisti i nuovi modelli. Inizia con il <strong>Nexus H-Line</strong>. Non comprare ciò che non puoi mantenere.',
    },
    {
        type: 'action-tab',
        tab: 'staff',
        target: '[data-tab="staff"]',
        arrow: 'right',
        title: '👔 Il Personale',
        body: 'Un autista stanco sbaglia. Un errore su una corsa VIP costa caro. <strong>Clicca Staff & HR</strong>.',
    },
    {
        type: 'spotlight',
        target: '#tab-container',
        arrow: 'center',
        title: '👔 Tienili in Forma',
        body: 'Monitora fatica, stress e morale di ogni autista. Mandali in riposo <em>prima</em> che siano esauriti, non dopo. Prevenire costa meno che curare.',
    },
    {
        type: 'action-tab',
        tab: 'career',
        target: '[data-tab="career"]',
        arrow: 'right',
        title: '🎯 Le Missioni',
        body: 'La tua strada è già tracciata — ma sei tu a percorrerla. <strong>Clicca Missioni</strong> per vedere da dove parti.',
    },
    {
        type: 'outro',
        title: 'Ora sei da solo.',
        body: 'Ho finito. Il mercato non aspetta spiegazioni — aspetta risultati. La tua <strong style="color:#d4af37">prima missione</strong> è già attiva. Completala. Poi ne parleremo.',
    },
];

/* ──────────────────────────────────────────────────────────────
   STATE
────────────────────────────────────────────────────────────── */
let _tutStep     = 0;
let _tutBox      = null;
let _tutCanvas   = null;
let _tutOverlay  = null;
let _tutTarget   = null;
let _tutCleanup  = null;

/* ──────────────────────────────────────────────────────────────
   PUBLIC API
────────────────────────────────────────────────────────────── */
window.startTutorial = function() {
    _tutStep = 0;
    _render();
};

window.tutorialNext = function() {
    if (_tutCleanup) { _tutCleanup(); _tutCleanup = null; }
    _tutStep++;
    if (_tutStep >= _TUT_STEPS.length) {
        _end();
    } else {
        _render();
    }
};

window.tutorialSkip = function() {
    if (_tutCleanup) { _tutCleanup(); _tutCleanup = null; }
    _end();
};

window._maybeLaunchTutorial = function() {
    if (localStorage.getItem(_TUT_KEY)) return;
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
    const target   = (!isCenter && step.target) ? document.querySelector(step.target) : null;

    _buildBackdrop(target, isCenter);
    _buildBox(step, target);

    if (step.type === 'action-tab' && target) {
        _hookActionTab(step, target);
    }
}

/* ──────────────────────────────────────────────────────────────
   DOM BUILDERS
────────────────────────────────────────────────────────────── */
function _buildBackdrop(target, isCenter) {
    // Fullscreen dark overlay — blocks all pointer events
    const overlay = document.createElement('div');
    overlay.id = 'tut-overlay';
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:9980',
        'pointer-events:all', 'background:rgba(0,0,0,0.78)',
    ].join(';');
    // Allow clicks through to "Avanti" / "Salta" buttons in the box (handled by higher z-index)
    document.body.appendChild(overlay);
    _tutOverlay = overlay;

    if (!target || isCenter) return;

    // Spotlight: canvas punched-out area around target
    const cv = document.createElement('canvas');
    cv.id = 'tut-canvas';
    cv.style.cssText = 'position:fixed;inset:0;z-index:9981;pointer-events:none;';
    cv.width  = window.innerWidth;
    cv.height = window.innerHeight;
    const ctx = cv.getContext('2d');
    const pad = 10;
    const r   = target.getBoundingClientRect();
    // Redraw overlay with hole
    overlay.style.background = 'transparent';
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.clearRect(r.left - pad, r.top - pad, r.width + pad * 2, r.height + pad * 2);
    document.body.appendChild(cv);
    _tutCanvas = cv;

    // Elevate target above overlay so it remains clickable
    _tutTarget = target;
    target.dataset.tutOrigZ = target.style.zIndex || '';
    target.dataset.tutOrigPos = target.style.position || '';
    target.style.position = 'relative';
    target.style.zIndex   = '9990';
}

function _buildBox(step, target) {
    const isCenter = step.type === 'intro' || step.type === 'outro';
    const isAction = step.type === 'action-tab' || step.type === 'action-click';
    const isLast   = step.type === 'outro';
    const isFirst  = step.type === 'intro';

    const sp = _TUT_SPEAKER;
    const progress = _tutStep + 1;
    const total    = _TUT_STEPS.length;

    // Button area
    const btnHtml = isAction
        ? `<span style="font-size:9px;color:rgba(255,255,255,0.35);font-style:italic">↑ Clicca l'elemento evidenziato per continuare</span>`
        : `<div style="display:flex;gap:8px;align-items:center">
            <button onclick="window.tutorialSkip()" style="font-size:9px;padding:3px 10px;background:transparent;border:1px solid rgba(255,255,255,0.12);color:#6b7280;border-radius:4px;cursor:pointer">Salta</button>
            <button onclick="window.tutorialNext()" style="font-size:10px;padding:4px 14px;background:rgba(212,175,55,0.18);border:1px solid rgba(212,175,55,0.5);color:#d4af37;border-radius:4px;cursor:pointer;font-weight:700">${isLast ? '🚀 Cominciamo!' : isFirst ? 'Inizia →' : 'Avanti →'}</button>
           </div>`;

    // Progress dots
    const dots = Array.from({ length: total }, (_, i) => {
        const active = i === _tutStep;
        const done   = i < _tutStep;
        return `<span style="width:${active ? 16 : 5}px;height:5px;border-radius:3px;background:${active ? '#d4af37' : done ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.12)'};transition:all 0.3s;display:inline-block"></span>`;
    }).join('');

    const box = document.createElement('div');
    box.id = 'tut-box';
    box.style.cssText = [
        'position:fixed', 'z-index:9999',
        'background:#0d1117',
        'border:1px solid rgba(212,175,55,0.45)',
        'border-radius:12px',
        'padding:16px 18px 14px',
        'max-width:300px', 'width:90%',
        'box-shadow:0 8px 48px rgba(0,0,0,0.9),0 0 0 1px rgba(212,175,55,0.15)',
        'pointer-events:all',
    ].join(';');

    box.innerHTML = `
        <!-- Speaker -->
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <div style="width:26px;height:26px;border-radius:50%;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.45);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#d4af37;flex-shrink:0">${sp.initial}</div>
            <div>
                <div style="font-size:10px;font-weight:700;color:#d4af37;line-height:1">${sp.name}</div>
                <div style="font-size:8px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.08em">${sp.faction}</div>
            </div>
        </div>
        <!-- Title -->
        <div style="font-size:12px;font-weight:800;color:white;margin-bottom:6px;line-height:1.2">${step.title}</div>
        <!-- Body -->
        <div style="font-size:10.5px;color:#9ca3af;line-height:1.6;margin-bottom:14px">${step.body}</div>
        <!-- Footer -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
            <div style="display:flex;gap:4px;align-items:center">${dots}</div>
            ${btnHtml}
        </div>
    `;

    // Positioning
    if (isCenter || !target) {
        box.style.top       = '50%';
        box.style.left      = '50%';
        box.style.transform = 'translate(-50%,-50%)';
    } else {
        _positionBox(box, target, step.arrow || 'bottom');
    }

    document.body.appendChild(box);
    _tutBox = box;
}

function _positionBox(box, target, arrow) {
    const r   = target.getBoundingClientRect();
    const bW  = 300;
    const bH  = 200; // estimated
    const gap = 18;
    const vW  = window.innerWidth;
    const vH  = window.innerHeight;

    let left, top;
    if (arrow === 'bottom') {
        left = Math.min(r.left, vW - bW - 8);
        top  = r.bottom + gap;
        if (top + bH > vH - 8) top = r.top - bH - gap;
    } else if (arrow === 'right') {
        left = r.right + gap;
        top  = Math.max(8, r.top);
        if (left + bW > vW - 8) left = r.left - bW - gap;
    } else if (arrow === 'left') {
        left = r.left - bW - gap;
        top  = Math.max(8, r.top);
        if (left < 8) left = r.right + gap;
    } else {
        // center — near the container but centered
        left = Math.max(8, Math.min(r.left + r.width / 2 - bW / 2, vW - bW - 8));
        top  = Math.max(8, Math.min(r.top + 60, vH - bH - 8));
    }

    // Final clamp
    left = Math.max(8, Math.min(left, vW - bW - 8));
    top  = Math.max(8, Math.min(top, vH - bH - 8));

    box.style.left = `${left}px`;
    box.style.top  = `${top}px`;
}

/* ──────────────────────────────────────────────────────────────
   ACTION-TAB HOOK
────────────────────────────────────────────────────────────── */
function _hookActionTab(step, target) {
    // If the player is already on this tab, auto-advance
    if (target.classList.contains('active')) {
        setTimeout(() => window.tutorialNext(), 400);
        return;
    }

    // Patch window.switchTab to detect navigation
    const origSwitch = window.switchTab;

    const cleanup = () => {
        if (window.switchTab !== origSwitch) window.switchTab = origSwitch;
        _restoreTarget(target);
    };

    window.switchTab = function(tab) {
        origSwitch.apply(this, arguments);
        if (tab === step.tab) {
            window.switchTab = origSwitch;
            _restoreTarget(target);
            _tutCleanup = null;
            setTimeout(() => {
                _tutStep++;
                _render();
            }, 300);
        }
    };

    _tutCleanup = cleanup;
}

function _restoreTarget(target) {
    if (!target) return;
    target.style.zIndex   = target.dataset.tutOrigZ   || '';
    target.style.position = target.dataset.tutOrigPos || '';
    delete target.dataset.tutOrigZ;
    delete target.dataset.tutOrigPos;
    _tutTarget = null;
}

/* ──────────────────────────────────────────────────────────────
   CLEANUP & END
────────────────────────────────────────────────────────────── */
function _clearDOM() {
    document.getElementById('tut-box')?.remove();
    document.getElementById('tut-overlay')?.remove();
    document.getElementById('tut-canvas')?.remove();
    _tutBox = _tutOverlay = _tutCanvas = null;
    if (_tutTarget) { _restoreTarget(_tutTarget); }
}

function _end() {
    _clearDOM();
    if (_tutCleanup) { _tutCleanup(); _tutCleanup = null; }
    localStorage.setItem(_TUT_KEY, '1');
}
