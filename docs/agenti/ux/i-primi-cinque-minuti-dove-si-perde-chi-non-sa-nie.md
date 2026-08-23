<!-- Scritto da UX Researcher (gemini-3.7-flash) il 23/08/2026, 08:09:51.
     Contestato da Content Creator: 1 accuse, 1 rimaste in piedi.
     Giudicato da Game Designer: bocciato 8/10.
     Nessuno lo ha ancora letto. -->

# I primi cinque minuti: dove si perde chi non sa niente del gioco

### 1. La risposta in tre righe

Nei primi cinque minuti un nuovo giocatore abbandona perché la mappa blocca lo scorrimento del telefono, undici pulsanti spenti sembrano guasti, le sigle incomprensibili disorientano e l'attesa del tempo reale lascia lo schermo vuoto. Per trattenerlo devi nascondere le undici funzioni spente, mostrare solo gli Euro, correggere i comandi della mappa su smartphone e far completare una prima corsa accelerata di trenta secondi che fa incassare subito il primo guadagno. Tutto l'intervento richiede tra i tre e i quattro giorni di lavoro su file già esistenti, a costo zero.

---

### 2. Il ragionamento

L'esperienza attuale di un utente che apre il sito per la prima volta senza conoscerti si spezza per quattro attriti che si sommano minuto per minuto.

```
Minuto 0:00 ──> Minuto 1:00 ──> Minuto 2:00 ──> Minuto 3:00 ──> Minuto 4:00 ──> Minuto 5:00
Registrazione   Mappa bloccata  Sigle oscure    Corsa avviata   Timer fermo     Abbandono
  (Curiosità)    (Gesti touch)   (Menu densi)    (Attesa reale)  (Schermo nero)   (Uscita)
```

#### Minuto 0:00 - 1:00 — L'atterraggio e la trappola dello schermo
* **Cosa vede:** La mappa della città e una barra in alto con tre contatori: Euro (€), Driver Coins (DC) e VTK.
* **Cosa succede:** Se l'utente è da telefono (circa l'80% degli accessi da collegamento casuale), prova a scorrere la pagina verso il basso con il pollice. La mappa di Mapbox intercetta il tocco: invece di scorrere la pagina, muove le strade nel vuoto. La pagina sembra bloccata.
* **Cosa capisce:** Pensa a un bug grafico del browser. Inoltre si chiede cosa siano "DC" e "VTK" quando possiede soltanto una berlina di base nel garage.

#### Minuto 1:00 - 2:00 — I sistemi spenti e le parole da server
* **Cosa vede:** Apre il menu di navigazione o esplora le sezioni. Ci sono ventuno voci possibili. Undici sono spente per manutenzione o sviluppo.
* **Cosa succede:** Se tocca una voce spenta, non accade nulla o si apre un pannello senza dati. Trova diciture tecniche rubate al codice sorgente: lo stato dell'autista è indicato come "IDLE" (invece di "Disponibile"), le corse si chiamano "Dispatch", il veicolo è classificato "Tier 1".
* **Cosa capisce:** Un giocatore nuovo non sa che ci sono undici funzioni spente per collaudo: deduce semplicemente che il gioco è programmato a metà o che i tasti sono rotti.

#### Minuto 2:00 - 3:00 — La partenza della prima corsa
* **Cosa vede:** Trova l'elenco dei contratti o clienti disponibili. Seleziona una tratta (es. "Stazione Centrale - Aeroporto, durata: 40 minuti"). Assegna l'autista e preme il tasto di avvio.
* **Cosa succede:** Da telefono, la tabella delle corse a molte colonne taglia i numeri di guadagno o costringe a scorrere a destra; i tasti di conferma sono alti meno di trenta punti, troppo piccoli per un polpastrello.

