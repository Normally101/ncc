# Chauffeur Empire — Handoff sessione corrente

> Aggiornato: 17 giugno 2026
> Leggilo sempre all'inizio di una nuova sessione PRIMA di qualsiasi lavoro.

---

## 🚀 STATO ATTUALE (giugno 2026) — leggi questo PER PRIMO

### 🛠️ 21 giugno 2026 — "Risolvi tutto": follow-up sicurezza + refactor CSP (IN CORSO) + onboarding/economia (da fare)
Sessione di lavoro su più fronti. **Working tree con modifiche NON committate, NON deployato.**

**✅ FATTO e verificato (3 follow-up sicurezza minori):**
1. **XSS escape `ui-emails.js`** — 9 sink avvolti in `CE_Sec.escHtml` (subject ×2, body, signature, eventData.desc, choice text, rivalName, driverName, brokerRisk). Bump `ui-emails.js?v=12` in index.html.
2. **SRI + pin CDN** in index.html — `@supabase/supabase-js` pinnato a **2.108.2** (era range `@2`) + `integrity` sha384 + `crossorigin`; `mapbox-gl.js`/`.css` v3.6.0 + SRI (CORS Mapbox = `*`, verificato).
3. **`PUSH_CRON_SECRET`** — settato in prod sulla function `send-push` + cron `ce-send-push` (jobid 2) ora invia header `x-cron-secret`. Verificato: anon SENZA secret → **403**, cron CON secret → **200**. Sequenza no-downtime (cron aggiornato prima del secret). La function già supportava il check (riga 47).

**✅ COMPLETO (21 giu, verificato headless) — CSP: rimosso `script-src 'unsafe-inline'`** (decisione Vlad: "fallo completo"). NON ancora deployato.
Refactor grande: ~486 handler inline (296 onclick nei .js + 124 in index.html + micro/altri) tutti convertiti a event-delegation. Metodo:
- **Infra: `events.js`** (NUOVO, caricato dopo security.js) — event-delegation. Helper `ceAct(fn, args[, evento])` genera `data-ce-act`/`data-ce-args` (JSON); listener delegato su document (click/change/input/submit) chiama `window[fn].apply(elemento, args)`. Micro-interazioni `this.style.transform` rimosse (coperte da CSS `button:active`).
- **Convertitore riusabile: `_mockups/convert-handlers.mjs`** (escluso dal deploy) — converte gli handler "chiamata singola sicura" (anche `window.fn(...)`, anche arg-stringa), gestisce `'${expr}'`, **rifiuta** letture DOM al click-time (`getElementById().value` → vanno a funzione nominata) e ha **self-check** (node --check post-conversione → ripristina il file se rompe la sintassi).
- **Fatto finora:** ~**230 handler convertiti automaticamente** su ~45 file (tutti `node --check` OK). **`ui-emails.js` COMPLETO** (0 handler inline: 3 funzioni nominate `setInboxTab`/`resolveEmail`/`collectBrokerEmail` + 19 SKIP convertiti via `_mockups/fix-emails.mjs`).
- **NUOVI file (da deployare):** `events.js` (delegation + `ceAct()` + helper ceRemove/ceClick/ceThen/ceSetRender/ceSetActive + listener error per `<img>`), `ce-actions.js` (funzioni nominate per DOM-read/codice-multiplo: cePlaceBid, ceCryptoTrade, ceStockAction, ceVtkSell, ceNoop, ceCloseSelf, …), `boot.js` (i 2 vecchi `<script>` inline esternalizzati: onerror banner + DOMContentLoaded + ESC handler; **non-defer** apposta). Caricati in index.html dopo security.js.
- **Convertitori (in `_mockups/`, esclusi dal deploy, riusabili):** `convert-handlers.mjs` (auto, self-check con revert), `fix-skips.mjs`, `fix-factories.mjs` (button-factory `_btn`/`it.fn` → ricevono `ceAct(...)`), `fix-index.mjs` (HTML), `fix-boot.mjs`, `bump-versions.mjs` (+1 a 93 `?v=`). 
- **RISULTATO:** 0 handler inline e 0 `<script>` inline in index.html + tutti i ~45 .js. `?v=` bumpati. **Verifica headless (http.server+chrome-devtools): 0 violazioni CSP, 0 errori JS, 132 elementi `data-ce-act`, delegation testata** (args JSON + `this`). Pattern backdrop: `closest()` "assorbe" il click interno (ceNoop) → rimpiazza stopPropagation; backdrop self-close via `ceCloseSelf`; `<a>`-azione → preventDefault nel dispatcher (rimpiazza `return false`).
- **PRIMA DEL DEPLOY:** consigliata verifica E2E con **login reale** (click sui bottoni dei vari tab) — l'headless senza login copre load+delegation ma non ogni tab. **Fuori scope** (non toccati): `support.html` e `preview-midnight.html` (pagine statiche separate, CSP propria) hanno ancora 1 handler / `<script>` inline; `style-src 'unsafe-inline'` lasciato (gli style inline nel markup sono fuori scope).

**⏳ DA FARE — Onboarding (mappato, non ancora implementato):** i 4 sistemi (`onboarding.js` gate/checklist, `zero-to-hero.js` survival/restricted, `objective-tracker.js`, `vittorio.js`; + `tutorial.js`) derivano TUTTI lo stato da `gameState.questStats.totalRides` + `gameState.prestige`, con **3 patch su `switchTab`** (ui-sidebar→zero-to-hero→em-chrome, ordine fragile) e hook su `updateUI`/`processDailyRoutines`. Piano: macchina a stati unificata (sorgente di verità unica) + tutorial action-gated + demo idle ("hai guadagnato mentre riposavi", aggancio a `_processOfflineCatchup` in engine.js).

**⏳ DA FARE — Economia debito #1 (decisione Vlad: "fai ciò che è meglio"):** scelta = **spec + scaffolding SQL** (ledger + RPC a-delta), SENZA toccare prod né i guadagni live (la scala economica resta indecisa, Decisioni Aperte #6). Non ancora iniziato.



### 🔐 17 giugno 2026 — Audit di sicurezza completo (2 subagent + checklist agentskills)
**✅ Ondata 1 (sicura) FATTA e deployata** (`bda625f`):
- **XSS (P0) chiuso** sui sink multiplayer: nome/descrizione di sindacati/consorzi + `company_name` in classifica avvolti in `CE_Sec.escHtml` (`p2p-render.js`, `ui-ranking.js`). Era un vero stored/DOM XSS (descrizione consorzio con `<img onerror>` → eseguiva nel contesto della vittima).
- **`vercel.json`** con header HTTP (HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP).
- **`slot_*.json`** esclusi dal deploy (`.vercelignore`).
- **Segreti: CLEAN** — nessuna chiave privata nel client (anon key/VAPID public/Mapbox = pubbliche per design; service-role/VAPID-private solo nelle Edge Function via env).

**🔴 DEBITO DI SICUREZZA #1 — economia client-authoritative (NON ancora risolto).**
La cassa è decisa dal client e il server la rispecchia → un giocatore tecnico può darsi soldi infiniti per **3 vie**: (1) upsert diretto del blob `game_saves` con `cash` arbitrario (`saveSystem.js:131`, letto come verità dal P2P); (2) `rpc_sync_cash(v_cash)` che SETtа `companies.cash` al valore client (`10_sync_cash.sql:20`); (3) `rpc_add_driver_coins` coniava valuta premium senza validazione — **✅ ARGINE APPLICATO (Ondata 1.5): tetto 1.000.000/chiamata su entrambi gli overload (`41_cap_driver_coins.sql`, applicata al DB prod, verificata)**; blocca il minting palese (MAX_INT) a falso-positivo zero, MA un loop sotto-soglia lo aggira → cap giornaliero/IAP resta nel progetto (B). I trigger anti-cheat su cash (`38_security_hardening.sql`) **loggano ma NON bloccano** (`RETURN NEW`) — non li tocco (vedi decisione sotto: i salti cassa legittimi sono indistinguibili).
- **DECISIONE PRESA (giu 2026):** NON applicare blocchi/ceiling al volo in prod → i guadagni legittimi (offline, contratti, late-game a magnitudine assurda) sono salti grossi indistinguibili dai cheat, e la scala economica legittima non è decisa (`Decisioni Aperte #6`). Un blocco mal tarato bloccherebbe giocatori veri.
- **FIX VERO = progetto "economia server-authoritative"** (da fare insieme alla scelta della scala economica): ledger unico, ogni guadagno via RPC validato a **delta** (non set assoluto), niente scrittura cassa dal client, `liquid_assets` derivato lato server, trigger `BEFORE` che `RAISE EXCEPTION`. Vedi vault *Anti-Cheat Economico* + *Bilanciamento Economico (spec)*.

