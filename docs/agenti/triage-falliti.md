# Triage dei 26 task falliti — 22/08/2026 sera

Metodo: per ogni task ho verificato nel repository (non nei titoli) se il lavoro
corrispondente è già su `main`, mai stato tentato, o tentato ma con un difetto di
fondo. Comandi usati: `git log main --oneline -- <file>`, `git merge-base
--is-ancestor`, lettura diretta dei guardrail e delle liste ECCEZIONI (che per
convenzione "possono solo accorciarsi"), ed esecuzioni dirette dei test
interessati. Legenda: **SUPERATO** = non rilanciare, già fatto altrove.
**RILANCIA** = task corretto, va solo ritentato. **RISCRIVI** = testo nuovo in
fondo al documento.

## Tabella riassuntiva

| # | Task | Verdetto | Prova |
|---|------|----------|-------|
| 1 | ce-ui-staff-2 (porta unica ui-staff.js) | **SUPERATO** | merge `f9272a7`; `ECCEZIONI` in `una-sola-porta.test.js:29` = `new Set([])` |
| 2 | porta-hq-0820 (porta unica hq.js) | **SUPERATO** | merge `8325dc6`, commit `a271c14` su main; `ECCEZIONI` vuota |
| 3 | porta-engine-js-corse (porta unica engine.js corse) | **SUPERATO** | commit `eaadf96` su main; `ECCEZIONI` vuota |
| 4 | censimento-doppio-conteggio | **SUPERATO** | `docs/DOPPIO-CONTEGGIO.md:5` — "STATO AL 22/08/2026: ZERO casi ancora aperti" |
| 5 | doppio-p2p (8 casi) | **SUPERATO** | fa parte dei 17 casi chiusi nel censimento sopra (merge `2063fe2`) |
| 6 | doppio-territorio (2 casi) | **SUPERATO** | merge `10f6dcc`, commit `d9c79bc` |
| 7 | banco-prova-file-mancanti | **SUPERATO** | `test/guardrail/banco-file-mancanti.test.js` su main (`862bfbf`); misura 34/37 file caricabili |
| 8 | dc-rifiuto-server | **SUPERATO** | `test/guardrail/spenddc-rifiuto-server.test.js` su main (`939702c`) |
| 9 | nomi-doppi-secondo-giro | **SUPERATO** | commit `dca4ff0`, titolo identico, su main |
| 10 | architettura-aggiornare | **SUPERATO** | commit `2734502` "...— correzione" su main |
| 11 | doppio-conteggio-aggiornare | **SUPERATO** | commit `f403539`, titolo identico, su main |
| 12 | nomi-doppi-secondo-giro-rip... | **SUPERATO** | duplicato del #9, stesso commit `dca4ff0` |
| 13 | azioni-cieche-vip | **SUPERATO** | `config.js:53` `vip: true` (41 prove); `test/funzioni/vip.test.js` + `test/azioni/vip-*.test.js` |
| 14 | azioni-cieche-societa | **SUPERATO** | `config.js` `holding: true` (32 prove); `test/funzioni/holding.test.js` + `test/azioni/societa.test.js` |
| 15 | azioni-cieche-flotta-officina | **SUPERATO** | `flotta` è nucleo (sempre `true`); `test/funzioni/flotta.test.js` (comprare/vendere) + `test/azioni/flotta-officina.test.js` (officina/rifornimento) |
| 16 | azioni-cieche-autisti | **SUPERATO** | `autisti` nucleo `true`; `test/funzioni/autisti.test.js` + `test/azioni/autisti.test.js` |
| 17 | azioni-cieche-mercati | **SUPERATO** | `aste/vtk/turismo/salone: true` (verificati 20-21/08); `test/funzioni/{aste,vtk,turismo,salone}.test.js` + `test/azioni/mercati-*.test.js` |
| 18 | azioni-cieche-ombra | **SUPERATO** | `config.js:53` `nemesi: true` (38 prove: nemici VIP, agenzia ombra); `test/funzioni/nemesi.test.js`, `test/events/{nemesis,black-ops}-sync.test.js` |
| 19 | azioni-cieche-finanza-obblighi | **SUPERATO** | `finanza` nucleo `true`; `test/azioni/finanza-prestiti.test.js`, `finanza-rendite.test.js`, `test/funzioni/finanza.test.js` (1027 righe) |
| 20 | azioni-cieche-alleanze-consorzi | **SUPERATO** | `alleanze: true` (41 prove); `test/funzioni/alleanze.test.js` + `test/azioni/alleanze-consorzi.test.js` |
| 21 | azioni-cieche-dc-vanita | **SUPERATO** | `negozioDC: true` (43 prove, 12 spese), `vanita: true`, `lusso: true`; `test/funzioni/{negozioDC,vanita,lusso}.test.js` |
| 22 | politica-nel-banco (11 tentativi) | **RISCRIVI** | vedi sezione dedicata |
| 23 | reputazione-una-formula | **RISCRIVI** | vedi sezione dedicata |
| 24 | nomi-doppi-nove | **RILANCIA COSÌ COM'ERA** | stato attuale combacia col titolo: 9 eccezioni esatte, mai tentato |
| 25 | politica-nel-banco (12 tentativi) | **RISCRIVI** | stesso lavoro del #22 — un solo task nuovo copre entrambi |
| 26 | economia-server-censimento | **RISCRIVI** | vedi sezione dedicata |