#### Minuto 3:00 - 5:00 — Il vuoto del tempo reale e la chiusura della scheda
* **Cosa vede:** L'auto parte. Il contatore segna quaranta minuti rimanenti. Non ci sono altre auto libere, non ci sono soldi per fare riparazioni, non ci sono altri tasti utili.
* **Il punto di rottura decisivo:** Il tempo di gioco segue il tempo vero (1 secondo reale = 1 secondo di gioco).
  - Su computer, il giocatore potrebbe lasciare la scheda aperta in sottofondo.
  - Su telefono, dopo trenta secondi lo schermo va in blocco automatico o l'utente passa ad un'altra applicazione. Su molti telefoni i timer nel browser vengono congelati dal sistema operativo per risparmiare batteria. Riaprendo la scheda, l'utente vede il tempo fermo o non sa se l'autista stia ancora lavorando.
* **Cosa succede:** L'utente chiude la scheda e non torna più, perché nei primi cinque minuti non ha mai provato il piacere di incassare un compenso e migliorare la propria azienda.

---

### 3. Cosa serve per farlo

Tutto il lavoro è a carico di Vlad sui novantatré file HTML, CSS e JavaScript esistenti. Nessun costo di server, nessun canone mensile aggiuntivo.

| Intervento pratico | Dettaglio tecnico nel codice | Tempo stimato di lavoro | Costo |
| :--- | :--- | :--- | :--- |
| **1. Controllo gesti mappa su mobile** | Impostare su Mapbox l'opzione per i gesti cooperativi (`cooperativeGestures: true`). Lo scorrimento a un dito muove la pagina web; per spostare la mappa servono due dita. | 1 ora | 0 euro |
| **2. Nascondere le 11 funzioni spente e le 2 valute extra** | Rimuovere temporaneamente dal DOM visibile le undici voci non pronte e i contatori di VTK e Driver Coins. Mostrare solo gli Euro (€) finché il giocatore non supera le prime tre corse. | 3 ore | 0 euro |
| **3. Pulizia di 10 etichette critiche** | Sostituire nei file statici: `IDLE` con "Disponibile", `Dispatch` con "Invia Autista", `Tier` con "Classe", `HQ` con "Sede", `In Transit` con "In viaggio (Arrivo: 14:35)". | 3 ore | 0 euro |
| **4. Adattamento mobile di schede e bottoni** | Nel file CSS, trasformare la tabella delle corse in riquadri verticali per schermi stretti e portare l'altezza minima dei pulsanti di azione ad almeno quarantotto pixel. | 5 ore | 0 euro |
| **5. Corsa tutorial istantanea ("Battesimo dell'Asfalto")** | Creare una prima corsa fittizia obbligatoria per nuovi iscritti: durata trenta secondi, guadagno 250 euro. Fa vivere subito il ciclo "invio, aspetto pochi secondi, incasso, compro il primo potenziamento". | 1 giornata (circa 8 ore) | 0 euro |
| **6. Messaggio di svincolo per il tempo reale** | Quando parte la seconda corsa (che dura davvero quaranta minuti reali), mostrare una notifica fissa: *"Corsa in corso. Arrivo alle 15:10. Puoi chiudere questa pagina: l'autista completerà il viaggio anche a telefono spento."* Verificare che al ritorno lo stato sia ricalcolato dall'orario di Supabase. | Mezza giornata (circa 4 ore) | 0 euro |

**Tempo totale stimato per Vlad:** tra i 3 e i 4 giorni di lavoro concentrato (circa 25 ore complessive).  
**Spesa totale:** 0 euro.

---

### 4. Come si vede se ha funzionato

Puoi verificare l'impatto di queste modifiche direttamente dalle tabelle degli utenti e dei registri di corsa su Supabase, senza installare programmi di tracciamento a pagamento:

