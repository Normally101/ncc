# Note ricerca test instabile

## Stato recupero
- Il ramo respinto `gigi/c-e-un-test-che-a-volte-fallisce-e-a-vol-08221834` NON esiste piu'
  nel repository (`git log --all` mostra un solo commit). Recupero impossibile:
  rifaccio il lavoro da capo.
- Motivo del respingo: test non cresciuti (1704 -> 1704), manca la prova che il
  bug fosse reale. In questa sessione devo: (1) trovare il test instabile,
  (2) togliere la causa, (3) lasciare un test NUOVO che dimostri il problema
  (rosso sul codice vecchio).

## Sospetti (da verificare uno per uno, in ordine)
1. test/azioni/*.test.js: uso di Date/Date.now/Math.random/setTimeout — IN CORSO
2. attese a tempo invece che su fatti
3. stato globale condiviso tra test vicini (ordine di esecuzione)
4. dipendenza dall'ordine di Object.keys / Set
