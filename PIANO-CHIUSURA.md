# Piano di chiusura — portare Chauffeur Empire al 100% verificato

> Scritto il 30/08/2026, per le due settimane in cui Vlad è al Festival di Venezia
> e non può seguire il lavoro. **Questo file è le mie istruzioni, non un rapporto
> per lui.** Deve poter essere ripreso da una sessione che non ricorda niente.

---

## COME SI RIPRENDE (leggi questo per primo, sempre)

1. `HANDOFF.md` — dove eravamo.
2. **Questo file** — la fase in corso.
3. `docs/CHIUSURA-REGISTRO.md` — il libro mastro: 254 azioni, una riga ciascuna.
   La prima riga `⬜` del sistema in lavorazione è il lavoro di adesso.
4. `npm run stato` — i numeri veri, non quelli che ricordo.

Ogni sessione finisce con: registro aggiornato, `npm test` verde, **un commit**.
Una sessione interrotta a metà non deve far perdere niente a quella dopo.

---

## L'OBIETTIVO, DETTO IN MODO CHE SI POSSA VERIFICARE

Vlad: *«chiudere il cerchio… accertarti che, mentre trovi bug, li sistemi senza
rompere il gioco e senza rompere altre parti che hai già sistemato»*.

Il gioco è **chiuso** quando:

- ognuna delle **254 azioni** è stata eseguita nello stato che richiede, e si è
  visto coi propri occhi cosa fa allo stato locale, al denaro e al server;
- ogni azione ha **un test** che si accorge se smette di funzionare;
- **cinque account finti** hanno giocato insieme: si sono venduti auto, scritti,
  fatti amicizia, sono entrati in consorzio, hanno rilanciato a un'asta;
- una **partita intera** dal primo giorno è stata giocata senza incidenti;
- `npm run preflight` è verde e il sito pubblicato è quello che credo.

Non è chiuso perché «i test passano». È chiuso quando ogni bottone è stato premuto.

---

## LE REGOLE CHE NON SI NEGOZIANO

**1. Un difetto per volta.** Trovato → corretto → test che lo difende → `npm test`
intero → commit. Cinque correzioni insieme e un rosso, e non so quale sia stata.

**2. Il test deve poter fallire.** Dopo averlo scritto, rompo apposta il codice che
difende e guardo che diventi rosso. Un test che passa anche sul codice rotto non
difende niente. (Oggi ha funzionato due volte: sul Network e sulla forbice P2P.)

**3. Se tocco codice già chiuso, il registro me lo dice.** Prima di modificare un
file, cerco nel registro le righe `✅` di quel sistema: quei test devono restare
verdi, e li rilancio *prima* di committare, non dopo. Poi comunque `npm test` intero.

**4. Non allargo il lavoro.** Se trovo un difetto in un sistema diverso da quello
in lavorazione, lo scrivo nel registro con 🐛 e il sintomo preciso, e continuo.
Lo raccolgo quando arriva il suo turno. Rincorrere i difetti fuori ordine è il modo
sicuro di non chiudere niente.

**5. Non invento decisioni di gioco.** Se una cosa è ambigua (quanto deve costare,
se una regola è voluta), non scelgo io: la scrivo in `DOMANDE-PER-VLAD.md` e vado
avanti col resto. Lui è via, non può rispondere, e una scelta di design sbagliata
fatta in silenzio costa più di una casella lasciata vuota.

**6. Il database è vivo.** Ogni migrazione: prima si legge la funzione **vera** in
produzione, poi si scrive. Il 30/08 stavo per applicare una migrazione che avrebbe
tolto protezioni esistenti, perché il file descriveva un server che non c'era più.
Le migrazioni aggiungono; togliere si fa dopo, e solo quando serve davvero.

**7. Gli account finti sono riconoscibili e si cancellano.** Email `test+ce-N@…`,
e alla fine della fase si eliminano insieme alle righe che hanno prodotto. Mai
iniettare denaro o dati nell'account di Vlad.

**8. Si pubblica solo con `npm run preflight` verde.** Il gioco è online.

---

## STATO DI PARTENZA (misurato il 30/08/2026, non stimato)

| | |
|---|---|
| Test | 2360, 0 rossi |
| Azioni del giocatore | 254 — **0 chiuse** secondo la definizione qui sopra |
| di cui toccano denaro | 130 (le altre 124 sono navigazione e interfaccia) |
| eseguite dal banco automatico | 53 |
| che il banco non riesce ad attivare | 76 |
| fuori dal banco (file non caricato lì) | 30 |
| Bottoni che non portano a nessuna funzione | **0** (controllato) |
| RPC chiamate dal client | 115 — **tutte esistono sul server** (controllato) |
| Chiamate con argomenti disallineati dalla firma | **0** su 91 (controllato) |
| Tabelle pubbliche senza RLS | **0** (controllato) |
| File eseguiti dai test | 61 su 96 |

