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
 *   • Dal 23/08 la scaletta puo' avere un secondo fornitore, NVIDIA NIM, se
 *     `NVIDIA_NIM_API_KEY` e' presente: si accoda dopo OpenRouter e scatta solo
 *     quando il TETTO GIORNALIERO di OpenRouter chiude (non per un modello
 *     singolo occupato). E' la differenza fra "un modello in piu'" e "un conto
 *     in piu'": la scaletta OpenRouter da sola non aiuta contro il suo stesso
 *     tetto perche' e' per account, un fornitore con chiave e conto separati
 *     si'. Vedi SCALETTA_NVIDIA piu' sotto.
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
 *  1. `stealth/ox-alpha` — anteprima a tempo, finisce verso il 27/08.
 *     CORREZIONE del 22/08 sera: non e' vero che «non consuma quota». Ha un
 *     tetto suo (`free-models-per-day-stealth`) separato da quello dei `:free`,
 *     e quel pomeriggio l'abbiamo esaurito. Due tetti distinti vogliono dire
 *     che si puo' lavorare piu' a lungo, non per sempre.
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

const ENDPOINT_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Secondo fornitore: stesso protocollo (Chat Completions, `tool_calls`), ma
 * conto NVIDIA a se' stante. Serve SOLO per il caso che il commento sopra
 * descrive gia': il tetto di OpenRouter e' per account, quindi scorrere altri
 * modelli OpenRouter quando scatta non aiuta. Un fornitore diverso si', perche'
 * la sua quota non condivide nulla con quella di OpenRouter.
 *
 * Si attiva da solo se NVIDIA_NIM_API_KEY e' presente — altrimenti la scaletta
 * resta quella di sempre, un solo fornitore. Non ancora provato con una vera
 * chiamata a strumento (a differenza dei cinque della scaletta sopra, tutti
 * collaudati il 22/08): la prima run reale con la chiave dira' se il
 * tool-calling funziona cosi' com'e' o se il modello va cambiato.
 */
const ENDPOINT_NVIDIA = 'https://integrate.api.nvidia.com/v1/chat/completions';
export const SCALETTA_NVIDIA = (process.env.GIGI_NVIDIA_MODELLI
  ? process.env.GIGI_NVIDIA_MODELLI.split(',').map((s) => s.trim()).filter(Boolean)
  : ['nvidia/nemotron-3-super-120b-a12b']);

/** Anche un fornitore "senza limiti" ogni tanto dice di no: si aspetta e si riprova. */
const ATTESE_RIPROVA = [5_000, 15_000, 45_000, 90_000];

/**
 * Occupato adesso e finito per oggi non sono la stessa cosa.
 *
 * Il 22/08 il tetto giornaliero di OpenRouter si e' esaurito a meta' pomeriggio
 * e ogni run successiva ha bruciato cinque minuti a riprovare: quattro attese
 * per ciascuno dei cinque modelli della scaletta, tutte destinate a fallire
 * perche' il tetto e' PER ACCOUNT e non si libera prima di mezzanotte. Nove
 * lavori sono morti cosi', e nove mail di errore sono arrivate a Vlad.
 *
 * Un tetto giornaliero non si aspetta e non si aggira cambiando modello: si
 * riconosce e si smette subito, dicendo a chi ci ha chiamato che il problema
 * non era il lavoro.
 */
function quotaGiornalieraFinita(messaggio = '') {
    return /free-models-per-day|per-day|daily limit|quota.*(exceeded|exhausted).*day/i.test(messaggio);
}

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
function strumentiInFormatoOpenAI(soloScrittura = false) {
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

  /* Quando si toglie la lettura restano gli strumenti che producono qualcosa.
     `esegui_comando` resta perche' serve a lanciare i test: senza, il modello
     non potrebbe verificare quello che scrive. */
  const dichiarazioni = soloScrittura
    ? STRUMENTI[0].functionDeclarations.filter(
        (d) => !['leggi_file', 'elenca_cartella'].includes(d.name))
    : STRUMENTI[0].functionDeclarations;

  return dichiarazioni.map((d) => ({
    type: 'function',
    function: {
      name: d.name,
      description: d.description,
      parameters: minuscolo(d.parameters) || { type: 'object', properties: {} },
    },
  }));
}

