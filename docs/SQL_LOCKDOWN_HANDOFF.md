# Handoff per Claude in VS Code — falle SQL da chiudere in produzione

> Preparato da una sessione cloud (routine `docs/AUTOMATION_ROUTINE.md`, interrotta da Vlad in
> live il 9 agosto 2026 per spostare il lavoro qui, dove c'è accesso reale a Supabase via
> `source ~/.config/ce-supabase.env` + `supabase` CLI/Management API — vedi CLAUDE.md,
> "Operatività"). Questa sessione cloud **non ha credenziali Supabase**, quindi ha potuto solo
> leggere il codice e scrivere scaffold, mai applicare nulla. Tu (Claude in VS Code) puoi fare
> tutto il giro: scrivere la fix definitiva, testarla, applicarla al DB reale.

## Come muoverti
1. Leggi `HANDOFF.md` (sezioni "6 agosto 2026" e "🔴 DA FARE TU") e `docs/SYSTEMS.md` §9 per il
   contesto completo — questo file è solo la checklist operativa, non ripete tutto.
2. Per ognuno dei 3 gruppi sotto: verifica tu stesso leggendo il codice (non fidarti solo di
   questo riepilogo), scrivi/adatta la SQL, testala nel SQL Editor di Supabase o via CLI prima di
   applicarla a `companies`/`vehicles` reali, poi applica.
