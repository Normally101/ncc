'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   guardrail/azioni-senza-argomenti — il pattern che ha rotto Vittorio.

   events.js invoca ogni azione come  fn.apply(el, parseArgs(el).concat([ev])):
   l'Event e' SEMPRE l'ultimo argomento. Quando il markup non porta
   data-ce-args, la lista degli argomenti e' vuota e l'Event finisce
   sul PRIMO parametro dichiarato dalla funzione.

   Il 29/08 e' costato la cassa a NaN: il bottone "Ripaga" di vittorio.js non
   aveva args, quindi `repayVittorio(amount)` riceveva un Event, `amount != null`
   era true e Math.min(Event, ...) dava NaN — che nessuna guardia fermava,
   perche' NaN <= 0 e' false. Da li' il not-null constraint sulla colonna cash.

   Questo test censisce OGNI punto che invoca un'azione senza argomenti — sia il
   markup letterale (data-ce-act="x" senza data-ce-args) sia l'helper
   ceAct('x') / ceAct('x', []) — e pretende che la funzione chiamata:
     • non dichiari parametri, OPPURE
     • dichiari come primo parametro l'evento stesso (ev/e/event), che e'
       esattamente cio' che riceve.
   Qualunque altro caso e' un Vittorio in attesa di succedere: o si passano gli
   argomenti nel markup, o il primo parametro va reso opzionale e validato.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

// Nomi che dichiarano apertamente di aspettarsi l'Event: per loro il passaggio
// implicito e' il comportamento voluto, non un incidente.
const NOMI_EVENTO = new Set(['ev', 'e', 'event', 'evt']);

function fileDelProgetto() {
    return fs.readdirSync(ROOT)
        .filter(f => (f.endsWith('.js') || f.endsWith('.html')) && !f.startsWith('.') && f !== 'sw.js');
}

