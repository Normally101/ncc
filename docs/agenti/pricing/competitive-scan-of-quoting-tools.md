<!-- Scritto da Pricing Analyst (gemini-3.7-flash) il 23/08/2026, 07:52:15.
     Contestato da UX Researcher: 0 accuse, 0 rimaste in piedi.
     Giudicato da Chief Financial Officer: bocciato 6/10.
     Nessuno lo ha ancora letto. -->

# Strategia di Prezzo e Monetizzazione: Listini, Primo Acquisto e Difesa dei Margini

## 1. La risposta in tre righe

Adotta un listino ordinario a 5 scaglioni psicologici (4,99 €, 9,99 €, 19,99 €, 49,99 €, 99,99 €) ancorato a 100 Driver Coins per euro base con un tetto massimo di sconto del +30% sui volumi alti. 
Affianca al listino un unico "Pacchetto Avvio NCC" una tantum a 2,49 € che sblocca il secondo slot auto e 50 monete, attivato solo contestualmente al primo collo di bottiglia temporale (auto occupata su corsa VIP). 
I Driver Coins devono acquistare esclusivamente risparmio di tempo (automazioni, code, preventivatore interno) e prestigio visivo, delegando l'accesso alla valuta di gioco solo allo scambio tra giocatori tramite token VTK.

---

## 2. Il ragionamento

### Il modello di conversione e la struttura dei prezzi
Nei giochi gestionali asincroni e persistenti su browser con tempo reale 1:1, il prezzo non si calcola sui costi vivi di produzione del bene digitale (che sono marginalmente nulli), ma sull'attrito decisionale, sui costi di incasso e sul valore percepito del tempo risparmiato dal giocatore.

Proponiamo una struttura a due canali:
1. **Offerta contestuale di benvenuto (Canale di rottura):** un pacchetto d'avvio a **2,49 €** proposto una sola volta per account nel momento in cui l'utente sbatte contro il vincolo dell'unica auto impegnata in un viaggio lungo.
2. **Listino ordinario a catalogo (Canale ricorrente):** 5 pacchetti di Driver Coins accessibili dallo store di gioco.

#### Tabella del Listino Ordinario Proposto

| Nome Pacchetto | Prezzo Lordo | Driver Coins Base | Monete Bonus | Driver Coins Totali | Monete per Euro | Bonus % |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Starter** | 4,99 € | 500 | 0 | 500 | 100,2 | 0% (Base) |
| **Manager** | 9,99 € | 1.000 | 100 | 1.100 | 110,1 | +10% |
| **Director (Consigliato)** | 19,99 € | 2.000 | 400 | 2.400 | 120,1 | +20% |
| **Tycoon** | 49,99 € | 5.000 | 1.250 | 6.250 | 125,0 | +25% |
| **Empire** | 99,99 € | 10.000 | 3.000 | 13.000 | 130,0 | +30% |

#### I tre principi economici fondamentali

