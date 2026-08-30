#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════════
   preflight.mjs — i controlli da fare PRIMA di pubblicare.

   Vlad, 30/08: «quando faremo i grossi updates dovremmo verificare tutto prima,
   perché rischiamo di rompere qualcosa. Devi ragionare come le grandi case di
   videogiochi e muoverci come loro.»

   Le grandi case non si fidano della memoria di nessuno: mettono i controlli in
   una macchina che dice no. Questo file e' quella macchina. Controlla le cose
   che si dimenticano davvero — non i gusti, i fatti:

     1. Si parte da un albero pulito e da un ramo noto.
     2. Ogni file .js di radice si legge senza errori di sintassi (un solo
        SyntaxError e in questo gioco l'intero file non esegue).
     3. Ogni file citato da index.html esiste sul disco.
     4. CACHE-BUST: ogni .js modificato ha il `?v=` cambiato in index.html.
        E' il difetto piu' silenzioso del progetto — il codice e' giusto, il
        browser serve la copia vecchia, e sembra che la correzione non funzioni.
     5. Nessuna chiave segreta nei commit che stanno per uscire.
     6. La suite intera.

   Uso:
     node scripts/preflight.mjs                # prima di spingere (base: origin/main)
     node scripts/preflight.mjs --da HEAD~3    # confronta con un altro punto
     node scripts/preflight.mjs --senza-test   # salta la suite (solo se l'hai gia' fatta girare)
     node scripts/preflight.mjs --produzione   # DOPO il deploy: verifica il sito vero
   ════════════════════════════════════════════════════════════════════════════ */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITO = 'https://www.chauffeurempire.com';

const arg = (nome, val) => {
    const i = process.argv.indexOf(nome);
    if (i === -1) return val;
    return process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true;
};
const ha = (nome) => process.argv.includes(nome);

const sh = (cmd, opt = {}) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opt }).trim();
const shSilenzioso = (cmd) => { try { return sh(cmd); } catch (e) { return null; } };

let errori = 0, avvisi = 0;
const ok      = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const errore  = (m) => { errori++; console.log(`  \x1b[31m✗ ${m}\x1b[0m`); };
const avviso  = (m) => { avvisi++; console.log(`  \x1b[33m!\x1b[0m ${m}`); };
const titolo  = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

/* ── 1. STATO DEL REPOSITORY ──────────────────────────────────────────────── */
function statoRepo(base) {
    titolo('1. Stato del repository');
    const sporco = sh('git status --porcelain');
    if (sporco) errore(`ci sono modifiche non committate:\n${sporco.split('\n').slice(0, 8).map(r => '      ' + r).join('\n')}`);
    else ok('albero pulito');

    const ramo = sh('git rev-parse --abbrev-ref HEAD');
    if (ramo === 'main') ok('sul ramo main (quello che pubblica)');
    else avviso(`sei su "${ramo}": il deploy parte solo da main`);

    if (base !== true && shSilenzioso(`git rev-parse --verify ${base}`)) {
        const n = sh(`git rev-list --count ${base}..HEAD`);
        ok(`${n} commit da pubblicare rispetto a ${base}`);
    } else {
        avviso(`punto di confronto "${base}" non trovato: salto i controlli che lo usano`);
        return null;
    }
    return base;
}

/* ── 2. SINTASSI ──────────────────────────────────────────────────────────── */
function sintassi() {
    titolo('2. Sintassi dei file di gioco');
    const file = fs.readdirSync(ROOT).filter(f => f.endsWith('.js') && !f.startsWith('.'));
    let rotti = 0;
    for (const f of file) {
        try { execSync(`node --check "${f}"`, { cwd: ROOT, stdio: 'ignore' }); }
        catch (e) { errore(`${f}: errore di sintassi — con "use strict" il file intero non esegue`); rotti++; }
    }
    if (!rotti) ok(`${file.length} file, nessun errore di sintassi`);
}