## Le famiglie "SUPERATO" — come sono state verificate

**Porta unica del denaro (#1-3):** `test/guardrail/una-sola-porta.test.js:29` ha
`const ECCEZIONI = new Set([])` — vuota. I tre commit dei file citati sono
raggiungibili da `main` (verificato con `git branch --contains` e
`git log main -- <file>`), non solo presenti su un branch remoto.

**Censimento doppio conteggio (#4, #5, #6, #11):** `docs/DOPPIO-CONTEGGIO.md`
riporta 12 file esaminati, 17 casi trovati, tutti marcati `CORRETTO:` con il
meccanismo della correzione. Il guardrail `censimento-doppio-conteggio.test.js`
sorveglia che il documento non perda righe.

**Nomi doppi, secondo giro (#9, #12):** commit `dca4ff0` (titolo identico a
entrambi) è su `main`. Il #12 ha lo stesso identificatore-radice `mt4...`
del #24 ma titolo diverso — non è duplicato del #24, lo è solo del #9.

**Le 9 "azioni cieche" (#13-21):** lanciate lo stesso giorno, fallite insieme —
causa comune confermata (non 9 cause diverse). Ma nel frattempo `config.js`
mostra **ogni singolo dominio già `true`** con conteggio prove esplicito nel
commento, e per ognuno esiste un file dedicato sia in `test/funzioni/` (il
"collaudo profondo" del sistema) sia spesso anche in `test/azioni/` (verifica
mirata di sincronizzazione col server). Le uniche due funzioni ancora `false`
in `FEATURES` sono `mercatoP2P` (bloccata da una collisione di nomi nota, non
in questa lista) e `politica` (i task #22/#25). Nessuno dei 9 domini elencati
nei task 13-21 corrisponde a una funzione ancora spenta.

## Politica nel banco (#22, #25) — la diagnosi completa

**Il dominio si è già diviso in due pezzi, e uno dei due è fatto.** Un lavoro
successivo ai task #22/#25 (non in questa lista di 26) ha spaccato "politica"
in "pezzo 1: solo ui-politics.js" e "pezzo 2: solo war_room.js":

- **Pezzo 2 (war_room.js) è su `main`**, commit `e3c206f`/merge `2c0af0a`:
  `test/funzioni/politica-warroom.test.js` (528 righe, 23 test, **tutti verdi**
  — eseguito qui). Costruisce un ambiente locale con
  `createGameEnv([...CORE_FILES, 'war_room.js'], {render:true, ...})` **senza
  toccare** `test-support/game-env.js`.
- **Pezzo 1 (ui-politics.js) NON è su `main`.** Tre tentativi
  (`0611f60`, `e87e848`, `3b4846f`) vivono sul branch
  `origin/gigi/collaudo-di-politica-pezzo-1-di-2-solo-u-08220232`, tutti con
  messaggio "Da rivedere prima del merge: nessuno ha ancora guardato questo
  codice" — mai mergiati, mai rivisti. Ho verificato quanto è indietro:
  **118 commit dietro `main`**, solo 1 avanti (`git rev-list --count`). È
  scritto contro una versione vecchia di `game-env.js` (mock `ServerState`
  semplificato, mancano `design-system.js`/`feature-gate.js`/`ui-fleet.js` in
  `CORE_FILES`) — troppo vecchio per un merge diretto, va riscritto da capo
  sulla base attuale, non recuperato.

**Perché quel branch va abbandonato, non recuperato:** ho provato a caricare
`ui-politics.js` nell'ambiente di test così com'è oggi su `main` — funziona
senza errori (`renderTabPolitics` e le sue funzioni diventano chiamabili,
nessuna eccezione). **Il blocco non è mai stato tecnico.** Coincide con la
diagnosi già scritta in `HANDOFF.md`: gli 11+12 tentativi aggiungevano il nome
del file all'elenco e si fermavano, senza una prova nuova che dimostrasse che
il file caricato funziona — il cancello ("i test non sono cresciuti") aveva
ragione a respingerli.

**La scoperta che restringe il lavoro vero:** i pulsanti di `ui-politics.js`
(`renderTabPolitics`, righe 5-108) non contengono logica economica propria —
chiamano funzioni che **vivono altrove e sono già testate**:
- `passLobbyLaw` → `engine-finance.js:411`, testata in
  `test/economy/finance-resto.test.js:177-206` e `test/funzioni/finanza.test.js:956-1027`
- `donateToLobby` → `engine-finance.js:399`, testata in
  `test/economy/finance-lobby.test.js:48-93`
- `decreesRefresh` / `voteServerDecree` → `ui-lifestyle.js:142,170`, testate in
  `test/funzioni/lusso.test.js:353-420`

Tutte e quattro sono già in `CORE_FILES` (via `engine-finance.js` e
`ui-lifestyle.js`) e già passano dalla porta unica del denaro. **Serve solo un
test del rendering** — la stessa cosa che pezzo 2 ha fatto per
`renderTabWarRoom`, non un ri-collaudo economico.

## Il tetto della reputazione (#23) — la diagnosi completa

Il task **è già stato tentato e mergiato** (commit `8dd9630`, stesso
"Da rivedere... nessuno ha guardato" delle altre run automatiche), ma il
risultato è **inutile**: ha creato `reputation-cap.js` (7 righe,
`CE_reputationCap = 5.0 + prestige`) e `test/reputation-cap.test.js` (30
righe, testa la funzione isolata in un contesto VM a parte). Verificato con
`grep -rl reputation-cap` su tutto il repo: **nessun altro file la
importa o la chiama**, e non è in `index.html` né in `CORE_FILES`. Codice
morto che ha soddisfatto il cancello ("un test nuovo esiste") senza spostare
nulla.

**Il pezzo che serve non serve inventarlo: esiste già, in un posto diverso.**
`money.js:193-201` ha già `CE_money.addReputation(delta)` — porta unica con lo
stesso tetto `5.0 + prestige`, con un commento che dice "copiato a mano ~22
volte nel codice". La maggior parte dei chiamanti (`b2b.js`, `daily-orders.js`,
`engine-events.js`, `hq.js`, `quests.js`, `engine-rides.js`, `engine-daily.js`
×7, `vip-clients.js` ×6, `tourism.js`) **già usa questa porta**. Restano
**7 punti** che calcolano il tetto a mano invece di chiamarla:

- `vittorio.js:89`
- `quests.js:99`
- `engine-finance.js:332`
- `engine.js:150`, `engine.js:1248`, `engine.js:1725`, `engine.js:1978`

(più 5 rami `else` morti — mai eseguiti perché `CE_money.addReputation`
esiste sempre — in `quests-data.js:120,138,155,172,190`, bassa priorità).

## Task nuovi da accodare

### Task nuovo per #22 e #25 — "Politica nel banco: solo ui-politics.js, la ricetta di war_room.js"

```
Titolo: Collaudo di «politica», pezzo 1 di 2 (ripetuto): solo ui-politics.js, sulla ricetta già riuscita di war_room.js

Contesto verificato: war_room.js ha GIA' un collaudo che funziona su main
(test/funzioni/politica-warroom.test.js, 23 test verdi) — costruisce un
ambiente locale con createGameEnv([...CORE_FILES, 'war_room.js'], {render:
true, serverState: {...}}) DENTRO al file di test, SENZA toccare
test-support/game-env.js. ui-politics.js caricato con lo stesso trucco
funziona (verificato): niente eccezioni, renderTabPolitics diventa una
funzione chiamabile.

Esiste un tentativo precedente per ui-politics.js
(branch origin/gigi/collaudo-di-politica-pezzo-1-di-2-solo-u-08220232,
test/funzioni/politica-ui.test.js, 837 righe) ma è 118 commit indietro
rispetto a main e scritto contro una versione vecchia di game-env.js:
NON recuperarlo, NON fare merge/cherry-pick da quel branch. Scrivi da capo.

Cosa fare:
1. Crea test/funzioni/politica-ui.test.js NUOVO (stesso schema di
   politica-warroom.test.js: funzione creaAmbientePolitica() che chiama
   createGameEnv([...CORE_FILES, 'ui-politics.js'], {render:true, ...})
   dentro al file di test — NON modificare CORE_FILES in
   test-support/game-env.js).
2. renderTabPolitics() (ui-politics.js:5-108) e _renderDecreesSection()
   (ui-politics.js:110+) sono le uniche funzioni da collaudare qui: rendering,
   struttura DOM, badge "ATTIVA"/disabled sui bottoni, dati mostrati
   (inflazione, tasso, punti lobbying). NON ri-testare la logica economica di
   passLobbyLaw/donateToLobby/decreesRefresh/voteServerDecree: è GIA' coperta
   da test/economy/finance-lobby.test.js, test/economy/finance-resto.test.js,
   test/funzioni/finanza.test.js e test/funzioni/lusso.test.js — rifarlo qui
   sarebbe doppio lavoro, non un test nuovo.
3. Verifica che ceAct('passLobbyLaw', ...), ceAct('ceDonateLobby', ...),
   ceAct('ceVoteDecree', ...) e ceAct('ceThen', ['decreesRefresh',
   'renderTabPolitics']) producano l'attributo data-ce-act corretto nell'HTML
   generato (come fa politica-warroom.test.js con _wrAcquire).
4. Lancia la suite intera (npm test) e verifica che non rompa nulla.
5. SOLO se il punto 4 è verde: in config.js:50 cambia `politica: false` in
   `politica: true`, e in test/guardrail/interruttori.test.js:55 rimuovi
   'politica' dall'elenco SPENTE_ALL_INIZIO (l'elenco può solo accorciarsi:
   se lo tocchi in altro modo il test guardrail fallisce da solo).
6. Riallinea su main prima di consegnare (fetch + rebase o merge), il motivo
   ricorrente di rifiuto nei tentativi precedenti era anche "non si unisce a
   main senza conflitti".

Cosa NON fare: non toccare war_room.js (già fatto), non creare un file
reputation-cap-style scollegato da tutto, non aggiungere ui-politics.js a
CORE_FILES globale (rischia di rompere altri test che non se lo aspettano —
segui l'esempio del pezzo 2, locale al file di test).
```

### Task nuovo per #23 — "Reputazione: finire la migrazione verso CE_money.addReputation, non inventarne un'altra"

```
Titolo: Il tetto della reputazione, la parte vera: 7 chiamate dirette verso CE_money.addReputation

Contesto verificato: esiste GIA' una porta unica corretta,
CE_money.addReputation(delta) in money.js:197-201 (tetto = 5.0 + prestige),
usata correttamente da 10+ file. Un tentativo precedente (merge 8dd9630) ha
creato reputation-cap.js con una funzione CE_reputationCap parallela: verificato
con grep che NESSUN file la chiama, non è in index.html, non è in CORE_FILES —
codice morto. Non ripetere questo errore: non serve una nuova funzione, serve
spostare le chiamate rimaste sulla porta che già esiste.

Cosa fare:
1. Elimina reputation-cap.js e test/reputation-cap.test.js (codice morto,
   verificato non referenziato da nessuna parte).
2. Sostituisci in questi 7 punti il calcolo diretto
   `Math.min(5.0 + (gameState.prestige||0), (gameState.reputation||0) + X)`
   con `CE_money.addReputation(X)` (X può essere negativo):
   - vittorio.js:89
   - quests.js:99
   - engine-finance.js:332
   - engine.js:150, engine.js:1248, engine.js:1725, engine.js:1978
   Attenzione: alcuni di questi assegnano il risultato a gameState.reputation
   con un `if` guardia (es. `if (camp.repBonus) ...`) — mantieni la guardia,
   sostituisci solo il calcolo del nuovo valore con la chiamata.
3. (Facoltativo, priorità bassa) i 5 rami `else` in quests-data.js:120,138,
   155,172,190 sono duplicati morti (mai eseguiti perché CE_money.addReputation
   esiste sempre quando quests-data.js gira) — puoi rimuoverli o lasciarli,
   non bloccano il task.
4. Estendi test/guardrail/una-sola-porta.test.js (o crea un guardrail
   affine, stesso schema) che cerca il pattern letterale
   `5.0 + (gameState.prestige` o `5.0+(gs.prestige` fuori da money.js e fallisce
   se lo trova — è la stessa logica di ECCEZIONI/RIGHE_CONSENTITE già in quel
   file, non reinventarla da zero.
5. Lancia npm test per intero prima di consegnare.

Cosa NON fare: non creare una seconda funzione "canonica" per lo stesso
calcolo. La porta è money.js, non un file nuovo.
```

### Task nuovo per #26 — "Economia sul server: classificare le 111 azioni che il banco non riesce ad attivare"

```
Titolo: Economia sul server, il censimento: classificare le azioni che il banco non attiva

Contesto verificato: test/guardrail/azioni-sincronizzano.test.js esegue GIA' il
censimento automatico — 242 azioni estratte dal sorgente, 129 toccano denaro,
14 verificate ok, 1 nota come ROTTA, 111 "non attivabili dal banco" (richiedono
uno stato di gioco specifico che l'ambiente di test non ricrea — es.
CE_cancelBid, _alCreate, _alDisband...), 22 nomi non risolti a funzioni. Il
test stampa questo elenco ad ogni run ("=== RIEPILOGO GUARDRAIL AZIONI ===").
Non ripartire da zero: usa questo output come punto di partenza, non
un'ipotesi nuova sul numero di azioni.

Nota: esiste un branch scollegato, non mergiato,
origin/gigi/economia-sul-server-1-di-n-le-fondamenta-08221853 (commit
2dddcfa, 103 righe di SQL, "nessuno ha ancora guardato questo codice") — è
un tentativo di IMPLEMENTAZIONE (una RPC server-side), non un censimento, e
non è collegato a questo task. Non duplicarlo; se emergono azioni pericolose
che richiedono una RPC nuova, questo censimento diventa l'input per
valutare se riprendere quel branch (dopo revisione umana) o scriverne uno
pulito.

Cosa fare:
1. Esegui `node --test test/guardrail/azioni-sincronizzano.test.js` e
   raccogli l'elenco completo delle 111 azioni "non attivabili dal banco"
   più le 22 "assenti".
2. Per ognuna delle azioni che toccano denaro (leggi il sorgente della
   funzione, non indovinare): classifica come PERICOLOSA (il client calcola
   o scala un importo di cassa/coin in locale senza che una RPC lo confermi
   — stesso pattern cercato in docs/DOPPIO-CONTEGGIO.md) o INNOCUA (la mutazione
   passa per intero da una RPC server-side, il client si limita a rispecchiare
   la risposta).
3. Scrivi docs/ECONOMIA-SERVER-CENSIMENTO.md con lo stesso formato di
   docs/DOPPIO-CONTEGGIO.md: un titolo per file, una riga per azione con
   riga sorgente, RPC coinvolta (se c'è) e verdetto esplicito
   (PERICOLOSA: motivo / INNOCUA: motivo).
4. Aggiungi un guardrail che verifica che il documento censisca tutte le
   azioni della lista raccolta al punto 1 (stesso schema di
   censimento-doppio-conteggio.test.js: l'elenco può solo restare completo).

Cosa NON fare: questo task è un censimento, non un'implementazione — non
scrivere RPC nuove, non convertire azioni a CE_money qui. Le correzioni sono
task successivi, uno alla volta, come è già stato fatto per il doppio
conteggio.
```