1. **La protezione del margine contro i costi di incasso:**
   I processori di pagamento (come Stripe in Europa) applicano una tariffa tipica di **0,25 € fissi + 1,5% sul transato** per carte consumer europee. 
   - Su un micro-taglio da 0,99 €, la commissione pesa per 0,265 €, mangiando circa il 27% dell'incasso lordo.
   - Su 2,49 € (pacchetto avvio), la commissione pesa per 0,287 € (circa 11,5% dell'incasso).
   - Su 4,99 € (taglio base), la commissione scende a 0,325 € (circa 6,5% dell'incasso).
   Impedire micro-transazioni sotto i 2,49 € evita di processare volume di cassa sterile e posiziona Chauffeur Empire come prodotto di fascia curata.

2. **Il tetto al bonus quantità (+30% massimo):**
   Molti concorrenti raddoppiano o triplicano la valuta sui pacchetti da 100 € (+100% o +200%). Questo crea iperinflazione interna, distrugge il valore percepito del pacchetto da 5 € o 10 € e spinge chi spende poco a sentirsi penalizzato. Limitare il vantaggio al +30% sul taglio massimo tutela il potere d'acquisto dei piccoli spenditori mantenendo comunque allettante l'investimento per chi vuole spendere cifre alte.

3. **La barriera contro il gioco sleale (Pay-to-Win):**
   I Driver Coins **non devono mai comprare direttamente gli Euro di gioco** né auto esclusive con costi di manutenzione azzerati. Devono sbloccare:
   - *Comodità gestionale:* code per programmare tragitti notturni, un centralinista virtuale per l'assegnazione automatica, strumenti avanzati di preventivazione e telemetria costi.
   - *Rappresentanza:* livree speciali per le berline, sedi aziendali di lusso sulla mappa Mapbox.
   - *Accesso al mercato:* chi vuole convertire Driver Coins in Euro di gioco deve acquistare token VTK e venderli sul mercato aperto ad altri giocatori in cambio di moneta di gioco reale. In questo modo la moneta circolante deriva sempre e solo dal lavoro effettivo svolto dalle auto, proteggendo l'economia dall'inflazione artificiale.

---

### Analisi di Sensibilità del Prezzo Base (±20%)

Prendendo come riferimento il pacchetto intermedio consigliato (**Director**, prezzo base 19,99 €), simuliamo l'impatto sul ricavo netto stimato considerando l'elasticità della domanda tipica dei browser game gestionali.

*Ipotesi di calcolo su un campione stimato di 1.000 visitatori unici dello store di gioco con costo di transazione Stripe pari a 0,25 € fissi + 1,5%:*

| Scenario Prezzo | Prezzo al Pubblico | Tasso di Conversione Stimato | Acquirenti Stimati | Incasso Lordo | Costi Transazione (Stripe) | Ricavo Netto | Variazione Ricavo Netto vs Base |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **-20%** | 15,99 € | 4,2% | 42 | 671,58 € | 20,57 € | 651,01 € | -10,3% |
| **-10%** | 17,99 € | 3,8% | 38 | 683,62 € | 19,76 € | 663,86 € | -8,5% |
| **Base Consigliato** | **19,99 €** | **3,5%** | **35** | **699,65 €** | **19,25 €** | **725,40 €** | **0,0% (Riferimento)** |
| **+10%** | 21,99 € | 3,0% | 30 | 659,70 € | 17,40 € | 642,30 € | -11,5% |
| **+20%** | 23,99 € | 2,4% | 24 | 575,76 € | 14,64 € | 561,12 € | -22,6% |

**Commento all'analisi:**
La fascia 19,99 € rappresenta l'ottimo di cattura del valore. Scendere a 15,99 € aumenta le conversioni (+20% in volume), ma non abbastanza da compensare la perdita di 4 € netti a carrello (-10,3% di ricavo complessivo). Salire a 23,99 € supera la barriera psicologica dei venti euro per il pubblico europeo, provocando un calo marcato degli acquirenti (-31% in volume) che erode pesantemente il margine (-22,6%).

---

## 3. Cosa serve per farlo

Tutto il lavoro è calibrato per essere eseguito da Vlad in totale autonomia, senza budget per consulenze esterne né costi fissi di licenza.

### Risorse e Competenze
- **Chi lo fa:** Vlad, da solo.
- **Competenze richieste:** Modifica tabelle Postgres (Supabase), logica JavaScript frontend nativo (senza framework), configurazione standard di Stripe Checkout.

### Piano di Lavoro e Tempi Stimati
1. **Configurazione Dati e Pagamenti su Supabase (Tempo stimato: 4 ore):**
   - Creazione della tabella `coin_packages` su Postgres con campi per id, nome, prezzo in centesimi di euro, monete base e monete bonus.
   - Creazione colonna `has_purchased_starter_pack` (valore booleano) nella tabella profili utente.
   - Configurazione di due funzioni backend (Supabase Edge Functions) per generare la sessione di pagamento Stripe e gestire il webhook di notifica pagamento confermato.
2. **Sviluppo Schermata Negozio e Modale di Avvio (Tempo stimato: 5 ore):**
   - Creazione interfaccia HTML/CSS con griglia a 5 schede per i pacchetti ordinari, evidenziando il taglio da 19,99 € come "Scelta Consigliata".
   - Sviluppo della modale interattiva di blocco flotta che propone il pacchetto d'avvio da 2,49 € quando un utente con una sola auto tenta di accettare una corsa mentre è già in viaggio.
3. **Collaudo Flussi di Pagamento (Tempo stimato: 3 ore):**
   - Test end-to-end con carte di prova Stripe per verificare l'accredito immediato di Driver Coins e slot veicolo senza necessità di ricaricare la pagina web.

**Tempo totale stimato:** **12 ore di lavoro complessive** (circa 2 giornate di sviluppo).
**Costi vivi iniziali:** **0 euro**. Si applicano unicamente le tariffe a percentuale per transazione incassata su Stripe.

---

## 4. Come si vede se ha funzionato

### 1. Pacchetto d'Avvio (2,49 €)
- **Metrica:** Tasso di conversione sulla modale di collisione flotta (acquisti divisi per visualizzazioni uniche della schermata).
- **Traguardo minimo:** **Non meno del 5,0%** di conversione tra gli utenti che raggiungono almeno 24 ore di iscrizione.
- **Orizzonte di verifica:** **Entro 30 giorni** dal raggiungimento dei primi 150 giocatori attivi unici.
- **Soglia di allarme:** Se dopo 100 visualizzazioni uniche si registrano meno di 2 acquisti (sotto il 2,0%), occorre verificare se il processo di pagamento ha intoppi tecnici o se il secondo veicolo temporaneo non è percepito come utile.

### 2. Listino Ordinario (da 4,99 € a 99,99 €)
- **Metrica primaria:** Valore medio per transazione sullo store (ricavo totale diviso numero di transazioni ordinarie).
- **Traguardo atteso:** Valore compreso **tra 14,00 € e 22,00 €**, a conferma che il pacchetto da 19,99 € agisce da effettivo baricentro degli acquisti.
- **Metrica secondaria:** Quota del pacchetto base da 4,99 € inferiore al 50% delle transazioni ordinarie totali (se supera l'80%, gli scaglioni superiori non offrono incentivi sufficienti).
- **Orizzonte di verifica:** **Entro 60 giorni** dal lancio pubblico con almeno 500 utenti registrati attivi.

---

## 5. Cosa ti manca per essere sicuro

1. **Durata e bilanciamento delle prime corse nel codice attuale:** Non è nota la durata reale delle missioni tutorial e delle prime corse generate. Se le corse del primo giorno durano meno di 10 minuti, il giocatore non avverte il blocco dell'auto occupata e la proposta a 2,49 € perde efficacia. Se durano più di 4 ore al primissimo avvio, il tasso di abbandono precoce dal gioco potrebbe salire prima ancora di mostrare l'offerta.
2. **Costi operativi unitari per giocatore attivo:** Mancano i dati precisi sul costo al millesimo generato da ciascun utente per le chiamate all'interfaccia mappe di Mapbox e per le connessioni in tempo reale a Supabase. Conoscere questo dato serve a stabilire il costo di mantenimento per singolo utente non pagante.
3. **Catalogo dei prezzi interni in Driver Coins:** Non è presente l'elenco definitivo dei costi di spesa delle funzioni di comodità (es. costo per assumere un centralinista per 7 giorni o costo per sbloccare la telemetria di flotta). Senza questa tabella non si può calcolare con precisione l'asimmetria del resto (quante monete rimangono inutilizzate nel saldo del giocatore dopo il primo utilizzo).
4. **Stato dell'integrazione di pagamento:** Non è specificato se esista già un account commerciale Stripe con anagrafica aziendale validata e webhook configurati o se la configurazione bancaria e fiscale debba partire da zero.

---

## 6. Dove i miei specialisti non erano d'accordo

Durante l'analisi della strategia di prezzo sono emersi due disaccordi sostanziali tra i tre specialisti consultati:

### Disaccordo 1: Architettura del Listino Ordinario (5 scaglioni a terminazione decimale vs 3 livelli a cifra tonda)
- **La divergenza:** L'analista dei pacchetti monete (`pricing-driver-coins`) ha raccomandato un listino a **5 scaglioni** con terminazione classica a virgola novantanove (4,99 €, 9,99 €, 19,99 €, 49,99 €, 99,99 €). L'analista dei confronti di mercato (`pricing-confronti`) ha invece sostenuto una struttura più snella a soli **3 livelli** con prezzi non convenzionali (4,50 €, 12,50 €, 28,00 €), pensati per coprire direttamente funzioni fisse di 30 giorni.
- **La mia decisione come Pricing Analyst:** **Scelgo la struttura a 5 scaglioni (4,99 € – 99,99 €).**
  *Motivazione:* Nei giochi da browser, il listino a 5 fasce massimizza l'estrazione di valore segmentando meglio la disponibilità a spendere dei vari profili di giocatori (dal giocatore occasionale al grande investitore "balena" che vuole spendere 100 € subito). Inoltre, i prezzi a terminazione `,99 €` sono lo standard psicologico consolidato per gli acquisti digitali consumer in Italia ed Europa, riducendo le esitazioni al momento del clic. Limitare il listino a 28 € lascerebbe denaro sul tavolo precludendo incassi elevati dai giocatori più competitivi.

### Disaccordo 2: Opportunità e Prezzo del Pacchetto d'Avvio (Nessun micro-taglio vs Pacchetto contestuale a 2,49 €)
- **La divergenza:** L'analista del listino monete (`pricing-driver-coins`) ha categoricamente escluso la vendita di pacchetti sotto i 4,99 €, sostenendo che tagli inferiori svalutano l'ambientazione di lusso e vengono erosi dalle commissioni bancarie fisse. L'analista del primo acquisto (`pricing-primo-acquisto`) ha insistito per un'offerta di sblocco rapido a **2,49 €** mirata esclusivamente a superare il primo collo di bottiglia del garage vuoto.
- **La mia decisione come Pricing Analyst:** **Scelgo di introdurre il Pacchetto d'Avvio a 2,49 €, ma con regole ferree.**
  *Motivazione:* 4,99 € rappresenta una barriera d'ingresso troppo alta per un giocatore che naviga su un browser game indipendente e non conosce ancora la profondità del titolo. Il pacchetto a 2,49 € non vende valuta generica a sconto (cosa che distruggerebbe il listino principale), ma vende una **soluzione operativa immediata** (il secondo veicolo a noleggio per non restare fermi mentre la prima auto è in viaggio). Con una commissione Stripe stimata a circa 0,29 €, il ricavo netto residuo è di 2,20 € per transazione: un margine del tutto accettabile per trasformare un visitatore scettico in un cliente pagante verificato.