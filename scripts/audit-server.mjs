#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════════
   audit-server.mjs — una riga per ogni funzione del server, presa dal server

   Fase 1 di PIANO-CHIUSURA.md. La domanda a cui risponde è sempre la stessa:
   «il server fa davvero quello che il client crede?». Tre cose l'hanno resa
   necessaria in due giorni:

     · il meteo fermo dal 15 agosto (un cron che falliva da 5127 giri);
     · `rpc_credit_real_estate_rents` con scritto sopra «solo service_role» e il
       permesso aperto a chiunque, perché il GRANT non toglie niente a PUBLIC;
     · quattro funzioni che non chiamava nessuno — né browser né sveglia.

   Nessuna di queste si vede leggendo i file .sql del repo: si vedono solo
   chiedendo al database vivo com'è fatto ADESSO, e confrontandolo col codice
   che gira nel browser. Questo script fa esattamente quel confronto e scrive
   due file:

     docs/AUDIT-SERVER.md   la tabella leggibile, i problemi in cima
     docs/SCHEMA-RPC.json   la fotografia delle firme, che il guardrail
                            test/guardrail/contratto-client-server.test.js usa
                            per accorgersi offline se una firma cambia

   Uso:  source ~/.config/ce-supabase.env && npm run audit
   ════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF    = 'twstjbykstaioaahfqbe';
const TOKEN  = process.env.SUPABASE_ACCESS_TOKEN;

async function sql(query) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query }),
    });
    if (!r.ok) throw new Error(`query fallita (${r.status}): ${(await r.text()).slice(0, 300)}`);
    return r.json();
}

/* Le Edge Function sono l'altro browser: chiamano le RPC come il client, ma non
   stanno nella cartella dei .js del gioco. Dimenticarle vuol dire scrivere
   «non la chiama nessuno» sotto una funzione che gira ogni ora. */
function edgeFunctions() {
    const base = join(RADICE, 'supabase/functions');
    const trovati = [];
    let cartelle;
    try { cartelle = readdirSync(base, { withFileTypes: true }); } catch { return trovati; }
    for (const c of cartelle) {
        if (!c.isDirectory()) continue;
        for (const f of readdirSync(join(base, c.name))) {
            if (/\.(ts|js)$/.test(f)) trovati.push({ nome: `edge:${c.name}`, percorso: join(base, c.name, f) });
        }
    }
    return trovati;
}

/* ── 1. Chi chiama cosa, dal lato browser ──────────────────────────────────
   Due forme: `sb.rpc('nome', {...})` e il passaggio interno `_rpc('nome', {…})`
   di serverState.js. Prendo anche le chiavi dell'oggetto argomenti, perché è lì
   che si nasconde il disallineamento che non dà errore in fase di scrittura. */