**🔒 REQUISITO FUTURO — pagamenti reali (Stripe) [richiesta esplicita di Vlad]:** quando lo store passa a soldi veri, la sicurezza dei coin diventa CRITICA (oggi è "simulato"/gratis). **Pattern OBBLIGATORIO — il client NON accredita MAI valuta:** client apre Stripe Checkout/Payment Intent → Stripe incassa → **webhook firmato** a una Edge Function Supabase → la function (1) **verifica la firma** col signing secret, (2) è **idempotente** (event_id già processato? → tabella `processed_stripe_events`), (3) mappa **`price_id` → quantità coin LATO SERVER** (mai l'`amount` dal client), (4) accredita `companies.driver_coins` con **service-role** + logga su `coin_transactions` con lo `stripe_payment_id`. Poi **REVOCARE `rpc_add_driver_coins` da `authenticated`** (solo webhook/service-role concede coin). Gestire **refund/chargeback** (`charge.refunded` → storna/flag). Stripe secret + signing secret SOLO in env Edge Function (come VAPID/service-role oggi). **Il tetto 1M attuale (`41_*`) è uno stopgap del modello simulato → da rimuovere/sostituire con questo quando arriva Stripe.**

**Follow-up minori (sicuri, non urgenti):** XSS escape anche in `ui-emails.js` (contenuto generato dal gioco, rischio basso); SRI + versioni pinnate sui CDN (`@supabase/supabase-js@2`, Mapbox) in `index.html`; richiedere `PUSH_CRON_SECRET` nella Edge Function `send-push`; togliere `script-src 'unsafe-inline'` dalla CSP (refactor: 296 onclick inline → event delegation). Repo skill di sicurezza clonato in `~/sec-skills` (754 skill = checklist di copertura).

### ✅ 17 giugno 2026 (cont.) — Grafica z-index + Tracker Obiettivi + DEPLOY
- **DEPLOYATO** su Vercel (P0 economia/onboarding + grafica + tracker). Site 200; `40_*.sql` → 404 (no leak). Client e DB ora allineati (€0).
- **Grafica — scala z-index** coerente in `:root` (alert/backdrop/modal/cmdpalette/spotlight/takeover/toast); overlay CSS+JS migrati ai token → fine collisioni (toast sopra i modali, tutorial sotto takeover/toast, via i `99999`). Verificato in Chrome (0 errori, toast>modal).
- **Tutorial/Missioni — backbone pezzo 1: Tracker Obiettivi** (`objective-tracker.js`): barra diegetica fissa che mostra UN prossimo passo, click→naviga; additiva (legge z2h/quests/gates), nascosta in survival/per veterani. Risolve "quest invisibili" + "lasciato solo dopo SVEGLIATI". Verificato 5 scenari in Chrome.
- Audit grafica: 1 fix reale (z-index); **empty-states e overflow sovrastimati** (finance ha già il vuoto, store sono cataloghi statici; layout già responsive con più breakpoint + auto-fit) → nessuna modifica speculativa.
- **Tutorial/Missioni — backbone pezzo 4: Vittorio** (`vittorio.js`): il debito è ora meccanica reale (€500, +3%/giorno, SMS, bivio Ripaga/Più tardi/Ribalta→socio se prestige≥1); agganciato al Tracker ("Ripaga Vittorio €X") e alla schermata survival (debito vero). Verificato in Chrome (init/repay/flip/veteran/tracker/survival, 0 errori).
- **Backbone tutorial — fatto:** pezzo 1 Tracker + pezzo 4 Vittorio. **Da fare:** (2) unificare i 3 sistemi onboarding in una macchina a stati; (3) tutorial action-gated; (5) demo idle "hai guadagnato mentre riposavi".
- **🧠 Cervello Obsidian — grafo riorganizzato:** `.obsidian/graph.json` con gruppi-colore per area + filtri (nasconde canvas/base/Templates) + forze più larghe. Vault: 99 note, 0 orfane/ghost.

### ✅ 17 giugno 2026 — Fix P0 economia/onboarding (server-authoritative)
Audit del codice → 5 bug P0/P1 affrontati. Decisioni prese con Vlad: **cassa server-authoritative** · **start €0 + il Ragazzo eredita l'auto del CEO**.
- **Cassa = server-authoritative (mirror).** Ogni guadagno locale fa ora mirror via `rpc_sync_cash`: aggiunto in `zero-to-hero.js` (executeManualDrive) e `quests.js` (reward cash) — prima mutavano `gs.cash` senza avvisare il server → al bridge venivano azzerati (causa soft-lock onboarding + desync 599 vs 35150). *(Hardening futuro: sostituire il mirror con RPC a delta server-side per anti-cheat puro.)*
- **Cassa iniziale €0** riconciliata su 3 fonti: `engine.js` default + `saveSystem.js` reset + **`rpc_init_company`** (SQL `40_init_company_zero_cash.sql`, **GIÀ APPLICATA al DB prod**; ON CONFLICT non tocca le aziende esistenti). 10 guidate ×15€ = 150€, coerente col modal.
- **Anti-soft-lock:** `engine.js` fresh crea una berlina starter tier `standard` ("riscattata dal pignoramento"); `hireNeighborhoodKid` la assegna al Ragazzo → l'auto-dispatch (gameLoop) lo manda in strada da solo: idle funzionante a €0, senza comprare auto.
- **Doppio offline-catchup rimosso** (`engine.js`: `_processOfflineCatchup` era chiamato OLTRE al loop in `initGame` → redditi/spese contati 2×).
- Falso positivo audit: `assignRideToDriver` è già protetto dallo splice sincrono → non toccato.
- `node --check` OK su tutti i file. Cache-bust: engine v19, quests v11, saveSystem v10, zero-to-hero v2.
- **✅ Deployato (17 giu):** client + SQL allineati in prod (vedi entry "(cont.)" sopra). Risolto il disallineamento temporaneo SQL-live / client-vecchio.

### ✅ TEST LIVE END-TO-END (16 giugno 2026, via Chrome automation su chauffeurempire.com)
Testato sul sito vero con un account loggato (djbladestudio@gmail.com):
- **Zero-to-Hero**: survival render OK · 10 guidate manuali (+15€/-10 energia, esatti) · sleep ripristina energia · evento "SVEGLIATI, SCHIAVO" al 10° · click → Staff, tema rimosso · sidebar ridotta a **solo corse+staff** · "Ragazzo di Quartiere" assunto gratis (stat 35/30/38). **Tutto funziona.**
- **Push VAPID**: subscribe reale (endpoint FCM) → riga in `push_subscriptions` → `send-push` `{sent:1}` → **notifica ricevuta e mostrata dal SW** ("🚗 Il tuo impero ti aspetta", personalizzata con cassa). **Tutto funziona.**

**🐛 BUG TROVATO E FIXATO (solo grazie al test live): CSP bloccava il service worker.**
`worker-src` era `blob:` (solo Mapbox) → `register('sw.js')` falliva con "violates Content Security Policy" → **il push non avrebbe MAI funzionato**. Fix in `index.html`: `worker-src 'self' blob:`. Committato e deployato.

**✅ DECISIONE PRESA (17 giu 2026) — cassa iniziale:** €0 + il Ragazzo eredita l'auto del CEO (berlina starter tier `standard`). Riconciliata client+server (vedi entry "17 giugno" sopra). Il sync client-server (599 vs 35150) è risolto col modello **server-authoritative + mirror `syncCash`** su ogni guadagno locale.


### 🔔 SERVER PUSH VAPID (15 giugno 2026) — CODICE PRONTO, da deployare

Sostituito il push "finto" (solo Notification API locale + setTimeout, moriva a browser chiuso) con **Web Push VAPID reale** che funziona anche a browser chiuso. Server = Edge Function Supabase schedulata con cron.

**File toccati/nuovi (committabili):**
- `39_push_subscriptions.sql` (NUOVO, idempotente) — tabella `push_subscriptions` (endpoint/p256dh/auth/last_seen/last_notified_at) + RLS per-utente + `rpc_due_push_subscriptions(idle_h, cooldown_h, max_idle_d)` SECURITY DEFINER (solo service_role) che ritorna gli inattivi da notificare (join `companies` per nome+cassa).
- `supabase/functions/send-push/index.ts` (NUOVO) — Deno + `npm:web-push@3.6.7`. Legge i target via RPC, invia push firmate VAPID, setta `last_notified_at`, cancella endpoint 404/410. Auth opzionale via header `x-cron-secret`.
- `push-notifications.js` v2 — riscritto: ① server push (subscribe + upsert subscription su Supabase + heartbeat `last_seen` su login/ritorno tab); ② fallback locale se il server push non è disponibile (permesso negato / no VAPID / iOS non installato / subscribe fallito). SW registrato con path **relativo** (`sw.js`) → ok sia root che /ncc/.
- `config.js` v7 — aggiunta `VAPID_PUBLIC_KEY` (pubblica, ok nel repo).
- `sw.js` — `notificationclick` ora apre `notification.data.url`.
- `index.html` — bump `config.js?v=7`, `push-notifications.js?v=2`.

**Chiave VAPID pubblica (già in config.js):** `BE9VSQn6J3eKQxtTKFzoBKzGp9Bkmy8aBHkRQdQkYGmSUgdjyv62SIKsnhjs0-ZN7feMw9ed98miJdIF38QZs5c`
La **privata NON è nel repo** — generata in locale, va messa SOLO come segreto Supabase (vedi checklist). Se l'hai persa, rigenerala: serve nuova coppia (cambia anche la pubblica in config.js).

**✅ DEPLOYATO (15 giu 2026, da Claude via Supabase access token temporaneo, poi da revocare):**
1. ✅ **SQL** `39_push_subscriptions.sql` girato via Management API → `push_subscriptions` + RLS + RPC creati e verificati.
2. ✅ **Segreti** `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` settati (`supabase secrets set`, count 3). `PUSH_CRON_SECRET` NON settato (cron usa solo anon JWT).
3. ✅ **Function** `send-push` deployata (`supabase functions deploy`, project `twstjbykstaioaahfqbe`).
4. ✅ **Cron** `ce-send-push` (`0 * * * *`, active) via `pg_cron`+`pg_net`, header `Authorization: Bearer <anon>` (anon è pubblica → nessun segreto nel DB).
5. ✅ **Smoke test**: `POST /send-push` → `{"ok":true,"candidates":0,"sent":0,"expired":0}` (web-push gira nel runtime Deno, RPC+segreti OK).
   - **Resta solo il test umano:** in gioco accettare le notifiche → verificare una riga in `push_subscriptions`, poi (per vedere la notifica) mettere a mano `last_seen` a >22h fa e invocare la function.
   - 🔑 **Vlad: REVOCA l'access token `sbp_…`** usato per il deploy (Dashboard → Account → Access Tokens).

**Note tecniche:**
- "Inattivo" = `last_seen < now()-22h`, non rinotificato entro 20h, non più vecchio di 7g. Heartbeat aggiorna `last_seen` su login e a ogni ritorno alla tab.
- iOS/Safari: il web push funziona SOLO se la PWA è "Aggiungi a Home" (installata). Altrove fallback locale.
- Se `npm:web-push` desse problemi nel runtime Edge, alternativa = implementazione pura Web Crypto (aes128gcm + VAPID JWT) — non fatta perché web-push è lo standard documentato per Supabase.

### 🎮 ZERO-TO-HERO — Modalità Sopravvivenza iniziale (15 giugno 2026)

Implementata la spec `zero_to_hero_design.md` (di Gemini/antigravity). Onboarding narrativo "povero→ricco":
- **< 10 corse → SURVIVAL** ("Il fondo del barile"): la tab Corse è sostituita dalla **guida manuale** (bottone pulse-gold: −10% energia, +15€). Nessun chrome (nav/topbar/ticker/kpibar nascosti via `body.theme-survival`). Bottone "Dormi in auto" quando energia <10.
- **== 10 corse → evento "SVEGLIATI, SCHIAVO"**: overlay full-screen (copy esatta della spec) → "diventa manager" → sblocca Staff.
- **10–24 corse → nav ridotta**: visibili SOLO "Corse" e "Staff" (sidebar items `display:none` sugli altri).
- **< 25 corse → Staff in fase transitoria**: unico assumibile = **"Ragazzo di Quartiere"** (ingaggio €0, salario €40, stat mediocri). HR Automation + Accademia nascoste.
- **Veterani (prestige > 0 / NG+) → ESENTI** da tutto (scelta mia: non intrappolare chi ha già un impero — coerente con la filosofia di `onboarding.js`).

**File:** `zero-to-hero.js` (NUOVO, tutta la logica) · `ui-dispatch.js` v11 (gate in cima a `renderTabCorse`) · `ui-staff.js` v15 (recruit ridotto + HR/Accademia gated) · `style.css` (tema survival in coda) · `index.html` (script + bump).

**Globals nuove:** `_z2hState()` ('survival'|'restricted'|'free'), `_z2hRestricted()`, `_z2hApplyNav()`, `renderManualSurvivalMode()`, `executeManualDrive()`, `executeSleepInCar()`, `triggerCapitalismEvent()`, `_ceCapitalismAck()`, `hireNeighborhoodKid()`. `switchTab` ri-patchato (in survival ogni destinazione → 'corse').

**Verifica:** `node --check` su tutti i .js OK + harness logico node (10 drive→150€, evento, ack→staff, kid hire no-dup, soglie 25/veterano) → tutti i test passati.

**⚠️ DEVIAZIONI consapevoli dalla spec (e perché):**
1. **`executeSleepInCar` NON avanza `gameState.hour += 8`** → l'orologio è sincronizzato col tempo reale italiano nel `gameLoop` (sovrascriverebbe il +8h al tick dopo). Effetto reale = ripristino energia. Bottone "Dormi in auto (Recupera Energia)" (testo dalla sezione "Testi Esatti", non "(8 ore)" dello pseudo-codice).
2. **"Ragazzo di Quartiere" usa `hireNeighborhoodKid()` dedicata, non `hireDriver()`** → `hireDriver` deduce `salary×2` d'anticipo, incompatibile con l'ingaggio €0 richiesto.
3. **Aggiunte CSS oltre la spec** (hide `#top-bar`/`#news-ticker-wrap`, azzero offset `#main-panel`) per un vero full-screen; le classi della spec sono riprodotte verbatim.
4. **"uffici/bonus" (sez. 5) interpretati come HR Automation + Accademia** (gated). Lasciati visibili Ufficio Centralizzato + "CEO della Settimana" per non rischiare sbilanciamenti di layout — dimmi se vuoi nascondere anche quelli.

**✅ CASSA INIZIALE RISOLTA:** una partita NUOVA ora parte da **€0** (`initGame` ramo `if (fresh)` in engine.js v18) → 10 guidate manuali = €150, coerente col modal "Hai 150€ in tasca ora". I salvataggi esistenti NON sono toccati (caricano la loro cassa). Il default literal di `gameState` resta 35000 (usato solo come fallback prima di initGame). ⚠️ Da testare: se un confine di giorno reale scatta durante la fase survival, `processDailyRoutines` può dedurre il leasing del loaner (€40/g) → cassa negativa breve; innocuo ma da verificare a schermo.

### Cosa è successo nelle ultime sessioni
1. **FASE 3 COMPLETATA**: tutte le ~29 tab convertite da dark → **eRepublik-Modern light** (kit `.em`). Dettaglio più sotto nella sezione storica. Restano scure SOLO le overlay-flair volute (cmd-palette ⌘K, showBigEvent, tutorial, war-map log).
2. **PROGRAMMA RETENTION/SOCIAL/MONETIZZAZIONE/ANTI-CHEAT** — tutto **LIVE** (committato + deployato su `gh-pages`, verificato a schermo):

| Feature | File | Cosa fa |
|---|---|---|
| **Mondo NCC** (feed vivo) | `world-feed.js` | Feed globale sulla home: eventi REALI cross-player da `global_news` (+realtime) **fusi** con eventi NPC simulati (rivali che conquistano/comprano/OPA/scalano classifica). Presenza "● N online" (curva oraria + `_worldRealOnline` reale da ui-ranking). Esporta `renderWorldFeedHTML()`, `renderConflictHTML()` (striscia conflitto del giorno: OPA/poaching/espansione), `_worldOnline()`. |
| **Ordini del Giorno** | `daily-orders.js` | 3 task daily deterministici (reset per game-day), progresso su `questStats`/`todayEarnings`, ricompensa DC/cash/rep da ritirare. `renderDailyOrdersHTML()`, `claimDailyOrder(id)`. |
| **Energia monetizzabile** | `index.html` (`.emc-eplus`) + `engine-store.js` | "+" verde sul chip energia → `energyBoostDC()` refill istantaneo (4 DC); guard se già 100%; se senza DC → switchTab('store'). |
| **Onboarding + soft-lock** | `onboarding.js` | Tab avanzate restano in nav ma se non sbloccate `switchTab` mostra schermata "Sezione bloccata" (recuperabile, gate PRIMA dell'auto-open mappa province). Gate OR (corse>=X **o** prestige>=Y); `prestige>=1` sblocca tutto (veterani/NG+ mai bloccati). Checklist "Primi Passi" in home per i nuovi. `_tabUnlock(tab)`, `renderTabLockHTML(tab)`, `renderOnboardingHTML()`. |
| **Consorzi (alleanze)** | `alliances.js` | Tab `consorzi`: crea/sfoglia/entra · roster con ruoli (leader/officer/member) + espelli/promuovi · **tesoro condiviso + donazioni** · **chat realtime**. Su RPC Supabase. Crea/join fanno broadcast in `global_news` → compaiono nel feed Mondo NCC. |
| **Vetrina Prestigio** (vanity) | `vanity.js` | Tab `prestigio`: cosmetici in DC (stemma/colore/titolo) — puro status. Lo **stemma è prepended in `_broadcastNews`** → visibile agli altri nel feed. Applicato anche al brand topbar. |
| **Classifica anti-cheat** | `ui-ranking.js` | Rank per **Punteggio Potere** (province×100 + contributi consorzio/10k + flotta×3 + rep×20) = metriche SERVER → il cash falsificato non scala. Dedup per user_id + disambiguazione omonimi `#id`. Setta `window._worldRealOnline`. |

### ⚠️ SQL SUPABASE — stato (il frontend è già live, serve il backend)
L'utente ha **già eseguito**: (1) schema Consorzi (4 tabelle+RPC+RLS+realtime), (2) hardening (chat anti-flood + donazioni asset-bound), (3) anomaly logging (`cheat_flags`+trigger su `leaderboard`).

#### 🟡 DA ESEGUIRE: `36_alliance_perks.sql` — Bottega del Consorzio (PRONTO, scritto questa sessione)
- **File:** `36_alliance_perks.sql` (nella root). Idempotente. **L'utente deve girarlo su Supabase SQL editor.**
- **Cosa fa:** `ALTER TABLE alliances ADD perk_type/perk_until` + `rpc_activate_alliance_perk(p_perk)`.
- **Anti-cheat:** la RPC prende SOLO `p_perk`; **costo e durata sono decisi dal server** (catalog `case` in SQL) → un client non può attivare un perk a costo 1 o durata infinita. Verifica `role='leader'`, `FOR UPDATE` sul tesoro (no race su doppia spesa).
- **Catalogo perk (SQL ↔ `PERKS` in alliances.js devono restare allineati):**
  - `boost_income` — +12% guadagni corse · 48h · €50k
  - `fuel_save` — −15% prezzo carburante · 48h · €35k
  - `mega_income` — +25% guadagni corse · 24h · €120k

#### ✅ Frontend Bottega — FATTO (questa sessione), live appena l'SQL è girato
- **`alliances.js` v=2:** card "Bottega del Consorzio" nella vista membro (sotto il Tesoro). Il leader vede i bottoni di spesa (disabilitati se tesoro basso o non-leader); tutti i membri vedono il **perk attivo + countdown** ("scade tra Xg Yh").
- **Buff client-side:** `window._allyPerkMult(kind)` legge `window._allyActivePerk` (cache di `alliances.perk_type/perk_until`). Aggiornata da `window._allyRefreshPerk()` su render tab + in background (`setTimeout 5s` + `setInterval 3min`) → il buff si applica **anche fuori dalla tab Consorzi**.
- **Hook nel motore:**
  - `engine-rides.js` v=7: `_allyEarn = _allyPerkMult('earnings')` innestato nella catena `earned`.
  - `engine-fleet.js` v=7: `_allyFuelDiscount = _allyPerkMult('fuel')` innestato in `fuelDiscount` (acquisto deposito carburante).
- **Degradazione graziosa:** finché l'SQL non è girato, `al.perk_type` è `undefined` → banner "Nessun perk attivo", nessun crash; cliccare un bottone notifica errore RPC (innocuo).
- **NON ancora committato/deployato** — aspetto conferma che l'SQL sia stato girato, poi commit + push `main` e `main:gh-pages`.

### Bug fix recenti (fatti)
- **Sfondo nero in quasi tutte le tab** → causa: `#main-panel{background:#0a0c12 !important}` (style.css ~3850) copriva il cielo. Fix: `.em-shell #main-panel{background:transparent !important}`. Ora il contenuto galleggia sul cielo, i lati mostrano lo **skyline di Milano all'alba** (SVG stratificato self-hosted in `#app-body.em-shell`, e `.em-home` reso `background:transparent` per non raddoppiare).
- **Nome azienda "Chauffeur Empire" ovunque** → la topbar `.emc-bn` era hardcoded; `updateUI` ora scrive `gameState.companyName` + stemma in `.emc-bn/.emc-bm`. NB: se in-game mostra ancora il default, il nome reale non è salvato in quello slot.
- **3 righe identiche in classifica** = vecchi account di test nella tabella `leaderboard`. Fix display (dedup+`#id`); pulizia vera = `delete from leaderboard where user_id <> 'TUO_ID'` su Supabase.

### 🔒 PRIVACY + OPSEC + FONTS (11 giugno 2026)
- **Privacy policy GDPR** (`privacy.html` v1.1): titolare = **Olga Vision** (scelta utente — marchio pre-costituzione, persona fisica resta titolare reale finché non apre P.IVA; nota interna in HTML per aggiornare con ragione sociale+P.IVA al momento della costituzione). Aggiunti sub-processor reali (Mapbox, Google Fonts→poi self-hosted, GitHub Pages, jsDelivr), push notification, breach art. 33 (Garante 72h) + 34 (utente). Contatto: support@chauffeurempire.com (VERIFICARE che la casella riceva davvero).
- **Monetizzazione/fiscale**: confermato che il gioco NON ha pagamenti reali cablati (no Stripe/PayPal, no dominio pagamento in CSP). Path deciso: **lancio gratuito ora** (solo GDPR, utente come privato) → P.IVA + IVA/OSS quando si accendono i pagamenti reali (apertura Olga Vision, con commercialista). La "ritenuta d'acconto fino a 4800" NON calza con vendita digitale B2C continuativa.
- **Self-host Google Fonts**: scaricati 33 woff2 (Cinzel/Orbitron/Roboto Mono/Inter/Montserrat, latin+latin-ext) in `assets/fonts/`, generato `fonts.css`, rimosso il `<link>` Google + i preconnect, **tolto Google da CSP** (`style-src` e `font-src` ora senza fonts.googleapis/gstatic). Zero leak IP verso Google.
- **Opsec/account** (lato utente, NON automatizzabile): 2FA assente su tutti gli account, password DB attuale debole e riusata → punch-list in `SECURITY_PRELAUNCH.md`. Rimossa la password DB in chiaro da `~/.claude.json` (tolto MCP postgres rotto).
- **Nuovi artefatti**: `backup_supabase.sh` (backup DB via env var + pooler), `SECURITY_PRELAUNCH.md` (punch-list), `fonts.css` + `assets/fonts/`. Rimosso `preview-midnight.html` dal repo (orfano). Checklist generale di sicurezza in memoria globale (`security_checklist.md`).

### 🔒 SECURITY HARDENING (10 giugno 2026, sessione 2)

Audit completo su 50 punti + **test live dall'esterno con la anon key**. Esito e fix:

**RISULTATO CHIAVE — RLS è SANA (allarme critico iniziale smentito dai test reali):**
- Tutte le INSERT anonime → bloccate (`42501 violates row-level security`) su game_saves, leaderboard, provinces, cheat_flags, alliance_members, real_estate_listings, global_news.
- UPDATE anonima su leaderboard → tocca **0 righe** (policy filtra per `auth.uid()`).
- `game_saves`/`profiles` → **0 righe leggibili** dagli anonimi.
- Trigger `validate_*` cappano già liquid_assets/cash > 500M (verificato: insert da 999M respinto).
- Unica esposizione in lettura: `leaderboard` mostra gli `user_id` (UUID auth) → accettabile per classifica pubblica, scritture protette.

**FIX APPLICATI nel codice (tutti committabili subito):**
1. **#12/#35 — Leak di errori DB azzerato.** Nuovo `CE_Sec.userError(prefix, err, opts)` in `security.js`: mostra messaggi generici, logga il dettaglio solo in console; i RAISE di gioco (P0001) restano visibili. Sostituiti `error.message` in 13 file: vtk-market, infrastructure, hostile_takeover, b2b, tourism, p2p-market (`_p2pErrMsg`), crypto (`_cErr`), black_ops (`_sErr`), ui-realestate, dispatcher, war_room, ui-lifestyle, nemesis, ui-ops.
2. **#35 — `client_error_log` redatto.** `security.js` ora applica `_redact()` (JWT/email/UUID/token→placeholder) prima di loggare.
3. **#29 — `_mockups/` rimosso dal repo.** `git rm --cached` + `.gitignore` (4.5M, 22 file, anteprime reali dell'app non più servite pubblicamente). File ancora in locale.
4. **#46 — Security headers** in index.html: `<meta name="referrer" strict-origin-when-cross-origin>` + CSP estesa (`frame-ancestors 'none'`, `form-action 'self'`, `upgrade-insecure-requests`).
5. **#14 — Mapbox token RISOLTO (non più pending).** Il vecchio token era il **Default Public Token**, che Mapbox **non permette di restringere** ("Default tokens cannot be updated" — ecco perché il dashboard sembrava bloccato). Via API (sk. temporaneo, poi revocato) ho **creato un token nuovo dedicato `chauffeur-empire-web`** con `allowedUrls` = normally101.github.io / chauffeurempire.com / www. / localhost, scope read-only. `map.js` v9 ora usa il nuovo token. **Verificato dal vivo:** i tile/render danno **403 ai domini non autorizzati**, 200 ai domini reali → niente furto di quota. Endpoint di metadata (style JSON, fonts) restano 200 anche da fuori ma sono innocui senza i tile.
   - **Residuo minore:** il vecchio Default token resta non-ristretto e presente nella git history (read-only). Opzionale: ruotarlo dal dashboard Mapbox se vuoi invalidarlo del tutto. Basso rischio (non più usato dal gioco dopo il deploy di map.js v9).

**⚠️ SQL DA GIRARE — `38_security_hardening.sql` (NUOVO, idempotente):**
- `client_error_log` (mancava → il logger client falliva in 404) con RLS insert-own, zero SELECT via API.
- `security_audit_log` + trigger anti-anomalia su leaderboard (+20M/update) e game_saves (+50M cash/save) → audit trail (#42).
- `_ce_rate_limit(action,max,window)` + `rate_limit_buckets` → rate-limit server-side riutilizzabile (#28).
- Sezione 4 **COMPLETA** (non più template): hardening `rpc_award_mission_vtk`. Scoperto lo schema reale in `21_vtk_token.sql` (companies.vtk_balance/vtk_earned_today/vtk_today_reset, **cap server 500/giorno già esistente** → l'exploit "client manda 999999" era già limitato a 500/g dal server con `LEAST(amount, cap-earned)`). Due fix veri: (a) **mismatch di firma** — la funzione era `(v_mission_id, v_vtk_amount)` ma il frontend chiamava col solo `v_vtk_amount` → il sync FALLIVA in silenzio (ecco il "client is source of truth"); ora `v_mission_id` è opzionale e il sync funziona; (b) aggiunti rate-limit (30/min) + audit su importi fuori range. `quests.js` v10 ora passa `v_mission_id` e riconcilia il saldo locale con l'`awarded` autoritativo del server (cap-aware).

**Non rimossi (verificato, basso rischio):** `slot_*.json` tracciati → contengono solo game state (nessun user_id/email/token reale), tenuti per sync cross-device intenzionale.

**Bonus — bug critico trovato e fixato:** `contracts.js:380` aveva un replacement rovinato della sessione em-kit (`['',' + "'em-pill--gray'..." + ']`) → **SyntaxError** che faceva crashare l'INTERA tab Contratti. Riparato (`['','em-pill--gray',...]`). `node --check` ora passa su TUTTI i .js del progetto. Bumpato a v14.

**Versioni bumpate:** security v7, vtk-market v12, infrastructure v13, hostile_takeover v13, b2b v13, tourism v13, p2p-market v7, crypto v13, black_ops v13, ui-realestate v13, dispatcher v12, war_room v12, ui-lifestyle v12, nemesis v14, ui-ops v12, map v8, contracts v14, quests v10.

### ✅ FATTO IN QUESTA SESSIONE (10 giugno 2026)

1. **Fase 3 em-kit COMPLETATA** — migrazione completa di tutte le tab "solo-remap" al kit `.em` pieno:
   - `crypto.js` v=12 — KPI, market coin cards, offshore jurisdiction cards, trade modal dark (overlay)
   - `auctions.js` v=12 — tier badges `.em-pill`, KPIs, won banner, auction cards, bid history, bid/won modal dark
   - `hq.js` v=13 — city selector, room cards, upgrade buttons, active effects
   - `contracts.js` v=13 — 5-col kpibar, tender cards, contract cards, history table
   - `ui-politics.js` v=13, `ui-help.js` v=13, `black_ops.js` v=12, `infrastructure.js` v=12, `nemesis.js` v=13, `hostile_takeover.js` v=12 — tutti al kit pieno

2. **Streak UI visibile** — `ui-home.js` v=16: card `🔥 Streak N Giorni` con 7 dot progress (ciclo settimanale), prossimo premio, badge "Torna oggi!" o "tra Xh". Inserita tra la striscia conflitto e il grid principale.

3. **gameLoop dirty-check** — `engine.js` v=17: `updateUI()` in gameLoop ora saltato se il fingerprint `cash|energy|rep|hour|minute|weather|driverCoins|vtk|claimableQuests|pendingRides|outOfService` non è cambiato → elimina ~90% dei DOM write ogni 600ms.

### ✅ TUTTI I TODO PRINCIPALI COMPLETATI (5 giugno 2026)

1. ✅ **Bottega del Consorzio** — `alliances.js` v=2 + `36_alliance_perks.sql` (girato)
2. ✅ **Sfondo reale Milano** — `bg_milano.jpg` (vista aerea, luce dorata alba) come background. Gradient overlay cielo 5-livelli sopra. SVG rettangoli rimossi.
3. ✅ **Anti-cheat market/aste** — `37_market_anticheat.sql` (DA GIRARE su Supabase): `cheat_flags` table + `_flag_cheat` helper + `rpc_list_car_for_sale` v2 (€1k–€50M, max 5 listing) + `rpc_place_auction_bid` v2 (rate-limit 10s, cap €100M, spike flag).
4. ✅ **Mobile-first** — CSS responsive em-chrome: ≤900px nav scroll, ≤600px icons-only, ≤768px bg-attachment:scroll (iOS fix).
5. ✅ **PWA + push notifications** — `sw.js` (cache-first shell, push server, notificationclick) + `push-notifications.js` (permesso 90s post-login, notifica ritorno +22h, cancella al ritorno) + `manifest.json` (icone reali, theme#2f74c0, landscape) + `auth.js` v=7 (hook `_onAuthSuccessHooks`).

### ⚠️ SQL DA GIRARE SU SUPABASE
- **`37_market_anticheat.sql`** — anti-cheat market/aste. Idempotente.

### Prossimi step (post-lancio)
- Espansione lane: taxi/truck/water-taxi (`vehicleClass` su fleet + `requiredClass` su pendingRides)
- Server push VAPID reale (ora usa solo browser Notifications API locale)
- HQ multi-città (già strutturato in `hq.js`, serve UI per acquisto sede secondaria)

### Versioni script (giugno 2026)
Nuovi file: `world-feed.js` v2 · `daily-orders.js` v1 · `onboarding.js` v1 · `alliances.js` v1 · `vanity.js` v1.
Bumpati: `ui-home.js` v15 · `ui-ranking.js` v12 · `engine.js` v12 · `dispatcher.js` v11 · `engine-store.js` v10. `style.css`/`premium-ui.css` senza `?v=` (hard-refresh per vederli).

### Deploy (IMPORTANTE — CORRETTO il 15/06/26)
⚠️ I doc vecchi dicevano "GitHub Pages" ma è **SBAGLIATO**. Il sito pubblico **chauffeurempire.com è su VERCEL**. GitHub Pages è **disattivo** sul repo `ncc` (`/pages` API → 404); il branch `gh-pages` è **morto/inutilizzato** (ignoralo).

- **Come si deploya:** Vercel fa **auto-deploy** del repo `ncc`. **Push su `main` → deploy di Produzione** automatico (progetto Vercel `ncc`, account djblade594). Niente comandi manuali, niente `git push main:gh-pages`.
- **Sicurezza (leak chiuso 15/06):** `.vercelignore` esclude dal deploy pubblico `*.sql *.md *.py *.sh supabase/ docs/ .github/ .agents/ .claude/ _mockups/`. Restano nel repo privato (backup) ma danno **404** sul sito. **NON rimuovere `.vercelignore`** o si riapre il leak.
- **Verifica:** `curl -I https://www.chauffeurempire.com/38_security_hardening.sql` deve dare **404**; `…/index.html` deve dare **200**.

---

## 🎯 DIREZIONE ATTIVA: Redesign "eRepublik-Modern" (target bloccato dall'utente)

**CAMBIO DI ROTTA IMPORTANTE.** Il gioco abbandona lo stile *eRepublik flat DARK* e passa a uno stile **eRepublik-Modern**: tema **chiaro**, denso, con chrome a barra-risorse + nav orizzontale + **sfondo cielo/skyline ai lati**, esecuzione moderna e pulita (no glossy 2012). NON applicare più il dark-flat ai nuovi lavori.

- **Target visivo bloccato** = mockup **E4** in `_mockups/E4_erepublik_dense.html` (+ tappe E/E2/E3). Aprire quelli per vedere com'è.
- **Kit nuovo** = classi `.em*` in fondo a `style.css`, **isolate sotto `.em`** così non toccano le tab dark finché non convertite. Font: **Inter** (già caricato).

### FASE 1 — FATTA
- Home reale (`ui-home.js` → **v=9**) riscritta col kit `.em` (light, denso). Contenuto: 4 KPI + banner Sfida + "Corse in Corso" + "In coda" (pendingRides reali) + feed destro (Contratto + Notifiche da emails + sezione "Autisti" da gs.drivers). Centrato con `.em-wrap` (max-width ~1120) → margini/sfondo ai lati. Mantiene `data-countup` e `switchTab`.
- **NB contenuto vs chrome:** la Home renderizza SOLO il contenuto della scheda. Rail giocatore, Power Spin, barra risorse e nav orizzontale sono **chrome (Fase 2)**: nel gioco vero saranno il telaio globale attorno alla Home, non dentro `ui-home.js`. È per questo che l'anteprima sembra "più scarna" del mockup E4 a pagina intera.
- **Come vederla:** apri `_mockups/home_real_preview.html` (usa lo `style.css` + `ui-home.js` VERI, niente login) **oppure** ricarica il gioco con **hard-refresh** (style.css NON ha `?v=`, quindi va forzata la cache).

### FASE 2 — FATTA (2026-06-01)
Chrome globale eRepublik-Modern implementata. **Come vederla:** apri `_mockups/chrome_preview.html` (chrome reale + Home reale, no login) oppure hard-refresh del gioco.

**Cosa è stato fatto:**
- **Sfondo cielo/skyline globale**: `class="em-shell"` su `#app-body` → regola `#app-body.em-shell` in style.css (cielo gradiente + skyline SVG, `background-attachment:fixed`, `!important` per battere `.app-bg` dark). Disabilitato il dot-grid `.app-bg::before`.
- **Topbar barra-risorse** (`#top-bar` riscritta): card bianca centrata (max-width 1130) su cielo → brand, meta (breadcrumb·data·ora), chips risorse (Energia con barra, Reputazione, Driver Coins, VTK, Cash), meteo, azioni (🔍 cmd-palette, ⏻ logout). **TUTTI gli ID `tb-*` conservati** (tb-cash/rep/energy-bar/energy-text/time/date/breadcrumb/weather-icon/weather-label/surge/tc/vtk) → `updateUI` in engine.js continua a scrivere senza modifiche.
- **Nav orizzontale** (`#em-nav`, NUOVO): 6 categorie (🏠 Home · 🏢 Le mie sedi · 🛒 Business · 💹 Finanza · 👑 Potere · 🌐 Community) con **dropdown su hover** che contengono le 28 tab. Mappatura = i 5 gruppi sidebar esistenti. Click categoria → tab primaria; click voce dropdown → `switchTab`.
- **Sidebar dark NASCOSTA** (`.em-shell #sidebar-player{display:none}`) ma **DOM conservato** → cmd-palette (legge `.sidebar-item[data-tab]`), active-state e breadcrumb di ui-sidebar.js continuano a funzionare.
- **`em-chrome.js` (NUOVO, v=3)**: (a) patcha `switchTab` (sopra il patch di ui-sidebar.js) per evidenziare la categoria/voce attiva in `#em-nav`; (b) `syncChromeOffset()` misura l'altezza reale di `#em-chrome` e imposta `#main-panel.style.top` con `setProperty(...,'important')` — eseguito subito + rAF + DOMContentLoaded + load + `document.fonts.ready` + timeout + ResizeObserver.
- **Layout**: topbar+nav avvolti in un **unico wrapper fisso `#em-chrome`** (i due elementi sono `position:static` dentro). `#main-panel` ora `left:0; background:transparent`, `top` dinamico via JS (fallback inline 150px). premium-ui.css aggiornato (left:0 per main-panel/ticker/map-overlay). `#tab-container` max-width 1130. `#panel-title` reso visually-hidden **off-screen** (NON `display:none` — `innerText` su display:none ritorna '' in Chrome e romperebbe l'auto-refresh Home + il guard `if(!title)return` di dispatcher).
  - **ROOT CAUSE overlap (2026-06-01, RISOLTO):** `#main-panel` prendeva `position:fixed` SOLO dalla classe Tailwind `.fixed`. Senza Tailwind (es. nel preview) restava `position:static` → `top` ignorato → contenuto da y=0 dietro la chrome. Fix: regola **`.em-shell #main-panel{position:fixed}`** in style.css (indipendente da Tailwind) + Tailwind aggiunto al preview. **Verificato con Chrome headless** (vedi sotto).
- **Verifica visiva headless (METODO RIUTILIZZABILE):**
  ```
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
    --allow-file-access-from-files --window-size=1400,900 --force-device-scale-factor=1 \
    --virtual-time-budget=3000 --screenshot=/tmp/shot.png \
    "file://$(pwd)/_mockups/chrome_preview.html"
  ```
  Poi leggere `/tmp/shot.png`. Per misure DOM precise, iniettare uno script che scrive `getBoundingClientRect`/`getComputedStyle` in un `<div>` a video e screenshottare.

**Classi CSS chrome**: prefisso `.emc-*` (per non collidere col content-kit `.em-*` che è scoped sotto `.em`). In fondo a style.css, sezione "EM CHROME".

**NB transizione**: chrome light + Home light + 28 tab ancora dark (card #161b22 su pannello, ora su cielo). Per le tab dark il `#main-panel` è trasparente → le card dark "galleggiano" sul cielo. È lo stato di transizione atteso finché non parte la Fase 3.

### FASE 3 — IN CORSO (roll-out tab dark → light) — quasi completa (2026-06-01 sera)

**FATTO questa sessione — 25 tab convertite al light (tutte `?v=10`):**
- **Full kit `.em` (riscritte a mano + verificate via screenshot headless):**
  `ui-dispatch.js` · `ui-fleet.js` · `ui-staff.js` · `ui-finance.js` · `ui-emails.js`
  (+ `ui-home.js` già fatta in Fase 1). Usano `.em-card/.em-kpibar/.em-tbl/.em-pill/.em-gbtn/...`.
- **Remap colori + wrapper `.em em-page em-wrap` (verificate a campione):**
  `ui-ranking.js` · `ui-legal.js` · `ui-market.js` · `ui-realestate.js` · `ui-marketing.js` ·
  `ui-ops.js` (regions+provinces) · `ui-investments.js` · `b2b.js` · `tourism.js`
- **Remap colori + centratura globale (no `.em-wrap`, vedi regola CSS sotto):**
  `ui-politics.js` · `ui-help.js` · `crypto.js` · `contracts.js` · `auctions.js` ·
  `black_ops.js` · `infrastructure.js` · `nemesis.js` · `hostile_takeover.js` · `hq.js` ·
  `ui-career.js` (modal-based).

**Infrastruttura aggiunta (riutilizzabile):**
- **Nuove classi `.em-*` condivise** in fondo a `style.css` (sezione "EM kit — shared helpers for FASE 3"):
  `.em-page .em-sec .em-kpibar .em-tbl .em-ghbtn .em-goldbtn .em-redbtn .em-pill(+--green/blue/gold/red/gray/violet) .em-tabs/.em-tab .em-prog`.
- **Regola centratura globale** in `style.css` (sezione EM CHROME):
  `.em-shell #tab-container{font-family:Inter}` + `.em-shell #tab-container > *{max-width:1158px;margin-inline:auto}` + `> .em{max-width:none}`.
  → ogni tab (anche solo-remap) resta centrata nella larghezza della chrome (1130) senza wrapper per-file.
- **Classi email lightened** in `style.css`: `.inbox-tab*`, `.email-card/-body/-subject/-sender-name/-actions` ora light.
- **Script remap** (color-token dark→light) salvato in `_mockups/fase3_remap.pl` (mappa hex → palette `.em`). Uso: `perl _mockups/fase3_remap.pl < file.js > /tmp/o && mv /tmp/o file.js`. Riutilizzabile per showroom/war_room.

**⚠️ LEZIONE CRITICA (bug risolto):** le `<table>` collassano in Chrome dentro **card a metà larghezza** (grid 1fr 1fr): un `<td>` con dentro un `display:flex` o una progress-bar `flex:1` riporta min-content ~0 → la colonna si schiaccia a 24px e il testo va in overlap. **Regola:** nelle card strette usare **righe flex `.em-lrow`** (come la Home), NON `<table>`. Le tabelle a larghezza piena (card singola) vanno bene se: `.em-tbl td` ha `white-space:nowrap` (già nel kit) e le barre dentro le celle hanno **width fissa** (es. `width:52px`), mai `flex:1`. (Dispatch è stato riscritto: lista autisti ora a righe flex.)

### FASE 3 — COMPLETATA ✅ (2026-06-01 sera, sessione 2)
**TUTTE le 28 tab sono ora light.** Convertite a mano anche le 3 bespoke che mancavano:
- **`war_room.js`** (`?v=10`) — overlay fullscreen mappa province: sfondo cielo light, mare SVG `#bcd3e8`, header/sidebar/card bianche, regioni politiche colorate invariate, bordi neutri regione passati a `rgba(0,0,0,0.22)` per leggibilità su mare chiaro. Verificata via screenshot (mappa Italia OK).
- **`showroom.js`** (`?v=10`) — overlay fullscreen galleria auto + configuratore: CSS riscritto light (sfondo cielo, card bianche, pill filtri blu/viola attivi, bottoni blu, buy-btn gradiente blu). Verificata via screenshot (galleria OK).
- **`ui-store.js`** (`?v=10`) — Executive Club: ora **light-premium**. Mantiene l'**hero band scura** (gradiente, come `.em-banner` della Home) e le **art-tile scure** per pacchetto (accenti premium voluti per monetizzazione), ma tabs/pack-card/service-card/info sono light. Sfondo root → `transparent` (mostra il cielo). Verificata via screenshot.

**La transizione dark→light è finita.** Non resta nessuna tab dark.

**Extra convertiti nella stessa sessione (oltre alle 28+ tab):**
- **`ui-lifestyle.js`** (`?v=10`) — tab Lifestyle (era ancora dark, mancava dalla lista) → remap+wrap light.
- **`p2p-render.js`** (`?v=10`) — sezioni P2P market/azioni renderizzate *dentro* le tab Market e Finance → remap light (altrimenti card dark dentro tab light).
- **`ui-staff.js`** car modal + **configuratore fullscreen** (`openCarConfigurator`) → light (pannello bianco, checkbox/bottoni light, foto auto invariata). `driver_skills.js`, `map-garage.js` (garage 3D), `vtk-market.js` → remap light.

**Overlay lasciati scuri DI PROPOSITO** (flair/utility, coerenti con `.em-banner` dark della Home e hero scuro dello Store):
- `cmd-palette.js` (spotlight ⌘K), `engine.js` → `showBigEvent` (popup celebrativo) + `logToMap` (log sulla mappa Mapbox scura), `tutorial.js` (onboarding). Non sono tab; il dark qui è una scelta estetica, non debito.

### Rifinitura opzionale (non urgente)
Le tab "solo-remap" (politics, crypto, contracts, auctions, black_ops, infrastructure, nemesis, hostile_takeover, hq, help, career) sono light/centrate ma usano HTML inline invece dei componenti `.em-card/.em-pill`. Migrarle al kit pieno è solo polish estetico, non funzionale. Verifica in-game (login reale) consigliata per confermare la regola di centratura globale su strutture multi-figlio.

**Ordine storico consigliato (riferimento):**
1. `ui-dispatch.js` 2. `ui-fleet.js` 3. `ui-staff.js` 4. `ui-finance.js` 5. `ui-emails.js`, poi le restanti.

**Ricetta di conversione (per ogni `renderTab*`):**
1. Avvolgere TUTTO l'HTML in `<div class="em"><div class="em-wrap"> ... </div></div>` (la classe `.em` definisce le var `--em-*` e il font Inter; `.em-wrap` centra a max-width 1120).
2. Sostituire i colori dark inline con le classi `.em-*` (NON ridefinire i colori a mano):
   - card `#161b22`/`#0d1117` → `.em-card` (+ `.em-ch` per l'header card con `.t`/`.a`)
   - KPI strip → `.em-kpis` + `.em-kpi` (`.l` label, `.v` valore, `.s` sub)
   - righe lista/tabella → `.em-lrow` + `.em-th`/`.em-lt`/`.em-lm`/`.em-price`/`.em-bd`
   - bottoni: primario verde `.em-gbtn`, secondario `.em-bbtn`; ghost/altri → vedi palette `.em` (blue `--em-blue` #2f74c0, green #1aa06a, gold #c79a2a, red #db5746)
   - empty state → `.em-empty`; link inline → `.em-link`
   - banner scuro/hero → `.em-banner`; contratto/CTA blu → `.em-contract`; feed item → `.em-ev`/`.em-evi`/`.em-evt`/`.em-evd`
3. Tutte le classi `.em-*` sono in fondo a `style.css` (sezione "EM kit"). Se manca un componente, aggiungerlo lì con prefisso `.em-` (NON `.emc-` che è solo chrome).
4. Bump `?v=` del file in index.html.
5. Verificare con lo screenshot headless (vedi sopra) caricando il file reale — meglio creare un mini-preview tipo `_mockups/home_real_preview.html` se la tab non parte senza login.

**Riferimento target:** `_mockups/E4_erepublik_dense.html` (densità/colori) e `ui-home.js` (esempio già convertito, leggerlo come template).

**Vincoli da NON violare durante la Fase 3:**
- Mai `DS.*`. Mai classi Tailwind arbitrarie non compilate (es. `text-[9px]`, `bg-gold/5`) — solo `.em-*` o inline.
- Non toccare la chrome (`.emc-*`, `#em-chrome`, em-chrome.js) — è chiusa.
- Le mutazioni cash server-authoritative restano via RPC Supabase (invariato).

### Background
Ora è un **placeholder CSS** (skyline disegnato a rettangoli, in `.em-home` di style.css). Da sostituire con asset finale (lo creo io più ricco, oppure lo fornisce l'utente).

### Nota operativa
Verifica visiva possibile in autonomia via **Chrome headless** (comando nella sezione Fase 2 sopra) → screenshot in `/tmp` → leggerlo. Niente più dipendenza dallo "guarda tu nel browser".

---

## Ultima sessione — Analisi bug completa + polish visivo (/impeccable)

### 1. Analisi completa del codebase — codebase SANO

Scansione sistematica di tutti i 76 file JS (~47k righe). Risultati:
- ✅ 0 errori di sintassi (`node --check` su tutti i .js)
- ✅ Routing tab coerente: ogni `switchTab` punta a una `renderTab*` esistente
- ✅ 179 handler `onclick` inline → 0 funzioni orfane
- ✅ Validazione input robusta (`parseInt()||1`, guard `!amount`) — NaN non raggiunge `cash`
- ✅ Gestione errori Supabase di qualità: pattern `{data,error}` + rollback transazionale (es. p2p-market.js rimette l'auto in flotta se l'RPC fallisce)
- ✅ Timer senza leak (`_homeTimer` guard singleton, `_decreesCountdownTimer` clearato)
- ✅ Nessun marker TODO/FIXME/HACK reale

**Unico problema reale trovato e già risolto:** la Home era l'ultima superficie non migrata (vedi sotto).

### 2. ⚠️ CLAUDE.md OBSOLETO su 2 punti (da correggere)
- **`window.gameState` ORA esiste**: a `engine.js:295` c'è `Object.defineProperty(window,'gameState',{get(){return gameState}})`. Quindi `window.gameState` e `gameState` bare sono **equivalenti**. Il bug log CLAUDE.md del 2026-05-24 ("window.gameState non esiste") è superato. Gli usi in serverState.js / design-system.js / contracts.js NON sono bug.
- **I 4 file obsoleti sono già rimossi** (ui-meta.js, ui-finance-mkt.js, vip_clients.js, p2p_market.js): il TODO "git rm" nel CLAUDE.md è già fatto.

### 3. Home / Command Center — RIFATTA in eRepublik flat dark
`ui-home.js` era l'**unico** tab ancora in stile vecchio: tema light (`var(--bg)`) + glassmorphism (`.ce-glass`, blur, radius 12px). Tutti gli altri tab erano già flat dark.
- Convertita interamente a palette dark inline (#0d1117 / #161b22 / #21262d / #e6edf3) — 0 residui `var(--*)`, 0 `ce-*`, 0 colori non-token
- KPI ridisegnati in stile "terminal austero" (scelta utente): niente emoji-icona giant, label 9px mono uppercase, valore mono. Conservati: countup (`data-countup`, triggerato dal MutationObserver di motion.js), delta "vs ieri", auto-refresh 5s, tabella corse live, colonne Autisti/Notifiche, empty states
- **Bug fix:** matching notifiche era case-sensitive (`includes('multa')` non trovava "Multa") → tutte diventavano "📩 Messaggio". Ora `subj.toLowerCase()` → categorie corrette
- Verificata via screenshot (harness mock isolato, non gioco loggato)
- `ui-home.js` → **v=7**

### 4. Micro-interazioni — SISTEMATIZZATE via CSS globale
Censimento: 221 `<button>`, solo 41 con `scale(0.97)` inline (180 mancanti su ~30 file).
- Aggiunta **una regola CSS globale** in `style.css` (sezione "Buttons"): `button:active:not(:disabled){transform:scale(0.97)}` + transition. Copre tutti i bottoni (tab, modal, overlay) inclusi i futuri. Controlli Mapbox esclusi, `prefers-reduced-motion` rispettato. Gli handler inline esistenti vincono per specificità (nessun conflitto)
- `DESIGN.md` aggiornato: la micro-interazione non va più messa inline su ogni bottone
- Questo risolve anche la lacuna di Career (già flat-pulito, gli mancava solo la micro)

### 5. Loading skeleton flat
- Nuova classe `.ce-skel` in `style.css` (shimmer grigio neutro, zero neon, rispetta reduced-motion) — sostituisce la `.ds-skel` cyan-tinted (che violava il flat)
- Applicata a `ui-realestate.js` (era testo "Caricamento immobili…" → v=7) e alle righe placeholder di `ui-ranking.js` (v=8)
- Market/p2p non ha loading esplicito (rende da cache locale) → nessuno skeleton necessario
- Verificata via screenshot

### 6. A — Fix rapidi residui (FATTO)
- `logToMap` (engine.js) convertito da classi Tailwind (`border-white/5 text-[9px]`) a inline flat
- **Guard NaN su cash:** all'inizio di `gameLoop()` (engine.js), se `gameState.cash` diventa NaN/Infinity viene ripristinato l'ultimo saldo valido (`window._lastValidCash`) + notifica. Aggiunto anche `window._addCash(amt)` (utility con guard `Number.isFinite`) per il futuro
- CLAUDE.md allineato ai fatti reali: getter `window.gameState`, 4 file obsoleti già rimossi, micro-interazione ora globale via CSS
- `engine.js` → **v=9**

### 7. D — Coerenza estetica delle 3 isole di stile (FATTO)
- **showroom.js**: accento cyan neon (#00d4ff x11, #22d3ee) → blu flat #58a6ff. → **v=7**
- **war_room.js**: teal #00cccc → #58a6ff, gold-acceso #FFD700 → #d4af37, red #FF4444/#ef4444 → #f85149, green #22c55e → #3fb950. → **v=7**
- **ui-store.js**: LASCIATO premium intenzionalmente. I gradient sono sui badge funzionali (Popular/Value/New/Limited) e l'elevation serve la monetizzazione (PRODUCT.md: store = monetizzazione). Appiattirlo danneggerebbe conversione e leggibilità badge. **Decisione: non è debito, è design.**

### 8. C — Command palette (FATTO) — riduce sovraccarico 29 tab
- Nuovo file **`cmd-palette.js`** (v=1): overlay ricerca rapida sezioni, attivabile con **⌘K / Ctrl+K** o dal campo "🔍 Cerca sezione…" in cima alla sidebar
- Legge i `.sidebar-item[data-tab]` dal DOM a runtime → zero duplicazione, sempre in sync con la sidebar
- Ricerca live case-insensitive, navigazione tastiera (↑↓ Enter Esc), stile flat dark
- Verificata via screenshot

### Nessun commit fatto (non richiesto dall'utente).

---

## Stato del piano di miglioramento

Aree **A, B, C, D completate**. Resta solo, rimandata esplicitamente dall'utente al post-lancio (expansion):
- **E — Espansione contenuti:** lane taxi/truck/water-taxi (vehicleClass/requiredClass), HQ multi-città. NON iniziare finché il gioco non è lanciato — sarà introdotta come "expansion".

---

## Versioni script attuali

| File | Versione |
|---|---|
| `engine.js` | v=17 (dirty-check updateUI in gameLoop) |
| `ui-home.js` | v=16 (streak card 🔥 + dirty-check) |
| `crypto.js` | v=12 (em-kit pieno) |
| `auctions.js` | v=12 (em-kit pieno) |
| `hq.js` | v=13 (em-kit pieno) |
| `contracts.js` | v=13 (em-kit pieno) |
| `ui-politics.js` | v=13 (em-kit pieno) |
| `ui-help.js` | v=13 (em-kit pieno) |
| `black_ops.js` | v=12 (em-kit pieno) |
| `infrastructure.js` | v=12 (em-kit pieno) |
| `nemesis.js` | v=13 (em-kit pieno) |
| `hostile_takeover.js` | v=12 (em-kit pieno) |
| `ui-ranking.js` | v=12 |
| `showroom.js` | v=10 |
| `war_room.js` | v=10 |
| `cmd-palette.js` | v=1 |
| `em-chrome.js` | v=3 |

`style.css` e `DESIGN.md` modificati (style.css non ha `?v=`, è caricato senza cache-busting).

---

## Architettura critica (invariata)

```
gameState           → let in engine.js MA ora ESPOSTO come window.gameState
                      via getter (engine.js:295). I due sono equivalenti.
window.DS           → NON usare — tutti i tab sono eRepublik flat inline
?v= scripts         → bumpare in index.html ad ogni modifica JS
Micro-interazione   → ORA globale via CSS (button:active scale .97 in style.css).
                      Non serve più l'inline onmousedown su ogni bottone.
Skeleton flat       → classe .ce-skel in style.css (shimmer grigio neutro)
countup KPI         → motion.js ha un MutationObserver su #tab-container che
                      chiama _ceTriggerCountUps() ad ogni cambio contenuto
PRODUCT.md/DESIGN.md → contesto per /impeccable. Caricare il loader con
                      IMPECCABLE_CONTEXT_DIR=<project root> (altrimenti carica
                      i file della skill stessa, non quelli del gioco!)

War Room (provinces):
  - openMapOverlay() → _ensureMap() → initMap() (se map===null)
  - initMap() NON chiama più switchTab() — era il bug della sessione precedente
```
