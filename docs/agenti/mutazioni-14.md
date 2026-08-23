# Campagna mutazioni — gruppo economy/loans + p2p-sync + p2p-render-sync (sessione 14)

Obiettivo: verificare che i test di `test/economy/loans.test.js`,
`test/economy/p2p-sync.test.js` e `test/economy/p2p-render-sync.test.js`
sappiano diventare ROSSI. Una mutazione per volta sui file di produzione,
verifica con `node --test` sul gruppo, ripristino immediato dopo ogni prova.

Esito: **8 mutazioni su 9 viste dai test esistenti; 1 non vista → aggiunto
1 test nuovo** in `test/economy/loans.test.js`.

| # | File mutato | Mutazione | Esito |
|---|-------------|-----------|-------|
| 1 | engine-finance.js (`takeLoan`) | accredito raddoppiato: `earn(amount * 2)` | ROSSO — 3 test loans (cash 101000 ≠ 51000) |
| 2 | money.js (`earn`) | sincronizzazione col server rimossa (niente `_sincronizzaCassa()`) | ROSSO — test REGRESSIONE loans: syncCash `[]` invece di `[51000]` |
| 3 | money.js (`spend`) | guardia fondi insufficienti disattivata (`if (false)`) | ROSSO — test "ripagare senza fondi sufficienti": cash −49900 invece di 100 |
| 4 | engine-finance.js (`repayLoan`) | addebito passato due volte (secondo `spend` duplicato) | **VERDE — nessun test lo vedeva** → aggiunto test "il rimborso scala il capitale una volta sola anche con cash abbondante" (rosso sotto mutazione: 150000 ≠ 200000, verde su produzione) |
| 5 | p2p-market.js (`buyP2PCar`) | importo addebitatoDalServer raddoppiato | ROSSO — 2 test buyP2PCar (−10000 ≠ 20000) |
| 6 | p2p-market.js (`buyP2PCar`) | `addebitatoDalServer` sostituito da `spend` (risincronizza col server) | ROSSO — 3 test, incluso l'eco Realtime anti-doppio-conteggio |
| 7 | p2p-market.js (`buyP2PCar`) | guardia fondi insufficienti disattivata | ROSSO — test "fondi insufficienti non chiama la RPC né syncCash" |
| 8 | p2p-render.js (`contributeConsorzio`) | importo addebitatoDalServer raddoppiato | ROSSO — test saldo locale (30000 ≠ 40000) |
| 9 | p2p-render.js (`contributeConsorzio`) | `addebitatoDalServer` sostituito da `spend` (risincronizza) | ROSSO — 2 test, incluso l'eco Realtime |

Note sulla mutazione 4 (l'unica sfuggita): i test preesistenti ripagano sempre
con cassa appena sufficiente al capitale, quindi il secondo addebito errato
veniva assorbito dalla guardia fondi insufficienti e restava invisibile.
Il nuovo test replica il rimborso con cassa abbondante (200.000€), dove un
doppio addebito sarebbe passabile.

Tutte le mutazioni sono state annullate subito dopo la verifica: nessuna
modifica residua ai file di produzione (`git status` pulito a parte il test
aggiunto).
