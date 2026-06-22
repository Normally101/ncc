# Economia server-authoritative — Spec & piano di migrazione

> Stato: **SPEC + SCAFFOLDING**. NON applicato a prod. NON cambia i guadagni live.
> File SQL associato: `42_economy_ledger_scaffold.sql` (idempotente, da rivedere PRIMA di girarlo).
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

## Perché solo scaffolding ora
La **magnitudine dei tetti** dipende dalla scala economica legittima, ancora **indecisa**. Mettere tetti sbagliati bloccherebbe i guadagni veri (decisione già presa, `HANDOFF.md`). Quindi: predisponiamo l'infrastruttura (tabella + RPC + trigger template) **senza attivarla**, pronta da calibrare quando la scala è fissata.

## Fasi di migrazione (quando si decide la scala)
1. **Girare** `42_economy_ledger_scaffold.sql` su prod (crea tabella + RPC, inerti finché non chiamate).
2. **Calibrare** il catalogo tetti per-reason in `_econ_cap(reason)` con la scala economica reale.
3. **Migrare le scritture**: ogni `UPDATE companies SET cash = cash ± X` sparso negli SQL (province/immobili/P2P/aste/contratti…) e ogni mirror client (`rpc_sync_cash`) → passare per `rpc_earn`/`rpc_spend`. Censimento: `grep -rn "companies SET cash" *.sql`.
4. **Deprecare** `rpc_sync_cash` (set assoluto) e bloccare l'upsert di `cash` dal blob `game_saves` (separare lo stato di gioco dal saldo monetario; il saldo vive solo in `companies` + ledger).
5. **Attivare** il trigger `BEFORE UPDATE` di enforcement (de-commentare in `42_*`). Solo ora il minting client è impossibile.
6. **Stripe** (requisito futuro, `HANDOFF.md`): l'accredito coin reali passa solo da webhook firmato → `rpc_earn` con `source='stripe'`. Revocare `rpc_add_driver_coins` da `authenticated`.

## Cosa NON fare
- Non attivare il trigger di enforcement prima della fase 3 (romperebbe ogni guadagno legittimo).
- Non mettere tetti "al volo" senza la scala economica (falsi positivi sui salti legittimi).
- Non far decidere al client importi/quantità: solo `reason` → il server mappa il valore.
