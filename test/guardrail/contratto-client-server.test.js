'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   guardrail/contratto-client-server — le due metà devono parlare la stessa lingua.

   Fra il browser e il database non c'è un compilatore. Il client scrive
   `sb.rpc('rpc_buy_real_estate', { v_listing_id: id })`; PostgREST cerca una
   funzione con QUEL nome e QUEGLI argomenti, e se non la trova risponde 404
   PGRST202 — a chi ha premuto il bottone, in produzione. Un nome storpiato o un
   argomento rinominato lato server non fanno rumore da nessuna altra parte:
   i test girano in locale e col server non parlano.

   È già successo due volte, e sono state due sere di caccia:
     · `rpc_get_vtk_market_orders` chiamata dal mercato VTK e mai definita da
       nessun file .sql (15/08) — il mercato rispondeva 404 e sembrava vuoto;
     · `rpc_daily_dividends` che il client leggeva come oggetto
       (`data.status === 'already_paid'`) mentre sul server restituiva ancora un
       numero, perché la migrazione che la cambiava non era mai stata applicata
       (31/08).

   Il confronto vero lo fa `npm run audit`, che interroga il database vivo e
   salva la fotografia in docs/SCHEMA-RPC.json. Questo test rifà il confronto
   OFFLINE contro quella fotografia: niente rete, niente segreti, dentro
   `npm test`. Quando qualcuno cambia una firma sul server e rigenera lo schema,
   è qui che diventa rosso — non in produzione.

   Se lo schema manca, il test lo dice e si ferma: meglio un rosso che spiega
   cosa lanciare, che un verde che non ha controllato niente.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT   = path.resolve(__dirname, '..', '..');
const SCHEMA = path.join(ROOT, 'docs', 'SCHEMA-RPC.json');

/* Le chiamate stanno anche su più righe (nemesis.js ne ha una di quattro), quindi
   il file si legge intero e l'oggetto degli argomenti si chiude contando le
   graffe: una regex sola non sa dove finisce `{ … }`. */
function chiamateRpc(testo) {
    const trovate = [];
    const re = /\b_?rpc\(\s*'([a-z_0-9]+)'/g;
    let m;
    while ((m = re.exec(testo)) !== null) {
        const nome = m[1];
        let i = re.lastIndex;
        while (i < testo.length && /[\s,]/.test(testo[i])) i++;
        if (testo[i] !== '{') { trovate.push({ nome, argomenti: [], riga: riga(testo, m.index) }); continue; }

        let profondita = 0, fine = i;
        for (; fine < testo.length; fine++) {
            if (testo[fine] === '{') profondita++;
            else if (testo[fine] === '}' && --profondita === 0) break;
        }
        const corpo = testo.slice(i + 1, fine);
        /* Solo le chiavi del PRIMO livello: `{ p_payload: { x: 1 } }` ha un solo
           argomento, non due. Le annidate le salta il conteggio delle graffe. */
        const argomenti = [];
        let liv = 0;
        for (const pezzo of corpo.split(/([{}[\]])/)) {
            if (pezzo === '{' || pezzo === '[') { liv++; continue; }
            if (pezzo === '}' || pezzo === ']') { liv--; continue; }
            if (liv !== 0) continue;
            for (const parte of pezzo.split(',')) {
                const chiave = (parte.split(':')[0] || '').trim();
                if (/^[a-z_][a-z_0-9]*$/i.test(chiave) && parte.includes(':')) argomenti.push(chiave);
            }
        }
        trovate.push({ nome, argomenti, riga: riga(testo, m.index) });
    }
    return trovate;
}

const riga = (testo, i) => testo.slice(0, i).split('\n').length;

function fileDelGioco() {
    return fs.readdirSync(ROOT).filter(f => f.endsWith('.js') && !f.startsWith('.'));
}

describe('guardrail/contratto-client-server', () => {
    const esiste = fs.existsSync(SCHEMA);

    test('la fotografia delle firme del server esiste', () => {
        assert.ok(esiste,
            'docs/SCHEMA-RPC.json non c\'è: lanciare `source ~/.config/ce-supabase.env && npm run audit`');
    });

    if (!esiste) return;

    const schema   = JSON.parse(fs.readFileSync(SCHEMA, 'utf8')).funzioni;
    const chiamate = [];
    for (const f of fileDelGioco()) {
        for (const c of chiamateRpc(fs.readFileSync(path.join(ROOT, f), 'utf8'))) {
            chiamate.push({ ...c, file: f });
        }
    }

    test('il client non chiama funzioni che sul server non esistono', () => {
        const fantasmi = chiamate.filter(c => !(c.nome in schema));
        assert.deepEqual(fantasmi.map(c => `${c.file}:${c.riga} → ${c.nome}`), [],
            'queste chiamate rispondono 404 PGRST202 a chi preme il bottone');
    });

    test('ogni argomento passato è un parametro vero della funzione', () => {
        const sbagliati = [];
        for (const c of chiamate) {
            const firme = schema[c.nome];
            if (!firme) continue;                        // già coperto dal test sopra
            /* Un nome può avere più firme: `rpc_add_driver_coins` esiste con uno e
               con due argomenti. Basta che una regga la chiamata. */
            const regge = firme.some(f => c.argomenti.every(a => f.includes(a)));
            if (!regge) {
                const viste = firme.map(f => f.length ? f.join(', ') : 'nessun argomento').join('  |  ');
                sbagliati.push(`${c.file}:${c.riga} → ${c.nome}(${c.argomenti.join(', ')}) — il server ha ${viste}`);
            }
        }
        assert.deepEqual(sbagliati, [],
            'PostgREST cerca la funzione per nome E per nomi degli argomenti: se non combaciano, non la trova');
    });

    test('almeno un centinaio di chiamate sono state esaminate', () => {
        /* Se una modifica al modo di chiamare le RPC rende cieca l'estrazione,
           i due test sopra diventerebbero verdi per vuoto. Questo lo impedisce. */
        assert.ok(chiamate.length >= 100, `trovate solo ${chiamate.length} chiamate: l'estrazione non sta più leggendo il codice`);
    });
});