function chiamateDelClient() {
    const chiamate = new Map();   // nome RPC → [{ file, riga, argomenti[] }]
    const file = readdirSync(RADICE).filter(f => f.endsWith('.js'))
        .map(f => ({ nome: f, percorso: join(RADICE, f) }))
        .concat(edgeFunctions());

    for (const { nome: f, percorso } of file) {
        const righe = readFileSync(percorso, 'utf8').split('\n');
        righe.forEach((testo, i) => {
            const re = /\b_?rpc\(\s*['"]([a-z_0-9]+)['"]\s*(,\s*\{([^}]*)\})?/g;
            let m;
            while ((m = re.exec(testo)) !== null) {
                const argomenti = (m[3] || '')
                    .split(',')
                    .map(p => (p.split(':')[0] || '').trim())
                    .filter(p => /^[a-z_][a-z_0-9]*$/i.test(p));
                if (!chiamate.has(m[1])) chiamate.set(m[1], []);
                chiamate.get(m[1]).push({ file: f, riga: i + 1, argomenti });
            }
        });
    }
    return chiamate;
}

/* ── 2. Chi chiama cosa, dal lato sveglie ─────────────────────────────────── */
async function chiamateDelCron() {
    const righe = await sql(`SELECT jobname, command, active FROM cron.job`);
    const per = new Map();
    for (const r of righe) {
        for (const m of String(r.command).matchAll(/([a-z_0-9]+)\s*\(/g)) {
            if (!per.has(m[1])) per.set(m[1], []);
            per.get(m[1]).push(r.jobname + (r.active ? '' : ' (SPENTO)'));
        }
    }
    return per;
}

/* ── 3. Le funzioni, dal database vivo ─────────────────────────────────────
   `proacl` NULL vuol dire «permessi di default», cioè eseguibile da PUBLIC:
   è il caso peggiore travestito da casella vuota, non da assenza di dati. */
async function funzioniDelServer() {
    return sql(`
        SELECT p.proname                                        AS nome,
               pg_get_function_identity_arguments(p.oid)        AS firma,
               p.prosecdef                                      AS definer,
               p.proacl IS NULL                                 AS acl_default,
               has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
               has_function_privilege('authenticated', p.oid, 'EXECUTE') AS autenticato,
               p.prorettype = 'trigger'::regtype                AS e_trigger,
               p.prosrc                                         AS corpo
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prokind = 'f'
         ORDER BY p.proname`);
}

/* Una funzione può non essere chiamata da nessun bottone e lavorare lo stesso:
   la invoca un'altra funzione (`_process_judicial_auctions` chiama le sue
   sorelle) o un trigger. Senza questo controllo l'audit griderebbe «morta» sopra
   metà del server, e a furia di falsi allarmi non lo guarderebbe più nessuno. */
function chiamateInterne(funzioni) {
    const per = new Map();
    const nomi = funzioni.map(f => f.nome);
    for (const f of funzioni) {
        for (const n of nomi) {
            if (n === f.nome) continue;
            if (new RegExp(`\\b${n}\\s*\\(`).test(f.corpo)) {
                if (!per.has(n)) per.set(n, []);
                per.get(n).push(`${f.nome}()`);
            }
        }
    }
    return per;
}

async function funzioniDeiTrigger() {
    const righe = await sql(`
        SELECT DISTINCT p.proname AS nome, t.tgname AS trigger
          FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
         WHERE NOT t.tgisinternal`);
    const per = new Map();
    for (const r of righe) {
        if (!per.has(r.nome)) per.set(r.nome, []);
        per.get(r.nome).push(`trigger:${r.trigger}`);
    }
    return per;
}

/* ── I verdetti ────────────────────────────────────────────────────────────
   «Non la chiama nessuno» è una domanda, non una risposta: alcune di queste
   funzioni sono buchi (gli affitti mai accreditati), altre sono avanzi di
   un'architettura precedente, altre ancora appartengono a schede spente. La
   differenza la decide una persona, e la decisione va scritta da qualche parte
   che si rigenera insieme al documento — altrimenti il prossimo che lancia
   `npm run audit` rifà lo stesso ragionamento da zero.

   Il posto giusto è qui e non nel .md, perché il .md è generato: quello che si
   scrive a mano lì dentro sparisce al giro dopo.

   Chi aggiunge una RPC che nessuno chiama trova un «⚠️ manca il verdetto» in
   fondo al documento finché non scrive qui cosa ne pensa. */
const VERDETTI = {
    rpc_cleanup_expired_listings: 'Chiusa a tutti (71). NON va schedulata finché cancella invece di restituire: l\'annuncio scaduto è l\'unico modo che ha il venditore di riavere l\'auto.',
    rpc_update_fuel_price:        'Chiusa a tutti (71). Non schedulata: `fuel_market` non la legge nessuno, il prezzo del gasolio è locale (engine-daily.js). Decisione di gioco → DOMANDE-PER-VLAD.md §6.',
    rpc_expire_tourism_contracts: 'Chiusa a tutti (72). Involucro di `_process_tourism_tenders`, che il cron `bandi-turistici` chiama già per conto suo.',
    rpc_claim_daily_reward:       'Lasciata aperta ad `authenticated` ma inutilizzata: il premio giornaliero lo calcola il browser. Le due tabelle dei premi non coincidono → DOMANDE-PER-VLAD.md §5.',
    rpc_nemesis_fund_rival:       'Resta revocata: regala €50.000 a un altro giocatore, 5 volte l\'ora, e l\'unico controllo è «non a te stesso». Due account d\'accordo stampano denaro. `nemesis.js` la chiama e incassa il rifiuto senza rompersi → DOMANDE-PER-VLAD.md §7.',
    rpc_nemesis_bribe_vip:        'Superata: `_nemesisBribeVip` paga la corruzione con `CE_money.spend`, che passa già dal server. Doppione da togliere quando si chiude il sistema nemesi (fase 3).',
    rpc_earn:                     'Avanzo del cancello del denaro precedente: oggi tutto passa da `CE_money` → `rpc_sync_cash`. Da togliere quando si sarà sicuri che nessuno la usi.',
    rpc_spend:                    'Come `rpc_earn`: stessa architettura precedente, stesso destino.',
    rpc_save_game_state:          'Il salvataggio passa da `ServerState`, non da qui. Avanzo.',
    rpc_advance_time:             'Il tempo lo tiene il client; il mondo condiviso si muove coi cron. Avanzo.',
    rpc_update_weather:           'Il meteo vero arriva dalla Edge Function `fetch-weather` in `real_world_status`. Avanzo.',
    rpc_get_hq_leaderboard:       'HQ è spento (`HQ_ENABLED = false` in config.js). Coerente.',
    rpc_update_hq_status:         'HQ è spento (`HQ_ENABLED = false`). Coerente.',
    rpc_generate_dispatch:        'Le corse le genera il motore locale. La coda `dispatches` lato server non è mai stata usata dal gioco.',
    rpc_dismiss_dispatch:         'Stessa coda `dispatches` mai usata.',
    rpc_read_message:             'La posta di gioco vive nel salvataggio locale, non in una tabella.',
    rpc_b2b_sla_event:            'La penale SLA del B2B non è mai stata collegata: un guasto in corsa non abbassa il punteggio del contratto. Da guardare quando tocca al sistema B2B (fase 3).',
    rpc_invite_to_alliance:       'Gli inviti ai consorzi esistono sul server e non hanno interfaccia: si entra solo dalla lista pubblica. Da guardare col sistema consorzi (fase 3).',
    rpc_respond_invite:           'Metà mancante degli inviti ai consorzi (vedi sopra).',
    rpc_credit_dc_purchase:       'La chiama Stripe, non il gioco: è già ristretta a `service_role` e la catena dell\'acquisto va provata con una carta vera → DOMANDE-PER-VLAD.md §1.',
};

const scriveDiretto = (c) => /\b(insert\s+into|update\s+\w|delete\s+from)\b/i.test(c);
const denaroDiretto = (c) => /\b(cash|driver_coins|vtk_balance|vtk_today|balance)\b/i.test(c) && scriveDiretto(c);
const guardia       = (c) => /auth\.uid\(\)|_my_company_id\(\)/.test(c);

/* Un involucro è pericoloso quanto ciò che avvolge. `rpc_expire_tourism_contracts`
   è tutta qui: `SELECT public._process_tourism_tenders();`. Nel suo corpo non c'è
   una sola scrittura, quindi al primo giro l'audit l'ha data per innocua — mentre
   chiude i bandi turistici di tutti e sposta denaro, e chiunque poteva chiamarla
   senza avere un account. Quindi: chi chiama una funzione che scrive, scrive; chi
   chiama una funzione che muove denaro, muove denaro. Si ripete finché i due
   insiemi smettono di crescere, perché le catene sono lunghe più di un anello. */
function propagaEffetti(funzioni) {
    const perNome = new Map(funzioni.map(f => [f.nome, f]));
    const scrive  = new Set(funzioni.filter(f => scriveDiretto(f.corpo)).map(f => f.nome));
    const soldi   = new Set(funzioni.filter(f => denaroDiretto(f.corpo)).map(f => f.nome));

    let cambiato = true;
    while (cambiato) {
        cambiato = false;
        for (const f of funzioni) {
            for (const nome of perNome.keys()) {
                if (nome === f.nome) continue;
                if (!new RegExp(`\\b${nome}\\s*\\(`).test(f.corpo)) continue;
                if (scrive.has(nome) && !scrive.has(f.nome)) { scrive.add(f.nome); cambiato = true; }
                if (soldi.has(nome)  && !soldi.has(f.nome))  { soldi.add(f.nome);  cambiato = true; }
            }
        }
    }
    return { scrive, soldi };
}

function riga(f, client, cron, interne, trigger, effetti) {
    const scrive = effetti.scrive.has(f.nome);
    const soldi  = effetti.soldi.has(f.nome);
    const chiamanti = [];
    if (client)  chiamanti.push(...[...new Set(client.map(c => c.file))]);
    if (cron)    chiamanti.push(...cron.map(j => `cron:${j}`));
    if (trigger) chiamanti.push(...trigger);
    if (interne) chiamanti.push(...interne);

    /* Una funzione-trigger non è raggiungibile via HTTP: PostgREST non la espone
       perché non si può chiamare senza il contesto di una riga. Il permesso a
       PUBLIC lì dentro non apre niente a nessuno. */
    const raggiungibile = !f.e_trigger;

    const problemi = [];
    if (raggiungibile && f.anon && scrive && !guardia(f.corpo))
        problemi.push('**eseguibile senza account e scrive senza controllo d\'identità**');
    if (raggiungibile && soldi && !guardia(f.corpo) && (f.anon || f.autenticato))
        problemi.push('**muove denaro senza controllo d\'identità**');
    if (!chiamanti.length && f.nome.startsWith('rpc_'))
        problemi.push('non la chiama nessuno: né browser né sveglia né un\'altra funzione');
    /* Il rovescio della revoca: chiudere troppo. Se un file del gioco chiama una
       funzione che `authenticated` non può più eseguire, il bottone smette di
       funzionare in produzione e nei test non si vede, perché i test il server
       non lo chiamano. Questa riga è la rete sotto le migrazioni 71 e 72. */
    /* Le Edge Function non contano: girano con la chiave `service_role`, che ha
       i permessi suoi. Contano solo i file che finiscono nel browser. */
    const daBrowser = [...new Set((client || []).filter(c => !c.file.startsWith('edge:')).map(c => c.file))];
    if (daBrowser.length && !f.autenticato)
        problemi.push(`**la chiama il browser (${daBrowser.join(', ')}) ma \`authenticated\` non può eseguirla**`);

    return {
        nome:      f.nome,
        firma:     f.firma || '',
        chiamanti: chiamanti.length ? chiamanti.join(', ') : '—',
        chi:       f.e_trigger ? 'trigger' : f.anon ? 'chiunque' : f.autenticato ? 'con account' : 'solo server',
        scrive:    scrive ? (soldi ? '€' : 'sì') : 'no',
        guardia:   guardia(f.corpo) ? 'sì' : '—',
        problemi,
    };
}

if (!TOKEN) {
    console.log('\x1b[31mManca SUPABASE_ACCESS_TOKEN.\x1b[0m  source ~/.config/ce-supabase.env');
    process.exit(1);
}

const [funzioni, cron, trigger] = await Promise.all([
    funzioniDelServer(), chiamateDelCron(), funzioniDeiTrigger(),
]);
const client  = chiamateDelClient();
const interne = chiamateInterne(funzioni);
const effetti = propagaEffetti(funzioni);
const righe   = funzioni.map(f => riga(f, client.get(f.nome), cron.get(f.nome),
                                       interne.get(f.nome), trigger.get(f.nome), effetti));

/* Chiamate del client verso funzioni che sul server non esistono: il bottone
   che fallisce solo in produzione, e solo quando qualcuno lo preme. */
const esistenti = new Set(funzioni.map(f => f.nome));
const fantasmi  = [...client.keys()].filter(n => !esistenti.has(n));

const conProblemi = righe.filter(r => r.problemi.length);
const oggi = new Date().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

let md = `# Audit del server — una riga per funzione

> Generato da \`npm run audit\` leggendo il **database vivo**, non i file .sql del
> repo. Rigenerarlo dopo ogni migrazione. Il piano che lo governa è
> \`PIANO-CHIUSURA.md\` (Fase 1).

Aggiornato: ${oggi}

| | |
|---|---|
| Funzioni in \`public\` | **${righe.length}** |
| Chiamate dal browser | ${righe.filter(r => r.chiamanti !== '—' && !r.chiamanti.startsWith('cron:')).length} |
| Su una sveglia | ${[...cron.keys()].length} |
| Con qualcosa da guardare | **${conProblemi.length}** |
| Chiamate dal client che sul server non esistono | **${fantasmi.length}** |

`;

if (fantasmi.length) {
    md += `## ⛔ Il client chiama funzioni che non esistono\n\n`;
    for (const n of fantasmi) {
        const dove = client.get(n).map(c => `${c.file}:${c.riga}`).join(', ');
        md += `- \`${n}\` — chiamata da ${dove}\n`;
    }
    md += '\n';
}

md += `## Da guardare\n\n`;
if (!conProblemi.length) md += `Niente: nessuna funzione è aperta a chi non ha un account senza controllare\nl'identità, nessuna muove denaro senza guardia, e ogni RPC ha un chiamante.\n\n`;
else {
    md += `Il verdetto sta in \`scripts/audit-server.mjs\` (mappa \`VERDETTI\`) e non qui,\nperché questo documento si rigenera e si porterebbe via ciò che scrivi a mano.\n\n`;
    for (const r of conProblemi) {
        md += `- \`${r.nome}\` — ${r.problemi.join(' · ')}\n`;
        md += VERDETTI[r.nome] ? `  · **${VERDETTI[r.nome]}**\n` : `  · ⚠️ **manca il verdetto**: chi deve poterla chiamare? Scriverlo in \`VERDETTI\`.\n`;
    }
    md += '\n';
}

const senzaVerdetto = conProblemi.filter(r => !VERDETTI[r.nome]).length;

md += `## Tutte le funzioni

Legenda — **Chi**: chi può eseguirla · **Scrive**: \`€\` cambia denaro, \`sì\` cambia
altro, \`no\` legge soltanto · **Guardia**: contiene \`auth.uid()\` o
\`_my_company_id()\` · **Chiamata da**: file del browser e sveglie.

| Funzione | Chi | Scrive | Guardia | Chiamata da |
|---|---|---|---|---|
`;
for (const r of righe) {
    md += `| \`${r.nome}\` | ${r.chi} | ${r.scrive} | ${r.guardia} | ${r.chiamanti} |\n`;
}

writeFileSync(join(RADICE, 'docs/AUDIT-SERVER.md'), md);

/* La fotografia delle firme: nomi degli argomenti compresi. Serve al guardrail
   per accorgersi *offline* che una firma è cambiata, senza rete e senza segreti. */
/* Ogni nome porta una LISTA di firme, non una sola: `rpc_add_driver_coins` e
   `rpc_activate_alliance_perk` esistono in due versioni con argomenti diversi.
   Tenendone una sola, il guardrail dava per sbagliata una chiamata giusta —
   e cambiava idea a ogni rigenerazione, a seconda di quale delle due arrivava
   per ultima. */
const schema = {};
for (const f of funzioni) {
    const argomenti = (f.firma || '')
        .split(',')
        .map(a => a.trim().split(/\s+/)[0])
        .filter(a => /^[a-z_][a-z_0-9]*$/i.test(a));
    (schema[f.nome] ||= []).push(argomenti);
}
writeFileSync(join(RADICE, 'docs/SCHEMA-RPC.json'),
    JSON.stringify({ aggiornato: new Date().toISOString(), funzioni: schema }, null, 1) + '\n');

console.log(`docs/AUDIT-SERVER.md   ${righe.length} funzioni, ${conProblemi.length} da guardare`
    + (senzaVerdetto ? `, \x1b[33m${senzaVerdetto} senza verdetto\x1b[0m` : ', tutte con un verdetto'));
console.log(`docs/SCHEMA-RPC.json   ${Object.keys(schema).length} firme`);
if (fantasmi.length) console.log(`\x1b[31m${fantasmi.length} chiamate del client verso funzioni inesistenti\x1b[0m`);
