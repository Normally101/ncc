<!-- Scritto da Game Designer (gemini-3.7-flash) il 21/08/2026, 20:11:30.
     Giudicato da Chief Financial Officer: promosso 9/10.
     Nessuno lo ha ancora letto. -->

# Documento di Game Design: Onboarding e Soddisfazione Immediata

### 1. La risposta in tre righe
Accreditiamo subito il 30% del compenso come acconto di prenotazione non appena il giocatore accetta la prima corsa, facciamo eseguire un "Briefing di Bordo" interattivo di 60 secondi che assegna punti reputazione immediati, e sblocchiamo subito l'agenda per pianificare la seconda corsa del turno successivo invece di lasciare lo schermo bloccato in attesa.

---

### 2. Il ragionamento

Il problema individuato dalla UX Researcher non è la durata reale del viaggio in sé (chi sceglie un gestionale persistente accetta i tempi lunghi), ma l'**assenza totale di feedback di chiusura del cerchio d'azione** nei primi 120 secondi. 

Se il giocatore clicca "Assegna corsa", vede l'auto passare allo stato `In viaggio` e il timer segna `44:59`, la sua percezione psicologica è di aver subito un blocco (*lock-out*), non di aver avviato un'impresa.

Perché questa soluzione e non altre:
1. **Non usiamo "velocizzatori" artificiali (skip/boost):** romperebbero subito la coerenza del tempo reale (24h = 24h) e svaluterebbero il realismo dell'NCC.
2. **Non accorciamo la prima corsa a 2 minuti:** creerebbe una falsa aspettativa; il giocatore penserebbe che il gioco sia un arcade rapido e abbandonerebbe alla seconda corsa quando scopre che dura un'ora.
3. **Applichiamo la logica reale del settore NCC:** 
   - Un servizio di lusso incassa una caparra o acconto alla conferma della prenotazione.
   - Prima della partenza l'autista prepara l'allestimento dell'auto (acqua, musica, climatizzazione).
   - Un gestore non aspetta che l'auto torni per cercare il prossimo lavoro: riempie i tempi morti pianificando la tratta di ritorno.

In questo modo il giocatore, entro due minuti:
- Vede il saldo salire (gratificazione economica immediata).
- Compie 2 micro-scelte d'allestimento con impatto visibile sulla qualità del servizio (senso di agenzia).
- Vede l'auto muoversi su Mapbox con percorso tracciato.
- Ha un secondo compito operativo da svolgere (accettare la corsa di ritorno) prima di poter chiudere il browser sentendosi soddisfatto.

---

### 3. Meccanica di Gioco Dettagliata

#### 3.1. Flusso dei Primi 2 Minuti

```
[00:00 - 00:20] ACCETTAZIONE CORSA
  └─ Clic su "Conferma Prenotazione VIP" (Valore totale: 150 €)
  └─ Feedback visivo/audio: Accredito immediato Acconto 30% (+45 € in cassa)
  └─ Stato corsa: "In allestimento" (Timer: 60 secondi)

[00:20 - 01:20] BRIEFING & ALLESTIMENTO DI BORDO
  └─ Comparsa cruscotto interattivo: 3 scelte rapide a costo zero per la prima corsa:
     • Kit Acqua & Salviette [Selezionato di default] (+10% probabilità mancia)
     • Climatizzazione Comfort [21°C] (+5% gradimento cliente)
     • Selezione Quotidiano [Finanza / Lifestyle] (+5% reputazione)
  └─ Barra "Livello Servizio": sale visivamente da 80% a 100% (Qualità Eccellente)
  └─ Assegnazione immediata di +25 Punti Esperienza Azienda (XP)

[01:20 - 01:40] PARTENZA SULLA MAPPA
  └─ Allo scadere dei 60 secondi: l'icona dell'auto su Mapbox si anima.
  └─ Compare la linea di percorso (Polyline) e lo stato: "In trasferimento verso il cliente".
  └─ Tempo rimanente di guida effettiva: 44 minuti reali.

[01:40 - 02:00] SBLOCCO AGENDA & RITORNO
  └─ Notifica a schermo: "Mentre l'autista è in viaggio, organizza il rientro."
  └─ Sblocco della scheda "Richieste Future": il giocatore trova una corsa di ritorno compatibile come orario (es. partenza tra 60 minuti).
  └─ Il giocatore assegna la seconda corsa, incassa il relativo secondo acconto (+30 €) e può chiudere la sessione sapendo che la sua flotta sta lavorando.
```

#### 3.2. Specifiche Numeriche ed Economiche

Tutti i valori sono tarati sulla prima auto (es. Berlina Business di partenza) e sul saldo iniziale consigliato.

| Variabile | Valore Iniziale | Min | Max | Rationale / Note |
| :--- | :--- | :--- | :--- | :--- |
| **Saldo cassa iniziale giocatore** | 100 € | 50 € | 200 € | Permette di assorbire piccoli costi vivi iniziali senza andare in rosso. |
| **Valore Prima Corsa (Transfer)** | 150 € | 120 € | 180 € | `[STIMA]` Corsa urbana-aeroportuale media di fascia alta. |
| **Percentuale Acconto Immediato** | 30% (45 €) | 20% | 40% | `[STIMA]` Dà subito l'effetto psicologico di guadagno senza regalare l'intero importo. |
| **Saldo a fine corsa (70%)** | 105 € | 84 € | 126 € | Erogato al minuto 45 reale se la corsa va a buon fine. |
| **Durata Fase Allestimento** | 60 sec | 30 sec | 90 sec | Il tempo necessario per leggere, cliccare 2 opzioni e vedere la barra riempirsi. |
| **XP erogata alla preparazione** | 25 XP | 20 XP | 50 XP | Fa avanzare subito la barra livello dell'azienda del ~25%. |
| **XP erogata a fine corsa** | 75 XP | 50 XP | 100 XP | Porta al Livello 2 al completamento del primo servizio reale. |