3. Dopo ogni gruppo applicato: aggiorna `HANDOFF.md` con cosa hai fatto (stesso stile delle entry
   esistenti) e valuta se mergiare/chiudere le PR collegate (#4, #11 sono scaffold pronti da
   applicare così come sono; #12 è solo mappa, nessuna PR di fix ancora aperta per i suoi finding).
4. Player reali: il gioco non ha ancora giocatori attivi (vedi commit "VTK Shop ricostruito... non
   abbiamo giocatori attivi") — meno rischio a testare direttamente in prod rispetto a un gioco
   live, ma comunque verifica prima di eseguire DDL/REVOKE distruttivi.

---

## Gruppo 1 — Scaffold GIÀ SCRITTI, solo da rivedere e applicare (zero lavoro di scrittura SQL)

### `45_lockdown_cash_exploits_scaffold.sql` (già in `main`, MAI applicato al DB)
La **Sezione 1** è la più urgente di tutto il repo: `_add_player_cash`/`_get_player_cash`
(`14_fix_cash_bigint_cast.sql`) sono grantate direttamente ad `authenticated` senza controllo
`v_user_id = auth.uid()` — cassa illimitata via devtools, confermata attiva. Sono 2 righe di
`REVOKE`, zero rischio di rompere nulla (le chiamate interne da altre RPC `SECURITY DEFINER`
continuano a funzionare — vedi commento nel file). **Applica questa per prima, letteralmente
prima di leggere il resto di questo documento.**
Le Sezioni 2-4 dello stesso file (rientrano `rpc_pay_majority_dividend`, `rpc_start_trip`/
`rpc_claim_trip_reward`, `rpc_claim_daily_reward`) sono meno urgenti ma già pronte.

### PR #11 (`auto/lockdown-auction-shadowop`, https://github.com/Normally101/ncc/pull/11) — NON mergiata
Due file scaffold pronti, mai applicati:
- `47_lockdown_auction_shadowop_scaffold.sql` — `rpc_resolve_auction` (REVOKE, zero call-site
  legittimo) + `rpc_execute_shadow_op` (cap costo).
- `48_lockdown_nemesis_shadowdef_tension_scaffold.sql` — `rpc_nemesis_fund_rival` (rate-limit),
  `rpc_upgrade_shadow_defense` (stesso bug costo-negativo del file gemello), `rpc_dampen_tension`
  (internalizzata dentro `rpc_contribute_holding_treasury`), `rpc_sell_crypto` (quantità negativa).
- Include anche un **fix JS reale già pronto** in `p2p-market.js` (`contributeHoldingTreasury`,
  cache-bust `v=9`) che gestisce sia la risposta vecchia che quella nuova di
  `rpc_contribute_holding_treasury` — non rompe nulla prima che applichi la SQL.

Leggi la PR, verifica personalmente (i diff sono già lì), applica, poi mergia la PR.

---

## Gruppo 2 — NON scaffoldati ancora: le 3 falle più gravi trovate finora, verificate personalmente da questa sessione leggendo il sorgente

Trovate durante l'audit completo richiesto da Vlad (PR #12, `docs/SYSTEMS.md` §9, sezione
"🔴🔴 CRITICI"). Questa sessione le ha **verificate leggendo il codice** (non solo il report di
un subagent) ma non ha scritto lo scaffold — fermata da Vlad prima. Codice esatto sotto così non
devi ricercarlo.

### A. `rpc_sync_cash` — `10_sync_cash.sql` — 🔴🔴 la più grave
```sql
CREATE OR REPLACE FUNCTION rpc_sync_cash(v_cash BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Non autenticato';
    END IF;

    UPDATE companies
       SET cash       = v_cash,
           updated_at = NOW()
     WHERE user_id = v_uid;
    ...
```
`v_cash` è un `SET` assoluto, scelto interamente dal client, **zero validazione** oltre
`auth.uid()` (che limita solo *a chi* puoi farlo, non *a quanto*). Chiamata da
`serverState.js::syncCash`, usata da `engine-daily.js` dopo ogni tick giornaliero, da
`zero-to-hero.js`, `quests.js` — è il meccanismo di sync cash **più usato nel gioco**. Exploit:
`supabase.rpc('rpc_sync_cash', {v_cash: 999999999999})` da devtools.

**Perché non è banale da fixare con un semplice cap assoluto**: il gioco è "poor to rich" — un
giocatore legittimo di fine partita può avere cifre molto alte (fido PLATINUM già a €5.000.000,
altre meccaniche assumono patrimoni multi-milionari). Un cap assoluto basso spaccherebbe i
giocatori ricchi legittimi.

Due strade, verificale contro il codice reale prima di scegliere:
1. **Cap sul delta per chiamata**, non sul valore assoluto: leggi il `cash` attuale in riga (già
   lo fai per l'`UPDATE`), calcola `v_delta = v_cash - cash_attuale`, rifiuta se `ABS(v_delta)`
   supera una soglia plausibile per **un singolo tick giornaliero** (guarda
   `engine-daily.js::processDailyRoutines` per farti un'idea concreta di quanto può oscillare la
   cassa in un giorno anche per un giocatore ricco con flotta enorme — non indovinare il numero,
   derivalo dal codice come hanno fatto gli scaffold precedenti per `rpc_start_trip`). Chi vuole
   sfruttarla può comunque accumulare nel tempo ma non più in una chiamata sola — riduce
   drasticamente il danno di un exploit one-shot da devtools.
2. **La riscrittura vera** (delta-based invece di SET assoluto, come già fa `quests.js` per i
   suoi importi) è il debito #1 già noto (`docs/ECONOMY_SERVER_AUTH.md`) — bloccata su una
   decisione di scala economica di Vlad, non improvvisarla qui senza chiedere.
Consiglio: applica (1) come mitigazione immediata, lascia (2) esplicitamente a parte come sempre
fatto finora per il debito #1.

### B. `rpc_sell_vehicle` — `09_provinces_realestate_fuel.sql` — 🔴🔴
```sql
CREATE OR REPLACE FUNCTION rpc_sell_vehicle(
    v_vehicle_id UUID,
    v_price      BIGINT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_company companies%ROWTYPE;
BEGIN
    SELECT * INTO v_company FROM companies WHERE user_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Azienda non trovata'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM vehicles
         WHERE id = v_vehicle_id
           AND company_id = v_company.id
           AND status = 'IDLE'
    ) THEN
        RAISE EXCEPTION 'Veicolo non trovato, non di tua proprietà, o in servizio attivo';
    END IF;

    DELETE FROM vehicles WHERE id = v_vehicle_id;
    UPDATE companies SET cash = cash + v_price WHERE id = v_company.id;
    ...
```
`v_price` è scelto dal client, **nemmeno un controllo `>= 0`**. Il controllo di ownership/stato
`IDLE` c'è ed è corretto — manca solo la validazione del prezzo. Vendi l'auto più economica della
flotta dichiarando `v_price = 999999999999`.

Fix diretto, nessun dilemma di design: prima del `DELETE`, leggi il veicolo (già lo fai per
l'`EXISTS`, trasformalo in un `SELECT ... INTO` con `FOR UPDATE` così hai anche i suoi dati) e
calcola un prezzo massimo plausibile lato server invece di fidarti di `v_price`. Guarda come
`showroom.js`/le RPC di acquisto calcolano il prezzo di un'auto (listino base × condizione/usura)
per derivare un tetto di vendita coerente — verificato da questa sessione come "buon esempio da
imitare" in `docs/SYSTEMS.md` §9. Come minimo indispensabile anche solo un
`v_price := LEAST(GREATEST(0, v_price), <tetto plausibile>)` chiude il caso peggiore.

### C. `rpc_take_loan` — `02_mmo_rpcs_extension.sql` (righe ~482-538) — 🔴🔴
```sql
CREATE OR REPLACE FUNCTION public.rpc_take_loan(
    v_principal     bigint,
    v_interest_rate numeric,
    v_daily_payment bigint
)
...
    IF v_principal <= 0 THEN RAISE EXCEPTION ...; END IF;
    IF v_daily_payment <= 0 THEN RAISE EXCEPTION ...; END IF;
    IF v_interest_rate < 0 THEN RAISE EXCEPTION ...; END IF;
    ...
    SELECT COUNT(*) INTO v_loan_count FROM public.company_loans WHERE company_id = v_company.id;
    IF v_loan_count >= 3 THEN RAISE EXCEPTION ...; END IF;

    UPDATE public.companies SET cash = cash + v_principal WHERE id = v_company.id;

    INSERT INTO public.company_loans (company_id, principal, remaining, interest_rate, daily_payment)
    VALUES (v_company.id, v_principal, v_principal, v_interest_rate, v_daily_payment)
    ...
```
Unico limite: "max 3 prestiti simultanei". **Nessun tetto sul capitale** (`v_principal`) né un
controllo che `v_interest_rate`/`v_daily_payment` siano coerenti col capitale richiesto — puoi
chiedere un prestito enorme con una rata giornaliera irrisoria, il capitale viene accreditato
**istantaneamente**. Il tetto reale esiste solo lato client (`_getCreditTier(score).rate`/fido —
vedi `HANDOFF.md`, fix "Linea di credito" del 6 agosto, che ha corretto *cosa viene mostrato*, non
*cosa il server accetta*).

Fix: porta lato server la logica di `_getCreditTier` (`ui-investments.js`) — calcola il fido
massimo dal punteggio/credit-tier reale della company (leggi come lo calcola il client per
derivare la stessa formula) e rifiuta `v_principal` oltre quel tetto. Se serve una `credit_score`
o campo equivalente che oggi vive solo lato client, verifica se esiste già una colonna
`companies`/tabella dedicata prima di aggiungerne una nuova.

---

## Gruppo 3 — Trovati ma non ancora scaffoldati, priorità sotto ai 3 sopra (da `docs/SYSTEMS.md` §9)

Non verificati di persona da questa sessione (solo dal subagent di audit di PR #12) — ricontrolla
tu prima di agire, stesso principio "verifica, non fidarti":
- **`rpc_vote_server_decree`** (`22_server_decrees.sql`) — il commento nel file stesso ammette
  che il server si fida del client per i lobbying points: un giocatore può far approvare
  istantaneamente un decreto globale che cambia le regole per **tutti**.
- **Famiglia "Driver Coins negativi"** (6 RPC: `rpc_upgrade_offline_limit`,
  `rpc_buy_auto_rest`, `rpc_buy_energy_refill`, `rpc_buy_fleet_repair`, `rpc_buy_vip_contact`,
  `rpc_buy_hr_automation`) — validano solo `driver_coins < costo`, un costo negativo passa sempre.
- **Pattern sistemico "prezzo dal client mai confrontato a un listino"** su ~10 RPC
  (`rpc_buy_vehicle`, `rpc_hire_driver`, `rpc_buy_investment`, `rpc_buy_vehicle_upgrade`,
  `rpc_toggle_telepass`, `rpc_refuel_vehicle`, `rpc_repair_vehicle`, `rpc_rest_ceo`,
  `rpc_start_marketing_campaign`, `rpc_unlock_region`) — stesso principio di B sopra, applicato
  su superficie molto più ampia. Consiglio: chiudi prima A/B/C (Gruppo 2, cash diretto/illimitato,
  più gravi), poi torna qui sistematicamente RPC per RPC.

## Gruppo 4 — XSS, GIÀ FIXATO, non serve SQL
`docs/SYSTEMS.md` §9 e `docs/QA_PLAN.md` citano 2 XSS (`p2p-render.js`/`vtk-market.js`, nomi
giocatore/auto non sanitizzati). **Già corretto e pushato da questa sessione**: PR #13
(`auto/xss-p2p-vtk-market-names`, https://github.com/Normally101/ncc/pull/13) — fix JS puro
(`CE_Sec.escHtml()`), nessuna migrazione coinvolta, verificato con `node --check`. Rivedi e
mergia quella PR quando comodo, ma non serve altro lavoro SQL per questo punto.

---

## Nota finale
Dopo aver chiuso i gruppi 1-2 (i più urgenti), aggiorna `docs/AUTOMATION_STATE.md` — è rimasto
indietro rispetto allo stato reale (descrive ancora la situazione pre-6-agosto in alcune sezioni)
così la prossima sveglia cron della routine non riparte da un contesto stantio.
