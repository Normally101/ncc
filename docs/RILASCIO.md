# Come si pubblica — Chauffeur Empire

> Vlad, 30/08/2026: «quando faremo i grossi updates dovremmo verificare tutto
> prima, perché rischiamo di rompere qualcosa. Devi ragionare come le grandi
> case di videogiochi e muoverci come loro.»

Le grandi case non pubblicano perché qualcuno *si ricorda* di aver controllato.
Pubblicano perché una macchina ha detto sì e una persona ha guardato il gioco
con i propri occhi. Questo documento è quella procedura, in due parti: quello
che fa la macchina e quello che deve fare una persona.

---

## Parte 1 — La macchina

```bash
npm run preflight            # prima di spingere
```

Sei controlli, in ordine di quanto fanno male quando saltano:

| # | Controlla | Perché è in lista |
|---|-----------|-------------------|
| 1 | Albero pulito, ramo `main`, quanti commit escono | `main` pubblica da sola: sapere *cosa* esce è il minimo |
| 2 | `node --check` su ogni `.js` di radice | in questo progetto un solo `SyntaxError` fa saltare **l'intero file**, non una riga |
| 3 | Ogni file citato da `index.html` esiste | un `src` sbagliato è una schermata bianca in produzione |
| 4 | **Cache-bust**: ogni `.js` modificato ha il `?v=` cambiato | il difetto più silenzioso del progetto: il codice è giusto, il browser serve la copia vecchia, e sembra che la correzione non funzioni |
| 5 | Nessuna chiave segreta nei commit in uscita | una chiave in un commit resta nella storia anche se cancelli il file |
| 6 | La suite intera | 2352 test, ~90 secondi |

Dopo che Vercel ha finito:

```bash
npm run preflight:prod       # verifica il sito vero
```

Confronta le versioni servite col repository (se il sito serve ancora le
vecchie, il deploy non è finito) e rifà il **leak check**: `.sql`, `.md`,
`package.json` devono dare **404**. Nell'agosto 2026 un `git push main:gh-pages`
ha pubblicato l'intero repository: da allora `.vercelignore` tiene fuori i
sorgenti, e questo controllo verifica che li tenga ancora fuori.

> Il controllo 4 non è teorico: la prima volta che è girato ha trovato
> `knowledge-book.js` modificato e non bumpato, in un commit **già pubblicato**.

---

## Parte 2 — La persona

Nessuna di queste la può fare uno script.

1. **Apri il gioco con la console aperta.** Zero errori rossi. La console pulita
   è il controllo che trova le cose a cui non avevi pensato.
2. **Percorri il flusso che hai toccato, a clic veri.** Non la funzione dalla
   console: il bottone. Il mercato P2P era completo e sicuro da otto giorni, e
   non funzionava perché **nessun bottone chiamava la funzione giusta**. Nessun
   test lo vedeva, un clic sì.
3. **Percorri un flusso che NON hai toccato** ma che passa dalle stesse parti:
   se hai lavorato sulle email, apri anche la flotta.
4. **Guarda con gli occhi di chi comincia.** Molte schede si comportano in modo
   diverso durante il tutorial (`ceOnb.phase() === 'survival'` rimanda tutto a
   `corse`): una scheda nuova può sembrare rotta solo perché sei in tutorial.

---

## Parte 3 — I "grossi update"

Un update grande è quello che tocca **più sistemi insieme** o **cambia dati che
esistono già**. Lì l'ordine conta più della velocità.

**Una cosa per volta, con un test che la difende.** È il metodo che Vlad ha
chiesto il 29/08 («è essenziale lavorare in modo che non roviniamo niente») ed è
lo stesso delle grandi case: un difetto, la sua correzione, il test che impedisce
che torni, la suite intera, poi il prossimo. Cinque correzioni insieme e un
rosso, e non sai quale.

**Il test deve poter fallire.** Dopo averlo scritto, rompi apposta il codice che
difende e guarda se diventa rosso (*mutation check*). Un test che passa anche
sul codice rotto non difende niente. In questa sessione: rimettendo il nome nel
client e togliendo l'escape, due test del Network sono diventati rossi — allora
valgono.

**Le migrazioni del database sono la parte che non torna indietro.** Un `git
revert` più un redeploy annulla il codice in due minuti; una colonna cancellata
no. Quindi:
- prima si aggiunge (tabelle e colonne nuove non rompono chi ha il codice
  vecchio), poi si usa, e solo molto dopo si toglie il vecchio;
- una migrazione che *modifica* dati esistenti si prova su una copia;
- il file `.sql` resta nel repository con scritto in testa se è stato applicato
  e quando. Da quando i pagamenti sono in live, ogni migrazione tocca un
  database con soldi veri sopra.

**Interruttori.** Una funzione grossa e nuova entra spenta e si accende quando è
verificata (`config.js` → `FEATURES`, `window.tabSpenta`). Acceso vuol dire
*verificato*, non *scritto*.

**Sapere come si torna indietro, prima di partire.** Per il codice:
`git revert <commit> && git push`. Per il database: la migrazione inversa
scritta *insieme* a quella diretta, non dopo che serve.

---

## In breve

```bash
npm run preflight        # la macchina dice sì
git push origin main     # Vercel pubblica da sola
npm run preflight:prod   # il sito vero è quello che credi
# poi: browser aperto, console aperta, clic veri
```
