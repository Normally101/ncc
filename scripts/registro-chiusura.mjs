#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════════
   registro-chiusura.mjs — genera/aggiorna `docs/CHIUSURA-REGISTRO.md`.

   È il libro mastro del piano di chiusura (`PIANO-CHIUSURA.md`): una riga per
   ognuna delle azioni che il giocatore può fare, con due colonne di stato.

     BANCO   — automatica. La ricava dal guardrail `azioni-sincronizzano`:
               `ok` = il banco la esegue e vede la scrittura verso il server,
               `stato` = il banco non riesce ad attivarla,
               `assente` = la funzione non è caricata in QUEL banco (esiste,
               ma il suo file non sta in CORE_FILES).
     CHIUSA  — manuale. La metto io quando l'azione è stata provata davvero:
               eseguita nello stato giusto, con un test che la difende.

   La colonna automatica si rigenera; quella manuale si conserva rileggendo il
   file esistente. Così il registro non perde memoria a ogni esecuzione.

   Uso:  npm run registro
   ════════════════════════════════════════════════════════════════════════════ */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs', 'CHIUSURA-REGISTRO.md');

/* ── 1. le azioni e dove sono definite ────────────────────────────────────── */
function azioniEFile() {
    const files = fs.readdirSync(ROOT).filter(f => (f.endsWith('.js') || f.endsWith('.html')) && f !== 'sw.js');
    const src = new Map(files.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));

    const nomi = new Set();
    for (const [, s] of src) {
        for (const m of s.matchAll(/data-ce-act="([A-Za-z0-9_$]+)"/g)) nomi.add(m[1]);
        for (const m of s.matchAll(/ceAct\(\s*['"]([A-Za-z0-9_$]+)['"]/g)) nomi.add(m[1]);
    }

    const dove = new Map();
    for (const [f, s] of src) {
        if (!f.endsWith('.js')) continue;
        const segna = (nome) => { if (nomi.has(nome) && !dove.has(nome)) dove.set(nome, f); };
        for (const m of s.matchAll(/(?:^|\s)function\s+([A-Za-z0-9_$]+)\s*\(/gm)) segna(m[1]);
        for (const m of s.matchAll(/window\.([A-Za-z0-9_$]+)\s*=/g)) segna(m[1]);
        for (const m of s.matchAll(/^(?:var|let|const)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\()/gm)) segna(m[1]);
    }
    return { nomi: [...nomi].sort(), dove };
}

/* ── 2. lo stato dal guardrail ────────────────────────────────────────────── */
function statoDalGuardrail() {
    let out = '';
    try {
        out = execSync('node --test test/guardrail/azioni-sincronizzano.test.js', {
            cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
        });
    } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }

    const stato = new Map();
    const bloccoOk = out.match(/--- Azioni verificate \[ok\] \(\d+\) ---\n([\s\S]*?)\n\s*\n/);
    if (bloccoOk) bloccoOk[1].trim().split(/\s+/).forEach(n => stato.set(n, 'ok'));
    for (const m of out.matchAll(/^\s+- ([A-Za-z0-9_$]+): richiede stato specifico/gm)) stato.set(m[1], 'stato');
    for (const m of out.matchAll(/^\s+- ([A-Za-z0-9_$]+): funzione non trovata/gm)) stato.set(m[1], 'assente');
    return stato;
}

/* ── 3. la colonna manuale del file esistente ─────────────────────────────── */
function memoriaManuale() {
    if (!fs.existsSync(DOC)) return new Map();
    const m = new Map();
    for (const riga of fs.readFileSync(DOC, 'utf8').split('\n')) {
        const c = riga.match(/^\|\s*`([A-Za-z0-9_$]+)`\s*\|[^|]*\|[^|]*\|[^|]*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$/);
        if (c) m.set(c[1], { chiusa: c[2], note: c[3] });
    }
    return m;
}

/* ── 4. scrittura ─────────────────────────────────────────────────────────── */
const { nomi, dove } = azioniEFile();
const banco = statoDalGuardrail();
const memoria = memoriaManuale();

const sistemaDi = (f) => (f || 'ignoto')
    .replace(/^(ui|engine)-/, '').replace(/\.js$/, '');

const righe = nomi.map(n => {
    const file = dove.get(n) || '—';
    const m = memoria.get(n) || { chiusa: '⬜', note: '' };
    return {
        nome: n, file, sistema: sistemaDi(file),
        banco: banco.get(n) || '—',
        chiusa: m.chiusa || '⬜', note: m.note || '',
    };
});
righe.sort((a, b) => a.sistema.localeCompare(b.sistema) || a.nome.localeCompare(b.nome));

const conta = (f) => righe.filter(f).length;
const chiuse = conta(r => r.chiusa.includes('✅'));
const rotte  = conta(r => r.chiusa.includes('🐛'));

let md = `# Registro di chiusura — le azioni del giocatore, una per una

> Generato da \`npm run registro\`. **La colonna CHIUSA si scrive a mano** e viene
> conservata fra una generazione e l'altra: è l'unica memoria del lavoro fatto.
> Il piano che governa questo registro è \`PIANO-CHIUSURA.md\`.

Aggiornato: ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}

| | |
|---|---|
| Azioni totali | **${righe.length}** |
| Chiuse (provate davvero, con un test che le difende) | **${chiuse}** |
| Aperte | **${righe.length - chiuse}** |
| Difetti trovati e ancora da correggere | **${rotte}** |
| Eseguite dal banco automatico (\`ok\`) | ${conta(r => r.banco === 'ok')} |
| Il banco non riesce ad attivarle | ${conta(r => r.banco === 'stato')} |
| Fuori dal banco (file non caricato lì) | ${conta(r => r.banco === 'assente')} |

**Legenda CHIUSA** — ⬜ da fare · ✅ chiusa · 🐛 difetto trovato, correzione aperta · ⏭️ non applicabile (con motivo nelle note)

| Azione | Sistema | File | Banco | Chiusa | Note |
|---|---|---|---|---|---|
`;
for (const r of righe) {
    md += `| \`${r.nome}\` | ${r.sistema} | ${r.file} | ${r.banco} | ${r.chiusa} | ${r.note} |\n`;
}

md += `
## Come si chiude una riga

1. Porta il gioco nello stato che l'azione richiede (usa \`test-support/regista.js\`).
2. Esegui l'azione **come la esegue il giocatore**: dal bottone, non dalla console.
3. Controlla i tre effetti: lo stato locale cambia, il denaro passa da \`CE_money\`,
   il server riceve la scrittura.
4. Scrivi il test che la difende e provalo al contrario (rompi il codice: deve diventare rosso).
5. \`npm test\` intero. Poi metti ✅ qui e fai un commit.

Se trovi un difetto e non lo correggi nella stessa sessione, metti 🐛 e scrivi nelle
note **cosa** hai visto — non «da controllare», ma il sintomo preciso.
`;

fs.mkdirSync(path.dirname(DOC), { recursive: true });
fs.writeFileSync(DOC, md);
console.log(`Registro aggiornato: ${righe.length} azioni, ${chiuse} chiuse, ${righe.length - chiuse} aperte.`);
console.log(`  ok dal banco: ${conta(r => r.banco === 'ok')} · stato mancante: ${conta(r => r.banco === 'stato')} · fuori banco: ${conta(r => r.banco === 'assente')}`);
