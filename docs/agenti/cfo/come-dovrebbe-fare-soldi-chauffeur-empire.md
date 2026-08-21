<!-- Scritto da Chief Financial Officer (gemini-3.7-flash) il 21/08/2026, 20:00:09.
     Giudicato da Pricing Analyst: promosso 9/10.
     Nessuno lo ha ancora letto. -->

# Strategia di Monetizzazione e Modello di Ricavo: Chauffeur Empire

---

### 1. La risposta in tre righe

Proponi di vendere **tempo, automazione gestionale e prestigio estetico** tramite i Driver Coins, senza mai vendere valuta di gioco o vantaggi competitivi diretti che distruggerebbero il mercato dei VTK. La monetizzazione si regge su due pilastri: pacchetti di monete una tantum (da 4,99 € a 24,99 €) e un abbonamento mensile facoltativo di comodità gestionale ("Club NCC" a 7,99 €/mese). Questa struttura copre i costi fissi dei server fin dai primi 50 giocatori paganti, lasciando intatta la scalata "da povero a ricco".

---

### 2. Il ragionamento

In un gioco gestionale multigiocatore persistente (in cui il tempo scorre come nella realtà), il valore più scarso per il giocatore non è la moneta finta, ma il **tempo reale**. Chi lavora o studia non può collegarsi ogni 90 minuti per assegnare una corsa a ciascun autista.

Se commetti l'errore classico di vendere Euro di gioco con soldi veri per fare cassa subito, crei un meccanismo ingiusto (*pay-to-win*, cioè "paga per vincere"): i giocatori che non spendono abbandonano il gioco, il mercato del token interno (VTK) crolla per svalutazione, e il server si svuota. Se il server si svuota, anche chi paga smette di pagare perché non ha più nessuno da dominare nella classifica.

#### A chi si vende
1. **Il giocatore impegnato (lavoratore/professionista):** ha reddito disponibile ma poco tempo. Compra comodità: strumenti che evitano compiti ripetitivi e permettono alla flotta di lavorare mentre è disconnesso.
2. **Il giocatore veterano/competitivo:** vuole mostrare il proprio successo agli altri. Compra elementi visivi esclusivi per la sua holding, targhe personalizzate e sedi di lusso sulla mappa.

#### Cosa si vende con i Driver Coins
* **Contratti di gestione ("Direttore Operativo"):** moduli che permettono di pianificare a inizio giornata le corse degli autisti o di automatizzare la manutenzione programmata (ad esempio: "invia automaticamente al tagliando se l'usura supera l'80%"). Non regala soldi: evita solo clic manuali ripetitivi.
* **Slot infrastrutturali (non i veicoli):** acquisto di licenze per aprire un secondo garage in un'altra città senza attendere giorni di trafila burocratica di gioco. L'auto e l'autista andranno comunque comprati e pagati con gli Euro guadagnati sul campo.
* **Personalizzazione e Prestigio:** livree esclusive per le berline, loghi aziendali verificati, sedi aziendali personalizzate visibili sulla mappa da tutti i giocatori, intitolazione di linee di servizio VIP.
* **Pass mensile "Club NCC" (7,99 €/mese):** include una quota fissa mensile di Driver Coins, sconti sull'estetica, report statistici avanzati sulla redditività delle tratte e uno slot coda ordini aggiuntivo.

#### Cosa NON si deve vendere mai (I divieti assoluti)
* **Mai vendere Euro di gioco direttamente in cambio di Driver Coins:** distrugge l'inflazione interna e azzera il valore del token VTK scambiato tra giocatori.
* **Mai vendere auto esclusive non ottenibili giocando:** ogni veicolo deve poter essere acquistato con impegno nel gioco; chi paga può al massimo avere una verniciatura o un allestimento estetico dedicato.
* **Mai vendere il completamento istantaneo delle corse:** il gioco è sincronizzato con il tempo reale (24 ore = 24 ore). Se un'auto si teletrasporta da Milano a Roma in un secondo pagando, salta la logica della mappa e la concorrenza tra aziende sulle stesse tratte.
* **Mai vendere influenza politica o licenze pubbliche a tavolino:** questi elementi devono rimanere il traguardo finale della competizione tra holding.

#### Architettura dei prezzi e stima economica

| Pacchetto | Prezzo reale | Contenuto Driver Coins | Destinazione d'uso tipica |
|---|---|---|---|
| **Starter NCC** | 4,99 € | 500 monete | Prime personalizzazioni, sblocco slot garage |
| **Pass Mensile "Club NCC"** | 7,99 € / mese | 800 monete + automazioni base | Giocatore regolare attivo |
| **Flotta Manager** | 12,99 € | 1.500 monete | Automazione completa per flotte da oltre 10 auto |
| **Holding Empire** | 24,99 € | 3.200 monete | Personalizzazione totale holding, sedi di lusso |

* **Ipotesi di conversione (Stima conservativa):**
  * Partiamo dall'ipotesi di raggiungere una base di **500 giocatori attivi al mese** (*MAU*, utenti unici che aprono il gioco almeno una volta al mese).
  * In giochi da browser di nicchia, la quota di giocatori che spende denaro oscilla storicamente tra il **2,5% e il 4%**.
  * Ipotizziamo il 3% di paganti su 500 utenti = **15 giocatori paganti**.
  * Spesa media mensile stimata per utente pagante: **10,00 €** (mix tra pass mensile e pacchetti una tantum).
  * **Ricavo lordo mensile stimato:** **150,00 € / mese**.
