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

/* Quanto puo' costare UN tentativo prima che valga la pena fermarlo. Un lavoro
   riuscito costa fra 0,40 e 0,80 dollari; oltre il doppio del piu' caro fra
   quelli buoni, non sta lavorando, sta girando in tondo. */
const TETTO_SPESA = 1.60;

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

export const STRUMENTI = [{
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
      name: 'modifica_file',
      description:
        'Sostituisce un pezzo di un file esistente lasciando intatto tutto il resto. ' +
        'DA PREFERIRE a scrivi_file quando il file esiste già: non serve rigenerarlo tutto. ' +
        'Il testo da sostituire deve comparire una volta sola nel file, altrimenti la modifica viene rifiutata.',
      parameters: {
        type: 'OBJECT',
        properties: {
          percorso: { type: 'STRING', description: 'percorso relativo alla cartella di lavoro' },
          cerca: { type: 'STRING', description: 'il testo esatto da sostituire, com\'è nel file' },
          sostituisci: { type: 'STRING', description: 'il testo nuovo che prende il suo posto' },
        },
        required: ['percorso', 'cerca', 'sostituisci'],
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
        'Passa il comando come lista di argomenti, per esempio ["npm","test"]. ' +
        'IMPORTANTE: `npm test` lancia oltre 400 test e richiede 7-9 minuti. Mentre lavori usa ' +
        '["node","--test","test/la-tua-cartella/il-tuo-file.test.js"], che risponde in pochi secondi. ' +
        'Tieni `npm test` per la verifica finale, quando credi di aver finito: se lo lanci a ogni ' +
        'passaggio finisci il tempo prima del lavoro.',
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
export async function eseguiStrumento(nome, args, cwd, onProgress) {
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
      case 'modifica_file': {
        const file = risolviDentro(cwd, args.percorso);
        const testo = fs.readFileSync(file, 'utf8');
        const occorrenze = testo.split(args.cerca).length - 1;
        // Zero o più di una: in entrambi i casi non sappiamo cosa stiamo
        // cambiando. Meglio dirlo e farglielo riprovare con più contesto
        // attorno, che modificare il punto sbagliato del file.
        if (occorrenze === 0) {
          return { errore: 'il testo da sostituire non compare nel file: rileggilo e copialo esattamente' };
        }
        if (occorrenze > 1) {
          return { errore: `il testo compare ${occorrenze} volte: aggiungi righe attorno finché non è unico` };
        }
        onProgress(`modifica ${args.percorso}`);
        fs.writeFileSync(file, testo.replace(args.cerca, args.sostituisci), 'utf8');
        return { modificato: args.percorso };
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

export const ISTRUZIONI = `Sei un programmatore che lavora su un repository gia' esistente.

Regole:
- Leggi il codice prima di cambiarlo: non inventare nomi di funzioni o di file.
- Fai la modifica MINIMA che risolve il compito. Niente refactor collaterali.
- Su un file che esiste già usa modifica_file, non scrivi_file: rigenerare un file
  intero per cambiarne tre righe è lento e rischia di perderne pezzi.
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
  /* Due strade per lo stesso modello.
   *
   * Con GEMINI_API_KEY si passa dall'endpoint di AI Studio, che ha un piano
   * gratuito permanente. Verificato il 22/08/2026: `gemini-3.7-flash` c'e'
   * anche li', quindi non si scende di qualita' — si smette solo di pagarlo.
   * Il 21/08 Vertex e' costato 124,62 euro in un giorno.
   *
   * Senza la chiave si torna a Vertex esattamente come prima, quindi il
   * ritorno indietro e' togliere una variabile d'ambiente.
   *
   * Quello che cambia davvero e' il limite: il piano gratuito conta le
   * RICHIESTE, non i token. Un lavoro puo' arrivare a 70 turni e ogni turno e'
   * una richiesta, quindi il collo di bottiglia si sposta dal portafoglio al
   * contatore giornaliero — ed e' per questo che qui sotto i 429 si aspettano
   * invece di far fallire il lavoro. */
  const chiaveGratis = process.env.GEMINI_API_KEY || '';
  const ai = chiaveGratis
    ? new GoogleGenAI({ apiKey: chiaveGratis })
    : new GoogleGenAI({
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
  /* Dopo quanti turni di sola lettura si richiama il modello. Dodici e' circa
     un sesto del budget: abbastanza per orientarsi in un file grosso, troppo
     per non aver ancora deciso da dove cominciare. */
  const SOGLIA_SOLA_LETTURA = 6;
  /* Vedi openrouter-agent.mjs per la storia: il richiamo a parole non basta.
     A dieci turni senza aver scritto niente, gli strumenti di lettura spariscono
     dalla richiesta e resta solo il modo di produrre qualcosa. */
  const SOGLIA_TAGLIO_LETTURA = 10;
  const soloScrittura = () => ({
    functionDeclarations: STRUMENTI[0].functionDeclarations.filter(
      (d) => !['leggi_file', 'elenca_cartella'].includes(d.name)),
  });
  let richiamoFatto = false;
  const scadenza = Date.now() + timeoutMs;

  while (turni < maxTurni) {
    if (Date.now() > scadenza) {
      return risultato(false, ultimoTesto, `tempo scaduto dopo ${turni} turni`);
    }
    /* Tetto di spesa. Il 21/08 un lavoro di sola esplorazione ha consumato
       settanta turni, 8,7 milioni di token in ingresso e 2,66 dollari senza
       toccare un file: il conto cresce a valanga perche' ogni turno rispedisce
       tutta la conversazione, e i turni finali costano dieci volte i primi.
       Il limite sui turni da solo non protegge — l'abbiamo alzato da 40 a 70 e
       il fallimento e' rimasto identico, solo tre volte piu' caro. */
    const spesoFinora = (tokenIn / 1e6) * PREZZO.input + (tokenOut / 1e6) * PREZZO.output;
    /* Sul piano gratuito il conto in dollari resta utile per capire quanto
       AVREBBE speso, ma non deve fermare niente: li' non si paga a token, si
       paga a richieste, e il freno giusto sono i turni. Senza questa riga il
       passaggio al gratis avrebbe accorciato i lavori a meta' senza che nessuno
       capisse perche'. */
    if (!chiaveGratis && spesoFinora > TETTO_SPESA) {
      return risultato(false, ultimoTesto,
        `tetto di spesa raggiunto ($${spesoFinora.toFixed(2)}) dopo ${turni} turni`);
    }
    turni++;

    let risposta;
    let erroreUltimo = null;
    for (let tentativo = 0; tentativo <= ATTESE_RIPROVA.length; tentativo++) {
      try {
        risposta = await ai.models.generateContent({
          model,
          contents,
          config: {
            tools: (!scritturaFatta && turni >= SOGLIA_TAGLIO_LETTURA)
              ? [soloScrittura()] : STRUMENTI,
            systemInstruction: ISTRUZIONI,
          },
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
      /* «Ho finito» senza aver scritto niente non e' aver finito.
       *
       * Il 22/08 due lavori di fila sono usciti cosi': ventuno turni, un milione
       * di token letti, zero file toccati — e riportati come RIUSCITI, perche'
       * `npm test` su codice immutato e' ovviamente verde. Il cancello non puo'
       * distinguere «fatto» da «non ho fatto niente»: guarda i test, e i test
       * non sanno che doveva succedere qualcosa.
       *
       * Quindi lo distinguiamo qui. Un lavoro che non ha scritto niente torna
       * indietro con scritto perche', e la riprova parte da quel motivo invece
       * che da capo. */
      if (!scritturaFatta) {
        return risultato(false, ultimoTesto,
          `ha concluso senza scrivere niente in ${turni} turni: il cancello passa solo `
          + `perche' il codice e' rimasto identico`);
      }
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
      if ((functionCall.name === 'scrivi_file' || functionCall.name === 'modifica_file') && !esito.errore)
        haScritto = true;
      risposteStrumenti.push({ functionResponse: { name: functionCall.name, response: esito } });
    }
    contents.push({ role: 'user', parts: risposteStrumenti });

    if (haScritto) {
      scritturaFatta = true;
      turniSenzaScrittura = 0;
    } else {
      turniSenzaScrittura++;
    }

    /* Il richiamo per chi legge e non scrive mai.
     *
     * La soglia di inerzia qui sotto scatta solo DOPO la prima scrittura: un
     * modello che si limita a esplorare non la incontra mai e arriva al limite
     * dei turni avendo solo letto. E' successo due volte il 22/08, con un
     * milione di token di contesto bruciati a navigare.
     *
     * Una volta sola, a meta' strada, gli si dice di smettere di guardarsi
     * intorno. Una volta e non a ogni turno: ripeterlo occuperebbe il contesto
     * proprio mentre il problema E' il contesto pieno. */
    if (!scritturaFatta && turni >= SOGLIA_SOLA_LETTURA && !richiamoFatto) {
      richiamoFatto = true;
      onProgress(`${turni} turni senza scrivere niente: richiamo il modello`);
      risposteStrumenti.push({ text:
        `Hai usato ${turni} turni senza scrivere un solo file. Smetti di leggere: `
        + `scrivi ORA la prima cosa, anche piccola e incompleta. Un lavoro parziale `
        + `si puo' riprendere, un lavoro solo letto no.` });
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