#### 3.3. Stati della Macchina a Stati (FSM)
Per evitare incongruenze sul database Supabase, la corsa attraversa i seguenti stati:
1. `OFFERTA_RICEVUTA`: la corsa è visibile a schermo.
2. `PRENOTATA`: il giocatore accetta; trigger Postgres che accredita l'acconto (30%) sul saldo e avvia il timer di allestimento (60s).
3. `IN_ALLESTIMENTO`: l'utente può modificare i parametri di bordo.
4. `IN_VIAGGIO`: l'auto è su strada; posizione aggiornata via timestamp calcolato sul percorso Mapbox.
5. `COMPLETATA`: accredito del saldo (70%), eventuale mancia calcolata in base all'allestimento scelto, assegnazione XP finale.

#### 3.4. Casi Limite e Gestione Errori
- **Il giocatore chiude il browser durante l'allestimento (primi 60s):** il server Supabase fa scadere il timer in automatico applicando le scelte di default; la corsa passa automaticamente a `IN_VIAGGIO` senza bloccare l'auto.
- **Il giocatore clicca "Annulla Corsa" dopo aver incassato l'acconto:** viene trattenuta una penale pari all'acconto stesso (saldo -45 €), per evitare tentativi di sfruttamento del sistema economico (*exploit*).

---

### 4. Cosa serve per farlo

Tutto il lavoro può essere svolto interamente da **Vlad da solo**, senza costi vivi di terze parti.

- **Costi vivi monetari:** 0 € (si usano le infrastrutture già presenti: Supabase, Mapbox, vanilla JS).
- **Tempo di implementazione stimato per una persona sola:** ~11-14 ore di lavoro complessive, così suddivise:
  1. *Database & Logica Supabase (3 ore):* Aggiunta dei campi `acconto_percentuale`, `stato_corsa: IN_ALLESTIMENTO`, e funzione SQL (RPC) per l'accredito frazionato (30% subito, 70% a fine viaggio).
  2. *Interfaccia Cruscotto Allestimento (4 ore):* Modale HTML/CSS in linea con la grafica esistente con 3 toggle/scelte e barra di qualità del servizio che si aggiorna in tempo reale.
  3. *Logica Client JS & Mapbox (3 ore):* Gestione della transizione di stato da 0 a 120 secondi, animazione di partenza del marker dell'auto al termine dei 60s di allestimento.
  4. *Test e Verifica (2-4 ore):* Verifica dei test automatici esistenti, aggiunta di 3-4 nuovi test per la macchina a stati della corsa frazionata.

---

### 5. Come si vede se ha funzionato

Un cambiamento è valido solo se produce un comportamento misurabile nei dati di gioco.

- **Metrica primaria (Sintomo del problema):** 
  - *Tasso di abbandono nei primi 3 minuti (Bounce Rate prima sessione)*.
- **Obiettivo numerico misurabile:**
  - Ridurre gli abbandoni nei primi 3 minuti dall'attuale livello (se prossimo al 70-80% durante i primi test) a **meno del 30%** dei nuovi account creati.
- **Fatto osservabile entro la prima sessione:**
  - Almeno l'**80% dei nuovi utenti** che avviano la prima corsa deve completare l'allestimento di bordo e avere un'azione di pianificazione futura salvata sul database prima di disconnettersi.
- **Finestra temporale di verifica:**
  - Misurabile su un campione di **30 test-user o nuovi giocatori** entro 7 giorni dal rilascio della modifica.

---

### 6. Cosa ti manca per essere sicuro

Questa sezione contiene i dati che attualmente non conosciamo e che vanno verificati nel codice esistente:

1. **Gestione del tempo su Supabase:** Non sappiamo se il calcolo del tempo delle corse è gestito tramite cron-job sul server (es. `pg_cron` / Edge Functions) oppure se viene calcolato lato client confrontando `ora_inizio` e `ora_fine` al momento della riconnessione. Se il calcolo è puramente al ricaricamento della pagina, la transizione automatica da `IN_ALLESTIMENTO` a `IN_VIAGGIO` richiederà una funzione server dedicata per evitare incongruenze se l'utente è offline.
2. **Dati analitici attuali:** Non abbiamo il dato numerico esatto sul punto esatto di abbandono: sappiamo che la UX Researcher segnala la noia al minuto 0, ma non abbiamo tracciamento telemetrico (es. eventi PostHog o log Postgres) che ci dica quanti secondi esatti passa un utente sul sito prima di chiudere la scheda.
3. **Comportamento di Mapbox a schermo spento / background:** Dobbiamo verificare come reagisce il marker dell'auto su browser mobile quando l'utente mette l'applicazione in background durante il minuto di allestimento e riapre dopo 10 minuti.