<!-- Scritto da Growth Hacker (gemini-3.7-flash) il 21/08/2026, 19:59:55.
     Giudicato da Brand Guardian: promosso 9/10.
     Nessuno lo ha ancora letto. -->

# Piano di Acquisizione: I Primi 1.000 Giocatori per Chauffeur Empire

---

### 1. La risposta in tre righe

I primi 1.000 giocatori arriveranno portando il gioco direttamente dentro le comunità di appassionati di giochi gestionali da browser (in particolare la comunità internazionale di lingua inglese dei *PBBG* su Reddit e directory dedicate), trasformando poi i primi 200 utenti attivi in reclutatori attraverso un sistema interno di affiliazione per creare consorzi di noleggio nel gioco, a costo monetario zero e con un impegno di circa 10 ore a settimana per Vlad.

---

### 2. Il ragionamento

#### Perché non la pubblicità a pagamento
Senza budget e senza aver ancora misurato quanto spende in media un giocatore (il valore della vita del cliente), comprare inserzioni su Facebook o Google significa bruciare denaro senza sapere se e quando rientrerà. Inoltre, i giochi da browser testuali o su mappa faticano a convertire da inserzioni visive generiche.

#### Perché questo pubblico specifico
*Chauffeur Empire* appartiene a un genere preciso: i **giochi persistenti da browser** (chiamati in gergo *PBBG*, giochi in cui il mondo continua a muoversi in tempo reale anche quando sei disconnesso, come accadeva nei vecchi OGame o Torn). 

Questo pubblico ha tre caratteristiche fondamentali per Vlad:
1. Non richiede grafica 3D: cerca profondità economica, tabelle, mappe e dinamiche di mercato.
2. È abituato a giocare da telefono o scheda aperta sul computer durante il lavoro/studio.
3. È un pubblico già aggregato in luoghi digitali specifici e affamato di novità ben fatte.

#### L'ordine di attivazione dei canali

```
[Fase 1: I primi 150 giocatori] 
   └── Comunità specializzate PBBG (Reddit r/pbbg, PBBG.com, Galaxy.click)
         │
         ▼
[Fase 2: Da 150 a 600 giocatori]
   └── Comunità allargate di gestionali (Reddit r/tycoon, r/WebGames, itch.io)
         │
         ▼
[Fase 3: Da 600 a 1.000 giocatori]
   └── Meccanica di invito interna (Consorzi di flotta) + passaparola organico
```

---

### 3. I Tre Canali e i Relativi Esperimenti

#### Canale 1: Comunità di nicchia dei giochi persistenti da browser (PBBG)
*Obiettivo: da 0 a 150 giocatori (la base per testare il bilanciamento).*

* **Dove andare:**
  * **Reddit:** la sezione `r/pbbg` (appassionati di giochi persistenti da browser) e `r/incremental_games` (se il gioco ha componenti di crescita progressiva automatica).
  * **Directory specializzate:** *PBBG.com* (il database principale di categoria) e *Galaxy.click* (portale dedicato a giochi da browser gestionali/incrementali).
* **Cosa fare (Esperimento 1):**
  * Creare una pagina di presentazione minimale (pagina di atterraggio) che spieghi in tre schermate il ciclo di gioco: compra auto -> assegna autista -> gestisci contratti di lusso -> scambia sul mercato VTK.
  * Pubblicare un post trasparente in inglese su `r/pbbg`: Vlad si presenta come sviluppatore solitario, descrive il sistema a tempo reale 1:1, la mappa reale con Mapbox e chiede a 50 persone di entrare per rompere l'economia e trovare falle nel codice.
* **Perché funziona:** Questa nicchia ama i progetti artigianali senza intermediari commerciali ed è molto tollerante ai bug iniziali se l'economia di gioco è interessante.

---

#### Canale 2: Portali di giochi indipendenti e aggregatori di giochi web
*Obiettivo: da 150 a 600 giocatori.*

