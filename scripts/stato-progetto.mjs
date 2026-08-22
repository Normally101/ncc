#!/usr/bin/env node
/**
 * Misura lo stato reale del gioco. Non lo racconta: lo conta.
 *
 * Perche' esiste: un documento di avanzamento scritto a mano invecchia in due
 * giorni e comincia a mentire, e a quel punto e' peggio del non averlo. Qui
 * ogni numero viene ricavato dal codice al momento in cui lo lanci, quindi non
 * puo' essere ottimista per distrazione.
 *
 * Uso:  node scripts/stato-progetto.mjs           (leggibile)
 *       node scripts/stato-progetto.mjs --json    (per generare la pagina)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leggi = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** I file che index.html carica davvero, che e' l'unico elenco che conta. */
function fileDelGioco() {
    const html = leggi('index.html');
    return [...new Set([...html.matchAll(/src="\.?\/?([a-z_0-9-]+\.js)/g)].map(m => m[1]))];
}

function dentroAlBanco() {
    const env = leggi('test-support/game-env.js');
    return fileDelGioco().filter(f => env.includes(`'${f}'`));
}

/** I file ancora ammessi a muovere denaro fuori dalla porta unica. */
function eccezioniDenaro() {
    const t = leggi('test/guardrail/una-sola-porta.test.js');
    const blocco = t.split('const ECCEZIONI = new Set([')[1]?.split(']);')[0] ?? '';
    return [...blocco.matchAll(/'([a-z_0-9.-]+\.js)'/g)].map(m => m[1]);
}

/** Le azioni del giocatore: il denominatore di tutto. */
function azioni() {
    const nomi = new Set();
    for (const f of [...fileDelGioco(), 'index.html']) {
        let testo;
        try { testo = leggi(f); } catch { continue; }
        for (const m of testo.matchAll(/ceAct\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)) nomi.add(m[1]);
        for (const m of testo.matchAll(/data-ce-act=\\?["']([A-Za-z_$][\w$]*)/g)) nomi.add(m[1]);
    }
    return [...nomi];
}

/** Esegue il guardrail delle azioni e legge il rapporto che stampa. */
function copertura() {
    try {
        const out = execFileSync('node', ['--test', 'test/guardrail/azioni-sincronizzano.test.js'],
            { cwd: ROOT, encoding: 'utf8', env: { ...process.env, AZIONI_VERBOSE: '1' }, timeout: 300_000 });
        /* `[^:\n]*` fra l'etichetta e i due punti: il guardrail scrive «azioni
           totali ESTRATTE: 242» e cercando «azioni totali:» il numero diventava
           zero in silenzio — il cruscotto mostrava «14/0» senza che niente si
           lamentasse. Un'etichetta che cambia di una parola non deve poter
           spegnere una misura. */
        const num = (etichetta) => Number(out.match(new RegExp(etichetta + '[^:\\n]*:\\s*(\\d+)'))?.[1] ?? 0);
        return {
            totali: num('azioni totali'),
            verificate: num('verificate e corrette'),
            rotte: num('rotte note \\(in attesa di conversione\\)'),
            cieche: num('non attivabili dal banco'),
        };
    } catch {
        return null; // il guardrail non gira: meglio nessun dato che un dato inventato
    }
}

/**
 * Un totale a zero non e' una misura: e' una lettura fallita.
 *
 * Il 22/08 il cruscotto ha mostrato per due giorni «15/246 azioni verificate»
 * e poi «14/0», e nessuno se n'e' accorto perche' uno zero sembra un numero
 * come un altro. Ma le azioni del gioco non possono essere zero: se il
 * denominatore sparisce vuol dire che l'etichetta stampata dal guardrail e'
 * cambiata e la lettura non l'ha seguita. Meglio urlare che pubblicare un
 * rapporto sbagliato.
 */
function controllaMisura(cop) {
    if (!cop) return;
    if (!cop.totali) {
        throw new Error(
            'Le azioni totali risultano ZERO: la lettura del guardrail non ha funzionato.\n' +
            'Controlla che le etichette stampate da test/guardrail/azioni-sincronizzano.test.js\n' +
            'corrispondano a quelle cercate in copertura(). Non mando misure inventate all\'hub.');
    }
}

function suite() {
    try {
        const out = execFileSync('npm', ['test'], { cwd: ROOT, encoding: 'utf8', timeout: 600_000 });
        return { totale: Number(out.match(/^ℹ tests (\d+)/m)?.[1] ?? 0), rossi: Number(out.match(/^ℹ fail (\d+)/m)?.[1] ?? 0) };
    } catch (e) {
        const out = (e.stdout ?? '') + (e.stderr ?? '');
        return { totale: Number(out.match(/^ℹ tests (\d+)/m)?.[1] ?? 0), rossi: Number(out.match(/^ℹ fail (\d+)/m)?.[1] ?? 0) };
    }
}

/**
 * La misura che conta davvero: quanti test si accorgono se la porta del denaro
 * smette di avvisare il server. Un numero alto di test non significa niente se
 * nessuno di quei test coglie il guasto che ci interessa.
 */
function reteDiSicurezza() {
    const originale = leggi('money.js');
    try {
        const mutato = originale
            .replace(/function _sincronizzaCassa\(\) \{/, 'function _sincronizzaCassa() { return;')
            .replace(/var p = window\.ServerState && window\.ServerState\.spendDriverCoins/, 'var p = false && window.ServerState.spendDriverCoins');
        fs.writeFileSync(path.join(ROOT, 'money.js'), mutato);
        const s = suite();
        return s.rossi;
    } finally {
        fs.writeFileSync(path.join(ROOT, 'money.js'), originale);
    }
}

const conMutazione = process.argv.includes('--veloce') ? null : reteDiSicurezza();
const tutti = fileDelGioco();
const banco = dentroAlBanco();
const ecc = eccezioniDenaro();
const cop = copertura();
controllaMisura(cop);
const s = suite();

const stato = {
    misuratoIl: new Date().toISOString(),
    test: s,
    reteDiSicurezza: conMutazione,
    file: { totali: tutti.length, nelBanco: banco.length, fuori: tutti.filter(f => !banco.includes(f)) },
    denaro: { eccezioniRimaste: ecc },
    azioni: cop ?? { totali: azioni().length },
};

if (process.argv.includes('--json')) {
    console.log(JSON.stringify(stato, null, 2));
} else {
    const pct = (a, b) => b ? `${Math.round((a / b) * 100)}%` : '—';
    console.log(`\nSTATO DI CHAUFFEUR EMPIRE — ${new Date().toLocaleString('it-IT')}\n`);
    console.log(`Test:              ${s.totale} (${s.rossi} rossi)`);
    if (conMutazione !== null) {
        console.log(`Rete di sicurezza: ${conMutazione} test si accorgono se il denaro smette di sincronizzare`);
    }
    console.log(`File eseguiti:     ${banco.length}/${tutti.length}  (${pct(banco.length, tutti.length)})`);
    if (cop) {
        console.log(`Azioni verificate: ${cop.verificate}/${cop.totali}  (${pct(cop.verificate, cop.totali)})`);
        console.log(`Azioni al buio:    ${cop.cieche}  — nessuno sa se funzionano`);
        console.log(`Azioni rotte note: ${cop.rotte}`);
    }
    console.log(`Porta del denaro:  ${ecc.length} file ancora fuori (${ecc.join(', ') || 'nessuno'})`);
    console.log('');
}

/* ── Invio all'hub ────────────────────────────────────────────────────────
   Con --hub la misura finisce nella pagina del progetto su Olga Studio, cosi'
   Vlad la vede dal telefono senza aprire un terminale. I segreti si leggono
   dall'ambiente: non stanno nel repository e non devono starci. */
if (process.argv.includes('--hub')) {
    const url = process.env.HUB_URL;
    const token = process.env.GIGI_API_TOKEN;
    if (!url || !token) {
        console.error('Per --hub servono HUB_URL e GIGI_API_TOKEN nell\'ambiente.');
        console.error('  set -a; . ~/.config/olga-hub.env; set +a');
        process.exit(1);
    }
    const a = stato.azioni ?? {};
    const titolo = `${stato.test.totale} test (${stato.test.rossi} rossi) · `
        + `${conMutazione ?? '?'} colgono il guasto sul denaro · `
        + `${stato.file.nelBanco}/${stato.file.totali} file eseguiti · `
        + `${a.verificate ?? 0}/${a.totali ?? 0} azioni verificate`;
    const risposta = await fetch(`${url}/api/gigi/metrics`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ project: 'chauffeur-empire', metrics: stato, headline: titolo }),
    });
    if (!risposta.ok) {
        console.error(`L'hub ha rifiutato la misura (${risposta.status}): ${(await risposta.text()).slice(0, 200)}`);
        process.exit(1);
    }
    console.log('Misura inviata all\'hub.\n');
}
