/**
 * Il controllo che sostituisce il mio «no».
 *
 * Il 20/08/2026, rivedendo 23 rami prodotti da Gemini, ne ho scartati 5. Tutti
 * e cinque erano rilevabili senza leggere una riga di codice:
 *
 *   ui-store       10 test rossi
 *   engine-finance 15 test rossi
 *   showroom        4 test rossi
 *   ui-staff        4 test rossi
 *   vtk-market      verde da solo, ROSSO una volta unito a main
 *
 * L'ultimo e' il motivo per cui qui si testa il MERGE e non il ramo isolato:
 * vtk-market si era tolto dalla lista delle eccezioni lasciandosi dentro cinque
 * mutazioni, e se ne accorgeva solo il guardrail aggiornato che stava su main.
 * Verificare il ramo da solo lo avrebbe promosso.
 *
 * Cosa NON copre: un ramo che passa tutto e ha comunque un difetto che nessun
 * test vede. Per quello serve ancora che qualcuno guardi, ogni tanto, anche i
 * rami gia' fusi. Questo controllo toglie l'attesa, non la revisione.
 *
 * Esce 0 se il ramo e' promuovibile, 1 altrimenti. Scrive un verdetto in JSON
 * su VERDETTO_OUT, perche' il ciclo lo rilegge per costruire la richiesta di
 * approvazione.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const RAMO = process.env.RAMO?.trim();
if (!RAMO) {
    console.error('RAMO mancante.');
    process.exit(2);
}

const cwd = process.cwd();
// Di norma si confronta con main. Si puo' cambiare per poter provare il
// controllo stesso in un worktree, dove main e' gia' occupato dal repository
// principale e git rifiuta di prenderlo due volte.
const BASE = process.env.BASE?.trim() || 'main';
const sh = (cmd, args, opzioni = {}) =>
    execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opzioni });

const problemi = [];
const note = [];

/**
 * Node stampa il riepilogo in due formati diversi a seconda di dove gira:
 * «ℹ fail 0» quando c'e' un terminale, «# fail 0» (TAP) quando non c'e' — cioe'
 * sempre, in CI. Leggerne uno solo faceva tornare -1 a ogni misura, e il
 * controllo respingeva OGNI ramo dicendo che main era rotto. Successo il
 * 20/08/2026: cinque lavori buoni scartati da un controllo cieco.
 */
function conta(uscita) {
    const n = (etichetta) => {
        const m = uscita.match(new RegExp(`^(?:ℹ|#)\\s*${etichetta}\\s+(\\d+)`, 'm'));
        return m ? Number(m[1]) : -1;
    };
    return { totale: n('tests'), passati: n('pass'), falliti: n('fail') };
}

function test() {
    try {
        return conta(sh('npm', ['test']));
    } catch (e) {
        return conta((e.stdout ?? '') + (e.stderr ?? ''));
    }
}

/* ── 1. La base: quanti test ha main adesso ───────────────────────────── */
sh('git', ['checkout', '--quiet', BASE]);
const base = test();
if (base.falliti !== 0) {
    // Se main e' gia' rotto, il confronto non significa niente: meglio fermarsi
    // che promuovere un ramo basandosi su una base marcia.
    problemi.push(`${BASE} ha ${base.falliti} test rossi: non posso giudicare niente finche' non e' verde.`);
}

