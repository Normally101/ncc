# Rapporto mutazioni — gruppo 10 (daily-reward, doppio conteggio, engine-cassa)

Controllo che i test di questo gruppo diventino rossi quando il codice di produzione
che dovrebbero vedere viene rotto (mutazione temporanea, poi ripristinata).

## File in coda

- test/economy/daily-reward.test.js — controllato il 23/08
- test/economy/doppio-conteggio-infra-turism.test.js — controllato il 23/08
- test/economy/engine-cassa.test.js — controllato il 23/08

## Esiti

### test/economy/daily-reward.test.js → engine-daily.js `_checkDailyReward`

GAP CHIUSO: i tier intermedi della tabella `DAILY_REWARDS` (giorni 2, 3, 5, 14, 30)
non erano coperti da nessun test; aggiunti 5 test (uno per tier) che fissano l'importo
esatto in cash e il delta di Driver Coin verso `ServerState.addDriverCoins`.

Mutazioni provate (una alla volta, su `engine-daily.js`, sempre ripristinate):

1. Raddoppiata la riga `{ days: 3, cash: 1500, tc: 1 }` → prima della cura: NESSUN test
   rosso (mutazione invisibile); dopo: rosso il test «tier giorno 3».
2. Raddoppiate le righe giorni 2, 5, 14, 30 → rossi i quattro nuovi test corrispondenti,
   i cinque test preesistenti restano verdi.
3. Guardia dei 20h disattivata (`if (elapsed < 20h)` → `if (false)`) per far passare
   due volte lo stesso claim → rosso il test preesistente «un secondo claim nella stessa
   sessione NON duplica» (già sorvegliata).
4. Sincronizzazioni col server: già sorvegliate dai test esistenti — il syncCash del
   cash dal test «REGRESSIONE (fix stabilizzazione 10 agosto)», l'addDriverCoins con
   delta esatto dal test «claim al giorno 7» (`deepEqual(calls, [5])`).

Nota sui valori attesi oltre il giorno 7: il codice applica `extraMult`
(+10% ogni 7 giorni oltre il 7°), quindi streak 14 paga 10000 × 1.1 = 11000 e
streak 30 paga 25000 × 1.3 = 32500; i test fissano questi totali, quindi una
mutazione del moltiplicatore diventa anch'essa visibile.

### test/economy/doppio-conteggio-infra-turism.test.js → infrastructure.js `_infraBuyDepot`

Mutazione provata: riportata `CE_money.spend(cost)` al posto di
`CE_money.addebitatoDalServer(cost)` dopo la RPC `rpc_buy_fuel_depot` (il doppio
conteggio storico) → rosso il test «acquisto riuscito: il saldo locale si muove UNA
volta sola e nessun syncCash parte» (`syncedCash` = [200000] invece di []).
Già ben sorvegliata, nessun test aggiunto.

### test/economy/engine-cassa.test.js → engine.js `payToRepairCar`

Mutazione provata: reintrodotta la scorciatoia Kasko gratis in cima alla funzione
(`if (hasInvestment('inv_kasko')) { car.condition = 100; return; }`) → rossi due test:
«con la Kasko la riparazione ordinaria si paga, e al prezzo mostrato» (nessun addebito
al server) e «con la Kasko e senza soldi la riparazione non avviene» (condition 100
invece di 30). Già ben sorvegliata, nessun test aggiunto.

## Conclusione

Tutte le produzioni sono state ripristinate dopo ogni mutazione (`git diff` pulito,
solo il file di test è cambiato). Il gruppo ora cresce di 5 test (1753 → 1758) e la
mutazione un tempo invisibile (raddoppio di un tier intermedio) è rossa.
