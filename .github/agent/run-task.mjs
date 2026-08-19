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
import { runGeminiAgent } from './gemini-agent.js';

const istruzione = process.env.INSTRUCTION?.trim();
if (!istruzione) {
  console.error('INSTRUCTION mancante: non c\'è niente da fare.');
  process.exit(1);
}

const cwd = process.cwd();
const sh = (cmd, args) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();

const stampo = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '');
const branch = `gigi/cloud-${stampo}`;
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

const cambiati = sh('git', ['status', '--porcelain'])
  .split('\n')
  .filter((r) => r.length > 3)
  .map((r) => r.slice(3).trim())
  .filter(Boolean);

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
    `- Motore: gemini-3.7-flash · **$${esito.costo.toFixed(3)}** di crediti Google`,
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

sh('git', ['config', 'user.name', 'Gigi (cloud)']);
sh('git', ['config', 'user.email', 'gigi@chauffeurempire.com']);
sh('git', ['add', '-A']);
sh('git', ['commit', '-m', `${istruzione.slice(0, 70)}\n\nLavoro svolto da Gemini 3.7 Flash su GitHub Actions.\nDa rivedere prima del merge: nessuno ha ancora guardato questo codice.`]);
sh('git', ['push', 'origin', branch]);
console.log(`\nBranch pubblicato: ${branch}`);

process.exit(esito.ok ? 0 : 1);
