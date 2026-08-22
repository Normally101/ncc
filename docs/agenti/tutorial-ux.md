# Tutorial UX — Chauffeur Empire

Analisi del tutorial attuale (`tutorial.js`, `onboarding.js`, `onboarding-core.js`, `zero-to-hero.js`) e proposta di revisione. Il gioco ha 21 sistemi e ~226 azioni distinte (`ceAct(...)` in tutti i file JS); un nuovo giocatore li vede quasi tutti nella prima sessione.

## 1. Com'è fatto oggi il tutorial

`tutorial.js` è un overlay sequenziale di 11 step (`_TUT_STEPS`), tipo "Clippy guidato": Vittorio (mentore) parla, il giocatore clicca "Avanti".

Struttura reale degli step:
1. **intro** — schermo centrato di benvenuto.
2. **spotlight** su `#tb-cash` — spiega la cassa.
3. **spotlight** su `#tb-rep` — spiega la reputazione.
4. **spotlight** su `#tb-energy-bar` — spiega l'energia.
5. **auto-nav** → tab `corse` + spotlight generico su `#tab-container`, con testo su come assegnare le corse (Verde/Blu/Viola/Nero). Questo è l'unico step con `actionGate: 'rides'`: avanza da solo se il giocatore completa davvero una corsa, altrimenti resta lì finché non clicca "Avanti" a mano.
6. **auto-nav** → tab `fleet` + spotlight generico, cita lo Showroom e il Nexus H-Line.
7. **auto-nav** → tab `staff` + spotlight generico su fatica/stress/morale.
8. **auto-nav** → tab `career` (missioni).
9. **outro** — chiusura, rimanda alla prima missione già attiva.

Parte da `foundCompany()` (fondazione HQ) e da `_startGameWithSlot(fresh=true)` (nuova partita), con `setTimeout` di 1200ms, e non si ripresenta mai più (flag `localStorage.chauffeurEmpireTutorialDone_v3`). Il pulsante "Salta" è sempre presente e non c'è mai un soft-lock: si può abbandonare il tutorial in ogni istante.

Il gate d'azione sullo step 5 (`rides`) è una buona idea in sé: fa davvero eseguire l'azione, non solo guardarla. Ma è l'unico dei quattro step operativi (corse/flotta/staff/carriera) ad averlo — gli altri tre sono solo guardati, mai fatti.

In parallelo esiste una seconda checklist persistente, `renderOnboardingHTML()` in `onboarding.js`: una card "🎯 Primi Passi" con 4 righe (prima corsa, primo autista, secondo veicolo, 10 corse) che resta visibile in dashboard finché non completate o finché il giocatore non supera 12 corse/1★ prestigio. Coesiste col tutorial ma con un ordine diverso (assumere prima, comprare auto dopo) e senza alcun collegamento tra i due.

## 2. Dove un giocatore nuovo si perde

Non genericamente "l'UI è confusa" — punti precisi, tracciati nel codice:

**A. Il tutorial può partire PRIMA che l'azienda esista.** `map.js:263` mostra l'overlay "Scegli la tua sede" (`_checkFoundingOverlay`) 800ms dopo il caricamento mappa, e richiede un clic sulla mappa + un `prompt()` nativo del browser per dare un nome. `_startGameWithSlot(fresh=true)` lancia il tutorial dopo 1200ms. Se il giocatore non ha ancora cliccato la mappa in quei 400ms di differenza (quasi sempre, perché deve leggere il testo, cliccare, e rispondere al prompt), il tutorial (z-index 9500) si apre SOPRA l'overlay di fondazione (z-index 300) e lo copre del tutto. Il giocatore vede "Benvenuto, CEO" e gli step su cassa/reputazione/energia con valori a zero, prima ancora di aver scelto dove aprire l'agenzia. Solo dopo aver chiuso il tutorial ricompare la richiesta di fondare la sede, che a quel punto sembra un secondo inizio scollegato dal primo.