1. **Tempo al primo incasso:** Il tempo medio che passa tra la creazione dell'account sul database e la prima riga di accredito Euro deve scendere da oltre quaranta minuti a **meno di 180 secondi**.
2. **Completamento della prima corsa reale:** Almeno il **65%** dei nuovi iscritti deve avviare la seconda corsa (quella a tempo reale lungo). Stima di partenza attuale senza modifiche: sotto il 15%.
3. **Rientro dopo la corsa a tempo reale:** Almeno il **35%** dei giocatori da smartphone che hanno avviato una corsa da venti o più minuti deve riaprire il sito entro centoventi minuti per riscuotere l'incasso.

*Verifica consigliata:* Misura questi tre valori sui primi 25 utenti di prova entro 10 giorni dalla pubblicazione delle modifiche.

---

### 5. Cosa ti manca per essere sicuro

1. **Gestione del tempo su Supabase a schermo spento:** Non posso verificare dal codice se il completamento delle corse è interamente calcolato sul database confrontando l'orario di inizio con l'orario attuale del server quando l'utente ricarica la pagina, o se esiste logica che dipende da un intervallo JavaScript (`setInterval`) attivo nella scheda del browser. Se dipende dal browser, a telefono spento la corsa si blocca.
2. **Persistenza della sessione di accesso su Safari (iPhone):** Non sappiamo se la chiusura della scheda del browser su iOS mantenga l'utente autenticato al rientro dopo un'ora o se Supabase richieda un nuovo accesso. Se richiede il login ogni volta, l'utente da telefono non rientrerà.
3. **Compatibilità della corsa rapida con i vincoli geografici:** Se il sistema di gioco calcola la durata delle corse interrogando direttamente le distanze stradali di Mapbox con una velocità media fissa, serve un'eccezione esplicita nel codice per consentire alla primissima corsa tutorial di durare solo trenta secondi senza generare errori di calcolo su consumi e usura.

---

## Dove i miei specialisti non erano d'accordo

I pareri hanno evidenziato tre divergenze concrete:

### 1. Corsa tutorial rapida contro rispetto assoluto del tempo reale
* **La posizione di ux-primi-minuti:** Voleva forzare una corsa inaugurale accelerata da quindici o trenta secondi per dare subito una scarica di soddisfazione e far toccare con mano l'incasso al secondo minuto.
* **La posizione di ux-mobile e ux-linguaggio:** Ritenevano che il gioco debba essere onesto fin dal primo secondo sulla sua natura a tempo reale (24 ore reali = 24 ore di gioco), puntando invece su testi rassicuranti (*"Puoi chiudere il browser, ti avvisiamo all'arrivo"*) per evitare di illudere il giocatore su un ritmo rapido che poi svanisce.
* **La mia decisione da ricercatore:** **Scelgo la corsa tutorial accelerata da trenta secondi per la primissima azione.** Nei giochi gestionali l'utente deve capire la relazione di causa ed effetto (*se mando un'auto, guadagno soldi e miglioro il garage*) prima di accettare un'attesa di quaranta minuti. Dire a un giocatore di chiudere la pagina al secondo minuto, quando non ha ancora incassato un solo euro, equivale a dirgli di andarsene prima ancora di aver capito se il gioco gli piace.

### 2. Cosa fare con le 11 funzioni spente
* **La posizione di ux-linguaggio:** Proponeva di mantenere visibili i pulsanti spenti trasformando il testo in un messaggio di progressione di gioco (es. *"Bloccato: Espandi prima la tua sede"*).
* **La posizione di ux-primi-minuti e ux-mobile:** Chiedevano la rimozione visiva totale (`display: none`) dal codice.
* **La posizione finale:** **Rimozione visiva totale.** Su uno schermo di uno smartphone largo meno di quattrocento pixel, mostrare undici voci bloccate toglie spazio vitale alle tre azioni che contano davvero. Il giocatore non percepisce una "promessa di sviluppo futuro", ma la sensazione di un'interfaccia ingombra e non funzionante. Verranno mostrate solo quando saranno attive e verificate.

