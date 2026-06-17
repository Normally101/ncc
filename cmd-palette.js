'use strict';
/* ====================================================================
   cmd-palette.js — Chauffeur Empire
   Command palette per saltare rapidamente a una delle ~29 sezioni.
   Riduce il sovraccarico da legge di Hick: invece di scorrere la
   sidebar, l'utente preme ⌘K / Ctrl+K (o il campo "Cerca" in cima
   alla sidebar) e digita.
   Legge i .sidebar-item dal DOM a runtime → zero duplicazione,
   sempre in sync con la navigazione esistente.
   ==================================================================== */

(function () {
    let _selIdx = 0;

    function _collectTabs() {
        return Array.from(document.querySelectorAll('.sidebar-item[data-tab]'))
            .map(el => ({ tab: el.getAttribute('data-tab'), label: (el.textContent || '').trim() }))
            .filter(t => t.tab && t.label)
            // dedup (alcuni tab possono comparire in più gruppi)
            .filter((t, i, arr) => arr.findIndex(x => x.tab === t.tab) === i);
    }

    function _filtered(q) {
        q = (q || '').toLowerCase().trim();
        const items = _collectTabs();
        if (!q) return items;
        return items.filter(t => t.label.toLowerCase().includes(q) || t.tab.toLowerCase().includes(q));
    }

    window.openCmdPalette = function () {
        if (document.getElementById('cmdp-overlay')) return;
        _selIdx = 0;
        const ov = document.createElement('div');
        ov.id = 'cmdp-overlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:var(--z-cmdpalette);background:rgba(1,4,9,0.72);display:flex;align-items:flex-start;justify-content:center;padding-top:12vh';
        ov.innerHTML = `
          <div style="width:90%;max-width:460px;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,0.6)">
            <input id="cmdp-input" type="text" placeholder="Cerca una sezione…" autocomplete="off" spellcheck="false"
              style="width:100%;box-sizing:border-box;padding:13px 16px;background:#0d1117;border:none;border-bottom:1px solid #21262d;color:#e6edf3;font-size:13px;outline:none;font-family:inherit">
            <div id="cmdp-list" style="max-height:52vh;overflow-y:auto"></div>
            <div style="padding:7px 14px;border-top:1px solid #21262d;font-size:9px;color:#6b7280;font-family:monospace;display:flex;gap:14px">
              <span>↑↓ naviga</span><span>↵ apri</span><span>esc chiudi</span>
            </div>
          </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('mousedown', e => { if (e.target === ov) window.closeCmdPalette(); });

        const input = document.getElementById('cmdp-input');
        input.addEventListener('input', () => { _selIdx = 0; _renderList(input.value); });
        input.addEventListener('keydown', _onKey);
        _renderList('');
        setTimeout(() => input.focus(), 20);
    };

    window.closeCmdPalette = function () {
        const el = document.getElementById('cmdp-overlay');
        if (el) el.remove();
    };

    function _renderList(q) {
        const list = document.getElementById('cmdp-list');
        if (!list) return;
        const rows = _filtered(q);
        if (_selIdx >= rows.length) _selIdx = Math.max(0, rows.length - 1);
        if (!rows.length) {
            list.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;font-size:12px">Nessuna sezione trovata</div>';
            return;
        }
        list.innerHTML = rows.map((t, i) => `
          <div class="cmdp-row" data-tab="${t.tab}" data-idx="${i}"
            style="padding:10px 16px;font-size:12px;cursor:pointer;color:#e6edf3;border-left:2px solid ${i === _selIdx ? '#d4af37' : 'transparent'};background:${i === _selIdx ? 'rgba(212,175,55,0.10)' : 'transparent'}">
            ${t.label}
          </div>`).join('');
        list.querySelectorAll('.cmdp-row').forEach(row => {
            row.addEventListener('mouseenter', () => { _selIdx = +row.dataset.idx; _highlight(); });
            row.addEventListener('mousedown', e => { e.preventDefault(); _go(row.dataset.tab); });
        });
    }

    function _highlight() {
        document.querySelectorAll('#cmdp-list .cmdp-row').forEach((row, i) => {
            const on = i === _selIdx;
            row.style.background = on ? 'rgba(212,175,55,0.10)' : 'transparent';
            row.style.borderLeft = on ? '2px solid #d4af37' : '2px solid transparent';
            if (on) row.scrollIntoView({ block: 'nearest' });
        });
    }

    function _onKey(e) {
        const input = document.getElementById('cmdp-input');
        const rows = _filtered(input ? input.value : '');
        if (e.key === 'ArrowDown')      { e.preventDefault(); _selIdx = Math.min(rows.length - 1, _selIdx + 1); _highlight(); }
        else if (e.key === 'ArrowUp')   { e.preventDefault(); _selIdx = Math.max(0, _selIdx - 1); _highlight(); }
        else if (e.key === 'Enter')     { e.preventDefault(); if (rows[_selIdx]) _go(rows[_selIdx].tab); }
        else if (e.key === 'Escape')    { e.preventDefault(); window.closeCmdPalette(); }
    }

    function _go(tab) {
        window.closeCmdPalette();
        if (typeof window.switchTab === 'function') window.switchTab(tab);
    }

    // Global shortcut: ⌘K / Ctrl+K toggles the palette
    document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            if (document.getElementById('cmdp-overlay')) window.closeCmdPalette();
            else window.openCmdPalette();
        }
    });
})();
