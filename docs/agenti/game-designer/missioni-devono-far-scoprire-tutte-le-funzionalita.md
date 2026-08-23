<!-- Scritto da Game Designer (gemini-3.7-flash) il 23/08/2026, 07:49:24.
     Contestato da Content Creator: 0 accuse, 0 rimaste in piedi.
     Giudicato da Chief Financial Officer: promosso 9/10.
     Nessuno lo ha ancora letto. -->

# Il Sistema di Missioni per Chauffeur Empire

## 1. La risposta in tre righe
Propongo un percorso lineare a catena di 18 missioni divise in 3 capitoli, visibile in una scheda laterale non bloccante con pulsante diretto alla schermata corretta. Ogni missione insegna una sola schermata e ripaga al 100% i primissimi clic di prova (lavaggio, carburante), ma copre solo il 50-60% delle spese operative successive (manutenzioni, assunzioni), premiando il giocatore con sblocchi di licenze e reputazione anziché stampare denaro facile.

---

## 2. Il ragionamento

### Perché una catena lineare e non un elenco aperto
In *Chauffeur Empire* tutte le funzionalità sono potenzialmente visibili, la mappa è aperta e il tempo scorre identico alla realtà (24 ore reali equivalgono a 24 ore di gioco). Se a un nuovo utente mostriamo una lista di 15 obiettivi aperti in parallelo, generiamo confusione e paura di spendere male i primi Euro.

La soluzione corretta è **un solo obiettivo attivo alla volta**:
1. Il giocatore vede solo il compito corrente in un riquadro fisso ma discreto nell'interfaccia, con il pulsante «Vai alla schermata».
2. Non blocchiamo lo schermo con finestre di spiegazione invasive o frecce lampeggianti: il giocatore deve compiere l'azione reale nel pannello (accettare una corsa, ordinare un tagliando, esaminare un contratto).
3. Una volta completato il compito, una scheda riassuntiva mostra cosa è stato appreso, assegna il rimborso e sblocca la missione successiva.

---

### La progressione in tre capitoli

```
[CAPITOLO 1: Da Autista a Padroncino] (Primi 20 minuti - Giorno 1)
   └── Corsa di prova rapida → Carburante → Lavaggio → Primo tagliando → Primo contratto
         ↓
[CAPITOLO 2: La Prima Flotta] (Giorni 2 - 4)
   └── Acquisto seconda auto → Assunzione primo dipendente → Turni notturni → Gestione usura
         ↓
[CAPITOLO 3: L'Impresa NCC] (Giorni 5 - 10)
   └── Licenze tratte lunghe → Contratti per alberghi/VIP → Accesso al mercato VTK
```

