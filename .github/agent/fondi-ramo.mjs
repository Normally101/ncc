/**
 * Fonde in main un ramo che Vlad ha approvato dall'hub.
 *
 * Perche' non basta l'API di GitHub: ogni lavoro toglie una riga dalla stessa
 * lista di eccezioni del guardrail, e git non sa che le rimozioni sono
 * indipendenti. Il merge automatico va quindi in conflitto praticamente ogni
 * volta, su un conflitto che ha una sola risoluzione sensata — tenere la lista
 * e togliere la riga del file che QUESTO ramo ha convertito.
 *
 * Rifa' i test dopo aver risolto e prima di pubblicare: se il risultato non e'
 * verde non si pubblica niente. La verifica era gia' passata, ma fra quel
 * momento e questo main puo' essere cambiato.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const RAMO = process.env.RAMO?.trim();
if (!RAMO) { console.error('RAMO mancante.'); process.exit(2); }

const cwd = process.cwd();
const sh = (cmd, args) => execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const GUARD = 'test/guardrail/una-sola-porta.test.js';

function test() {
    try {
        const out = sh('npm', ['test']);
        return Number(out.match(/^ℹ fail (\d+)/m)?.[1] ?? -1);
    } catch (e) {
        const out = (e.stdout ?? '') + (e.stderr ?? '');
        return Number(out.match(/^ℹ fail (\d+)/m)?.[1] ?? -1);
    }
}

sh('git', ['config', 'user.name', 'Gigi (cloud)']);
// Deve corrispondere a un account GitHub, altrimenti Vercel blocca la deploy.
sh('git', ['config', 'user.email', 'djblade594@gmail.com']);

let risolto = false;
try {
    sh('git', ['merge', '--no-edit', `origin/${RAMO}`]);
} catch {
    const conflitti = sh('git', ['diff', '--name-only', '--diff-filter=U'])
        .split('\n').map(r => r.trim()).filter(Boolean);
    if (conflitti.length !== 1 || conflitti[0] !== GUARD) {
        console.error(`Conflitto che non so risolvere da solo: ${conflitti.join(', ')}`);
        sh('git', ['merge', '--abort']);
        process.exit(1);
    }
    const convertiti = sh('git', ['diff', '--name-only', `main...origin/${RAMO}`])
        .split('\n').map(r => r.trim()).filter(f => /^[a-z_0-9-]+\.js$/.test(f));
    let testo = sh('git', ['show', `main:${GUARD}`]);
    for (const f of convertiti) testo = testo.split('\n').filter(r => !r.includes(`'${f}',`)).join('\n');
    fs.writeFileSync(`${cwd}/${GUARD}`, testo);
    sh('git', ['add', '--', GUARD]);
    sh('git', ['commit', '--no-edit']);
    risolto = true;
    console.log('Conflitto sulla lista delle eccezioni risolto.');
}

const rossi = test();
if (rossi !== 0) {
    console.error(`Dopo l'unione ci sono ${rossi} test rossi: non pubblico niente.`);
    sh('git', ['reset', '--hard', 'origin/main']);
    process.exit(1);
}

/* Il numero di versione in index.html: senza, la CDN continua a servire il
   file vecchio e la correzione non arriva a nessun giocatore. */
const toccati = sh('git', ['diff', '--name-only', `origin/main...HEAD`])
    .split('\n').map(r => r.trim()).filter(f => /^[a-z_0-9-]+\.js$/.test(f));
if (toccati.length) {
    let html = fs.readFileSync(`${cwd}/index.html`, 'utf8');
    const bumpati = [];
    for (const f of toccati) {
        const nome = f.replace(/\.js$/, '');
        const re = new RegExp(`src="${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.js\\?v=(\\d+)"`);
        const m = html.match(re);
        if (!m) continue;
        html = html.replace(re, `src="${nome}.js?v=${Number(m[1]) + 1}"`);
        bumpati.push(`${nome}: v${m[1]} → v${Number(m[1]) + 1}`);
    }
    if (bumpati.length) {
        fs.writeFileSync(`${cwd}/index.html`, html);
        sh('git', ['add', '--', 'index.html']);
        sh('git', ['commit', '-m', `chore(cache): bump ${toccati.join(', ')}\n\n${bumpati.join('\n')}`]);
        console.log(`Versioni aggiornate: ${bumpati.join(', ')}`);
    }
}

sh('git', ['push', 'origin', 'HEAD:main']);
console.log(`Fuso in main: ${RAMO}${risolto ? ' (conflitto risolto)' : ''}`);
