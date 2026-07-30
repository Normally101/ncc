# Stato routine automatica (memoria tra sveglie)

## Branch attivo
`auto/routine-mission-update` (solo docs, questa sveglia). In parallelo restano aperte:
- `auto/tutorial-action-gate` → **PR #1**, in attesa di revisione/merge di Vlad.
- `auto/idle-offline-catchup` → **PR #2**, in attesa di revisione/merge di Vlad.

## Task corrente
**Missione estesa ricevuta da Vlad (30 luglio 2026, live, non da prompt schedulato):**
"fixare ogni bug del gioco e renderlo un gioco di successo dove 10k giocatori possono
giocare insieme in sicurezza, senza jailbreak e senza problemi di sicurezza." Tradotta in
backlog concreto in `docs/AUTOMATION_ROUTINE.md` (sezione "Missione estesa" + nuovo backlog
derivato) — vedi lì per il dettaglio e le regole (un item concreto alla volta, mai
monolitico, mai load-test/azioni dirette su prod). Il vecchio backlog puntuale (2 item) è
completato e archiviato in quel file come storico.

**In corso ora** (stessa finestra): primo item del nuovo backlog, "Audit rate-limit RPC" —
un subagent sta mappando tutte le ~90 `rpc_*` in `*.sql` (chi è client-facing, chi muta
cassa/valuta/stato condiviso, chi ha già `_ce_rate_limit` o un'altra mitigazione) per capire
dove manca copertura, sul modello del pattern già validato in `43_ratelimit_driver_coins.sql`.
Solo lettura/audit, nessuna scrittura SQL applicata. Output atteso: scaffold SQL (non
applicato) + branch `auto/rpc-ratelimit-audit` + PR.

## Sveglie consecutive senza progresso
0

## Blocchi aperti
_(nessuno per questo task — è solo un aggiornamento di documentazione/missione)_

## Log sveglie
- 2026-07-30 (sveglia 1): **Tutorial action-gated** — fatto, PR #1 aperta
  (https://github.com/Normally101/ncc/pull/1), CI verde, nessun commento di review.
- 2026-07-30 (stessa sveglia, su richiesta esplicita di Vlad di sfruttare di più la finestra):
  **Demo idle "hai guadagnato mentre riposavi"** — fatto, PR #2 aperta
  (https://github.com/Normally101/ncc/pull/2).
- 2026-07-30 (stessa sveglia, live, non da prompt schedulato): Vlad ha esteso la missione
  della routine (vedi "Task corrente" sopra) e chiesto di aggiornare questo log. Aggiornato
  `docs/AUTOMATION_ROUTINE.md` con missione estesa + nuovo backlog derivato, questo file, e
  aperta PR docs-only per portare l'aggiornamento su `main` (necessario perché ogni sveglia
  futura legge questi due file da `main` fresco — senza merge la prossima sveglia non
  vedrebbe la missione estesa).
