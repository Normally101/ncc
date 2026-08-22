<!-- Scritto da Game Designer (gemini-3.7-flash) il 22/08/2026, 22:22:52.
     Giudicato da Chief Financial Officer: promosso 9/10.
     Nessuno lo ha ancora letto. -->

# Riprogettazione del Sistema Missioni: Guida Operativa Senza Blocchi

## 1. La risposta in tre righe

Eliminiamo la proprietà finta `gs.unlockedFeatures` sia dal codice che dai test, trasformando le missioni in un manuale di bordo che guida il giocatore attraverso i sistemi senza mai sbarrargli l'accesso ai tab. Le ricompense monetarie vengono agganciate al guadagno di una corsa media iniziale (160 euro), partendo da frazioni di corsa (80 euro) fino a premi aziendali da 50 corse (8.000 euro). I 21 sistemi vengono presentati in quattro capitoli progressivi: prima i 10 sistemi già attivi e testati per rendere l'azienda autonoma, poi gli 11 sistemi avanzati non appena verranno accesi.

---

## 2. Il ragionamento

### A. Cosa fare delle 100 promesse finte
La presenza di `gs.unlockedFeatures` crea un debito invisibile: promette al giocatore uno sblocco che non esiste e costringe la suite di test a verificare condizioni fittizie.

1. **Rimozione strutturale:** Rimuoviamo il campo `unlockedFeatures` dall'oggetto delle missioni e ripuliamo i test automatici che lo controllano.
2. **Nessun blocco dell'interfaccia:** Tutti i tab del gioco rimangono cliccabili e visibili fin dal primo secondo. Se un giocatore curioso apre subito la schermata della banca o del mercato, deve poterla esplorare, anche se troverà saldi a zero o moduli non ancora compilati.
3. **Trasformazione in "Stato di Apprendimento":** Nella scheda dell'azienda sostituiamo l'idea dello sblocco con un registro visivo intitolato *Certificazioni Aziendali* o *Sistemi Acquisiti*. Completare una missione accende una semplice spunta verde accanto al nome del sistema (per esempio: "Gestione Manutenzione: Convalidata"). Questo dà gratificazione visiva senza limitare la libertà di navigazione.

---

### B. Calibrazione delle ricompense come multiplo della corsa
Vlad ha stabilito che la ricompensa di ogni missione deve essere un multiplo del valore di una corsa, non una percentuale del costo del prossimo acquisto.

* **Valore base di riferimento:** Una corsa iniziale rende tra 70 e 250 euro. Fissiamo il valore medio di una corsa iniziale a **160 euro** `[STIMA: media aritmetica esatta tra 70 e 250 euro]`.
* **Regola di scala:** I premi non devono sostituire il lavoro dei veicoli, ma rimborsare il tempo speso per capire l'interfaccia e coprire i primi costi vivi (benzina, stipendio iniziale, tasse di registrazione).

```
Fase di Gioco       | Moltiplicatore Corsa | Ricompensa in Euro | Scopo Economico
--------------------|----------------------|--------------------|----------------------------------------
Tutorial Interfaccia| 0,5x                 | 80 euro            | Rimborso click ed esplorazione tab
Prima Operazione    | 1,0x – 2,0x          | 160 – 320 euro     | Copertura carburante e spese di avvio
Primi Traguardi     | 3,0x – 5,0x          | 480 – 800 euro     | Cuscinetto per manutenzione e stipendi
Espansione Flotta   | 10,0x – 15,0x        | 1.600 – 2.400 euro | Contributo rata leasing o seconda auto
Fine Capitolo       | 30,0x – 50,0x        | 4.800 – 8.000 euro | Premio di completamento macro-area
```

#### Come gestire la partenza da 0 euro con la prima auto a 35.000 euro
Se il giocatore parte con zero euro e la prima auto costa 35.000 euro, non possiamo regalargli 35.000 euro di missioni tutorial: romperebbe l'illusione gestionale e trasformerebbe l'inizio del gioco in un bancomat da cliccare.

