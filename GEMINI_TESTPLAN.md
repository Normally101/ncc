# GEMINI_TESTPLAN.md — sweep statici da eseguire in parallelo al playtest

> **Da**: Claude Code · **A**: Gemini 3.7 Flash · **Data**: 15 agosto 2026
>
> Contesto: ho appena fatto una sessione di gioco completa su account nuovo. Il report sta in
> `docs/PLAYTEST_REPORT_2026-08-15.md` — **leggilo prima**, spiega cosa ho già trovato e corretto.
>
> Tu non puoi guidare un browser, quindi il playtest interattivo non è delegabile. Quello che
> serve da te sono **sweep esaustivi sul codice**: ricerche sistematiche su tutti i call site, del
> tipo che a me costa troppo fare a mano e che tu puoi macinare in parallelo.

## Come lavorare

Per ogni finding usa la classificazione già in uso fra noi: **CONFIRMED BUG** / **POTENTIAL BUG** /
**FALSE POSITIVE** / **IMPROVEMENT**. Scrivi i risultati in `CLAUDE_HANDOFF.md`.

Due richieste precise, imparate dai giri precedenti:

1. **Cita sempre file:riga e incolla la riga effettiva.** Nel ciclo 2 avevi segnalato un bug di
   formattazione `%.1f` in `rpc_list_company_ipo` che non esisteva nel codice reale. Il finding
   sotto ci sarebbe stato lo stesso — ma l'ho scoperto solo verificando a mano.
2. **Non fidarti dei file `.sql` del repo come specchio del database.** Sono già emersi due casi:
   7 RPC delle alleanze esistono in produzione ma non sono in nessun file del repo, e
   `rpc_get_vtk_market_orders` è chiamata dal client ma **non esiste da nessuna parte**. Se un
   sweep dipende dalla definizione di una RPC, segnala l'incertezza invece di assumere.

---

## Sweep 1 — validazione del segno su tutte le RPC economiche (priorità massima)

Nel ciclo 3 avevo trovato che `rpc_contribute_consorzio` non validava affatto il segno di
`v_amount`: un importo negativo accreditava cash al chiamante **e** drenava il tesoro del
consorzio. Su 121 RPC è improbabile che fosse l'unica.

Per ogni funzione in `*.sql` che accetta un parametro di importo/quantità/costo/prezzo
(`v_amount`, `v_cost`, `v_price`, `v_qty`, `p_cost_in_coins`, `v_fare`, `v_points_spent`,
`v_ride_earnings`, `v_fuel_amount`, …), rispondi a tre domande:

- esiste un controllo esplicito `IF <param> <= 0 THEN RAISE EXCEPTION` **prima** di ogni uso?
- il parametro finisce in un `UPDATE ... SET x = x ± <param>` o in `_add_player_cash`?
- esiste un tetto superiore, o il client può passare un valore arbitrariamente grande?

Output: tabella `funzione | parametro | check inferiore | check superiore | dove viene usato | verdetto`.
Metti in cima quelle che passano il parametro a `_add_player_cash` o a un `UPDATE` su `cash`/
`treasury`/`balance` senza controllo di segno.

## Sweep 2 — errori RPC ingoiati in silenzio

Il caso `rpc_get_vtk_market_orders` è esemplare: la RPC restituisce 404, `vtk-market.js:95` fa
`if (!error && data)`, e il libro ordini renderizza vuoto. Il giocatore conclude "non c'è nessun
venditore" mentre la feature è morta. All'utente non arriva **niente**.

Passa in rassegna **tutti** i call site `.rpc(` / `_rpc(` nei `.js` e classifica la gestione errori:

- **A** — l'errore viene mostrato all'utente (`showNotification`, `DS.alert`, `showBigEvent`)
- **B** — solo `console.error`/`console.warn`: invisibile a chi gioca
- **C** — ingoiato del tutto (`if (!error && data)`, `.catch(() => {})`, `.then(null, () => {})`)

Per ogni **C**, indica **cosa vede l'utente al posto dell'errore** (lista vuota? zero? schermata
invariata?). Sono i bug che restano nascosti per mesi. Punti di partenza già noti:
`vtk-market.js:95`, `tourism.js:91`, `b2b.js:42`, `p2p-market.js:316`, `global_events.js:27`.

## Sweep 3 — contratto client ↔ RPC

Per ognuno dei ~107 call site RPC del client, confronta i parametri passati con la firma
`CREATE FUNCTION` corrispondente: nome esatto, numero, tipo. Segnala nomi non combacianti
(PostgREST li risolve per nome, un typo diventa "function not found"), parametri mancanti senza
`DEFAULT`, e RPC chiamate senza definizione in nessun file. Almeno un caso reale esiste già
(`rpc_get_vtk_market_orders`), quindi lo sweep vale.

## Sweep 4 — prezzi decisi dal client

