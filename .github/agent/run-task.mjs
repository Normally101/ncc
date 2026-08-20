/**
 * Esecutore in cloud: fa lavorare Gemini su questo repository dentro GitHub
 * Actions, così il lavoro non dipende dal fatto che il Mac di Vlad sia acceso.
 *
 * Le regole sono le stesse del Mac: si lavora su un branch nuovo, mai su main,
 * e si pubblica solo il branch — il merge resta una decisione di Vlad.
 *
 * Variabili attese: INSTRUCTION (cosa fare), GOOGLE_CLOUD_PROJECT,
 * GOOGLE_APPLICATION_CREDENTIALS (scritto dal workflow dal secret).
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import { runGeminiAgent, AGENT_MODEL } from './gemini-agent.mjs';

const istruzione = process.env.INSTRUCTION?.trim();
if (!istruzione) {
  console.error('INSTRUCTION mancante: non c\'è niente da fare.');
  process.exit(1);
}

const cwd = process.cwd();
const sh = (cmd, args) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();
// Come sh() ma SENZA trim: `git status --porcelain` usa i primi due caratteri per
// lo stato e il terzo come separatore, quindi una riga di file modificato inizia
// con uno spazio. Tagliarlo faceva perdere la prima lettera al primo nome della
// lista ("engine-fleet.js" -> "ngine-fleet.js"): innocuo finche' si faceva
// `git add -A`, fatale da quando si aggiungono i file per nome.
const shGrezzo = (cmd, args) => execFileSync(cmd, args, { cwd, encoding: 'utf8' });

// Il titolo (se il chiamante lo passa) finisce nel nome del ramo e nel messaggio
// di commit. Senza, il commit prendeva le prime 70 lettere dell'istruzione: tutti
// i lavori finivano chiamati "CONTESTO DEL BUG" e la cronologia era illeggibile.
const titolo = (process.env.TITOLO || '').trim();
const etichetta = titolo
  ? titolo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  : 'cloud';

const stampo = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '');
const branch = `gigi/${etichetta}-${stampo}`;
sh('git', ['checkout', '-b', branch]);
console.log(`Branch ${branch} creato da ${sh('git', ['rev-parse', '--short', 'HEAD'])}.`);

const esito = await runGeminiAgent({
  richiesta: istruzione,
  cwd,
  gate: 'npm test',
  onProgress: (m) => console.log(`  · ${m}`),
  maxTurni: 40,
  timeoutMs: 20 * 60_000,
});

const tuttiCambiati = shGrezzo('git', ['status', '--porcelain'])
  .split('\n')
  .filter((r) => r.length > 3)
  .map((r) => r.slice(3).trim())
  .filter(Boolean);

// L'agente non pubblica MAI la CI. Due motivi, uno pratico e uno di sostanza:
// GitHub rifiuta il push se un'automazione tocca .github/workflows senza il
// permesso `workflows` (successo il 19/08/2026: un ramo nato da un main piu'
// vecchio conteneva una versione diversa del workflow e il push e' stato
// respinto, buttando via 40 turni di lavoro gia' fatto); e soprattutto un agente
// non deve poter modificare le regole con cui viene eseguito.
const cambiati = tuttiCambiati.filter((f) => !f.startsWith('.github/'));
const scartati = tuttiCambiati.filter((f) => f.startsWith('.github/'));
if (scartati.length) {
  console.log(`\n⚠️  Non pubblico modifiche alla CI: ${scartati.join(', ')}`);
  sh('git', ['checkout', '--', '.github/']);
}

console.log('\n──────── ESITO ────────');
console.log(`ok: ${esito.ok} | turni: ${esito.turni} | costo: $${esito.costo.toFixed(4)}`);
console.log(`token in/out: ${esito.tokenIn} / ${esito.tokenOut}`);
console.log(`file toccati: ${cambiati.length ? cambiati.join(', ') : '(nessuno)'}`);
console.log(`dettaglio: ${esito.dettaglio ?? '(nessuno)'}`);
console.log(`\n${esito.sommario}`);

// Il riepilogo finisce anche nella pagina della run, così si legge dal telefono
// senza aprire i log.
if (process.env.GITHUB_STEP_SUMMARY) {
  const righe = [
    `## ${esito.ok ? '✅ Lavoro completato' : '❌ Non completato'}`,
    '',
    `**Richiesta:** ${istruzione}`,
    '',
    `- Branch: \`${branch}\``,
    `- Motore: ${AGENT_MODEL} · **$${esito.costo.toFixed(3)}** di crediti Google`,
    `- Turni: ${esito.turni} · token ${esito.tokenIn} in / ${esito.tokenOut} out`,
    `- File toccati: ${cambiati.length ? cambiati.map((f) => `\`${f}\``).join(', ') : 'nessuno'}`,
    esito.dettaglio ? `- Nota: ${esito.dettaglio}` : '',
    '',
    '### Cosa dice il modello',
    '',
    esito.sommario,
  ];
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, righe.join('\n'));
}

if (!cambiati.length) {
  console.log('\nNessun file modificato: niente da pubblicare.');
  process.exit(esito.ok ? 0 : 1);
}

// L'email deve corrispondere a un account GitHub, altrimenti Vercel BLOCCA la
// deploy di anteprima del ramo ("commit email could not be matched to a GitHub
// account") e ogni run di Gemini lascia un errore rosso nella dashboard.
// Il nome resta "Gigi (cloud)": l'autore del codice si legge da li', non
// dall'indirizzo.
sh('git', ['config', 'user.name', 'Gigi (cloud)']);
sh('git', ['config', 'user.email', 'djblade594@gmail.com']);
// Solo i file davvero previsti: `git add -A` avrebbe rimesso dentro anche la CI
// appena scartata sopra.
sh('git', ['add', '--', ...cambiati]);
const intestazione = titolo || istruzione.split('\n').find(r => r.trim())?.slice(0, 70) || 'lavoro di Gemini';
sh('git', ['commit', '-m', `${intestazione}\n\nLavoro svolto da Gemini 3.7 Flash su GitHub Actions.\nDa rivedere prima del merge: nessuno ha ancora guardato questo codice.`]);
sh('git', ['push', 'origin', branch]);
console.log(`\nBranch pubblicato: ${branch}`);

process.exit(esito.ok ? 0 : 1);
