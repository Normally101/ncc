<!-- Scritto da UX Researcher (gemini-3.7-flash) il 23/08/2026, 07:49:21.
     Contestato da Content Creator: 0 accuse, 0 rimaste in piedi.
     Giudicato da Game Designer: promosso 8/10.
     Nessuno lo ha ancora letto. -->

# Sintesi UX: Riprogettazione del Tutorial per Chauffeur Empire

## 1. La risposta in tre righe

Per rendere il gioco accessibile a chiunque in due minuti, dobbiamo trasformare il primo avvio in un percorso guidato dal basso dello schermo senza tempi morti: un'auto già pronta, una prima corsa che dura 20 secondi, l'incasso immediato dei primi euro e un miglioramento guidato da comprare subito. Tutte le undici funzioni ancora spente, le due monete complesse (*Driver Coins* e *VTK*) e i termini tecnici di gestione vanno completamente nascosti fino al completamento del primo ciclo.

---

## 2. Il ragionamento

L'indicazione di Vlad («deve essere facile come per un bambino di dieci anni») non riguarda l'età anagrafica, ma il modello mentale di chiunque provi un gioco su browser: **non si impara leggendo spiegazioni, si impara toccando un elemento, vedendo un risultato gratificante e ripetendo l'azione**.

Attualmente il gioco presenta quattro barriere critiche all'ingresso:

1. **La trappola del tempo reale al minuto zero:** se la primissima corsa dura 10 o 15 minuti di orologio reale, il giocatore si ritrova a fissare una mappa senza avere una seconda auto, senza soldi e senza azioni disponibili. Pensa che il gioco sia bloccato e chiude la scheda. Il tempo reale 1:1 è il punto di forza del gioco a lungo termine, ma nei primi 120 secondi distrugge la permanenza sul sito.
2. **Il rumore visivo e le funzioni spente:** mostrare 11 sezioni non ancora attive e tre monete diverse (*Euro*, *Driver Coins*, *VTK*) fa sembrare la schermata rotta o troppo complicata prima ancora di iniziare.
3. **Le parole da database:** etichette come *Dispatch*, *DC*, *HQ*, *Fleet Roster* e *Slot* comunicano la struttura tecnica delle tabelle del database invece dell'azione concreta.
4. **I comandi minuscoli su mappa da telefono:** da smartphone, toccare icone di 20 pixel su una mappa Mapbox che si sposta al minimo tocco del pollice genera continui errori.

### Il nuovo flusso del primo avvio (durata totale: meno di 2 minuti)

```
[Accesso immediato] 
       ↓ 
[Scheda in basso: "Accetta corsa VIP di prova"] 
       ↓ (animazione di 20 secondi sulla mappa bloccata)
[Schermata di incasso: "+ 200 Euro!"]
       ↓ 
[Pulsante unico: "Migliora il servizio a bordo (-100 Euro)"] 
       ↓ 
[Ciclo base compreso: il prossimo viaggio pagherà di più]
```

1. **Inizio immediato senza configurazione:** il nuovo account riceve in automatico 1 berlina base e 1 autista già assegnati nel garage. Nessun modulo iniziale, nessuna scelta preliminare.
2. **Mappa bloccata in sottofondo:** Mapbox fa da sfondo visivo senza catturare i tocchi involontari del dito.
3. **Cassetto comandi in basso (*bottom sheet*):** tutti i pulsanti del tutorial si trovano nella metà inferiore dello schermo, con altezza minima di 48 pixel (facili da premere con il pollice con una sola mano).
4. **Prima corsa accelerata a 20 secondi:** il giocatore preme un unico grande pulsante verde («Accetta cliente VIP»). Vede l'auto muoversi per 20 secondi.
5. **Incasso e reinvestimento immediato:** compare la schermata con il saldo in Euro che sale visibilmente (+200 Euro). Subito dopo si accende un solo tasto: «Compra servizio di bordo (+15% di guadagni futuri)».
6. **Sblocco progressivo (*Progressive Disclosure*):** nei primi minuti a schermo si vede solo il saldo in Euro. Le *Monete d'oro* (Driver Coins) compaiono solo quando si apre il negozio, mentre le *Azioni* (VTK) e le funzioni avanzate (holding, fusioni) restano invisibili fino ai livelli successivi.

---

## 3. Cosa serve per farlo

Tutto il lavoro può essere svolto da Vlad in autonomia, modificando il codice HTML, CSS e JavaScript esistente senza comprare librerie esterne o servizi a pagamento.

