'use strict';
/* ============================================================================
   Guardrail contrasto: testo secondario su fondo scuro (garage).

   Vlad ha segnalato testo quasi invisibile su fondo scuro in tre zone:
   Obiettivi, tabella classifica e card di marketing (Google Ads, Social
   Media, Radio...). La causa era il grigio scuro legacy (#6b7280 / #4b5563)
   usato negli inline style dei tab e nelle classi .campaign-*: su #161b22
   il rapporto di contrasto scende sotto 4.5:1 (WCAG AA).

   Non esiste un test automatico sensato sui pixel: questo guardrail verifica
   i NOMI — che le tre zone usino i colori chiari giusti e che i grigini
   scuri non tornino — e calcola il rapporto di contrasto reale delle
   coppie colore ammesse contro il fondo card #161b22.

   Regole codificate qui:
     - testo descrittivo su scuro: #e5e7eb o piu' chiaro;
     - testo muted/etichette su scuro: mai piu' scuro di #9ca3af;
     - font globale: stack sans-serif pulito stile eRepublik.
   ============================================================================ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

const leggi = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Grigi legacy troppo scuri su fondo scuro: non devono piu' comparire. */
const GRIGINI_SCURTI = ['#6b7280', '#4b5563', '#374151', '#1f2733', '#6a7480'];

const FOND_SCURRO = '#161b22'; // --em-card: fondo delle card nei tab

function luminanza(hex) {
    const n = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255)
        .map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rapportoContrasto(a, b) {
    const l1 = Math.max(luminanza(a), luminanza(b));
    const l2 = Math.min(luminanza(a), luminanza(b));
    return (l1 + 0.05) / (l2 + 0.05);
}

describe('guardrail — contrasto testo su fondo scuro', () => {
    const css = leggi('style.css');
    const ranking = leggi('ui-ranking.js');
    const marketing = leggi('ui-marketing.js');

    test('le coppie colore ammesse passano WCAG AA (>= 4.5:1) sul fondo card', () => {
        // muted al pavimento (#9ca3af) deve reggere: se un domani si sceglie
        // un grigio che non supera 4.5:1 su #161b22, questo test lo blocca.
        for (const colore of ['#9ca3af', '#98a1ae', '#e5e7eb', '#e6edf3']) {
            const r = rapportoContrasto(colore, FOND_SCURRO);
            assert.ok(r >= 4.5,
                `${colore} su ${FOND_SCURRO} ha contrasto ${r.toFixed(2)}:1, sotto WCAG AA`);
        }
    });

    test('Obiettivi: nessun grigio scuro legacy, descrizioni leggibili', () => {
        for (const g of GRIGINI_SCURTI) {
            assert.ok(!ranking.includes(g),
                `ui-ranking.js contiene ancora ${g} (sezione Obiettivi/classifica): sostituire con #9ca3af o piu' chiaro`);
        }
        const sezione = ranking.split('>Obiettivi (')[1] ?? '';
        assert.ok(sezione.length > 0, 'sezione Obiettivi non trovata in ui-ranking.js');
        assert.ok(sezione.includes('color:#9ca3af'),
            'le card Obiettivi devono usare color:#9ca3af o piu' + ' chiaro per nome/descrizione');
    });

    test('tabella classifica: intestazioni e valori leggibili, nomi aziende a #e5e7eb', () => {
        const ths = [...ranking.matchAll(/<th style="([^"]+)"/g)].map(m => m[1]);
        assert.ok(ths.length >= 8, 'attese almeno 8 colonne nella tabella classifica');
        for (const th of ths) {
            if (!/color:#c79a2a/.test(th)) { // la colonna Potere resta oro
                assert.ok(/color:#9ca3af/.test(th),
                    `intestazione classifica senza colore leggibile: "${th}"`);
            }
        }
        assert.ok(ranking.includes("nameclr = isMe ? '#c79a2a' : '#e5e7eb'"),
            'il nome azienda in classifica deve essere #e5e7eb (o oro se sei tu)');
    });

    test('card marketing (Google Ads, Social Media, Radio): descrizioni a #e5e7eb', () => {
        for (const classe of ['.campaign-desc', '.campaign-strat']) {
            const blocco = css.split(classe + ' {')[1]?.split('}')[0] ?? '';
            assert.ok(blocco.length > 0, `classe ${classe} mancante in style.css`);
            assert.ok(blocco.includes('#e5e7eb'),
                `${classe} deve usare #e5e7eb su fondo scuro, trovato: "${blocco.trim().replace(/\s+/g, ' ')}"`);
        }
        for (const g of GRIGINI_SCURTI) {
            assert.ok(!marketing.includes(g),
                `ui-marketing.js contiene ancora ${g}: sostituire con #9ca3af o piu' chiaro`);
        }
        assert.ok(css.includes('.mkt-roi-label { color: #9ca3af; }'),
            '.mkt-roi-label deve restare almeno #9ca3af');
    });

    test('kit .em: variabili muted/dim non piu' + ' scure di #9ca3af', () => {
        const emVars = css.match(/--em-muted:(#[0-9a-f]{6});\s*--em-dim:(#[0-9a-f]{6});/);
        assert.ok(emVars, 'variabili --em-muted/--em-dim non trovate in style.css');
        for (const v of [emVars[1], emVars[2]]) {
            assert.ok(rapportoContrasto(v, FOND_SCURRO) >= 4.5,
                `--em ${v} troppo scura su ${FOND_SCURRO}`);
        }
    });

    test('font globale: stack sans-serif pulito stile eRepublik', () => {
        const stack = "'Inter', 'Open Sans', Arial, Helvetica, sans-serif";
        const regoleBody = [...css.matchAll(/body\s*\{[^}]*\}/g)].map(m => m[0]);
        assert.ok(regoleBody.length >= 1, 'nessuna regola body in style.css');
        for (const regola of regoleBody) {
            if (!regola.includes('font-family')) continue; // regole body senza font non contano
            assert.ok(regola.includes(stack),
                `una regola body usa ancora un font-family diverso dallo stack eRepublik:\n${regola}`);
        }
        // il CSS allinea le dichiaraizioni con spazi multipli: normalizzo prima di confrontare
        const cssFlat = css.replace(/\s+/g, ' ');
        assert.ok(cssFlat.includes(`--font-body: ${stack};`),
            '--font-body deve allinearsi allo stesso stack');
    });
});
