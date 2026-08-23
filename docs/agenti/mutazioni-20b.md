# Mutazioni — test/events/nemesis-sync.test.js

File sotto osservazione: `test/events/nemesis-sync.test.js`
File di produzione messo alla prova: `nemesis.js` (`_nemesisBribeVip`)

Stato: **completato**

## Esito

- **Baseline**: `node --test test/events/nemesis-sync.test.js` → 5/5 verdi.
- **Mutazione applicata** (una sola cosa, in `nemesis.js`, dentro `_nemesisBribeVip`):
  raddoppiato l'importo addebitato per la corruzione —

  ```diff
  - const bribe = Math.floor(5000 + (nem.anger / 100) * 45000);
  + const bribe = Math.floor((5000 + (nem.anger / 100) * 45000) * 2);
  ```

  (la riga gemella di `_renderNemesisCard`, variabile `bribeAmt`, non toccata).
- **Il test se n'è accorto? SÌ — rosso immediato**: 2 test falliti su 5.
  - «corruzione VIP scala denaro e sincronizza» → `54000 !== 77000`: con la
    corruzione raddoppiata (23000 → 46000) il saldo scendeva a 54000 invece
    che a 77000.
  - «corruzione VIP con rabbia alta» → `18000 !== 59000`: corruzione
    41000 → 82000, saldo finale 18000 invece di 59000.
  - I restanti 3 restavano verdi come previsto: con fondi insufficienti la
    guardia interna a `CE_money.spend` blocca comunque l'addebito (test 3),
    e i percorsi senza spesa non passano dall'importo (test 4 e 5). Quindi la
    copertura sul valore dell'addebito c'è davvero: solo i due casi di spesa
    effettiva vedono l'importo.
- **Ripristino**: `git checkout -- nemesis.js` non era nella lista bianca dei
  comandi disponibili, quindi la riga originale è stata ripristinata con una
  modifica esatta inversa; `git diff nemesis.js` vuoto e `git status` pulito
  (solo questo rapporto non tracciato).
- **Post-ripristino**: test torna verde 5/5.

Nessun test modificato: quello esistente vede già la mutazione.