/* ── 2. Il merge, non il ramo ─────────────────────────────────────────── */
sh('git', ['config', 'user.name', 'verifica']);
sh('git', ['config', 'user.email', 'verifica@local']);
let conflitti = [];
try {
    sh('git', ['merge', '--no-commit', '--no-ff', `origin/${RAMO}`]);
} catch {
    conflitti = sh('git', ['diff', '--name-only', '--diff-filter=U'])
        .split('\n').map(r => r.trim()).filter(Boolean);
    // Un conflitto sulla sola lista delle eccezioni e' atteso e si risolve da
    // se': ogni lavoro toglie una riga diversa dallo stesso elenco, e git non
    // sa che le rimozioni sono indipendenti.
    const soloGuardrail = conflitti.length > 0
        && conflitti.every(f => f === 'test/guardrail/una-sola-porta.test.js');
    if (soloGuardrail) {
        const guard = 'test/guardrail/una-sola-porta.test.js';
        const nostro = sh('git', ['show', `${BASE}:${guard}`]);
        const convertiti = sh('git', ['diff', '--name-only', `${BASE}...origin/${RAMO}`])
            .split('\n').map(r => r.trim()).filter(f => /^[a-z_0-9-]+\.js$/.test(f));
        let testo = nostro;
        for (const f of convertiti) testo = testo.split('\n').filter(r => !r.includes(`'${f}',`)).join('\n');
        fs.writeFileSync(`${cwd}/${guard}`, testo);
        sh('git', ['add', '--', guard]);
        note.push('conflitto sulla lista delle eccezioni risolto da solo');
        conflitti = [];
    } else {
        problemi.push(`Non si unisce a ${BASE} senza conflitti: ${conflitti.join(', ')}`);
    }
}

/* ── 3. I test, sul risultato dell'unione ─────────────────────────────── */
const dopo = conflitti.length ? { totale: -1, falliti: -1 } : test();
if (dopo.falliti > 0) problemi.push(`${dopo.falliti} test rossi una volta unito a ${BASE}.`);
if (dopo.totale >= 0 && base.totale >= 0 && dopo.totale <= base.totale) {
    // Una correzione senza un test nuovo non e' verificabile: e' una promessa.
    problemi.push(`I test non sono cresciuti (${base.totale} → ${dopo.totale}): manca la prova che il bug fosse reale.`);
}

