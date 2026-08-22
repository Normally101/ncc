# HQ — proposta di design per riaprire il Quartier Generale

Data: 22/08/2026 · Autore: Game Designer (agente) · Stato: proposta, nessun codice toccato.

## 1. Cosa fa oggi l'HQ

L'HQ (`hq.js` + `hq-data.js`) è un base-builder classico: 5 città (`HQ_CITIES` — Roma, Milano, Firenze, Napoli, Venezia), ognuna con una griglia di slot fissi, in cui si costruiscono 6 tipi di stanza (`HQ_ROOMS`): Garage, Officina, Sala Missioni, Torre di Controllo, Penthouse, VIP Lounge (quest'ultima solo a Firenze). Ogni stanza ha 3-5 livelli, ognuno con un costo in cash, un requisito di reputazione (`reqRep`) e un effetto permanente. Gli effetti sono sommati da `hqAllEffects()` in un unico oggetto (`extraVehicleSlots`, `driverXpMult`, `autoRepairDaily`, `vipRideBonus`, `allEarningsMult`, `dailyMoraleBonus`, `freeEVRecharge`, `helicopterRideGateOverride`...) e toccano il resto del gioco in due soli punti: `window._hqDailyTick()` (riparazione auto, morale autisti, ricarica EV gratuita — chiamato da `processDailyRoutines`) e `engine-rides.js:785`, dove `allEarningsMult` e `vipRideBonus` entrano nel calcolo del guadagno di ogni corsa.

È interamente single-player: nessun altro giocatore vede, visita o è toccato dall'HQ di qualcuno. C'è già una parte visiva — `hq-visual-placeholder` chiama `renderHQCampus()` (diorama del campus) — ma è un pannello decorativo, non un luogo che esiste per qualcun altro.

Il costo passa correttamente da `window.CE_money.spend(nextTier.cost, 'hq_upgrade')` e i bonus di reputazione da `window.CE_money.addReputation(delta)`: quindi, a differenza di quanto dice ancora il commento in `config.js` (che descrive un bug precedente — la spesa scalava solo in locale, senza sync col server, per cui al reload il costo tornava indietro ma la stanza restava costruita gratis), il codice *oggi* nel file usa già il canale giusto. L'interruttore `HQ_ENABLED = false` sembra quindi più uno stato "non ancora verificato nel banco di prova" che un bug bloccante concreto — va comunque testato, non dato per buono a occhio.

## 2. Perché non basta

Il problema non è tecnico, è di design: **ogni effetto che l'HQ produce, lo produce già qualcos'altro nel gioco.** `allEarningsMult` (Penthouse) è un moltiplicatore permanente ai guadagni comprato con cash — esattamente il tipo di leva che flotta, lusso e holding offrono già. `autoRepairDaily` è un servizio che l'officina/flotta gestiscono per conto proprio. `driverXpMult` e `dailyMoraleBonus` toccano un sistema (autisti) che ha già le sue leve di investimento. Nessuna di queste stanze fa provare al giocatore una decisione che non ha già altrove: è sempre "paga cash, ottieni un moltiplicatore permanente più alto". Cambia l'icona, non la scelta.

Questo spiega anche perché non c'è un motivo di tornare più volte al giorno: l'HQ è un albero da costruire una volta e poi dimenticare. L'unico contatto quotidiano è passivo (`_hqDailyTick`, senza alcuna azione del giocatore). Confrontato con le corse (loop ogni pochi minuti) o con aste/contratti (scadenze, rinnovi), l'HQ non ha nessun ritmo — è un sink di cash a curva piatta, non un loop.

Ed è un MMO che l'HQ tratta come single-player. Il gioco ha già un sistema che fa esattamente "i giocatori mettono soldi in comune e ne ottengono un beneficio condiviso, visibile agli altri membri, con chat e gerarchia di leader" — è `alliances.js` (Bottega del Consorzio: tesoro, perk a tempo, chat realtime). Se l'HQ replica quella meccanica in versione solitaria, non aggiunge niente; se prova a costruirne una parallela, duplica un sistema già verificato.

La domanda centrale del brief — *cosa può dare l'HQ che nessuno degli altri sink già dà* — ha una risposta onesta e circoscritta: **niente, se resta un albero di moltiplicatori.** Ma il gioco ha già, incompiuto, l'unico ingrediente che nessun altro sistema possiede: una rappresentazione spaziale e visibile dell'impero (`renderHQCampus`, le 5 città, la griglia di slot). Nessun altro sistema — flotta, lusso, holding, infrastrutture — produce qualcosa che si *vede*. Quello è il posto libero.

## 3. La proposta: l'HQ come vetrina, non come motore

Ruolo dell'HQ: non è dove il giocatore ottimizza i numeri (quello resta a flotta/holding/lusso), è dove il giocatore **mostra** quanto ha costruito, e dove **espande geograficamente** man mano che passa da 3 auto a 200. Cash speso in HQ deve comprare status visibile e presenza territoriale, non un altro decimale di moltiplicatore.

**a) Vetrina pubblica + classifica.** `totalScore` esiste già (somma dei punteggi delle stanze) ma oggi non lo vede nessuno. Renderlo il punteggio di una classifica globale (o per consorzio) e permettere di visitare il campus di un altro giocatore in sola lettura, dallo stesso `renderHQCampus`. Perché torna: chi ha 3 auto scala la classifica locale del proprio consorzio, chi ne ha 200 compete per la vetta globale — la stessa meccanica ha senso a ogni scala della curva "poor to rich". Perché è MMO davvero: coinvolge lo sguardo di altri giocatori, non solo un numero privato.