**B. Lo step "Assegna le Corse" mostra spesso una schermata completamente diversa da quella descritta.** Il testo dice: "Clicca su una corsa e poi sull'autista per assegnarla — o usa Smista tutte. Verde = Standard, Blu = Business...". Ma se il giocatore è ancora in fase `survival` (`onboarding-core.js`: meno di 6 corse totali — condizione quasi certa a questo punto del tutorial, visto che il tutorial parte all'inizio della partita), `ui-dispatch.js` sostituisce l'intero tab Corse con `renderManualSurvivalMode()`: schermata rossa "IL FONDO DEL BARILE", un solo bottone "GUIDA MANUALMENTE", nessuna corsa da assegnare, nessun autista, nessun colore. Il giocatore legge istruzioni su un'interfaccia che letteralmente non è quella davanti a lui. Il gate d'azione avanza comunque (guidare manualmente incrementa `totalRides`), ma solo per caso: le istruzioni non descrivono l'azione che porta avanti.

**C. Lo sblocco dei 21 sistemi è silenzioso.** `onboarding-core.js` ha una tabella `GATES` con 18 soglie (da `finance` a 3 corse fino a `opa` a 48 corse + 6★ prestigio). Quando una soglia scatta, il tab passa da "bloccato" a cliccabile — ma non esiste nessuna notifica, toast o evento che lo segnali (verificato: nessuna occorrenza di notifica legata a un `GATES` sbloccato, a differenza di eventi come le tratte internazionali o l'influenza sulle province, che invece hanno un messaggio dedicato). Il giocatore scopre che un sistema è nuovo solo se nota, da solo, che una voce di nav non è più grigia. Con 18 soglie diverse e nessun sistema oltre ai primi 4 mai spiegato dal tutorial, la stragrande maggioranza del gioco (finance, market, b2b, regions, hq, invest, realestate, contracts, infrastructure, tourism, lifestyle, auctions, provinces, politics, crypto, shadow/nemesis, opa — 17 su 21) non riceve mai una sola riga di spiegazione contestuale.

**D. Due sistemi di onboarding che non si parlano.** La checklist "Primi Passi" e il tutorial guidato coprono più o meno le stesse quattro azioni ma con ordine diverso e senza integrazione: un giocatore che segue il tutorial (corse→flotta→staff→carriera) vede poi in dashboard una checklist che gli chiede di assumere staff prima di comprare un'auto. Non è un errore bloccante, ma è un doppio messaggio con priorità diverse nello stesso momento critico.

**E. "auto-nav" spotlighta il contenitore, non l'elemento specifico.** Negli step flotta/staff/carriera lo spotlight è su `#tab-container` (l'intero pannello), non su un pulsante o una card precisa. Il testo cita "Dallo Showroom acquisti i nuovi modelli" ma lo Showroom è raggiunto con `hubNavigate('showroom')` da dentro il tab Flotta, non è nella vista iniziale — nulla nello spotlight indica dove cliccare per arrivarci.

## 3. Principi per un tutorial "da bambino di 10 anni"

Non teoria UX generica: regole applicabili a questo gioco specifico.

1. **Una cosa alla volta, e quella cosa esiste davvero sullo schermo mentre la spieghi.** Mai spiegare un'interfaccia che in quel momento non è quella renderizzata (vedi punto B sopra). Se lo stato del gioco può cambiare cosa appare in un tab, il tutorial deve saperlo e adattarsi, non ignorarlo.
2. **Si impara facendo, non guardando.** Ogni step operativo deve avere un `actionGate` come quello già esistente per le corse. Uno spotlight che si supera solo cliccando "Avanti" non ha insegnato nulla — ha solo mostrato del testo.
3. **Non si insegna niente prima che esista.** Il tutorial non può partire prima che l'azienda sia fondata: cassa, reputazione, HQ, prima corsa devono già esistere quando li si spiega.
4. **Ogni nuovo sistema si presenta da solo, quando arriva — non tutti insieme all'inizio.** Un bambino di 10 anni non impara 21 giochi in un pomeriggio: ne impara uno, poi il secondo quando è pronto per riceverlo. Lo sblocco di un tab deve annunciarsi (un messaggio, un badge "Nuovo"), non essere silenzioso.
5. **Indica il pulsante esatto, non la stanza intera.** Uno spotlight su un intero pannello lascia al giocatore il compito di trovare cosa cliccare. Lo spotlight deve stringersi sull'elemento specifico quando esiste un elemento specifico (es. il pulsante "Smista tutte", la card "Showroom").
6. **Un solo sistema di onboarding, non due che si sovrappongono.** La checklist persistente e il tutorial guidato devono raccontare la stessa storia nello stesso ordine, o uno dei due deve sparire.

## 4. La proposta

Tutorial ristrutturato in **due fasi separate nel tempo**, non undici step consecutivi.

**Fase 0 — Prima della fondazione (non è un tutorial, è un vincolo):** l'overlay "Scegli la tua sede" resta l'unica cosa sullo schermo finché il giocatore non ha fondato l'azienda. Il tutorial NON può lanciarsi prima di questo momento: si aggancia solo dopo `foundCompany()` conclusa, mai da `_startGameWithSlot(fresh)`. Elimina il conflitto del punto A.

**Fase 1 — Le basi (5 step, tutti FATTI non guardati), subito dopo la fondazione:**
1. Intro (Vittorio, 2 righe, non un discorso).
2. Spotlight cassa+reputazione+energia insieme in un solo step (sono tre numeri nella stessa barra, non serve dividerli in tre schermate) — mostra i valori reali appena creati, non zero.
3. "Assegna la tua prima corsa" — spotlight sul pulsante/card specifico, `actionGate` attivo, testo adattato allo stato reale (se il giocatore è in `survival`, il testo descrive "GUIDA MANUALMENTE", non "clicca corsa poi autista").
4. "Assumi il tuo primo autista" — spotlight sulla card "Ragazzo di Quartiere" in Staff, `actionGate` sulla lunghezza di `gs.drivers`.
5. Outro breve: "il resto lo scopri mano a mano che cresci" — non promette flotta/carriera che non sono ancora rilevanti.

Cosa NON insegna qui: showroom, missioni, finanza, tutto il resto. Sono rimandati.

**Fase 2 — Micro-tutorial per sistema, uno alla volta, al momento dello sblocco (non un tutorial unico):** quando un tab in `GATES` passa da bloccato a sbloccato, un toast/badge "🎉 Nuovo: Finanza" appare vicino alla nav, e il PRIMO ingresso in quel tab mostra 1-2 spotlight mirati (max 2 frasi, un `actionGate` se c'è un'azione ovvia) invece di lasciare il giocatore da solo davanti a un pannello mai visto. Ogni sistema si spiega da sé, quando arriva, non tutti all'inizio. Fleet/Career restano fuori dal tutorial guidato iniziale ma ricevono ciascuno il proprio micro-onboarding al primo accesso reale (es. primo arrivo su Showroom, prima apertura di Missioni).

La checklist "Primi Passi" va allineata all'ordine della Fase 1 (corsa → autista → ...) o rimossa se la Fase 1 la rende ridondante.

## 5. Cosa nascondere all'inizio

Il meccanismo `GATES` di `onboarding-core.js` esiste già ed è corretto nel principio (sblocco per corse/prestigio, veterani esenti). Il problema non è QUALI sistemi nascondere — l'elenco attuale è ragionevole — ma che lo sblocco è muto. Criterio proposto, senza toccare le soglie numeriche già tarate (17/08/2026, misurate dal vivo):

- **Sempre visibili da subito:** Corse, Flotta, Staff, Carriera — i 4 sistemi core del loop economico.
- **Sbloccati silenziosamente ma ANNUNCIATI (soglie 3-15 corse):** Finanza, Mercato, B2B, Regioni, HQ — introdotti uno alla volta con badge + micro-spotlight al primo accesso.
- **Sbloccati più tardi (15-24 corse + prestigio):** Investimenti, Immobiliare, Contratti, Infrastrutture, Turismo, Lusso, Aste — stesso trattamento badge+micro-spotlight, ma qui vale la pena raggrupparli concettualmente ("ora puoi diversificare") invece di undici notifiche isolate.
- **Sistemi da endgame (24-48 corse + prestigio 3-6):** Province, Politica, Cripto, Nemesi/Ombra, OPA — questi non hanno bisogno di un tutorial dedicato: a quel livello il giocatore ha già imparato a esplorare da solo. Basta il badge "Nuovo".

## 6. Le 5 modifiche più importanti (in ordine di impatto)

1. **Non lanciare il tutorial prima della fondazione dell'HQ.** Elimina la sovrapposizione tutorial/founding-overlay (punto A) che oggi rompe il primissimo istante di gioco per ogni nuovo giocatore. Impatto: massimo, perché è il primo contatto assoluto col gioco. Lavoro: **piccolo** — spostare la chiamata a `_maybeLaunchTutorial` fuori da `_startGameWithSlot` e lasciarla solo dentro `foundCompany`.

2. **Far sapere al tutorial in che stato è il gioco (survival vs normale) prima di descrivere il tab Corse.** Elimina il mismatch testo/interfaccia del punto B, che oggi è quasi garantito capiti a ogni run fresca. Impatto: alto — è lo step con l'unico `actionGate` reale, quindi il più "critico" per l'apprendimento. Lavoro: **piccolo/medio** — un `if (window.ceOnb.phase() === 'survival')` che sceglie testo e target diversi per quello step.

3. **Notificare lo sblocco di ogni sistema nei `GATES`.** Trasforma 17 sistemi oggi muti in altrettanti momenti di apprendimento minimi. Impatto: alto — è la causa diretta del "troppa carne sul fuoco tutta insieme" descritto da Vlad. Lavoro: **medio** — un toast generico agganciato al cambio di `tabUnlock(tab).ok` da false a true, verificato ad ogni fine-corsa o cambio giorno.

4. **Unificare checklist "Primi Passi" e tutorial guidato in un solo flusso coerente.** Impatto: medio — riduce confusione da messaggi doppi, ma non blocca nessuno. Lavoro: **piccolo** — riordinare gli step di `onboarding.js` per rispecchiare `_TUT_STEPS`, o nascondere la checklist finché il tutorial non è concluso.

5. **Micro-tutorial al primo accesso per i sistemi di fascia media (finanza, mercato, contratti, ecc.), non solo un badge.** Impatto: medio-alto sul lungo periodo (chi resta oltre le prime 15 corse), ma richiede più contenuto testuale e più superficie di manutenzione. Lavoro: **grande** — serve un mini-framework riutilizzabile (stile `_TUT_STEPS` ma generico per-tab) più i testi per ~13 sistemi.
