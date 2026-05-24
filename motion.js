'use strict';
/* ================================================================
   motion.js — Chauffeur Empire
   Lightweight vanilla motion layer.
   No dependencies. Loaded last in index.html.
   ================================================================ */

// ── 1. Button ripple ─────────────────────────────────────────────
document.addEventListener('click', function(e) {
    const btn = e.target.closest('.ds-btn, .ops-action-btn, .ce-ripple-target');
    if (!btn) return;
    const ripple = document.createElement('span');
    ripple.className = 'ce-ripple';
    const r  = btn.getBoundingClientRect();
    const sz = Math.max(r.width, r.height) * 1.8;
    ripple.style.cssText = `width:${sz}px;height:${sz}px;left:${e.clientX-r.left-sz/2}px;top:${e.clientY-r.top-sz/2}px`;
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}, true);

// ── 2. Number count-up ───────────────────────────────────────────
window.ceCountUp = function(el, to, duration) {
    if (!el) return;
    const start = performance.now();
    const fmt   = el.dataset.fmt || 'int';
    function render(v) {
        if (fmt === 'eur') {
            el.textContent = v >= 1e6 ? '€'+(v/1e6).toFixed(2)+'M'
                           : v >= 1e3 ? '€'+(v/1e3).toFixed(1)+'k'
                           : '€'+Math.round(v);
        } else if (fmt === 'float2') {
            el.textContent = v.toFixed(2);
        } else {
            el.textContent = Math.round(v).toLocaleString('it-IT');
        }
    }
    function step(ts) {
        const p  = Math.min((ts - start) / duration, 1);
        const e2 = 1 - Math.pow(1 - p, 3);
        render(parseFloat(el.dataset.countup) * e2);
        if (p < 1) { requestAnimationFrame(step); }
        else        { el.classList.add('ce-count-flash'); }
    }
    render(0);
    requestAnimationFrame(step);
};

// Trigger all [data-countup] not yet animated ────────────────────
window._ceTriggerCountUps = function() {
    document.querySelectorAll('[data-countup]:not([data-counted])').forEach(el => {
        const v = parseFloat(el.dataset.countup);
        if (isNaN(v)) return;
        el.dataset.counted = '1';
        window.ceCountUp(el, v, 700);
    });
};

// ── 3. KPI card orbit glow ───────────────────────────────────────
window._ceKpiOrbit = function() {
    document.querySelectorAll('.ce-kpi-card').forEach(card => {
        if (card.querySelector('.ce-orbit')) return;
        const o = document.createElement('div');
        o.className = 'ce-orbit';
        card.appendChild(o);
    });
};

// ── 4. Stagger entrance ──────────────────────────────────────────
window._ceStagger = function(container, selector, delay) {
    const items = (container || document).querySelectorAll(selector);
    items.forEach((el, i) => {
        el.style.opacity   = '0';
        el.style.transform = 'translateY(12px)';
        el.style.transition = 'none';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const d = (delay||30) + i * 40;
                el.style.transition = `opacity 0.28s ease ${d}ms, transform 0.3s cubic-bezier(0.22,1,0.36,1) ${d}ms`;
                el.style.opacity    = '1';
                el.style.transform  = 'translateY(0)';
            });
        });
    });
};

// ── 5. Scroll-reveal ─────────────────────────────────────────────
const _ceIO = new IntersectionObserver(entries => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            e.target.classList.add('ce-revealed');
            _ceIO.unobserve(e.target);
        }
    });
}, { threshold: 0.06 });

window._ceRevealScan = function() {
    document.querySelectorAll('.ce-reveal:not(.ce-revealed)').forEach(el => _ceIO.observe(el));
};

// ── 6. Tab-switch hook ───────────────────────────────────────────
var _ceCountUpOnNext = false;

(function() {
    const orig = window.switchTab;
    if (!orig) return;
    window.switchTab = function(tab) {
        orig.apply(this, arguments);
        _ceCountUpOnNext = true;
        setTimeout(function() {
            const tc = document.getElementById('tab-container');
            window._ceStagger(tc, '.ds-card, .ce-kpi-card', 40);
            window._ceKpiOrbit();
            window._ceRevealScan();
        }, 60);
    };
})();

// ── 7. Mutation observer → run after any tab render ──────────────
window.addEventListener('load', function() {
    const tc = document.getElementById('tab-container');
    if (!tc) return;

    new MutationObserver(function(muts) {
        for (const m of muts) {
            if (!m.addedNodes.length) continue;
            setTimeout(function() {
                window._ceStagger(tc, '.ds-card, .ce-kpi-card', 30);
                window._ceKpiOrbit();
                window._ceRevealScan();
                if (_ceCountUpOnNext) {
                    _ceCountUpOnNext = false;
                    window._ceTriggerCountUps();
                }
            }, 25);
            break;
        }
    }).observe(tc, { childList: true });

    // Initial state
    window._ceKpiOrbit();
    window._ceRevealScan();
    _ceCountUpOnNext = true;
    setTimeout(window._ceTriggerCountUps, 400);
});
