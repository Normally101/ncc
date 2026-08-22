/**
 * Secondo motore: lo stesso agente, ma parlando con OpenRouter.
 *
 * Perche' esiste. Il motore Gemini parla il dialetto di Google (`functionCall`,
 * `parts`, `contents`); OpenRouter parla quello di OpenAI (`tool_calls`,
 * `messages`). Il cervello dell'agente pero' e' lo stesso: gli stessi strumenti,
 * le stesse istruzioni, lo stesso cancello fra un turno e l'altro. Quindi qui si
 * traduce soltanto il modo di parlare, e tutto il resto si importa da
 * `gemini-agent.mjs` — un solo posto dove cambiare cosa l'agente sa fare.
 *
 * A cosa serve davvero: il piano gratuito di Google da' 10 richieste al minuto e
 * 20 al giorno sul modello che usiamo — mezzo lavoro. Qui invece c'e' una
 * SCALETTA di modelli gratuiti, e quando uno finisce il lavoro passa al
 * successivo senza fermarsi. Il guadagno non e' un modello "piu' potente": e' la
 * continuita'.
 *
 * Cosa sapere prima di usarlo:
 *   • I modelli `stealth/` sono anteprime a tempo. `ox-alpha` e' comparso il
 *     20/08/2026 ed e' annunciato gratis per circa una settimana. Quando
 *     sparira', la scaletta scorrera' da sola sui gratuiti permanenti: e'
 *     esattamente il caso per cui la scaletta esiste.
 *   • Il fornitore delle anteprime e' anonimo e le sue condizioni si
 *     contraddicono sull'uso dei prompt per l'addestramento. Il repository del
 *     gioco e' pubblico, quindi non c'e' un segreto che scappa — ma non ci passa
 *     mai niente d'altro.
 *   • Se TUTTA la scaletta tace al primo turno, l'errore porta
 *     `motoreNonDisponibile` e run-task.mjs rifa' il lavoro con Gemini.
 */
import { STRUMENTI, ISTRUZIONI, eseguiStrumento } from './gemini-agent.mjs';
import { execFile } from 'child_process';

/**
 * La scaletta dei modelli, in ordine di preferenza.
 *
 * Non e' un elenco di ripieghi per i guasti: e' il modo in cui questo agente
 * continua a lavorare quando un modello gratuito finisce. Il primo che risponde
 * fa il lavoro; quando smette di rispondere si passa al successivo, anche a
 * meta' conversazione — i messaggi sono testo, non appartengono a nessun
 * modello in particolare.
 *
 * L'ordine e perche':
 *  1. `stealth/ox-alpha` — anteprima a tempo, non consuma la quota `:free`
 *     (verificato il 22/08: oltre 250 richieste in un giorno senza rifiuti,
 *     quando il tetto `:free` sarebbe 50). Finisce verso il 27/08.
 *  2. `nemotron-3-ultra` — il piu' grande dei gratuiti veri, contesto da 1
 *     milione, ha risposto con lo strumento giusto in 3,1 secondi.
 *  3. `laguna-s` — il piu' veloce misurato (1,5 s), pensato per il codice.
 *  4. `nemotron-3-super` e 5. `north-mini-code` — la riserva.
 *
 * Tutti provati il 22/08 con una vera chiamata a strumento: questi cinque
 * l'hanno fatta. Scartati perche' NON funzionano: `glm-5.2` e `gemma-4` (il
 * fornitore risponde 429 anche a freddo), `inkling` (accessibile solo a chi ha
 * un piano dedicato).
 *
 * ATTENZIONE, e' la cosa che conta di piu': i modelli con il suffisso `:free`
 * condividono UNA SOLA quota d'account — 50 richieste al giorno, che diventano
 * 1.000 dopo aver comprato 10 dollari di credito una volta sola, per sempre.
 * Quindi allungare questa lista NON aumenta quanto si puo' lavorare: aumenta la
 * probabilita' di non fermarsi quando uno dei fornitori ha un problema suo.
 * Per avere piu' quota servono fornitori DIVERSI, non piu' modelli sullo stesso.
 */
export const SCALETTA_MODELLI = (process.env.GIGI_OPENROUTER_MODELLI
  ? process.env.GIGI_OPENROUTER_MODELLI.split(',').map((s) => s.trim()).filter(Boolean)
  : [
      'stealth/ox-alpha',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'poolside/laguna-s-2.1:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'cohere/north-mini-code:free',
    ]);

/** Il primo della scaletta, per chi vuole solo sapere «con cosa stiamo lavorando». */
export const MODELLO_OPENROUTER = process.env.GIGI_OPENROUTER_MODEL || SCALETTA_MODELLI[0];

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Anche un fornitore "senza limiti" ogni tanto dice di no: si aspetta e si riprova. */
const ATTESE_RIPROVA = [5_000, 15_000, 45_000, 90_000];

const MAX_BYTE_OUTPUT = 8_000;