Da questi numeri viene l'ordine delle fasi: l'impianto regge (niente bottoni morti,
niente chiamate a vuoto, RLS ovunque), quindi il lavoro non è rifare — è **provare**.

---

## FASE 1 — Il server fa davvero quello che il client crede
**Perché prima:** è l'unico posto dove ho già trovato una bugia oggi, ed è dove un
difetto non si vede finché non tocca un giocatore vero. Costa poco e chiude una
classe intera di sorprese.

1. **Le 27 RPC eseguibili da `anon`.** Il grep grezzo dice che non contengono
   `auth.uid()`, ma diverse usano `_my_company_id()` (controllate: sane). Restano da
   guardare una per una quelle che **cambiano il mondo condiviso** e sembrano
   funzioni di manutenzione: `rpc_advance_time`, `rpc_update_weather`,
   `rpc_generate_dispatch`, `rpc_tick_tension`, `rpc_update_fuel_price`,
   `rpc_credit_real_estate_rents`, `rpc_cleanup_expired_listings`,
   `rpc_reset_daily_vtk`, `rpc_expire_tourism_contracts`,
   `rpc_sync_global_event_status`. Domanda per ognuna: **chi deve poterla chiamare?**
   Se la risposta è «solo il cron», va revocata ad `anon` e `authenticated`.
2. **I lavori schedulati esistono davvero?** `select jobname, schedule, active from cron.job`.
   È la trappola che uccise le aste il 20/08: un commento dava per scontato un cron
   che non c'era, e la funzione era morta senza che nessuno se ne accorgesse.
   Per ogni sistema che dipende dal tempo (aste, B2B, turismo, dividendi, affitti,
   VTK, meteo, tensione): il suo lavoro è schedulato e ha girato di recente?
3. **Le 40 RPC che muovono denaro**: ognuna verifica i fondi lato server, controlla
   che chi chiama sia il proprietario, e ha un limite di frequenza?
4. **Guardrail permanente** `test/guardrail/contratto-client-server.test.js`: rifà da
   solo il confronto fra le chiamate del client e le firme del server (nomi degli
   argomenti compresi) leggendo uno schema salvato in `docs/SCHEMA-RPC.json`, così
   una firma che cambia diventa un rosso invece di un bottone che fallisce in
   produzione.

**Chiusa quando:** `docs/AUDIT-SERVER.md` esiste con una riga per RPC, le revoche
necessarie sono applicate, e il guardrail è verde.
**Sessioni stimate:** 2-3.

---

## FASE 2 — Il regista degli stati
**Il collo di bottiglia di tutto il piano.** 76 azioni non si attivano perché il
banco non sa mettersi nella situazione giusta: essere in un consorzio, avere un
contratto B2B attivo, avere un cliente VIP che chiama, un'asta aperta, una holding,
un deposito di carburante, un autista in accademia. Finché non esiste un modo
semplice di costruire quelle situazioni, ogni azione costa mezz'ora; dopo, ne costa
due minuti.

Costruire `test-support/regista.js` con funzioni che portano il gioco in uno stato
**nominato**, ognuna documentata con cosa garantisce:

```
conConsorzio(env, {ruolo:'leader'|'membro'})   conContrattoB2B(env)
conClienteVIP(env, id)                          conAstaAperta(env)
conHolding(env, {ruolo})                        conDepositoCarburante(env)
conAutistaInAccademia(env)                      conImmobile(env)
conProvincia(env)                               conNemesi(env)
conCriptoInPortafoglio(env)                     conPrestito(env)
conFlotta(env, n)                               conSoldi(env, n)
conGiornoAvanzato(env, giorni)                  conCorseCompletate(env, n)
```

Due strumenti che Vlad ha chiesto esplicitamente e che vivono qui:
- **iniezione di denaro**: `conSoldi(env, 500000)` passa da `CE_money` e sincronizza,
  così lo stato resta coerente invece di essere falso;
- **accelerazione del tempo**: `conGiornoAvanzato(env, 30)` fa girare i tick reali
  del motore, non sposta un contatore. Se un sistema si rompe al giorno 30, deve
  rompersi anche qui.

Poi il guardrail `azioni-sincronizzano` usa il regista, e il numero «non attivabili»
comincia a scendere: **è quello il termometro della fase 3**.

**Chiusa quando:** il regista copre i sistemi delle 76 azioni bloccate e le
«non attivabili» sono sotto 20.
**Sessioni stimate:** 2-3.

---

## FASE 3 — Le 254 azioni, sistema per sistema
Un sistema per sessione, in quest'ordine (prima quelli con più azioni non provate e
più denaro in ballo):

```
1. consorzi/alleanze   2. VIP e clienti      3. holding e OPA     4. showroom
5. infrastrutture      6. lifestyle e lusso  7. agenzia ombra     8. nemesi
9. turismo             10. contratti/B2B     11. politica         12. cripto
13. VTK                14. immobiliare       15. aste             16. HQ
17. accademia/staff    18. flotta            19. finanza          20. carriera
21. negozio DC         22. mappa e navigazione
```

