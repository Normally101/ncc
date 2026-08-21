<!-- Scritto da UX Researcher (gemini-3.7-flash) il 21/08/2026, 19:59:48.
     Giudicato da Game Designer: promosso 9/10.
     Nessuno lo ha ancora letto. -->

# Analisi UX: I punti critici di abbandono al primo accesso su Chauffeur Empire

---

### 1. La risposta in tre righe

Un giocatore nuovo abbandona nei primi 5 minuti perché si trova davanti a troppi sistemi sbloccati senza capire come avviare e completare la prima corsa, o perché il tempo reale (24h = 24h) lo lascia fermo ad aspettare senza un obiettivo immediato. Propongo di bloccare l'interfaccia iniziale su un solo flusso guidato ("Compra auto di base → Assegna autista → Accetta corsa → Riscuoti"), inserendo una prima corsa istantanea per dare subito la sensazione di progresso. Per verificare dove la gente molla, basta tracciare 5 passaggi chiave via codice nel database Supabase.

---

### 2. Il ragionamento

Chauffeur Empire ha una forte componente strategica (auto, autisti, tre valute diverse, immobili, politica), ma il rischio di paralisi da scelta (*decision fatigue*) per chi entra è altissimo. Quando un giocatore apre un gestionale via browser su smartphone o computer, cerca un ciclo di azione-ricompensa immediato entro i primi 90–120 secondi.

Ecco i 4 punti critici dove un giocatore nuovo molla, ordinati dal più grave al meno grave:

```
[Accesso] ──> (1) Paradosso del tempo reale ──> (2) Confusione economica ──> (3) Disorientamento su Mappa/UI ──> (4) Sovraccarico politico/immobiliare
```

#### Punto 1 (Gravità Massima): Il paradosso del tempo reale al minuto zero
* **Perché molla:** Il gioco scorre in tempo reale (24 ore reali = 24 ore di gioco). Se un utente nuovo entra, spende i suoi fondi iniziali, manda l'autista a fare una corsa che richiede 45 minuti reali e la schermata gli dice semplicemente "in viaggio", l'utente chiude la scheda del browser e non torna più. La prima sessione non ha prodotto alcuna gratificazione.
* **Cosa succede nella mente dell'utente:** *"Ho cliccato due bottoni, ora non c'è più niente da fare, non so nemmeno se ho fatto la cosa giusta."*
* **Soluzione UX:** La prima corsa (il prologo) non deve seguire il tempo reale. Deve durare 10-15 secondi, oppure completarsi all'istante dopo un breve testo/animazione, per far vedere subito come entrano gli Euro e come sale la barra di reputazione.

#### Punto 2 (Gravità Alta): La confusione tra tre economie (Euro, Driver Coins, VTK)
* **Perché molla:** Mostrare subito tre portafogli diversi genera ansia e fa sembrare il gioco un sistema finanziario ostico o una trappola a pagamento. L'utente non sa quale moneta serve per riparare l'auto, quale per fare benzina, e si chiede perché esista un token (VTK) se ha appena una sola berlina scassata.
* **Cosa succede nella mente dell'utente:** *"Devo pagare soldi veri subito? Cos'è VTK? È troppo complicato, lascio perdere."*
* **Soluzione UX:** Nascondere visivamente VTK e Driver Coins fino a quando l'utente non raggiunge un livello base (es. Flotta di 3 auto o Livello 3). Al debutto, l'utente deve vedere solo e soltanto gli **Euro di gioco**.

#### Punto 3 (Gravità Media): Disorientamento tra Mappa (Mapbox) e Pannelli di Gestione
* **Perché molla:** Su smartphone, una mappa interattiva Mapbox con elementi gestionali sopra rischia di catturare i tocchi per lo spostamento della visuale invece che per selezionare i menu. Se l'utente non capisce se deve cliccare sulla mappa o aprire un menu laterale per trovare clienti, si blocca.
* **Cosa succede nella mente dell'utente:** *"Vedo la mappa della città, ci sono icone, ma non so quale sia il prossimo pulsante da premere."*
* **Soluzione UX:** Finché non c'è una corsa attiva, inserire un unico pulsante di azione primaria visibile e contrastato in basso al centro: **"Trova Nuova Corsa"**, riducendo lo zoom della mappa al solo raggio d'azione dell'auto iniziale.