function tronca(testo, limite = MAX_BYTE_OUTPUT) {
  if (testo.length <= limite) return testo;
  return testo.slice(0, limite) + `\n… [troncato, ${testo.length - limite} caratteri in piu']`;
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

/**
 * Traduce le dichiarazioni degli strumenti dal formato Google a quello OpenAI.
 *
 * La differenza e' quasi solo di maiuscole (`OBJECT` contro `object`), ma
 * scritta a mano due volte diventerebbe due elenchi da tenere allineati — e
 * prima o poi uno dei due resta indietro. Meglio tradurre.
 */
function strumentiInFormatoOpenAI() {
  const minuscolo = (schema) => {
    if (!schema || typeof schema !== 'object') return schema;
    const fuori = { ...schema };
    if (typeof fuori.type === 'string') fuori.type = fuori.type.toLowerCase();
    if (fuori.items) fuori.items = minuscolo(fuori.items);
    if (fuori.properties) {
      fuori.properties = Object.fromEntries(
        Object.entries(fuori.properties).map(([k, v]) => [k, minuscolo(v)]),
      );
    }
    return fuori;
  };

  return STRUMENTI[0].functionDeclarations.map((d) => ({
    type: 'function',
    function: {
      name: d.name,
      description: d.description,
      parameters: minuscolo(d.parameters) || { type: 'object', properties: {} },
    },
  }));
}

async function chiedi(messaggi, modello, chiave) {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${chiave}`,
      'Content-Type': 'application/json',
      // OpenRouter chiede di identificare il chiamante; e' anche il modo in cui
      // il consumo si legge nella dashboard.
      'HTTP-Referer': 'https://www.chauffeurempire.com',
      // Solo ASCII: le intestazioni HTTP non accettano altro, e un trattino
      // lungo qui faceva fallire la richiesta prima ancora di partire.
      'X-Title': 'Chauffeur Empire agent',
    },
    body: JSON.stringify({ model: modello, messages: messaggi, tools: strumentiInFormatoOpenAI() }),
  });
  const dati = await r.json();
  if (dati.error) {
    const e = new Error(dati.error.message || 'errore da OpenRouter');
    e.codice = dati.error.code;
    throw e;
  }
  return dati;
}

export async function runOpenRouterAgent({
  richiesta,
  cwd,
  gate = null,
  onProgress = () => {},
  maxTurni = 70,
  timeoutMs = 45 * 60_000,
  /* Una scaletta, non un modello: `model` resta accettato per compatibilita'
     e per i collaudi mirati, ma il funzionamento normale e' la rotazione. */
  model = null,
  modelli = SCALETTA_MODELLI,
}) {
  const chiave = process.env.OPENROUTER_API_KEY;
  if (!chiave) throw new Error('manca OPENROUTER_API_KEY');

  const messaggi = [
    { role: 'system', content: ISTRUZIONI },
    {
      role: 'user',
      content: `${richiesta}\n\nCartella di lavoro: ${cwd}${gate ? `\nComando di verifica: ${gate}` : ''}`,
    },
  ];

  /* La scaletta vera: se qualcuno ha chiesto un modello preciso si rispetta e
     basta, altrimenti si scorre l'elenco. */
  const scaletta = model ? [model] : [...modelli];
  let indiceModello = 0;
  /* Quali modelli hanno davvero lavorato. Serve nel riepilogo: sapere che un
     lavoro l'ha finito il terzo della lista dice che i primi due erano esauriti,
     ed e' l'unico modo di accorgersene senza leggere i log. */
  const usati = [];

  let tokenIn = 0;
  let tokenOut = 0;
  let turni = 0;
  let ultimoTesto = '';
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
    /* Due cicli annidati, e la differenza fra i due e' il punto di tutto:
       quello interno aspetta (il modello e' momentaneamente occupato, fra
       novanta secondi torna); quello esterno cambia modello (questo e' finito
       per oggi, aspettare non serve). Confonderli significa o aspettare invano
       una quota che non torna prima di domani, o abbandonare un modello che
       aveva solo un minuto di traffico. */
    while (indiceModello < scaletta.length) {
      const modelloOra = scaletta[indiceModello];
      erroreUltimo = null;
      for (let tentativo = 0; tentativo <= ATTESE_RIPROVA.length; tentativo++) {
        try {
          risposta = await chiedi(messaggi, modelloOra, chiave);
          erroreUltimo = null;
          if (!usati.includes(modelloOra)) usati.push(modelloOra);
          break;
        } catch (e) {
          erroreUltimo = e;
          const saturo = e.codice === 429 || e.codice === 503
            || /429|rate limit|exhausted|unavailable|overload/i.test(e.message || '');
          if (!saturo || tentativo === ATTESE_RIPROVA.length) break;
          const attesa = ATTESE_RIPROVA[tentativo];
          onProgress(`${modelloOra}: occupato, riprovo fra ${attesa / 1000}s`);
          await new Promise((r) => setTimeout(r, attesa));
        }
      }
      if (!erroreUltimo) break;

      indiceModello++;
      if (indiceModello < scaletta.length) {
        onProgress(`${modelloOra} non risponde piu' → passo a ${scaletta[indiceModello]}`);
      }
    }
    if (erroreUltimo) {
      /* Se cade al PRIMO turno non e' il lavoro ad essere difficile: e' il
         motore a non rispondere — l'anteprima e' finita, la chiave e' scaduta,
         il fornitore e' giu'. In quel caso conviene dirlo a chi ci ha chiamato
         perche' riprovi con Gemini, invece di buttare via il lavoro. Dal
         secondo turno in poi no: il modello ha gia' toccato dei file, e
         ricominciare da capo con un altro motore farebbe danni. */
      if (turni === 1) {
        const e = new Error(
          `nessuno dei ${scaletta.length} modelli OpenRouter risponde (ultimo: ${erroreUltimo.message})`);
        e.motoreNonDisponibile = true;
        throw e;
      }
      return risultato(false, ultimoTesto, `il modello ha rifiutato la richiesta: ${erroreUltimo.message}`);
    }

    tokenIn += risposta.usage?.prompt_tokens ?? 0;
    tokenOut += risposta.usage?.completion_tokens ?? 0;

    const messaggio = risposta.choices?.[0]?.message ?? {};
    const chiamate = messaggio.tool_calls || [];
    const testo = (messaggio.content || '').trim();
    if (testo) ultimoTesto = testo;

    // Nessuno strumento: il modello dice di aver finito. Prima di crederci,
    // facciamo girare noi il cancello — identico al motore Gemini.
    if (!chiamate.length) {
      if (!gate) return risultato(true, ultimoTesto, null);

      onProgress(`cancello: ${gate}`);
      const check = await esegui(gate.split(' '), cwd);
      if (check.uscita === 0) return risultato(true, ultimoTesto, null);

      if (turni >= maxTurni - 1) {
        return risultato(false, ultimoTesto, `il cancello \`${gate}\` non passa`);
      }
      onProgress('cancello fallito, rimando il modello al lavoro');
      messaggi.push({ role: 'assistant', content: testo || '(nessun testo)' });
      messaggi.push({
        role: 'user',
        content: `Il comando \`${gate}\` non passa. Coda dell'output:\n\n${check.output}\n\nCorreggi il problema. Non cambiare nient'altro.`,
      });
      continue;
    }

    messaggi.push(messaggio);
    let haScritto = false;
    for (const chiamata of chiamate) {
      let args = {};
      try {
        args = JSON.parse(chiamata.function.arguments || '{}');
      } catch {
        // Argomenti illeggibili: si dice al modello invece di far cadere il
        // lavoro. Succede, e la seconda volta di solito li scrive giusti.
        messaggi.push({
          role: 'tool',
          tool_call_id: chiamata.id,
          content: JSON.stringify({ errore: 'argomenti non leggibili come JSON: riscrivili' }),
        });
        continue;
      }
      const esito = await eseguiStrumento(chiamata.function.name, args, cwd, onProgress);
      if ((chiamata.function.name === 'scrivi_file' || chiamata.function.name === 'modifica_file') && !esito.errore) {
        haScritto = true;
      }
      messaggi.push({
        role: 'tool',
        tool_call_id: chiamata.id,
        content: JSON.stringify(esito),
      });
    }

    if (haScritto) {
      scritturaFatta = true;
      turniSenzaScrittura = 0;
    } else {
      turniSenzaScrittura++;
    }

    if (scritturaFatta && turniSenzaScrittura >= SOGLIA_INERZIA && gate) {
      const check = await esegui(gate.split(' '), cwd);
      if (check.uscita === 0) {
        onProgress('lavoro fermo e cancello verde: chiudo io');
        return risultato(true, ultimoTesto || 'Lavoro completato (il modello non lo ha dichiarato).', null);
      }
      turniSenzaScrittura = 0;
    }
  }

  if (scritturaFatta && gate) {
    const check = await esegui(gate.split(' '), cwd);
    if (check.uscita === 0) {
      return risultato(true, ultimoTesto || 'Lavoro completato al limite dei turni.',
        `chiuso al limite di ${maxTurni} turni, ma \`${gate}\` passa`);
    }
  }
  return risultato(false, ultimoTesto, `raggiunto il limite di ${maxTurni} turni`);

  function risultato(ok, sommario, dettaglio) {
    return {
      ok,
      sommario: sommario || 'Nessuna risposta dal modello.',
      dettaglio,
      // Zero non e' una stima: durante l'anteprima il modello e' fatturato a
      // zero da entrambi i lati. Se un giorno smettesse di esserlo, il conto
      // non lo scoprirebbe questo file — lo scoprirebbe la dashboard.
      costo: 0,
      modelliUsati: usati,
      turni,
      tokenIn,
      tokenOut,
    };
  }
}