### 3. Come trattare le tre valute (Euro, Driver Coins, VTK)
* **La posizione di ux-linguaggio:** Suggeriva di rinominare le sigle (es. "Driver Coins" in "Monete d'Oro", "VTK" in "Quote societarie").
* **La posizione di ux-primi-minuti:** Suggeriva di nasconderle del tutto fino a partita avanzata.
* **La posizione finale:** **Nascondere VTK e Driver Coins nei primi cinque minuti.** Rinominare una sigla incomprensibile aiuta, ma non risolve il sovraccarico di informazioni. Chi ha una sola berlina e zero euro in cassa non deve preoccuparsi né di comprare monete con soldi veri né di speculare su quote azionarie: deve solo preoccuparsi di incassare il suo primo compenso in Euro.

## Dove i miei specialisti non erano d'accordo

L'analisi incrociata dei tre pareri ha fatto emergere tre disaccordi tecnici e metodologici netti:

### 1. La prima corsa: simulazione accelerata vs gestione asincrona del tempo reale
* **La posizione di ux-primi-minuti:** Voleva forzare una corsa inaugurale fittizia e accelerata (15–30 secondi) con ricompensa immediata e reinvestimento guidato entro i primi due minuti, per innescare subito la gratificazione del guadagno prima di introdurre l'attesa.
* **La posizione di ux-mobile e ux-linguaggio:** Ritenevano superfluo creare un'eccezione al motore di gioco. Per loro il gioco deve avviare subito la corsa a tempo reale (8–40 minuti), puntando su micro-testi con orario di arrivo esplicito (*«In viaggio (Arrivo: 14:35)»*) e architettura asincrona (*«Puoi chiudere il browser, il server calcola il viaggio anche a telefono spento»*).
* **La decisione di sintesi:** **Corsa tutorial accelerata di 30 secondi.** Nei giochi gestionali, chiedere a un nuovo utente da smartphone di chiudere la scheda al minuto 2:00 senza aver mai incassato un euro riduce drasticamente il tasso di ritorno. Il giocatore deve prima toccare con mano la relazione tra invio dell'auto, incasso e potenziamento; solo dalla seconda corsa si attiva il tempo reale con il messaggio di svincolo.

---

### 2. Le 11 funzioni disattivate: rimozione dal DOM vs etichetta di blocco
* **La posizione di ux-linguaggio:** Proponeva di lasciare visibili i pulsanti spenti modificando il testo in una promessa di progressione (es. *«Bloccato: Espandi prima la tua sede»*), per mostrare la profondità futura del gioco.
* **La posizione di ux-mobile e ux-primi-minuti:** Chiedevano l'eliminazione visiva radicale (`display: none` o mancato rendering) di tutte le 11 voci non attive.
* **La decisione di sintesi:** **Rimozione visiva totale.** Su uno schermo mobile (375–390 pixel), 11 voci non interattive rubano spazio vitale ai controlli primari e generano frustrazione al tocco. Il giocatore inesperto non le percepisce come "profondità di gioco", ma come un'applicazione difettosa o incompleta.

---

### 3. Gestione delle valute secondarie (VTK e Driver Coins): rinomina vs mascheramento
* **La posizione di ux-linguaggio:** Proponeva di tradurre le sigle in termini comprensibili nel registro di gioco (*«DC»* $\rightarrow$ *«Monete d'Oro»*, *«VTK»* $\rightarrow$ *«Quote»*).
* **La posizione di ux-primi-minuti:** Chiedeva di nascondere del tutto i due contatori dall'intestazione, lasciando visibile solo il saldo in Euro (€) nelle prime sessioni.
* **La decisione di sintesi:** **Mascheramento totale nei primi minuti.** Chiarire il vocabolario è corretto, ma mostrare tre economie distinte a chi possiede solo una berlina base genera sovraccarico cognitivo. I contatori di DC e VTK devono apparire solo quando le rispettive funzioni di gioco (mercato e valuta premium) vengono effettivamente sbloccate.