/* ── 3. FILE CITATI DA index.html ─────────────────────────────────────────── */
function riferimentiIndex() {
    titolo('3. File citati da index.html');
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const citati = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map(m => m[1])
        .filter(u => !/^(https?:|data:|mailto:|#|\/manifest)/.test(u))
        .map(u => u.split('?')[0].replace(/^\//, ''))
        .filter(u => /\.(js|css|png|jpg|svg|webp|woff2?)$/.test(u));
    const mancanti = [...new Set(citati)].filter(f => !fs.existsSync(path.join(ROOT, f)));
    if (mancanti.length) mancanti.forEach(f => errore(`index.html cita "${f}" che non esiste`));
    else ok(`${new Set(citati).size} riferimenti, tutti presenti`);
}

/* ── 4. CACHE-BUST ────────────────────────────────────────────────────────── */
function cacheBust(base) {
    titolo('4. Cache-bust (il difetto piu\' silenzioso del progetto)');
    const modificati = sh(`git diff --name-only ${base}..HEAD`).split('\n')
        .filter(f => f.endsWith('.js') && !f.includes('/'));
    if (!modificati.length) { ok('nessun file di gioco modificato'); return; }

    const htmlOra    = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const htmlPrima  = shSilenzioso(`git show ${base}:index.html`);
    if (htmlPrima === null) { avviso('index.html non leggibile al punto di confronto: salto'); return; }

    const versione = (html, file) => {
        const m = html.match(new RegExp(`src="${file.replace('.', '\\.')}(\\?v=(\\d+))?"`));
        return m ? (m[2] || 'senza-versione') : null;
    };

    let problemi = 0;
    for (const f of modificati) {
        const ora = versione(htmlOra, f);
        if (ora === null) continue;                 // non caricato da index.html (es. sw.js, tailwind.config.js)
        if (ora === 'senza-versione') { errore(`${f} e' caricato senza "?v=": il browser terra' la copia vecchia per sempre`); problemi++; continue; }
        const prima = versione(htmlPrima, f);
        if (prima === ora) { errore(`${f} e' cambiato ma "?v=${ora}" e' rimasto uguale: agli utenti arrivera' la versione vecchia`); problemi++; }
    }
    if (!problemi) ok(`${modificati.length} file modificati, tutti con la versione aggiornata`);
}

/* ── 5. SEGRETI ───────────────────────────────────────────────────────────── */
function segreti(base) {
    titolo('5. Chiavi segrete nei commit in uscita');
    const diff = shSilenzioso(`git log -p ${base}..HEAD`) || '';
    const trovate = diff.match(/(sk_live|sk_test|rk_live|whsec|eyJhbGciOiJIUzI1NiIs)[_A-Za-z0-9]{12,}/g);
    if (trovate) {
        [...new Set(trovate)].forEach(t => errore(`chiave nel diff: ${t.slice(0, 14)}… — va tolta dalla storia, non solo dal file`));
    } else ok('nessuna chiave nei commit');
}

/* ── 6. SUITE ─────────────────────────────────────────────────────────────── */
function suite() {
    titolo('6. Suite di test');
    try {
        const out = execSync('node --test', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
        const pass = (out.match(/^ℹ pass (\d+)/m) || [])[1];
        const fail = (out.match(/^ℹ fail (\d+)/m) || [])[1];
        if (fail && fail !== '0') errore(`${fail} test rossi`);
        else ok(`${pass} test verdi`);
    } catch (e) {
        const out = (e.stdout || '') + (e.stderr || '');
        const fail = (out.match(/^ℹ fail (\d+)/m) || [])[1] || '?';
        errore(`${fail} test rossi — "npm test" per vedere quali`);
    }
}

/* ── 7. DOPO IL DEPLOY ────────────────────────────────────────────────────── */
async function produzione() {
    titolo('Verifica del sito pubblicato');
    const stato = async (url) => { try { return (await fetch(url, { redirect: 'follow' })).status; } catch (e) { return 0; } };

    const r = await fetch(SITO + '/index.html', { cache: 'no-store' });
    if (!r.ok) { errore(`il sito risponde ${r.status}`); return; }
    const htmlLive = await r.text();
    const htmlOra  = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

    const versioni = (html) => Object.fromEntries([...html.matchAll(/src="([\w.-]+\.js)\?v=(\d+)"/g)].map(m => [m[1], m[2]]));
    const vLive = versioni(htmlLive), vLocale = versioni(htmlOra);
    const indietro = Object.keys(vLocale).filter(f => vLive[f] !== vLocale[f]);
    if (indietro.length) avviso(`il sito serve ancora versioni vecchie (deploy in corso?): ${indietro.slice(0, 6).join(', ')}`);
    else ok(`il sito serve le stesse versioni del repository (${Object.keys(vLocale).length} file)`);

    // Il leak del 2026: .vercelignore tiene fuori sorgenti SQL, note e documenti.
    const daNascondere = ['HANDOFF.md', 'docs/ARCHITECTURE.md', 'package.json'];
    const sql = fs.readdirSync(ROOT).filter(f => f.endsWith('.sql')).slice(-2);
    let perdite = 0;
    for (const f of [...daNascondere, ...sql]) {
        const s = await stato(`${SITO}/${f}`);
        if (s === 200) { errore(`"${f}" e' PUBBLICO (${s}): controlla .vercelignore`); perdite++; }
    }
    if (!perdite) ok('nessun file privato raggiungibile dal web');
}

/* ── ESECUZIONE ───────────────────────────────────────────────────────────── */
const base = arg('--da', 'origin/main');
console.log(`\x1b[1m── Preflight — Chauffeur Empire ──\x1b[0m`);

if (ha('--produzione')) {
    await produzione();
} else {
    const baseValida = statoRepo(base);
    sintassi();
    riferimentiIndex();
    if (baseValida) { cacheBust(baseValida); segreti(baseValida); }
    if (!ha('--senza-test')) suite(); else avviso('suite saltata (--senza-test)');
}

console.log('');
if (errori) {
    console.log(`\x1b[31m\x1b[1m✗ ${errori} problem${errori === 1 ? 'a' : 'i'} da risolvere prima di pubblicare.\x1b[0m` +
                (avvisi ? ` (${avvisi} avvis${avvisi === 1 ? 'o' : 'i'})` : ''));
    process.exit(1);
}
console.log(`\x1b[32m\x1b[1m✓ Pronto per la pubblicazione.\x1b[0m` + (avvisi ? ` ${avvisi} avviso/i da leggere sopra.` : ''));
console.log('  Restano le due prove che una macchina non puo\' fare: aprire il gioco nel browser');
console.log('  con la console aperta, e provare il flusso che hai toccato.\n');