* **Dove andare:**
  * **itch.io:** Creare una scheda gioco con tag *Tycoon*, *Management*, *Simulation*, *Browser*. Su itch.io il gioco può essere giocato direttamente incorporato o reindirizzare con un pulsante al dominio `chauffeurempire.com`.
  * **Reddit:** `r/tycoon` (dedicato esclusivamente a giochi manageriali e di simulazione d'impresa) e `r/WebGames` (giochi fruibili immediatamente da browser).
* **Cosa fare (Esperimento 2):**
  * Presentare il gioco su `r/tycoon` puntando sull'aspetto economico reale: non un semplice gioco di corse, ma una simulazione di logistica di lusso con mercato interno tra giocatori (VTK) e tempo reale 24h.
  * Condividere un registro pubblico di sviluppo (chiamato comunemente *devlog* su itch.io) con cadenza quindicinale, mostrando le nuove funzioni sbloccate tra le 11 attualmente spente.

---

#### Canale 3: La meccanica di collaborazione interna ("I Consorzi di Flotta")
*Obiettivo: da 600 a 1.000 giocatori.*

* **Dove agire:** Direttamente nel codice di gioco di *Chauffeur Empire*.
* **Cosa fare (Esperimento 3):**
  * Introdurre una funzione cooperativa legata alle società o holding: per sbloccare appalti VIP governativi o di grandi eventi servono 5 o 10 auto contemporaneamente, più di quante un singolo giocatore alle prime armi possa possedere.
  * Fornire a ogni giocatore registrato un codice invito: se un amico si registra tramite quel codice ed effettua le sue prime 10 corse, entrambi ricevono una quota di valuta di gioco (Euro virtuali) o uno sconto sulla manutenzione della flotta. Non promettere valuta reale (Driver Coins), per evitare la creazione di account falsi.

---

### 4. Cosa serve per farlo

* **Denaro:** **0 €**. Tutti i canali indicati sono gratuiti per la pubblicazione organica.
* **Chi lo fa:** **Vlad**, da solo.
* **Tempo richiesto:** Stimato in **6-8 ore una tantum** per i preparativi, poi **5 ore a settimana** distribuite come segue:
  1. *Preparativi (una tantum, ~6 ore):*
     * Scrittura di una pagina di ingresso essenziale sul sito (con 3 immagini di gioco reali e spiegazione chiara).
     * Creazione profilo su itch.io e scheda su PBBG.com.
  2. *Attività settimanale (~5 ore/settimana):*
     * 1 ora per scrivere un aggiornamento di sviluppo (in inglese e italiano).
     * 2 ore per rispondere ai commenti, raccogliere segnalazioni di bug e interagire su Reddit/Discord.
     * 2 ore per monitorare i dati di iscrizione e correggere gli intoppi di registrazione su Supabase.

---

### 5. Come si vede se ha funzionato

Un canale o un esperimento non si giudica dalle visite al sito, ma da quanti utenti completano il primo ciclo di gioco (creare l'account, comprare la prima auto, completare una corsa).

| Canale / Esperimento | Traguardo di successo osservabile | Entro quando |
| :--- | :--- | :--- |
| **Esperimento 1 (Post su r/pbbg + scheda PBBG.com)** | Almeno **100 account registrati** con almeno **30 giocatori** che completano corse per 3 giorni consecutivi. | 14 giorni dalla pubblicazione del post. |
| **Esperimento 2 (Scheda itch.io + post r/tycoon)** | Almeno **350 nuovi account registrati** complessivi. | 30 giorni dal lancio su itch.io. |
| **Esperimento 3 (Codici invito / Consorzi)** | Almeno il **15% dei giocatori attivi** fa registrare almeno 1 nuovo utente che resta attivo per 48 ore. | 45 giorni dall'attivazione della funzione. |

Se entro 14 giorni dall'Esperimento 1 gli iscritti sono meno di 20, l'esperimento è fallito: significa che il testo di presentazione non comunica l'interesse del gioco oppure che la schermata di benvenuto blocca gli utenti prima dell'iscrizione.

---

### 6. Cosa manca per essere sicuro

Questa sezione raccoglie le informazioni critiche che attualmente non sono note e che possono modificare l'efficacia del piano:

1. **La lingua del gioco:** Non è specificato se l'interfaccia attuale di *Chauffeur Empire* sia solo in italiano, solo in inglese, o bilingue. Se il gioco è solo in italiano, l'accesso a `r/pbbg`, `r/tycoon` e `itch.io` perde circa il 90% della sua efficacia (stima basata sul fatto che le comunità internazionali comunicano in inglese). In tal caso, prima di lanciare su questi canali è indispensabile avere i testi in lingua inglese.
2. **Il tasso di completamento dei primi 10 minuti (onboarding):** Non abbiamo dati su cosa vede un utente nei primi 120 secondi dopo la registrazione. Se l'interfaccia iniziale è confusa o non guida chiaramente all'acquisto della prima auto, qualunque flusso di traffico verrà disperso all'ingresso.
3. **Il ciclo del tempo reale (24h reali = 24h gioco):** Non è noto cosa faccia un giocatore nei momenti morti. Se una corsa dura 4 ore reali e durante quel tempo non c'è nessuna decisione da prendere (mercato VTK, manutenzione, gestione autisti), i giocatori occasionali rischiano di abbandonare prima di vedere la seconda schermata.
4. **Resistenza dell'infrastruttura gratuita:** Supabase e Mapbox operano con piani gratuiti che prevedono limiti mensili di chiamate e connessioni simultanee al database. Non è stato calcolato a quale volume esatto di giocatori contemporanei questi limiti verranno superati, richiedendo i primi costi di gestione del server.