La soluzione consiste nel far usare alle prime 3 missioni gli strumenti finanziari reali del settore NCC:
* **Missione 1 (Identità):** Registra il nome dell'agenzia e compila il profilo. Ricompensa: 80 euro (0,5 corse).
* **Missione 2 (Credito):** Apri il tab Banca e richiedi il *Fido di Avvio Impresa* o stipula il primo *Contratto di Leasing* per la vettura da 35.000 euro (anticipo zero, prima rata posticipata a 30 giorni di gioco). Ricompensa: 160 euro (1 corsa).
* **Missione 3 (Primo Mezzo):** Firma il contratto del veicolo nel Garage. Ricompensa: 320 euro (2 corse) per fare il primo pieno di carburante.

In questo modo il giocatore entra nel loop reale: ha un debito sostenibile, un'auto funzionante e una piccola riserva di cassa per operare.

---

### C. Sequenza dei 21 sistemi di gioco

Organizziamo le 168 missioni lungo 4 capitoli logici. I primi due capitoli coprono i 10 sistemi già attivi; i capitoli 3 e 4 accolgono gli 11 sistemi in arrivo.

```
Capitolo | Sistemi Presentati                  | Stato Tecnico  | Obiettivo del Giocatore
---------|--------------------------------------|----------------|--------------------------------------
Cap. 1   | Sistemi 1–5: Meccanica di base       | 10 Attivi      | Mettere in strada la prima vettura
Cap. 2   | Sistemi 6–10: Gestione d'Impresa     | 10 Attivi      | Portare l'azienda in profitto stabile
Cap. 3   | Sistemi 11–16: Struttura e Mercati   | 11 da Attivare | Creare la sede e gestire i token VTK
Cap. 4   | Sistemi 17–21: Influenza e Supremazia| 11 da Attivare | Dominare il mercato multigiocatore
```

#### Capitolo 1: La Prima Corsa (Sistemi attivi 1–5)
1. **Flotta e Garage:** Esplorare il concessionario, scegliere la prima auto, capire le categorie di lusso.
2. **Autisti e Contratti:** Assumere il primo autista, comprenderne il livello, il salario orario e il turno di riposo.
3. **Mappa e Assegnazione:** Aprire la mappa Mapbox, individuare le richieste di corsa, assegnare l'auto e far partire il tragitto in tempo reale.
4. **Carburante e Consumi:** Monitorare il livello del serbatoio, effettuare il rifornimento prima che l'auto resti a secco.
5. **Manutenzione e Usura:** Controllare l'usura di pneumatici e motore dopo le prime corse, eseguire il primo tagliando in officina.

#### Capitolo 2: Consolidamento Finanziario (Sistemi attivi 6–10)
6. **Contabilità e Flusso di Cassa:** Leggere il bilancio giornaliero (costi fissi contro ricavi delle corse).
7. **Clientela e Reputazione:** Soddisfare i requisiti dei clienti importanti per aumentare il punteggio aziendale.
8. **Banca e Prestiti:** Rinegoziare il fido, estinguere rate o richiedere linee di credito per la seconda vettura.
9. **Contratti Aziendali:** Firmare accordi per servizi ricorrenti (es. trasferimenti hotel-aeroporto ad orari fissi).
10. **Mercato dell'Usato:** Valutare la svalutazione dei mezzi usati e vendere o sostituire un'auto della flotta.

#### Capitolo 3: Espansione Operativa (Sistemi da attivare 11–16)
11. **Sedi e Immobili:** Acquistare o affittare il primo ufficio fisico e parcheggio privato.
12. **Licenze e Permessi:** Ottenere autorizzazioni comunali per operare in zone a traffico limitato o corsie preferenziali.
13. **Marketing e Pubblicità:** Lanciare campagne per attirare clienti di fascia altissima.
14. **Formazione Autisti:** Corsi di guida difensiva, bon ton e lingue straniere per aumentare il gradimento dei VIP.
15. **Protezione e Sicurezza VIP:** Aggiungere veicoli blindati e personale di scorta per incarichi ad alto rischio.
16. **Mercato Token VTK:** Accedere al mercato interno dei token, piazzare ordini di acquisto e vendita con altri giocatori.

