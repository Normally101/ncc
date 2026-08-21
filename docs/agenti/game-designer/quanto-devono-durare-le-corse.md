<!-- Scritto da Game Designer (gemini-3.7-flash) il 21/08/2026, 21:59:16.
     Giudicato da Chief Financial Officer: promosso 9/10.
     Nessuno lo ha ancora letto. -->

# Documento di Design: Durata delle Corse e Ritmo di Ritorno

### 1. La risposta in tre righe
Sostituire la formula lineare con una curva a rendimento decrescente basata su radice quadrata ($Minuti = 10 + 3{,}8 \times \sqrt{Prezzo}$) eliminando il tetto artificiale a 6 ore.
Limitare la coda di ogni autista a un massimo di 8 ore di lavoro complessivo (o massimo 3 corse) invece di 10 corse libere, che oggi accumulano 32 ore di assenza forzata.
Fissare l'appuntamento ideale a **3 ore**: permette 3 o 4 accessi distribuiti nell'arco della giornata reale (mattina, pranzo, tardo pomeriggio, notte) senza trasformare il gioco in un lavoro d'ufficio.

---

### 2. Il ragionamento

#### La nuova curva: perché la radice quadrata risolve il tetto
Oggi il moltiplicatore `0,2` lineare applicato al prezzo crea due anomalie gravi:
1. Una corsa da 100 euro dura solo 20 minuti, ma una corsa da 1.800 euro ne dura 360 (6 ore).
2. Oltre i 1.800 euro scatta il tetto: il 12% delle tratte migliori (fino a 5.264 euro) viene appiattito a 6 ore esatte. Una tratta da 5.000 euro perde valore relativo perché non riflette la distanza e l'impegno della commessa.

La soluzione matematica è una curva concava (sub-lineare): al crescere del compenso, la durata aumenta sempre, ma a un ritmo progressivamente più lento.

$$\text{Durata (in minuti)} = 10 + 3{,}8 \times \sqrt{\text{Prezzo}}$$

Ecco come si distribuiscono i tempi con la nuova formula:
*   **Tratta economica (100 €):** $10 + 3{,}8 \times 10 = \mathbf{48\text{ minuti}}$ *(prima era 20 min)*
*   **Tratta urbana/intermedia (400 €):** $10 + 3{,}8 \times 20 = \mathbf{86\text{ minuti (1h 26m)}}$ *(prima era 80 min)*
*   **Tratta extraurbana media (900 €):** $10 + 3{,}8 \times 30 = \mathbf{124\text{ minuti (2h 04m)}}$ *(prima era 180 min)*
*   **Tratta importante (1.600 €):** $10 + 3{,}8 \times 40 = \mathbf{162\text{ minuti (2h 42m)}}$ *(prima era 320 min)*
*   **Tratta di lusso (2.500 €):** $10 + 3{,}8 \times 50 = \mathbf{200\text{ minuti (3h 20m)}}$ *(prima era bloccata a 360 min)*
*   **Tratta top di gamma (5.000 €):** $10 + 3{,}8 \times 70{,}7 = \mathbf{278\text{ minuti (4h 38m)}}$ *(prima era bloccata a 360 min)*

**Cosa cambia per il giocatore:**
- **Nessun tetto piatto:** Ogni tratta più ricca dura effettivamente di più, premiando la pianificazione.
- **Rendimento orario crescente:** Guadagni più euro per ogni minuto speso sulle tratte d'alta gamma (progressione naturale del modello gestionale).
- **Tempi umani:** La tratta più lunga dell'intero database (5.264 euro) passa da 6 ore piatte a circa 4 ore e 45 minuti.

---

#### Perché serve un ventaglio di durate (e non un tempo uniforme)
Un tempo uniforme (es. tutte le corse a 2 ore) distrugge la pianificazione quotidiana del giocatore. 
Il giocatore reale vive a scaglioni: la pausa caffè (15-45 min), la mattinata di lavoro (3-4 ore), la notte di sonno (7-8 ore).
*   **Corse brevi (45–60 min):** Servono per chi fa una sessione attiva da desktop o cellulare e vuole vedere un primo risultato prima di chiudere la scheda del browser.
*   **Corse medie (1h30 – 2h30):** Sono il perno del giorno. Assegni 1 o 2 tratte e ti ricolleghi a metà giornata.
*   **Corse lunghe (3h30 – 5h):** Si programmano prima di staccare o per la notte, massimizzando il fatturato a fronte di un'attesa lunga.

---

#### La riforma della coda: misurare le ore, non il numero di corse
Permettere 10 corse in coda con una media di 3 ore significa dare al giocatore **30-32 ore di autonomia passiva**. 
Se un giocatore dà ordini il lunedì mattina e l'autista lavora ininterrottamente fino a martedì sera:
1. Il giocatore non ha motivi psicologici per tornare nell'arco della giornata.
2. La memoria del gioco si spegne; alla seconda volta che salta un giorno, non torna più.

