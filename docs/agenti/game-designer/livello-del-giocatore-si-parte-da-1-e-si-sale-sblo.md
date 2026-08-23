<!-- Scritto da Game Designer (gemini-3.7-flash) il 23/08/2026, 07:49:24.
     Contestato da Content Creator: 0 accuse, 0 rimaste in piedi.
     Giudicato da Chief Financial Officer: promosso 9/10.
     Nessuno lo ha ancora letto. -->

# Proposta di Game Design: Livello Aziendale e Sistema di Sblocchi

## 1. La risposta in tre righe

Introduciamo un **Livello Aziendale numerico da 1 a 30** alimentato da Punti Esperienza (XP), dove il livello 2 scatta subito dopo la prima corsa (3–5 minuti) e il livello 3 dopo le prime 3 corse e la prima manutenzione (circa 20 minuti). 
I livelli non regalano capitali enormi, ma certificano la crescita dell'azienda sbloccando il diritto di acquistare nuove vetture, assumere autisti e accedere a contratti più remunerativi.
Tutte le schermate restano visibili fin da subito: le funzioni avanzate mostrano chiaramente il livello e i requisiti necessari, trasformando l'interfaccia in una mappa di obiettivi anziché in una serie di porte chiuse.

---

## 2. Il ragionamento

### Il problema attuale nel codice
Nel codice attuale (`ui-home.js` e la riga 1169 di `engine.js`), il titolo mostrato al giocatore (*Autista, Imprenditore, Manager, Leggenda*) dipende dal Prestigio, che si attiva soltanto quando la reputazione tocca 5,0 stelle.
Questo crea un vuoto psicologico grave: un nuovo utente completa dieci o venti corse, guadagna denaro, ma a schermo rimane inchiodato all'etichetta iniziale *«Autista»*. Senza un indicatore chiaro che si muove a ogni singola azione nei primi dieci minuti, il giocatore ha l'impressione che il gioco sia fermo o privo di profondità.

