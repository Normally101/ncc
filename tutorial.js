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
        body: 'Ho finito. Il mercato non aspetta spiegazioni — aspetta risultati. La tua <strong style="color:#d4af37">prima missione</strong> è già attiva nella tab Missioni. Completala. Poi ne parleremo.',
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
    if (_tutStep >= _TUT_STEPS.length) { _end(); } else { _render(); }
};

window.tutorialSkip = function() {
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
        }, 250);
        return;
    }

    const target = (!isCenter && step.target) ? document.querySelector(step.target) : null;
    _buildBackdrop(target, isCenter);
    _buildBox(step, target);
}

/* ──────────────────────────────────────────────────────────────
   DOM BUILDERS
────────────────────────────────────────────────────────────── */
function _buildBackdrop(target, isCenter) {
    const overlay = document.createElement('div');
    overlay.id = 'tut-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9500;pointer-events:all;background:rgba(0,0,0,0.78)';
    document.body.appendChild(overlay);
    _tutOverlay = overlay;

    if (!target || isCenter) return;

    const cv = document.createElement('canvas');
    cv.id = 'tut-canvas';
    cv.style.cssText = 'position:fixed;inset:0;z-index:9501;pointer-events:none;';
    cv.width  = window.innerWidth;
    cv.height = window.innerHeight;
    const ctx = cv.getContext('2d');
    const pad = 10;
    const r   = target.getBoundingClientRect();

    // Se il target è nascosto (width/height = 0) disegna solo l'overlay senza hole
    if (r.width > 0 && r.height > 0) {
        overlay.style.background = 'transparent';
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.clearRect(r.left - pad, r.top - pad, r.width + pad * 2, r.height + pad * 2);
        // Elevate target above overlay
        _tutTarget = target;
        target.dataset.tutOrigZ   = target.style.zIndex || '';
        target.dataset.tutOrigPos = target.style.position || '';
        target.style.position = 'relative';
        target.style.zIndex   = '9510';
    }

    document.body.appendChild(cv);
    _tutCanvas = cv;
}

function _buildBox(step, target) {
    const isCenter = step.type === 'intro' || step.type === 'outro';
    const isLast   = step.type === 'outro';
    const isFirst  = step.type === 'intro';

    const sp = _TUT_SPEAKER;
    const progress = _tutStep + 1;
    const total    = _TUT_STEPS.length;

    const btnHtml = `<div style="display:flex;gap:8px;align-items:center">
        <button onclick="window.tutorialSkip()" style="font-size:11px;padding:4px 12px;background:transparent;border:1px solid rgba(255,255,255,0.12);color:#6b7280;border-radius:4px;cursor:pointer">Salta</button>
        <button onclick="window.tutorialNext()" style="font-size:12px;padding:5px 16px;background:rgba(212,175,55,0.18);border:1px solid rgba(212,175,55,0.5);color:#d4af37;border-radius:4px;cursor:pointer;font-weight:700">${isLast ? '🚀 Cominciamo!' : isFirst ? 'Inizia →' : 'Avanti →'}</button>
    </div>`;

    const dots = Array.from({ length: total }, (_, i) => {
        const active = i === _tutStep;
        const done   = i < _tutStep;
        return `<span style="width:${active ? 16 : 5}px;height:5px;border-radius:3px;background:${active ? '#d4af37' : done ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.12)'};transition:all 0.3s;display:inline-block"></span>`;
    }).join('');

    const box = document.createElement('div');
    box.id = 'tut-box';
    box.style.cssText = [
        'position:fixed', 'z-index:9520',
        'background:#0d1117',
        'border:1px solid rgba(212,175,55,0.45)',
        'border-radius:12px',
        'padding:16px 18px 14px',
        'max-width:300px', 'width:90%',
        'box-shadow:0 8px 48px rgba(0,0,0,0.9),0 0 0 1px rgba(212,175,55,0.15)',
        'pointer-events:all',
    ].join(';');

    box.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <div style="width:32px;height:32px;border-radius:50%;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.45);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#d4af37;flex-shrink:0">${sp.initial}</div>
            <div>
                <div style="font-size:12px;font-weight:700;color:#d4af37;line-height:1">${sp.name}</div>
                <div style="font-size:10px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.08em">${sp.faction}</div>
            </div>
        </div>
        <div style="font-size:16px;font-weight:800;color:white;margin-bottom:8px;line-height:1.3">${step.title}</div>
        <div style="font-size:13px;color:#9ca3af;line-height:1.6;margin-bottom:16px">${step.body}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
            <div style="display:flex;gap:4px;align-items:center">${dots}</div>
            ${btnHtml}
        </div>
    `;

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
    const r  = target.getBoundingClientRect();
    const bW = 300;
    const bH = 200;
    const g  = 18;
    const vW = window.innerWidth;
    const vH = window.innerHeight;
    let left, top;

    if (r.width === 0 || r.height === 0) {
        // target nascosto — centra la box
        left = vW / 2 - bW / 2;
        top  = vH / 2 - bH / 2;
    } else if (arrow === 'bottom') {
        left = Math.min(r.left, vW - bW - 8);
        top  = r.bottom + g;
        if (top + bH > vH - 8) top = r.top - bH - g;
    } else if (arrow === 'right') {
        left = r.right + g;
        top  = Math.max(8, r.top);
        if (left + bW > vW - 8) left = r.left - bW - g;
    } else if (arrow === 'left') {
        left = r.left - bW - g;
        top  = Math.max(8, r.top);
        if (left < 8) left = r.right + g;
    } else {
        left = Math.max(8, Math.min(r.left + r.width / 2 - bW / 2, vW - bW - 8));
        top  = Math.max(8, Math.min(r.top + 60, vH - bH - 8));
    }

    box.style.left = `${Math.max(8, Math.min(left, vW - bW - 8))}px`;
    box.style.top  = `${Math.max(8, Math.min(top,  vH - bH - 8))}px`;
}

/* ──────────────────────────────────────────────────────────────
   CLEANUP & END
────────────────────────────────────────────────────────────── */
function _clearDOM() {
    document.getElementById('tut-box')?.remove();
    document.getElementById('tut-overlay')?.remove();
    document.getElementById('tut-canvas')?.remove();
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