// ── 1) parametri dichiarati da ogni funzione globale ───────────────────────
// Le definizioni `window.X = ...` hanno la precedenza sulle omonime locali di
// altri file: e' la globale che events.js va a cercare. (Caso reale:
// buyHRAutomation esiste sia come globale a zero parametri in ui-ops.js sia
// come funzione interna a serverState.js con due — solo la prima e' invocabile.)
function mappaParametri(files) {
    const globali = new Map();   // window.X = function (...)
    const locali  = new Map();   // function X (...)
    const alias   = new Map();   // window.X = Y;
    for (const f of files) {
        if (!f.endsWith('.js')) continue;
        const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
        const righeFino = (i) => src.slice(0, i).split('\n').length;

        let m;
        const reGlob = /(?:^|[\s;{(])window\.([A-Za-z0-9_$]+)\s*=\s*(?:async\s+)?(?:function\s*\*?\s*[A-Za-z0-9_$]*\s*\(([^)]*)\)|\(([^)]*)\)\s*=>|([A-Za-z0-9_$]+)\s*=>)/g;
        while ((m = reGlob.exec(src))) {
            const par = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
            if (!globali.has(m[1])) globali.set(m[1], { file: f, line: righeFino(m.index), params: elenca(par) });
        }
        const reLoc = /(?:^|[\s;{(])(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/g;
        while ((m = reLoc.exec(src))) {
            if (!locali.has(m[1])) locali.set(m[1], { file: f, line: righeFino(m.index), params: elenca(m[2]) });
        }
        // window.X = Y;  (alias verso una funzione gia' definita altrove)
        const reAlias = /(?:^|[\s;{(])window\.([A-Za-z0-9_$]+)\s*=\s*([A-Za-z0-9_$]+)\s*;/g;
        while ((m = reAlias.exec(src))) if (!alias.has(m[1])) alias.set(m[1], m[2]);
    }
    return { globali, locali, alias };
}

function elenca(raw) {
    return String(raw || '').split(',').map(s => s.trim()).filter(Boolean);
}

function risolvi({ globali, locali, alias }, nome) {
    if (globali.has(nome)) return globali.get(nome);
    if (alias.has(nome)) {
        const bersaglio = alias.get(nome);
        if (globali.has(bersaglio)) return globali.get(bersaglio);
        if (locali.has(bersaglio)) return locali.get(bersaglio);
    }
    if (locali.has(nome)) return locali.get(nome);
    return null;
}

// ── 2) tutti i punti che invocano un'azione, con o senza argomenti ─────────
function censisciPunti(files) {
    const punti = [];
    for (const f of files) {
        const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
        const riga = (i) => src.slice(0, i).split('\n').length;
        let m;

        // a) markup letterale: data-ce-act="nome"
        const reMarkup = /data-ce-act\s*=\s*\\?["']\s*([A-Za-z0-9_$]+)/g;
        while ((m = reMarkup.exec(src))) {
            // Il tag puo' essere spezzato fra concatenazioni: si guarda avanti fino
            // al prossimo data-ce-act (o 400 caratteri), che e' sicuramente un altro tag.
            const coda = src.slice(m.index, m.index + 400);
            const prossimo = coda.slice(12).indexOf('data-ce-act');
            const finestra = prossimo >= 0 ? coda.slice(0, prossimo + 12) : coda;
            punti.push({ file: f, line: riga(m.index), nome: m[1], conArgs: /data-ce-args/.test(finestra) });
        }

        // b) helper: ceAct('nome', [...])
        const reHelper = /\bceAct\s*\(\s*(['"`])([A-Za-z0-9_$]+)\1\s*(,)?/g;
        while ((m = reHelper.exec(src))) {
            let conArgs = false;
            if (m[3]) {
                const resto = src.slice(m.index + m[0].length).trimStart();
                conArgs = !/^(\[\s*\]|null|undefined|false|0)\s*[,)]/.test(resto);
            }
            punti.push({ file: f, line: riga(m.index), nome: m[2], conArgs });
        }
    }
    return punti;
}

describe('guardrail/azioni-senza-argomenti — nessun Event al posto di un parametro vero', () => {
    const files = fileDelProgetto();
    const definizioni = mappaParametri(files);
    const punti = censisciPunti(files);
    const senzaArgomenti = punti.filter(p => !p.conArgs);

    test('il censimento trova davvero i punti d\'azione (se va a zero, il test non sta guardando niente)', () => {
        assert.ok(punti.length > 300, `attesi centinaia di punti data-ce-act/ceAct, trovati ${punti.length}`);
        assert.ok(senzaArgomenti.length > 0, 'ci sono di sicuro azioni senza argomenti: se sono zero il censimento e\' rotto');
    });

    test('ogni azione invocata senza argomenti ha una definizione rintracciabile', () => {
        const persi = [...new Set(
            senzaArgomenti.filter(p => !risolvi(definizioni, p.nome)).map(p => `${p.nome} (${p.file}:${p.line})`)
        )];
        assert.deepEqual(persi, [],
            'azioni invocate ma non definite: o e\' un nome sbagliato nel markup (click morto) o il censimento non sa leggerne la definizione');
    });

    test('nessuna azione senza argomenti riceve l\'Event al posto di un parametro vero (il bug di Vittorio)', () => {
        const colpevoli = [];
        for (const p of senzaArgomenti) {
            const def = risolvi(definizioni, p.nome);
            if (!def || def.params.length === 0) continue;
            const primo = def.params[0].replace(/^\.\.\./, '').split(/[=\s]/)[0];
            if (NOMI_EVENTO.has(primo)) continue;      // dichiara di volere l'evento: e' cio' che riceve
            colpevoli.push(
                `${p.nome}(${def.params.join(', ')}) — definita in ${def.file}:${def.line}, ` +
                `invocata senza data-ce-args da ${p.file}:${p.line}`
            );
        }
        assert.deepEqual(colpevoli, [],
            'Queste azioni ricevono l\'Event nel primo parametro (events.js:41 fa fn.apply(el, args.concat([ev]))).\n' +
            'Rimedio: passare gli argomenti nel markup — ceAct(\'nome\', [valore]) — oppure validare il parametro\n' +
            'con Number.isFinite/typeof prima di usarlo, come e\' stato fatto in repayVittorio.');
    });
});
