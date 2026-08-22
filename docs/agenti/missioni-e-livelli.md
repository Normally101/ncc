# Missioni e livello del giocatore — analisi e proposta

Analisi ancorata al codice: `quests.js`, `quests-data.js` (168 missioni), `ui-home.js`, `onboarding-core.js`.

## 1. Come funzionano oggi le missioni

Motore semplice (`quests.js`, 121 righe): `checkQuestProgress()` scorre `QUEST_DB`, per ogni missione con `prereqs` soddisfatti valuta `q.check(gs) → {cur, tgt}`; se `cur >= tgt` la missione entra in `claimableQuests`. Al claim, `claimQuestReward()` eroga le reward e salva.

**168 missioni** in 9 capitoli (`ch:1..9`): ch1=21, ch2=37, ch3=29, ch4=19, ch5-9=10 ciascuno. Per tipo: `story` 94, `milestone` 50, `tutorial` 6, `raid` 6. Per rarità (`tier`): bronze 20, silver 24, gold 42, diamond 43, legendary 27. Alcune sono "a bivio" (due scelte con effetti diversi, es. `t06`, `m01`), ma la reward di completamento è la stessa qualunque sia la scelta.

Reward possibili per missione: `cash` (158/168, spesso 0), `vtk` (156/168, quasi sempre presente — è la valuta soft-premium), `tc`/driverCoins (156/168, quasi sempre 0), `rep` (156/168, bonus piccoli 0.1–0.5★), `shadowCoin` (solo capitoli avanzati), `unlock` (100/168, stringa libera), `title` (solo 7 missioni leggendarie di fine gioco).

Solo il capitolo 1 (le 6 missioni marcate `type:'tutorial'`) insegna esplicitamente azioni base: `t01` compra la prima auto, `t02` assumi un autista, `t03` fai una corsa, `t04` fai manutenzione, `t05` un'azione generica, `t06` è un bivio narrativo. Dal capitolo 2 in poi (94+50 = 144 missioni, l'86% del totale) il check tipico è `_mRun(gs, id)` — "hai eseguito l'evento narrativo legato a questo ID" — oppure soglie di flotta/cash/prestigio. Non richiede più di aprire un tab specifico o provare una funzione: richiede di aver superato un traguardo, con narrativa sopra.

## 2. Il difetto rispetto all'obiettivo di Vlad

Ho verificato due cose col grep sul codice reale, non solo sui dati:

**Il gating vero dei 21 sistemi del gioco (18 tab + corse/staff/veicoli) è governato da `onboarding-core.js`**, su soglie di corse-completate e prestigio (`GATES`), **completamente indipendente dalle missioni**. Le missioni non sono la leva che apre i sistemi.

**Il campo `unlock` delle missioni è scritto ma mai letto.** `claimQuestReward` fa `gs.unlockedFeatures.push(r.unlock)`, ma quell'array non compare in nessun tab o controllo UI del gioco — solo in asserzioni dei test (`test/funzioni/carriera.test.js`). Stessa storia per `title` → `gs.playerTitle`: scritto da 7 missioni di endgame, mai mostrato in nessuna schermata. Il giocatore che sblocca "Governatore Supremo" non lo vede mai da nessuna parte.

Conclusione onesta: **le missioni oggi sono una checklist di traguardi economici vestita di narrativa**, non un tutorial guidato. Un giocatore può completare 50 missioni senza mai aver aperto Borsa, HQ, Sindacato o Contratti B2B — perché nessuna di quelle missioni lo obbliga a farlo, gli basta guadagnare o possedere abbastanza. Il vero tutorial dei sistemi (le soglie di `GATES`) sblocca l'*accesso* al tab, ma non insegna *come usarlo*, e i due meccanismi non comunicano tra loro.

## 3. La proposta sulle missioni

I 21 sistemi = i 18 tab in `GATES` (finance, market, b2b, regions, hq, invest, realestate, contracts, infrastructure, tourism, lifestyle, auctions, provinces, politics, crypto, shadow, nemesis, opa) + i 3 sistemi core sempre aperti (corse, staff, veicoli).

Uso l'ordine e le soglie già presenti in `GATES` come spina dorsale — sono già la sequenza pensata e testata "dal vivo" (il commento in `onboarding-core.js` dice: misurato, 25 corse ≈ 9 ore con 1 autista). Non serve reinventare l'ordine, serve agganciarci una missione mancante.

**Per ognuno dei 18 tab, una sola missione "scoperta"**, sbloccata esattamente alla stessa soglia rides/prestige che apre il tab (stesso trigger di `GATES`), con `check` che verifica un'azione *dentro* quel sistema — non una soglia economica. Esempi coerenti col codice esistente: Finance → "apri il tab e stipula il primo prestito"; Mercato → "compra la prima azione"; B2B → "firma il primo contratto"; HQ → "avvia il primo potenziamento". Criterio di verifica per capire se una missione "presenta" un sistema: **il suo `check` deve leggere lo stato di quel sistema specifico (un array, un flag), non un numero generico raggiungibile ignorandolo del tutto.**

Le 144 missioni story/milestone esistenti restano — narrativa ed economia sono valide — ma vanno **affiancate**, non sostituite, da queste 18 missioni-scoperta. Ritmo: una ogni volta che un tab si apre, distribuite lungo tutta la curva (rides 3→48), non concentrate nel capitolo 1 come oggi.