#### Capitolo 4: Il Grande Impero (Sistemi da attivare 17–21)
17. **Società Holding:** Creare la capogruppo per ottimizzare tasse e dividendi della flotta.
18. **Influenza Politica:** Partecipare a bandi pubblici e tessere relazioni istituzionali per grandi appalti.
19. **Grandi Eventi:** Gestire la logistica di vertici internazionali, festival del cinema e settimane della moda.
20. **Consorzi e Alleanze:** Fondare una rete di imprese con altri giocatori per coprire corse simultanee.
21. **Intermodalità di Lusso:** Integrare la flotta su gomma con prenotazioni di jet privati ed elicotteri.

---

## 3. Cosa serve per farlo

Tutto il lavoro è calibrato per essere svolto esclusivamente da Vlad, senza budget esterno e senza nuove librerie.

* **Fase 1: Pulizia del codice e dei test (1 giornata di lavoro - circa 7 ore)**
  * Cercare nel repository `gs.unlockedFeatures` e rimuovere ogni riferimento.
  * Aggiornare gli ~1.100 test automatici per verificare che controllino solo il completamento dell'obiettivo e l'accredito dei fondi, non la variabile di sblocco.
  * Costo: 0 euro.

* **Fase 2: Ricalibrazione parametri e testi delle 168 missioni (1 giornata di lavoro - circa 8 ore)**
  * Modificare il file dati delle missioni applicando i moltiplicatori in euro basati sui 160 euro a corsa.
  * Riscrivere i testi descrittivi in modo che indichino al giocatore dove cliccare nell'interfaccia aperta, eliminando frasi come *"Sblocca la schermata garage"*.
  * Costo: 0 euro.

* **Fase 3: Collaudo manuale del flusso iniziale (mezza giornata - circa 4 ore)**
  * Eseguire una sessione di test partendo da account vergine (0 euro in cassa) e verificare che le prime 5 missioni guidino all'acquisto del mezzo in leasing, all'assegnazione della prima corsa e al primo rifornimento senza blocchi logici.
  * Costo: 0 euro.

* **Totale impegno:** circa 19 ore di lavoro distribuite su 3 giorni. Spesa finanziaria: **0 euro**.

---

## 4. Come si vede se ha funzionato

Possiamo misurare l'efficacia di questa riprogettazione osservando tre indicatori specifici:

1. **Tasso di completamento del primo ciclo:** Entro 14 giorni dall'apertura delle registrazioni ai primi 50 tester, almeno il **75% dei giocatori registrati** che completa la Missione 1 deve completare con successo la Missione 5 (prima corsa completata e primo tagliando).
2. **Assenza di segnalazioni di blocco interfaccia:** Zero segnalazioni di bug o lamentele nei canali di feedback relative a *"pulsante non funzionante"* o *"non trovo come sbloccare la sezione X"*.
3. **Autonomia economica iniziale:** Nessun account di prova deve andare in bancarotta irreversibile prima di aver completato le prime 10 corse, grazie alla riserva fornita dalle missioni calibrate a multipli di corsa.

---

## 5. Cosa ti manca per essere sicuro

1. **Meccanismo di partenza da 0 euro:** Il codice attuale prevede già uno strumento di debito iniziale (leasing o fido bancario) attivo al minuto zero, oppure il database assegna un saldo iniziale temporaneo che Vlad intende azzerare?
2. **Nomi esatti dei 21 moduli:** Qual è l'elenco esatto dei nomi dei 10 sistemi attualmente attivi nei file JavaScript rispetto agli 11 disattivati, per allineare al millimetro i requisiti di completamento con i trigger già scritti nel database?
3. **Persistenza delle missioni:** Le 168 missioni sono salvate come righe su una tabella Postgres di Supabase (con stato per utente) o sono un file di configurazione statico in JavaScript lato client con il solo ID memorizzato nel profilo utente?