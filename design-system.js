'use strict';
/* ================================================================
   design-system.js — Chauffeur Empire · Reusable UI Components
   All DS functions return HTML strings for innerHTML injection.
   Loaded early — before dispatcher.js
   ================================================================ */

window.DS = {

    // ── Section Header ──────────────────────────────────────────
    header({ eyebrow = '', title = '', subtitle = '', actions = '' } = {}) {
        return `<div class="ds-header">
            <div class="ds-header-left">
                ${eyebrow ? `<div class="ds-eyebrow">${window.CE_Sec?.escHtml(eyebrow) ?? eyebrow}</div>` : ''}
                <div class="ds-title">${window.CE_Sec?.escHtml(title) ?? title}</div>
                ${subtitle ? `<div class="ds-subtitle">${window.CE_Sec?.escHtml(subtitle) ?? subtitle}</div>` : ''}
            </div>
            ${actions ? `<div class="ds-header-actions">${actions}</div>` : ''}
        </div>`;
    },

    // ── KPI Strip ───────────────────────────────────────────────
    // items: [{ label, val, sub, delta, color }]
    kpiStrip(items = []) {
        const cells = items.map(k => `
            <div class="ds-kpi">
                <div class="ds-kpi-label">${window.CE_Sec?.escHtml(k.label) ?? k.label}</div>
                <div class="ds-kpi-val${k.color ? ` ds-kpi-val--${k.color}` : ''}">${k.val ?? '—'}</div>
                ${k.sub   ? `<div class="ds-kpi-sub">${window.CE_Sec?.escHtml(String(k.sub)) ?? k.sub}</div>` : ''}
                ${k.delta !== undefined ? `<div class="ds-kpi-delta ${k.delta >= 0 ? 'up' : 'down'}">${k.delta >= 0 ? '▲' : '▼'} ${Math.abs(k.delta)}%</div>` : ''}
            </div>
        `).join('');
        return `<div class="ds-kpi-strip">${cells}</div>`;
    },

    // ── Terminal Card ────────────────────────────────────────────
    card({ mod = '', content = '', padding = '' } = {}) {
        const style = padding ? ` style="padding:${padding}"` : '';
        return `<div class="ds-card${mod ? ` ds-card--${mod}` : ''}"${style}>${content}</div>`;
    },

    // ── Alert Pill / Badge ────────────────────────────────────────
    pill(text, color = 'blue', blink = false) {
        const blinkClass = blink ? ' blink' : '';
        return `<span class="ds-pill ds-pill--${color}${blinkClass}">${window.CE_Sec?.escHtml(String(text)) ?? text}</span>`;
    },

    // ── Button ────────────────────────────────────────────────────
    btn({ label = 'OK', color = 'blue', onclick = '', icon = '', disabled = false, size = '' } = {}) {
        const disAttr = disabled ? ' disabled' : '';
        const sizeStyle = size === 'sm' ? ' style="padding:5px 10px;font-size:9px"' : '';
        return `<button class="ds-btn ds-btn--${color}"${disAttr}${sizeStyle}${onclick ? ` onclick="${onclick}"` : ''}>${icon ? `${icon} ` : ''}${window.CE_Sec?.escHtml(label) ?? label}</button>`;
    },

    // ── Progress Bar ──────────────────────────────────────────────
    progress(pct, color = '') {
        const clamp = Math.max(0, Math.min(100, pct));
        const fillClass = color ? ` ds-progress-fill--${color}` : '';
        return `<div class="ds-progress"><div class="ds-progress-fill${fillClass}" style="width:${clamp}%"></div></div>`;
    },

    // ── Empty State ───────────────────────────────────────────────
    empty({ icon = '📭', title = 'Nessun dato', body = '' } = {}) {
        return `<div class="ds-empty">
            <div class="ds-empty-icon">${icon}</div>
            <div class="ds-empty-title">${window.CE_Sec?.escHtml(title) ?? title}</div>
            ${body ? `<div class="ds-empty-body">${window.CE_Sec?.escHtml(body) ?? body}</div>` : ''}
        </div>`;
    },

    // ── Data Table ─────────────────────────────────────────────────
    // cols: [{ label, key, align?, render? }]
    // rows: array of objects
    table(cols = [], rows = []) {
        const esc = (s) => window.CE_Sec?.escHtml(String(s ?? '')) ?? String(s ?? '');
        const head = cols.map(c => `<th${c.align ? ` class="col-${c.align}"` : ''}>${esc(c.label)}</th>`).join('');
        const body = rows.length === 0
            ? `<tr><td colspan="${cols.length}" style="text-align:center;color:var(--text-muted);padding:24px">Nessun dato</td></tr>`
            : rows.map(row => {
                const tds = cols.map(c => {
                    const raw = c.render ? c.render(row) : esc(row[c.key]);
                    return `<td${c.align ? ` class="col-${c.align}"` : ''}>${raw}</td>`;
                }).join('');
                return `<tr>${tds}</tr>`;
              }).join('');
        return `<div class="ds-table-wrap">
            <table class="ds-table">
                <thead><tr>${head}</tr></thead>
                <tbody>${body}</tbody>
            </table>
        </div>`;
    },

    // ── Skeleton Loader ────────────────────────────────────────────
    skeleton(lines = 3) {
        return Array.from({ length: lines }, (_, i) => {
            const w = [80, 60, 70][i % 3];
            return `<div class="ds-skel" style="height:14px;width:${w}%;margin-bottom:10px"></div>`;
        }).join('');
    },

    // ── CEO Stress Bar ─────────────────────────────────────────────
    stressBar(pct = 0) {
        const level = pct < 35 ? 'low' : pct < 70 ? 'medium' : 'high';
        const color = { low: 'var(--green)', medium: 'var(--orange)', high: 'var(--red)' }[level];
        return `<div class="ds-stress-bar">
            <div class="ds-stress-track">
                <div class="ds-stress-fill" data-level="${level}" style="width:${pct}%;background:${color}"></div>
            </div>
            <div class="ds-stress-label" style="color:${color}">${pct}%</div>
        </div>`;
    },

    // ── Notification Toast ──────────────────────────────────────────
    // type: 'success' | 'error' | 'warning' | 'info'
    toast({ title = '', msg = '', type = 'info', duration = 4000 } = {}) {
        const icons = { success: '✅', error: '🔴', warning: '⚠️', info: 'ℹ️' };
        const id = 'toast-' + Date.now();
        const el = document.createElement('div');
        el.id = id;
        el.className = `ds-toast ds-toast--${type}`;
        el.innerHTML = `
            <div class="ds-toast-icon">${icons[type] || icons.info}</div>
            <div class="ds-toast-body">
                ${title ? `<div class="ds-toast-title">${window.CE_Sec?.escHtml(title) ?? title}</div>` : ''}
                ${msg   ? `<div class="ds-toast-msg">${window.CE_Sec?.escHtml(msg) ?? msg}</div>` : ''}
            </div>`;
        document.body.appendChild(el);
        el.addEventListener('click', () => el.remove());
        if (duration > 0) setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 350); }, duration);
        return id;
    },

    // ── Alert Notification Panel ────────────────────────────────────
    // Injects or updates the global alert panel (right side, below top bar)
    alert({ text = '', type = 'info', tab = null, duration = 8000 } = {}) {
        let panel = document.getElementById('ds-alert-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'ds-alert-panel';
            panel.className = 'ds-alert-panel';
            document.body.appendChild(panel);
        }
        const icons = { danger: '🚨', warning: '⚠', info: '◉', success: '✓' };
        const item = document.createElement('div');
        item.className = `ds-alert-item type-${type}`;
        item.innerHTML = `${icons[type] || icons.info} <span class="ds-alert-text">${window.CE_Sec?.escHtml(text) ?? text}</span>`;
        if (tab) item.onclick = () => { if (typeof switchTab === 'function') switchTab(tab); item.remove(); };
        panel.prepend(item);
        if (duration > 0) setTimeout(() => { item.style.opacity = '0'; setTimeout(() => item.remove(), 300); }, duration);
    },
};