* **Costo vivo:** **0 euro**.
* **Tempo di sviluppo stimato:** **3 o 4 giorni lavorativi totali**, così suddivisi:
  * *Giorno 1 (CSS e Pulizia interfaccia):* creare il contenitore fisso in basso per i comandi su smartphone, disabilitare lo scorrimento mappa durante i passaggi guidati e nascondere dal codice client le 11 funzioni non ancora attive e le 2 monete secondarie.
  * *Giorno 2 (Sostituzione testi e microcopy):* cercare e sostituire nei file le 14 etichette d'interfaccia critiche (es. *Dispatch* → *Assegna corsa*, *HQ* → *Sede*, *DC* → *Monete* o icona 🪙, *Maintenance Cooldown* → *In officina*).
  * *Giorno 3 (Logica prima corsa accelerata):* impostare sul server/client l'assegnazione automatica di auto e autista al nuovo profilo e creare l'evento della prima corsa preimpostata da 20 secondi con incasso e potenziamento guidato.
  * *Mezza giornata (Test su telefono reale):* verifica del flusso su uno smartphone reale con browser Safari e Chrome per controllare che i testi non vengano tagliati dalla barra degli indirizzi.

---

## 4. Come si vede se ha funzionato

L'efficacia si misura monitorando due eventi semplici nelle tabelle di Supabase:

1. **Tempo al primo incasso:** la mediana del tempo che intercorre tra la registrazione dell'account e il primo accredito di Euro deve scendere sotto i **90 secondi** (stima di partenza: oltre 10 minuti per via dell'attesa in tempo reale non guidata).
2. **Tasso di completamento del primo ciclo:** entro il primo test con 30-50 nuovi giocatori, almeno il **75%** di chi crea un profilo deve completare la prima corsa ed effettuare il primo potenziamento nella stessa sessione di gioco.

Se meno del 60% degli utenti completa il ciclo entro i primi 3 minuti, significa che c'è ancora un passaggio con troppo testo o un pulsante difficile da individuare su mobile.

---

## 5. Cosa ti manca per essere sicuro

1. **I punti esatti di abbandono attuali:** non ci sono ancora registrazioni di tracciamento (log) che mostrino in quale schermata o dopo quanti secondi gli utenti chiudono la pagina.
2. **Struttura dei testi nel codice:** non sappiamo se i testi dell'interfaccia sono centralizzati in un file di configurazione o se sono inseriti a mano dentro i 93 file del progetto (in questo caso serve attenzione a non rompere funzioni JavaScript che selezionano elementi in base al loro testo).
3. **Impatto grafico delle etichette più lunghe:** sostituire sigle brevi come *HQ* o *Slot* con parole italiane intere (*Sede*, *Posto auto*) occupa più spazio orizzontale. Serve verificare che su schermi stretti (larghezza 375 pixel) i pulsanti non vadano a capo in modo disordinato.

---

## ## Dove i miei specialisti non erano d'accordo

Rileggendo i pareri dei tre specialisti, sono emersi **due disaccordi reali e sostanziali** sull'impostazione del tutorial:

### 1. Auto e autista: assegnazione automatica istantanea vs. passaggi di configurazione guidati
* **La posizione di ux-mobile:** proponeva di far fare al giocatore tre tocchi distinti: (1) Ritira la tua auto, (2) Assegna te stesso come primo autista, (3) Accetta la corsa.
* **La posizione di ux-primi-minuti:** proponeva di saltare del tutto questi passaggi, assegnando auto e autista già pronti nel garage al momento della creazione del profilo, mostrando un solo pulsante gigante per accettare subito la corsa.
* **La mia decisione da UX Researcher:** **Prendo la posizione di ux-primi-minuti.** Chiedere a un nuovo utente di assegnare manualmente un'auto a un autista prima di fargli vedere cosa produce il gioco è un passaggio logico prematuro. Il giocatore non sa ancora a cosa serva un autista. Facendolo partire con la prima corsa già pronta in 1 clic, riduciamo a zero le possibilità che abbandoni prima di aver visto il primo guadagno. Il concetto di "comprare e assegnare" verrà appreso naturalmente al passaggio successivo, quando spenderà i 100 Euro appena vinti.

### 2. Priorità dell'intervento: riscrittura del testo vs. rimozione del testo
* **La posizione di ux-linguaggio:** riteneva che il problema principale fosse la chiarezza delle parole (*DC*, *VTK*, *Dispatch*) e che riscrivere 14 etichette risolvesse la comprensione del gioco.
* **La posizione di ux-primi-minuti:** sosteneva che riscrivere le parole non bastasse, perché nei primi 60 secondi l'utente non legge comunque nulla e qualsiasi testo informativo prima del primo incasso è solo un ostacolo.
* **La mia decisione da UX Researcher:** **Do priorità alla rimozione del testo e alla semplificazione del flusso.** Riscrivere le 14 etichette è indispensabile (ed è un lavoro rapido da fare), ma cambiare solo i nomi senza toccare l'attesa a tempo reale e senza nascondere le funzioni spente lascerebbe il tasso di abbandono quasi invariato. La sequenza corretta è: prima si rende il gioco immediato e privo di letture obbligatorie, poi si puliscono i nomi di tutti i pulsanti per quando il giocatore inizierà a navigare liberamente.