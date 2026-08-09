# Scalabilità client → server a 10k sessioni concorrenti — audit statico

> Stato: **SOLO AUDIT**. Nessun codice toccato, nessun load-test reale (vietato dai guardrail
> della routine automatica — vedi `docs/AUTOMATION_ROUTINE.md`). Metodo: grep mirato +
> lettura del sorgente, verificato a campione riga per riga (non solo report di subagent).
> Contesto: 6° item del backlog esteso in `docs/AUTOMATION_ROUTINE.md`.

## Cosa genera traffico per sessione attiva

### Timer ricorrenti — `engine.js:900-926` (`startGameLoops`, 22 `setInterval`)
La maggioranza è **puramente locale** (simulazione client-side, nessuna rete): `gameLoop`
(600ms), le 13 generazioni evento/corsa/missione (35s–8min), le 9 "maybe" VIP (90s–240s).
Due eccezioni con traffico verso Supabase:

- **`checkActiveTrips` — ogni 5s** (`engine.js:914` → `engine-rides.js:857`). Per ogni corsa
  completata nel tick chiama **due RPC** (`rpc_pay_majority_dividend`, `rpc_pay_fuel_levy`,
  `engine-rides.js:888-898`) — ma solo se il giocatore è sotto OPA ostile o la corsa parte da
  una provincia con deposito carburante attivo. Nel caso comune (nessuna delle due condizioni)
  il tick è a costo zero di rete. A 10k sessioni concorrenti il tick stesso (loop locale) non
  pesa; le RPC condizionali scalano con quanti giocatori sono *effettivamente* sotto OPA/hanno
  depositi attivi in quel momento, non con la popolazione totale.
- Altri timer con rete, fuori da `startGameLoops`: `auth.js:275` heartbeat 60s
  (`rpc_ping`, 1 chiamata/player/min — il più regolare e prevedibile dei costi RPC),
  `serverState.js:38` `_tripClaimTimer` ogni 5s (RPC solo se ci sono trip pronti da
  reclamare), `p2p-render.js:468/473` polling di backup 60s/5min (già pensato come fallback
  al Realtime, non il canale primario), `weather_real.js:150` e `global_events.js:194` ogni
  10min con **cache guard interno** (5min/2min) che dimezza le chiamate reali.

**Conclusione timer:** nessun bug qui — sono già quasi tutti locali o già guardati da cache/
condizioni. Il costo RPC per sessione è basso e per lo più event-driven, non a tappeto.

### Canali Realtime — il vero rischio di scala
Un giocatore loggato apre **11 subscription** (+1 se apre la chat Alleanza). Sul canale
`ce_game_events` (`serverState.js:105-142`), 4 delle 7 `postgres_changes` sono filtrate
per `user_id`/`company_id` (proprio dato, corretto) — ma **2 sono unfiltered**: `provinces`
(riga 126) e `fuel_market` INSERT (riga 133), broadcast a ogni client connesso.

Il problema più netto sono i **9 canali interamente unfiltered**, ciascuno un
`.channel()` dedicato (non condiviso col canale sopra):
`crypto_market_changes` (`crypto.js:325`), `judicial_auctions_changes` (`auctions.js:349`),
`real_weather_changes` (`weather_real.js:132`), `global_events_changes`
(`global_events.js:127`), `global_news_feed` (`ui-realestate.js:23`), `world_feed_rt`
(`world-feed.js:95`), `public:market_listings`/`company_shares`/`holding_members`/
`consorzio_members` (`p2p-market.js:467/490/502/514`, 4 canali). A 10k sessioni concorrenti
ognuno di questi diventa **10k connessioni Realtime indipendenti che ricevono lo stesso
evento**, invece di una fanout gestita — è il pattern che rischia di più sul piano Supabase
(limite connessioni Realtime concorrenti) quando cresce la popolazione online simultanea,
indipendentemente da quanto sia leggero il payload di ogni evento.

**Bonus non-scala ma reale:** `global_news_feed` (`ui-realestate.js:23`) e `world_feed_rt`
(`world-feed.js:95`) sono **due canali distinti sulla stessa tabella `global_news`** —
doppia subscription per lo stesso INSERT, quindi ogni notizia globale arriva due volte al
client (e raddoppia inutilmente il conteggio canali per sessione, 11 invece di 10).

## Cosa NON è compito di questo audit
Consolidare i canali unfiltered (es. un solo canale broadcast condiviso lato client invece di
9 `.channel()` separati, o passare a polling con cache per i dati meno time-critical tipo
`crypto_market`/`judicial_auctions`) è un **cambio di codice reale**, non un audit — e tocca
un piano Supabase/limiti di connessione che è una decisione infrastrutturale di Vlad, non
qualcosa che la routine decide o applica da sola (stesso principio già applicato al debito
economico #1). Il duplicato `global_news_feed`/`world_feed_rt` è l'unico punto qui che
assomiglia a un bug innocuo (non a una decisione di scala) — candidato per un fix mirato
futuro se Vlad conferma che è ridondanza non voluta e non un residuo intenzionale.

## Riepilogo
- Timer locali: OK, nessun problema di scala.
- RPC su timer: basso costo, per lo più event-driven o cache-guarded.
- Realtime: **9 canali unfiltered + 2 subscription unfiltered su un canale filtrato = 11
  broadcast per sessione**, il fattore che scala peggio a 10k concorrenti. Decisione di
  consolidamento/piano Supabase lasciata a Vlad.
