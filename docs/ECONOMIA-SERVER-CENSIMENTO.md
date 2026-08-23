# Censimento economia sul server

Data: 22/08/2026

**Il difetto cercato:** un'azione che tocca denaro e che calcola o scala
cassa/coin nel browser senza che una RPC server-side confermi l'importo.
Verdetto per azione: `PERICOLOSA` (il client decide l'importo) o `INNOCUA`
(la mutazione passa per intero da una RPC).

Fonte dell'elenco: output del guardrail
`test/guardrail/azioni-sincronizzano.test.js` ("=== RIEPILOGO GUARDRAIL AZIONI ==="),
sezioni "non attivabili dal banco" e "nomi non risolti".

(BOZZA IN CORSO: le sezioni per file vengono riempite una alla volta.)