Sul difetto strutturale del punto 2: va scelta una sola fonte di verità. O il campo `unlock` sparisce dalle nuove missioni-scoperta (il tab si apre già da `onboarding-core.js`, la missione serve solo a farlo *notare*), oppure — meglio, ma è una scelta di ownership del sistema che spetta a te — l'apertura del tab si sposta sulla missione stessa e `GATES` diventa il fallback. Aggiungere altre missioni con `unlock` senza deciderlo accumula altro codice morto.

## 4. Le ricompense e l'economia

`gameState.cash` parte da **0**, la prima auto (Nexus H-Line) costa **€35.000**. Il vero collo di bottiglia iniziale è quello, non un numero astratto. Il prezzo di una corsa dipende da `baseFlat` del POI (72–400+ nei dati) per una catena di moltiplicatori: una corsa iniziale rende approssimativamente **€70–250 netti**.

Le missioni tutorial attuali danno cash quasi nullo (0/500/1500/0/0/0, +5000 opzionale al bivio) e spingono su VTK (50–120) e reputazione: è corretto, non deve sostituire il guadagno da corsa.

**Criterio di calibrazione per le nuove missioni-scoperta**: esprimere la reward-cash come multiplo del guadagno di UNA corsa media della fascia in cui la missione si sblocca, non come cifra assoluta. Regola: **reward = 2–5× il guadagno di una corsa di quella fascia** — abbastanza da "sentirsi" premiati per aver esplorato un tab nuovo, non abbastanza da rendere le corse superflue. E soprattutto: **mai dare direttamente l'importo che serve per saltare lo step successivo** (es. mai regalare i €35.000 dell'auto) — la missione deve dare un acceleratore (piccola somma, sconto %, VTK), mai un sostituto del gameplay.

Le 144 missioni story/milestone esistenti (cash da 8k a 10M lungo i capitoli) seguono già una curva coerente, grossomodo esponenziale capitolo su capitolo: non le toccherei in questa fase, un loro audit è un progetto a parte, non necessario per l'obiettivo "scoperta dei sistemi".

## 5. Il livello del giocatore

Non prestigio (parte solo a reputazione 5.0 — arriva tardi, oggi lascia il giocatore "Autista" per moltissimo tempo) né cash (troppo volatile, exploitabile con eventi/bivi). Propongo un **livello a esperienza cumulativa**, alimentato da azioni già tracciate in `gameState.questStats` e simili (corse completate, missioni completate, veicoli comprati, dipendenti assunti) — zero nuovo stato pesante da migrare, solo un contatore XP e una funzione di soglia.

XP indicativa: ~10 per corsa, 100–500 per missione completata (scalando con `tier` bronze→legendary), un bonus fisso per ogni missione-scoperta di sistema del punto 3. Curva a soglie crescenti (tipo `livello² × costante`): i primi 10 livelli arrivano in poche sessioni (un livello ogni 2-3 corse), poi rallenta — esattamente il ritmo "spesso all'inizio, raro dopo" richiesto.

**Cosa sblocca**: non i tab (quel gating resta a `onboarding-core.js`, già bilanciato dal vivo) — leve minori e di qualità della vita: slot extra per autisti attivi in contemporanea, sconto % su manutenzione, capacità garage, badge estetici. Deve dare un senso di progresso visibile senza duplicare il gating di sistema.

**Convivenza coi titoli esistenti**: i titoli di `_homeLevel()` (Autista → Imprenditore → Manager → ... → Leggenda) restano legati al prestigio — endgame, New Game+, "quanto sei diventato leggendario". Il Livello resta legato all'XP cumulativa — "quanto hai giocato ed esplorato". Mostrarli insieme senza confonderli, es. in home: `"Lv. 14 · Imprenditore"`, livello a sinistra (sale spesso, early/mid game), titolo a destra (sale raramente, endgame). Il Livello copre esattamente il vuoto che Vlad ha notato: settimane senza nessun avanzamento visibile.

## 6. Ordine di implementazione

1. **Livello numerico (XP)**: additivo, non tocca l'economia esistente, risolve subito il problema "nessun avanzamento visibile nei primi passi", usa dati già tracciati in `gameState`.
2. **18 missioni-scoperta**, una per tab `GATES`, agganciate alle soglie rides/prestige esistenti: il grosso del lavoro di design, ma isolabile e aggiungibile capitolo per capitolo senza toccare le 168 missioni esistenti.
3. **Decisione sul campo `unlock`/`title` morto**: chiarire se diventa la fonte di verità del gating (ancorato alle nuove missioni-scoperta) o va rimosso — farlo prima di scrivere altre missioni che lo usano, altrimenti si accumula altro codice morto.
4. **Calibrazione fine delle reward-cash** sulle nuove missioni-scoperta col criterio moltiplicatore-corsa del punto 4 — richiede playtest reale, valori da marcare `[PLACEHOLDER]` fino ad allora.
5. **Le 144 missioni story/milestone esistenti**: non toccarle in questa fase — sono già coerenti, un loro audit è un progetto separato dall'obiettivo posto qui.