* **Capitolo 1 (L'avvio operativo):** Serve a far toccare con mano il ciclo base del veicolo. Per evitare che il giocatore debba aspettare 40 minuti a schermo vuoto al primo minuto di gioco, la prima corsa deve essere una «corsa di collaudo» breve (2 o 3 minuti reali di percorrenza su mappa).
* **Capitolo 2 (La delega):** Introduce l'autista assunto. Poiché il tempo è 1 a 1, l'autista serve proprio a far incassare l'azienda mentre il giocatore è offline durante la notte o il lavoro.
* **Capitolo 3 (I mercati avanzati):** Introduce la finanza interna (il token VTK) e i servizi di lusso solo quando il giocatore ha dimostrato di saper mantenere in attivo due veicoli.

---

### Come calibrare le ricompense senza rompere l'economia
Se le missioni regalano troppo denaro liquido, il giocatore smette di fare le corse e gioca solo per riscuotere i premi dei compiti. Se regalano troppo poco, ha paura di spendere per la manutenzione e rischia il blocco per bancarotta al giorno 2.

La regola economica da applicare è:
1. **Passi di puro collaudo (primi 10 minuti):** Rimborso del 100% del costo vivo (es. fai il primo pieno da 30 euro, la missione ti restituisce 30 euro). Questo elimina l'ansia da errore iniziale.
2. **Spese operative reali (dal tagliando in poi):** Rimborso parziale pari al 50% o 60% della spesa sostenuta, più punti Reputazione. Se un cambio gomme costa 120 euro, la missione restituisce 60 euro e 10 punti reputazione. Il resto della spesa deve essere coperto dagli incassi delle corse ordinarie.
3. **Tetto massimo di liquidità:** Nelle prime 24 ore di gioco reale, la somma totale di tutti gli Euro regalati dalle missioni non deve superare il valore netto di 2 o 3 corse standard.
4. **I veri premi sono le Licenze:** Il traguardo finale del Capitolo 1 non regala 2.000 euro, ma sblocca la *Licenza Tratte Aeroportuali*, che permette di visualizzare corse a tariffa chilometrica più alta. Il premio spinge a continuare a guidare, non a vivere di rendita.

---

## 3. Cosa serve per farlo

* **Chi lo fa:** Solo Vlad.
* **Struttura del codice e del database:**
  1. *Database Supabase (Postgres):* Una tabella statica `missioni_definizione` con i requisiti e i testi, e una tabella utente `missioni_giocatore` con i campi: `utente_id`, `missione_id`, `stato` (in_corso, completata, riscossa), `data_completamento`.
  2. *Controlli di avanzamento:* Funzioni scatenate direttamente dalle azioni di gioco (quando viene registrata una corsa completata o un tagliando nel garage, il database o il codice principale aggiorna lo stato della missione attiva).
  3. *Interfaccia:* Un widget richiudibile nell'angolo inferiore dello schermo con barra di avanzamento e una finestra di notifica dorata che appare al completamento del traguardo.
* **Tempo di sviluppo stimato:**
  * Struttura tabelle e logica di verifica eventi: circa 8 ore di lavoro.
  * Interfaccia visiva (pannello missione e finestra traguardo): circa 5 ore di lavoro.
  * Scrittura dei testi in italiano e calibrazione dei valori delle 18 missioni: circa 4 ore di lavoro.
  * **Totale stimato:** Circa 17 ore di lavoro complessive.
* **Costo in denaro:** 0 euro (sfrutta l'architettura Supabase e JavaScript già attiva nel progetto).

---

## 4. Come si vede se ha funzionato

Il sistema è tarato bene se produce questi due riscontri numerici:

1. **Completamento del Capitolo 1:** Almeno il 65% dei giocatori che completano la registrazione deve completare le 6 missioni del Capitolo 1 entro 24 ore reali.
2. **Rapporto di cassa al Giorno 3:** Tra i giocatori attivi al terzo giorno, il denaro totale ottenuto dalle ricompense delle missioni deve rappresentare tra il 15% e il 25% del loro incasso complessivo. Se supera il 35%, le missioni stanno drogando l'economia; se è sotto il 10%, i giocatori le stanno ignorando.

*Periodo di verifica:* Entro 14 giorni dall'ingresso dei primi 40 o 50 tester reali sul server.

---

## 5. Cosa ti manca per essere sicuro

1. **La durata minima della prima corsa:** Seguendo il tempo reale, quanto dura la corsa più corta attualmente presente nel codice? Se la prima corsa dura 30 o 45 minuti reali, il ritmo dei primi 10 minuti di gioco si interrompe subito. Serve sapere se è già prevista una prima commessa di prova da 2 minuti.
2. **I valori economici attuali del database:** Qual è il prezzo esatto di acquisto del veicolo base di partenza, il costo medio di un pieno di benzina e l'incasso netto medio di una corsa cittadina? Senza questi numeri estratti dai file di gioco, i rimborsi delle missioni restano stime percentuali che dovranno essere inserite manualmente nella tabella.
3. **Quali delle 11 funzioni spente verranno attivate per prime:** Delle 11 funzioni attualmente disattivate dietro interruttore, ce n'è qualcuna che riguarda i primi 3 giorni di vita dell'azienda (come il mercato dell'usato o la gestione turni autisti)? Le 18 missioni devono appoggiarsi solo sulle 10 funzioni già collaudate e attive.

---

## 6. Dove i miei specialisti non erano d'accordo

I tre pareri hanno fatto emergere tre disaccordi sostanziali:

1. **Rimborsare i costi al 100% con margine di profitto oppure solo al 50-60%:**
   * L'analisi di missione proponeva di rimborsare il costo vivo dell'azione più un margine del 15% o mezza corsa di guadagno, per togliere ogni paura di sbagliare.
   * L'analisi economica si opponeva categoricamente, sostenendo che regalare profitto su spese come tagliandi e assunzioni insegna al giocatore che l'officina è un bancomat anziché un centro di costo.
   * *La mia posizione:* Ho scelto la via economica rigida. Si rimborsa il 100% solo per le primissime azioni a costo quasi nullo (primo pieno, primo lavaggio). Dal tagliando in poi il rimborso è fissato al 50-60%: il giocatore deve abituarsi subito al fatto che per mantenere un'auto servono i soldi delle corse reali.

2. **Regalare Driver Coins (valuta a pagamento) nei traguardi:**
   * L'analisi di missione vietava l'erogazione di qualsiasi moneta a pagamento per non svalutarla.
   * L'analisi economica proponeva di regalare 1 o 2 Driver Coins al termine di interi capitoli per mostrare il negozio premium ai giocatori.
   * *La mia posizione:* Ho accolto la proposta economica: assegnare 1 singolo Driver Coin alla chiusura del Capitolo 1 (dopo giorni di gioco) non danneggia le future entrate reali di Vlad, ma serve a far scoprire l'esistenza del negozio a chi non ci avrebbe mai cliccato sopra.

3. **La velocità dei primi minuti rispetto al tempo reale:**
   * L'analisi di progressione richiedeva un traguardo ogni 90-120 secondi nei primi 15 minuti.
   * L'analisi economica e quella di missione ricordavano il vincolo del tempo reale a 24 ore.
   * *La mia posizione:* Non si può mantenere una cadenza di 2 minuti a missione se la corsa richiede tragitti reali su Mapbox. Per salvare il ritmo iniziale senza snaturare il gioco a tempo 1:1, ho stabilito che solo la prima corsa deve essere una tratta fittizia brevissima (di collaudo), lasciando che dalla seconda corsa in poi il tempo torni a scorrere al ritmo naturale delle 24 ore.