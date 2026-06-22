'use strict';
/* ================================================================
   events.js — Event delegation layer (CSP-safe)
   Permette di rimuovere 'unsafe-inline' da script-src: nessun handler
   inline (onclick=...) nel markup.

   USO nel markup generato (dentro i template literal dei render):
     <button ${ceAct('hireDriver', [d.id])}>Assumi</button>
   genera:  <button data-ce-act="hireDriver" data-ce-args='[123]'>…</button>

   Il listener delegato su document intercetta l'evento (default 'click';
   override con data-ce-on="change|input|submit|keydown"), legge il nome
   funzione da data-ce-act e gli argomenti (JSON) da data-ce-args, e invoca
   window[fn].apply(elemento, [...args, event]).
   - 'this' dentro la funzione = elemento (così i vecchi handler che usavano
     this.value / this.style / this.getBoundingClientRect funzionano).
   - l'ultimo argomento passato è sempre l'event (le funzioni che non lo
     usano lo ignorano; quelle keydown leggono ev.key).
   ================================================================ */
(function () {
    function parseArgs(el) {
        var raw = el.getAttribute('data-ce-args');
        if (raw == null || raw === '') return [];
        try { return JSON.parse(raw); }
        catch (e) { console.warn('[events] data-ce-args non JSON:', raw, e); return []; }
    }

    function dispatch(ev, type) {
        var t = ev.target;
        if (!t || typeof t.closest !== 'function') return;
        var el = t.closest('[data-ce-act]');
        if (!el) return;
        var on = el.getAttribute('data-ce-on') || 'click';
        if (on !== type) return;
        if (el.disabled) return;
        var fnName = el.getAttribute('data-ce-act');
        var fn = window[fnName];
        if (typeof fn !== 'function') { console.warn('[events] azione sconosciuta:', fnName); return; }
        if (el.tagName === 'A') ev.preventDefault();   // link-azione: replica il vecchio "return false"
        try {
            fn.apply(el, parseArgs(el).concat([ev]));
        } catch (err) {
            console.error('[events] errore in azione', fnName, err);
        }
    }

    document.addEventListener('click',   function (e) { dispatch(e, 'click'); });
    document.addEventListener('change',  function (e) { dispatch(e, 'change'); });
    document.addEventListener('input',   function (e) { dispatch(e, 'input'); });
    document.addEventListener('submit',  function (e) { dispatch(e, 'submit'); });
    document.addEventListener('keydown', function (e) { dispatch(e, 'keydown'); });

    // onerror su <img> (gli error non bubblano -> capture). data-ce-imgerr="hide"|"hideShowPrev"
    document.addEventListener('error', function (e) {
        var el = e.target;
        if (!el || el.tagName !== 'IMG') return;
        var mode = el.getAttribute('data-ce-imgerr');
        if (!mode) return;
        el.style.display = 'none';
        if (mode === 'hideShowPrev' && el.previousElementSibling) el.previousElementSibling.style.display = 'flex';
    }, true);

    /* Helper: genera gli attributi data-ce-* per il markup.
       fnName: nome di una funzione globale (window.fnName).
       args:   array di argomenti serializzabili in JSON (numeri, stringhe, bool, null).
       on:     tipo evento ('click' default, 'change', 'input', 'submit', 'keydown'). */
    window.ceAct = function (fnName, args, on) {
        var out = 'data-ce-act="' + fnName + '"';
        if (args && args.length) {
            var j = JSON.stringify(args)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
            out += " data-ce-args='" + j + "'";
        }
        if (on && on !== 'click') out += ' data-ce-on="' + on + '"';
        return out;
    };

    /* ── Helper d'azione condivisi (sostituiscono pattern di codice inline ripetuti) ── */

    // rimuove un elemento per id (chiusura modali)
    window.ceRemove = function (id) { var el = document.getElementById(id); if (el) el.remove(); };

    // inoltra il click a un altro elemento per id (es. trigger input file nascosto)
    window.ceClick = function (id) { var el = document.getElementById(id); if (el) el.click(); };

    // refreshFn(true) [-> Promise] poi renderFn(renderArg)
    window.ceThen = function (refreshFn, renderFn, renderArg) {
        var done = function () { if (typeof window[renderFn] === 'function') window[renderFn](renderArg); };
        var p = typeof window[refreshFn] === 'function' ? window[refreshFn](true) : null;
        if (p && typeof p.then === 'function') p.then(done); else done();
    };

    // window[obj][prop]=value (o window[obj]=value se prop null) poi renderFn()
    window.ceSetRender = function (obj, prop, value, renderFn) {
        if (prop) { (window[obj] = window[obj] || {})[prop] = value; } else { window[obj] = value; }
        if (typeof window[renderFn] === 'function') window[renderFn]();
    };

    // come ceSetRender ma senza re-render: setta valore + sposta la classe 'active'
    // sul bottone cliccato (this) togliendola dai fratelli che matchano groupSel
    window.ceSetActive = function (obj, prop, value, groupSel) {
        if (prop) { (window[obj] = window[obj] || {})[prop] = value; } else { window[obj] = value; }
        if (groupSel) document.querySelectorAll(groupSel).forEach(function (b) { b.classList.remove('active'); });
        if (this && this.classList) this.classList.add('active');
    };
})();
