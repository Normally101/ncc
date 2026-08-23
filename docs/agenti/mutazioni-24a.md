# Rapporto mutazione 24a

File sotto osservazione: test/funzioni/infrastrutture.test.js

Stato: completata

## Mutazione applicata

- **File di produzione colpito:** `infrastructure.js`
- **Cosa:** raddoppiato l'importo addebitato all'acquisto di un deposito carburante,
  dentro `_infraBuyDepot`:
  `CE_money.addebitatoDalServer(cost)` → `CE_money.addebitatoDalServer(cost * 2)`
  (l'acquisto da 300.000€ ne addebitava 600.000).

## Esito

**Il test se n'è accorto: SÌ, rosso immediatamente.**

Fallimento principale (`node --test test/funzioni/infrastrutture.test.js`):

- Test «acquisto valido scala 300.000€, chiama RPC e notifica successo»
  (`describe 'Acquisto depositi (_infraBuyDepot)'`):
  atteso `gs.cash === 200000` (da 500.000 meno 300.000), ottenuto
  `-100000` (500.000 meno 600.000) → AssertionError.
- Anche i test d'integrazione UI sull'acquisto (cassa attesa 300.000 da
  600.000) falliscono con la stessa radice: l'addebito raddoppiato viene
  rilevato dall'asserzione esatta sul saldo.

Conclusione: il file di test NON è un falso verde su questo punto — un
addebito errato in `_infraBuyDepot` lo fa diventare rosso.

## Ripristino

- Mutazione rimossa (riga riportata al valore originale).
- Verificato con `git status` / `git diff`: nessuna modifica ai file di
  produzione nel commit; resta solo questo rapporto (e, se serve, il file di
  test intatto — non è stato necessario toccarlo perché la mutazione è stata
  vista).