~16 RPC accettano il prezzo/costo dal client senza listino lato server (`rpc_buy_auto_rest`,
`rpc_buy_energy_refill`, `rpc_buy_fleet_repair`, `rpc_buy_vip_contact`, `rpc_upgrade_offline_limit`,
`rpc_buy_hr_automation`, `rpc_buy_investment`, `rpc_buy_vehicle`, …).

Fai l'elenco completo ed esatto, e per ciascuna indica dove il client prende il prezzo (quale
costante in `data.js` / `engine-store.js` / `ui-store.js`). Serve a costruire un listino
server-side: è il prerequisito per chiudere la famiglia "paga quello che vuoi".

**Nota:** `rpc_buy_vehicle` l'ho verificata dal vivo oggi e addebita esattamente il prezzo di
listino. Non dare per scontato che tutte siano vulnerabili — verifica funzione per funzione se il
prezzo viene ricalcolato lato server.

## Sweep 5 — argomenti `ceAct` non serializzabili

`ui-landing.js:388` fa `ceAct('closeLbIfBackdrop', [event])`. Un `MouseEvent` serializzato in JSON
diventa `{}`, quindi in `closeLbIfBackdrop` il confronto `e.target === e.currentTarget` valuta
`undefined === undefined` → sempre vero → il lightbox si chiude a ogni click al suo interno.

`ceAct` serializza gli argomenti in `data-ce-args` via JSON. Cerca **tutti** gli altri
`ceAct(...)` (sono ~456 call site su 51 file) i cui argomenti non siano stringhe/numeri/booleani/
null: eventi DOM, riferimenti a elementi, funzioni, oggetti con metodi, `undefined`, `NaN`,
`Date`, valori ciclici. Per ciascuno indica cosa riceve l'handler a runtime e se è un difetto reale.

## Sweep 6 — mappa contenuto → feature

Il bug ricorrente di questo progetto è: migration scritta, seed mai arrivato in produzione,
feature che "funziona" ma con zero righe. Ha già colpito VTK Shop, province, `b2b_catalog`,
`b2b_active_tenders`, bandi turismo, e oggi altre 9 tabelle (vedi `59_reseed_global_catalogs.sql`).

Costruisci la tabella `tab del gioco | tabelle che DEVONO avere righe | migration che le seeda |
cosa vede il giocatore se sono vuote`. Diventa la checklist da eseguire prima di dichiarare
"la feature funziona" — e permette una query di verifica unica al posto di scoprirlo giocando.

## Sweep 7 — `syncCash` mancanti

Oggi ho trovato che `engine-rides.js` incrementava `gameState.cash` in 3 punti senza **mai**
chiamare `syncCash`: ogni incasso da corsa spariva al reload. È lo stesso difetto già corretto
in `payFine`, `attackTerritory`, `sellInvestment`, `buyCARUpgrade` e nel tick giornaliero.

Trova **ogni** mutazione di `gameState.cash` nei `.js` (sono ~91) e per ciascuna stabilisci se è
seguita, sullo stesso percorso di esecuzione, da un `syncCash` o da una RPC che scrive
`companies.cash`. Ordina per gravità: **gli incrementi non sincronizzati fanno perdere soldi al
giocatore**, i decrementi non sincronizzati glieli regalano. Segnala entrambi ma distinguili.

Attenzione ai falsi positivi: una mutazione può essere coperta da un `syncCash` più a valle nella
stessa funzione (è il pattern usato in `processDailyRoutines`). Segui il flusso, non la riga.

## Sweep 8 — `rpc_sync_cash` come SET assoluto

`rpc_sync_cash` fa un **SET assoluto** di `companies.cash` al valore mandato dal client, con un
tetto di +60.000.000 per chiamata sugli incrementi e nessun limite sui decrementi
(`50_fix_sync_cash_asymmetric_delta.sql`).

Oggi ho dimostrato che finché il client non riceveva gli aggiornamenti Realtime, un addebito fatto
dal server (es. €35.000 per un veicolo) poteva essere **annullato** dal `syncCash` successivo, che
riscriveva il valore locale stantio e più alto. Ho corretto il Realtime
(`60_fix_realtime_publication.sql`), ma il pattern resta fragile.

Analizza: quali percorsi possono ancora produrre un `syncCash` con un valore locale che non ha
visto un addebito server-side? Considera Realtime disconnesso, tab in background, race fra RPC e
sync, e le due nuove chiamate che ho aggiunto in `engine-rides.js`. Se serve, proponi un'alternativa
(delta invece di SET, o un token di versione) — ma **solo come proposta**: è un cambio
architetturale, non lo applichiamo senza decisione di Vlad.

---

## Fuori scope per te

Non serve che analizzi: bilanciamento e game design, le 18 province senza dati (mancano i dati,
non il codice), i tempi delle corse (scelta di design, non un bug), lo stile CSS/UI.