**La regola da adottare:**
*   La coda di ogni autista non deve superare **8 ore di durata cumulativa** (l'equivalente di un turno di lavoro reale).
*   In alternativa, se la gestione oraria via codice è complessa, limitare a **3 corse contemporanee in coda** per autista non potenziato.
*   *In questo modo, per saturare 8 ore serali il giocatore deve combinare con cura 2 o 3 corse lunghe, creando una decisione tattica prima di andare a dormire.*

---

#### Il ritorno ideale: 180 minuti (3 ore)
Il tempo di ritorno perfetto per il gioco a tempo reale è **3 ore**.
*   **Perché non 30 minuti:** Se la media fosse 30 minuti, il gioco pretenderebbe un'attenzione continua (ansia da notifica, incompatibile con il tempo reale e il lavoro d'ufficio).
*   **Perché non 6 ore:** Se la media fosse 6 ore, il giocatore aprirebbe il gioco solo due volte al giorno; alla terza settimana diventa un'abitudine fragile e scompare.
*   **Perché 3 ore:** Consente la classica routine: **08:30** (avvio prima di lavorare) $\rightarrow$ **12:30/13:30** (controllo a pranzo e incasso) $\rightarrow$ **17:30/18:30** (uscita lavoro, riposizionamento flotta) $\rightarrow$ **22:30** (impostazione turno notturno da 7-8 ore).

---

#### Cosa NON si deve fare (Trappole da evitare nel lungo termine)

1. **La trappola della durata calcolata sui chilometri stradali reali 1:1:**
   Far durare una tratta Milano-Roma 6 ore solo perché nella realtà ci vogliono 6 ore è un errore di design. Il giocatore cerca un ritmo d'interazione soddisfacente, non la telemetria di un tachigrafo.
2. **La trappola dell'iper-frazionamento (corse da 5-10 minuti continue):**
   Includere molte corse da 10 minuti per dare "azione" brucia la percezione del tempo reale. Il giocatore percepisce le attese sotto i 15 minuti come tempi morti fastidiosi, non come tempo reale su cui pianificare la giornata.
3. **La trappola della coda infinita sbloccabile con la valuta:**
   Vendere slot di coda infiniti permette a chi spende di impostare la flotta una volta a settimana. Il gioco incassa subito, ma perde ritenzione attiva e svuota la competizione sulle tratte.

---

### 3. Cosa serve per farlo

*   **Tempo di sviluppo stimato:** **3–4 ore di lavoro per Vlad.**
*   **Cosa toccare nel codice:**
    1. Modificare la funzione JavaScript / SQL che calcola la durata: sostituire `durata = Math.min(360, Math.max(10, prezzo * 0.2))` con `durata = Math.round(10 + 3.8 * Math.sqrt(prezzo))`.
    2. Modificare il controllo di accodamento (`queue`): verificare che la somma dei minuti residui delle corse già assegnate all'autista non superi 480 minuti (8 ore), oppure ridurre il limite statico dell'array da `10` a `3`.
*   **Costi:** **0 Euro.** Nessun servizio esterno o libreria aggiuntiva richiesta.

---

### 4. Come si vede se ha funzionato

Per verificare la bontà della formula servono dati su un gruppo di prova:

*   **Campione minimo:** 20–30 persone che giocano per almeno 5 giorni consecutivi.
*   **Metrica 1 (Frequenza di accesso):** La media degli accessi per giocatore attivo deve attestarsi tra **2,5 e 4 accessi al giorno**. Se la media è sotto 1,8, la coda è ancora troppo permissiva. Se è sopra 6, le corse brevi creano dipendenza da refresh ma frustrazione.
*   **Metrica 2 (Saturazione del catalogo tratte):** La percentuale di corse completate deve distribuirsi lungo tutto il catalogo. Nessuna durata deve superare il 20% del volume totale delle corse scelte (attualmente il 12% è schiacciato a 360 min).
*   **Finestra di osservazione:** 7 giorni dal rilascio della modifica nel gruppo di test.

---

### 5. Cosa ti manca per essere sicuro

1. **La distribuzione attuale dei prezzi nel database:** Abbiamo il dato sulla durata media (194 min) e mediana (155 min), ma non l'istogramma completo dei prezzi delle 2.033 tratte. Se ci fosse una sproporzione enorme di tratte sotto i 200 euro o sopra i 4.000 euro, il coefficiente moltiplicativo ($3{,}8$) andrebbe ricalibrato leggermente verso l'alto o verso il basso.
2. **Il consumo di energia/stanchezza dell'autista:** Non è specificato se l'autista dopo una corsa da 4 ore deve riposare per un tempo proporzionale prima della successiva, o se il riposo avviene solo a fine turno. Questo impatta direttamente sulla durata percepita del blocco di lavoro.
3. **Il tempo di scadenza delle offerte a catalogo:** Se le richieste di corsa restano disponibili sul tabellone per soli 15 minuti, il giocatore che torna ogni 3 ore trova un tabellone completamente rinnovato; se restano per 24 ore, rischia di trovare le stesse scelte non gradite.