* **Costi vivi stimati da coprire:**
  * Supabase (database e gestione accessi): piano base gratuito all'inizio, poi circa 25 $ / mese (circa 23 €) non appena i volumi aumentano.
  * Mapbox: gratuito fino a 50.000 caricamenti mappa al mese, poi tariffato a consumo.
  * Commissioni di pagamento (esempio Stripe su carte europee): circa 1,5% + 0,25 € a transazione (su 150 € sono circa 7-8 € totali).
  * **Margine operativo:** ampiamente positivo fin da subito, consentendo al gioco di autofinanziarsi senza richiedere iniezioni di capitale personale.

* **Cosa fa saltare questi numeri:**
  * Se la ritenzione dei giocatori al settimo giorno (*D7 retention*, cioè quanti tornano dopo una settimana) è sotto il 10%, la base attiva si svuota prima di maturare il bisogno di automazione.
  * Se le 11 funzioni attualmente spente contengono blocchi di gioco troppo frustranti, i giocatori abbandoneranno prima di raggiungere la dimensione di flotta (3-5 auto) in cui gli strumenti a pagamento diventano appetibili.

---

### 3. Cosa serve per farlo

Dato che Vlad è solo e non ha budget per collaboratori o agenzie, l'infrastruttura di vendita deve essere la più semplice e robusta possibile, senza librerie esterne pesanti.

* **Tempo di sviluppo:** 
  * Circa **3 o 4 settimane di lavoro concentrato** (stimando 15-20 ore settimanali).
  * *Settimana 1:* Creazione del catalogo prodotti nel database Postgres di Supabase e impostazione delle tabelle per il saldo dei Driver Coins.
  * *Settimana 2:* Integrazione del sistema di pagamento (consigliato **Stripe Checkout**, che gestisce carrello, sicurezza della carta, fatturazione e conformità fiscale europea senza dover scrivere interfacce complesse nel gioco).
  * *Settimana 3:* Collegamento dei messaggi automatici di conferma (*webhooks*) tra Stripe e Supabase per accreditare i Driver Coins all'utente istantaneamente dopo il pagamento.
  * *Settimana 4:* Creazione della schermata "Ufficio Forniture / Club NCC" dentro l'interfaccia HTML/JS del gioco e test di acquisto completi.
* **Costi vivi di avvio:** **0 € iniziali.**
  * Stripe non ha costi fissi mensili: trattiene una percentuale solo quando incassi.
  * Supabase e Mapbox restano nei rispettivi scaglioni gratuiti finché il traffico è contenuto.
* **Chi lo fa:** Interamente Vlad. Non serve assumere nessuno; l'integrazione segue standard già documentati per JavaScript puro e Supabase.

---

### 4. Come si vede se ha funzionato

Per verificare la validità del modello senza basarsi su impressioni soggettive, verificheremo questi tre fatti misurabili:

1. **Tasso di acquisto iniziale:** Entro **60 giorni** dal momento in cui i primi 200 giocatori raggiungono una flotta di almeno 3 automobili, almeno il **3%** deve aver effettuato almeno un acquisto (Driver Coins o Pass Mensile). Se la percentuale è inferiore all'1%, significa che l'automazione offerta non è percepita come utile o che il gioco non crea abbastanza attaccamento emotivo.
2. **Copertura dei costi di esercizio:** Entro **90 giorni** dal lancio pubblico con monetizzazione attiva, gli incassi netti generati devono superare stabilmente il costo mensile dell'infrastruttura (Supabase Pro + Mapbox). Il primo traguardo di successo è l'**azzeramento dei costi vivi** (punto di pareggio).
3. **Stabilità del mercato interno (VTK):** Monitorare il prezzo del VTK sul mercato tra giocatori nei primi **90 giorni**. Se il prezzo crolla di oltre il 50% rispetto al valore iniziale, significa che i Driver Coins stanno sottraendo utilità al token interno o che è stata introdotta involontariamente una scorciatoia distorsiva.

---

### 5. Cosa ti manca per essere sicuro

Questa sezione contiene i punti scoperti su cui non è possibile esprimere una certezza matematica senza dati diretti dal codice e dai primi test d'uso:

1. **Il consumo effettivo delle chiamate alla mappa Mapbox:** Non sappiamo quante volte un giocatore medio aggiorna, sposta o ricarica la mappa in una sessione tipica. Se ogni corsa genera decine di richieste API, il costo di Mapbox potrebbe crescere più in fretta dei ricavi generati dai piccoli pagatori.
2. **La durata media della sessione e la frequenza d'accesso:** Non abbiamo ancora dati su come i giocatori vivranno il tempo reale (24 ore = 24 ore). Si collegano una volta al giorno per 15 minuti, o lasciano la scheda del browser aperta tutto il giorno? L'utilità dei servizi di automazione cambia radicalmente a seconda di questa abitudine.
3. **La natura esatta delle 11 funzioni ancora spente:** Non sappiamo se tra queste 11 funzioni ci siano dinamiche che toccano direttamente la spesa degli utenti (ad esempio la compravendita di immobili, le holding o le elezioni politiche). Se qualcuna di queste funzioni altera i flussi di cassa interni, i prezzi dei Driver Coins andranno ricalibrati per evitare squilibri.
4. **Il legame economico tra VTK ed Euro di gioco:** Manca la formula esatta con cui il token VTK viene generato, scambiato e distrutto nel gioco. Senza conoscere questa formula, il rischio che l'economia interna subisca inflazione o deflazione improvvisa rimane il principale punto di attenzione da monitorare durante la fase di test.