#### Punto 4 (Gravità Bassa/Media): Sovraccarico di funzioni premature (Immobili, Holding, Politica)
* **Perché molla:** Delle 21 funzioni del gioco, 10 sono accese. Se tra queste 10 ci sono schermate per comprare uffici, fare lobbying o creare holding, chi inizia "da povero" si sente fuori posto e sopraffatto da opzioni che non può permettersi.
* **Soluzione UX:** Mantenere spente o oscurate tutte le sezioni che richiedono capitali elevati. L'interfaccia deve mostrare solo: Garage, Autisti, Contratti/Corse.

---

### 3. Cosa serve per farlo

Tutto l'intervento può essere realizzato direttamente da Vlad, senza spese vive né strumenti a pagamento esterni.

| Attività | Cosa fare a livello pratico | Tempo stimato (ore di lavoro) | Costo |
| :--- | :--- | :--- | :--- |
| **Tracciamento su Supabase** | Creare una tabella `funnel_onboarding` su Supabase che registra un timestamp quando l'utente: <br>1. Crea account<br>2. Compra prima auto<br>3. Accetta prima corsa<br>4. Incassa prima corsa<br>5. Torna per la seconda sessione (dopo 12+ ore). | **4 - 6 ore** | **0 €** (incluso nel piano Supabase) |
| **Corsa introduttiva rapida** | Modificare la logica della prima corsa tutorial assegnando durata = 10 secondi nel file JS di gestione corse. | **3 - 4 ore** | **0 €** |
| **Pulizia interfaccia iniziale** | Nascondere via CSS/JS i contatori di Driver Coins e VTK per gli account con meno di 5 corse completate; evidenziare il tasto della prima azione. | **4 - 5 ore** | **0 €** |
| **Test manuale su smartphone** | Testare l'onboarding su un telefono Android e un iPhone economico per verificare che Mapbox non interferisca con i tocchi. | **3 ore** | **0 €** |

* **Totale impegno:** Circa **15–18 ore di lavoro complessive** (circa 2-3 giorni lavorativi per una persona sola).
* **Budget monetario:** **0 €**.

---

### 4. Come si vede se ha funzionato

Per verificare l'efficacia non servono sondaggi, ma l'osservazione diretta dei dati nel database Supabase.

* **La metrica chiave:** Il tasso di completamento del primo ciclo (dalla registrazione al primo incasso in Euro).
* **Il fatto osservabile:** Su un campione di prova di 20 persone nuove che aprono il link:
  * **Obiettivo minimo di successo:** Almeno **14 su 20 (70%)** devono riuscire a completare la prima corsa e incassare gli Euro senza chiedere spiegazioni a Vlad.
  * **Comportamento di ritorno:** Almeno **6 su 20 (30%)** devono riaprire il gioco il giorno successivo per verificare lo stato della flotta o avviare una seconda corsa a tempo reale.
* **Entro quando:** Entro **7 giorni** da quando il flusso modificato viene testato con i primi 20 contatti/giocatori di prova.

Se il dato di completamento della prima corsa rimane sotto il 50%, significa che il blocco non è la comprensione concettuale, ma un difetto di interfaccia (un pulsante poco visibile o un bug nel codice JavaScript su mobile).

---

### 5. Cosa ti manca per essere sicuro

Per avere un quadro perfetto e togliere ogni margine di stima, mancano le seguenti informazioni:

1. **Quali sono esattamente le 10 funzioni attualmente accese?**  
   *Se tra queste 10 ci sono già il mercato VTK o il sistema delle holding, la probabilità di confusione immediata cresce notevolmente.*
2. **Come gestisce il gioco le notifiche quando il giocatore è offline?**  
   *Dato che il tempo reale dura 24 ore, senza notifiche del browser (Web Push) o email che avvisano che "La corsa è finita, l'autista è libero", il giocatore rischia di dimenticarsi di tornare.*
3. **Cosa vede esattamente l'utente al primissimo secondo dopo il login?**  
   *Si atterra sulla mappa vuota, dentro il garage, o in un pannello di testo? L'angolo visivo iniziale determina dove cade l'attenzione nei primi 3 secondi.*
4. **Le prestazioni di Mapbox sui telefoni di fascia bassa.**  
   *Non sappiamo se il caricamento della mappa su browser mobile provochi rallentamenti o scatti che inducono l'utente a chiudere prima ancora che l'interfaccia sia reattiva.*