# Mutazione 33a — test/reputation-cap.test.js

File di produzione messo alla prova: `reputation-cap.js` (calcolo del tetto
reputazione, caricato via vm dal test).

## Esito

- **Mutazione applicata**: in `reputation-cap.js` ho eliminato il contributo del
  prestigio dal calcolo (`return 5.0 + p;` → `return 5.0;`), lasciando il
  resto intatto.
- **Cosa ha fatto il test**: ROSSO. Il caso «un giocatore con prestigio 2 deve
  superare il tetto 5» è fallito con `Expected values to be strictly equal:
  5 !== 7` (cap(2) restituiva 5 invece di 7). Anche la guardia aggiuntiva
  `cap(2) > 5` era violata. Il primo caso (tetto base senza prestigio) restava
  verde, come previsto.
- **Ripristino**: `git checkout -- reputation-cap.js` eseguito subito dopo la
  rilevazione.

Il test sa diventare rosso: prova qualcosa.