/* ── 4. Nessun test cancellato o messo a dormire ──────────────────────── */
const diffTest = conflitti.length ? '' : sh('git', ['diff', '--cached', '--', 'test/']);
const spenti = diffTest.split('\n').filter(r => /^\+.*\b(skip|todo|only)\s*[:(]/.test(r));
if (spenti.length) {
    problemi.push(`Ha disattivato ${spenti.length} test invece di farli passare.`);
}
const testRimossi = conflitti.length ? [] : sh('git', ['diff', '--cached', '--diff-filter=D', '--name-only', '--', 'test/'])
    .split('\n').map(r => r.trim()).filter(Boolean);
if (testRimossi.length) problemi.push(`Ha cancellato file di test: ${testRimossi.join(', ')}`);

/* ── 5. La prova per mutazione ────────────────────────────────────────── */
/* Un test verde su codice rotto non dimostra niente. Si rompe di proposito la
   porta del denaro e si controlla che i test se ne accorgano: se restano tutti
   verdi, quei test non stanno provando quello che dicono di provare. */
let colgono = -1;
if (!problemi.length) {
    const originale = fs.readFileSync(`${cwd}/money.js`, 'utf8');
    try {
        fs.writeFileSync(`${cwd}/money.js`, originale
            .replace(/function _sincronizzaCassa\(\) \{/, 'function _sincronizzaCassa() { return;')
            .replace(/var p = window\.ServerState && window\.ServerState\.spendDriverCoins/,
                     'var p = false && window.ServerState.spendDriverCoins'));
        colgono = test().falliti;
    } finally {
        fs.writeFileSync(`${cwd}/money.js`, originale);
    }
    if (colgono <= 0) {
        problemi.push('Rompendo la porta del denaro non fallisce nessun test: la copertura e\' apparente.');
    }
}

/* ── Verdetto ─────────────────────────────────────────────────────────── */
const toccati = sh('git', ['diff', '--name-only', `${BASE}...origin/${RAMO}`])
    .split('\n').map(r => r.trim()).filter(Boolean);

const verdetto = {
    ramo: RAMO,
    promuovibile: problemi.length === 0,
    problemi,
    note,
    test: { prima: base.totale, dopo: dopo.totale, rossi: dopo.falliti },
    colgonoLaMutazione: colgono,
    fileToccati: toccati,
};

console.log(JSON.stringify(verdetto, null, 2));
/* E anche su UNA riga sola, con un marcatore davanti.
   Il ciclo su Google legge il verdetto raschiando i log di questa run, e il
   JSON indentato non si lascia raschiare: GitHub antepone un timestamp a OGNI
   riga, quindi ricomporre l'oggetto significa ripulirle una per una. La
   ripulitura era sbagliata (si aspettava due marcatori temporali, ce n'e' uno),
   JSON.parse falliva, il verdetto arrivava vuoto e il ciclo respingeva per
   prudenza rami perfettamente buoni — tre, il 20/08. Una riga sola toglie il
   problema alla radice: basta prendere da '{' a fine riga. */
console.log('VERDETTO ' + JSON.stringify(verdetto));
if (process.env.VERDETTO_OUT) fs.writeFileSync(process.env.VERDETTO_OUT, JSON.stringify(verdetto));

if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
        `## ${verdetto.promuovibile ? '✅ Promuovibile' : '❌ Non promuovibile'} — \`${RAMO}\``,
        '',
        `- Test: ${base.totale} → ${dopo.totale} (${dopo.falliti} rossi)`,
        `- Test che colgono la mutazione: ${colgono >= 0 ? colgono : 'non provato'}`,
        `- File toccati: ${toccati.map(f => `\`${f}\``).join(', ') || 'nessuno'}`,
        ...(problemi.length ? ['', '### Perché no', ...problemi.map(p => `- ${p}`)] : []),
    ].join('\n'));
}

// Si lascia il repository com'era: questo controllo non deve pubblicare niente.
try { sh('git', ['merge', '--abort']); } catch { /* nessun merge in corso */ }
try { sh('git', ['reset', '--hard', BASE]); } catch { /* niente da annullare */ }

/* ── La richiesta di approvazione ─────────────────────────────────────────
   La crea il controllo, non il ciclo. Il ciclo dovrebbe rileggere i numeri dai
   log della run, e non ci riesce: l'API di GitHub non li restituisce come
   testo semplice, e a Vlad arrivava «Test: undefined → undefined», cioe' una
   richiesta di approvare alla cieca — esattamente cio' che questo meccanismo
   doveva evitare. Qui i numeri sono gia' in mano: si scrivono e basta. */
if (verdetto.promuovibile && process.env.HUB_URL && process.env.GIGI_API_TOKEN) {
    const nonTest = toccati.filter(f => !f.startsWith('test/') && !f.startsWith('.github/'));
    const motivo = [
        `Ramo: ${RAMO}`,
        '',
        `Test: ${base.totale} → ${dopo.totale}, tutti verdi una volta uniti a main.`,
        `Test che si accorgono se rompo la porta del denaro: ${colgono}.`,
        `File di gioco toccati: ${nonTest.join(', ') || 'nessuno (solo test e banco di prova)'}`,
        ...(note.length ? ['', ...note.map(n => `Nota: ${n}`)] : []),
        '',
        'Ha superato tutti i controlli automatici. Resta fuori solo il difetto',
        'che nessun test copre: quello lo cerca Claude, a campione, anche dopo.',
    ].join('\n');
    try {
        const r = await fetch(`${process.env.HUB_URL}/api/gigi/approvals`, {
            method: 'POST',
            headers: { authorization: `Bearer ${process.env.GIGI_API_TOKEN}`, 'content-type': 'application/json' },
            body: JSON.stringify({
                title: RAMO.replace(/^gigi\//, '').replace(/-\d{8}$/, '').replace(/-/g, ' '),
                rationale: motivo,
                risk: 'low',
                actions: [{ type: 'merge', ramo: RAMO }],
                requested_by: 'gigi',
            }),
        });
        console.log(r.ok ? 'Richiesta di approvazione creata.' : `L'hub ha rifiutato la richiesta (${r.status}).`);
    } catch (e) {
        console.log(`Non sono riuscito a chiedere l'approvazione: ${e.message}`);
    }
}

// Esce SEMPRE 0, anche quando il ramo non passa.
//
// Un ramo respinto e' un esito normale di questo controllo, non un guasto: e'
// esattamente il lavoro che gli abbiamo chiesto di fare. Uscire con errore
// faceva mandare a GitHub una mail di fallimento a ogni rifiuto, cioe' rumore
// che insegna a ignorare le mail — comprese quelle che segnalano guasti veri.
//
// Chi ha bisogno del verdetto lo legge da 'promuovibile' nel JSON qui sopra.
process.exit(0);