Per ogni sistema, in una sessione sola:
1. Regista: costruisco lo stato del sistema.
2. Eseguo **tutte** le sue azioni, comprese quelle di sola interfaccia (Vlad: «copri
   il 100%, non escludere nulla»). Per quelle di navigazione basta meno: si aprono,
   non esplodono, mostrano quello che promettono.
3. Per ognuna controllo i tre effetti: stato locale, denaro via `CE_money`, scrittura
   al server.
4. **Una passata nel browser vero** sul flusso principale del sistema, a clic veri,
   console aperta. È il controllo che ha trovato il mercato P2P irraggiungibile:
   nessun test lo vedeva.
5. Difetti: corretti sul momento se sono del sistema in corso, altrimenti 🐛 nel registro.
6. `npm test` intero, registro aggiornato, commit.

**Chiusa quando:** 254 righe `✅` (o `⏭️` con motivo scritto).
**Sessioni stimate:** 10-14. È la fase lunga.

---

## FASE 4 — Cinque giocatori finti che giocano insieme
Vlad: *«puoi provare a simulare tu stesso cinque account finti, dove fai fare cose
diverse a loro, così vedi come interagiscono»*.

Cinque account veri su Supabase (`test+ce-1…5`), guidati da uno script che li fa
giocare **contemporaneamente**:

- A mette un'auto sul mercato, B la compra → il denaro si sposta davvero? la
  commissione del 5% è trattenuta? l'auto sparisce dalla lista per tutti gli altri?
- B e C provano a comprarla **nello stesso istante** → uno solo deve riuscirci.
  (Il lock `FOR UPDATE` c'è; non è mai stato messo alla prova.)
- A crea un consorzio, B e C entrano, C dona, il leader attiva un perk → il bonus
  arriva a tutti e tre?
- Tutti e cinque scrivono in chat globale → arrivano in tempo reale? il limite
  anti-raffica scatta al settimo messaggio in dieci secondi?
- A scrive in privato a D senza essere suo amico → deve funzionare.
  E non deve poter leggere la posta fra B e C.
- Due rilanciano alla stessa asta → vince chi deve, l'altro non perde i soldi.
- Classifica: cinque aziende con patrimoni diversi si ordinano bene?

Ogni verifica si chiude leggendo il **database**, non l'interfaccia. Alla fine:
account e righe cancellati, e uno script riutilizzabile in `scripts/prova-multi.mjs`.

**Chiusa quando:** le sette prove passano e la pulizia non lascia righe orfane.
**Sessioni stimate:** 2-3.

---

## FASE 5 — Una partita intera, dal primo giorno
Non un test: una partita. Nel browser, con la console aperta, dall'account nuovo.

- Tutorial completo senza saltarlo: le promesse che fa si avverano?
- Prime venti corse a mano, poi lo smistamento automatico.
- Trenta giorni di gioco con il tempo accelerato: stipendi, manutenzioni, eventi,
  email, multe, scadenze. Nessun errore in console, nessun numero assurdo.
- I cancelli (`GATES`) si aprono quando devono? A che giorno si sblocca cosa?
- **La curva del denaro**: quanto ha in tasca al giorno 1, 5, 10, 20, 30. Se al
  giorno 10 è ricco sfondato o bloccato, l'economia non tiene, e questo non lo
  dice nessun test.
- Rifatta due volte con strategie diverse (prudente / aggressiva).

**Consegna:** `docs/PARTITA-DI-PROVA.md` con la curva, i blocchi trovati e una
proposta di bilanciamento (proposta: le decisioni di equilibrio le prende Vlad).
**Sessioni stimate:** 2-3.

---

## FASE 6 — Chiusura
- `npm run stato` deve dire 254 su 254.
- `npm run preflight` e `preflight:prod` verdi.
- `HANDOFF.md` e il vault aggiornati.
- **Un rapporto solo per Vlad**, corto: cosa era rotto, cosa è stato corretto, cosa
  resta e cosa serve da lui (l'acquisto vero, la chiave Stripe ristretta, le
  decisioni di equilibrio).

---

## COSA NON FACCIO, MENTRE È VIA

- Non aggiungo funzioni nuove. Il piano è chiudere quello che c'è. Le idee vanno in
  `DOMANDE-PER-VLAD.md`, non nel codice.
- Non tocco le corsie taxi/camion (Vlad: dopo il rilascio) né il leasing (gli va bene così).
- Non cambio l'equilibrio economico di mia iniziativa: lo misuro e lo propongo.
- Non cancello dati che non ho creato io.
- Non pubblico con la suite rossa.

---

## SE VLAD SCRIVE

Ha poco tempo e legge poco. La risposta giusta è: **una riga di stato** (fase, azioni
chiuse su 254, difetti trovati), e poi solo quello che ha chiesto. Le domande aperte
stanno tutte in `DOMANDE-PER-VLAD.md`, così ne trova una lista sola quando torna.