**b) Espansione territoriale come sblocco, non come stat.** Firenze e Venezia hanno già effetti city-specific (`vip_lounge` solo a Firenze, `unlocksWaterTaxis` per Venezia). Va spinto in questa direzione invece che in quella dei moltiplicatori piatti: costruire una sede in una nuova città sblocca contenuto geografico reale (nuove rotte, nuovi tipi di corsa, nuovi clienti locali), non un +X% invisibile. Questo dà all'HQ un ruolo che flotta e holding non hanno: è la mappa dell'espansione, non il motore dei ricavi.

**c) Cantiere con tempo di costruzione reale.** Oggi costruire/migliorare è istantaneo (un `confirm()` e via). Introdurre un tempo di completamento (ore, non giorni) per le stanze di livello più alto trasforma l'HQ in un motivo concreto per riaprire il gioco: si avvia un cantiere e si torna a raccoglierlo. Questo è l'opposto del pattern già escluso per gli autisti (allungare la coda premia chi gioca meno): qui il tempo *invita* a tornare per completare, non compensa l'assenza — chi controlla più spesso avvia più cantieri, chi gioca meno resta indietro nella vetrina, che è esattamente l'incentivo giusto per un sistema di status.

**d) Punteggio HQ dentro il consorzio, non parallelo ad esso.** Invece di inventare una seconda meccanica sociale, agganciare l'HQ a quella che già funziona: la somma degli score HQ dei membri di un'alleanza alimenta un ranking di consorzio, visibile nella tab Alleanze già esistente. L'HQ diventa un contributo individuale a un obiettivo di gruppo che `alliances.js` già sa mostrare — zero chat nuova, zero gerarchia nuova da costruire.

**e) Personalizzazione estetica del campus.** Skin, decorazioni, insegne — cosmetica pura, comprata con cash, senza alcun effetto di gioco. È l'unico posto dove ha senso vendere puro status senza toccare l'economia: non compete con flotta/lusso perché non produce potere, produce solo ciò che si vede quando qualcuno visita.

## 4. Cosa NON fare, e perché

- **Non tenere Penthouse (`allEarningsMult`) così com'è.** È il sink più costoso e più ridondante: identico nella forma a qualunque altro moltiplicatore d'investimento del gioco. O si toglie l'effetto sui ricavi e si trasforma in puro status (score/estetica), o resta ma va reso chiaramente marginale rispetto a flotta/holding — mai la scelta dominante.
- **Non costruire una seconda chat o gerarchia sociale nell'HQ.** Esiste già in `alliances.js`, verificata e testata. Duplicarla frammenta l'attenzione dei giocatori su due sistemi sociali invece di rafforzarne uno.
- **Non toccare la coda di corse/autisti in nessun modo** — vincolo esplicito, e comunque un cantiere HQ con tempo di completamento è un meccanismo diverso: premia chi controlla spesso, non chi resta assente.
- **Non rendere gli effetti dell'HQ necessari per competere.** Se `allEarningsMult` o `vipRideBonus` diventano troppo forti, l'HQ smette di essere una vetrina opzionale e diventa un secondo lavoro obbligatorio — il contrario dell'obiettivo. Le percentuali vanno tenute basse o rimosse a favore di status puro.
- **Non vendere scorciatoie sui tempi di cantiere in modo aggressivo.** Un piccolo skip a pagamento va bene come opzione, ma se costa poco o è la via ovvia, il "torna a raccogliere" collassa e si perde l'unico vero hook di ritorno che il cantiere introduce.

## 5. Versione minima per riaccenderlo con dignità

Non serve costruire tutto il punto 3 per togliere l'interruttore. Il minimo che permette di riaprire l'HQ senza mentire al giocatore:

1. **Verificare davvero il flusso CE_money** (`hqUpgradeRoom` → `CE_money.spend` / `addReputation`) nel banco di prova, con un test che copra costruzione, upgrade, ricaricamento pagina — il codice sembra già corretto ma "sembra" non è "verificato", ed è esattamente la barra che il resto del gioco usa per passare da `false` a `true` in `FEATURES`.
2. **Spegnere o azzerare `allEarningsMult`** (Penthouse) prima di riaprire: è la parte più ridondante e più costosa, e riaprirla com'è oggi significa reintrodurre il problema descritto al punto 2 il giorno stesso della riapertura.
3. **Accendere la vetrina, non il motore**: mostrare `totalScore` da qualche parte visibile ad altri giocatori (anche solo una colonna nel profilo o nella tab Alleanze) è la modifica più piccola che dà all'HQ un senso che nessun altro sistema ha, senza toccare un solo numero di gameplay.

Dopo, in ordine: (a) espansione territoriale reale per le città non ancora sfruttate (Napoli, Milano), (b) cantiere con tempo di costruzione, (c) aggancio del punteggio HQ al ranking di consorzio, (d) personalizzazione estetica. Ognuno di questi è un incremento isolato — nessuno richiede di aver fatto gli altri prima, tranne la vetrina (punto 3 sopra), che è la base logica di tutto il resto.
