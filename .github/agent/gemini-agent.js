/**
 * Motore Gemini nostro: un ciclo di function-calling contro Vertex AI, senza
 * `prime-agent`.
 *
 * Perche' esiste: `prime-agent --autonomous` non scrive niente su stdout finche'
 * non termina, e sui task veri non terminava entro i limiti (4 tentativi, 4
 * fallimenti, ogni volta ha dovuto finire Claude). Qui il ciclo e' nostro: si
 * vede ogni turno mentre accade, i limiti li decidiamo noi e il cancello
 * (`npm test`) lo facciamo girare fra un turno e l'altro.
 *
 * Confini, non negoziabili: il modello puo' leggere e scrivere SOLO dentro la
 * cartella di lavoro, e puo' eseguire SOLO i comandi in lista bianca. Niente
 * `rm`, niente `git push`, niente shell arbitraria.
 */
import { GoogleGenAI } from '@google/genai';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

export const AGENT_MODEL = process.env.GIGI_GEMINI_MODEL || 'gemini-3.7-flash';

/** gemini-3.7-flash, dollari per milione di token (input / output). */
const PREZZO = { input: 0.30, output: 2.50 };

/** Comandi che il modello puo' lanciare. Il primo token deve combaciare esattamente. */
const COMANDI_PERMESSI = [
  ['npm', 'test'],
  ['node', '--test'],
  ['git', 'status'],
  ['git', 'diff'],
  ['git', 'log'],
  ['ls'],
  ['grep'],
  ['rg'],
  ['wc'],
  ['head'],
  ['tail'],
];

const MAX_BYTE_LETTURA = 60_000;
const MAX_BYTE_OUTPUT = 8_000;

/** Vertex risponde 429 quando la quota del modello e' satura: si aspetta e si riprova. */
const ATTESE_RIPROVA = [5_000, 15_000, 45_000, 90_000];

/** Un percorso e' accettabile solo se resta dentro la cartella di lavoro. */
function risolviDentro(cwd, relativo) {
  const assoluto = path.resolve(cwd, relativo ?? '.');
  const radice = path.resolve(cwd);
  if (assoluto !== radice && !assoluto.startsWith(radice + path.sep)) {
    throw new Error(`percorso fuori dalla cartella di lavoro: ${relativo}`);
  }
  return assoluto;
}

function tronca(testo, limite = MAX_BYTE_OUTPUT) {
  if (testo.length <= limite) return testo;
  return testo.slice(0, limite) + `\n… [troncato, ${testo.length - limite} caratteri in piu']`;
}

function comandoPermesso(argv) {
  return COMANDI_PERMESSI.some((permesso) =>
    permesso.every((parola, i) => argv[i] === parola),
  );
}

function esegui(argv, cwd, timeoutMs = 5 * 60_000) {
  return new Promise((resolve) => {
    execFile(argv[0], argv.slice(1), { cwd, timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          uscita: err?.code ?? 0,
          output: tronca(((stdout || '') + (stderr || '')).trim()),
          ucciso: err?.killed === true,
        });
      });
  });
}

const STRUMENTI = [{
  functionDeclarations: [
    {
      name: 'leggi_file',
      description: 'Legge un file di testo dentro la cartella di lavoro.',
      parameters: {
        type: 'OBJECT',
        properties: { percorso: { type: 'STRING', description: 'percorso relativo alla cartella di lavoro' } },
        required: ['percorso'],
      },
    },
    {
      name: 'scrivi_file',
      description: 'Scrive un file di testo, creando le cartelle mancanti. Sovrascrive se esiste.',
      parameters: {
        type: 'OBJECT',
        properties: {
          percorso: { type: 'STRING', description: 'percorso relativo alla cartella di lavoro' },
          contenuto: { type: 'STRING', description: 'contenuto completo del file' },
        },
        required: ['percorso', 'contenuto'],
      },
    },
    {
      name: 'elenca_cartella',
      description: 'Elenca i file di una cartella dentro la cartella di lavoro.',
      parameters: {
        type: 'OBJECT',
        properties: { percorso: { type: 'STRING', description: 'percorso relativo, "." per la radice' } },
      },
    },
    {
      name: 'esegui_comando',
      description:
        'Esegue un comando in lista bianca (npm test, node --test, git status/diff/log, ls, grep, rg, wc, head, tail). ' +
        'Passa il comando come lista di argomenti, per esempio ["npm","test"].',
      parameters: {
        type: 'OBJECT',
        properties: {
          argomenti: { type: 'ARRAY', items: { type: 'STRING' }, description: 'comando e argomenti' },
        },
        required: ['argomenti'],
      },
    },
  ],
}];