### Tre metriche distinte, tre ruoli chiari
Per evitare sovrapposizioni e confusione, il gioco deve separare nettamente tre concetti:
1. **Reputazione (da 1,0 a 5,0 stelle):** Misura la qualità del servizio momentaneo (puntualità, pulizia dell'auto, gradimento del cliente). Può salire e scendere dopo ogni corsa.
2. **Livello Aziendale (da 1 a 30):** Misura il volume di esperienza operativa e l'anzianità. È un valore cumulativo: non scende mai e governa i permessi commerciali (sblocchi).
3. **Prestigio (Titoli onorari da Autista a Leggenda):** Rimane l'obiettivo di lungo periodo riservato a chi mantiene l'eccellenza operativa (5,0 stelle costanti) e una flotta consolidata.

---

### Come si guadagna l'Esperienza (XP)
I Punti Esperienza non devono misurare i soldi posseduti (altrimenti chi spende per riparare l'auto vedrebbe la barra arretrare), ma l'attività svolta con successo:
- **Corsa completata:** 10 XP fissi di base + 1 XP ogni 10 euro di incasso netto della corsa.
- **Bonus qualità corsa (5 stelle):** +20% di XP sul totale della corsa (premia chi guida bene e rispetta i tempi).
- **Traguardi di gestione (una tantum):** 25 XP per la prima manutenzione in officina, 50 XP per l'acquisto di un veicolo, 50 XP per il primo contratto di assunzione.

### Formula di avanzamento e tabella dei primi livelli
La formula per calcolare i Punti Esperienza totali necessari per raggiungere un determinato livello è:
*XP Totali per Livello N = 45 moltiplicato per (N elevato a 1,75) meno 45, arrotondato all'intero più vicino.*

Questa progressione fa scattare i primi livelli molto rapidamente per agganciare il giocatore nella prima sessione, per poi allungarsi gradualmente nei giorni e nelle settimane successive:

| Livello | XP Totali | Corse / Azioni stimate per il traguardo | Tempo reale stimato | Cosa sblocca (Permessi e Funzioni) | Premio in Euro |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Livello 1** | 0 | Registrazione completata | Minuto 0 | Prima auto usata, corse urbane base | — |
| **Livello 2** | 30 | 1ª corsa completata + 1° rifornimento | 3–5 minuti | Accesso all'officina e monitoraggio usura pezzi | 50 euro |
| **Livello 3** | 90 | 3–4 corse totali + 1° tagliando eseguito | 20–30 minuti | **2° slot garage:** permesso di possedere una seconda vettura | 120 euro |
| **Livello 4** | 180 | 8–10 corse totali + acquisto 2ª auto | Fine Giorno 1 | **Mercato del lavoro:** permesso di assumere il 1° autista | 200 euro |
| **Livello 5** | 300 | Gestione di 2 auto attive | Giorni 2–3 | **Contratti Business:** convenzioni con Hotel e Ristoranti | 350 euro |
| **Livello 10** | 1.800 | Flotta di 4–5 vetture a pieno regime | Settimane 2–3 | **Commesse VIP** e trasferimenti aeroportuali a tariffa alta | 1.200 euro |
| **Livello 20** | 7.000 | Flotta strutturata e sede di proprietà | Mesi 1–2 | **Holding aziendale** e accesso al mercato dei token VTK | 4.000 euro |
| **Livello 30** | 16.500 | Vertice del settore NCC | Mese 3+ | **Commesse Istituzionali / Politiche** di massima rendita | 10.000 euro |

*(Nota sui numeri: le corse stimate considerano un incasso mediano di 80 euro a corsa nei primi livelli e di 250 euro nei livelli intermedi).*

---

### Principi economici e di interfaccia

#### 1. Gli sblocchi aprono spese, non regalano ricchezza
Il passaggio di livello non regala automobili o autisti: sblocca la *licenza* di acquistarli. Il costo del veicolo e lo stipendio dell'autista restano decisioni economiche che il giocatore deve finanziare con i propri incassi.

#### 2. Il premio in Euro è una mancia, non uno stipendio
Il bonus in Euro accreditato al passaggio di livello vale all'incirca quanto una singola corsa della fascia appena raggiunta. Serve a coprire le prime spese vive (benzina o riparazioni) senza svalutare il lavoro delle corse. Sull'intero arco dei 30 livelli, i bonus regalati ammontano a circa 55.000 euro complessivi; nello stesso lasso di tempo, un giocatore di livello 20 avrà fatturato oltre 300.000 euro con le corse ordinarie. I bonus incidono per meno del 18% sul totale circolante, proteggendo l'economia da spinte inflazionistiche.

#### 3. Schermate visibili, non nascoste
Nessuna sezione dell'interfaccia deve sparire o essere coperta da lucchetti opachi. Il giocatore al livello 1 deve poter cliccare su "Assunzioni" o "Concessionario", vedere i modelli di lusso e leggere con chiarezza: *«Richiede Livello 4 (Licenza Operatore Flotta)»*. Questo trasforma le schermate future in un catalogo di desideri e orienta le scelte di gioco.

#### 4. Monetizzazione pulita (Driver Coins)
I Driver Coins (acquistabili con denaro reale) non devono permettere di comprare Punti Esperienza o livelli aziendali. Possono essere usati per accelerare tempi di attesa o riparazioni, ma il Livello Aziendale certifica unicamente il tempo e l'abilità gestionale del giocatore.

---

## 3. Cosa serve per farlo

- **Chi lo fa:** Vlad, da solo.
- **Costi vivi:** 0 euro (si usano le tabelle Postgres di Supabase e i file JavaScript già presenti).
- **Tempo di sviluppo stimato:** 7–9 ore di lavoro complessivo, suddivisibili in due sessioni:

1. **Database Supabase (1 ora):** Aggiungere i campi `xp` (numero intero, valore iniziale 0) e `level` (numero intero, valore iniziale 1) nella tabella dei profili utente.
2. **Motore di gioco (`engine.js`, 3–4 ore):**
   - Inserire il calcolo di accredito XP al termine di ogni corsa completata.
   - Creare la funzione di controllo passaggio livello che confronta gli XP accumulati con la soglia, assegna il premio in Euro e aggiorna il valore `level`.
   - Inserire l'accredito XP per le azioni cardine (prima manutenzione, acquisto veicolo).
3. **Interfaccia utente (`ui-home.js` e moduli collegati, 3–4 ore):**
   - Sostituire il testo statico nell'intestazione con il badge del livello numerico e una barra orizzontale che mostra l'avanzamento verso il livello successivo (es. `XP: 45 / 90`).
   - Mostrare un avviso visivo non bloccante quando il livello sale (es. banner oro: *«Livello 3 Raggiunto — Secondo slot garage sbloccato (+120 €)»*).
   - Aggiungere il controllo sul livello minimo nei pulsanti di acquisto della seconda auto e del modulo assunzioni.

---

## 4. Come si vede se ha funzionato

- **Misura osservabile:** Percentuale di nuovi giocatori che raggiungono il **Livello 2 entro i primi 10 minuti** e il **Livello 3 entro le prime 24 ore** dalla creazione dell'account.
- **Traguardo numerico minimo:** Nei primi 50 test con giocatori reali, almeno il **75% degli utenti** che completano la registrazione deve raggiungere il Livello 3 prima di abbandonare la prima sessione di gioco prolungata.
- **Entro quando:** Entro la prima serie di test utente successiva all'aggiornamento dei file `engine.js` e `ui-home.js`.
- **Segnale di allarme:** Se oltre il 25% dei giocatori fa più di 6 corse restando fermo al Livello 1 o 2, significa che i valori di XP assegnati per corsa sono troppo bassi o che le condizioni di sblocco non sono spiegate chiaramente nell'interfaccia.

---

## 5. Cosa ti manca per essere sicuro

1. **La durata reale della prima corsa nel codice:** Non conoscendo il tempo esatto in minuti/secondi impostato per il primo tragitto urbano, la stima dei 3–5 minuti per raggiungere il Livello 2 potrebbe allungarsi eccessivamente se la corsa iniziale dura più di 10 minuti di tempo reale.
2. **Lo stato effettivo delle 11 funzioni spente dietro interruttore:** Delle 11 funzioni al momento non attive, dobbiamo verificare se l'officina (manutenzione) e il mercato autisti sono pronte e stabili. Se l'officina fa parte delle funzioni spente o instabili, lo sblocco del Livello 2 andrà agganciato provvisoriamente a un'altra azione funzionante (es. rifornimento carburante o acquisto accessori base).
3. **Il capitale iniziale esatto in Euro assegnato alla registrazione:** Se il denaro consegnato al minuto zero non è sufficiente per eseguire il primo rifornimento e coprire i costi vivi prima della riscossione della terza corsa, il giocatore rischia di bloccarsi prima del Livello 3.

---

## 6. Dove i miei specialisti non erano d'accordo

Tra i tre specialisti consultati sono emersi tre disaccordi netti:

### 1. Come si sale di livello: sole missioni guidate o punti esperienza continui sulle corse?
- **Lo specialista delle missioni** sosteneva che per i primi 5 livelli non si dovessero usare i Punti Esperienza, ma solo il completamento di compiti specifici (fare un tagliando, assumere un autista), per evitare che il giocatore accumuli livelli ripetendo sempre la stessa corsa facile.
- **Gli specialisti di economia e progressione** sostenevano invece l'uso esclusivo di Punti Esperienza legati a ogni corsa completata.
- **La mia decisione:** Ho scelto un **sistema a Punti Esperienza ibrido**. Ogni corsa dà XP, ma la prima manutenzione e il primo acquisto assegnano un bonus una tantum consistente (25–50 XP). In questo modo il contatore si muove sempre (garantendo il feedback psicologico a ogni corsa), ma il giocatore che segue le attività di gestione sale di livello molto più in fretta rispetto a chi clicca a ripetizione sulla stessa tratta breve.

### 2. Visibilità delle funzioni bloccate: nascondere le schermate o mostrarle con i requisiti?
- **Lo specialista della progressione** proponeva di bloccare l'accesso alle funzioni non ancora disponibili tramite avvisi restrittivi.
- **Lo specialista delle missioni** insisteva sul non nascondere nulla, mantenendo l'esperienza di un gestionale aperto in cui tutto è visibile ma regolato da licenze operative.
- **La mia decisione:** **Nessuna schermata viene nascosta.** Il giocatore può aprire tutte le sezioni di gioco attive. Se un elemento richiede un livello superiore (es. il secondo garage al livello 3), l'interfaccia mostra il cartellino con il prezzo, i requisiti e la dicitura esatta del livello necessario. Questo genera curiosità e fissa l'obiettivo della sessione successiva.

### 3. Assegnazione di Driver Coins (valuta premium) ai passaggi di livello
- **Lo specialista della progressione** caldeggiava un incentivo immediato e tangibile a ogni traguardo.
- **Lo specialista dell'economia** si è opposto con fermezza all'erogazione di Driver Coins ai livelli ordinari, per non erodere la monetizzazione reale di Vlad prima ancora del lancio.
- **La mia decisione:** **Zero Driver Coins sui livelli standard.** I passaggi di livello erogano esclusivamente Euro di gioco parametrati al costo delle corse. Un importo simbolico di Driver Coins (5 monete) potrà essere valutato esclusivamente ai grandi traguardi di lungo termine (livelli 10, 20 e 30) al solo scopo di mostrare il funzionamento del negozio premium, lasciando intatto il valore commerciale della valuta a pagamento.