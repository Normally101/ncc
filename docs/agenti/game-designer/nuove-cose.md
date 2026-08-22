<!-- Scritto da Game Designer (gemini-3.7-flash) il 22/08/2026, 17:18:10.
     Giudicato da Chief Financial Officer: promosso 9/10.
     Nessuno lo ha ancora letto. -->

# Documento di Game Design: Grandi Eventi e Borsa del Subappalto

---

### 1. La risposta in tre righe

Propongo di introdurre i **Grandi Eventi a Calendario** (come settimane della moda, festival del cinema e vertici diplomatici) abbinati alla **Borsa del Subappalto tra Giocatori**.
I grandi giocatori vincono appalti istituzionali enormi che non possono coprire da soli, ed esternalizzano le singole tratte ai giocatori più piccoli tramite contratti protetti in gioco.
Questo crea un legame economico naturale tra principianti ed esperti, dà uno scopo strategico alle flotte e accende il mercato senza richiedere grafica 3D o logiche complesse in tempo reale.

---

### 2. Il ragionamento: perché questo e non altro

Nel noleggio con conducente di lusso, la differenza tra un semplice tassista e un'azienda da milioni di euro non è fare cento corse singole al giorno: sono i **grandi contratti di fornitura esclusiva**. Quando a Milano c'è la settimana della moda o a Ginevra un vertice diplomatico, nessun operatore possiede abbastanza berline nere per coprire la domanda. L'operatore principale vince il bando, fissa lo standard di servizio e subappalta il cinquanta o l'ottanta per cento delle tratte a padroncini e piccole rimesse.

Attualmente, nei gestionali sul browser con tempo reale (24 ore vere = 24 ore di gioco), i rischi principali sono due:
1. **Isolamento dei giocatori**: ciascuno gioca nel proprio recinto cliccando missioni generate dal computer, senza un vero motivo per interagire con gli altri se non tramite una classifica passiva.
2. **La trappola dei primi giorni**: il giocatore appena iscritto con una sola auto usata guadagna troppo lentamente e si stanca, oppure guadagna troppo in fretta e perde il gusto della scalata.

Questa meccanica risolve entrambi i problemi con una sola struttura logica:
- **Per chi comincia da zero**: offre corse garantite ad alta remunerazione e a basso rischio, pagate dai giocatori più ricchi che hanno bisogno di mezzi subito.
- **Per chi è già avanti (fase avanzata)**: trasforma il gioco da "clicca e manda l'auto" a pura gestione aziendale, logistica, calcolo del margine e selezione dei fornitori affidabili.
- **Per l'economia interna**: crea una circolazione organica di Euro di gioco e gettoni VTK tra utenti, riducendo l'accumulo statico di denaro nei conti dei veterani.

---

### 3. Come funziona la meccanica nel dettaglio

```
+-------------------------------------------------------------+
| 1. Supabase genera l'Evento (es. Festival Cinema, 4 giorni) |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 2. Asta del Bando: le Holding fanno offerte (Requisiti/Euro)|
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 3. Il Vincitore apre la "Borsa Subappalti" per 40 corse/die |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 4. Piccoli Operatori accettano le tratte con i propri mezzi  |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 5. Risoluzione: Pagamento Euro/VTK + Reputazione Istituzionale|
+-------------------------------------------------------------+
```