/** Esegue una chiamata a strumento e restituisce il risultato da rimandare al modello. */
async function eseguiStrumento(nome, args, cwd, onProgress) {
  try {
    switch (nome) {
      case 'leggi_file': {
        const file = risolviDentro(cwd, args.percorso);
        onProgress(`legge ${args.percorso}`);
        const testo = fs.readFileSync(file, 'utf8');
        return testo.length > MAX_BYTE_LETTURA
          ? { contenuto: testo.slice(0, MAX_BYTE_LETTURA), nota: 'file troncato' }
          : { contenuto: testo };
      }
      case 'scrivi_file': {
        const file = risolviDentro(cwd, args.percorso);
        onProgress(`scrive ${args.percorso}`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, args.contenuto, 'utf8');
        return { scritto: args.percorso, byte: Buffer.byteLength(args.contenuto) };
      }
      case 'elenca_cartella': {
        const dir = risolviDentro(cwd, args.percorso || '.');
        const voci = fs.readdirSync(dir, { withFileTypes: true })
          .filter((v) => v.name !== 'node_modules' && !v.name.startsWith('.git'))
          .map((v) => (v.isDirectory() ? v.name + '/' : v.name));
        return { voci: voci.slice(0, 400) };
      }
      case 'esegui_comando': {
        const argv = (args.argomenti || []).map(String);
        if (!argv.length) return { errore: 'nessun comando' };
        if (!comandoPermesso(argv)) {
          return { errore: `comando non permesso: ${argv.join(' ')}. Consentiti: ${COMANDI_PERMESSI.map((c) => c.join(' ')).join(', ')}` };
        }
        onProgress(`esegue ${argv.join(' ')}`);
        return await esegui(argv, cwd);
      }
      default:
        return { errore: `strumento sconosciuto: ${nome}` };
    }
  } catch (e) {
    return { errore: e.message };
  }
}

const ISTRUZIONI = `Sei un programmatore che lavora su un repository gia' esistente.

Regole:
- Leggi il codice prima di cambiarlo: non inventare nomi di funzioni o di file.
- Fai la modifica MINIMA che risolve il compito. Niente refactor collaterali.
- Scrivi commenti solo per i vincoli che il codice non riesce a mostrare da solo.
- Segui lo stile del file che stai modificando (lingua dei commenti compresa).
- Quando hai finito, esegui il comando di verifica indicato e assicurati che passi.
- Rispondi con un testo finale breve che dica cosa hai cambiato e perche', solo
  quando il lavoro e' davvero completo.`;

/**
 * Fa lavorare Gemini su un compito dentro `cwd`.
 *
 * @returns {Promise<{ok:boolean, sommario:string, dettaglio:string|null, costo:number, turni:number, tokenIn:number, tokenOut:number}>}
 */
