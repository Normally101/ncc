# Economia server-authoritative — Spec & piano di migrazione

> Stato: **FASI 1-2 APPLICATE A PRODUZIONE il 28/08/2026** (modalità osservazione).
> Il registro esiste ed è vivo; **non blocca nulla** e non cambia i guadagni.
> Fasi 3-6 aperte. File SQL applicato: `66_registro_economia_osservazione.sql`
> (porta in prod le sezioni 1-3 di `42_economy_ledger_scaffold.sql`, con i tetti
> calibrati sui numeri misurati e una colonna in più: `oltre_tetto`).
> Contesto: chiude il **DEBITO DI SICUREZZA #1** tracciato in `HANDOFF.md` (economia client-authoritative → soldi infiniti).

## Il problema (oggi)
La cassa è decisa dal client; il server la rispecchia. Tre vie di minting:
1. **`game_saves` blob** — upsert diretto con `cash` arbitrario (`saveSystem.js`), letto come verità dal P2P.
2. **`rpc_sync_cash(v_cash)`** (`10_sync_cash.sql`) — SETta `companies.cash` al valore client (set assoluto).
3. **`rpc_add_driver_coins`** — coniava premium senza validazione (arginato da `41_*` con tetto 1M/chiamata, stopgap).

I trigger anti-cheat (`38_security_hardening.sql`) **loggano ma non bloccano** (`RETURN NEW`): un salto di cassa legittimo (offline, contratti, late-game) è indistinguibile da un cheat finché la **scala economica non è decisa** (vedi vault → *Decisioni Aperte #6*).

## Il modello target
**Il client non scrive MAI la cassa assoluta.** Ogni movimento è un **delta validato lato server** che passa per un **ledger append-only**.

- `cash_ledger` (append-only): ogni riga = un delta con `reason`, `source`, `balance_after`, `idempotency_key`. È l'audit trail + la sorgente di verità ricostruibile.
- `rpc_earn(delta, reason, source, idem)` / `rpc_spend(...)`: SECURITY DEFINER, validano segno + tetto **server-side per-reason** (catalogo in SQL, mai dal client), idempotenti su `idem`, aggiornano `companies.cash` e scrivono il ledger nella **stessa transazione**.
- `liquid_assets` e derivati → calcolati lato server, mai accettati dal client.
- Trigger `BEFORE UPDATE` su `companies.cash` che `RAISE EXCEPTION` se la cassa cambia **fuori** dalle RPC autorizzate (enforcement duro). ⚠️ Attivabile SOLO dopo aver migrato TUTTE le scritture cassa esistenti alle RPC — vedi fasi.

## ~~Perché solo scaffolding ora~~ — l'ostacolo è caduto il 28/08/2026
Lo scaffold è rimasto fermo per **un solo motivo**: la magnitudine dei tetti dipendeva dalla scala economica, **indecisa**. Il bilanciamento del 28/08 l'ha fissata su numeri **misurati** (corsa mediana €360; contratto tier 5 da €137.600 a €17.200/giorno; tetto ×4 sul moltiplicatore d'incasso → picco ~€16.800). Da lì i tetti di `_econ_cap` sono calcolati, non indovinati.

## Modalità osservazione — perché non si è passati subito all'enforcement
I tetti sono la parte che **non si può indovinare**: sceglierli a occhio e scoprire sul vivo di aver bloccato un incasso legittimo è il modo peggiore di calibrarli. Quindi ogni riga del registro annota **anche** se il movimento *sarebbe* stato rifiutato (colonna `oltre_tetto`), senza rifiutarlo. La calibrazione si **legge dai dati**:

```sql
-- I tetti da alzare PRIMA di accendere qualsiasi blocco:
SELECT reason, count(*) AS volte, max(abs(delta)) AS massimo
  FROM public.cash_ledger WHERE oltre_tetto GROUP BY reason ORDER BY volte DESC;

-- Quanto è coperto il catalogo delle causali:
SELECT reason = 'unknown' AS senza_causale, count(*) FROM public.cash_ledger GROUP BY 1;
```

Se la prima query resta vuota per giorni di gioco vero, i tetti reggono e la fase 3 può partire.

## Il lato client (fatto il 28/08)
`CE_money.spend/earn` ricevevano già il `motivo` da **99 chiamate su 100** (96 causali distinte: `ride_earnings`, `corporate_contract`, `auction_bid`, `annual_tax`…) e lo **buttavano via**. Ora viaggia fino al server: `money.js` → `serverState.js::syncCash(cash, motivo)` → `rpc_sync_cash(v_cash, p_reason)`. Il catalogo delle causali non è stato inventato: **esisteva già nel codice**. Sorvegliato da `test/economia/registro-causali.test.js`.

## Fasi di migrazione (quando si decide la scala)
1. ~~**Girare** lo scaffold su prod (crea tabella + RPC, inerti finché non chiamate).~~ ✅ **FATTO 28/08** via `66_`.
2. ~~**Calibrare** il catalogo tetti per-reason in `_econ_cap(reason)`.~~ ✅ **FATTO 28/08** sui numeri misurati. Da riverificare con i dati del registro prima della fase 5.
3. **Migrare le scritture**: ogni `UPDATE companies SET cash = cash ± X` sparso negli SQL (province/immobili/P2P/aste/contratti…) e ogni mirror client (`rpc_sync_cash`) → passare per `rpc_earn`/`rpc_spend`. Censimento: `grep -rn "companies SET cash" *.sql`.
4. **Deprecare** `rpc_sync_cash` (set assoluto) e bloccare l'upsert di `cash` dal blob `game_saves` (separare lo stato di gioco dal saldo monetario; il saldo vive solo in `companies` + ledger).
5. **Attivare** il trigger `BEFORE UPDATE` di enforcement (de-commentare in `42_*`). Solo ora il minting client è impossibile.
6. **Stripe** (requisito futuro, `HANDOFF.md`): l'accredito coin reali passa solo da webhook firmato → `rpc_earn` con `source='stripe'`. Revocare `rpc_add_driver_coins` da `authenticated`.

## Cosa NON fare
- Non attivare il trigger di enforcement prima della fase 3 (romperebbe ogni guadagno legittimo).
- Non mettere tetti "al volo" senza la scala economica (falsi positivi sui salti legittimi).
- Non far decidere al client importi/quantità: solo `reason` → il server mappa il valore.
