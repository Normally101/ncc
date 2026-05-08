'use strict';
/* ================================================================
   tutorial.js — Chauffeur Empire · Tutorial Interattivo Spotlight v1.0
   ================================================================ */

const _TUT_KEY = 'chauffeurEmpireTutorialDone';

const _TUT_STEPS = [
    {
        target: '#tb-cash',
        title: '💰 La Tua Cassa',
        body: 'Qui vedi la liquidità della tua agenzia. Non andare in rosso per più di 3 giorni consecutivi o rischi il fallimento!',
        position: 'bottom',
    },
    {
        target: '#tb-rep',
        title: '⭐ Reputazione',
        body: 'La tua reputazione (0–5★) determina il tipo di clienti che attiri, i driver che puoi assumere e gli investimenti accessibili. Coltivala!',
        position: 'bottom',
    },
    {
        target: '[data-tab="corse"]',
        title: '🚕 Dispatch Center',
        body: 'Il Dispatch Center mostra le corse disponibili. Assegna un autista a ogni corsa per iniziare a guadagnare. Standard=verde, Business=blu, VIP=viola, Ultra=nero.',
        position: 'right',
    },
    {
        target: '[data-tab="staff"]',
        title: '👤 I Tuoi Autisti',
        body: 'Nella sezione Staff gestisci gli autisti: fatica, morale, soddisfazione, specializzazioni e ora anche la foto profilo! Tienili riposati.',
        position: 'right',
    },
    {
        target: '[data-tab="fleet"]',
        title: '🚗 Flotta',
        body: 'Acquista, potenzia e gestisci i veicoli. Il Deposito Carburante aziendale è fondamentale per non fermare la flotta!',
        position: 'right',
    },
    {
        target: '[data-tab="invest"]',
        title: '📈 Investimenti & M&A',
        body: 'Compra asset che generano reddito passivo. Nella sezione Venture Capital puoi acquisire quote di agenzie rivali per diversificare le entrate.',
        position: 'right',
    },
    {
        target: '[data-tab="finance"]',
        title: '📊 Finanza',
        body: 'Trading azionario, investimenti broker e il mercato finanziario globale. Alto rischio, alto rendimento!',
        position: 'right',
    },
    {
        target: '[data-tab="politics"]',
        title: '🏛️ Politica & Lobbying',
        body: 'Dona al fondo lobbying per acquisire punti politici. Usa quei punti per approvare leggi che favoriscono la tua agenzia (esenzioni ZTL, sussidi carburante, ecc.).',
        position: 'right',
    },
    {
        target: null,
        title: '🎉 Benvenuto in Chauffeur Empire!',
        body: 'Ora sai tutto. Buona fortuna, CEO. Il mercato NCC italiano ti aspetta. Espandi in tutte le 20 regioni e raggiungi 5★ per dominare il settore!',
        position: 'center',
    },
];

let _tutStep = 0;
let _tutOverlay = null;

window.startTutorial = function() {
    _tutStep = 0;
    _showTutStep();
};

window.tutorialNext = function() {
    _tutStep++;
    if (_tutStep >= _TUT_STEPS.length) {
        _endTutorial();
    } else {
        _showTutStep();
    }
};

window.tutorialSkip = function() {
    _endTutorial();
};

function _endTutorial() {
    if (_tutOverlay) { _tutOverlay.remove(); _tutOverlay = null; }
    localStorage.setItem(_TUT_KEY, '1');
    // Clean up spotlight
    const spot = document.getElementById('tut-spotlight');
    if (spot) spot.remove();
}

function _showTutStep() {
    const step = _TUT_STEPS[_tutStep];
    if (!step) { _endTutorial(); return; }

    // Remove old overlay
    if (_tutOverlay) _tutOverlay.remove();
    const oldSpot = document.getElementById('tut-spotlight');
    if (oldSpot) oldSpot.remove();

    const isCenter = step.position === 'center' || !step.target;

    // Create spotlight overlay
    const overlay = document.createElement('div');
    overlay.id = 'tut-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9990;pointer-events:none;';

    let targetRect = null;
    if (step.target) {
        const el = document.querySelector(step.target);
        if (el) targetRect = el.getBoundingClientRect();
    }

    // Dark backdrop with cutout
    const backdrop = document.createElement('canvas');
    backdrop.id = 'tut-spotlight';
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:9990;pointer-events:none;';
    backdrop.width  = window.innerWidth;
    backdrop.height = window.innerHeight;
    const ctx = backdrop.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, backdrop.width, backdrop.height);
    if (targetRect && !isCenter) {
        const pad = 8;
        ctx.clearRect(
            targetRect.left - pad, targetRect.top - pad,
            targetRect.width + pad * 2, targetRect.height + pad * 2
        );
    }
    document.body.appendChild(backdrop);

    // Tooltip box
    const box = document.createElement('div');
    box.id = 'tut-box';
    box.style.cssText = `
        position: fixed; z-index: 9999; background: #0d1117;
        border: 1px solid rgba(212,175,55,0.6);
        border-radius: 0.75rem; padding: 1rem 1.25rem; max-width: 280px;
        box-shadow: 0 4px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(212,175,55,0.2);
        pointer-events: all;
    `;

    box.innerHTML = `
        <div style="font-size:0.85rem;font-weight:bold;color:#d4af37;margin-bottom:0.4rem">${step.title}</div>
        <div style="font-size:0.72rem;color:#d1d5db;line-height:1.5;margin-bottom:0.85rem">${step.body}</div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;align-items:center">
            <span style="font-size:0.6rem;color:#6b7280">${_tutStep + 1}/${_TUT_STEPS.length}</span>
            <button onclick="window.tutorialSkip()" style="font-size:0.6rem;padding:0.2rem 0.6rem;background:transparent;border:1px solid rgba(255,255,255,0.15);color:#9ca3af;border-radius:0.3rem;cursor:pointer">Salta</button>
            <button onclick="window.tutorialNext()" style="font-size:0.65rem;padding:0.25rem 0.85rem;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.5);color:#d4af37;border-radius:0.3rem;cursor:pointer;font-weight:bold">${_tutStep === _TUT_STEPS.length - 1 ? 'Fine!' : 'Avanti →'}</button>
        </div>
    `;

    // Position the tooltip
    if (isCenter || !targetRect) {
        box.style.top  = '50%';
        box.style.left = '50%';
        box.style.transform = 'translate(-50%, -50%)';
    } else {
        const margin = 16;
        if (step.position === 'bottom') {
            box.style.top  = `${targetRect.bottom + margin}px`;
            box.style.left = `${Math.max(8, targetRect.left)}px`;
        } else if (step.position === 'right') {
            box.style.top  = `${Math.max(8, targetRect.top)}px`;
            box.style.left = `${targetRect.right + margin}px`;
        } else {
            box.style.top  = `${targetRect.bottom + margin}px`;
            box.style.left = `${targetRect.left}px`;
        }
        // Clamp to viewport
        const boxW = 280, boxH = 180;
        const lf = parseFloat(box.style.left);
        const tp = parseFloat(box.style.top);
        if (lf + boxW > window.innerWidth - 8) box.style.left = `${window.innerWidth - boxW - 8}px`;
        if (tp + boxH > window.innerHeight - 8) box.style.top  = `${window.innerHeight - boxH - 8}px`;
    }

    document.body.appendChild(box);
    _tutOverlay = box;
}

// Auto-start on first game load (after slot selector closes)
window._maybeLaunchTutorial = function() {
    if (localStorage.getItem(_TUT_KEY)) return;
    setTimeout(() => window.startTutorial(), 1200);
};