export async function runGeminiAgent({
  richiesta,
  cwd,
  gate = null,
  onProgress = () => {},
  maxTurni = 40,
  timeoutMs = 15 * 60_000,
  model = AGENT_MODEL,
}) {
  const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    // gemini-3.7-flash vive solo sull'endpoint globale: nelle regioni classiche
    // l'API risponde 404. Di proposito NON leggiamo GOOGLE_CLOUD_LOCATION, che
    // nel .env vale us-central1 e serve alle altre parti di Gigi.
    location: process.env.GIGI_GEMINI_LOCATION || 'global',
  });

  const contents = [{
    role: 'user',
    parts: [{ text: `${richiesta}\n\nCartella di lavoro: ${cwd}${gate ? `\nComando di verifica: ${gate}` : ''}` }],
  }];

  let tokenIn = 0;
  let tokenOut = 0;
  let turni = 0;
  let ultimoTesto = '';
  // Quanti turni sono passati senza toccare un file. Se il modello continua a
  // guardarsi intorno (git status, npm test, letture) senza piu' cambiare
  // niente, il lavoro e' finito: e' lui che non lo dichiara. Succede davvero, e
  // senza questo contatore si brucerebbero turni fino al limite buttando via
  // lavoro gia' buono.
  let turniSenzaScrittura = 0;
  let scritturaFatta = false;
  const SOGLIA_INERZIA = 3;
  const scadenza = Date.now() + timeoutMs;

  while (turni < maxTurni) {
    if (Date.now() > scadenza) {
      return risultato(false, ultimoTesto, `tempo scaduto dopo ${turni} turni`);
    }
    turni++;

    let risposta;
    let erroreUltimo = null;
    for (let tentativo = 0; tentativo <= ATTESE_RIPROVA.length; tentativo++) {
      try {
        risposta = await ai.models.generateContent({
          model,
          contents,
          config: { tools: STRUMENTI, systemInstruction: ISTRUZIONI },
        });
        erroreUltimo = null;
        break;
      } catch (e) {
        erroreUltimo = e;
        const saturo = /429|RESOURCE_EXHAUSTED|exhausted|unavailable|503/i.test(e.message || '');
        if (!saturo || tentativo === ATTESE_RIPROVA.length) break;
        const attesa = ATTESE_RIPROVA[tentativo];
        onProgress(`quota satura, riprovo fra ${attesa / 1000}s`);
        await new Promise((r) => setTimeout(r, attesa));
      }
    }
    if (erroreUltimo) {
      return risultato(false, ultimoTesto, `il modello ha rifiutato la richiesta: ${erroreUltimo.message}`);
    }

    tokenIn += risposta.usageMetadata?.promptTokenCount ?? 0;
    tokenOut += (risposta.usageMetadata?.candidatesTokenCount ?? 0)
      + (risposta.usageMetadata?.thoughtsTokenCount ?? 0);

    const parti = risposta.candidates?.[0]?.content?.parts ?? [];
    const chiamate = parti.filter((p) => p.functionCall);
    const testo = parti.filter((p) => p.text).map((p) => p.text).join('').trim();
    if (testo) ultimoTesto = testo;

    // Il modello ha smesso di usare strumenti: ha finito. Prima di crederci,
    // facciamo girare noi il cancello.
    if (!chiamate.length) {
      if (!gate) return risultato(true, ultimoTesto, null);

      onProgress(`cancello: ${gate}`);
      const check = await esegui(gate.split(' '), cwd);
      if (check.uscita === 0) return risultato(true, ultimoTesto, null);

      if (turni >= maxTurni - 1) {
        return risultato(false, ultimoTesto, `il cancello \`${gate}\` non passa`);
      }
      onProgress('cancello fallito, rimando il modello al lavoro');
      contents.push({ role: 'model', parts: [{ text: testo || '(nessun testo)' }] });
      contents.push({
        role: 'user',
        parts: [{ text: `Il comando \`${gate}\` non passa. Coda dell'output:\n\n${check.output}\n\nCorreggi il problema. Non cambiare nient'altro.` }],
      });
      continue;
    }

    contents.push({ role: 'model', parts: parti });
    const risposteStrumenti = [];
    let haScritto = false;
    for (const { functionCall } of chiamate) {
      const esito = await eseguiStrumento(functionCall.name, functionCall.args || {}, cwd, onProgress);
      if (functionCall.name === 'scrivi_file' && !esito.errore) haScritto = true;
      risposteStrumenti.push({ functionResponse: { name: functionCall.name, response: esito } });
    }
    contents.push({ role: 'user', parts: risposteStrumenti });

    if (haScritto) {
      scritturaFatta = true;
      turniSenzaScrittura = 0;
    } else {
      turniSenzaScrittura++;
    }

    // Gira a vuoto da un po' e ha gia' cambiato qualcosa: chiudiamo noi, se il
    // cancello e' verde.
    if (scritturaFatta && turniSenzaScrittura >= SOGLIA_INERZIA && gate) {
      const check = await esegui(gate.split(' '), cwd);
      if (check.uscita === 0) {
        onProgress('lavoro fermo e cancello verde: chiudo io');
        return risultato(true, ultimoTesto || 'Lavoro completato (il modello non lo ha dichiarato).', null);
      }
      turniSenzaScrittura = 0;
    }
  }

  // Limite raggiunto: se pero' ha lavorato e il cancello passa, il lavoro e'
  // buono e va tenuto — sarebbe assurdo buttarlo per un turno di troppo.
  if (scritturaFatta && gate) {
    const check = await esegui(gate.split(' '), cwd);
    if (check.uscita === 0) {
      return risultato(true, ultimoTesto || 'Lavoro completato al limite dei turni.',
        `chiuso al limite di ${maxTurni} turni, ma \`${gate}\` passa`);
    }
  }
  return risultato(false, ultimoTesto, `raggiunto il limite di ${maxTurni} turni`);

  function risultato(ok, sommario, dettaglio) {
    const costo = (tokenIn / 1e6) * PREZZO.input + (tokenOut / 1e6) * PREZZO.output;
    return {
      ok,
      sommario: sommario || 'Nessuna risposta dal modello.',
      dettaglio,
      costo,
      turni,
      tokenIn,
      tokenOut,
    };
  }
}