#### A. Il Calendario Eventi (Livello Mondo)
Il server (Supabase con un'attività programmata) genera a inizio settimana due o tre eventi territoriali sulla mappa di Mapbox.
- **Esempio**: *Settimana della Moda di Milano*, durata 4 giorni reali; richiede un volume complessivo stimato di 120 servizi di classe alta e 30 van di scorta.

#### B. La Gara d'Appalto (Livello Holding)
I giocatori che possiedono una sede nella provincia dell'evento e una reputazione minima possono presentare un'offerta entro 24 ore prima dell'inizio.
- L'assegnazione non si basa solo sul prezzo più basso, ma su un **Punteggio di Affidabilità**:
  `Punteggio = (Reputazione Aziendale per 0,4) + (Capienza Flotta Diretta per 0,3) + (Sconto sul Prezzo Base per 0,3)`
- Chi vince versa una cauzione a garanzia (in Euro di gioco o bloccando VTK in garanzia). Se il bando fallisce per troppi disservizi, la cauzione viene incamerata dal gioco (bruciando moneta per frenare l'inflazione).

#### C. La Borsa del Subappalto (Incontro tra Giocatori)
Il vincitore del bando non ha abbastanza autisti per coprire 150 corse in 4 giorni. Dalla schermata del bando può pubblicare lotti di corse sulla borsa pubblica:
- **Parametri impostati dall'appaltatore**: Categoria auto richiesta (es. solo berline nere immatricolate da meno di 3 anni di gioco), livello minimo dell'autista, compenso per singola tratta (es. 280 euro su una tariffa d'appalto incassata di 350 euro; il margine di 70 euro resta all'appaltatore per il rischio d'impresa).
- **Accettazione**: Il piccolo giocatore vede la tratta disponibile, assegna la propria auto e blocca l'incarico. L'auto risulterà impegnata per la durata reale della corsa (es. 1 ora e 20 minuti reali).

#### D. Risoluzione e Conseguenze
- **Completamento con successo**: L'autista porta a termine il servizio. Il piccolo giocatore riceve i suoi 280 euro subito; l'appaltatore riceve il pagamento dal committente (350 euro) e ottiene **Punti Influenza Politico-Istituzionale** (necessari per sbloccare concessioni aeroportuali e licenze speciali).
- **Inadempienza o Ritardo**: Se l'auto del subappaltatore si rompe o ha un'usura troppo alta (sotto il 30%), il cliente VIP protesta. L'appaltatore subisce una penalità sul punteggio finale del bando e può decidere di inserire quel piccolo giocatore in una lista nera privata.

---

### 4. Tabella dei Parametri di Bilanciamento

Tutti i valori numerici sotto indicati sono ipotesi di partenza da calibrare durante i primi test con utenti:

| Variabile | Valore Base (Ipotesi) | Minimo | Massimo | Note di Bilanciamento |
| :--- | :--- | :--- | :--- | :--- |
| **Durata Evento Minore** | 48 ore reali | 24 ore | 72 ore | Per eventi locali (fiere, concerti di gala). |
| **Durata Evento Maggiore** | 96 ore reali | 72 ore | 168 ore | Per grandi eventi internazionali (Fashion Week, G7). |
| **Cauzione Richiesta Bando** | 15.000 euro | 5.000 euro | 100.000 euro | Percentuale sul valore totale del bando (stimata al 15%). |
| **Margine Medio Appaltatore** | 20% della tariffa | 5% | 40% | Regolato liberamente dal giocatore vincitore. |
| **Penale per Corsa Fallita** | 2,5 volte la tariffa | 1,5 volte | 4,0 volte | Detratta dalla cauzione versata dall'appaltatore. |
| **Commissione di Borsa** | 3% del compenso | 1% | 5% | Trattenuta dal sistema in Euro (meccanismo per drenare moneta). |

---

### 5. Cosa serve per farlo

Sapendo che c'è solo Vlad a lavorare al codice:

1. **Denaro**: **Zero euro di costi esterni.** Non servono librerie a pagamento, servizi cloud aggiuntivi o licenze terze. Supabase e Mapbox gestiscono già la base dati e la mappa.
2. **Tempo stimato di lavoro (solo Vlad)**: **Circa 28–36 ore lavorative totali**, distribuibili in due o tre settimane senza interrompere la caccia ai bug esistenti:
   - *Database Supabase (6-8 ore)*: 3 nuove tabelle relazionali (`eventi_mondo`, `bandi_gara`, `tratte_subappalto`), relative chiavi esterne e una funzione SQL per gestire il blocco della cauzione e l'accredito dei pagamenti in modo sicuro.
   - *Logica di Backend / Cron (4-6 ore)*: 1 procedura schedulata in Postgres per far comparire gli eventi e chiudere i bandi scaduti.
   - *Interfaccia Utente HTML/CSS/JS (12-14 ore)*:
     - Icona/marker speciale sulla mappa di Mapbox in corrispondenza della città dell'evento.
     - Modale "Bacheca Evento" con stato della gara d'appalto.
     - Modale "Borsa Subappalti" (elenco filtrabile per categoria auto e compenso).
   - *Scrittura Test Automatici (6-8 ore)*: ~30 test unitari sui casi limite (annullamento corsa, mancanza di fondi per la cauzione, auto non conforme).

---

### 6. Come si vede se ha funzionato

Per verificare l'efficacia della meccanica senza impressioni soggettive, si monitorano tre fatti precisi nel database entro **30 giorni dal primo test con almeno 15-20 giocatori attivi**:

1. **Tasso di Adozione del Subappalto**: Almeno il **40% delle tratte totali** legate a un Grande Evento deve essere completato da giocatori diversi dal vincitore del bando. Se la percentuale è sotto il 20%, significa che il margine per i piccoli è troppo basso o che i bandi sono troppo piccoli.
2. **Riduzione dell'Abbandono nei primi 7 giorni**: I giocatori registrati che accettano almeno due corse in subappalto devono mostrare un tasso di ritorno al settimo giorno superiore di almeno **15 punti percentuali** rispetto a chi fa solo corse standard generate dal gioco.
3. **Assenza di Moneta Infinita (Stabilità)**: La somma totale degli Euro di gioco generati dall'evento meno le cauzioni trattenute e le commissioni di borsa (3%) non deve superare il tetto previsto dal bilanciamento iniziale (nessun raddoppio anomalo della massa monetaria circolante).

Se entro il primo mese questi tre fatti non si verificano o non sono misurabili per mancanza di giocatori, la funzione va mantenuta spenta dietro il suo interruttore fino alla fase di marketing.

---

### 7. Cosa mi manca per essere sicuro (Dati e Domande Aperte)

Questa sezione elenca ciò che oggi non possiamo sapere con certezza prima di aver visto i dati reali:

1. **La composizione delle 11 funzioni attualmente spente**: Non conosco l'elenco esatto delle 11 funzioni ancora in attesa di verifica. Se una di queste riguarda già una "bacheca contratti" o un "sistema di corporazioni/società", questa proposta va fusa con quel codice esistente per evitare duplicazioni.
2. **La velocità reale di accumulo degli Euro**: Non avendo lo storico di partite complete di giocatori umani sul lungo periodo, i valori di 15.000 euro per la cauzione e 280 euro per le corse sono *stime ipotetiche*. Se l'economia attuale del gioco è tarata su ordini di grandezza diversi (ad esempio se un'auto costa 80.000 euro e una corsa normale ne rende 40), i numeri del bando andranno riscalati proporzionalmente.
3. **Comportamento antisociale (Griefing)**: Non sappiamo se un giocatore potrebbe iscriversi a un subappalto solo per far scadere il tempo e far perdere la cauzione a un rivale. *Contromisura provvisoria pensata*: se un giocatore accetta e non invia l'auto entro 15 minuti reali, la corsa torna istantaneamente sulla borsa e il giocatore subisce una sospensione di 12 ore dall'accesso alla borsa. Serve verificare nei test se questa finestra di 15 minuti è sufficiente.