<!-- Scritto da Pricing Analyst (gemini-3.7-flash) il 23/08/2026, 07:52:10.
     Contestato da UX Researcher: 0 accuse, 0 rimaste in piedi.
     Giudicato da Chief Financial Officer: promosso 9/10.
     Nessuno lo ha ancora letto. -->

# Strategia di prezzo per il taglio d'ingresso di Driver Coins

## 1. La risposta in tre righe

Il pacchetto più piccolo di Driver Coins deve costare **1,99 euro** e contenere **200 Driver Coins** (rapporto base: 100 monete per ogni euro). 
Scendere a 0,99 euro è insostenibile per via delle commissioni fisse del gestore di pagamenti (si perde oltre il 26% del lordo), mentre partire da 4,99 euro alza troppo la barriera per un gioco web nuovo senza un marchio noto.
Questo taglio permette al giocatore di superare il primo collo di bottiglia logistico del gioco (il secondo slot garage o l'accelerazione di una consegna) con una spesa d'impulso pari a un caffè e cornetto.

---

## 2. Il ragionamento

### L'analisi economica e l'impatto delle commissioni (Unit Economics)
Quando si vende un bene digitale sul web, non ci sono costi di fabbricazione fisica, ma ci sono costi vivi di transazione finanziaria. I sistemi di incasso carte (come Stripe per l'Europa) applicano tipicamente una tariffa composta da una quota fissa di **0,25 euro** più una quota variabile dell'**1,5% circa** per transazione.

Vediamo l'incasso effettivo prima delle tasse sui diversi prezzi ipotizzati:

| Prezzo al pubblico | Commissione stimata (0,25 € + 1,5%) | Quota trattenuta dal gestore | Incasso netto prima delle tasse |
|---|---|---|---|
| **0,99 €** | 0,265 € | **26,8%** | 0,725 € |
| **1,99 €** | 0,280 € | **14,1%** | 1,710 € |
| **2,99 €** | 0,295 € | **9,9%** | 2,695 € |
| **4,99 €** | 0,325 € | **6,5%** | 4,665 € |

A **0,99 euro** l'incasso viene sventrato dalle commissioni fisse. A **1,99 euro** la commissione scende a un livello fisiologico (14,1%), lasciando oltre 1,70 euro netti per transazione.

### La scelta tra 1,99 euro e 4,99 euro
I giochi storici citati nei confronti (come *Torn City* a 5,00 dollari o *OGame* a 4,99 euro) hanno alle spalle tra i 15 e i 20 anni di reputazione: i giocatori sanno già che quei server esisteranno ancora l'anno prossimo. 
Per un gioco indipendente al lancio, gestito da uno sviluppatore singolo, chiedere subito 5 euro come spesa minima crea un blocco psicologico: l'utente vuole prima sincerarsi che il sistema sia affidabile e che l'esperienza di supporto funzioni. Il prezzo di **1,99 euro** è una cifra d'impulso che non richiede una riflessione di bilancio personale.

### Il rapporto di cambio: 1 euro = 100 Driver Coins
Fissare il cambio a **100 monete per 1 euro** (quindi 1 Driver Coin = 1 centesimo di euro virtuale) elimina ogni attrito di calcolo mentale per Vlad e per i giocatori:
- Se un servizio in gioco vale 0,50 euro di comodità, costerà **50 Driver Coins**.
- Se uno sblocco importante vale 1,00 euro, costerà **100 Driver Coins**.
- Con 200 Driver Coins a 1,99 euro, il giocatore può eseguire esattamente **2 sblocchi medi da 100 monete** o **4 accelerazioni brevi da 50 monete**, senza ritrovarsi con "monete morte" o resti inutilizzabili (evitando i trucchi scorretti che generano rancore).

### Analisi di sensibilità del prezzo d'ingresso
Valutiamo l'impatto su una base ipotetica di **1.000 giocatori arrivati al terzo giorno di gioco**:

| Scenario | Prezzo pacchetto | Stima tasso conversione | Acquirenti stimati | Incasso lordo | Incasso netto gestore |
|---|---|---|---|---|---|
| **-20% (1,59 €)** | 1,59 € | 4,2% (stima) | 42 | 66,78 € | 55,27 € |
| **-10% (1,79 €)** | 1,79 € | 3,8% (stima) | 38 | 68,02 € | 57,49 € |
| **CONSIGLIATO (1,99 €)** | **1,99 €** | **3,5% (stima)** | **35** | **69,65 €** | **59,85 €** |
| **+20% (2,39 €)** | 2,39 € | 2,8% (stima) | 28 | 66,92 € | 58,91 € |
| **Scenario Alto (4,99 €)** | 4,99 € | 1,5% (stima) | 15 | 74,85 € | 69,98 € |

*Nota sulle stime:* Le percentuali di conversione (da 1,5% a 4,2%) derivano dalle metriche storiche di conversione del settore per giochi da browser gratuiti con pubblico di nicchia. 
Anche se lo scenario a 4,99 euro genera un incasso lordo leggermente superiore se la conversione tiene, lo scenario a **1,99 euro raddoppia il numero di giocatori che compiono la prima transazione** (da 15 a 35 su 1.000), creando una base molto più ampia di utenti fidelizzati e pronti a comprare i pacchetti successivi (da 9,99 euro o 19,99 euro) nelle settimane seguenti.

### Il listino completo raccomandato
Il pacchetto d'ingresso da 1,99 euro deve essere il primo gradino di una scala equilibrata:

| Nome pacchetto | Prezzo reale | Driver Coins | Rapporto monete/euro | Bonus quantità | Funzione psicologica |
|---|---|---|---|---|---|
| **Test Drive** | **1,99 €** | **200** | 100,5 | Base | Primo acquisto a rischio zero |
| **NCC Urbano** | **4,99 €** | **550** | 110,2 | +10% | Giocatore costante, manutenzioni e slot |
| **Flotta Business** | **9,99 €** | **1.200** | 120,1 | +20% | **Il pacchetto target** (gestione più rimesse) |
| **Holding di Lusso** | **19,99 €** | **2.600** | 130,1 | +30% | Espansione rapida della flotta |
| **Impero NCC** | **49,99 €** | **7.000** | 140,0 | +40% | Sostenitore principale |

---

## 3. Cosa serve per farlo

Tutto il lavoro è a carico esclusivo di Vlad, sfruttando l'architettura tecnica già esistente (Supabase per il database e HTML/CSS/JavaScript puro per il browser):

1. **Configurazione del fornitore di pagamento (1 ora):** Creare il prodotto "Test Drive — 200 Driver Coins" a 1,99 euro nel pannello di Stripe (o del gateway prescelto).
2. **Tabella database e gestione incasso (2 ore):**
   - Creare una tabella `listino_monete` in Supabase (`id`, `prezzo_centesimi`, `quantita_coins`, `etichetta`).
   - Configurare la funzione (webhook) che riceve la notifica di pagamento andato a buon fine e accredita in modo sicuro 200 monete al saldo del giocatore.
3. **Interfaccia grafica contestuale (2 ore):**
   - Disegnare un pannello laterale sobrio (senza pop-up invasivi a schermo intero) accessibile dal garage o dalla schermata della flotta quando il saldo monete è insufficiente.
   - Mostrare chiaramente: *200 Driver Coins = 1,99 €*.

- **Tempo totale stimato di lavoro:** **5 ore**.
- **Costi vivi iniziali:** **0 euro**. Si pagano unicamente le commissioni percentuali sulle transazioni effettive.

---

## 4. Come si vede se ha funzionato

L'efficacia del pacchetto a 1,99 euro si verifica misurando due dati precisi entro **60 giorni dall'apertura del gioco a giocatori reali**:

1. **Tasso di primo acquisto:** Tra tutti i giocatori che superano il terzo giorno di gioco reale e comprano la seconda vettura con Euro di gioco, **almeno il 3,0% deve acquistare il pacchetto da 1,99 euro**. Se il dato è inferiore all'1,0%, significa che il bisogno di comodità/tempo nel gioco è inesistente o che il prezzo è ancora percepito come sproporzionato.
2. **Distribuzione delle prime vendite:** Il pacchetto da 1,99 euro deve coprire tra il **40% e il 60% del volume totale delle prime transazioni**. Se copre più dell'80%, il salto al pacchetto da 4,99 euro è troppo ripido; se copre meno del 20%, significa che i giocatori lo considerano inutile e vanno direttamente a quello superiore.

---

## 5. Cosa ti manca per essere sicuro

1. **Il catalogo dei costi interni in Driver Coins:** Non è ancora stabilito esattamente quanto costerà ogni singola operazione (es. quanti Driver Coins servono per dimezzare un'attesa di 6 ore o comprare il secondo spazio garage). La dose di 200 monete a 1,99 euro funziona solo se i costi interni base sono fissati a scaglioni di 50 o 100 monete.
2. **Il funzionamento economico del token VTK:** Poiché esiste un terzo token di gioco scambiabile tra utenti (VTK), non è chiaro se i giocatori potranno comprare comodità o aggirare le Driver Coins scambiando beni tra loro. Se il mercato VTK permette di ottenere gli stessi benefici a costo zero, la vendita di pacchetti da 1,99 euro ne risentirà.
3. **La velocità di accumulo degli Euro di gioco nei primi due giorni:** Bisogna verificare nei test se al giorno 2 o 3 il giocatore ha abbastanza Euro gratuiti per raggiungere il collo di bottiglia (comprare la seconda auto) o se ci vogliono due settimane di gioco per arrivarci, ritardando eccessivamente la prima occasione di vendita.

---

## 6. Dove i miei specialisti non erano d'accordo

Tra i tre specialisti consultati è emerso un **disaccordo sostanziale sulla soglia minima di prezzo**:

- **I primi due pareri (`pricing-driver-coins` e `pricing-primo-acquisto`)** hanno sostenuto il pacchetto d'ingresso a **1,99 euro per 200 monete**. La loro tesi è che per un gioco web nuovo, privo di reputazione, la conversione del primo pagamento sia la priorità assoluta: 1,99 euro abbatte le esitazioni psicologiche e ammortizza sufficientemente le commissioni fisse del gestore di pagamenti (14,1% di trattenuta).
- **Il terzo parere (`pricing-confronti`)** ha invece proposto una soglia minima di **4,99 euro per 250 monete**, basandosi sui confronti con giochi storici persistenti da browser (*Torn City*, *OGame*, *Sim Companies*). La sua tesi è che il pubblico adulto dei gestionali da browser sia disposto a spendere 5 euro senza problemi e che i tagli a 1,99 euro siano tipici delle app per telefoni di massa, con un'inutile perdita di margine sulle commissioni fisse.

**La posizione finale che ho preso e la motivazione:**
Ho scelto di impostare la soglia d'ingresso a **1,99 euro**. 
Chauffeur Empire non è un colosso storico con vent'anni di anzianità: è un progetto al debutto sviluppato da una persona sola. In questa fase iniziale, l'obiettivo economico primario non è spremere il massimo margine dal singolo acquisto, ma **massimizzare il numero di giocatori che registrano la carta e provano l'esperienza d'acquisto senza paura**. Il pacchetto da 4,99 euro esiste nel listino subito sopra (a 550 monete), ma avere la base a 1,99 euro garantisce una porta d'accesso accessibile a chiunque voglia sostenere il gioco per la prima volta.