async function chiedi(messaggi, modello, chiave, endpoint, soloScrittura = false) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${chiave}`,
      'Content-Type': 'application/json',
      // OpenRouter chiede di identificare il chiamante; e' anche il modo in cui
      // il consumo si legge nella dashboard. NVIDIA la ignora, ma non le da'
      // fastidio riceverla.
      'HTTP-Referer': 'https://www.chauffeurempire.com',
      // Solo ASCII: le intestazioni HTTP non accettano altro, e un trattino
      // lungo qui faceva fallire la richiesta prima ancora di partire.
      'X-Title': 'Chauffeur Empire agent',
    },
    body: JSON.stringify({ model: modello, messages: messaggi, tools: strumentiInFormatoOpenAI(soloScrittura) }),
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
     basta (resta su OpenRouter, e' il caso dei collaudi mirati). Altrimenti si
     scorre l'elenco OpenRouter e, se c'e' una chiave NVIDIA, si accoda anche
     quello — un fornitore in piu' con un conto suo, non un modello in piu'
     sullo stesso conto. Ogni voce porta la propria chiave ed endpoint, cosi'
     il resto del ciclo non deve sapere chi sta chiamando davvero. */
  const chiaveNvidia = process.env.NVIDIA_NIM_API_KEY;
  const scaletta = model
    ? [{ modello: model, fornitore: 'openrouter', chiave, endpoint: ENDPOINT_OPENROUTER }]
    : [
        ...modelli.map((modello) => (
          { modello, fornitore: 'openrouter', chiave, endpoint: ENDPOINT_OPENROUTER })),
        ...(chiaveNvidia
          ? SCALETTA_NVIDIA.map((modello) => (
              { modello, fornitore: 'nvidia', chiave: chiaveNvidia, endpoint: ENDPOINT_NVIDIA }))
          : []),
      ];
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
  /* Vedi gemini-agent.mjs: la soglia di inerzia scatta solo dopo la prima
     scrittura, quindi un modello che esplora e basta non la incontra mai.
     Sei turni di sola lettura e lo si richiama.

     Perche' due soglie e non una. Il 22/08 il richiamo a parole c'era gia' (a
     dodici turni, una volta sola) e NON e' bastato: quattro lavori di fila
     hanno continuato a leggere fino al turno 22, bruciando 850.000 token in
     ingresso per produrre 5.000 token di uscita e nessun file. L'ultima frase
     scritta da uno di loro era «Ora ho abbastanza contesto. Scrivo il nuovo
     file di test» — e li' sono finiti i turni.

     Una richiesta si puo' ignorare; uno strumento che non c'e' piu' no. Quindi
     a dieci turni senza scrivere gli strumenti di lettura vengono tolti dalla
     richiesta: restano scrivi_file, modifica_file ed esegui_comando. A quel
     punto l'unica mossa possibile e' produrre qualcosa. */
  const SOGLIA_SOLA_LETTURA = 6;
  const SOGLIA_TAGLIO_LETTURA = 10;
  let richiamoFatto = false;
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
      const voce = scaletta[indiceModello];
      erroreUltimo = null;
      for (let tentativo = 0; tentativo <= ATTESE_RIPROVA.length; tentativo++) {
        try {
          risposta = await chiedi(
            messaggi, voce.modello, voce.chiave, voce.endpoint,
            !scritturaFatta && turni >= SOGLIA_TAGLIO_LETTURA);
          erroreUltimo = null;
          if (!usati.includes(voce.modello)) usati.push(voce.modello);
          break;
        } catch (e) {
          erroreUltimo = e;
          /* Finito per oggi: non si riprova e non si scende la scaletta dello
             STESSO fornitore, perche' il tetto e' del suo account e vale per
             tutti i suoi modelli insieme. Un fornitore diverso pero' ha un
             conto suo: la gestione e' subito sotto, fuori da questo for. */
          if (quotaGiornalieraFinita(e.message)) {
            erroreUltimo.quotaGiornaliera = true;
            break;
          }
          const saturo = e.codice === 429 || e.codice === 503
            || /429|rate limit|exhausted|unavailable|overload/i.test(e.message || '');
          if (!saturo || tentativo === ATTESE_RIPROVA.length) break;
          const attesa = ATTESE_RIPROVA[tentativo];
          onProgress(`${voce.modello}: occupato, riprovo fra ${attesa / 1000}s`);
          await new Promise((r) => setTimeout(r, attesa));
        }
      }
      if (!erroreUltimo) break;

      if (erroreUltimo.quotaGiornaliera) {
        /* Salta avanti fino al primo modello di un fornitore DIVERSO da quello
           appena esaurito — scorrere altri modelli dello stesso non serve, la
           quota e' condivisa. Se non ne resta nessuno, e' davvero finita. */
        let prossimo = indiceModello + 1;
        while (prossimo < scaletta.length && scaletta[prossimo].fornitore === voce.fornitore) prossimo++;
        if (prossimo >= scaletta.length) break; // nessun fornitore diverso rimasto
        onProgress(`${voce.fornitore}: tetto giornaliero esaurito → passo a ${scaletta[prossimo].fornitore}`);
        indiceModello = prossimo;
        continue;
      }

      indiceModello++;
      if (indiceModello < scaletta.length) {
        onProgress(`${voce.modello} non risponde piu' → passo a ${scaletta[indiceModello].modello}`);
      }
    }
    if (erroreUltimo) {
      /* Se cade al PRIMO turno non e' il lavoro ad essere difficile: e' il
         motore a non rispondere — l'anteprima e' finita, la chiave e' scaduta,
         il fornitore e' giu'. In quel caso conviene dirlo a chi ci ha chiamato
         perche' riprovi con Gemini, invece di buttare via il lavoro. Dal
         secondo turno in poi no: il modello ha gia' toccato dei file, e
         ricominciare da capo con un altro motore farebbe danni. */
      if (erroreUltimo.quotaGiornaliera) {
        const e = new Error(
          `QUOTA GIORNALIERA ESAURITA su tutti i fornitori disponibili: ${erroreUltimo.message}`);
        e.quotaGiornaliera = true;
        /* Non e' «il motore non c'e'»: e' «per oggi basta, anche con NVIDIA se
           era in scaletta». Ripiegare su Gemini non aiuta — il suo piano
           gratuito da' venti richieste al giorno e un lavoro ne mangia trenta.
           Meglio fermarsi e riprendere domani. */
        throw e;
      }
      if (turni === 1) {
        const e = new Error(
          `nessuno dei ${scaletta.length} modelli disponibili risponde (ultimo: ${erroreUltimo.message})`);
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
      /* «Ho finito» senza aver scritto niente non e' aver finito: il cancello
         passa perche' il codice e' identico, non perche' il lavoro sia fatto.
         Succede davvero — due volte il 22/08, ventuno turni e un milione di
         token per zero file. Torna indietro col motivo scritto. */
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

    if (!scritturaFatta && turni >= SOGLIA_SOLA_LETTURA && !richiamoFatto) {
      richiamoFatto = true;
      onProgress(`${turni} turni senza scrivere niente: richiamo il modello`);
      messaggi.push({
        role: 'user',
        content: `Hai usato ${turni} turni senza scrivere un solo file. Smetti di leggere: `
          + `scrivi ORA la prima cosa, anche piccola e incompleta. Un lavoro parziale `
          + `si puo' riprendere, un lavoro solo letto no.`,
      });
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
