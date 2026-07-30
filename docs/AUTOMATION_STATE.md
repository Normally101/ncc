# Stato routine automatica (memoria tra sveglie)

## Branch attivo
`auto/tutorial-action-gate` — **primo item del backlog COMPLETATO**, in attesa di PR/revisione di Vlad.

## Task corrente
_(nessuno — item 1 chiuso. Alla prossima sveglia: `git fetch --all`, se il branch è stato
mergiato/chiuso da Vlad passare al secondo item del backlog — demo idle offline-catchup —
creando `auto/idle-offline-catchup`. Se il branch è ancora aperto e non toccato da Vlad, non
serve altro lavoro: aspettare la sua revisione.)_

## Sveglie consecutive senza progresso
0

## Blocchi aperti
- **PR non apribile dal sandbox**: nessun accesso `gh`/token GitHub in questa sessione al
  momento del lavoro. Il branch `auto/tutorial-action-gate` è pronto ma **va aperto come PR
  manualmente da Vlad** (o dalla prossima sveglia se nel frattempo l'accesso GitHub diventa
  disponibile — verificare prima di aprire una nuova PR se ne esiste già una).

## Log sveglie
- 2026-07-30 (sveglia 1): **Tutorial action-gated** — fatto.
  - `tutorial.js`: lo step "Assegna le Corse" ora ha `actionGate:'rides'`. Un poll (1s)
    confronta `ceOnb.rides()` col valore all'apertura dello step; se sale (= corsa
    DAVVERO completata, via `engine-rides.js`/`zero-to-hero.js`) avanza da solo. Bottone
    "Avanti" resta sempre manuale/cliccabile — nessun soft-lock possibile.
  - `index.html`: bump `tutorial.js?v=11`.
  - `HANDOFF.md`: aggiunta entry riassuntiva in cima a STATO ATTUALE.
  - **Verificato:** `node --check` su tutti i .js (0 errori) · boot headless
    (`python3 -m http.server` + chromium headless `/opt/pw-browsers/chromium-1194`) →
    pagina carica, unico errore JS presente è pre-esistente e scollegato dal mio cambio
    (`supabase-config.js:14`, CDN Supabase non raggiungibile in questo sandbox senza rete
    esterna — non è una regressione introdotta qui).
  - **NON verificato** (richiede Vlad in locale con login reale): il gate che si attiva
    durante un tutorial live vero (assegnare/completare una corsa mentre lo step è aperto),
    e l'aspetto visivo dell'hint aggiunto nel box del tutorial.
  - **Branch pushato**: sì. **PR aperta**: no (nessun accesso `gh`/GitHub token disponibile
    in questa finestra — vedi "Blocchi aperti"). Prossimo passo per Vlad: rivedere il diff
    su `auto/tutorial-action-gate` e aprire la PR (o chiedere alla routine di farlo se
    l'accesso GitHub torna disponibile).
