# Chauffeur Empire — Handoff sessione corrente

> Aggiornato: 30 agosto 2026
> Leggilo sempre all'inizio di una nuova sessione PRIMA di qualsiasi lavoro.

# 🎯 31/08 – 14/09 — SI SEGUE `PIANO-CHIUSURA.md`

Vlad parte per il Festival di Venezia e non può seguire il lavoro. L'obiettivo delle
due settimane è **chiudere il gioco**: tutte e 254 le azioni provate davvero, con un
test che le difende, senza rompere quello che è già stato sistemato.

- Il piano completo, con le sei fasi e le regole: **`PIANO-CHIUSURA.md`**
- Il libro mastro delle azioni: **`docs/CHIUSURA-REGISTRO.md`** (`npm run registro`)
- Le domande che non decido io: **`DOMANDE-PER-VLAD.md`**
- I numeri veri, in qualunque momento: **`npm run stato`**

Punto di partenza (30/08): 254 azioni, **0 chiuse**, 2360 test verdi, 0 bottoni morti,
115 RPC tutte esistenti sul server, 0 firme disallineate, RLS su tutte le tabelle.
Il lavoro non è rifare: è **provare**.

## Fase 1 iniziata la sera del 30/08 — due difetti grossi in un'ora

**1. Il meteo reale era fermo al 15 agosto.** Il lavoro schedulato
`fetch-weather-cron` era attivo, girava ogni 30 minuti e **falliva da 5127
esecuzioni di fila**: `unrecognized configuration parameter "app.supabase_url"`,
due impostazioni del database mai messe. La Edge Function `fetch-weather` era
sana e non veniva mai invocata. Corretto riscrivendo il comando del cron con URL
e chiave letterali (`ALTER DATABASE … SET` è negato dal ruolo della Management
API); verificato che il giro successivo sia andato a buon fine da solo e che la
tabella ora si aggiorni. Nato da qui `npm run salute`: controlla i cron vivi,
l'esito dell'ultima esecuzione, la freschezza dei dati che producono, l'RLS e le
RPC che scrivono aperte a chi non ha un account.

**2. Un'auto invenduta era un'auto persa per sempre.** Gli annunci del mercato
fra giocatori durano 7 giorni. `p2pFetchMarket` filtrava `expires_at > adesso`
per chiunque, quindi allo scadere l'annuncio spariva anche dai «Miei Annunci» —
e con lui il bottone «Ritira», l'unico modo di riavere l'auto, che era già uscita
dalla flotta al momento della pubblicazione. Nessun lavoro schedulato la
restituiva. Ora la query fa un'eccezione per il venditore: l'annuncio scaduto
resta visibile solo a lui, marcato «Scaduto», col bottone «Riprendi l'auto».
⚠️ Difetto **nato lo stesso giorno** in cui il mercato è diventato usabile: prima
del 30/08 nessuno poteva pubblicare, quindi nessuno poteva perdere un'auto.

**Da guardare, non ancora risolto:** 4 RPC di manutenzione del mondo non le chiama
nessuno — né il client né un cron: `rpc_credit_real_estate_rents` (gli affitti
degli immobili **non vengono mai accreditati**, mentre la scheda promette
«+€X/giorno» e il manuale dice «una rendita che non si ferma mai»),
`rpc_update_fuel_price`, `rpc_cleanup_expired_listings`,
`rpc_sync_global_event_status`. È la prima cosa della prossima sessione.

## Fase 1, secondo giro (31/08) — i permessi, le sveglie mancanti, `npm run audit`

Tirando il filo lasciato aperto sopra. **Migrazioni 71, 72, 73 applicate al DB
vivo; 64 applicata per la prima volta** (esisteva da giorni e nessuno l'aveva
mai eseguita). Suite verde, nessun file di gioco toccato: questo giro sta tutto
fra server, script e documenti.

**Il permesso che nessuno aveva mai dato davvero.** Sei funzioni che cambiano il
mondo condiviso erano eseguibili **senza account**, e due di loro portavano
scritto in chiaro il contrario: `09_provinces_realestate_fuel.sql` dice «Solo
service_role può chiamare questa RPC — non il browser» e sotto ha una sola GRANT.
In Postgres una funzione nasce già eseguibile da PUBLIC: aggiungere una GRANT non
toglie niente a nessuno, e `REVOKE … FROM anon` non basta perché il permesso non
è di `anon`, è di PUBLIC. Ora sono chiuse (71) e verificate con una chiamata HTTP
anonima vera: sei 401 su sei.

La peggiore era `rpc_cleanup_expired_listings`: cancella gli annunci scaduti, e
dal 30/08 un annuncio scaduto è l'**unico** modo che ha il venditore di riavere
l'auto. Bastava una richiesta anonima per distruggere le auto invendute di tutti.

**L'involucro che nascondeva la funzione.** `rpc_expire_tourism_contracts` è tutta
qui: `SELECT public._process_tourism_tenders();`. Nel suo corpo non c'è una
scrittura, quindi il primo controllo l'aveva data per innocua — mentre chiude i
bandi di tutti e sposta denaro, aperta a chiunque. Da lì la regola nuova dentro
`audit-server.mjs`: **chi chiama una funzione che scrive, scrive**, propagata
finché l'insieme smette di crescere. Con quella regola sono usciti anche sette
aiutanti interni (`_process_tourism_tenders`, `_flag_cheat`, `_econ_cap`…),
chiusi in 72.

⚠️ **`_my_company_id()` non va toccata, mai.** Era nell'elenco dei candidati:
dieci policy RLS la chiamano, e una policy si valuta coi permessi di CHI
INTERROGA. Revocarla ad `authenticated` renderebbe illeggibili flotta, autisti e
corse a tutti. È la ragione per cui prima di revocare si guarda chi **usa** la
funzione, non solo chi la chiama.

**Gli affitti che non arrivavano.** `rpc_credit_real_estate_rents` era corretta
dal primo giorno e non la invocava nessuno. Ora è sulla sveglia `affitti-immobili`
(ogni ora; la funzione paga solo dove `last_rent_at < NOW() - 24h`, quindi 23
giri a vuoto e uno vero). Provata sul database dentro una transazione annullata:
€650 accreditati una volta sola, la seconda chiamata non paga. Nessun doppio
pagamento col client, che gli affitti li mostra soltanto.

**I dividendi: un file mai applicato che nessuno poteva accorgersi mancasse.**
`64_dividendi_giornalieri_idempotenti.sql` esiste dal 21/08 e sul server viveva
ancora la funzione vecchia, quella che ritorna un numero, senza guardia
giornaliera — mentre `engine-holding.js` leggeva `data.status === 'already_paid'`
da quel numero. Il difetto non si era mai visto perché la funzione era **anche
revocata** ad `authenticated`: la chiamata moriva sul permesso, prima di poter
mostrare che le due parti non si capivano. Applicata (serviva un DROP: cambia il
tipo di ritorno) e schedulata in 73.

**`npm run audit` — il censimento che si rigenera.** Legge le 166 funzioni dal
database vivo, le incrocia con le chiamate del browser, delle Edge Function, dei
cron, dei trigger e delle altre funzioni, e scrive `docs/AUDIT-SERVER.md` (una
riga per funzione) e `docs/SCHEMA-RPC.json` (le firme). I verdetti su «chi deve
poterla chiamare» stanno nella mappa `VERDETTI` **dentro lo script**, non nel .md
che si rigenera: una RPC nuova senza verdetto fa comparire «⚠️ manca il verdetto».
Oggi: 0 buchi di permesso, 20 funzioni senza chiamanti, tutte con un verdetto.

**Il guardrail nuovo** `test/guardrail/contratto-client-server.test.js` rifà il
confronto **offline** contro `SCHEMA-RPC.json`, dentro `npm test`, senza rete né
segreti. Provato al contrario due volte. Ha trovato subito una cosa vera: esistono
**RPC con lo stesso nome e firme diverse** (`rpc_add_driver_coins`,
`rpc_activate_alliance_perk`), e tenerne una sola faceva dare per sbagliata una
chiamata giusta — cambiando idea a ogni rigenerazione.

**Quattro decisioni che non prendo io** sono in `DOMANDE-PER-VLAD.md` §4-§7:
gli eventi globali (tabella vuota, il seed scriverebbe Natale a settembre), il
premio giornaliero (lo calcola il browser, e le due tabelle dei premi non
coincidono), il prezzo del gasolio (uno per giocatore o uno per tutti), la nemesi
che finanzia i rivali (è una stampante di denaro, resta spenta).

**Le funzioni che muovono denaro (punto 3 della Fase 1): nessun buco.** Sono 34
quelle che spostano cassa e si possono chiamare dal browser, e **tutte e 34
ricavano chi sei da `auth.uid()` o `_my_company_id()`**: nessuna si fida di un id
che arriva dal browser. Il controllo dei fondi c'è ovunque serva (manca solo dove
la funzione *accredita*, che è giusto). Il limite di frequenza è raro, e va bene
così: su una funzione che scala denaro il limite vero è il saldo. La tabella con
le tre colonne è in `docs/AUDIT-SERVER.md` e si rigenera da sola.

Il registro economia (`cash_ledger`, dal 28/08) dice la stessa cosa dai fatti:
36 movimenti, 3 giocatori di prova, **0 righe oltre il tetto**, incremento
massimo €3.000 (una ricompensa di missione).

⚠️ Resta vero il compromesso di fondo, che non è un difetto da correggere in una
sessione: **il motore del gioco sta nel browser**, e `rpc_sync_cash` accetta il
saldo che il client dichiara, con un tetto di +60.000.000 per chiamata e 30
chiamate al minuto. Il tetto è una rete contro l'assurdo, non una difesa contro
qualcuno che voglia barare. Renderlo davvero server-authoritative è una
riscrittura, non una correzione: per questo esiste il registro, che osserva.

**Le tre sveglie nuove, verificate una per una:** `affitti-immobili` e
`stato-eventi-globali` hanno già girato col loro primo slot, esito `succeeded`.
`dividendi-giornalieri-holding` ha il primo slot alle 21:15 UTC: al momento del
commit non era ancora arrivato, quindi ho eseguito **a mano il comando esatto
della sveglia** (`SELECT public.rpc_daily_dividends()`), che risponde
`{"status":"ok","total_paid":0,…}` — la forma che il client si aspetta.
La prima cosa da fare alla prossima sessione è `npm run salute`: se quella riga
dice ancora «non è MAI girata», la sveglia è ferma davvero.

## Fase 2 cominciata (31/08) — il regista, e un termometro che mentiva

**`test-support/regista.js`**: venti funzioni che portano il gioco in uno stato
**nominato** — `conConsorzio`, `conClienteVIP('garante')`, `conAstaAperta`,
`conPrestito`, `conSoldi(env, 500000)`, `conGiornoAvanzato(env, 30)`. Ognuna
documentata con la frase «GARANTISCE:», e se non ce la fa **lancia** invece di
restituire in silenzio: un regista che fallisce di nascosto costruisce uno stato
che assomiglia al gioco senza esserlo, e i test che ci girano sopra passano senza
aver provato niente.

La regola che tiene insieme il file: **usa il codice vero del gioco** dove esiste.
`conClienteVIP` non si inventa la forma dell'email — prepara la flotta che quel
cliente pretende e chiama `_maybeVipGrigori()`, cioè il generatore che gira nella
partita vera. Tutti e dieci i clienti VIP sono coperti, e il collaudo non è «ha
scritto un'email» ma «l'azione vera del giocatore arriva fino a creare la corsa».

**Due difetti del banco trovati costruendolo:**

1. **Nessuno aveva mai fatto il login.** Decine di azioni cominciano con
   `if (!_uid()) return;` — mercato fra giocatori, consorzi, sindacato, VTK,
   turismo, holding — e `window.currentUser` nel banco non è mai stato impostato.
   Uscivano alla PRIMA RIGA e finivano fra le «non attivabili»: sembravano
   bloccate da uno stato di gioco mancante, ed erano bloccate dal non essere
   entrate in partita.

2. **Il termometro contava male, e da settimane.** «Non attivabile» metteva
   insieme due cose opposte: l'azione che esce alla prima riga, e l'azione che
   **parte davvero** ma in quell'istante non muove denaro — `acceptVipGrigori`
   mette una corsa in coda, il denaro arriva quando la corsa finisce. Le due
   chiedono lavori opposti (la prima ha bisogno di uno stato che manca, la seconda
   va provata dove l'effetto arriva), e confonderle vuol dire cercare per
   settimane uno stato che non serviva. Ora sono due categorie separate, nel
   banco, in `npm run stato` e nel registro.

**I numeri, prima → dopo:** azioni verificate 53 → **75**, «al buio» 76 → **17**.
Il bersaglio della fase («sotto 20») è raggiunto. Delle 76 di partenza, **37**
erano azioni che il banco eseguiva già senza saperlo, e le altre si sono sbloccate
in tre modi, tutti e tre più banali di uno stato di gioco mancante:

- **il banco era povero.** Un hub o un asset di lusso costano milioni (fino a
  8.000.000 in data.js) e il banco aveva un milione: `buyHub`,
  `buyLifestyleAsset` e sorelle uscivano su «fondi insufficienti». Ora ne ha
  cinquanta, il patrimonio di un giocatore a fine partita.
- **il banco bussava a indirizzi inventati.** `payFine('c1')`, `repayLoan(0)`:
  l'azione non trovava la multa o il prestito e sembrava bloccata. Ora
  `R.identikit(env)` restituisce gli id VERI di quello che il regista ha messo
  nel mondo, e il banco li usa.
- **un campo con due nomi.** Lo scenario scritto a mano metteva `onStrike: true`
  su un autista, e `resolveStrike` legge `isOnStrike`: uno sciopero che il gioco
  non vedeva. Difetti così si trovano solo provando a costruire lo stato con
  intenzione.

⚠️ **Il banco ora prova due mondi, non uno**, e la ragione è che preparare uno
stato ne rompe un altro: se il regista mette in mano al giocatore la polizza
Kasko (serve all'Erede) allora `_ecPolizzaKasko` non ha più niente da comprare;
se gli mette un prestito attivo (serve a `repayLoan`) allora `takeLoan` rifiuta.
Non è un difetto del gioco: sono situazioni che nella partita vera non capitano
insieme. Chi aggiunge stati al regista deve ricordarsi di azzerarli nel mondo
«nudo», o rimetterà in piedi il problema al contrario.

**Prossima sessione:** la Fase 2 ha raggiunto il suo bersaglio; restano 17 azioni
al buio, e sono il fondo difficile — holding/OPA (`acquireSubsidiary`,
`sellCempShares`), turismo, agenzia ombra, e le due di HQ, che sono ferme
**giustamente** perché `HQ_ENABLED = false` (andranno segnate ⏭️ nel registro,
non inseguite). Si può passare alla **Fase 3**, le 254 azioni sistema per sistema,
cominciando da consorzi/alleanze come dice il piano: il regista adesso costruisce
lo stato che serve.

# ✅ 30/08 (notte) — IL GIOCO È DIVENTATO MULTIPLAYER. Suite **2352 verdi**.

Vlad ha cambiato priorità e l'ha detto chiaro: «adesso non mi interessa più di
tanto avere un guadagno, piuttosto mi piacerebbe avere delle versioni di
persone che giocano e sono contenti di giocare». Da lì sono usciti due lavori,
fatti e verificati dal vivo nel browser.

## 1. NETWORK — chat globale, messaggi privati, amicizie (`0df25ba`)

Nuova scheda **💬 Network** (`social.js`, menu Community + sidebar Info) con
quattro viste: Globale, Consorzio, Messaggi, Amici.

**Server: `70_chat_globale_messaggi_amici.sql`, GIÀ APPLICATO al DB live.**
Tre tabelle nuove — `global_chat`, `direct_messages`, `friendships` — tutte con
lo stesso principio del resto del gioco: si **leggono** con RLS, si **scrivono
solo via RPC `security definer`**. Nessuna policy di INSERT, quindi non esiste
un percorso che salti autenticazione, rate-limit e limiti di lunghezza. Le tre
tabelle sono nella publication Realtime.

Due cose da ricordare, perché sono decisioni, non dettagli:
- **Il nome di chi parla lo legge il server da `leaderboard`.** Il client non lo
  manda proprio. `rpc_post_alliance_chat` (vecchia) si fida del `p_company_name`
  che arriva dal browser: in un consorzio di gente che si conosce passa, in una
  piazza pubblica vuol dire potersi firmare col nome di un altro.
- **Richiesta di amicizia incrociata = accettazione.** Se no restano due
  richieste pendenti e nessuno dei due capisce chi deve accettare.

Lato client: la posta si ascolta **dal caricamento**, non dall'apertura della
scheda — un messaggio deve accendere il pallino (`#social-dot`) mentre guardi la
flotta. Dalla classifica ogni riga ha ✉️ e ＋.
**La chat di consorzio esisteva già** (`alliances.js` + `alliance_chat`): il
Network la mostra riusando la STESSA RPC, non una copia.

## 2. EVENTI CEO — da 6 a 63 (`fc6159c`)

«Ci sono sempre le stesse scelte e gli stessi eventi.» Non era sfortuna, era la
selezione: sei eventi, uno per mese, `find(e => e.month === gameState.month)`.

Ora il catalogo ha **63 eventi / 146 scelte** e la selezione ha tre livelli:
`month` (con `month: null` = tutto l'anno, 31 eventi), `requires` (corse,
reputazione, flotta, autisti, regione, staff — decide CHI vede cosa), e
`gameState.eventiCEOVisti`, un anello di 25 che scarta i già visti.
⚠️ La memoria si aggiorna **solo quando l'invito parte davvero**: aggiornarla
dentro la scelta bruciava un evento a ogni giro in cui la moneta mandava
un'offerta B2B, e dopo 25 giri ricominciavano le ripetizioni.

**Nuovo vocabolario degli effetti** (`negotiateEmail`, engine-daily.js):
`gain` incassa, `rides`/`tier` generano corse (tetto 8), `prob`/`ko` rendono la
scelta una scommessa — il costo si paga comunque, l'esito no.
🐛 **Difetto vecchio chiuso qui**: l'incasso si scriveva come costo negativo
(`cost: -5000`, «Servizio Pagato (+€5.000)») e `Math.max(0, cost)` lo azzerava.
Il bottone prometteva cinquemila euro e non arrivava niente.

**Ogni evento porta la propria lettera** (`da` + `testo` in data.js): è la
chiusura del punto 1 rimasto aperto ieri. I dodici modelli generici restano come
rete per chi non ha una lettera propria. L'email salvata non si porta più dietro
il testo del modello (era `{{segnaposti}}` dentro ogni salvataggio).

## Cosa Vlad ha deciso di NON fare (non riproporlo)
- **Leasing**: «l'ho testato un po' meglio e per me va bene così. Rimane com'è.»
- **Corsie taxi/camion**: da progettare bene **dopo il rilascio** — «è una vera
  extension del gioco».
- **Dispatcher junior/senior**: non è un problema, è staff che si assume.
- **Elicottero/jet non vendibili**: fa parte di un update futuro.

## La migrazione 69 è stata TOLTA, non applicata
Vlad ha dato il via libera («finché non abbiamo giocatori reali puoi toccare
tutto»), ma prima di sovrascrivere ho letto la funzione **vera** in produzione.
Non era come il file la descriveva: `rpc_list_car_for_sale` aveva **già**
minimo €1.000, massimo €50.000.000, segnalazione anti-cheat sopra i €10M e un
tetto di **5 annunci attivi** per giocatore. La migrazione, scritta credendo che
ci fosse solo `<= 0`, avrebbe rimpiazzato la funzione **perdendo il tetto dei 5
annunci e le segnalazioni**: un passo indietro travestito da rafforzamento.
File eliminato — un `.sql` fermo nel repo con scritto «da applicare» è una
trappola per la prossima sessione. Guardrail in
`test/funzioni/forbice-prezzo-p2p-server.test.js`.

**Il disallineamento vero era nel client** ed è corretto: il minimo della
forbice era €100 contro i €1.000 del server, quindi su un'auto molto malmessa il
campo diceva «da €400», il giocatore scriveva €400 e prendeva un errore che
sembra un guasto. Ora `_forbicePrezzoP2P` rispecchia i paletti del server e
restituisce anche `vendibile`: un rottame che nemmeno al 200% arriva a €1.000
non si vende ai giocatori, e la scheda lo dice invece di mostrare un campo
impossibile.

## Resta aperto
- **Push**: fatto. `main` fa auto-deploy su Vercel, il sito è aggiornato e
  verificato (`npm run preflight:prod`).
- Acquisto Driver Coins vero end-to-end (solo Vlad può farlo) e la Restricted
  API Key al posto di `STRIPE_SECRET_KEY` — vedi la sezione Stripe qui sotto.

# ✅ 30/08 — LE CINQUE SEGNALAZIONI DI VLAD: TUTTE CHIUSE. Suite **2305 verdi**.

> # 🟢 30/08 (sera) — STRIPE È IN LIVE. Soldi veri, da adesso.
> Vlad ha aperto l'account, verificato (`charges_enabled`/`payouts_enabled`
> entrambi `true`, zero campi mancanti). Fatto in autonomia via API, senza
> passare dalla dashboard: webhook live creato con `POST /v1/webhook_endpoints`
> (endpoint e signing secret **separati** da quello di test), le quattro
> variabili aggiornate su Vercel (progetto `ncc`, ora collegato con `vercel
> link`), redeploy, verificato dal vivo che `/api/dc-checkout` risponde `401
> sessione_non_valida` invece del vecchio `503 pagamenti_non_configurati` —
> **senza fare nessun addebito vero**, quel controllo l'ha già negato prima di
> arrivare a Stripe.
> ⚠️ **Non ancora provato un acquisto vero end-to-end** — va fatto nel browser
> con una carta reale (anche il pacchetto più economico), perché è l'unico
> modo di vedere l'incasso senza che io possa farlo al posto di Vlad.
> ⚠️ **Chiave da irrobustire, non urgente**: `STRIPE_SECRET_KEY` oggi è la
> secret key piena (`sk_live_...`), incollata in chat. L'unica chiamata che fa
> a Stripe è `POST /v1/checkout/sessions` (`api/dc-checkout.mjs`) — il webhook
> non la usa affatto, verifica solo con `STRIPE_WEBHOOK_SECRET`. Quindi basta
> una **Restricted API Key** con permesso *Checkout Sessions: Write* e niente
> altro: Dashboard → Developers → API keys → Create restricted key, poi
> sostituire il valore su Vercel. Dopo il cambio, revocare la secret key
> piena da Stripe (Developers → API keys → Roll/Delete): è la chiusura del
> cerchio per una chiave che è stata scritta in una chat.
> **Webhook di test lasciato attivo apposta**: Stripe separa gli eventi
> test/live per costruzione, non interferisce e serve ancora per provare
> senza soldi veri prima di cambiare qualcosa nel codice dei pagamenti.
>
> **Cosa resta aperto** (due decisioni di Vlad, nessun lavoro pendente):
> 1. **Le email degli eventi CEO**: il corpo della lettera parla ancora di un
>    evento inventato dal template mentre i bottoni vendono l'evento del mese.
>    O i template nominano l'evento (`{{eventName}}`, il segnaposto esiste già),
>    o gli eventi si portano dietro il proprio testo d'invito.
> 2. **Lo smistamento automatico ora si assume** (Junior Dispatcher, €1.400/mese):
>    fuori dall'onboarding, chi non lo assume smista a mano. È quello che il
>    catalogo dello staff prometteva da sempre, ma è un cambio di ritmo vero.
>
> ## 5. TUTORIAL E MISSIONI — fatto (`e6d6433`)
> Costruito lo **Spotlight ancorato** che Vlad aveva scelto. Il buio non è più
> un canvas dipinto una volta sola: è l'ombra esterna dell'anello, quindi il
> foro segue il bersaglio quando la pagina scorre. Bolla con freccia, «Passo N
> di M», Escape per uscire; il lato lo sceglie lo spazio disponibile.
> **La fragilità è stata progettata**: bersaglio assente o a misura zero → bolla
> centrata e nessun anello (mai puntare al vuoto), e
> `test/guardrail/tutorial-bersagli.test.js` verifica che ogni selettore esista
> in `index.html` — l'interfaccia che cambia diventa un rosso nella suite.
> Riscritte col kit `.em` le due schermate che Vlad diceva «di un altro gioco»
> («IL FONDO DEL BARILE», «SVEGLIATI, SCHIAVO») e il modal di Vittorio.
> `ui-career.js`: **153 esadecimali a mano → 0**, **23 `monospace` → 0**.
>
> ⚠️ **DA SAPERE, cambio strutturale al CSS:** i token `--em-*` erano dichiarati
> dentro `.em`, quindi `var(--em-gold)` valeva **solo per il contenuto del kit**.
> Modali, tutorial e schermate attaccate a `<body>` non li vedevano: il colore
> cadeva sull'ereditato e il pannello usciva scolorito. **Ora stanno su `:root`**
> — stessi valori, una sola dichiarazione. Aggiunti i token che mancavano per le
> pill scure (`--em-gold-soft`, `--em-green-soft`…), il fondo pagina (`--em-bg`)
> e le medaglie (`--em-tier-*`): erano già in uso, scritti a mano, in più copie.

> # ✅ 30/08 — LE QUATTRO SEGNALAZIONI DI VLAD: CHIUSE. Suite 2286 verdi.
>
> Metodo tenuto come chiesto: un difetto per volta, un test che lo difende
> prima di passare al successivo, `npm test` intero dopo ognuno, verifica dal
> vivo nel browser. Partenza 2261 verdi, arrivo **2286**, zero rossi.
>
> **1. VITTORIO — chiuso** (`4aaf1b6`). La diagnosi del 29/08 era esatta. Due
> rimedi invece di uno: il bottone ora passa l'importo (`data-ce-args`), e
> `repayVittorio` accetta come importo **solo un numero finito** — qualunque
> altra cosa significa «paga quanto consente la cassa».
> **Il censimento del pattern è stato fatto e non ha trovato altri Vittorio**:
> 452 invocazioni di azioni (`data-ce-act` letterale + helper `ceAct`), 90 senza
> argomenti, 4 con parametri dichiarati. Tre erano sane — due dichiarano `ev`
> (`ceForgotPassword`, `ceAlChatEnter`), la terza (`buyHRAutomation`) risolveva
> a un'omonima interna a `serverState.js`, mentre la globale vera in
> `ui-ops.js:218` non ha parametri. Il guardrail permanente è
> `test/guardrail/azioni-senza-argomenti.test.js`: rifà quel censimento a ogni
> run e fallisce se nasce un caso nuovo.
> Corretto per strada `test/funzioni/aste.test.js`: `_countdown` a +72h esatti
> legge «2g 23h» se passa un millisecondo, e la suite diventava rossa a caso.
>
> **2. DRIVER COINS — nessun codice da cambiare, verificato dal vivo.** Il testo
> «Pagamento non confermato: nessun Driver Coin accreditato» **non esiste più nel
> repo**: viveva in `ui-store.js` fino a `2e49890` (23/08) ed è stato sostituito
> da `5da4036`. Verificato che la produzione serve il file nuovo
> (`curl .../ui-store.js` → contiene `api/dc-checkout`, non contiene la vecchia
> frase) e che l'endpoint risponde **503 `pagamenti_non_configurati`** in 0,67s,
> che il client traduce in «Il negozio non è ancora attivo. Nessun addebito è
> stato fatto.» Quello che Vlad ha visto era la sua cache del browser.
> **Resta una domanda per Vlad, non un bug:** accendere Stripe? Servono le
> quattro chiavi di `docs/PAGAMENTI.md`.
>
> **3. NON ESCONO PIÙ SERVIZI — diagnosticato e chiuso** (`427520f`). Le corse
> venivano generate regolarmente: **sparivano**. `autoDispatchRides()` gira a
> ogni tick del gameLoop (`engine.js:1091`, ogni 600ms) e assegnava tutto senza
> chiedere se in azienda ci fosse un dispatcher. Misurato sul motore vero:
> `pending prima=1, dopo=0`, a ogni singolo giro. Quindi «Richieste Pendenti»
> restava 0 per sempre e intanto la coda dell'autista saliva a 5.
> Il catalogo dello staff lo diceva già: `dispatcher_jr` — «Auto-smista corse
> Standard ogni tick. **Senza di lui tutto è manuale.**» Il gate non c'era.
> Il difetto esisteva da sempre ma è diventato **totale il 28/08**: con `RITMO=3`
> le corse durano un terzo, nelle 4h di coda ce ne stanno tre volte tante e la
> coda non si riempie quasi mai — prima si saturava e qualche richiesta restava
> in lista. Ora: nessun dispatcher = tutto manuale; Junior = corse standard;
> Senior = anche VIP e Ultra.
> ⚠️ **Conseguenza voluta da tenere d'occhio:** chi non assume un dispatcher non
> ha più smistamento automatico a schermo chiuso oltre alla coda già piantata.
> Corretto anche **«coda 5/undefined»**: `ui-dispatch.js` leggeva
> `qInfo.maxQueue`, campo che `_getDriverQueueInfo` non restituisce più da
> quando il tetto si misura in ore. Ora «coda 9 corse» + «coda tot: 2h 39min / 4h».
>
> **4. EMAIL EVENTI CEO — chiuso** (`b2ebaaa`). Tutti e quattro i difetti dello
> screenshot: la città mancante (`REGION_CAPOLUOGHI` + `_cittaPerEmail()`, che
> ripara anche le email di caccia agli autisti), il «302» al posto della data
> (`_dataPerEmail()`, più otto frasi dei template che volevano l'articolo),
> l'oggetto che era quello del template a caso invece che dell'evento, e i
> prezzi fissi (**±30%**, etichetta ricostruita dal numero vero così bottone e
> addebito non possono divergere; il beneficio in reputazione **non** si muove,
> è ciò che rende la variazione una decisione).
> ⚠️ **RESTA APERTO, deliberatamente non toccato:** il *corpo* della lettera
> parla ancora di un evento inventato dal template («Summit annuale del Forum
> Economico») mentre i bottoni sotto vendono l'evento del mese. Gli 11 template
> `ceo_event` sono inviti generici e i `CEO_EVENTS` sono sei eventi precisi:
> riconciliarli è una scelta di scrittura, non un fix di passaggio. **Serve una
> decisione di Vlad**: o i template nominano l'evento (`{{eventName}}`), o gli
> eventi si portano dietro il proprio testo d'invito.
> Trovato per strada e non toccato: `data.js:1613` dice «sanzioni da €{{amount}}
> a €{{amount}}» — minimo e massimo escono uguali per costruzione.
>
> **5. DESIGN TUTORIAL (Spotlight ancorato) — vedi sotto, è l'unico rimasto.**
>
> ---

> **STATO 29/08 — LE TRE FASCE, I PAGAMENTI VERI, IL MANUALE.**
> Quattro richieste di Vlad dopo il playtest di Pietro. Tre fatte, una annotata.
>
> **1. Le tre fasce di corsa** (`45b730b`). Vlad: «se uno ha la macchina scarsa
> può e deve avere delle corse anche standard, pagate meno; le richieste
> particolari si fanno con la macchina che chiedono». Prima la fascia si
> deduceva dalla CLASSE richiesta, quindi ogni tratta da berlina era 'business'
> — che pagasse 102€ o 3.108€ — e la fascia standard non aveva mai corse. In
> catalogo, per lo stesso motivo, **nessuna auto era standard**: anche la Nexus
> da 35.000€ era business.
> Ora la fascia la decide il **prezzo**: <500€ standard · 500-1.500 premium ·
> >1.500 luxury (`SOGLIA_FASCIA_*` in engine-rides.js). Misurato: 356 tratte da
> lavorare per chi comincia (prima zero), e la media sale da **276€** (auto
> d'ingresso) a **721€** (Executive) a **1.513€** (S-Imperial).
> Tolta la famiglia `presidenziale`: era una separazione per LUSSO dentro un
> asse che descrive la FORMA del veicolo, e teneva la fascia luxury
> irraggiungibile per 1.735 tratte su 1.889. Una S-Imperial è una berlina.
> Aggiunto lo **Stellar V-Imperial** (van vip, €280.000) perché i van non
> avevano nessuna auto di lusso: senza, le tratte da van sopra 1.500€ sarebbero
> nate impossibili. *(Usa l'immagine del V-Carrier: servirebbe la sua.)*
> Trovati strada facendo: lo smistamento a mano non controllava la fascia (il
> drag&drop accettava quello che «Smista tutte» rifiutava); le corse POI di
> lusso venivano proposte a chi non poteva servirle; il tier salvato nei
> veicoli poteva divergere dal listino (ora si riallinea al caricamento).
> **Il guardrail nuovo** passa su tutte le 1.889 tratte e verifica che ognuna
> sia servibile da almeno un'auto acquistabile: è l'unico test che avrebbe
> visto il bug del 28/08. Ha già trovato un falso allarme suo (il Water Taxi
> non sta in `NEW_CARS` ma in `FLEET_VEHICLE_CLASSES`).
>
> **2. I Driver Coins si comprano con denaro vero** (`5da4036`). Vlad: «non deve
> più succedere che, se clicco per acquistare, me li dia subito». Verificato:
> `rpc_purchase_dc_pack` **non è mai esistita in produzione** — il file `65_`
> non è mai stato applicato, e con lui `ec_dc_packs`/`ec_pack_payments`. Quindi
> l'acquisto falliva sempre, e sotto ai pacchetti c'era «acquisti simulati».
> Ora: `api/dc-checkout.mjs` (apre la cassa Stripe) + `api/dc-webhook.mjs`
> (verifica la firma e accredita) + `68_pagamenti_driver_coins.sql` **applicato**.
> Carta, PayPal, Apple Pay e Google Pay si accendono dal dashboard Stripe: non
> sono nominati nel nostro codice. Zero dipendenze npm (`fetch` + `node:crypto`).
> Il browser non può accreditare, e non è un controllo nel codice:
> `rpc_credit_dc_purchase` è **REVOCATA** ad anon e authenticated.
> **Trovato dal vivo dopo il deploy** (`bcf62c1`): le due funzioni erano scritte
> con l'API Web (`Request => Response`) e Vercel le invoca con gli oggetti Node.
> Restavano **appese**, timeout su ogni chiamata — non 404, non 500: silenzio,
> perché una funzione che lancia prima di rispondere non chiude la connessione.
> Riscritte con `(req, res)`. Ora `/api/dc-checkout` risponde in 0,34s.
> **I test non vedono questa differenza**: va provata con una chiamata vera.
>
> ⚠️ **MANCANO SOLO LE CHIAVI** — vedi `docs/PAGAMENTI.md`: quattro variabili su
> Vercel (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`,
> `SUPABASE_SERVICE_ROLE_KEY`) e il webhook da creare su Stripe. Finché non ci
> sono, il negozio dice «non ancora attivo» e non regala niente.
>
> **3. Il Knowledge Book** (`93e3141`). `knowledge-book.js`, scheda 📖 Manuale.
> Dodici capitoli con ricerca. **Le tabelle si generano dai dati veri** (listino,
> stipendi, licenze, soglie): un manuale coi numeri copiati dentro è sbagliato
> al primo ribilanciamento, e un manuale che mente è peggio di nessun manuale.
> I test verificano quel legame — se una costante cambia, diventano rossi.
>
> **4. DA FARE — il design del tutorial e delle missioni.** Vlad: «va rifatto,
> così com'è non c'entra niente col design del gioco; è rimasto quello vecchio
> iniziale». Verificato, e ha ragione, con i numeri:
> | file | colori scritti a mano | token `--em-*` |
> |---|---|---|
> | `ui-career.js` (Missioni) | **153** | **0** |
> | `zero-to-hero.js` (tutorial) | 15 | 0 |
> | `vittorio.js` (narrativa) | 14 | 0 |
> | `ui-dispatch.js` (convertito) | — | 64 |
> `ui-career.js` usa anche `font-family:monospace`. Visto dal vivo: le schermate
> «IL FONDO DEL BARILE» e «SVEGLIATI, SCHIAVO» hanno font, colori e proporzioni
> di un altro gioco. **Non toccato**: Vlad ha chiesto di annotarlo, non di
> farlo. Quando si farà, la strada è quella già usata per gli altri file —
> togliere i colori a mano e prendere i token `--em-*` da `style.css`.
>
> # ⚠️ DA FARE SUBITO — 29/08 (notte), segnalazioni di Vlad
>
> **VINCOLO ESPLICITO DI VLAD, vale su tutto quello che segue:**
> «la mia paura è che, andando a sistemare questi problemi, andiamo di nuovo a
> creare altri bug. È essenziale lavorare in modo che non roviniamo niente e non
> creiamo altri bug, perché se no è tutto inutile.»
> → Un difetto per volta. Test che lo difende PRIMA di passare al successivo.
> `npm test` intero dopo ognuno (partenza: **2261 verdi**). Zero refactor
> collaterali. Verifica dal vivo nel browser, non solo test.
>
> ## 1. VITTORIO — DIAGNOSI GIÀ FATTA E CONFERMATA, manca solo il fix
> Sintomi visti da Vlad, tutti e tre insieme:
> «Pagati €0 a Vittorio. Residuo: €0» · `null value in column "cash" of relation
> "companies" violates not-null constraint` · «Saldo non valido corretto
> automaticamente».
>
> **Sono lo stesso bug.** Catena confermata leggendo il codice:
> 1. `vittorio.js:138` genera il bottone con `data-ce-act="repayVittorio"` **e
>    senza `data-ce-args`**;
> 2. `events.js:41` invoca `fn.apply(el, parseArgs(el).concat([ev]))` — con args
>    vuoti passa **l'oggetto evento come primo argomento**;
> 3. quindi in `repayVittorio(amount)` (`vittorio.js:72`) `amount` è un Event:
>    `amount != null` è **true**, e `Math.min(Event, …)` = **NaN**;
> 4. `Math.max(0, NaN)` = NaN, e la guardia `if (pay <= 0)` **non scatta**
>    perché `NaN <= 0` è false;
> 5. `g.cash = cash - NaN` → **cash NaN** → `syncCash(NaN)` serializza `null` →
>    il server rifiuta con il not-null constraint;
> 6. al giro dopo la guardia in `engine.js:1019` ripristina e mostra il terzo
>    messaggio.
>
> **Fix minimo**: in `repayVittorio`, accettare `amount` solo se
> `Number.isFinite(amount)` (altrimenti trattarlo come «paga tutto»), e
> rifiutare `pay` non finito. Test: cliccare il bottone col debito già a zero
> non deve toccare il saldo.
>
> **⚠️ È UN PATTERN, NON UN CASO SINGOLO.** Ogni funzione invocata via
> `data-ce-act` SENZA `data-ce-args` riceve l'evento come primo parametro. Se
> quel parametro è opzionale e viene usato in un calcolo, si comporta come
> Vittorio. **Da censire prima di dichiarare chiuso il punto 1**: cercare i
> `data-ce-act` senza args le cui funzioni hanno parametri, e verificarli.
> Vale un guardrail permanente.
>
> ## 2. DRIVER COINS — non accreditati, ma vanno comprati con soldi veri
> Vlad vede «Pagamento non confermato: nessun Driver Coin accreditato».
> È il comportamento atteso oggi (nessuna chiave Stripe configurata), ma il
> messaggio è sbagliato: sembra un pagamento fallito, non un negozio spento.
> **Nota**: quel testo viene dal percorso VECCHIO — `_dcAcquistaPacchetto` dice
> «Il negozio non è ancora attivo». Verificare se il bottone in produzione
> chiama ancora `_dcSimPurchase` (cache del browser di Vlad?) o se resta un
> punto non migrato. Vlad ha detto che i pagamenti restano in standby MA i
> giocatori devono poterli comprare: chiarire con lui se ora vuole accendere
> Stripe (servono le 4 chiavi, vedi `docs/PAGAMENTI.md`).
>
> ## 3. NON ESCONO PIÙ SERVIZI — il più grave, blocca il gioco
> Screenshot: «Richieste Pendenti 0» · «In attesa di chiamate…» con 1 autista
> attivo e 1 veicolo operativo. **Non ancora diagnosticato.**
> Indizio visibile nello stesso screenshot: nella riga dell'autista c'è
> **`coda 5/undefined`** — il tetto della coda è `undefined`. Da lì partire:
> `_getDriverQueueInfo` in engine-rides.js e come la disegna `ui-dispatch.js`.
> Verificare anche: `gameState.unlockedRegions`, se l'auto è `outOfService`,
> e se il cash NaN del punto 1 blocca i generatori.
>
> ## 4. PREZZI SEMPRE FISSI + TEMPLATE EMAIL ROTTI
> Vlad: «I prezzi sono sempre fissi, messi così non mi spingono a pagare. Non è
> molto divertente.» Riferito alle email CEO event: sempre «Partner Ufficiale
> (€20.000)» e «Presenza Ridotta (€6.000)», identici in ogni email.
> **Nello stesso screenshot si vedono altri due difetti veri**:
> - «Camera di Commercio **di**» → il nome della regione manca (segnaposto non
>   sostituito);
> - «organizza **302**» e «Si terrà **302** il Gala» → al posto della data
>   compare il NUMERO DEL GIORNO di gioco;
> - la riga «Stars internazionali cercano discrezione e lusso assoluto» è
>   identica in email diverse (testo di un altro template).
> File da guardare: `EMAIL_TEMPLATES` in `data.js:708`.
>
> ## 5. DESIGN TUTORIAL — VLAD HA SCELTO
> **Numero 5, lo Spotlight ancorato** («più moderno e in linea con il gioco»).
> Il mock-up è in `_mockups/tutorial-cinque-direzioni.html` (quinta scheda) e
> online su https://claude.ai/code/artifact/0f2ec93a-9a25-4329-bb14-c5df17894d71
> Da costruire per davvero: serve un sistema di **ancoraggio a un elemento**
> (evidenzia il bersaglio + fumetto accanto), non solo la grafica. Attenzione,
> è il più costoso dei cinque: se l'interfaccia cambia, il tutorial punta al
> vuoto — va progettato per reggerlo.
> Riguarda `zero-to-hero.js`, `vittorio.js` e soprattutto `ui-career.js`
> (153 colori scritti a mano, zero token `--em-*`, `font-family:monospace`).
>
> ---

> **STATO 29/08 (sera) — VEICOLI, AIUTO CONTESTUALE, MOCK-UP DEL TUTORIAL.**
>
> **1. I veicoli funzionano tutti** (`dac8831`). Verificati uno per uno: 18
> veicoli stradali, tutti con immagine, scheda tecnica, famiglia e tratte
> servibili. Ma il negozio dava a **10 auto su 19** una fascia diversa da quella
> con cui poi lavorano: lo showroom traduceva le proprie etichette commerciali
> (PRESIDENTIAL, COMMERCIAL, ARMORED…) con una mappa sua, duplicata in due punti
> del file. Con la normalizzazione al caricamento, l'auto **cambiava fascia
> ricaricando la pagina**. Ora è una funzione sola che legge il listino, e il
> negozio lo dice: «SERVE CORSE STANDARD/PREMIUM/LUXURY» su ogni auto.
> **Rimosso lo Stellar V-Imperial** che avevo aggiunto: Vlad ha chiesto niente
> veicoli nuovi. Conseguenza accettata: i minivan arrivano al massimo a PREMIUM.
> Nuovo guardrail `test/guardrail/veicoli-funzionano.test.js`.
>
> **Non raggiungibili** (censiti nel guardrail, decisione di prodotto in sospeso):
> elicottero e jet (prezzo, soglia e potenziamento HQ, ma nessun pulsante li
> vende) · il leasing (`openLeasingModal` esiste, nessuno la chiama) ·
> `USED_CARS` non è un concessionario, sono i lotti delle aste.
>
> **2. Aiuto contestuale** (`dac8831`). Pulsante «?» sempre presente che apre il
> capitolo del manuale per la scheda aperta, in un pannello sopra il gioco.
> Trenta schede mappate, con un test che legge le schede vere da dispatcher.js.
>
> **3. Cinque mock-up del tutorial** in `_mockups/tutorial-cinque-direzioni.html`:
> nota interna · messaggio da Vittorio · barra operativa · carta intestata ·
> spotlight ancorato. Stesso testo vero, cinque trattamenti. **In attesa che
> Vlad scelga.**
>
> **4. Annotato**: la configurazione motore (diesel/benzina, cavalli) che Vlad
> vuole nel configuratore — **puramente estetica, nessun beneficio**. Nota nel
> vault `03 Sistemi Core/Configurazione Motore (da fare).md`.
>
> **I pagamenti restano in standby** per decisione di Vlad: prima il gioco deve
> funzionare. Il codice è pronto e online, mancano solo le chiavi.
>
> Suite: **2261 test, 0 rossi.**

> Suite: **2252 test, 0 rossi.**

> **STATO 28/08 (notte) — PRIMO PLAYTEST ESTERNO (Pietro). Tutto risolto.**
> Il primo occhio non nostro sul gioco, e ha trovato cose che 2225 test non
> vedevano. Tutti i difetti riprodotti sul codice PRIMA di toccare qualcosa.
>
> **Una partita nuova era impossibile.** Misurato: su 1889 tratte del database
> l'auto di partenza ne poteva servire **zero**. Due controlli in disaccordo —
> il generatore scartava per FAMIGLIA di veicolo (e non aveva una famiglia per
> le berline), l'accettazione confrontava la CLASSE ESATTA e il LIVELLO. In più
> la berlina era marcata `tier:'standard'` pur essendo una `volt_3_urban`, che
> nel listino è BUSINESS, e nessuna corsa da contratto è mai 'standard'.
> Ora la regola è **una sola** (`_flottaPuoServire`) per generare e accettare:
> non nasce più una corsa che non si può fare. La progressione regge — vive FRA
> le famiglie, non dentro: berlina €1014 medi, +minivan €1398 (+38%).
>
> **Il ritmo.** L'orologio del gioco È l'ora italiana vera, senza accelerazione,
> e una corsa durava 128 minuti REALI. Accelerare l'orologio romperebbe tutto
> (giorno, notte, meteo, contratti, offline). La durata delle corse è invece un
> conto alla rovescia indipendente: `RITMO = 3` lì. Tratta tipica da 113 a 38
> minuti. Il tetto della coda resta 4h: stesso tempo impegnato, triplo lavoro.
>
> **Il conio dei Driver Coins.** Pietro aveva visto il sintomo e sbagliato la
> causa: non è in locale, è sul server. `rpc_add_driver_coins` accettava un
> importo scelto dal client fino a 1.000.000×20/min = **20 milioni al minuto**.
> Non si può revocare (ci passano i premi), quindi tetto stretto alla scala vera
> (premio più alto del gioco: 120 DC → tetto 500). Migrazione `67_`, applicata.
> **Resta uno stopgap**: la chiusura vera è far decidere l'importo al server dato
> il MOTIVO, come già fa `rpc_purchase_dc_pack`.
>
> **L'interfaccia: da ~180 punti illeggibili a zero** su nove schede. Causa: il
> tema è stato convertito a chiaro (`2211194`) e poi di nuovo a scuro
> (`06e5763`), lasciando ibridi. L'Inbox aveva fondo `#ffffff` con testo
> `#e6edf3`: contrasto **1.18**, bianco su bianco. Ma la causa più diffusa era
> **un solo token**, `--em-muted` = `#6b7280`, il colore di quasi tutto il testo
> secondario: 3.58 ovunque. Anche gli accenti (blu 3.61, viola 3.57).
> ⚠️ **CLAUDE.md diceva «kit .em light»**: era vecchio di due conversioni.
> Corretto — si ricarica a ogni messaggio, quindi mandava fuori strada sempre.
>
> **Notifiche e tracker** erano nella stessa identica posizione (in basso al
> centro) e si coprivano. **Il `#NaN` nei soldi** era `Math.floor(undefined)`
> nella finestra prima che il saldo arrivi dal server.
>
> **NON fatto, di proposito:** il «Knowledge Book» che Pietro chiede. È una
> funzionalità nuova, non un difetto, e ha bisogno di essere progettata. Il
> bisogno però è reale: c'è molto da spiegare e non si spiega.

> **STATO 28/08 (sera) — IL REGISTRO DELL'ECONOMIA È VIVO IN PRODUZIONE
> (modalità osservazione). 2220 test verdi.**
> `cash_ledger` + `rpc_earn`/`rpc_spend` + `_econ_cap` applicati via
> `66_registro_economia_osservazione.sql`. **NON blocca nulla e non cambia
> nessun guadagno**: annota e basta. Era fermo da mesi per UN motivo scritto
> nella sua spec — «la magnitudine dei tetti dipende dalla scala economica,
> ancora indecisa» — e quella scala l'ha fissata il bilanciamento di stamattina.
> - **La causale ora arriva al server.** `CE_money.spend/earn` la ricevevano da
>   **99 chiamate su 100** (96 causali distinte già scritte nel gioco) e la
>   **buttavano via**: `money.js` → `serverState.js::syncCash(cash, motivo)` →
>   `rpc_sync_cash(v_cash, p_reason)`. Il catalogo non è stato inventato,
>   esisteva già. Sorvegliato da `test/economia/registro-causali.test.js`.
> - **La colonna `oltre_tetto`** è il punto della modalità osservazione: registra
>   quali movimenti *sarebbero* stati rifiutati, senza rifiutarli. Così i tetti
>   si calibrano sui dati invece che a occhio. Query pronte in fondo al file SQL.
> - **`rpc_sync_cash` conserva integralmente l'indurimento di 49_/50_** (tetto
>   +€60M sui soli incrementi, rate-limit 30/min, `FOR UPDATE`) — verificato con
>   `pg_get_functiondef` dopo la riscrittura. Una sola versione della funzione:
>   i client vecchi che mandano solo `{v_cash}` continuano a funzionare.
> - ⚠️ **Le intestazioni di `42_`/`45_`/`51_` dicevano il falso**: si dichiaravano
>   «NON applicato a produzione» mentre erano applicati da tempo. Corrette dopo
>   verifica sul DB vero. Non fidarsi delle intestazioni: interrogare `pg_proc`.
>
> **Trovato provando il gioco vero nel browser, non dai test:** la corsa guidata
> dell'onboarding — **il primissimo guadagno che ogni giocatore incassa** —
> muoveva la cassa a mano, fuori da `CE_money`, e sincronizzava senza causale.
> `una-sola-porta.test.js` non lo vedeva perché cercava solo `gameState.cash`
> mentre il codice usa l'alias `gs` (24 volte nel repo): **bastava rinominare la
> variabile per rendersi invisibili al guardrail**. Ora il censimento vede anche
> gli alias; le 10 righe emerse oltre a quella sono ripieghi guardati, rollback,
> o VTK (che ha una sua RPC autoritativa), tutte documentate una per una.

> **STATO 28/08 (pomeriggio) — IL GUARDRAIL DEL DENARO ERA CIECO AL 90%. Ora no.**
> `test/guardrail/azioni-sincronizzano.test.js` verificava davvero **14 azioni su
> ~152** che toccano denaro; le altre finivano in un secchio silenzioso («non
> attivabili») dove non venivano né promosse né bocciate. **Ora ne verifica 53**,
> ognuna con il suo sottotest. Cinque cause, tutte nel banco, nessuna nel gioco:
> 1. **Lo stato veniva preparato una volta sola.** Alcune azioni rifondano la
>    partita (`_confirmNewGame`, `resetGame`, `sellCompanyNGP`) e SOSTITUISCONO
>    l'oggetto `gameState`: da lì in poi il banco preparava il mondo vecchio
>    mentre le azioni leggevano il nuovo. Ordine alfabetico → cieco quasi subito.
> 2. Mancavano gli **id veri dei cataloghi** (`STOCK_TICKERS`, `LOBBY_LAWS`… che
>    sono `const` nel VM, non su `window`) e gli **importi numerici**.
> 3. Mancava `window.confirm` → ogni azione che chiede conferma usciva subito.
> 4. **Le azioni `async`** venivano guardate prima dell'`await`: il denaro si
>    muove dopo, quindi risultavano immobili.
> 5. Il banco strumentava solo `ServerState`, ma **16 punti in 8 file chiamano
>    `supabaseClient.rpc` diretto** → sembravano non sincronizzare.
>
> **`ROTTE_NOTE` è stata SVUOTATA dopo verifica una per una.** Le 30 voci non
> erano rotte: 29 passavano già da `CE_money` con la loro causale, la trentesima
> (`CE_terminateContract`) non tocca denaro. Erano state riparate quando è nato
> `money.js` e la lista non era mai stata ripulita — nessuno se n'era accorto
> perché il banco non riusciva a interrogarle. **Da oggi una voce di `ROTTE_NOTE`
> che il banco non riesce a provare fa FALLIRE il test**: il limbo non è più
> un'opzione. Garanzia sulle altre: `una-sola-porta.test.js` ha `ECCEZIONI`
> vuoto, quindi nessun file fuori da `money.js` muta le valute.
>
> **DECISIONE APERTA sollevata dal banco riparato (NON toccata):**
> `_opaRequestBuyback` (`hostile_takeover.js:126`) chiama `addebitatoDalServer`
> anche quando la RPC **non parte** (client di rete assente): scala il saldo e
> annuncia «Buyback completato» per un riacquisto mai avvenuto. Al ricaricamento
> il server sovrascrive la cassa → i soldi tornano e l'OPA è ancora lì.
> **Non l'ho cambiato**: è un fallback **deliberato**, protetto da due test che
> lo dicono esplicitamente (`test/holding/opa-buyback-guardie.test.js:71` —
> «il saldo locale riflette l'addebito anche offline» — e
> `test/economy/takeover-sync.test.js:29`). Cambiarlo significa cambiare una
> scelta di progetto e riscrivere quei test: **serve una decisione di Vlad**,
> non un fix di passaggio.

> **STATO 28/08 — BILANCIAMENTO ECONOMICO fatto (2174 test verdi).**
> Metodo: skill `economia-di-gioco` (le sei domande) + `hooked-ux`, su numeri
> MISURATI sul codice, non stimati. Incasso mediano di una corsa: **€360**.
> - **Il difetto strutturale era che il gioco premiava l'attesa**: un contratto
>   tier 5 pagava €137.600/giorno senza consumare nulla (380 corse). Ora un
>   contratto **impegna `tier` veicoli** (che escono dalle corse, riusando il
>   patto di `b2bLockedVehicleIds`), la scala è **×2 ore** e non ×16, e si paga
>   **in proporzione alla capacità reale**. Tetti al prodotto dei moltiplicatori:
>   **×10** sulla tariffa, **×4** sull'incasso (prima nessuno dei due era limitato).
> - **La prima ora era rotta in 4 punti, tutti riparati**: la promessa «150€» con
>   90€ in cassa (ora la cifra è dinamica); `t01` — la radice delle 168 missioni —
>   chiedeva un'auto da 35.000€ a chi ne ha 90 (ora chiede la berlina che ha già);
>   il livello non saliva mai (`player-level.js` esisteva, era testato e **non era
>   caricato**: ora è `window.CE_level`, sale alla prima corsa, è in topbar);
>   l'energia non si rigenerava senza HR/Lounge (ora +1,0/h di base per tutti).
> - **Onestà**: ritirata dal negozio la voce «Limite Offline +2h» (20 DC), che
>   vendeva meno di quanto il gioco dà già gratis e non era letta da nessun file.
> - **Status**: il podio settimanale ora paga 15/10/5 DC, e i drop rari (orologio
>   di Grigori, podi, Black Card) si vedono nella nuova **Bacheca dei Trofei**.
> - **Copertura**: `engine-rivals.js` (5 funzioni vive, 0 test) ora ha 19 test.
>   I tre lavori che Gigi dava per «falliti» erano invece già coperti e verdi.
> - ⚠️ **`trova-morte.test.js` aveva un falso positivo grave** (regex con flag `g`
>   riusata con `.test()` in ciclo): dava per morta `showSlotSelector`, che ha due
>   chiamanti veri. Corretto — ma **prima di cancellare una funzione «morta»,
>   verificare sempre a mano**.
> - ~~**RESTA APERTO, il debito più grosso del repo**: le **28 azioni** in
>   `ROTTE_NOTE` che muovono valuta senza sincronizzare col server.~~
>   **SBAGLIATO — corretto il 28/08. Quelle azioni non erano rotte.** Vedi sotto.

> **STATO 27/08 — collaudi profondi dei 5 sistemi core + bug VIP fixato.**
> I 5 collaudi end-to-end che Gigi aveva lasciato "falliti" (run mai finite, non
> bug) sono stati scritti a mano e sono verdi (`test/collaudo/`): auto
> compra/assegna/vendi, staff assumi/licenzia, prestito prendi/restituisci,
> mercato P2P (guardie client — lo scambio vero è server-side), evento VIP con
> esito. Auto/staff/prestiti/P2P risultano SANI. Il collaudo VIP ha trovato e
> corretto un **bug sistemico reale**: `_vipResolveEmail` marcava l'email
> 'resolved' senza rimuoverla e ~15 handler la ritrovavano col `find` senza
> guardia → doppio click = doppio effetto (doppia multa/gettone e, negli
> `accept*`, DUE corse VIP = doppio incasso). Aggiunta la guardia
> `if (status==='resolved') return` ovunque (vip-clients.js), 2 test "(BUG noto)"
> aggiornati. `npm test` 2083 verdi. **Gigi è FERMO dal 27/08** (fermato per
> conservare il credito ox-alpha): riattivarlo scrivendo `attivo:true` in
> `~/gigi/code-queue.json` o da Telegram «riprendi». Ponte hub→Gigi
> (`richieste_gigi`) attivo ma servito solo a Gigi acceso.

> **LEGGI SEMPRE il diario di quello che Vlad ha detto a Gigi mentre non c'eri.**
> Un solo comando, prende sia il diario che le note:
> ```
> gcloud compute ssh gigi-whatsapp --zone=us-central1-a \
>   --command='tail -120 ~/gigi/diario-vlad.md; echo; cat ~/gigi/per-claude.md'
> ```
> - **`diario-vlad.md`** — si scrive DA SOLO a ogni messaggio, **vocali trascritti
>   compresi**. È la fonte principale: Vlad parla molto con Gigi dal telefono e
>   quasi sempre a voce. Nato il 22/08, dopo che cinque vocali con dentro
>   decisioni sul gioco sono andati persi per sempre — Gigi non ha memoria, e
>   l'audio veniva ascoltato e buttato senza essere scritto da nessuna parte.
> - **`per-claude.md`** — le note che Vlad lascia apposta con «nota: ...». Dopo
>   averle lette, segnale con `segnaLette()` (`jarvis/src/note.js`), altrimenti
>   restano a contarsi come nuove per sempre.
>
> **Non fidarti di quello che Gigi dice di aver fatto.** Non ricorda niente fra un
> messaggio e l'altro, quindi quando afferma «l'ho segnalato a Claude» non sta
> mentendo: sta completando la frase più probabile. Verifica nei file.

---

# 🟢 23/08 sera — hub ripulito, Gigi non si arena piu', 16 lavori recuperati

**Il difetto che teneva fermo il lavoro.** Il ciclo di Gigi chiamava
`fermati('coda vuota')` appena non c'era piu' niente da LANCIARE, senza guardare
se c'era ancora qualcosa da RACCOGLIERE. Il giro dopo usciva subito su
`if (!s.attivo) return`, quindi i passi 1-3 — leggere l'esito delle run,
giudicare i rami, fonderli — non giravano mai piu'. Le run finivano su GitHub e
il risultato non lo leggeva nessuno. E' la causa dei 40 lavori trovati arenati
alle 10:05 e dei 17 di stasera. Corretto in `jarvis/src/code-loop.js`: ci si
ferma solo quando in volo non resta niente che si sciolga da solo
(`in_revisione` e `attende_ok` restano motivo di stop, aspettano una persona).

**⚠️ Errore mio, riparato.** Cancellando i 452 rami `gigi/*` ho tolto anche
quelli di **16 lavori vivi** che avevano passato il cancello (`promuovibile:
true`). Si vedeva dalla nota «ha passato i controlli ma la fusione e' fallita»:
senza ramo la fusione non poteva riuscire. Recuperati con `git fsck
--unreachable` + `git push origin <sha>:refs/heads/<nome>`, fusi in `161a006`,
suite verde a **1891**. **Regola:** i rami `gigi/*` si classificano dallo `stato`
in `code-queue.json`, non da git — terminali sono solo `fuso`, `respinto`,
`fallito`, `sostituito`.

Fra i 16 c'era la correzione del **test instabile**: `initGame(true)` piantava un
`setTimeout` reale a 800ms che `stopAllIntervals` non uccideva, e nei test che
vivono piu' di 800ms scattava a meta' test mutando `pendingRides`. Ora i timeout
sono tracciati: la suite scende da **210 a 76 secondi**.

**I 6 bug del playtest di Vlad** (dal diario Telegram, 14:43-14:54) sono in coda
e in verifica: Executive Club regala Driver Coins senza pagamento (il piu'
grave), banner Vittorio fisso a «devi 0», costo di assunzione una tantum mai
mostrato, noleggio veicoli mancante, tab nascoste + «137 ONLINE» finto,
contrasto testo illeggibile.

**Hub.** Lo specchio della coda ora TOGLIE le righe che non arrivano piu' (solo
se il ciclo dichiara `completa: true`): 79 lavori «in revisione» che non
esistevano da giorni sono spariti. `in_revisione` mancava dalla tabella di
traduzione e finiva in `backlog`. La home mostra solo cose generali — «Fai
lavorare» aveva il repository scritto dentro il codice ed e' passato dentro la
scheda progetto (`LavoroSulCodice`). La pagina Tasks separa i compiti macchina
da quelli da leggere.

---

# 🟢 23/08 — la mappa non e' piu' Mapbox

Otto passi, otto commit sul ramo **`mappa-2d`** (NON ancora unito a `main`).
`npm test` verde: **1888 prove**, erano 1752.

**Cosa vede il giocatore.** Una carta politica dell'Italia in SVG: venti regioni
cliccabili (grigio = bloccata, verde = sbloccata, oro = tua), le 41 citta', la
rete autostradale, le auto che si muovono con la loro scia, zoom 1x-4x e pan.
Cliccando una regione si apre un pannello con prezzo della licenza e reputazione
richiesta; l'acquisto passa da `window.buyRegion`, la stessa della scheda
Licenze. Nessuna porta nuova per il denaro.

**Il difetto piu' importante chiuso:** da telefono **non si poteva cominciare a
giocare**. Fondare l'azienda richiedeva un click sulla mappa, e `map.js` si
rifiutava di creare Mapbox sotto i 768 px. Ora c'e' l'elenco delle 20 regioni, e
su schermo stretto la mappa 2D viene scelta da sola.

**Cosa e' cambiato sotto.**
- `window.MapBackend` (`map-api.js`) e' la giuntura: il motore chiede la mappa a
  un nome, non a un file. E' quello che ha permesso di far convivere le due mappe
  e di alternarle senza ricaricare la pagina.
- `geo-italia.js` porta i confini nel repo: **2.750.289 byte scaricati a ogni
  apertura della War Room diventano 124.559 nel repo**, e cadono tre origini di
  terze parti dalla CSP (api.mapbox.com, events.mapbox.com,
  raw.githubusercontent.com).
- `ride-progress.js` tira fuori l'orologio delle corse da `map-visual.js`: era
  l'unico pezzo del motore delle corse che il banco di prova non poteva caricare.
  Ora ha 15 test suoi. L'elenco dei file esclusi dal banco scende da tre a due.
- Il ciclo di animazione non parte piu' al caricamento del file. Prima girava per
  sempre — a mappa chiusa e a scheda del browser nascosta.

**Difetti vecchi trovati per strada e riparati:** aprire la mappa, chiuderla e
riaprirla dava uno schermo vuoto (`_destroyMap` nascondeva `#leaflet-map` e
nessuno lo rimostrava); il centroide della Puglia faceva fondare in Basilicata;
un click in mare poteva mettere la sede in Sardegna.

## ⚠️ Due cose da fare a mano

1. **Revocare il token Mapbox sulla dashboard.** E' un `pk.` pubblico ristretto
   per dominio, ma resta nella storia di git e finche' e' valido consuma quota.
   Non posso farlo io.
2. **Decidere quanto del ramo mandare in produzione.** I commit sono separati
   apposta: fino a `70b3797` Mapbox e' ancora caricabile con `?mappa=mapbox` (il
   paracadute). L'ultimo commit lo cancella. Se vuoi il paracadute per una
   release, unisci fino a `70b3797` e tieni l'ultimo per dopo.

---

# 🟢 22/08 notte — cruscotto corretto, diario di Gigi, gerarchia sparring + smistatore competenze, 26 falliti smaltiti

**Cruscotto:** due bug corretti in `scripts/stato-progetto.mjs` — leggeva male "azioni totali
estratte" (denominatore a zero) e non riconosceva il formato TAP di GitHub Actions ("# tests"
contro "ℹ tests" del terminale), quindi il primo workflow automatico aveva pubblicato «0 test»
dandosi per riuscito. Aggiunta la misura «azioni toccate da un test» (193/242, l'80%) accanto a
«verificate» (quella che il guardrail sa eseguire da solo, 14/242) — sono numeri diversi e vanno
tenuti separati.

**Il diario di Gigi** (`jarvis/src/diario.js` + `diario-vlad.md` sulla VM): ogni messaggio che
Vlad manda a Gigi, vocali trascritti compresi, si scrive da solo su disco. Nato dopo che cinque
vocali del 22/08 con decisioni sul gioco sono spariti per sempre — Gigi non ha memoria, e
l'audio veniva ascoltato e buttato. **Leggerlo a inizio sessione**, vedi istruzione in cima a
questo file.

**Le tre richieste di infrastruttura dello studio** (Vlad: «molto importanti»), tutte costruite
e provate dal vivo, non solo lette:
- **Gerarchia supervisor + mini-agenti "sparring"** — Game Designer (missioni/economia/
  progressione) e CFO (sorgenti/pozzi/inflazione), sei nuove persona in `jarvis/agenti/`. Ogni
  mini scrive senza vedere gli altri; il supervisor sintetizza e deve riportare i disaccordi in
  una sezione dedicata, non appiattirli.
- **Smistatore di 240 competenze** copiate da `~/.claude/skills/` in `jarvis/competenze/`. La
  prima versione sceglieva per parole in comune (compiti italiani contro descrizioni inglesi:
  falliva sempre). Ora sceglie un modello — verificato con chiamate reali.
- **Memoria comune dello studio**: non un vault nuovo, una sezione in fondo a
  `jarvis/ROADMAP.md` (rispetta la regola del 18/08 "niente nuovi sistemi di organizzazione").
- Due compiti veri già creati sull'hub per collaudare la gerarchia: missioni (Game Designer) e
  calibrazione economica (CFO), assegnati e in attesa che Gigi li peschi.

**I 26 task "falliti" nella coda di Gigi**: diagnosi completa in
`docs/agenti/triage-falliti.md`. **21 erano già superati** — il lavoro era stato rifatto altrove
con nomi diversi e nessuno se n'era accorto (verificato file per file, non per titolo). 1 da
rilanciare senza modifiche. 4 riscritti con la causa vera diagnosticata (in particolare
"politica nel banco", fallito 11+12 volte: il blocco non era mai tecnico, il branch giusto era
118 commit indietro rispetto a main). Tutti e 6 i nuovi/rilanciati sono già in coda.

**Revisione dei branch fermi**: 4 fusi con test verificati per mutazione, 2 respinti
esplicitamente (uno prometteva 5 azioni e ne conteneva 1; l'altro dominio — nemesi/mercato
grigio — aveva due tentativi opposti, uno con test rosso e uno con scope ristretto troppo).
Entrambi rimessi in coda con le istruzioni corrette. `main` verde: 1732 test.

**Decisione di Vlad da tenere a mente per le missioni**: tutto il gioco resta disponibile
dall'inizio, **nessuna area sbloccabile**. Le missioni insegnano mostrando, non aprendo porte —
i 100 "sblocchi" finti (`gs.unlockedFeatures`, letto da nessun tab) vanno tolti o trasformati in
status visibile, non riparati come se fossero un cancello vero.

---

# 🔴 22/08 sera — tredici run fallite, due cause diverse, e nessuna era il lavoro

Vlad ha ricevuto tredici mail di errore da GitHub e Gigi si è fermato. Le tredici run
sembravano lo stesso guasto e non lo erano.

## Causa 1 — quattro run hanno letto e basta (colpa mia, nella consegna)

`ok: false | turni: 22 | token in/out: 853236 / 5266 | file toccati: (nessuno)`

L'ultima frase scritta da una di quelle run: **«Ora ho abbastanza contesto. Scrivo il nuovo
file di test.»** E lì sono finiti i turni.

Il guardrail «senza scrivere non hai finito» ha funzionato — le ha respinte. Ma il difetto
stava a monte, nella consegna: avevo scritto lavori da **13 funzioni ciascuno**, e un elenco
di tredici funzioni invita a studiarle tutte prima di cominciare. Nel lavoro sul mercato P2P
avevo messo l'istruzione giusta («prendi UNA funzione, scrivi il suo test, poi la
successiva») e **non l'avevo ricopiata** in questi.

Due correzioni, e servono entrambe:

- **Nella consegna:** gruppi da 5-6 funzioni, non 13, con in testa la regola *«scrivi il file
  entro il terzo turno, anche con un test solo»* e l'indicazione di quale funzione fare per
  prima (la più semplice, così il primo test fa da scheletro alle altre).
- **Nel motore:** il richiamo a parole c'era già a dodici turni e **non è bastato**. Adesso a
  dieci turni senza aver scritto niente **gli strumenti di lettura spariscono dalla
  richiesta**: restano `scrivi_file`, `modifica_file`, `esegui_comando`. Una richiesta si può
  ignorare, uno strumento che non c'è no. Soglia del richiamo a parole abbassata da 12 a 6.

## Causa 2 — nove run morte sul tetto giornaliero di OpenRouter

```
Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day
Rate limit exceeded: free-models-per-day-stealth.
```

**Due tetti distinti, tutti e due esauriti.** E qui va corretta una cosa che avevo scritto
stamattina nel codice: *«ox-alpha non consuma la quota `:free`»* era vero solo a metà. Non
consuma quella dei `:free`, ma **ha un tetto suo** (`free-models-per-day-stealth`), e con 45
run lanciate in un pomeriggio l'abbiamo finito.

Ogni run moriva dopo **cinque minuti di riprove inutili**: quattro attese (5s, 15s, 45s, 90s)
per ciascuno dei cinque modelli della scaletta. Un tetto giornaliero è **per account**: non
si aspetta e non si aggira cambiando modello.

Tre correzioni:

1. **Nell'agente:** un tetto giornaliero viene riconosciuto (`free-models-per-day`) e
   interrompe subito, senza riprove e senza scendere la scaletta.
2. **Nel ciclo:** prima di lanciare, si **chiede al fornitore** se c'è ancora quota, con una
   richiesta da un token. Il tetto che tenevamo noi non poteva accorgersene — conta le nostre
   partenze, non le richieste consumate, e un lavoro ne mangia fra trenta e cinquanta.
   Verificato dal vivo: con la quota esaurita risponde *«si ferma (giusto)»*.
3. **L'orologio giusto:** la quota si azzera a **mezzanotte UTC**, che d'estate sono le **2
   di notte** da noi. Il ciclo ripartiva a mezzanotte italiana, avrebbe trovato il tetto
   ancora chiuso, bruciato la sua unica riprova automatica e sarebbe rimasto fermo fino al
   mattino. Ora riparte alle **02:30**.

## Il numero da ricordare per programmare le giornate

Il budget vero non è «quanti lavori al giorno» ma **quante richieste**: un lavoro ne consuma
fra 30 e 50, e i due tetti insieme sono valsi **45 run**. Parallelismo riportato da 10 a
**4** — con 10 la giornata intera si brucia in dodici minuti.

## Aggiornamento — i 10 dollari sono dentro, la quota è sbloccata per sempre

Vlad ha ricaricato **10 dollari** su OpenRouter. Verificato con una chiamata vera:
`is_free_tier: false`, nessun errore di quota. Il tetto è passato da 50 a **1000 richieste
al giorno**, permanente — non un abbonamento, un limite che si sblocca una volta e resta
sbloccato.

**Attenzione per il futuro:** la ricarica è finita su un `creator_user_id` diverso da quello
della chiave che stavamo usando — probabilmente un secondo account creato per errore in
precedenza, o la chiave era già stata rigenerata. La chiave nuova è ora ovunque serve:
`~/.config/gigi-modelli.env`, `~/gigi/.telegram.env` sulla VM, e il secret `OPENROUTER_API_KEY`
su GitHub Actions. Gigi è stato fatto ripartire subito invece di aspettare le 02:30.

## Stato

15 lavori riscritti in coda, Gigi ripartito con la nuova quota. `main` pulito. Le quattro
domande nuove sull'hub hanno risposta (vedi sotto).

---

# 🟢 22/08 sera — «187 lavori da rifare» erano 43, e la vera lista di lavoro era un'altra

## Il numero che non era quello

Gigi ha detto a Vlad di avere «187-190 lavori falliti da rifare», e Vlad ha chiesto di
rimetterli tutti in coda. **Non l'ho fatto, e il motivo va ricordato.**

`respinto` in `code-queue.json` non conta i lavori mancanti: conta i **tentativi** respinti.
Lo stesso titolo compare fino a quattro volte, e quasi sempre l'ultimo tentativo di quel
titolo è poi finito `fuso`. Rimettere in coda tutti e 187 significava rifare da capo lavoro
che è già dentro `main`, con la certezza di generare conflitti su file già corretti.

Contando i titoli distinti che non hanno MAI raggiunto `fuso`: **43**, non 187. E
verificando quei 43 contro il repository, la maggior parte risulta comunque già fatta per
altra strada:

| Titolo respinto | Stato reale, verificato nel repo |
|---|---|
| ~10 × «Porta unica del denaro: <file>» | **fatto**: `ECCEZIONI` in `una-sola-porta.test.js` è `new Set([])`, vuota |
| ~8 × «Far vivere nel banco: <sistema>» | **fatto**: il banco carica 56 file; mancano solo `ui-politics.js` e `war_room.js` |
| ~6 × «Collaudo profondo: <sistema>» | **fatto**: quei sistemi hanno l'interruttore acceso in `config.js` |
| ~4 × «Censimento / Registro delle azioni» | **fatto**: i guardrail corrispondenti esistono in `test/guardrail/` |
| «Funzioni morte, primo/secondo scaglione» | **fatto**: `funzioni-morte-scaglione*.test.js` |
| «Driver Coins: il rifiuto del server non deve restare muto» | **fatto**: `spenddc-rifiuto-server.test.js` |
| **politica** (ui-politics.js, war_room.js) | **davvero da fare**, 11 tentativi falliti |

**La regola da tenere:** lo stato della coda dice cosa ha fatto l'agente, non cosa manca al
gioco. Per sapere cosa manca si guarda il repository — i guardrail sono scritti apposta per
rispondere a quella domanda, e rispondono meglio della coda.

## Perché politica falliva sempre, undici volte

Il verdetto è sempre lo stesso: *«I test non sono cresciuti (523 → 523): manca la prova che
il bug fosse reale.»* I tentativi aggiungevano i due file all'elenco del banco in
`test-support/game-env.js` **e si fermavano lì**.

Aggiungere un file a un elenco non è una prova, e il cancello ha ragione a respingerlo. Il
lavoro finisce quando esiste un test **che può passare solo se quel file si è caricato**. Il
task nuovo lo dice a chiare lettere, dà il permesso esplicito di toccare `game-env.js` (solo
lui lo tocca) e chiede di riallineare su `main` prima di consegnare, perché l'altro motivo
ricorrente di rifiuto era «non si unisce a main senza conflitti».

## La lista di lavoro vera: 110 azioni cieche

`test/guardrail/azioni-sincronizzano.test.js` estrae **241 azioni** del giocatore e ne prova
l'esecuzione. In fondo stampa quelle che non riesce ad attivare, e quel blocco è la vera
coda di lavoro:

```
azioni totali estratte: 241
azioni che toccano denaro: 128
Non attivabili che toccano denaro: 110
```

Non sono azioni sbagliate: sono azioni **cieche**. Vogliono uno stato di gioco che nessuno
prepara, quindi se domani una smette di avvisare il server nessun test diventa rosso.

Messi in coda **12 lavori**: nove gruppi di azioni cieche (vip, società, flotta-officina,
autisti, mercati, ombra, finanza-obblighi, alleanze-consorzi, dc-vanità), ognuno con un file
di prova **nuovo e suo** (`test/azioni/<gruppo>.test.js`) così non fanno conflitto fra loro;
più politica-nel-banco, il tetto della reputazione (24 copie, non tutte uguali) e i nove nomi
ancora definiti due volte.

## Il motore al massimo

- `GIGI_PARALLELI` 4 → **10** e `GIGI_LAVORI_MAX` 35 → **200** in `~/gigi/.telegram.env`.
  Il tetto giornaliero nasceva per limitare la **spesa**; con ox-alpha su OpenRouter la spesa
  è zero, quindi limitava solo il lavoro. Erano già 30 su 35 alle 15.
- Attenzione al `motivoStop: 'coda vuota'`: il ciclo **si ferma da solo** quando finisce i
  lavori e **non riparte da solo** quando ne accodi di nuovi. Va chiamato `riprendi()` e poi
  riavviato il servizio, altrimenti la coda resta piena e non parte niente.
- Riavviare `gigi-telegram` è sicuro con lavori in volo: lo stato sta su disco e il ciclo
  riprende a sorvegliare i `runId` già partiti.

## I numeri di oggi, per stimare

Tasso di riuscita **per tentativo**: 39% oggi (27 fusi su 69 conclusi), 29% ieri. Durata
media di una run: **19 minuti**, massimo 44. Quindi un lavoro costa in media ~2,5 tentativi,
e 12 lavori valgono ~30 tentativi: con 10 in parallelo sono tre ondate, **due o tre ore**.

## Stato

**1539 prove verdi**, `main` pulito. 104 lavori fusi. Quattro domande nuove sull'hub:
la fase successiva, il quartier generale, l'imbroglio lato server, e una aperta —
«cosa manca al gioco, secondo te?».

---

# 🟢 22/08 pomeriggio — le cinque decisioni di Vlad, e due buchi chiusi nel motore

## Le decisioni, prese sull'hub (pagina «Decisioni», nuova)

| Domanda | Scelta di Vlad |
|---|---|
| Durata delle corse | nuova curva `10 + 3.8 × √prezzo`, **tetto rimosso** — GIA' FATTO |
| Coda | **in ore: 4 di base, fino a 12 con i Driver Coins** (sua nota, non la mia proposta di 8 fisse) |
| Executive Pass | **togliere** l'allungamento coda, niente al suo posto |
| Batteria elettrici | **farla calare**, con una ricarica raggiungibile |
| Modelli | cercare un'altra anteprima gratuita, restando aperto ai 10$ una-tantum |

La durata l'ho implementata io (formula + test riscritti). Le altre tre sono in
coda per l'agente.

**I test della durata non ricopiano piu' la formula.** Prima dicevano «100€ = 20
minuti», cioe' che il codice fa quello che fa; ora verificano le proprieta' per
cui la formula e' stata scelta: non satura mai, cresce sempre, ha un pavimento.
Un ritocco di bilanciamento non li fa piu' diventare rossi per niente.

**Idea di Vlad salvata nel vault** (`00 Mappa/Idee e Backlog.md`): alimentazione
degli elettrici — colonnine sul territorio, abbonamenti di ricarica, tessere
carburante.

## Due buchi nel motore dell'agente, trovati guardando i fallimenti

**1. «Ho finito» senza aver scritto niente veniva riportato come RIUSCITO.**
Due lavori di fila (i collaudi del mercato P2P): 21 turni, un milione di token
letti, zero file toccati, esito `ok: true`. Il cancello e' `npm test`, e su
codice immutato e' ovviamente verde — non puo' distinguere «fatto» da «non ho
fatto niente». Ora chi conclude senza aver mai scritto torna indietro col motivo
scritto, e dopo 12 turni di sola lettura viene richiamato una volta sola. La
soglia di inerzia che c'era scattava solo DOPO la prima scrittura, quindi chi
esplorava e basta non la incontrava mai.

**2. Il finto server del banco e' piu' semplice di quello vero, e nasconde i
bug.** Due bug sui soldi in un giorno, stessa causa:
- `spendDriverCoins` scalava due volte e non restituiva il saldo;
- `rpc_buy_company_shares` restituiva 2 campi invece di 4, e mancava proprio
  `total`. Il client si addebitava il **prezzo in cache** invece di quello preso
  dal server: siccome il prezzo sale a ogni acquisto, il giocatore vedeva piu'
  soldi di quanti ne avesse fino al ricaricamento. `sellCompanyShares`, due
  funzioni sotto nello stesso file, lo faceva gia' bene.

Corretto, con test rosso prima. C'e' un lavoro in coda che confronta OGNI metodo
finto con la sua RPC vera nell'SQL.

**Regola che ne esce:** quando un finto server e' piu' semplice di quello vero,
la semplificazione nasconde proprio i bug che il test dovrebbe trovare.

## I modelli

L'agente ha ora una **scaletta**, non un modello solo: quando uno finisce si
passa al successivo, anche a meta' conversazione. Cinque provati con una vera
chiamata a strumento — ox-alpha, nemotron-3-ultra, laguna-s, nemotron-3-super,
north-mini-code. Scartati glm-5.2 e gemma-4 (429 a freddo) e inkling (piano
dedicato).

**Da sapere:** i modelli `:free` di OpenRouter condividono UNA quota d'account —
50 richieste al giorno, che diventano **1.000 dopo un acquisto una-tantum da 10
dollari**, per sempre. Allungare la scaletta da' continuita', non capacita'. Per
piu' quota servono fornitori diversi.

---

# 🟢 22/08 — l'agente non costa piu' niente: stesso modello, endpoint gratuito

**Perche'.** Il 21/08 Vertex e' costato €124,62 in un giorno. Il prezzo unitario
era giusto (118 run del modello, ~€1,05 l'una); sbagliato era il volume, e il
volume erano le **riprove**: 173 lavori su 279 sono riprove o ne hanno generata
una, quasi tutte condannate in partenza dal test che sporcava il repo.

Le altre run della giornata (113 verifiche di ramo, 44 fusioni, 10 di CI) girano
solo i test e **non costano modello**: mescolarle nel conteggio e' quello che
rendeva il numero incomprensibile.

**Cosa e' cambiato.** `gemini-agent.mjs` usa l'endpoint di AI Studio quando
trova `GEMINI_API_KEY`, altrimenti Vertex come prima. Verificato il 22/08:
**`gemini-3.7-flash` e' disponibile anche sul piano gratuito**, quindi non si e'
sceso di qualita' — si e' smesso di pagare lo stesso modello. (`gemini-2.5-flash`
invece non e' piu' servito ai progetti nuovi: risponde 404.)

**Il freno vero non e' un contatore.** La chiave appartiene al progetto Google
`gigi-gratis-0822-16596`, creato **senza fatturazione**. Non puo' addebitare
niente per costruzione. Il tetto di spesa in dollari dell'agente e' disattivato
sul gratis, perche' li' si paga a richieste e non a token: lasciarlo attivo
avrebbe accorciato i lavori a meta' senza motivo visibile.

**Il limite si e' spostato.** Non piu' gli euro, ma le richieste: ~1.500 al
giorno e 10 al minuto. Un lavoro puo' arrivare a 70 turni e ogni turno e' una
richiesta — un `grep` e' un turno. I 429 vengono gia' aspettati con attese
crescenti (5s, 15s, 45s, 90s).

**Per tornare indietro** basta togliere il secret `GEMINI_API_KEY` da GitHub.

**Le chiavi** stanno in `~/.config/gigi-modelli.env` (modo 600). Il repo `ncc` e'
pubblico: non ci va mai niente di tutto questo.

**La quota di Google si e' rivelata inutilizzabile, e il secondo motore e'
stato costruito.** Il piano gratuito da' **20 richieste al giorno** per
`gemini-3.7-flash` (quota `GenerateRequestsPerDayPerProjectPerModel-FreeTier`),
non le 1.500 che valgono per i modelli piu' vecchi: un solo lavoro ne consuma
venti-trenta, quindi il primo lavoro le brucia tutte e i successivi muoiono con
«quota superata». E' successo il 22/08 alle 09:50, tre lavori di fila.

`openrouter-agent.mjs` e' il secondo motore, si sceglie con la variabile
`GIGI_MOTORE=openrouter` e usa `stealth/ox-alpha`. Il cervello resta uno: gli
stessi strumenti, le stesse istruzioni, lo stesso cancello — il file nuovo
traduce solo dal dialetto Google a quello OpenAI.

Misurato il 22/08: **20 richieste in contemporanea, venti riuscite, zero
rifiuti** (Google ne concede 10 al minuto). I primi tre lavori veri: riusciti,
27 / 28 / 20 turni, in linea con Gemini — non e' un modello che sbaglia di piu'
e recupera riprovando. `MAX_PARALLELI` e' salito da 2 a 4.

**Quattro e non venti**: il limite non e' mai stato il calcolo, e' che a valle
c'e' un solo `main`. Piu' rami aperti insieme, piu' probabilita' che due tocchino
lo stesso file — il meccanismo che il 21/08 ha bruciato ~115 euro.

**E' un'anteprima a tempo**: comparsa il 20/08, annunciata gratis per circa una
settimana. Verso il 26/08 va decisa la strada permanente (Vertex a pagamento col
freno vero, o un'altra anteprima). Nel frattempo se OpenRouter smette di
rispondere al primo turno, `run-task.mjs` rifa' il lavoro con Gemini invece di
buttarlo — provato con una chiave finta. Il fornitore resta anonimo e le sue
condizioni si contraddicono sull'uso dei prompt per l'addestramento: il repo e'
pubblico, quindi non c'e' un segreto che scappa, ma non ci passa mai altro.

---

# 🔴 22/08 mattina — il veleno era tornato, e due rami verdi si contraddicevano

**La ricaduta.** Il 22/08 alle 04:18 il lavoro «Tre registri delle azioni in tre
file: farne uno solo» ha reintrodotto la stessa causa corretta poche ore prima:
`test/guardrail/temp-genera.js` riscriveva `docs/AZIONI.md` a ogni `npm test`.
Il file si chiamava `.js` e non `.test.js`, ma `node --test` prende tutto quello
che sta sotto `test/`, quindi girava lo stesso — e ogni ramo tornava a litigare
con main. Riprodotto in diretta: dopo una suite intera su main pulito, il repo
risultava sporco con `docs/AZIONI.md` modificato.

**Adesso il divieto è un test**, non una frase in un documento:
`test/guardrail/un-test-non-scrive.test.js` fallisce se un file sotto `test/`
contiene `writeFileSync`/`unlinkSync`/`mkdirSync` e simili fuori da `/tmp`.
Verificato per mutazione: rimettendo `temp-genera.js` diventa rosso e indica
file, riga e funzione.

**Le vere cause delle 56 respinte di stanotte**, lette dai verdetti salvati:
- *main ha 1 test rosso: non posso giudicare niente* — il cancello si blocca
  tutto quando main non è verde;
- *N test rossi una volta unito a main* — quasi sempre test scritti su
  assunzioni sbagliate, non codice rotto.

**Sei lavori recuperati a mano** invece di rifarli (erano già pagati):

| Ramo | Cosa mancava davvero |
|---|---|
| collisione `listCarForSale` | conflitto sull'elenco eccezioni, risolto |
| collaudo finanza | niente: la fusione non era mai partita |
| collaudo aste | niente: idem |
| funzioni morte 1° scaglione | niente: idem |
| tetto reputazione | il ramo portava i test **senza la correzione** |
| collaudo flotta | 6 test rossi, tutti per assunzioni sbagliate |

**Bug veri trovati recuperandoli:**
- `bulkRepairFleet` (ui-fleet.js) non aspettava `payToRepairCar`, che è
  asincrona: ridisegnava la schermata prima che le riparazioni finissero, e il
  giocatore vedeva ancora le auto rotte.
- Il **finto server del banco** scalava i Driver Coins una seconda volta dopo
  `CE_money.spendDC`. Il server vero restituisce il saldo e non si somma: il
  banco simulava un doppio conteggio che nel gioco non c'è, e faceva fallire
  test scritti su codice corretto.
- `INVESTMENTS`, `MARKETING_CAMPAIGNS`, `LIFESTYLE_ASSETS`, `VTK_SHOP_ITEMS`,
  `CAR_UPGRADES` erano `const`: nel browser funzionano, ma non diventano
  `window.X` e il banco di prova non le vede. Ora sono `var`, come dice la
  regola del progetto.

**Due rami verdi che insieme si rompevano** (caso nuovo, da ricordare):
il cancello giudica ogni ramo contro main, ma non i rami *fra loro*. Due volte
un ramo toglieva una funzione come morta mentre un altro aggiungeva test che la
usavano come spia: `b2bLockedDriverIds` e le cinque della flotta
(`superchargeVehicle`, `refillTires`, `buyStandardFuel`, `buyBlackMarketFuel`,
`getDepotLevelData`). Prima di accettare la cancellazione ho verificato che
fossero davvero irraggiungibili: il carburante passa da `emergencyRefuel` e dal
deposito, le gomme dal deposito al cambio giorno.

**Buco di design emerso, da decidere:** `chargeLevel` degli EV viene solo
mostrato, non cala mai. Gli elettrici non consumano batteria e non c'è più nulla
per ricaricarli. O la batteria cala (e serve una ricarica), o la barra non va
mostrata.

---

# 🔴 22/08 notte — un test riscriveva un documento e faceva respingere OGNI ramo

**152 lavori respinti, ~115 euro di modello spesi per niente, una causa sola.**

Il sintomo che ha permesso di trovarla: nei log del cancello, ogni ramo respinto
diceva «non si unisce a main senza conflitti» e fra i `fileToccati` c'era sempre
`docs/AZIONI-interfaccia.md`, con le stesse identiche 10 righe cambiate — solo
numeri di riga.

Il colpevole era `test/guardrail/censimento-azioni-interfaccia.test.js`: rigenerava
il documento e lo **scriveva nel repo** a ogni esecuzione. Ogni lavoro dell'agente
lancia `npm test`, quindi ogni ramo si portava dietro quella modifica e litigava
con main — qualunque cosa contenesse. Lo stesso test scriveva il file e poi
verificava il file appena scritto: non poteva fallire.
Tolti anche `test/temp_analyze.test.js` e `test/temp_nucleo.test.js`, impalcature
lasciate indietro da un agente; il primo faceva la stessa cosa con
`docs/AZIONI-moduli.md`.

**Regola che ne esce, da non violare mai: un test guarda, non tocca.** Se un test
scrive nel repo, tutto il lavoro automatico si avvelena a valle e il sintomo
compare lontanissimo dalla causa.

**Due test resi deterministici**, che rendevano main rosso a intermittenza — e con
main rosso il cancello **si rifiuta di giudicare qualunque ramo**, quindi due test
fragili bloccavano ogni fusione:
- `salone`: aspettava un'animazione con un tempo fisso di 600 ms, ma l'animazione
  avvicina il valore del 14% a fotogramma e ne servono ~50. Ora aspetta la fine.
- `corse`: `generatePOIRide` rifiuta di generare il 30% delle volte quando
  `pricingStrategy === 'premium'` (voluto: i clienti ricchi non chiamano sempre),
  e il test non fissava la strategia.

**Il motivo di una respinta adesso si salva** (`t.nota`) e si legge raggruppato per
causa: su Telegram, `problemi`. Prima il motivo esisteva solo dentro l'istruzione
della riprova e sul lavoro non restava niente — ed è per questo che una causa
comune è rimasta invisibile per un giorno intero.

**I soldi.** Google ha segnalato 124,62 euro di Vertex il 21/08 contro 0,42
previsti. Il costo unitario era giusto (~0,76 euro a run); sbagliato era il
volume, e il tetto non frenava: nella giornata in cui il contatore dichiarava 67
lavori, GitHub ne aveva eseguiti 148. Ora il freno **conta le run vere chiedendole
a GitHub**, si misura in euro (`GIGI_SPESA_MAX`, 60/giorno), e i lavori in
parallelo sono scesi da 3 a 2 per distribuire la spesa sulla notte.

---

# 🟢 21/08 notte — 19 funzioni accese su 21

**Nove interruttori accesi in una volta**: alleanze, cripto, vtk, turismo,
infrastrutture, holding, nemesi, negozioDC, vip. Ognuna aveva il suo collaudo profondo
in `test/funzioni/` — da 22 a 43 prove — con tutte le azioni eseguite nel banco e il
denaro che passa da `CE_money` o da una RPC. Le due liste di eccezioni dei guardrail si
sono accorciate di conseguenza: `SPENTE_ALL_INIZIO` ora contiene solo due nomi, e
`interruttori-applicati` non ha più eccezioni (vtk e vip erano l'ultimo debito).

**Restano spente due, per ragioni diverse:**
- `mercatoP2P` — il collaudo regge, ma `p2p-market.js:60` sovrascrive
  `window.listCarForSale` di `engine-fleet.js:414`. Accenderla **romperebbe il mercato
  NPC**, che è nel nucleo ed è acceso. La separazione dei due nomi è in verifica.
- `politica` — il collaudo non è ancora stato fatto (secondo tentativo in coda).

**Il negozio Driver Coins è acceso e tocca soldi veri.** Tutte e dodici le funzioni di
`engine-store.js` passano da `CE_money.spendDC`, che chiama `ServerState.spendDriverCoins`
e riallinea sul valore che il server restituisce. Resta un buco stretto da chiudere: la
chiamata al server è asincrona e il `.catch` la ingoia, quindi se il server rifiutasse
la spesa l'effetto sarebbe già stato applicato in locale. Serve un client già fuori
sincrono perché accada, ma va sistemato.

**Difetto trovato accendendo le infrastrutture:** delle 41 città in `POIS`, quattro non
compaiono in `_POI_TO_PROVINCE` (engine.js:9) — **aquila, campobasso, potenza,
catanzaro**. Chi parte da lì non paga il pedaggio sul carburante: quattro regioni esenti
senza che nessuno l'abbia deciso. In riserva c'è il lavoro che le mappa e aggiunge il
test che impedisce a una città nuova di nascere esente.

**Lezione operativa, da non ripetere:** non lanciare più esecuzioni di `npm test` in
parallelo. `node --test` usa `--test-concurrency=0` (un processo per file, ~100 file);
tre suite insieme hanno portato il carico della macchina sopra 170 e i test da 70
secondi a quindici minuti.

**Due test fragili sotto carico**, scoperti proprio così: in
`test/funzioni/salone.test.js` i due casi sugli optional aspettano che
un'**animazione di prezzo** converga, con `waitPriceAnim(..., timeoutMs = 600)`. A
macchina carica i timer sono affamati, l'animazione non finisce in 600 ms e i test
falliscono. Eseguiti da soli passano 28/28. Non è un difetto del gioco, ma è un test
che può diventare rosso senza che nessuno abbia rotto niente — e un rosso che non
significa niente è peggio di nessun test. Vale la pena farli aspettare la fine
dell'animazione invece di un tempo fisso.

---

# 🟢 21/08 sera — il doppio conteggio è chiuso, e Gigi non si ferma più da solo

**Doppio conteggio: campagna finita.** I diciassette casi marcati nel censimento sono tutti
sistemati; i restanti erano già corretti e il documento lo dice riga per riga (le voci
«RPC non tocca il saldo → corretto così» sono verifiche, non lavoro rimasto). **1092 test verdi.**
Nota di metodo per la prossima sessione: `docs/DOPPIO-CONTEGGIO.md` è il censimento del 21/08 e
**non è stato aggiornato** man mano che le correzioni entravano — i lavori avevano il divieto di
toccarlo, perché tre rami paralleli ci avevano già litigato sopra. Per sapere se un caso è
chiuso, guarda il codice (`grep DalServer <file>`), non il documento.

**Interruttori: 10 accesi su 21.** Le funzioni ancora spente hanno però quasi tutte la verifica
fatta e fusa: `test/funzioni/` contiene 14 file di collaudo profondo (22-43 casi ciascuno) per
alleanze, cripto, holding, infrastrutture, mercatoP2P, negozioDC, nemesi, turismo, vtk, vip oltre
alle quattro già accese. **Accendere gli interruttori è lavoro di Vlad**, a mano in `config.js`,
dopo aver letto i riepiloghi: i lavori automatici hanno il divieto di toccarlo.
⚠️ `mercatoP2P` NON va acceso finché non è risolta la collisione `listCarForSale` (sotto).

**Quattro nomi globali definiti da due file diversi**, dove vince l'ordine dei `<script>`:
`listCarForSale` (p2p-market.js:60 su engine-fleet.js:414 — e questo rompe il **mercato NPC**,
che è nel nucleo e acceso), `renderTabProvinces` (war_room.js:495 su ui-ops.js:264),
`hqOpenBuildModal` (hq-visual.js:88 su hq.js:339, **firme incompatibili**),
`_updateActiveRouteLines`. Tutti e quattro sono in coda, più un guardrail in riserva che ne
vieta la ricomparsa.

**Gigi non si ferma più quando finisce la coda.** Era il limite che Vlad ha centrato:
«se io sto fuori casa e Gigi ha finito, lui poi sta fermo». Adesso:
- `~/gigi/riserva.json` è un magazzino di lavori già scritti; a coda vuota ne pesca tre e va
  avanti, e lo dice su Telegram. File separato dalla coda apposta: riempirlo non può far perdere
  un lavoro in corso.
- Da Telegram basta una frase: **«gigi, lavora su: ...»** e l'istruzione completa se la scrive
  lui, con l'elenco vero dei ~93 file del gioco davanti. Le regole di verifica (prima il test, il
  test deve essere rosso, non si cancella un test per farlo passare, i file condivisi non si
  toccano) **le incolla il codice**, non il modello: `jarvis/src/scrivi-lavoro.js`.
- «riprendi» toglieva solo la pausa e con la coda vuota non serviva a niente; ora pesca, e se non
  c'è niente da pescare lo dice invece di rispondere «riparto» restando fermo.

**Il piano si chiede a Gigi, non si tiene a mente.** Su Telegram: `piano` (elenco numerato di
tutto quello che c'è da fare, in ordine, con una riga che dice perché ogni cosa viene adesso),
`fai 5` / `salta 5`, `quanto manca`, `gigi, lavora su: <una frase>`. L'elenco si costruisce ogni
volta dallo stato vero — coda + riserva — quindi quello che è fatto sparisce da solo: **non
esiste un documento del piano da tenere aggiornato**, e non va creato.

**Tetto di spesa:** 60 lavori al giorno, €1,60 per lavoro. Il contatore riparte a **mezzanotte
italiana** (era UTC, cioè le 2 di notte: corretto il 21/08 su richiesta di Vlad). Quando il tetto
scatta il ciclo si ferma e fissa la ripartenza a mezzanotte, senza consumare i tentativi di
riavvio tenuti per i guasti veri.

**Due difetti del ciclo trovati provandolo, non leggendolo** (21/08 sera): `inRevisione` era usata
nelle due uscite — coda vuota e tetto giornaliero — ma definita solo dentro `riepilogo()`. Tutte e
due andavano in `ReferenceError`, quindi `fermati` non veniva mai chiamata e il ciclo restava
"attivo" a girare a vuoto **senza avvisare nessuno**: è il motivo per cui quel pomeriggio Gigi è
rimasto fermo in silenzio. Lezione da tenere: il ramo che non si esercita mai è quello che si
rompe, e in questo progetto sono quasi sempre i rami di uscita.

---

# 🔴 21/08 mattina — il ciclo ha girato a vuoto per sei ore

**Dalle 04:39 alle 10:25 il ciclo ha rifatto lo STESSO lavoro ogni undici minuti**, ~0,75$ a
tentativo più i minuti di CI, senza avanzare di un passo: **23 run fallite** contro 15 riuscite.
La notte fino a lì era andata bene — **14 fusioni in `main` fra l'01:40 e le 03:47** — poi più
niente: l'ultima fusione è delle 03:47. Gemini diceva il vero quando ha detto «non ho più niente da
fare»: la coda era vuota (33 fusi, 67 respinti), e l'unico lavoro rimasto era quello che si
riproduceva da solo.

**Due difetti che si tenevano in piedi a vicenda**, in `code-loop.js`:

1. `ramoDelLavoro` chiedeva a GitHub `?per_page=100`. Il repo ha **120 rami**, e i quattro rami
   del lavoro in corso stavano dal **114 al 117**: fuori dalla prima pagina. Non venivano
   trovati perché non erano nell'elenco, non perché non esistessero.
2. Il ripiego era `rami.sort().pop()` — l'ultimo ramo in ordine alfabetico. Cioè **il ramo di un
   altro lavoro**: il centesimo, `porta-unica-del-denaro-tourism-js-08200332`. Il cancello lo
   verificava, lo trovava vecchio e già fuso («i test non sono cresciuti, 939 → 939»), lo
   respingeva — e il ciclo prendeva quel rifiuto come se parlasse di sé.

Poi il terzo, che trasformava l'errore in un moto perpetuo: la riprova nasceva **senza** il segno
`giaRiprovato`, quindi poteva essere riprovata a sua volta. `-r2-r2-r2`, titolo che cresceva di
«— correzione» a ogni giro, istruzione che si raddoppiava perché ricopiava dentro l'originale.
Coda a **790 KB**, 2,4 milioni di token spediti per un solo tentativo.

**Corretto e verificato eseguendo le due versioni contro GitHub vero**, sullo stesso titolo:

| | ramo restituito |
|---|---|
| vecchia | `gigi/porta-unica-del-denaro-tourism-js-08200332` ← di un altro lavoro |
| nuova | `gigi/porta-unica-engine-js-la-parte-delle-cor-08210736` ← quello giusto |
| nuova, su un lavoro senza rami | `null` |

**La lezione:** un ripiego che tira a indovinare è peggio di nessun ripiego. Se il ramo non c'è,
`null` è una risposta vera e il ciclo segna il fallimento; un ramo qualsiasi è una risposta
falsa che nessun controllo a valle può smascherare, perché a valle sembra tutto normale.

**Il ramo `…-08210736` è stato spacchettato e chiuso** (21/08 mattina). Non era un Frankenstein:
sembrava tale perché la mia copia di `main` era vecchia di quattordici fusioni. Portava due sole
modifiche, e ne è entrata una.

- **Tenuta:** `_addCash` passava da `gameState.cash` e basta — chi incassava per quella strada
  vedeva il denaro a schermo e lo perdeva al ricaricamento. Ora passa da `CE_money.earn`.
- **Scartata:** la conversione di `payToRepairCar` sostituiva la RPC del server con
  `CE_money.spend`. `rpc_repair_vehicle` non muove solo denaro: verifica che l'auto sia tua,
  rifiuta di ripararla mentre è in corsa, controlla i fondi **lato server** e scrive
  `condition`/`tire_pressure`/`status` sulla riga del veicolo. Senza di lei restano soldi spesi e
  auto ancora rotta al ricaricamento. Due test esistenti lo dicevano già: il ramo li faceva
  diventare rossi. **Il guardiano della porta unica non poteva accorgersene** — cerca
  `gameState.cash -=`, e sostituire una RPC con `CE_money` lo soddisfa mentre peggiora il gioco.

**La Kasko: la decisione del 20/08 era applicata a metà.** Avevo tolto la riparazione gratuita da
`repairCostFor`, ma `payToRepairCar` aveva una **seconda porta** che usciva prima di arrivarci.
Risultato: il prezzo mostrato diceva €5.950 e il pulsante riparava gratis. Il test che avevo
scritto guardava `repairCostFor`, cioè la porta sbagliata, e restava verde. Ora la scorciatoia
non c'è più; la promessa della Kasko resta dove nasce — con la Kasko l'incidente non fa danno
affatto (`engine-rides.js:595`), quindi non c'è niente da riparare.

**Suite: 944 verdi** (939 prima). Verificato per mutazione in entrambe le direzioni.
**`engine.js` resta nelle eccezioni:** ha ancora **10 mutazioni dirette** del saldo
(righe 813, 852, 1005, 1256, 1308, 1418, 1764, 1787, 1998 + il ripiego voluto in `_addCash`).
È il prossimo lavoro vero su quel file.

---

# 📊 21/08 — DOVE SIAMO A FINE POMERIGGIO

**`main`: ~975 test verdi · 10 funzioni accese su 21 · 97 commit oggi.**
Accese oggi: `salone`, `lusso`, `carriera`. Restano spente: alleanze, mercatoP2P, cripto, vtk,
turismo, politica, infrastrutture, holding, nemesi, negozioDC, vip.

**La porta unica del denaro è chiusa** — `ECCEZIONI` vuota, con tre righe autorizzate una per una
in `RIGHE_CONSENTITE` (non sono transazioni: azzeramento a inizio partita, ripristino di un saldo
non finito, ripiego di `_addCash`).

**Il censimento del doppio conteggio** (`docs/DOPPIO-CONTEGGIO.md`) copre 12 file e ha trovato
17 punti dove il client rimuove denaro che la RPC aveva già mosso. Corretti oggi: b2b/vtk,
alleanze/scalate, cripto. In lavorazione: p2p, infrastrutture/turismo, black_ops.

**L'orologio del mondo** (`63_orologio_del_mondo.sql`, applicato): bandi turistici ogni 15 min,
azzeramento VTK ogni ora, tensione sindacato ogni ora. **NON schedulato di proposito**:
`rpc_daily_dividends` paga a ogni chiamata senza guardare se ha già pagato oggi — prima serve un
guardiano «una volta al giorno» dentro la funzione, non nella sveglia.

**L'hub dice la verità**: il ciclo rispecchia la coda a ogni giro (`POST /api/gigi/coda`),
avanzamento calcolato sui lavori veri. Gli agenti sono quelli che esistono — Gigi e Olga vivi,
otto specialisti pre-lancio dichiarati `offline` con scritto perché.

**Gigi su Telegram**: legge vocali, foto e PDF; cerca sul web (prima non aveva strumenti, per
questo non sapeva dire dove vedere un film); orario in fuso italiano; un messaggio lento non
zittisce più gli altri; sa dire l'obiettivo di giornata.

**Ritmo e costi**: 3 lavori in parallelo, tetto 60/giorno, tetto di spesa 1,60$ per tentativo.
Un lavoro riuscito costa ~0,63$. Credito Google residuo ~198 € al mattino, scade il 16/10; dietro
c'è un secondo account con altri 300$. **La VM `gigi-server` è stata spenta**: non eseguiva niente
da giorni e consumava credito. Resta viva `gigi-whatsapp`, dove girano Gigi e il ciclo.

---

# ⚠️ 21/08 — LA REGOLA DEL PARALLELO (imparata sbagliando due volte in un'ora)

`MAX_PARALLELI = 3` funziona, ma **i lavori paralleli non devono scrivere sullo stesso file.**
Due fusioni fallite oggi, stessa causa, e la colpa è di chi ha scritto i lavori:

1. **Il censimento** — tre lavori mandati ad appendere tutti su `docs/DOPPIO-CONTEGGIO.md`.
2. **Le accensioni** — tre lavori che toccano tutti `config.js` e la lista in
   `test/guardrail/interruttori.test.js` per togliere la propria funzione dalle spente.

Entrambi risolti a mano (unione delle due modifiche, non una delle due). **Il fallimento è
stato pulito**: `main` intatto, rami conservati, lavoro recuperato per intero — che è
esattamente il comportamento voluto. Ma è lavoro manuale evitabile.

**Regola:** i lavori che toccano `config.js` (cioè tutte le accensioni) vanno fatti
**uno per volta**. Il parallelo si usa per lavori su file disgiunti.

---

# 🚪 21/08 12:15 — LA PORTA UNICA È CHIUSA

`ECCEZIONI` in `test/guardrail/una-sola-porta.test.js` è **vuota**. `engine.js` era l'ultimo file,
e al suo posto c'è `RIGHE_CONSENTITE`: tre righe autorizzate una per una col motivo accanto —
l'azzeramento a inizio partita, il ripristino del saldo quando diventa non finito, e il ripiego
in `_addCash`. Non sono transazioni, e forzarle dentro la porta avrebbe peggiorato le cose.

Nello stesso minuto è entrato il **doppio conteggio di cripto**: `crypto.js` ora usa
`addebitatoDalServer` / `accreditatoDalServer` invece di `spend`/`earn`. Mancava la gemella per
l'addebito — c'era solo quella per l'accredito, nata per le aste — e l'ha creata.

**954 test, tutti verdi.** Due rami fusi nello stesso minuto: la prima prova vera del
parallelismo (MAX_PARALLELI = 3) e del rifacimento della fusione quando `main` si muove sotto.

## Il censimento dei processi schedulati — interrogando il database vero

Domanda (a) del metodo interruttori, con i dati in mano. In `cron.job` ci sono **tre lavori**, e
l'unico di gioco è `aste-giudiziarie` (messo il 20/08). Nel database esistono **dieci** funzioni
di tipo tick/daily. Chi le chiama:

| funzione | chi la chiama |
|---|---|
| `_process_judicial_auctions` | cron ✅ |
| `rpc_b2b_daily_tick` · `rpc_tourism_daily_tick` · `rpc_tick_tension` · `rpc_collect_daily_costs` | il client, al login |
| **`rpc_daily_dividends`** | **nessuno** — le holding non pagano mai dividendi |
| **`rpc_reset_daily_vtk`** | **nessuno** |
| **`_process_tourism_tenders`** | **solo un test** — i bandi turistici non si chiudono mai |

Le tre orfane appartengono tutte a funzioni **spente** (holding, vtk, turismo): il metodo degli
interruttori ha fatto il suo lavoro, sono spente proprio perché nessuno le aveva verificate.
Il cron va messo **prima** di accenderle, ed è lavoro di Claude — Gemini non ha accesso al database.

---

# ✅ 21/08 mattina — hub, agenti, libri (fatti)

**L'hub dice la verità.** Il ciclo manda la coda intera a `POST /api/gigi/coda` a ogni giro,
anche da fermo — è proprio da fermo che si va a guardare il cruscotto. 108 lavori rispecchiati,
avanzamento **29%** calcolato su quelli veri, aggiornato ogni minuto. Tolti i cinque task di
esempio del primo allestimento («Store listing copy», «Fix authentication flow»); i sette task
veri creati il 18-19/08 sono rimasti, perché cancellarli avrebbe riscritto la storia invece di
correggere un numero.

Dettaglio che è costato mezz'ora: l'hub rifiutava l'intera coda con 400 perché gli id delle
riprove arrivano a 96 caratteri (`-r2-r2-…`). L'id nell'hub è ora un'impronta di lunghezza fissa
— tagliarlo a lunghezza fissa avrebbe fatto collidere due riprove nella stessa riga.

**Gli agenti sono quelli che esistono.** Le sei righe finte (modello `olga-core-preview`, che non
esiste) sono spente e fuori dalla scheda del progetto. Al loro posto: **Gigi** (Gemini su GitHub
Actions, l'unico che lavora davvero — e gli sono state attribuite le **399 righe di diario** che
prima erano senza firma), **Olga** (la chat), e otto specialisti per il pre-lancio le cui
definizioni esistono davvero in `~/.claude/agents` — Growth Hacker, Content Creator, App Store
Optimizer, Brand Guardian, CFO, Pricing Analyst, Game Designer, UX Researcher. Stato **offline**,
e la descrizione dice perché: *«definizione pronta, ma nessuno le manda ancora lavoro»*. È il
pezzo che manca, e va letto a colpo d'occhio invece di essere mascherato da «pronto».

**Turni dell'agente 40 → 70, e niente più mail rossa per un lavoro riuscito.** Sei lavori su
undici avevano esaurito i turni; leggere ne costa quanto scrivere, e su `engine.js` la sola
esplorazione ne mangia venti. E se il ramo è pubblicato la run esce 0: uscire 1 perché il modello
ha finito i turni mandava una mail di fallimento per un lavoro che era andato bene — tre volte in
due giorni. Un allarme che suona senza incendio insegna solo a non guardare più gli allarmi.

**Libri → una skill: `~/.claude/skills/economia-di-gioco/`.** Estratti tutti e otto i PDF in
testo (`pypdf`), ~430.000 parole. La skill nasce da *La psicologia dei soldi* (Housel) più la
letteratura sui dark pattern letta al contrario, come catalogo di ciò che non si fa. Sei domande
da porre a ogni numero prima di scriverlo nel codice.

**Primo difetto trovato usandola** (domanda 2, «chi sta giocando un gioco diverso»):
`ui-ranking.js:33` mostra **una sola classifica globale**, ordinata per `liquid_assets`, primi 50.
Un giocatore nuovo vede solo i cinquanta più ricchi e non vede mai sé stesso. Non sta perdendo:
sta guardando un'altra partita, e il gioco non glielo dice. Da segmentare (per anzianità o per
tempo giocato) o almeno da affiancare con la posizione propria e il confronto col sé di ieri.

---

# 📌 AGENDA DI DOMATTINA — decisa da Vlad il 21/08 all'01:15

Tre cose, da fare **dopo** che il ciclo notturno si è fermato (verso le 9). Nessuna va toccata
prima: il ciclo gira sulla VM Google e riavviare il servizio butta via il lavoro in corso.

**1. Controllo a campione delle fusioni notturne.** È la contropartita promessa quando abbiamo
tolto il clic di Vlad dal cancello: si fonde da soli, ma la mattina dopo qualcuno guarda.

**2. L'hub deve dire la verità.** Misurato interrogando Neon la notte del 21/08:
il diario «Live activity» è reale (245 righe in 24 ore, l'ultima 50 secondi prima del controllo),
ma **avanzamento, task e obiettivi sono fermi al 19/08 alle 09:40**. Il ciclo scrive solo su
`/api/gigi/activity`: la tabella `tasks` non la tocca **mai**, quindi il 17% resterà 17% per
sempre. Nella stessa finestra in cui l'hub segnava zero, in `main` erano entrati 17 commit.
Da fare: la coda vera del ciclo diventa righe `tasks`, e l'avanzamento smette di essere un numero
scritto a mano. Vlad: *«voglio che sia sempre aggiornato e reale, così mi faccio sempre un'idea
di come stiamo messi.»*

**3. Gli agenti veri.** Oggi la scheda «Active Agents» mostra sei righe seminate da
`src/lib/mock-data.ts` (Architect, Developer, Marketing, QA, Researcher + Olga) con modello
`olga-core-preview`, **che non esiste**. Nessuno assegna loro lavoro, nessuno esegue niente.
L'unica viva è Olga (la chat, che ha strumenti veri). Gemini, che è l'unico che lavora davvero,
scrive nel diario con `agent_id` nullo: **il solo lavoratore non compare nell'elenco dei
lavoratori.** Vlad vuole che diventino veri e che collaborino, non solo su CE ma su tutti i
progetti. Materiale già esistente da cui partire: **232 definizioni di agente** in
`~/.claude/agents` e **251 skill** in `~/.claude/skills`, più il vault `olga-vision-brain`
(14 settori). Il pezzo mancante non sono gli agenti: è **il lavoro** — chi decide cosa fa un
agente di marketing o di finanza su un progetto, e dove finisce il risultato.

**Divisione del lavoro decisa da Vlad:** di giorno Gemini continua sul codice del gioco, e io
lavoro su queste tre. *«sembrano banali, ma secondo me non lo sono.»*

**3-bis. Cripto conta i soldi due volte** — trovato il 21/08 all'01:35 controllando l'ultima
approvazione rimasta appesa (`cripto`, ramo `…crypto-js-08201949`, già in `main`).
La funzione è **spenta**, quindi nessun giocatore può arrivarci: si sistema con calma.

`rpc_buy_crypto` (24_crypto_offshore.sql:137) scala già il cash sul server — `UPDATE companies
SET cash = cash - v_eur_in` — e `rpc_sell_crypto` lo accredita. Ma `crypto.js:74` e `:91`
richiamano `CE_money.spend`/`earn` **dopo** che la RPC è tornata, e quelle rispediscono al
server il totale calcolato dal browser. Se l'eco Realtime della scrittura del server arriva
prima (cosa probabile: la RPC ritorna a commit avvenuto), il client applica il delta e **poi**
somma di nuovo → sulla vendita sono soldi regalati. È la stessa famiglia del bug delle aste,
e la cura esiste già: `accreditatoDalServer` in `money.js` — quando il server ha già mosso i
soldi, il client non risincronizza.

C'è anche un guardiano finto: `crypto.js:74` è `if (!CE_money.spend(...)) return;` messo **dopo**
l'acquisto sul server. A quel punto le monete sono già state comprate: quel `return` non
protegge niente, salta solo il refresh della schermata.

**Come è saltato fuori, e perché conta per il metodo:** i 28 test del ramo passano tutti anche
se cancello quel guardiano. Un ramo può essere verde, avere 608 righe di test nuovi, superare
il cancello automatico — e la funzione contare male i soldi lo stesso. È esattamente il motivo
per cui il controllo a campione della mattina non è una formalità.

**4. Libri → skill.** Vlad procura i PDF interi (li ha in fisico) e me li fa leggere **per
intero, non a campione**; io valuto quale skill utile ne può nascere. Non cercare riassunti
online: darebbero i luoghi comuni sul libro invece del suo metodo.

---

> **Stato misurato:** `npm run stato` conta i numeri veri (test, rete di sicurezza, file eseguiti,
> azioni verificate). Il cruscotto leggibile sta su
> https://claude.ai/code/artifact/621f3f9e-8c5d-4314-a5f4-e26ea6e1d1be
> (sorgente in `docs/cantiere.html`) — va **ripubblicato con lo stesso URL** dopo ogni revisione,
> non ricreato, o si moltiplicano le copie.

---

# ⭐ IL METODO, dal 20/08/2026 pomeriggio — leggi questo per primo

**Il gioco NON è ancora uscito. Non ci sono giocatori.** Questo fatto, saputo solo oggi
pomeriggio, ha cambiato la strategia: possiamo permetterci di mostrare meno gioco.

**Regola invertita: una funzione è accesa solo se qualcuno l'ha verificata.**
Prima era il contrario — tutto acceso, e nessuno sapeva cosa funzionasse.

Come l'ha detto Vlad, ed è la formulazione da tenere:
> «Anziché avere 20 macchine, ne ha 5 ma che funzionano. Nel buio lavoriamo alle altre 15,
> e quando saranno pronte le rilasciamo.»

`config.js` → `window.FEATURES`: **6 accese** (corse, flotta, autisti, finanza, contratti,
**aste**), **15 spente** (alleanze, salone, mercatoP2P, cripto, vtk, turismo, lusso, politica,
infrastrutture, holding, nemesi, vanita, negozioDC, vip, carriera).
`window.attiva('aste')` per chiedere. Sconosciuta = spenta, nel dubbio non si mostra.

**Spegnere NON cancella codice.** Il codice resta caricato: si nascondono i punti d'ingresso
(schede, pulsanti) e si neutralizzano gli effetti. Riaccendere costa una riga. È lo stesso
meccanismo di `HQ_ENABLED`, generalizzato.

**Il meccanismo esiste davvero, da oggi.** Fino al 20/08 pomeriggio `FEATURES` era solo un
elenco: `window.attiva()` era definita e **nessun file la chiamava**, quindi il gioco mostrava
tutte e 21 le funzioni come prima e la misura "5 su 21" descriveva un'intenzione, non la
partita. Ora chiude due strade: `feature-gate.js` nasconde le porte visibili con un foglio di
stile generato (regola CSS invece di `remove()`, perché la barra laterale si ridisegna più
volte in partita), e `switchTab` in `dispatcher.js` rifiuta una scheda spenta rimbalzando alla
home. `window.TAB_DI` in config.js dice quale funzione governa quale scheda.
Sorvegliato da `test/guardrail/interruttori-applicati.test.js`, che esegue il codice vero
sulla pagina vera (`index.html`).
**Due funzioni restano scoperte e sono dichiarate nel test, non dimenticate:** `vtk` e `vip`
non hanno una scheda propria — vivono dentro schermate accese e vanno spente nel punto in cui
compaiono.

**Come si accende una funzione** (il ciclo di lavoro d'ora in poi):
1. Si costruisce nel banco di prova la situazione che la rende viva (un'asta aperta con
   rilanci, un'alleanza con membri) — è questo il pezzo difficile, non il codice.
2. Si eseguono TUTTE le sue azioni.
3. Si corregge quello che è rotto (denaro via `CE_money`).
4. Si accende in `FEATURES` e si toglie il nome da `SPENTE_ALL_INIZIO` in
   `test/guardrail/interruttori.test.js`. Da lì in poi un test la sorveglia.

**Le aste: fatte (20/08 sera). Cosa ha insegnato il primo collaudo.**
Il codice client era già scritto bene — nessun `gameState.cash`, tutto via RPC — eppure la
funzione era completamente morta, e **leggendo il codice non si vedeva**. Si è vista
interrogando il database vero: 5 lotti, tutti ancora `open`, 4 scaduti da giorni.
I quattro guasti trovati (dettaglio nel commit `7418494`):
1. nessun cron chiudeva le aste — `rpc_resolve_auction` esisteva, il cron dato per scontato
   in un commento non era mai stato creato. Ora `_process_judicial_auctions()` gira ogni 15′;
2. vincere non dava niente: nessun veicolo in flotta, nessun denaro dal container. Aggiunta
   `rpc_claim_auction` con `claimed_at`;
3. chi offriva alto e poi svuotava il conto vinceva lo stesso a sconto (`LEAST(cash, bid)`);
4. un solo saldo poteva vincere dieci aste — l'offerta controllava i fondi senza impegnarli.

**La lezione per le prossime 15:** il banco di prova in Node non basta. Metà dei guasti stava
sul server o nel fatto che *nessuno chiamava* qualcosa. Per ogni funzione da accendere vanno
fatte tre domande, in quest'ordine: **(a)** c'è un processo schedulato che la tiene viva, e
gira davvero? (`select jobname from cron.job` — oggi ce ne sono 3: meteo, push, aste);
**(b)** quello che il giocatore vince/compra entra davvero nel suo stato, o si ferma a una
schermata? **(c)** i dati che il server produce hanno la stessa forma che il client si aspetta
(le aste generavano tier in maiuscolo e container nel campo sbagliato)?

**Trovato di passaggio, da sistemare quando tocca a `mercatoP2P`:** esiste una *seconda* asta,
locale e finta, in `engine.js` (`gameState.activeAuction`, `_resolveAuction` a riga ~798), che
scala `gameState.cash` direttamente. Vive nella scheda Mercato Auto, oggi spenta. Quando si
accenderà `mercatoP2P` va collassata sulla vera (caso da manuale della Regola 4).

**Prossimo passo concreto:** la funzione spenta più piccola rimasta. Candidate nell'ordine:
`vanita` (vanity.js, già l'unico file che spendeva DC correttamente), `cripto`, `salone`.
Le grosse (`ui-emails` 29 azioni, `ui-staff` 24, `ui-store` 18) per ultime.

**Vlad vuole che Gemini lavori il più possibile.** Ha chiesto di valutare Gemini 3.1 Pro al
posto di 3.7 Flash per il codice: da decidere provandolo su un lavoro vero e confrontando,
non a priori. I lavori "una funzione alla volta" sono più difficili dei "converti un file",
e oggi col Flash il tasso di rifiuto è stato alto.

---

### 📌 Stato al 20/08 sera

- **523 test, tutti verdi** (erano 348 a metà pomeriggio).
- **Funzioni accese: 7 su 21** (aggiunta `vanita`) — e da oggi lo spegnimento è un meccanismo, non una
  dichiarazione (vedi IL METODO in cima).
- **Azioni: 246 totali, ma solo 129 toccano denaro** — le altre 117 sono navigazione e filtri,
  non hanno niente da verificare.
- Lista `ECCEZIONI` della porta del denaro: **3 file** — `engine-finance.js` (restano
  dividendi:69, payout:104, prestito:214), `engine.js`, `hq.js`.
  Convertiti oggi: `ui-store.js`, `vtk-market.js`, `showroom.js`, `ui-staff.js`, e di
  `engine-finance.js` la borsa più lobby/partecipazioni.
- ~~Prezzo riparazione incoerente~~ — **già risolto il 19/08** dal commit `ac094f8`, che ha
  unificato tutto su `window.repairCostFor()` (85 €/punto, minimo €500). Il rilievo era rimasto
  nel piano vecchio e l'ho ripetuto il 20/08 senza riverificarlo, finendo anche in un messaggio
  di commit: **è sbagliato lì.** Prima di riportare un difetto da un documento, rileggere il
  codice.
- **Verificato che 85 €/punto regge economicamente** (20/08 sera). Corsa mediana €777 su 2.033
  rotte; usura 1,5 punti a corsa (2 vip, 2,5 ultra) → **€127 a corsa, il 16% dell'incasso**:
  una spesa che si sente senza schiacciare. I tre sconti si moltiplicano — contratto ×0,70,
  Capo Officina ×0,50, Officina Mobile ×0,80 = **×0,28**, cioè 24 €/punto a fine progressione.
  Quindi 85 e 25 non erano formule rivali: **85 è il prezzo del principiante, ~24 quello del
  veterano**, e la vecchia `payToRepairCar` faceva pagare a tutti il prezzo da veterano dal
  primo giorno.
- **DA DECIDERE (domanda di gioco, non di codice):** la Polizza Kasko (€48.000, rinnovo annuo)
  in `repairCostFor` azzera **ogni** riparazione, ma la sua descrizione promette solo quelle
  «incidentali». Con una flotta di 5 auto si ripaga in ~75 corse a testa e poi toglie dal gioco
  un intero centro di costo. O si allinea il codice alla descrizione (solo danni da incidente),
  o si alza il prezzo, o si accetta. **Serve una scelta di Vlad.**

**Errore mio da non ripetere:** avevo scritto «193 azioni al buio» contando anche le 117 che
non toccano denaro, e su quel numero ho mandato mezza giornata di lavoro nella direzione
sbagliata (8 compiti per allargare il banco di prova). **Allargare il banco non sposta la
copertura**: provato, un file in più l'ha cambiata di zero. Il motivo per cui un'azione non si
verifica non è che il file non è caricato — è che eseguirla non fa succedere niente senza il
contesto giusto.

### 🔧 L'infrastruttura, e come sta davvero

- **⚠️ Il repository è PUBBLICO dal 21/08.** Deciso da Vlad per avere minuti GitHub Actions
  illimitati: *«è un gioco, non ho soldi in ballo, non lo conosce nessuno»*. Il piano gratuito
  dà 2.000 minuti/mese sui repo privati e **li abbiamo esauriti in due giorni** (il 20/08 da
  solo: 148 run, 1.426 minuti), perché un lavoro costa ~65′ di macchina.
  **Prima di aprirlo ho scandagliato tutta la storia**: nessun token, nessuna chiave privata,
  nessun `service_role`. L'unica chiave presente è quella *anon* di Supabase, pubblica per
  progetto — la protegge la RLS. I segreti veri stanno nei GitHub Secrets e restano privati.
  **Resta però vero che i 61 file SQL documentano RLS, anti-cheat e rate-limit**, ed è la cosa
  che `.vercelignore` teneva fuori dal sito. Se un giorno il gioco avrà giocatori veri, la
  strada pulita è spostare SQL e documenti interni in un repo privato separato — ricordando
  che **la storia li conserva comunque** (sono lì dal 15/05, in 68 commit), quindi servirebbe
  riscriverla.
- **Alternativa mai adottata ma provata e valida:** far girare i lavori sul VM Google invece
  che su GitHub Actions. La suite completa gira lì in **11′17″** (contro ~8′ su Actions):
  gratis, illimitata, e non pubblica niente. È la strada da riprendere se il repo dovesse
  tornare privato.

- **⭐ Dal 20/08 sera il cancello fonde da solo. Non si chiede più l'ok a Vlad.**
  La ragione è sua: *«scritto così, io non so se approvare o meno. non sono in grado di capire
  se fidarmi. posso aiutarvi con cose umane, non a livello di coding.»* Chiedere a una persona
  di approvare ciò che non può valutare non aggiunge sicurezza — aggiunge una firma vuota, e
  intanto il lavoro resta fermo per ore. La sicurezza sta nei controlli; se non bastano si
  rafforzano quelli. Il vecchio meccanismo resta dietro `CHIEDI_APPROVAZIONE=1`.
  **A Vlad si chiedono solo domande umane:** prezzi, equilibrio, cosa mostrare ai giocatori.
- **Come regge la notte (21→09) senza nessuno.** Tetto giornaliero 60 lavori (era 30: si
  esauriva nel pomeriggio). Ogni stop automatico si riprova dopo 20′, fino a 2 volte.
  `riprendi` azzera anche `fallitiDiFila` — prima ripartiva con tre in conto e si rifermava
  subito. Un ramo respinto torna in coda **una volta**, con dentro il motivo esatto del
  cancello: dei 7 respinti del 20/08, **6 erano recuperabili in poche righe**.
- **Quanto dura un giro:** ~45′ l'agente + ~18′ il cancello (la suite gira due volte su 500+
  test) + ~3′ la fusione. Poco più di un'ora a lavoro, cioè ~10 lavori a notte.

- **⚠️ «Fallito» non vuol dire che il lavoro non c'è.** Il 20/08 sera tre run di fila hanno
  riportato fallimento per tempo scaduto e il ciclo si è fermato da solo (comportamento giusto:
  tre fallimenti in fila dicono che il guasto è a monte). **Due delle tre avevano il ramo
  pubblicato e il lavoro completo** — messe davanti al cancello davano `promuovibile: true`
  senza una riga da cambiare, 27 e 22 test nuovi. L'agente aveva finito e non aveva fatto in
  tempo a dirlo. Corretto in `code-loop.js`: **se il ramo esiste si giudica**, qualunque cosa
  dica l'esito della run.
- **Il vero collo di bottiglia è `npm test`: 7-9 minuti in CI.** Un lavoro fatto bene la suite
  la lancia tre volte (rossa, dopo la correzione, finale) — ventiquattro minuti su venti
  disponibili. Tetto dell'agente portato da 20 a **45 minuti** (workflow a 60), e la
  descrizione dello strumento ora dice di usare `node --test <singolo file>` durante il lavoro.

- **⚠️ Se il sito non si aggiorna, guarda l'autore dei commit.** Il 19-20/08 tredici deploy di
  produzione di fila sono risultati `BLOCKED` e il sito è rimasto fermo mezza giornata senza
  che nessuno se ne accorgesse. Vercel, sul piano **Hobby**, rifiuta ogni deploy il cui autore
  del commit non risulti collaboratore del progetto — e su repository privati il piano Hobby
  la collaborazione non la supporta proprio. L'unica firma accettata è
  **`Vlad <bestbroker1998@gmail.com>`** (l'account Vercel). Attenzione: l'account Google di
  Vertex è un altro (`djblade594@gmail.com`) — non confonderli, valgono per cose diverse.
  Come accorgersene subito: `vercel inspect` mostra `status UNKNOWN`, ma
  `GET /v6/deployments?projectId=ncc` dell'API dice `BLOCKED` a chiare lettere.
  Verifica veloce dopo ogni push importante:
  `curl -s -o /dev/null -w '%{http_code}' https://www.chauffeurempire.com/<file-appena-aggiunto>`
- Le anteprime dei rami `gigi/**` sono **spente** in `vercel.json`: non consumano build.

- **Canale: Telegram** (`@gigi_olga_bot`), servizio `gigi-telegram` sulla VM. WhatsApp spento e
  disabilitato. Comandi: `stato`, `pronti`, `approva 1` / `approva tutti`, `scarta 2`,
  `ferma`/`riprendi`.
- **Cancello automatico** (`.github/agent/verifica-ramo.mjs` + `fondi-ramo.mjs`): verifica il
  ramo UNITO a main, test cresciuti, nessun test disattivato, prova per mutazione. Chi passa
  diventa una richiesta di approvazione sull'hub; Vlad approva e il ramo si fonde da solo.
- **✅ Il cancello è stato visto giudicare, il 20/08 sera.** Eseguito a mano su tutti e 4 i
  rami in attesa (`RAMO=... BASE=origin/main node .github/agent/verifica-ramo.mjs` in un
  worktree con `node_modules` in symlink): 4 verdetti su 4, tutti corretti, tutti negativi,
  con il motivo scritto in chiaro. Quello che resta da vedere dal vivo è il pezzo *dopo* il
  verdetto — richiesta sull'hub, approvazione di Vlad, fusione automatica.
- **Il cancello dice NO bene, ma il NO va letto.** Dei 7 rami respinti oggi, **6 erano
  recuperabili**, quasi tutti in poche righe: quattro avevano solo dimenticato di togliere il
  file da `ECCEZIONI` (è il passo che Gemini salta più spesso, e il guardiano lo prende ogni
  volta), uno aveva i test scritti contro dati inventati, uno aveva scritto i test e mai la
  correzione. Archiviarli avrebbe buttato via un centinaio di test buoni.
  **Un rifiuto è l'inizio di una revisione, non la fine.**
- **Il cancello ha avuto due guasti opposti in un giorno, ed è la cosa da ricordare.**
  La mattina *approvava senza giudicare* (leggeva l'esito della run invece del verdetto); il
  pomeriggio *rifiutava senza giudicare* (il verdetto veniva raschiato da un JSON indentato
  con una pulizia dei timestamp sbagliata → `{}` → «non promuovibile»). Quattro rami bocciati
  senza mai essere stati esaminati, uno dei quali passava senza una riga da cambiare.
  Ora il verdetto esce anche su **una riga sola** dietro il marcatore `VERDETTO `, e il ciclo
  legge quella. Provato sul log vero di una run vera, e provato al contrario: la vecchia
  logica su quello stesso log fallisce con «Unexpected end of JSON input».
- **Hub** (`olga-studio-nine.vercel.app`): scheda progetto con le misure (`npm run stato --hub`),
  pagina Approvals funzionante. `HUB_URL` e `GIGI_API_TOKEN` sono anche secret di GitHub.

### 📋 Cosa aspetta

- **4 rami aspettano una revisione mia** (hanno già fallito il cancello o una revisione).
- La coda del vecchio metodo è quasi vuota: resta `ce-ui-staff-2`. Gli 11 compiti sul banco di
  prova sono stati **cancellati** perché basati sulla premessa sbagliata.
- **Da rifare col metodo nuovo:** tutto il resto.

---

### 🌙 20 agosto — 18 rami fusi. Suite 192 → 339 verdi. Il canale è Telegram

**La notte è servita.** Gemini ha lavorato dalle 22:46 alle 05:27 e ha prodotto 23 rami. In
revisione ne sono stati accettati **18** e rifiutati 5. La lista `ECCEZIONI` del guardrail è
scesa **da 29 a 12** file.

**La misura che conta non è 339.** Rompendo di proposito la sincronizzazione in `money.js`,
prima fallivano **29** test, ora **109**. È la dimensione reale della rete di sicurezza, ed è
misurata rompendo il codice, non stimata.

**Confermato eseguendolo:** `buyMaintenanceContract` ora sincronizza davvero (uscito da
`ROTTE_NOTE`).

**Perché 5 rami sono stati rifiutati** — sono i modi tipici in cui un lavoro *sembra* riuscito:
- `ui-store`: 352 righe di test e il file **mai toccato** (13 mutazioni ancora dentro).
- `engine-rides`: conversione giusta ma una chiamata al server **per ogni corsa** invece di una
  sola col totale. L'ha preso un test di regressione già esistente.
- `vtk-market`: si è tolto dalle `ECCEZIONI` **lasciandosi dentro 5 mutazioni**.
- `engine-finance`: un suo stesso test rosso. `showroom`, `ui-staff`: nessun ramo prodotto.

**Tre difetti erano nostri, non di Gemini** (tutti corretti):
1. Il guardrail `ROTTE_NOTE` **puniva il successo**: diventava rosso quando una correzione
   riusciva, e siccome il cancello è `npm test`, il lavoro buono veniva marcato fallito. È il
   motivo dei 7 "fallimenti" della notte, di cui almeno due contenevano lavoro completo.
2. Lo script di merge saltava un commit in silenzio, lasciando modifiche a metà.
3. Il ciclo trasformava il chat_id Telegram in `154231837@s.whatsapp.net`: l'avviso non sarebbe
   mai partito e nessuno l'avrebbe saputo.

**Il canale è Telegram** (`@gigi_olga_bot`), servizio `gigi-telegram` sulla VM; WhatsApp è
**spento e disabilitato**. Motivo in `memory/architettura_gigi_cloud.md`: Baileys dipende
dall'app sul telefono, iOS la sospende, e i messaggi sparivano senza lasciare traccia. Non era
un nostro bug. **L'avviso è stato provato davvero end-to-end**, non solo scritto.

**In coda ora (12 task, ciclo attivo):** i 6 file rimasti della classe denaro, più 6 lavori che
allargano il **banco di prova** (45 file su 88 → di qui il fatto che solo 12 azioni su 246 sono
verificate). Quest'ultima è la parte redditizia: ogni file aggiunto rende verificabili le azioni
che contiene, e quelle rotte emergono da sole.

**Da fare alla prossima sessione:** rivedere e fondere i rami nuovi; le 6 collisioni di nomi
globali (`hqOpenBuildModal` con firme incompatibili, `renderTabProvinces` con due schermate per
la stessa tab); le 34 funzioni morte. Debiti più vecchi: prestiti senza RPC dedicate, province
(18/23 senza dati di bilanciamento), `game_saves` senza ON DELETE CASCADE.

---

### 🤖 19 agosto sera — Gemini lavora da solo. Suite 125 → 188 verdi

**Il cambio di metodo, che conta più dei singoli fix.** I bug della stessa famiglia continuavano
a ricomparire perché li cercavamo a mano, un file alla volta. Ora il criterio è meccanico ed è
scritto in `~/.claude/.../memory/criterio_analisi_ce.md`:

1. **Una sola porta per il denaro** — `money.js` (`CE_money.spend/earn/spendDC/earnDC/addReputation`).
2. **Il divieto è un test** — `test/guardrail/una-sola-porta.test.js` fallisce se qualcuno muove
   valuta scavalcando la porta. La lista `ECCEZIONI` (i file non ancora convertiti) **può solo
   accorciarsi**, e un secondo test impedisce di toglierne uno senza averlo davvero convertito.
   Siccome il cancello degli agenti è `npm test`, la regola si applica **da sola anche a loro**.
3. **Le 246 azioni sono l'unità di verifica** — `test/guardrail/azioni-sincronizzano.test.js`
   estrae i nomi `data-ce-act` dal sorgente, li esegue tutti e fallisce se uno muove denaro senza
   una **scrittura** verso il server (le letture come `getCompany` non contano).
4. **Un'azione, una funzione** — registro in `docs/AZIONI.md`.

**Come si misura, d'ora in poi:** eseguendo il codice nel banco di prova, mai deducendo dalla
lettura. Ogni fix va verificato **per mutazione** (rompo il codice corretto, i test nuovi devono
diventare rossi).

**Fatto in questa sessione:** `money.js` + i due guardrail; negozio DC, holding e autisti
convertiti da Gemini (34 test suoi, tutti verificati per mutazione); riparazione carrozzeria
consolidata da due funzioni a una (il pulsante mostrava €5.100 e ne addebitava 1.500 — ora il
prezzo viene da `repairCostFor()`, fonte unica, a €85/punto come le interfacce hanno sempre
mostrato); HQ dietro interruttore spento in `config.js`.

**Debito noto e non nascosto:** `syncCash` manda al server il totale **deciso dal browser**.
Questo lavoro ripara la divergenza (soldi che sparivano, acquisti gratis) ma **non l'imbroglio**.
Renderlo a prova di manomissione significa spostare ogni transazione su una RPC che la valida:
lavoro separato, dopo.

### Il ciclo autonomo (`jarvis/src/code-loop.js`, gira sulla VM)

Gemini prende il lavoro successivo dalla coda, lo manda a GitHub Actions, aspetta l'esito e passa
al prossimo — **anche di notte**. Sui successi tace; scrive su WhatsApp e **si ferma** solo se un
task fallisce, se la coda finisce, se ci sono 3 rami in attesa di revisione o al 12° lavoro del
giorno. Comandi: «gigi, stato», «gigi, riprendi», «gigi, ferma». Lo stato si vede nel riquadro
*Live activity* dell'hub.

La coda (25 task) **non è scritta a mano**: `jarvis/scripts/genera-coda-ce.mjs` la ricava dalla
lista `ECCEZIONI` del guardrail, quindi non può divergere dalla realtà.

**Due trappole già pagate, da non ripetere:**
- **Mai modificare `.github/` mentre una run è in volo.** Il ramo nasce da un main più vecchio,
  contiene un workflow diverso e GitHub respinge il push: 40 turni e $0,70 buttati. Ora
  `run-task.mjs` scarta da sé ogni modifica sotto `.github/` (un agente non deve poter cambiare
  le regole con cui viene eseguito).
- **File grossi vanno spezzati.** `engine-fleet.js` (14 funzioni) ha esaurito i 40 turni in un
  colpo solo; ora è due task.

### Cosa resta

- 25 task in coda (≈2 giorni di lavoro autonomo), poi il ciclo chiede lavoro nuovo.
- **Copertura del guardrail sulle azioni, dichiarata dal test stesso:** 246 azioni, solo 5
  verificate, 145 non attivabili dal banco, 90 nomi che non risolvono perché vivono in file che
  `test-support/game-env.js` non carica (29 su 93). Allargare `CORE_FILES` è ciò che fa salire
  davvero quel numero.
- **Controlli meccanici ancora da scrivere** (sono quelli che generano i prossimi task): nomi
  globali sovrascritti in silenzio — `hqOpenBuildModal` ha **firme incompatibili**,
  `renderTabProvinces` mostra due schermate diverse per la stessa tab —, chiamate `window.*` a
  funzioni che non esistono, e le 34 funzioni morte elencate in `docs/AZIONI.md`.
- Debiti aperti: prestiti senza RPC dedicata, province (18/23 senza dati di bilanciamento),
  `game_saves` senza ON DELETE CASCADE, token GitHub su Vercel troppo ampio.

---

### 🟢 19 agosto 2026 — TUTTO PUBBLICATO. `main` è live, suite a 103 verdi

**Il lavoro accumulato è online.** `auto/stabilization-blocco1` (36 commit) e i lavori di Gemini
sono stati portati su `main` e pubblicati su Vercel: `4ae47c5` e `b63c10a`. Non c'è più niente
in sospeso — working tree pulito, nessun ramo `gigi/*` o `gemini/*` rimasto.

**Prima di pubblicare è stato fatto un playtest vero nel browser**, non solo i test:
fondazione azienda da account nuovo, corsa completata, cassa passata da 500 a 710 e
**confermata su `companies.cash`**, salvataggio e ricarica senza perdite, console senza errori.
L'account di prova è stato poi cancellato dalla produzione (torna a 1 utente, 1 azienda).

**Cosa è entrato, oltre a quanto già descritto sotto per il 18 agosto:**
- la cassa viene specchiata sul server dopo **ogni** movimento locale (corse, pagamenti differiti,
  upgrade, multe, guerre di prezzo, vendita investimenti, coda del tick giornaliero, pignoramento);
- `syncCash()` aggiorna la baseline del delta Realtime prima di scrivere: l'eco della nostra stessa
  scrittura veniva riapplicata (il premio del Giorno 1 mostrava 1000 invece di 500);
- **pacing**: soglie di sblocco dimezzate, durata corsa da 0.4 a 0.2 minuti/euro, due corse e il
  primo batch di bandi disponibili subito invece che dopo 5 minuti / 2 giorni di gioco;
- **un account nuovo sceglie davvero nome, logo e colore** — il boot creava la company col nome di
  default e rendeva `showNewGameSetup()` codice morto (in produzione c'era infatti **una sola
  azienda, chiamata "Chauffeur Empire"**: nata proprio da quel bug);
- la classifica pubblica in home legge `leaderboard` invece di `companies`, che con la RLS
  "solo la propria riga" tornava sempre vuota a un visitatore anonimo;
- le soglie del tracker obiettivi derivano da `ceOnb.GATES` invece di essere riscritte a mano.

**Migrazioni SQL 52-61: tutte già applicate in produzione**, verificate una per una il 19 agosto
(corpo delle funzioni identico, permessi revocati, publication a 27 tabelle, cataloghi popolati).
Niente da eseguire.

**Debito trovato e non chiuso:** `game_saves` non ha `ON DELETE CASCADE` verso `auth.users`,
quindi cancellare un account fallisce finché non si cancella prima il salvataggio. Conta per una
eventuale richiesta di cancellazione dati.

---

## 🚀 STATO ATTUALE (giugno 2026) — leggi questo PER PRIMO

## 🧊 PROGETTO IN FEATURE FREEZE (dal 10 agosto 2026)

Su istruzione diretta di Vlad: niente nuove feature, niente refactoring generale, niente
espansione di gameplay finché il gioco non è **stabile** (checklist completa in
`docs/STABILITY_CHECKLIST.md`). Si procede a blocchi: Core+Save/Load+Economy → Garage+Employees+
Rides → Daily+Contracts+B2B/Tourism → VIP+HQ+Auctions+Eventi → Territories+VTK+New Game+.

### ✅ 18 agosto 2026 — BLOCCO 4 aperto: 2 `FAIL` chiusi (eventi globali, cassa VIP) + il primo lavoro arrivato dall'hub

**Suite: 78/78 verdi** (erano 64 a fine BLOCCO 3, 67 contando il lavoro non committato in corso).
Branch: `auto/stabilization-blocco1`, commit `b9eea41` e `073cca5`. **Niente pushato.**

**Cosa è stato chiuso (dettaglio in `docs/STABILITY_CHECKLIST.md`, BLOCCO 4):**
1. **`activeDynamicEvent` mai azzerato dopo un evento globale** — era il `FAIL` noto del blocco.
   Lo specchio locale nasce con `endsHour: Infinity`, quindi il tick non lo scade mai, e alla fine
   dell'evento la funzione del banner usciva senza toccarlo: moltiplicatori attivi per sempre e
   nessun evento locale poteva più partire (lo slot restava occupato). Ora la sincronizzazione è
   `window.syncGlobalEventToGameState()`, indipendente dal DOM, e azzera solo gli eventi di origine
   globale. 8 test nuovi (`test/events/`).
2. **Le azioni email VIP muovevano cassa senza dirlo al server** — 7 handler facevano
   `gameState.cash ±= …` + `saveGame()`, che scrive solo il blob in `game_saves`: `companies.cash`
   (letto dalle RPC di P2P, alleanze, IPO, province) restava indietro. Aggiunto `_vipSyncCash()`,
   stesso pattern di `engine-rides.js`/`engine-daily.js`. 3 test nuovi (`test/vip/`).

**Ricognizione, senza modifiche:** Auctions e VTK Shop sono già interamente su RPC (nessuna
mutazione locale di cassa) — restano da confermare dal vivo. New Game+ è verde nei test.
**HQ resta bloccato** (`hqUpgradeRoom` non server-authoritative): è `DESIGN_DECISION_REQUIRED`,
aspetta una decisione tua, non codice. Idem le 18 province `FIX_LATER` del BLOCCO 5.

**Nota sul cache-bust:** in `index.html` sono saliti `global_events.js?v=11` e `vip-clients.js?v=8`.
Il file è tra quelli che stavi già modificando tu, quindi quelle due righe sono nel working tree
ma **fuori dai commit**: vanno con il tuo prossimo commit.

**Il primo fix è arrivato dall'hub, non da qui:** il bug degli eventi globali è stato eseguito da
Gigi (task `t_00d4f8c4db1246e3a94c` su Olga Studio, ora in `review`), su un branch dedicato, e poi
verificato riga per riga e con i test prima di essere portato dentro. È il primo giro completo
WhatsApp/hub → codice del gioco.

### 🔴 15 agosto 2026 (cont.) — Seconda review Gemini (modalità adversarial): 3 findings, tutti confermati e fixati
Gemini ha scritto un secondo giro in `CLAUDE_HANDOFF.md` ("Adversarial Bug Hunter"). Tutti e 3 i
findings verificati indipendentemente e confermati veri:

1. **CRITICAL/HIGH, confermato** — `rpc_refuel_vehicle` bloccava **sempre** `v_fuel_amount=0` con
   `RAISE EXCEPTION`, ma `superchargeVehicle` (ricarica EV, `engine-fleet.js:19`) e `refillTires`
   (pressione gomme, `engine-fleet.js:37`) chiamano quella RPC apposta con `v_fuel_amount=0` (per
   addebitare solo il costo, senza toccare il carburante). **Entrambe le feature erano
   completamente rotte** — ogni tentativo falliva con errore server, cash mai scalato, stato mai
   aggiornato. Non un edge case: bug sistematico su ogni singolo utilizzo. Fix: `< 0` invece di
   `<= 0` nel check.

2. **HIGH, confermato** — `rpc_vote_server_decree` accettava `v_points_spent` illimitato dal
   client (solo pavimento `>=1`, nessun tetto): un utente poteva passare 100.000 e approvare
   istantaneamente qualsiasi decreto globale. Verificato che `gameState.lobbyingPoints` (il
   "budget" che il client controlla prima di chiamare, `ui-lifestyle.js:171-173`) è puramente
   client-local — zero colonne DB, mai sincronizzato — quindi il server non può validare il vero
   possesso. Un fix server-authoritative completo richiederebbe portare l'intero sistema lobbying
   lato server (decisione di design, fuori scope). Fix minimo applicato (stesso principio già
   usato per `rpc_start_trip`/`rpc_sell_vehicle`): tetto 200 (range massimo dichiarato nel commento
   di `engine.js:234`, `// 0-200`) + rate-limit 10/min. Questo è lo stesso bug già annotato come
   "non ancora fatto" nel backlog Gruppo 3 di una sessione precedente — ora chiuso.

3. **Segnalato da Gemini come MEDIUM (manca rate-limit), ma verificato durante l'implementazione
   che era in realtà CRITICAL** — `rpc_contribute_consorzio` non validava il **segno** di
   `v_amount`. Con un valore negativo, il check "fondi insufficienti" non scattava mai (`v_cash <
   v_amount` è sempre falso con `v_amount` molto negativo), `_add_player_cash(v_uid, -v_amount)`
   diventava un **accredito** (delta positivo) al chiamante, e `treasury = treasury + v_amount`
   **sottraeva** dal tesoro del consorzio — un "contributo" negativo si trasformava in un furto:
   cash dal nulla per il chiamante + drenaggio del tesoro condiviso. Non trovato né da me né da
   Gemini nel giro precedente. Fix: aggiunto `IF v_amount <= 0 THEN RAISE EXCEPTION` (mancava del
   tutto) + il rate-limit 20/min segnalato da Gemini.

**Migration**: `58_fix_refuel_zero_vote_cap_consorzio_ratelimit.sql`. **Verificato con test
end-to-end reali** (utente temporaneo, creato ed eliminato): `rpc_refuel_vehicle(id, 0, 80)` ora
riesce (cash scalato correttamente 100.000→99.920, fuel_level invariato come atteso);
`rpc_contribute_consorzio(id, -1000000)` ora rifiutato con "Importo non valido";
`rpc_vote_server_decree(id, 100000)` ora rifiutato con "punti fuori range (100000, max 200)".
Nessuna modifica JS in questo giro — solo i 3 file SQL. Suite invariata: 65/65 pass. Risposta
completa per Gemini in `GEMINI_HANDOFF.md`.

### 🔴 15 agosto 2026 (cont.) — Prima review Gemini: 4 findings verificati, 4 fix applicati
Gemini ha scritto `CLAUDE_HANDOFF.md` con 4 findings + revisione dei fix 52-56 (tutti APPROVATI da
Gemini, nessuna regressione). Ogni finding verificato indipendentemente sul codice/DB reale prima
di agire, come da workflow:

1. **CONFERMATO e fixato** — `rpc_list_company_ipo` leggeva `reputation`/`company_name` da
   `public.leaderboard` (client-writable, stesso pattern già visto in `rpc_donate_to_alliance`)
   invece di `public.companies` (autoritativa). Un utente poteva scriversi `reputation=5.0` via
   devtools e quotarsi in borsa senza il requisito minimo 3.5★. **Il presunto "bug di
   formattazione %.1f" segnalato da Gemini era un falso positivo** — verificato sul DB: il codice
   usa già il pattern corretto (`%` + `round(...,1)` pre-calcolato), non un modificatore printf.
   Fix: `57_fix_ipo_reputation_source_of_truth.sql`, legge da `companies`.

2. **CONFERMATO e fixato** — `ui-store.js` righe 191-192 (Executive Club → Limite Offline / Auto-
   Rest CEO): 2 item su 15 usavano `fn:"window._dcSpend(...)"` (stringa letterale mai processata)
   invece di `act:ceAct('_dcSpend',[...])`. Il template `_svcCard` legge `it.act`, quindi
   generava un attributo `undefined` — bottoni completamente inerti, mai intercettati da
   `events.js`. Il mio controllo automatico "bottoni morti" della sessione precedente cercava solo
   chiamate `ceAct(...)` esistenti, non item di array privi del campo `act` — gap del mio metodo,
   non del codice; trovato da Gemini con un approccio di lettura diretta.

3. **Riclassificato da "CONFIRMED BUG/MEDIUM" a IMPROVEMENT** — `p2p-market.js` aveva un ramo
   fallback che chiamava `rpc_dampen_tension` direttamente (RPC REVOKEd da `authenticated`/`anon`,
   quindi fallirebbe sempre). Root cause tecnica di Gemini corretta, ma verificato sul DB che
   `rpc_contribute_holding_treasury` ritorna **sempre** `{treasury, tension}` — quindi quel ramo
   è irraggiungibile nella pratica attuale, zero impatto reale oggi (non un bug attivo, solo
   codice morto fuorviante). Rimosso comunque per pulizia/prevenzione futura.

4. **CONFERMATO e fixato, gravità precisata** — `buyCARUpgrade`, `payFine`, `attackTerritory`,
   `sellInvestment` mutavano `gameState.cash` senza `ServerState.syncCash()`. Verificato che
   `sellInvestment` è un **incremento** (non un decremento come gli altri 3): lì il rischio è
   perdita netta per il giocatore (investimento rimosso e salvato, ma rimborso mai arrivato al
   server) — più grave del semplice "sconto auto-inflitto" degli altri 3 casi, coerente con la
   gravità HIGH assegnata da Gemini. Aggiunto `syncCash` a tutte e 4. Test obsoleto in
   `test/garage/assign-upgrade.test.js` (che documentava il debito come "non una regressione di
   questa sessione") sostituito con un vero test di regressione per `buyCARUpgrade`.

**Verificato**: sintassi valida su tutti i file JS toccati, cache-bust bump (`engine.js` v25→26,
`engine-fleet.js` v8→9, `ui-store.js` v13→14, `p2p-market.js` v9→10), suite completa 65/65 pass
(incluso il nuovo test di regressione). Risposta completa per Gemini scritta in
`GEMINI_HANDOFF.md`.

### 🔴 15 agosto 2026 (cont.) — Service worker verificato pulito, gap di test coverage individuato
**Service worker (`sw.js`, 102 righe)**: nessun bug trovato. Strategia network-first per HTML/JS/
CSS (aggiornamento immediato ad ogni deploy, risolve lo storico problema di asset stale) +
cache-first per media. Tutti gli shell asset precached esistono e non sono esclusi da
`.vercelignore`. CSP (`worker-src 'self' blob:`) intatta.

**Test coverage — gap significativo, non ancora colmato**: zero test automatizzati (`test/`)
coprono l'intera area P2P/Sindacato/Alleanze (`p2p-market.js`, `p2p-render.js`, `alliances.js`) —
esattamente l'area dove sono stati trovati 3 dei 6 bug economici di questa sessione
(`rpc_donate_to_alliance`, il bug cash P2P del Fix 1, `rpc_daily_dividends`). Il framework di test
esistente (`test-support/game-env.js`) mocka `ServerState` (il wrapper JS di alto livello), ma
`p2p-market.js`/`alliances.js` chiamano il client Supabase direttamente (`_sb().rpc(...)`),
bypassando `ServerState` — servirebbe un nuovo tipo di mock (client Supabase fittizio) per poter
testare questi file. Non implementato in questa sessione: è un investimento infrastrutturale
(nuovo pattern di mock + suite di test da scrivere), non un fix isolato — da decidere
esplicitamente se affrontarlo, non infilato in coda. Nessun altro problema trovato nella suite
esistente: i due `assert.ok(true)` in `loans.test.js`/`assign-upgrade.test.js` sono un pattern
intenzionale di "documentazione eseguibile" di debiti tecnici noti, non test rotti.

### 🔴 15 agosto 2026 (cont.) — Audit backend RPC: 2 CRITICAL + 1 HIGH aggiuntivi (accesso pubblico non autenticato)
Mappate tutte le ~127 RPC `rpc_%` raggiungibili dal ruolo `anon` (grant di default Postgres/
PostgREST su funzioni senza REVOKE esplicito), incrociate con l'assenza di un controllo
`auth.uid()`/`_my_company_id()` interno. 13 funzioni risultavano prive di guardia auth interna;
la maggior parte ha comunque una guardia **temporale** naturale che le rende idempotenti anche se
richiamate a raffica da un anonimo (es. `rpc_credit_real_estate_rents`: `last_rent_at < now()-24h`;
`rpc_reset_daily_vtk`: `vtk_today_reset < CURRENT_DATE`; `rpc_tick_tension`: delta calcolato sul
tempo reale trascorso). Due invece no:

🔴 **CRITICAL — `rpc_daily_dividends()` raggiungibile da chiunque, anche SENZA account, senza
alcuna guardia anti-duplicazione.** Il commento originale in `08_mmo_p2p_marketplace.sql` la
descriveva come "da chiamare ogni mezzanotte via cron/edge fn", ma non è mai stata collegata a
nessun cron — il GRANT di default a `PUBLIC` non era mai stato revocato, e zero call-site nel
client (mai chiamata). A differenza di `rpc_credit_real_estate_rents`, non azzera/segna mai
`weeklyEarnings` come già distribuito: chiamata ripetutamente in loop, paga N volte lo stesso
dividendo giornaliero a tutti gli shareholder di **qualsiasi** azienda quotata in borsa,
prelevando ripetutamente dal cash dell'emittente. A differenza degli altri bug economici di
questa sessione, non richiede nemmeno un account — è un vettore di attacco pubblico contro terzi.
**Fix** (`56_revoke_daily_dividends_public_access.sql`): REVOKE completo da `authenticated`+`anon`
(zero regressione). Nota per il futuro: se si vuole riattivare un vero cron, va prima aggiunta una
guardia anti-doppio-pagamento (campo tipo `last_dividend_day`), non solo il GRANT a `service_role`.

🟠 **HIGH — due RPC scrivevano dati globali senza richiedere alcuna autenticazione**:
`rpc_spawn_judicial_auction` (crea lotti d'asta pubblici, zero call-site client — verosimilmente
un cron mai completato, come `rpc_daily_dividends`) e `rpc_broadcast_news` (scrive nel feed
pubblico `global_news`, chiamata legittimamente da `engine.js:2000` ma raggiungibile anche da
`anon` per impersonare qualsiasi azienda). **Fix** (`55_fix_public_rpc_no_auth_required.sql`):
REVOKE completo sulla prima; sulla seconda aggiunto un controllo `auth.uid() IS NOT NULL` (il
client la chiama solo da loggato, zero regressione) + REVOKE da `anon`.

**Verificato**: nessuna di queste 3 fix tocca file JS — solo GRANT/REVOKE e un controllo auth
aggiunto. Suite test invariata (65/65 pass, nessuna di queste RPC è coperta da test node — sono
lette solo via query dirette sul DB, verificate con `has_function_privilege` prima/dopo).

### 🔴 15 agosto 2026 — NUOVO WORKFLOW (Claude Code + Gemini 3.7 Flash via Continue/Vertex AI) + FIX CRITICAL rpc_donate_to_alliance
**Workflow di progetto aggiornato**: da oggi Chauffeur Empire usa due AI indipendenti — Claude Code
(implementazione) + Gemini 3.7 Flash via Continue in VS Code, provider Vertex AI (non API
consumer). Gemini fa da secondo paio di occhi (bug hunting/code review indipendente); Claude
verifica ogni finding sul repo reale prima di agire, classificandolo CONFIRMED BUG / POTENTIAL BUG
/ FALSE POSITIVE / IMPROVEMENT. **Vincolo tecnico**: Claude Code non ha un canale diretto verso
Continue/Gemini — l'interazione passa da Vlad (incolla i findings di Gemini in sessione). Dettagli
completi salvati in memoria di progetto (`workflow_due_agenti_gemini.md`).

**🔴 CRITICAL trovato e fixato: `rpc_donate_to_alliance` generava tesoro alleanza dal nulla,
corrompendo il Punteggio Potere "a prova di cheat".** File: `17_executive_club.sql`-area
(alliances) + `alliances.js:330` (call-site, input libero dall'utente). L'unico controllo di
plausibilità era `p_amount > leaderboard.liquid_assets` — ma quel campo è **liberamente
scrivibile dal client**: la RLS su `public.leaderboard` (`polcmd '*'`, `user_id = auth.uid()`)
permette a chiunque di fare UPDATE sulla propria riga senza validazione server-side del contenuto
(verificato: `saveSystem.js::_upsertLeaderboard` ci scrive `Math.floor(saveData.cash||0)`, ma
nulla impedisce una scrittura diretta arbitraria da devtools). **E anche superato quel check finto,
la funzione non scalava mai un euro da `companies.cash` o `game_saves.cash`** — il "donatore" non
pagava letteralmente nulla. Il tesoro alleanza sblocca perk reali (`rpc_activate_alliance_perk`) e
la `alliance_members.contribution` incrementata alimenta **direttamente** il Punteggio Potere in
classifica (`ui-ranking.js:53-63`), l'unica metrica esplicitamente progettata per essere "a prova
di cheat" (riga 144) proprio perché non dipende dal cash lato client — quindi questo bug la
vanificava del tutto, ed era ripetibile senza alcun rate-limit.

**Fix applicato** (`54_fix_donate_to_alliance_cash_source_of_truth.sql`): la RPC ora legge e scala
`companies.cash FOR UPDATE` (fonte autoritativa, stesso pattern di `rpc_sync_cash`), ignora
completamente `leaderboard.liquid_assets`, aggiunto rate-limit 20/min. Firma, tetto (€100M/chiamata)
e resto della logica (treasury, contribution, membership check) invariati.

**Verificato con un test end-to-end reale** (utente temporaneo, `leaderboard.liquid_assets`
volutamente falsificato a €200M): prima donazione da €40.000 con `companies.cash` reale a
€50.000 → riuscita, `cash` sceso correttamente a €10.000. Seconda donazione da €40.000 →
**correttamente rifiutata** ("Fondi insufficienti, hai €10.000") nonostante `leaderboard` mostrasse
ancora €200M — la RPC ignora del tutto quel campo, come da fix. Dati di test rimossi subito dopo.

### 🔴 14 agosto 2026 — RESET dati di test + FIX BUG CRITICAL doppia source of truth del cash (P2P/Sindacato)

**Reset dati di test (autorizzato esplicitamente da Vlad, verificato PRIMA che non esistesse un
DB dev separato — `twstjbykstaioaahfqbe` è l'UNICO progetto Supabase di Chauffeur Empire, lo
stesso che serve il client live).** Inventario letto dallo schema reale (non dai file `.sql`,
alcuni sono scaffold mai applicati): 10 tabelle con FK reale `ON DELETE CASCADE` da
`companies.id`, ~35 tabelle con `user_id`/`company_id` senza FK dichiarata. 7 account totali in
`auth.users` (tutti riconducibili a Vlad — `djblade594@gmail.com`, `vlad@olgavision.it`,
`gainavladionut@gmail.com`, `slumpdivider@gmail.com`, `slump_divider_5m@icloud.com`,
`djbladestudio@gmail.com`, `bestbroker1998@gmail.com`), confermato con Vlad via domanda esplicita
prima di procedere (includeva anche il suo account principale). **Eseguito**: `TRUNCATE` di tutte
le tabelle per-utente (companies CASCADE + tutte le tabelle Gruppo B esplicite) + pulizia
riferimenti in `judicial_auctions`/`server_decrees` (generate proceduralmente, righe preservate,
solo `winner_id`/`bid_count`/`votes_current` azzerati) + cancellazione dei 7 utenti via Auth Admin
API (non `DELETE FROM auth.users` diretto — pulisce correttamente anche `identities`/`sessions`).
**Zero DDL**: schema, migration, RPC, policy invariati. Verificato dopo: `auth.users=0`,
`companies=0`, `game_saves=0`, tabelle globali (`provinces`, `b2b_catalog`, ecc.) intatte.

**Bug cash — verifica confermata (era già diagnosticato in una sessione precedente, qui
riverificato sullo stato REALE del DB prod prima di correggere, come richiesto).** Root cause:
`_get_player_cash`/`_add_player_cash` (helper usati da 9 RPC — mercato P2P auto, holding/IPO,
azioni, consorzi, Don Carmine, GdF) leggevano/scrivevano SOLO `game_saves.game_state.cash`,
**mai** `companies.cash` (la source of truth prevista dall'architettura — `auth.js` Phase 5:
"companies table is always authoritative"). Ogni transazione P2P veniva silenziosamente
cancellata dal primo `saveGame()` chiamato subito dopo dallo stesso codice client
(`p2p-market.js`/`p2p-render.js`) — upsert completo del blob `game_state` con `gameState.cash`
ancora stantio (mai decrementato localmente, perché il codice assumeva — erroneamente — che
Realtime su `companies` lo avrebbe fatto). Effetto: compratori P2P non pagavano mai davvero,
venditori/contributori perdevano l'asset senza incassare.

**Fix applicato** (`52_fix_p2p_sindacato_cash_source_of_truth.sql`, applicata al DB prod):
`_get_player_cash`/`_add_player_cash` ora operano su `companies.cash`, stesso contratto di
`rpc_sync_cash` (UPDATE atomico singolo, niente più `GREATEST(0,...)` che clampava
silenziosamente un prelievo eccessivo — ora si affida al `CHECK companies_cash_check (cash>=0)`
già esistente, fail-loud con ROLLBACK automatico dell'intera RPC, elimina anche il TOCTOU tra
check preliminare e scrittura). Aggiunto lock ordinato `FOR UPDATE ... ORDER BY user_id` su
entrambe le `companies` coinvolte in `rpc_buy_market_car` (buyer+seller),
`rpc_buy_company_shares` (buyer+issuer), `rpc_daily_dividends` (holder+issuer per iterazione) —
prima non c'era, rischio deadlock reale con transazioni P2P incrociate concorrenti. Le altre 6 RPC
(`rpc_contribute_holding_treasury`, `rpc_list_company_ipo`, `rpc_sell_company_shares`,
`rpc_contribute_consorzio`, `rpc_pay_don_carmine`, `rpc_gdf_inspection_check`) non richiedevano
modifiche — toccano un solo utente, puntano automaticamente al fix tramite gli helper.
`saveSystem.js` **non toccato** (non serviva): una volta che `gameState.cash` converge
correttamente via Realtime su `companies`, il prossimo autosave scrive comunque il valore giusto.

**Verificato con un test end-to-end reale** (2 utenti auth temporanei, creati e poi eliminati):
buyer con €100.000 compra un'auto P2P da seller con €50.000 a €20.000 → dopo la RPC,
`companies.cash`: buyer=€80.000, seller=€69.000 (netto dopo fee 5%) — **corretto**; `game_saves.cash`
resta invariato (snapshot stantio, atteso — verrà aggiornato dal prossimo `saveGame()` una volta
che `gameState.cash` converge via Realtime). `market_listings` correttamente ripulita. Dati di test
rimossi subito dopo.

**Audit economia (FASE 7, prima area) — 65 RPC che toccano cash/driver_coins/vtk mappate dallo
schema reale, ~30 con prezzo/importo dal client analizzate in dettaglio.**

🔴 **HIGH trovato e fixato**: `rpc_nemesis_fund_rival` (`17_executive_club.sql` +
`nemesis.js:69-98`) generava cash dal nulla (fino a €50.000, rate-limit 5/ora esistente =
fino a €250.000/ora) verso **qualsiasi** `user_id` passato dal client — il sistema "Nemesis" è
puramente narrativo lato client (il rivale è scelto a caso dalla leaderboard, zero tabelle
`%nemesis%` nello schema per tracciare una relazione reale), la RPC si fidava ciecamente del
target. Sfruttabile anche per trasferire fondi tra account multipli dello stesso giocatore. **Fix
applicato** (`53_revoke_nemesis_fund_rival_no_server_tracking.sql`): REVOKE dell'accesso diretto
client — il client gestisce già l'RPC in un `try/catch` silenzioso, nessuna regressione visibile,
l'evento narrativo smette solo di attivarsi. Il resto del sistema Nemesis (`rpc_nemesis_bribe_vip`,
che addebita solo il chiamante) resta attivo. **Fix vero rimandato** (decisione di design, non
implementata): tabella `nemesis_events` server-side per tracciare la relazione reale prima di
riattivare il pagamento.

🟡 **MEDIUM, pattern già noto (Gruppo 3 in questo stesso file), confermato ancora presente, non
toccato**: `rpc_buy_auto_rest`, `rpc_buy_energy_refill`, `rpc_buy_fleet_repair`,
`rpc_buy_vip_contact`, `rpc_upgrade_offline_limit`, `rpc_buy_hr_automation`, `rpc_buy_investment`
— il costo è dichiarato interamente dal client, mai confrontato a un listino server-side (non
genera valuta dal nulla, limitato dal saldo posseduto, ma permette di pagare quasi nulla per il
beneficio). Fix vero = portare i listini lato server, task ampio, fuori scope per un fix isolato.

✅ **Verificate senza problemi** (falsi positivi del grep automatico usato per la triage, o già
hardenizzate in sessioni precedenti): `rpc_add_driver_coins` (cap 1M + rate-limit già presenti),
`rpc_buy_crypto`, `rpc_deposit_offshore`, `rpc_upgrade_shadow_defense` (già hardenizzata),
`rpc_nemesis_bribe_vip`, `rpc_pay_fuel_levy` (il `GREATEST(10,...)` neutralizza input negativi),
`rpc_place_auction_bid` (già protetta con cap €100M + flag cheat + rate-limit 10s).

**Audit STATO (FASE 7, seconda area) — gameState/ServerState/save-load/login/logout/reload/
Realtime letti per intero.** Nessun nuovo bug critico oltre al fix cash di questa stessa sessione:
boot sequence (`auth.js` Phase 1-6) solida e self-healing (`_ensureCompany`), delta-sync Realtime
(`_onCompanyChange`, "BUG 4 fix") corretto, debounce cloud-save con coda già gestisce il caso
"salvataggio scartato in finestra" (fix precedente "stabilizzazione 10 agosto"). Il pattern
sistemico "RPC → non toccare gameState localmente, fidati di Realtime" ora funziona correttamente
anche per le RPC P2P/Sindacato grazie al fix di oggi.

🟢 **LOW, solo igiene dati, non toccato**: `resetGame()` (`auth.js:362-394`) cancella `game_saves`
e azzera `companies.cash`, ma non ripulisce `vehicles`/`drivers`/`active_trips`/`company_loans`
collegati alla company esistente — restano righe orfane lato server dopo ogni reset in gioco (uso
normale, non il reset DB di test fatto oggi). Verificato che NON gonfia il "Punteggio Potere" in
classifica (si basa su `gameState.fleet.length` dichiarato dal client via `leaderboard.fleet_count`,
non sul conteggio server) — nessun impatto di gioco concreto trovato finora.

**Audit FRONTEND (FASE 7, terza area) — bottoni morti.** Estratti tutti i nomi funzione
referenziati da `ceAct(...)` (230) e da `data-ce-act="..."` letterale (21) su tutto il repo,
verificata l'esistenza di una definizione per ciascuno. **Zero bottoni morti trovati** — tutti i
riferimenti risolvono a una funzione reale.

**Audit SIMULAZIONE (FASE 7, quarta area) — 🔴 CRITICAL trovato e fixato: `processDailyRoutines`
sincronizzava il cash solo a metà funzione.** File: `engine-daily.js`. La funzione chiamava
`ServerState.syncCash(gameState.cash)` **una sola volta**, a riga 424, subito dopo
`gameState.cash += (income - expenses)`. Da lì in poi (altre ~550 righe, fino alla chiusura della
funzione) continua a mutare `gameState.cash` direttamente per: multe scadute auto-pagate, upkeep
giornaliero investimenti, bonus fedeltà autisti (30/60/90gg), entrate Venture Capital, entrate
Meet & Greet, tassa annuale sui profitti, rata mensile prestiti, bonus streak Classic Vacations,
incasso Hub Tax, vendita auto NPC sul marketplace, dividendi holding subsidiarie, dividendi IPO
NPC — **nessuna di queste risincronizzava**. Stesso meccanismo del bug cash P2P fixato oggi
(`companies.cash` server resta stantio, `auth.js` Phase 5 lo sovrascrive su `gameState.cash` al
prossimo login, cancellando silenziosamente tutto il delta) ma qui molto più pervasivo: si attiva
**ogni giorno di gioco, per ogni giocatore**, non solo su azioni P2P opzionali. Il test esistente
(`test/daily/daily-tick.test.js`) non lo copriva — nello scenario minimo di test (`inv_carwash`,
senza upkeep/prestiti/multe attivi) il gap non si manifestava mai, quindi passava comunque.

**Fix applicato**: aggiunto un secondo `ServerState.syncCash(gameState.cash)` alla fine della
funzione (dopo il blocco "daily summary toast", prima delle 4 chiamate fire-and-forget finali
`_sindacatoGdfDailyCheck`/`_b2bDailyTick`/`_tourismDailyTick`/`_hqDailyTick` — verificate a parte,
pulite: le prime due usano RPC dedicate che scrivono già `companies.cash` correttamente, l'ultima
non tocca cash). `rpc_sync_cash` fa un SET assoluto quindi due chiamate in sequenza non causano
doppio conteggio. Cache-bust `engine-daily.js` v12→v13 in `index.html`.

**Test aggiunto** (`test/daily/daily-tick.test.js`): nuovo caso con `inv_fuel_depot`
(`dailyUpkeep:500`, mutazione DOPO il primo sync) che verifica ≥2 chiamate a `syncCash` e che
l'ultimo valore sincronizzato includa l'upkeep. **Verificato che il test fallisce senza il fix**
(`git stash` sul file sorgente, rieseguito: `trovate 1 chiamate` invece di ≥2) — non è un falso
positivo. Suite completa: **65/65 pass**, nessuna regressione.

**Non ancora fatto**: resto della FASE 7-10 (backend/RPC rimanenti oltre l'economia, service
worker, test coverage generale) — scope ancora ampio, da affrontare area per area.

### ✅ 10 agosto 2026 (continuazione) — BLOCCO 1 completato, branch `auto/stabilization-blocco1`
Core + Save/Load + Economy tutti `PASS` (checklist completa in `docs/STABILITY_CHECKLIST.md`).
Suite: **49/49 pass** (36 pre-esistenti + 7 loans + 5 daily-reward, in `test/economy/`). Golden
path reale in browser (account di test usa-e-getta, poi eliminato): New Game → First Day → guida
manuale → login streak → assunzione → 2 prestiti → acquisto veicolo → save → reload → logout →
re-login. Tutti gli step coerenti.

**4 bug reali trovati e fixati** (nessuno noto prima, tutti emersi dal golden path/scrittura test):
1. **`takeLoan` non validava la SOMMA dei prestiti attivi contro il fido** — due prestiti
   singolarmente sotto il fido potevano superarlo insieme (es. fido 100k: 90k + 50k = 140k
   accettati). `engine-finance.js`.
2. **`takeLoan`/`repayLoan` non sincronizzavano mai il cash col server** — riprodotto dal vivo:
   dopo un prestito, `rpc_buy_vehicle` rifiutava un acquisto legittimo con "fondi insufficienti"
   perché `companies.cash` (server-authoritative) non aveva mai visto l'accredito, pur mostrando
   il client un saldo abbondante. Fix: `ServerState.syncCash()` dopo la mutazione locale, stesso
   pattern di `executeManualDrive`/`newGamePlus`. `engine-finance.js`.
3. **Stesso problema per la ricompensa login streak** (`_checkDailyReward`) — cash sommato solo
   in locale. Stesso fix. `engine-daily.js`.
4. **`_cloudSaveSlot` scartava (non accodava) i salvataggi entro 4s l'uno dall'altro** — riprodotto
   dal vivo: prestito preso, reload entro 4s → il prestito e il suo accredito sparivano senza
   alcun errore visibile. Fix: salvataggio "di coda" schedulato a fine finestra invece dello
   scarto (limite residuo: un reload/chiusura ENTRO la finestra di coda può ancora perdere
   l'ultima azione — non eliminabile senza toccare `beforeunload`, fuori scope). `saveSystem.js`.

**`DESIGN_DECISION_REQUIRED` nuova**: `takeLoan`/`repayLoan` continuano a non chiamare le RPC
dedicate `rpc_take_loan`/`rpc_repay_loan` (indurite il 9 agosto, mai collegate). La RPC ha un
modello di ammortamento (`daily_payment`, mai implementato lato client) — serve una decisione
(adottarlo o abbandonarlo) prima di collegare per intero, altrimenti si rischia una doppia
contabilità cliente/server. Vedi `docs/STABILITY_CHECKLIST.md` per il dettaglio.

**PR**: [#20](https://github.com/Normally101/ncc/pull/20) aperta, **non mergiata**. Include anche
il merge del fix giorno-di-gioco (PR #18) per testare tutto insieme — PR #18 resta aperta
separatamente per la review, questo branch la incorpora solo ai fini del test.

**PROBLEMI ANCORA APERTI**: BLOCCO 2-5 non ancora iniziati (tutti `NOT TESTED` in
`docs/STABILITY_CHECKLIST.md`). Nessun nuovo Critical FAIL aperto in Core/Save-Load/Economy.

---

### ✅ 10 agosto 2026 — Prima suite di test eseguibile, branch `auto/qa-test-suite`
Su istruzione diretta di Vlad: trasformare `docs/QA_PLAN.md` da documento teorico a test
eseguibili con `npm test`. Branch nuovo (basato su `auto/functional-bugs-critical`, che contiene
i fix di cui questi test verificano la regressione — vedi PR collegate sotto), non su main.

**TEST — risultato**: `npm test` → **36 PASS / 0 FAIL / 0 SKIP** (10 file, incluso
`contracts/corporate-bid` aggiunto in un secondo passaggio — regressione sul bug "denaro
duplicabile nei bandi corporate" del 6 agosto). Dettaglio completo,
harness e cosa NON è coperto: vedi `docs/QA_PLAN.md` → "✅ Stato implementazione".

## BUG REALI TROVATI (scrivendo la suite)

**1 bug, in una fix di poche ore prima nella stessa sessione (non nel gioco pre-esistente):**
- **Sistema**: economia / `rpc_sync_cash` (Supabase).
- **Causa**: il cap sul delta applicato la mattina stessa (mitigazione anti-exploit) era
  simmetrico (±€60M) — un New Game+ legittimo da un cash molto alto genera un decremento
  enorme, che il cap rifiutava, ricreando la stessa divergenza client/server che la fix voleva
  chiudere.
- **Fix**: `50_fix_sync_cash_asymmetric_delta.sql` — cap solo sugli incrementi (unica direzione
  sfruttabile), decrementi liberi (già limitati dal `CHECK (cash >= 0)` di tabella).
- **Test che lo riproduce**: `test/progression/new-game-plus.test.js` → "REGRESSIONE: newGamePlus
  manda il nuovo cash al server" (avrebbe fallito con il cap simmetrico: `syncCash` sarebbe stata
  rifiutata dal DB).
- **Test che dimostra la correzione**: stesso file, passa; più 4 assert diretti contro il DB reale
  in transazione con rollback (vedi entry precedente, stessa sessione).

Nessun ALTRO bug di gioco nuovo trovato in questo giro — gli altri fallimenti incontrati scrivendo
i test erano difetti dell'ambiente di test stesso (sequenza corretta apri-tab-poi-seleziona-auto
per lo showroom, campi mancanti nei fixture minimi, uno stub `document` troppo semplice sostituito
con `jsdom` reale), non del gioco.

## PROBLEMI ANCORA APERTI

- **Contracts/B2B/Tourism/Aste**: zero test — priorità più bassa nell'ordine richiesto, non
  ancora affrontato. `FIX_LATER`.
- **Livello 4 (E2E reale in browser)**: `NON VERIFICATO` — richiede Playwright + Supabase di
  staging, resta un lavoro solo tuo (vedi `docs/QA_PLAN.md` Livello 4).
- **`hq.js::hqUpgradeRoom`**: ancora `DESIGN_DECISION_REQUIRED` (vedi entry precedente) — non
  toccato, nessun test scritto per lo stesso motivo (non testabile finché non è server-authoritative).

## DECISIONI CHE SERVONO A VLAD

Nessuna nuova rispetto a quelle già segnalate nell'entry precedente (`hq.js` + review/merge dei
branch `auto/functional-bugs-critical` e `auto/qa-test-suite`, quest'ultimo basato sul primo).

---

### ✅ 9 agosto 2026 (continuazione, stesso giorno) — 5 bug funzionali critici, branch `auto/functional-bugs-critical`
Su istruzione diretta di Vlad ("chiudi concretamente i problemi, partendo dalla sicurezza SQL
— poi bug che alterano permanentemente stato/economia"). La sicurezza SQL (sotto) era già
chiusa nella prima parte della stessa sessione; qui backlog funzionale da `docs/SYSTEMS.md`/
`docs/QA_PLAN.md`, verificato leggendo il codice reale (non fidandosi del solo riassunto),
fixato, testato con script standalone (VM + mock, il progetto non ha ancora `node --test`
configurato — `docs/QA_PLAN.md` Fase 2), committato **su branch, non su main** (`git push -u
origin auto/functional-bugs-critical`, **non mergiato — merge/review a Vlad**).

**FIX APPLICATI:**

| Problema | File/RPC | Modifica | Commit | Test |
|---|---|---|---|---|
| New Game+ non sync col server — un relogin poteva far tornare il cash al valore pre-reset | `engine.js` (`newGamePlus`, `sellCompanyNGP`) | Aggiunta `ServerState.syncCash()` dopo il reset, stesso pattern guardato usato altrove | c76beda | Letto il codice, pattern verificato identico ad altri call-site esistenti |
| ⚠️ **Trovato mentre testavo il fix sopra**: il cap sul delta di `rpc_sync_cash` (di poco prima, nella stessa sessione) era simmetrico e avrebbe rifiutato un New Game+ legittimo da un cash alto | `rpc_sync_cash` (Supabase) | Cap solo sugli INCREMENTI (unica direzione sfruttabile); i decrementi restano liberi, già limitati dal `CHECK (cash >= 0)` esistente sulla tabella | c76beda (`50_fix_sync_cash_asymmetric_delta.sql`) | 4 assert in transazione con ROLLBACK contro il DB reale: incremento enorme rifiutato, decremento enorme (simula NGP) accettato, cash negativo bloccato dal CHECK, incremento plausibile accettato |
| `fireDriver` licenziava un autista a metà corsa, lasciando `ride.driverId` orfano — l'auto tornava libera e riassegnabile mentre la vecchia corsa pagava comunque a fine corsa | `engine-drivers.js` | Blocco se `status==='busy'`, stesso guard già usato per l'Accademia | ebf2e1e | Script VM con la funzione reale + gameState mockato: 3 assert (driver busy non rimosso, driver idle rimosso, driver busy ancora nel roster) |
| Race auto-documentata: reward Driver Coins poteva sparire (RPC fallita, `.catch` silenzioso) mentre l'ordine restava "riscosso" per sempre | `daily-orders.js` (`claimDailyOrder`) | Rollback di claim + credito locale sul fallimento della RPC, notifica esplicita invece del catch silenzioso | a73d7fa | Script VM, mock RPC che risolve/rigetta: successo → claim mantenuto + saldo server autoritativo; fallimento → rollback completo + notifica errore |
| Golden Boy/Erede (VIP) applicavano danno/riparazione a `ride.carId` (congelato alla creazione) invece che al veicolo REALMENTE in uso, se il driver era stato riassegnato nel frattempo | `vip-clients.js` (`_vipCompleteGolden`, `_vipCompleteErede`) | Priorità esplicita a `driver.assignedCarId`, fallback a `ride.carId` | 659eefb | Script VM: driver riassegnato da auto A a B tra creazione e completamento ride — danno forzato via mock di `Math.random`, applicato correttamente a B, A intatta |
| `_hqMarker` mai rimosso da `_destroyMap()` — dichiarato `let` (locale al file) invece di `var` (diventa `window.X`), stesso pattern del bug storico `_activeTab` | `ui-map-utils.js` | `let` → `var` | e984fc9 | Script che replica la semantica reale browser (`window === global` a top-level di script tag): conferma che `var` si propaga correttamente |

**TEST — nota onesta**: tutti gli script sopra sono verifiche standalone (Node `vm` + mock),
non un test suite formale — il progetto non ha `node --test` configurato (`docs/QA_PLAN.md`
Fase 2, non ancora fatta). Ogni fix testato caricando il **file sorgente reale** (non una
riscrittura) con `gameState`/dipendenze mockate, e asserzioni sul comportamento prima/dopo.
**NON VERIFICATO**: nessun test in browser reale (Playwright/manuale) — cambi non ancora
visti girare nel gioco vero.

**SUPABASE**: solo la correzione al cap di `rpc_sync_cash` (50_, sopra) — applicata e testata
con rollback, stesso metodo della sessione precedente. Nessun'altra RPC toccata in questo giro.

**PROBLEMI ANCORA APERTI (classificati):**

- **`hq.js::hqUpgradeRoom`** — `DESIGN_DECISION_REQUIRED`. Scala `gameState.cash`
  direttamente, zero RPC, e gli effetti (`allEarningsMult`, `tipMult`, `salaryCostMult`,
  `driverXpMult`) sono moltiplicatori **globali permanenti** — un vantaggio composto su tutta
  l'economia futura, non un furto una-tantum. **Verificato**: esiste già `26_hq_buildings.sql`
  in prod (`hq_status` table + `rpc_update_hq_status`), ma è **solo una leaderboard** — accetta
  `rooms_built`/`hq_score` autodichiarati dal client senza validare né il costo pagato né i
  livelli reali. Renderlo davvero server-authoritative richiede schema nuovo (costo/livello per
  stanza tracciato server-side), stessa classe di lavoro del debito #1 economia — non un fix
  chirurgico, serve una decisione di scala/priorità da Vlad prima di procedere.
- **`global_events.js`**: `gameState.activeDynamicEvent` non viene mai azzerato a fine evento
  globale → il generatore di eventi dinamici locali resta bloccato permanentemente dopo il
  primo evento globale visto. `FIX_LATER` — non toccato in questo giro (priorità sotto ai 5
  sopra), ma è un bug di stato reale, non solo estetico.
- **Pattern sistemico "prezzo dal client mai confrontato a un listino"** su ~10 RPC
  (`rpc_buy_vehicle` incluso, verificato con l'audit SQL della prima parte di questa sessione)
  — `FIX_LATER`, stessa famiglia di `rpc_sell_vehicle` già chiuso, non ancora affrontato RPC
  per RPC.
- **`hostile_takeover.js`/`rpc_pay_majority_dividend`**: v_ride_earnings ancora arbitrario dal
  client (solo l'autorizzazione raider è stata chiusa nella prima parte della sessione) —
  `FIX_LATER`.
- Resto del backlog Gruppo 3 di `docs/SQL_LOCKDOWN_HANDOFF.md` (Driver Coins negativi su 6 RPC,
  `rpc_vote_server_decree`) — non toccato in questo giro, `FIX_LATER`.

**DECISIONI CHE SERVONO A VLAD:**
1. `hq.js` — priorità/scala per rendere l'economia HQ server-authoritative (vedi sopra),
   stesso tipo di decisione già in sospeso per il debito #1 generale.
2. Branch `auto/functional-bugs-critical` pushato ma **non mergiato** — review e merge quando
   comodo (nessun conflitto noto con main al momento del push).

---

### ✅ 10 agosto 2026 (continuazione) — Playtest E2E reale con account di test veri, branch `auto/e2e-onboarding-day-bug`
Su richiesta diretta di Vlad ("crea un account di prova, testa realmente TUTTO... l'unico modo per
avere la certezza che sia un gioco veramente senza bug"). Creati 3 account usa-e-getta reali via
Supabase Admin API (email `.invalid`, pre-confermati, MAI committati/loggati in chiaro), giocati
davvero in Chrome (chrome-devtools MCP) contro il branch `auto/qa-test-suite` servito in locale
(`http.server` + Supabase di **produzione**, non esiste uno staging separato per questo progetto).
Tutti e 3 gli account e ogni riga associata (companies/game_saves/leaderboard/push_subscriptions)
**eliminati a fine sessione** — verificato con query di conteggio a zero su tutte le tabelle toccate.

**BUG REALE #1 (il più importante trovato in questa sessione) — giorno di gioco non sincronizzato
al primissimo avvio, riproducibile su OGNI nuovo account:**
- **Sintomo**: al login di un account appena creato, console mostra `[ServerState] RPC
  rpc_sync_cash fallita: ... violates check constraint "companies_cash_check"`. Riprodotto
  identico su 3 account diversi.
- **Causa**: `initGame(fresh=true)` non inizializza `gameState.day/hour/minute/month`. Il primo
  tick di `gameLoop()` (600ms dopo l'avvio) risincronizza forzatamente `gameState.day` al giorno
  reale del server (`engine.js` riga ~981) — la differenza rispetto al default del template viene
  letta come "è passato un giorno" e fa scattare un `processDailyRoutines()` non voluto
  (interessi debito Vittorio, tick B2B/tourism, ispezione GdF) sulla primissima sessione di ogni
  nuovo giocatore, prima che abbia fatto qualunque cosa. **Invisibile ai 36 test unitari per
  costruzione**: `freshEnv()` ferma gli interval subito dopo `initGame`, quindi `gameLoop()` non
  parte mai nei test — solo un vero playtest in browser poteva trovarlo.
- **Fix**: pre-sync di day/hour/minute/month in `initGame(fresh)`, stesso pattern già corretto nel
  ramo returning-player 3 righe sotto. `engine.js` (commit su `auto/e2e-onboarding-day-bug`, PR
  [#18](https://github.com/Normally101/ncc/pull/18), non mergiata).
- **Verificato**: bug riprodotto E poi confermato chiuso sullo stesso identico flusso con un 3°
  account pulito (nessun errore, debito Vittorio resta esattamente a €500, nessun interesse
  spurio). Suite 36/36 invariata.

**BUG REALE #2 — tabella `provinces` vuota in produzione (0 righe), sistema "Conquista i
Territori" completamente non funzionante per chiunque:**
- Ogni corsa completata in una città mappata prova ad accreditare influenza territoriale
  (`rpc_add_province_influence`) → falliva sempre con "Provincia non trovata" perché la tabella
  `provinces` non aveva MAI ricevuto il seed (stesso identico pattern del VTK Shop del 6 agosto:
  migration scritta, mai applicata). Il client referenzia **23** province (`_POI_TO_PROVINCE` in
  `engine.js`), la migration `09_provinces_realestate_fuel.sql` ne definisce solo **5** (Roma,
  Milano, Firenze, Napoli, Venezia).
- **Fix applicato**: seed delle 5 province già progettate nella migration esistente (nessun dato
  inventato — valori presi identici dal file committato). Verificato: `rpc_add_province_influence`
  ora funziona per queste 5.
- **APERTO — decisione per Vlad**: le altre **18** province (Torino, Trieste, Trento, Perugia,
  Aosta, Bologna, Genova, Como, Padova, Bari, Palermo, Cagliari, Taormina, Amalfi, Cervo,
  Cortina, Civitavecchia, Egnazia) non hanno `base_price`/`region_id` progettati da nessuna parte
  nel repo — servono valori di bilanciamento reali, non inventabili da me. `DESIGN_DECISION_REQUIRED`.

**SQL — PR #17 (Driver Coins costo negativo) applicata e chiusa:** le 6 RPC (`rpc_upgrade_offline_
limit`, `rpc_buy_auto_rest`, `rpc_buy_energy_refill`, `rpc_buy_fleet_repair`, `rpc_buy_vip_contact`,
`rpc_buy_hr_automation` — trovate dalla routine cloud in autonomia durante questa stessa giornata,
PR aperta indipendentemente da questa sessione) validavano solo il fondo insufficiente, mai il
segno del costo: un costo negativo conservava valuta premium arbitraria. Applicata
`51_lockdown_driver_coins_negative_cost_scaffold.sql`, verificata in transazione con ROLLBACK
forzato (negativo/zero rifiutati, positivo legittimo e saldo-insufficiente invariati).

**Playtest reale eseguito e verificato** (oltre ai 2 bug sopra): guida manuale (+€15/-10%
energia), login streak (+€500 giorno 1), assunzione Ragazzo di Quartiere (eredita auto CEO come
da design), dispatch automatico corsa, **regressione `fireDriver` a metà corsa confermata dal
vivo** (driver non rimosso mentre `busy`, stesso comportamento dei test unitari ma ora osservato
contro RPC reali), **round-trip save/reload cloud confermato** (era l'unico gap esplicitamente
segnalato come "NON VERIFICATO" nella sessione QA — cash/giorno/autisti persistiti e ripristinati
esatti). Non ri-testati a schermo in questo giro (già coperti dai 36 test unitari, non
ri-verificati live per tempo): VIP-riassegnazione, daily-orders rollback, New Game+, HQ, VTK
Shop, B2B/tourism/aste.

**Anomalia investigata e classificata FALSE_POSITIVE**: 403 su `push_subscriptions` a ogni login.
Causa: `endpoint` push ha vincolo UNIQUE globale (non per-utente) e questo browser di test genera
lo stesso endpoint mock ad ogni sessione — RLS blocca correttamente l'UPDATE su una riga di un
altro utente. Non riproducibile da giocatori reali (endpoint Push API reale è univoco per
dispositivo). Nessun fix applicato.

**PROBLEMI ANCORA APERTI (oltre a quelli già in cima al file):**
- 18 province senza dati di bilanciamento — `DESIGN_DECISION_REQUIRED` (sopra).
- PR #18 (fix giorno di gioco) — pushata, **non mergiata**, review a Vlad.
- Copertura E2E reale rimane parziale: confermato il boot/auth/RPC layer end-to-end e i sistemi
  sopra, ma "ogni tasto, ogni funzione" nel senso letterale (tutti i tab, tutte le decine di
  investimenti/upgrade/eventi) NON è stato possibile in una sessione — sarebbe lavoro per più
  sessioni dedicate o un vero setup Playwright.

---

### ✅ 9 agosto 2026 — Tutte le falle SQL critiche chiuse in produzione (sessione live, VS Code)
Su richiesta diretta di Vlad ("ci stanno dei sql da fare su supabase, procedi con quello"),
proseguendo dove una sessione cloud si era fermata (vedi PR #14, `docs/SQL_LOCKDOWN_HANDOFF.md`,
ora chiusa/consumata). Applicato **direttamente al DB di produzione** via Management API
(`~/.config/ce-supabase.env` — token ruotato in questa sessione, il precedente era scaduto),
non solo scaffold scritti e lasciati in attesa. Ogni fix verificato leggendo `pg_get_functiondef`
live PRIMA di scriverlo (zero drift), e le 3 RPC nuove testate con 5 assert comportamentali
reali in transazione con `ROLLBACK` forzato (exploit rifiutati, uso legittimo accettato,
cash confermato invariato dopo — non solo "applicato senza errori").

**Gruppo 1 — scaffold già scritti, applicati oggi:**
- `45_lockdown_cash_exploits_scaffold.sql` (tutte e 4 le sezioni): REVOKE su
  `_add_player_cash`/`_get_player_cash` (cassa illimitata via devtools — **la falla più vecchia
  e più grave, ora chiusa**), + fix su `rpc_pay_majority_dividend` (autorizzazione raider
  mancante), `rpc_start_trip`/`rpc_claim_trip_reward` (tetto €200k difensivo), `rpc_claim_daily_reward`
  (IDOR su `p_user_id`).
- `46_vtk_shop_purchase_scaffold.sql`: `rpc_spend_vtk_shop_item` creata — il VTK Shop
  ricostruito il 6 agosto era **disattivo per i giocatori** (client la chiamava, RPC non
  esisteva). Ora di nuovo operativo, nessun deploy frontend necessario.
- PR #11 (`47_`/`48_`, chiusa senza merge — contenuto applicato direttamente): REVOKE su
  `rpc_resolve_auction` (aste vinte a €0), tetto costo su `rpc_execute_shadow_op` e
  `rpc_upgrade_shadow_defense` (costo negativo = accredito), rate-limit su
  `rpc_nemesis_fund_rival` (cooldown 48h era solo cosmetico lato client), `rpc_dampen_tension`
  internalizzata dentro `rpc_contribute_holding_treasury` (era invocabile da sola per azzerare
  la tensione nazionale senza contribuire cash reale), quantità negativa bloccata su
  `rpc_sell_crypto` (mint quasi gratuito). **Fix client incluso**: `p2p-market.js` aggiornato
  per il nuovo ritorno `jsonb` di `rpc_contribute_holding_treasury` — necessario, non opzionale,
  perché il REVOKE su `rpc_dampen_tension` rompeva la chiamata separata che il client faceva
  prima (finestra di rottura chiusa nello stesso commit).

**Gruppo 2 — scritte da zero in questa sessione (`49_lockdown_critical_cash_rpcs_scaffold.sql`),
le 3 falle più gravi mappate da PR #12:**
- **`rpc_sync_cash`**: era un `SET` assoluto dal client, zero validazione — il meccanismo di
  sync più usato nel gioco (daily tick, acquisti, quest, Zero-to-Hero, Vittorio). Non un cap
  assoluto basso (il catalogo reale ha acquisti legittimi in singola chiamata fino a €45M,
  Tower) — cap sul **delta** per chiamata (±€60M, derivato dal vero massimo del catalogo con
  margine) + rate-limit 30/min.
- **`rpc_sell_vehicle`**: `v_price` dal client senza nemmeno un check `>= 0`. Tetto €25M
  (derivato dal vero prezzo massimo tra i 50 veicoli del catalogo — €18M, jet privato — con
  margine per upgrade).
- **`rpc_take_loan`**: nessun tetto sul capitale, accreditato istantaneamente, il fido vero
  esisteva solo lato client (`_getCreditTier`, `engine-finance.js:151`). Portata lato server
  una versione **conservativa** della stessa formula (reputation/cash/loan-count reali,
  omessi i bonus lifestyle/achievements non verificabili server-side — quindi mai un fido più
  alto di quanto il client mostrerebbe).

**PR aggiornate:** #11 chiusa (contenuto applicato via commit diretto), #12 mergiata
(`docs/SYSTEMS.md` + `docs/QA_PLAN.md` — audit completo e piano di test, usarlo come base per
la prossima fase invece di rifarlo), #13 chiusa (XSS `seller_name`/`car.name` in P2P/VTK
Market — stesso fix applicato via commit diretto, risolto a mano il conflitto di cache-bust),
#14 chiusa (handoff consumato). **Restano aperte #9 e #10** (censimento `gameState.cash` e
audit scalabilità 10k — docs-only, non urgenti, da rivedere quando comodo).

**Non ancora fatto (Gruppo 3, priorità sotto ai fix sopra — vedi `docs/SYSTEMS.md` §9):**
`rpc_vote_server_decree` (un giocatore approva istantaneamente un decreto globale — commento
nel file stesso ammette che il server si fida del client), famiglia "Driver Coins negativi" (6
RPC: `rpc_upgrade_offline_limit`, `rpc_buy_auto_rest`, `rpc_buy_energy_refill`,
`rpc_buy_fleet_repair`, `rpc_buy_vip_contact`, `rpc_buy_hr_automation` — validano solo
`< costo`, non il segno), pattern sistemico "prezzo dal client mai confrontato a un listino"
su ~10 RPC (`rpc_buy_vehicle` incluso — verificato in questa sessione: **non** è il buon
esempio che PR #12 pensava, ha lo stesso identico problema di `rpc_sell_vehicle` prima del fix
di oggi, solo un check `>= 0`). Non verificati di persona in questa sessione — ricontrollare
prima di agire.

**⚠️ Non verificato**: nessun login reale con un account di test dopo i fix (il gioco non ha
giocatori attivi, rischio basso, ma non testato in UI). Query dirette su Postgres via
Management API sì, browser no.

### ✅ 6 agosto 2026 — 26 fix MERGIATI IN PRODUZIONE (7 PR chiuse in una volta)
Vlad ha autorizzato la routine a mergiare da sola ("puoi modificare da solo i bug che trovi,
organizzati in modo sistematico"). Mergiate e **verificate live** le PR #1, #2, #3, #4, #5,
#6, #8. Punto di rollback: **`138a791`** (`git revert` o reset a quel commit riporta tutto
allo stato pre-merge).

**Metodo usato** — merge uno alla volta, dal rischio zero al rischio reale, con uno script di
verifica rieseguito dopo ogni passo (sintassi di tutti i .js, collisioni di globali, presenza
dei `?v=` di cache-bust, CSP `worker-src`, esclusioni `.vercelignore`, boot headless senza
errori JS nuovi, e un set di asserzioni che i singoli fix siano ancora al loro posto).
I conflitti sui numeri di cache-bust sono stati risolti prendendo **il massimo per ciascun
file**, non un lato intero: prendere un lato avrebbe silenziosamente annullato il bust di un
file modificato dall'altra PR.

**Cosa è cambiato in produzione (26 bug reali):**
- **Denaro duplicabile nei bandi corporate** (`contracts.js`): il rimborso del pledge avveniva
  prima della validazione fondi e il `return` usciva senza riscalare → offri, rialzi oltre le
  tue possibilità, annulli, e ti ritrovi col doppio. Ripetibile. Più il pledge scalato due
  volte alla vittoria.
- **12 punti di doppia deduzione cassa**: il client scalava in locale dopo una RPC che aveva
  già scalato server-side, senza il guard `if (!window.ServerState?.isReady())`. Fra questi
  **l'acquisto di un veicolo** (showroom, configuratore, leasing) — su un'auto da €400k ne
  venivano scalati €800k. Poi crypto ×4, shadow ops ×2, OPA, deposito carburante, VIP.
  Su vendita crypto e prelievo offshore erano accrediti doppi, cioè denaro creato.
- **Contratti B2B inaccessibili** (`b2b.js`): i tier del catalogo (maiuscoli) venivano
  confrontati con quelli della flotta (minuscoli, altro vocabolario). Le auto VIP non
  contavano per nessun contratto; i 5 contratti su 13 che chiedono PREMIUM erano
  soddisfacibili solo con auto ultra. Più `locked_vehicles` mai salvato → il blocco veicoli,
  unico costo del contratto, non si applicava fino al reload.
- **Driver Coins persi in 6 punti**: campo sincronizzato in *overwrite* mutato solo in locale
  → il premio spariva al primo evento Realtime mentre il progresso restava consumato.
  Compresi i cosmetici di `vanity.js`, che erano di fatto **gratis**.
- Più: doppia penalità incidente, bonus fantasma tassato, driver saltato dopo burnout, tasse
  mostrate sottostimate, contatori quest che diventavano NaN, etichetta pledge turismo a €0.

⚠️ **NON verificato con login reale**: nessun test E2E è possibile dall'ambiente della
routine. Tutto è verificato per lettura del sorgente + SQL della RPC, sintassi e boot
headless. Al primo login conviene controllare a mano: acquisto di un'auto, un bando corporate
vinto, un acquisto dal VTK Shop, e il saldo Driver Coins dopo un ciclo di gioco.

### ✅ 6 agosto 2026 (stesso giorno) — VTK Shop ricostruito da zero + ultimi fix consorzi
Su tua indicazione ("puoi anche rifare lo shop da zero, non abbiamo giocatori attivi").

- **VTK Shop riscritto.** La spesa ora la fa il server (`rpc_spend_vtk_shop_item`). La novità
  che sblocca tutto: il client **rileva** se la RPC non è ancora applicata (`42883`/`PGRST202`)
  e rifiuta l'acquisto con un messaggio, senza consegnare nulla. Quindi il negozio è già
  deployato in sicurezza, non regala niente nel frattempo, e si riattiva da solo appena
  applichi `46_vtk_shop_purchase_scaffold.sql` — **nessun deploy ulteriore necessario**.
- **Rimosso un item placebo**: `slot_garage_7d` (200 VTK) scriveva due campi che nessuno nel
  repo leggeva, e per di più nel gioco non esiste un limite flotta da espandere. Si pagava
  per niente. Sostituito con `fuel_refill_full` (150 VTK), su meccanica verificata viva.
- Gli effetti ora restituiscono un esito: niente autisti stressati / deposito già pieno /
  reputazione al massimo ⇒ acquisto rifiutato **prima** di pagare, non incassato a vuoto.
- **PR #7 chiusa** (non scartata): la sua branch era ferma a prima dei 26 fix e mergiarla
  avrebbe tolto 1643 righe. I suoi due fix superstiti su `alliances.js` — doppia deduzione
  cassa su fondazione/donazione e canale Realtime della chat mai chiuso — sono stati estratti
  su un branch pulito e mergiati.

C'è ora un controllo automatico che verifica che il catalogo prezzi del client e quello del
server restino allineati: è la prima cosa che si rompe aggiungendo un item solo da un lato.

### ✅ 6 agosto 2026 (stesso giorno) — "il numero mostrato ≠ il numero applicato": 6 casi chiusi
Filone sistematico emerso durante i merge: in sei punti l'interfaccia annunciava un valore che
il motore non usava. Non sono errori estetici — su questi numeri il giocatore decide se
comprare, se rischiare, se aspettare. Tutti mergiati e verificati live.

1. **Surge pricing fantasma** (`ui-marketing.js`, `engine.js` topbar). Veniva annunciato un
   secondo scaglione "+35% sopra le 15 corse in coda". Non esiste: `engine-rides.js:94` ha un
   solo scaglione, `pending >= 8 ? 1.15 : 1.0`. Con la coda piena si leggeva più del doppio di
   quanto si incassava, e la strategia "aspetto di arrivare a 15" era basata sul nulla.
2. **Banner "Sfida Settimanale"** (`ui-home.js`): barra fissa al 55% e countdown fisso
   `02:22:39`, resti del mockup. Sostituito con **CEO della Settimana**, che esiste davvero
   (`engine-daily.js:794-828`): guadagni e corse della settimana, premio DC maturato,
   traguardo dei €100.000 per la Majestic CEO Edition, giorni reali alla premiazione.
3. **"Contratto del giorno — 0 / 25"** (`ui-home.js`): finto, il contatore non poteva muoversi.
   Sostituito con l'appalto B2B realmente attivo (titolo, cliente, payout/giorno, giorni fatti
   sul totale), o l'assenza di appalti detta esplicitamente.
4. **Premio streak sottostimato** (`ui-home.js`): mostrava il valore base del tier, mentre
   `engine-daily.js:1128` lo moltiplica per `1 + floor((giorno-7)/7)*0.1`. Dal 14° giorno il
   giocatore leggeva **meno** di quanto incassava.
5. **Banner bonus Ranking** (`ui-ranking.js`): compariva in base alla classifica multiplayer
   per potere, ma i bonus li assegna `_getRankPosition()`, cioè la posizione **per reputazione
   contro i rivali NPC**. Le due non coincidono quasi mai. In più elencava "premi assicurativi
   −15%", meccanica che **non esiste** (l'effetto vero è il rischio incidenti,
   `engine-rides.js:456`), e dava tutto per Top 3 mentre i POI esclusivi partono dalla 4ª/5ª.
   Corretto anche il popup gemello in `engine-daily.js:525`.
6. **Linea di credito** (`ui-investments.js`): mostrava `_getLoanInterestRate()` (tasso BCE),
   che **nessuna operazione usa**. Il tasso vero è `_getCreditTier(score).rate`, scritto in
   `loan.rate` da `takeLoan` e riapplicato ogni mese. Il tetto di €500.000 era hardcoded:
   con score BASIC il fido vero è €100.000 (i bottoni da 250k/500k venivano offerti e poi
   rifiutati), con PLATINUM è €5.000.000 (e il pannello si bloccava comunque a 500k).
7. **Rischio missioni shadow** (`ui-emails.js`): annunciava "−65% Vetri Oscurati" se **una
   qualsiasi** auto della flotta aveva l'upgrade, ma il motore lo applica solo all'auto
   assegnata all'autista (`engine-events.js:293`). Con una vetrata su venti si correva il
   rischio pieno 19 volte su 20 — su un'operazione che può costare il veicolo. Aggiunto anche
   l'effetto del Corso di Guida Sicura (85% dei controlli saltati), che è il più grande dei due
   e non era citato da nessuna parte.

**Bonus, trovato durante il lavoro:** `_activeTab` era dichiarato `let` in `engine.js`, quindi
**non compariva su `window`**. `auctions.js:353` e `crypto.js:329` leggono `window._activeTab`
per decidere se ri-renderizzare il tab aperto su evento Realtime: entrambi i guard erano
sempre falsi. Le aste giudiziarie non si aggiornavano sulle offerte degli altri giocatori e il
grafico crypto restava fermo al prezzo del primo caricamento. Passato a `var`. È esattamente il
guardrail scritto in CLAUDE.md — vale la pena rileggerlo: **globali condivise = `var`**.

Resta aperto un settimo caso che **non tocco da solo** perché è un nerf, non un bug: i payout
di `_collectEarnings` (`contracts.js`) e quattro punti di `engine-daily.js` accreditano cassa
senza passare da `income`, quindi **non vengono tassati**. Sistemarlo cambia l'equilibrio
economico: decisione tua.

### ✅ 9 agosto 2026 — DA FARE TU: FATTO (vedi entry in cima al file)
Le tre mitigazioni sotto sono state applicate al DB di produzione il 9 agosto 2026 (sessione
live in VS Code), insieme a molte altre — vedi l'entry "Tutte le falle SQL critiche chiuse in
produzione" in cima a questo file per il dettaglio completo. Lasciato per riferimento storico:
1. ~~PR #4 mergiata ma la SQL NON è applicata.~~ `45_lockdown_cash_exploits_scaffold.sql`
   applicato per intero (tutte le 4 sezioni).
2. ~~`rpc_resolve_auction`~~ — REVOKE applicata (via `47_`).
3. ~~Shadow ops (`rpc_execute_shadow_op`)~~ — tetto costo applicato, feature non spenta (via `47_`).

### ⏸️ PR #7 — l'unica NON mergiata, di proposito
`auto/bughunt-p2p-alliances` corregge l'exploit del VTK Shop, ma il suo JS chiama
`rpc_spend_vtk_shop_item`, che **in produzione non esiste**. Mergiarla romperebbe del tutto
il negozio invece di ripararlo. Applica prima `46_vtk_shop_purchase_scaffold.sql`, poi
mergia: le due cose vanno insieme.


### 🔴 30 luglio 2026 — FALLA CRITICA trovata dalla routine automatica: cassa illimitata via `_add_player_cash` (NON ANCORA FIXATA IN PROD)
La routine cloud (vedi `docs/AUTOMATION_ROUTINE.md`), su mandato esteso di Vlad ("fixa ogni
bug, 0 jailbreak, 0 problemi di sicurezza per 10k giocatori"), ha trovato e **verificato
personalmente leggendo il codice** (non solo un report di subagent) una falla attiva in
produzione: `public._add_player_cash(v_user_id, v_delta)` (`14_fix_cash_bigint_cast.sql`) è
un helper pensato per essere chiamato SOLO da altre RPC interne, ma è `GRANT`ato direttamente
a `authenticated` **senza alcun controllo che `v_user_id = auth.uid()`**. Qualsiasi giocatore
loggato può chiamare `supabase.rpc('_add_player_cash', {v_user_id: <qualsiasi UUID>, v_delta:
999999999999})` da devtools/curl e darsi (o sottrarre a chiunque) qualunque cifra. Confermato
attivo in prod: `rpc_buy_market_car`/`rpc_contribute_consorzio` (Mercato P2P e Consorzi, live)
dipendono dallo stesso file. **Vlad avvisato via notifica push con mitigazione immediata**
(2 righe REVOKE, sicure da applicare subito senza aspettare la review della PR).
- **Scaffold completo (non applicato) in PR #4** (`45_lockdown_cash_exploits_scaffold.sql`,
  branch `auto/critical-cash-exploits-scaffold`) — copre anche 2 falle correlate trovate
  nello stesso giro: `rpc_pay_majority_dividend` (zero controllo `auth.uid()`, confermato
  chiamato dal client, permette di svuotare la cassa di un bersaglio OPA nel conto del raider)
  e `rpc_claim_daily_reward` (IDOR su `p_user_id`, premio piccolo/limitato quindi non cassa
  illimitata, solo griefing). Più un quarto fix difensivo per `rpc_start_trip`/
  `rpc_claim_trip_reward` (importo/durata corsa non validati) — **non confermato se questo
  specifico path sia raggiungibile dal client attuale** (nessun call-site trovato, probabile
  residuo di una migrazione MMO abbandonata), ma comunque a rischio se la migration è
  applicata al DB, dato che resta chiamabile via API diretta.
- **Azione richiesta da Vlad:** (1) applicare SUBITO le 2 righe REVOKE (sezione 1 dello
  scaffold) — zero rischio, chiude la falla più grave in 10 secondi; (2) rivedere il resto
  della PR #4 con calma e applicare gli altri fix; (3) verificare se `01_mmo_migration.sql`/
  `16_territory_war.sql` (il path corse/trip) sono effettivamente applicati al DB prod, cosa
  che la routine non può controllare da sola (nessun accesso diretto a Supabase concesso).
### 🤖 30 luglio 2026 — Routine automatica: Tutorial action-gated (PR da rivedere, non ancora deployato)
Primo item del backlog automazione (`docs/AUTOMATION_ROUTINE.md`) fatto dalla routine cloud, branch `auto/tutorial-action-gate`. **Cosa cambia:** lo step "Assegna le Corse" del tutorial (`tutorial.js`) prima avanzava SOLO su click "Avanti", senza verificare che il giocatore avesse davvero assegnato/completato una corsa. Ora quello step ha `actionGate:'rides'`: un poll (1s) confronta `ceOnb.rides()` col valore all'apertura dello step e, se sale (= una corsa è stata DAVVERO completata, via `engine-rides.js` o `zero-to-hero.js` in survival), avanza automaticamente con un piccolo hint "✓ Avanza da solo appena lo fai davvero". **Nessun soft-lock:** il bottone "Avanti" resta sempre cliccabile manualmente — l'action-gate è un bonus di progressione, non un blocco (scelta deliberata: la routine non può fare E2E con login, quindi niente che rischi di intrappolare un giocatore reale). Bump `tutorial.js?v=11` in index.html.
- **Verificato:** `node --check` su tutti i .js del progetto (0 errori) · boot headless (http.server + chromium headless-new, senza login) → pagina carica, unico errore JS presente è **pre-esistente e non collegato**: `supabase-config.js:14` fallisce perché il CDN Supabase non è raggiungibile in questo sandbox (nessun accesso di rete esterno), non per via del mio cambio.
- **NON verificato (richiede Vlad in locale con login reale):** che il gate si attivi davvero durante un tutorial live (assegnare/completare una corsa mentre lo step è aperto → deve avanzare da solo entro ~1s dal completamento) e che non ci siano regressioni visive nel box del tutorial con l'hint aggiunto.
- PR da aprire manualmente (nessun accesso `gh`/token nel sandbox all'apertura di questo lavoro) — vedi `docs/AUTOMATION_STATE.md` per lo stato preciso.
### 🤖 30 luglio 2026 — Routine automatica: Demo idle "hai guadagnato mentre riposavi" (PR da rivedere, non ancora deployato)
Secondo item del backlog automazione (`docs/AUTOMATION_ROUTINE.md`) fatto dalla routine cloud, branch `auto/idle-offline-catchup` (aperto nella stessa finestra di lavoro di `auto/tutorial-action-gate`, PR #1, su richiesta esplicita di Vlad di sfruttare di più la sessione). **Cosa cambia:** l'offline-catchup reale (in `initGame`, ramo `!fresh`, ~riga 855: loop su `_offlineDays` che chiama `processDailyRoutines()` per ogni giorno mancato) prima mostrava solo un messaggio generico "💤 Offline per X giorni — redditi processati", senza dire quanto. Ora cattura `gameState.cash` prima del loop e mostra il **delta reale** al rientro: "hai guadagnato €X mentre riposavi" (o, se le spese hanno superato gli incassi, il costo netto). Nessuna nuova scrittura su `gameState.cash`: è solo una lettura del delta già prodotto da `processDailyRoutines()` (che sincronizza già la cassa via `ServerState.syncCash`, invariato) — coerente col guardrail "cash server-authoritative, mai scrittura diretta".
- **Pulizia collaterale:** rimossa `_processOfflineCatchup()` in `engine.js` — era **dead code** (definita ma mai chiamata da nessuna parte, verificato via grep su tutto il repo). Era un secondo calcolo di offline-catchup, divergente e più semplice (basato su `lastOnlineTimestamp` invece che sul giorno di gioco), superato dal loop `_offlineDays` in `initGame` dopo il fix "doppio offline-catchup" del 17 giugno. Tenerla in giro era fuorviante per chi cerca "il" hook di offline-catchup (compreso il backlog stesso, che la citava per nome). Nessun call-site rimosso: zero riferimenti nel codice a parte un commento storico (invariato) a riga ~1984.
- Bump `engine.js?v=21` in index.html.
- **Verificato:** `node --check` su tutti i .js del progetto (0 errori) · boot headless (http.server + chromium headless-new, senza login) → pagina carica, stesso unico errore JS pre-esistente e scollegato (`supabase-config.js:14`, CDN non raggiungibile in questo sandbox).
- **NON verificato** (richiede Vlad in locale con login reale): il messaggio di rientro con un salvataggio reale offline da ≥1 giorno (testare guadagno positivo e, se possibile, un caso con spese nette superiori agli incassi per il messaggio "ti è costato").
- PR da aprire (vedi `docs/AUTOMATION_STATE.md` per lo stato preciso — se questa entry è più recente della sezione "Log sveglie" lì, la PR potrebbe non essere ancora stata creata).

### 🤖 30 luglio 2026 — Routine automatica: Tutorial action-gated (PR #1 aperta, non ancora deployato)
Primo item del backlog automazione (`docs/AUTOMATION_ROUTINE.md`) fatto dalla routine cloud, branch `auto/tutorial-action-gate` → **PR https://github.com/Normally101/ncc/pull/1**. **Cosa cambia:** lo step "Assegna le Corse" del tutorial (`tutorial.js`) prima avanzava SOLO su click "Avanti", senza verificare che il giocatore avesse davvero assegnato/completato una corsa. Ora quello step ha `actionGate:'rides'`: un poll (1s) confronta `ceOnb.rides()` col valore all'apertura dello step e, se sale (= una corsa è stata DAVVERO completata, via `engine-rides.js` o `zero-to-hero.js` in survival), avanza automaticamente con un piccolo hint "✓ Avanza da solo appena lo fai davvero". **Nessun soft-lock:** il bottone "Avanti" resta sempre cliccabile manualmente — l'action-gate è un bonus di progressione, non un blocco (scelta deliberata: la routine non può fare E2E con login, quindi niente che rischi di intrappolare un giocatore reale). Bump `tutorial.js?v=11` in index.html.
- **Verificato:** `node --check` su tutti i .js del progetto (0 errori) · boot headless (http.server + chromium headless-new, senza login) → pagina carica, unico errore JS presente è **pre-esistente e non collegato**: `supabase-config.js:14` fallisce perché il CDN Supabase non è raggiungibile in questo sandbox (nessun accesso di rete esterno), non per via del mio cambio.
- **NON verificato** (richiede Vlad in locale con login reale): che il gate si attivi davvero durante un tutorial live (assegnare/completare una corsa mentre lo step è aperto → deve avanzare da solo entro ~1s dal completamento) e che non ci siano regressioni visive nel box del tutorial con l'hint aggiunto.
- PR aperta: https://github.com/Normally101/ncc/pull/1 — CI verde, in attesa di revisione/merge di Vlad.
### 🐛 30 luglio 2026 — Bug-hunt dispatch/corse: 2 bug reali fixati, 3 candidati investigati e scartati (routine automatica, PR da rivedere)
Terzo item concreto della missione estesa, branch `auto/bughunt-dispatch-rides`. Subagent +
**verifica personale leggendo il codice** su `engine-rides.js`/`dispatcher.js` (quest'ultimo,
nonostante il nome, non contiene logica di dispatch — solo UI/routing tab; tutta la logica
corse/autisti vive in `engine-rides.js`). 2 bug reali confermati e fixati:
1. **Doppia penalità sullo stesso incidente** (`completeRide`, riga ~591/667) — quando una
   corsa ha un incidente (no kasko), `car.condition -= 20` viene applicato SUBITO, poi il
   `conditionMult` più sotto nella stessa funzione ri-legge la condizione (ora già
   danneggiata da QUESTO stesso incidente) e applica un secondo taglio (fino a −20%) sopra
   il taglio prezzo 50% già dato per l'incidente — un incidente colpiva il guadagno due
   volte invece di una. Fix: catturata la condizione PRIMA del blocco incidente, usata
   quella (non quella post-danno) per `conditionMult`.
2. **`gameState.prestige` senza guard `|| 0`** (riga ~712) — unico punto in tutto il
   codebase (20+ altri siti, incluso uno nello stesso file 92 righe sopra) a non usare
   `(gameState.prestige || 0)` nel calcolo del tetto reputazione. Oggi dormiente
   (`prestige` è sempre inizializzato a 0), ma questo è il call-site più eseguito di tutti
   (ogni corsa completata non-deferred) — un futuro gap di migrazione save che lasciasse
   `prestige` undefined corromperebbe `gameState.reputation` a NaN per il resto della
   sessione. Fix: aggiunto `|| 0`, stesso pattern già usato ovunque nel resto del codice.
- **Investigati e SCARTATI** (bassa confidenza o non-bug reale, coerente con "non
  refactor/speculazioni" della missione): (a) un early-return in `startNextRide` per
  `engineHealth===0` che salterebbe il reset `driver.status='idle'` — reale inconsistenza
  vs. gli altri 4 early-return della stessa funzione, ma **verificato non raggiungibile
  oggi** (ogni altro punto che azzera `engineHealth` setta sempre anche `outOfService`
  nello stesso momento, che intercetta il driver prima) — non fixato, è esattamente il tipo
  di "validazione per uno scenario che non può accadere" che CLAUDE.md scoraggia; (b) un
  commento/log "+1h di blocco auto" per i ritardi che in realtà non blocca nulla (il valore
  `ride.duration` modificato non viene mai riletto) — solo testo di flavor fuorviante,
  nessun impatto di gameplay, non ritenuto abbastanza da giustificare un fix isolato; (c)
  `checkActiveTrips` non pause-aware mentre il loop di guida lo è — il subagent stesso nota
  che l'unico caso reale è al logout, materialità bassa.
- Bump `engine-rides.js?v=10`.
- **Verificato:** entrambi i bug fixati letti e confermati personalmente nel codice sorgente
  (righe esatte, non solo il report del subagent) prima di scrivere il fix. `node --check`
  su tutti i .js (0 errori). Boot headless senza login → stesso unico errore pre-esistente
  e scollegato (`supabase-config.js`).
- **NON verificato** (richiede Vlad in locale, login reale): comportamento a schermo di una
  corsa con incidente (verificare che il taglio finale sia solo il 50% del prezzo, non
  anche un ulteriore -15/-20% da conditionMult sullo stesso incidente).
### 🐛 30 luglio 2026 — Bug-hunt `engine-daily.js`: 3 bug reali trovati e fixati (routine automatica, PR da rivedere)
Secondo item concreto della missione estesa (`docs/AUTOMATION_ROUTINE.md`), branch
`auto/bughunt-economy-daily`. Audit mirato (subagent + **verifica personale leggendo il
codice**, stessa disciplina usata per l'audit RPC) su `processDailyRoutines()` — cuore del
ciclo economico giornaliero. Trovati e fixati 3 bug reali (non refactor):
1. **Bonus `inv_hotel_exclusive` (+€500/g) mai accreditato in cassa** — `income += 500` era
   scritto DOPO `gameState.cash += (income - expenses)`, quindi il bonus era un valore
   fantasma: mai pagato al giocatore, ma comunque contato in `dailyNetProfit`/
   `annualProfitTracker` (tassato per davvero alla dichiarazione annuale) e nel calcolo
   dividendi IPO NPC (`gameState.cash -= npcDividend` basato su profitto gonfiato) — un
   giocatore con questo investimento perdeva cash vera su un guadagno mai ricevuto. Fix:
   spostato `income += 500` prima del settlement cassa (stesso pattern già usato per il
   fondo pensione, che aveva il commento corretto "must be before tax calc").
2. **`_tickFatigue`: `gameState.drivers.forEach()` con `splice()` dentro il callback per il
   burnout** — classico bug di mutazione-array-durante-iterazione: quando un driver viene
   rimosso per burnout, l'array si accorcia ma `forEach` avanza comunque all'indice
   successivo, saltando il driver immediatamente dopo quello rimosso per l'intero tick
   (niente fatica/morale/riposo per lui quell'ora). Fix: itera su `[...gameState.drivers]`
   (copia), lo splice sull'originale non tocca più il cursore di iterazione.
3. **Tasse mostrate al giocatore sottostimate** — log di chiusura giornata, toast riepilogo
   e overlay "Tax" nel dispatch center mostravano solo `luxuryTax` (tassa sui veicoli),
   omettendo `profitTaxes` (tassa sul reddito, fino al 42% del reddito passivo senza
   Amministratore) — la cassa reale era già dedotta correttamente per entrambe, solo la
   cifra mostrata era sbagliata. Fix: nuovo `totalTax = luxuryTax + profitTaxes` usato in
   tutti e 3 i punti di display; rinominato il campo `_dailySummary.luxuryTax` →
   `.totalTax` (aggiornato l'unico altro riferimento, `ui-dispatch.js:158`).
- Bump `engine-daily.js?v=11`, `ui-dispatch.js?v=13`.
- **Verificato:** ogni bug letto e confermato personalmente nel codice sorgente (non solo
  fidandosi del report del subagent che ha fatto la prima scansione) prima di scrivere il
  fix. `node --check` su tutti i .js (0 errori). Boot headless senza login → stesso unico
  errore pre-esistente e scollegato (`supabase-config.js`, CDN irraggiungibile nel sandbox).
- **NON verificato** (richiede Vlad in locale con login reale/più giorni di gioco): il
  comportamento a schermo di un ciclo giornaliero completo con `inv_hotel_exclusive` attivo
  (verificare che il +€500 ora appaia davvero in cassa) e con un burnout driver in mezzo
  all'array staff (verificare che il driver successivo riceva ora il tick fatica). Nessun
  harness node scritto per questi (dipendenze pesanti da `gameState`/DOM/Supabase in
  `engine-daily.js` rendono un mock isolato poco rappresentativo — verifica di lettura del
  codice ritenuta sufficiente per la confidenza, ma il test a schermo resta il modo per
  confermarlo davvero, stessa disciplina di sempre: "non dichiarare mai verificato qualcosa
  che non hai potuto davvero eseguire").

### 🔴→✅ 23 giugno 2026 — BUG CRITICO Service Worker (i deploy NON arrivavano ai giocatori) — FIXATO
Scoperto guardando il sito LIVE in browser (non via curl): errori `ceAct is not defined` + `ceOnb...phase undefined` in produzione. **Causa:** `sw.js` era **cache-first** con `CACHE_NAME` fisso `ce-shell-v1` e `index.html` in `SHELL_ASSETS` → i giocatori di ritorno restavano su un **index.html STANTIO** (senza i `<script>` aggiunti dopo: events.js, onboarding-core.js) mentre gli altri JS caricavano codice nuovo che li referenziava. **Riprodotto** (errori live) e confermato (de-registrato SW + svuotato cache → console pulita).
- ⚠️ **Lezione operativa:** `curl` bypassa il Service Worker → le mie "verifiche deploy via curl" erano vere (il server serve i file nuovi) ma NON beccavano che i browser di ritorno restano sul cache vecchio. **Per verificare un deploy davvero: browser reale, non solo curl.** Probabilmente è il motivo per cui certi aggiornamenti "non si vedevano".
- **Fix (deployato `1b031e2`, validato live):** `sw.js` ora **network-first su HTML/CSS/JS** (il codice che cambia ad ogni deploy), cache-first solo per media/font, `CACHE_NAME`→`ce-shell-v2` (l'activate spurga la v1 stantia), `respondWith` difensivo (cache solo `res.ok`/basic, fallback offline a `/index.html`). Verificato: SW attivo live, cache v2, `ceOnb`=object, `ceAct`=function, 0 errori.

### 🔎 23 giugno 2026 — Landing logged-out: render rotto (da sistemare, NON ancora toccato)
Un visitatore NUOVO vede di fatto solo la card "Unisciti alla community/Discord" + il garage del gioco che traspare. Nel DOM il contenuto buono c'è (hero **"DOMINA LE STRADE. COSTRUISCI IL TUO IMPERO"**, "Come funziona", "Top CEO Globali", news) MA le sezioni finiscono **off-screen** (top −2687…−817) e il **gioco si carica sopra** (`#main-panel` occupa la vista, `IL FONDO DEL BARILE` survival incluso). Funnel "GIOCA/REGISTRATI" sepolto, Discord messo davanti al gioco. **DA FARE (è design → mostrare a Vlad PRIMA di deployare):** far renderizzare pulita la landing per i logged-out + funnel play-first (hero esistente in evidenza + CTA gioca + screenshot reale + Discord come prova sociale secondaria). Test in `_mockups/`, non sull'ufficiale.


### ✅ 22 giugno 2026 (sera) — Security hardening (auth + rate-limit + input caps), applicato a prod
Richiesta di Vlad ("fai tutto quello che puoi"). Audit completo + fix autonomi (tutti LIVE/verificati):
- **Auth (Supabase Management API):** `password_min_length` 6→**8** · notifica email su **cambio password** → on. *(NON toccato `require_current_password`: l'unico flusso password dell'app è il reset via email/recovery → abilitarlo rischiava di romperlo. HIBP leaked-password = solo piano **Pro**. CAPTCHA = serve chiave **hCaptcha** da Vlad → entrambi RESTANO da fare.)*
- **Rate-limit anti-loop `rpc_add_driver_coins`** (`43_ratelimit_driver_coins.sql`, applicato+verificato): 20/min su entrambi gli overload → chiude l'exploit del loop sotto-soglia (il tetto 1M di 41_* non bastava). È limite di **frequenza** (chiamata solo da store su click manuale), non di valore → coerente con "no ceiling al volo sull'economia".
- **Length caps testi liberi** (`44_text_length_caps.sql`, applicato+verificato, 9 CHECK `ce_len_*`): consorzio/alliance/holding name(80)/tag(16)/description(1000), company_name(60), chat(2000) → a livello COLONNA = copre OGNI path di scrittura (anche upsert diretto del blob). "Reject oversized payloads". Max esistenti verificati (company_name 16, resto 0) → zero falsi positivi.
- **Audit verificato:** 0 segreti hardcoded (git history pulita; `service_role` = solo nome ruolo SQL); chiavi frontend tutte pubbliche-by-design (anon `role:anon` RLS-protetta, Mapbox `pk.` URL-restricted, VAPID public); **SQLi** strutturalmente prevenuto (RPC parametrizzate, 0 SQL dinamica); **XSS** coperto (escHtml + CSP senza unsafe-inline); **RLS ri-testata dall'esterno** con anon key (game_saves/companies → `[]`, INSERT leaderboard → 42501, UPDATE companies → 0 righe). `cash_ledger` non esiste in prod = conferma che lo scaffold 42_* NON è applicato (corretto).
- **⚠️ Mito corretto (Vlad):** NO hashing HS256/SHA256 per le password — HS256 firma i JWT (non è password-hashing), SHA256 liscio è insicuro, e le password le gestisce già **Supabase con bcrypt** (fuori dalla nostra portata). Intento già soddisfatto.
- **Resta da fare (bloccato su Vlad):** chiavi hCaptcha → attivo CAPTCHA in 1 comando; piano Pro → attivo HIBP. E il debito #1 (economia server-auth, scaffold 42_* pronto, bloccato sulla scala economica).

### ✅ 22 giugno 2026 — CSP refactor DEPLOYATO in produzione (chiuso il debito `unsafe-inline`)
Ripreso il branch `security-csp-refactor` (1 commit sopra main). **Scan statico esaustivo `on*=` → trovato 1 handler inline sfuggito** in `alliances.js:137` (bottone "compra perk" della Bottega, dentro un ternario `${dis?...:...}` → saltato dal convertitore auto; la headless-senza-login NON poteva beccarlo perché la Bottega rende solo con login+consorzio). Convertito a `ceAct('_alPerk',[p.id])` + bump `alliances.js v5`. Riscan: **0 handler inline residui** ovunque (.js + index, doppi/singoli apici, tutti gli eventi). `node --check` verde, boot headless **0 violazioni CSP / 0 errori JS**. **Merge ff in `main` + push (`74fd0bd`) → Vercel deployato. Verificato LIVE:** CSP `script-src 'self' …` (niente più `unsafe-inline`) · `.sql` → 404 (no leak) · `events.js` → 200. Branch `security-csp-refactor` ora mergiato (eliminato).

**✅ Stessa sessione (22 giu) — chiusi anche onboarding + economia (i due item che restavano):**
1. **Onboarding — sorgente di verità unica (`onboarding-core.js`, NUOVO `?v=1`).** I 4 sistemi (onboarding/zero-to-hero/objective-tracker/vittorio) ricalcolavano ognuno `rides`/`prestige`/fase da `gameState` → 4 copie divergenti. Estratto `window.ceOnb {rides,prestige,veteran,phase,restricted,tabUnlock,GATES}`; i 4 ora delegano. Soglie **INVARIATE** (survival<10, restricted<25, veterano=prestige>0, gate prestige≥1 sblocca tutto) → **behavior-preserving**. Verificato headless (login assente): `ceOnb.phase()===_z2hState()`, `tabUnlock` identico, 0 errori/0 violazioni CSP. Bump onboarding v4/zero-to-hero v5/objective-tracker v4/vittorio v3. **Deployato + LIVE** (`onboarding-core.js`→200). ⚠️ **Lasciato intatto** il chain di wrapping `switchTab` (ui-sidebar→zero-to-hero→em-chrome + premium-ui/motion): è la parte fragile, riordinarlo richiede **E2E con login** (non fatto). E `EARLY_GATES` in objective-tracker resta un sotto-catalogo separato (display "prossimo traguardo", non i gate di sblocco). **DA FARE (richiede E2E login):** tutorial action-gated + demo idle "hai guadagnato mentre riposavi" (hook `_processOfflineCatchup` in engine.js).
2. **Economia server-authoritative — SCAFFOLDING (NON applicato a prod).** Chiuso il **debito #1** a livello infrastrutturale: `42_economy_ledger_scaffold.sql` (cash_ledger append-only + `rpc_earn`/`rpc_spend` validati a-delta + idempotenti + tetti per-reason server-side placeholder + trigger enforcement **commentato**) + spec/fasi in `docs/ECONOMY_SERVER_AUTH.md`. **NON girato sul DB** (i tetti e l'attivazione dipendono dalla scala economica ancora indecisa — `Decisioni Aperte #6`). Migrazione vera = fasi 1-6 nello spec (girare SQL → calibrare tetti → migrare tutte le scritture cassa alle RPC → deprecare `rpc_sync_cash` → attivare trigger → Stripe). File .sql/.md esclusi dal deploy (verificato `.sql`→404). **Prossimo passo bloccato sulla decisione di scala, non su di me.**

### 🛠️ 21 giugno 2026 — "Risolvi tutto": follow-up sicurezza + refactor CSP + onboarding/economia (da fare)
Sessione di lavoro su più fronti. **CSP refactor ora committato + deployato (vedi entry 22 giu sopra).**

**✅ FATTO e verificato (3 follow-up sicurezza minori):**
1. **XSS escape `ui-emails.js`** — 9 sink avvolti in `CE_Sec.escHtml` (subject ×2, body, signature, eventData.desc, choice text, rivalName, driverName, brokerRisk). Bump `ui-emails.js?v=12` in index.html.
2. **SRI + pin CDN** in index.html — `@supabase/supabase-js` pinnato a **2.108.2** (era range `@2`) + `integrity` sha384 + `crossorigin`; `mapbox-gl.js`/`.css` v3.6.0 + SRI (CORS Mapbox = `*`, verificato).
3. **`PUSH_CRON_SECRET`** — settato in prod sulla function `send-push` + cron `ce-send-push` (jobid 2) ora invia header `x-cron-secret`. Verificato: anon SENZA secret → **403**, cron CON secret → **200**. Sequenza no-downtime (cron aggiornato prima del secret). La function già supportava il check (riga 47).

**✅ COMPLETO (21 giu, verificato headless) — CSP: rimosso `script-src 'unsafe-inline'`** (decisione Vlad: "fallo completo"). Deployato il 22 giu (vedi entry sopra).
Refactor grande: ~486 handler inline (296 onclick nei .js + 124 in index.html + micro/altri) tutti convertiti a event-delegation. Metodo:
- **Infra: `events.js`** (NUOVO, caricato dopo security.js) — event-delegation. Helper `ceAct(fn, args[, evento])` genera `data-ce-act`/`data-ce-args` (JSON); listener delegato su document (click/change/input/submit) chiama `window[fn].apply(elemento, args)`. Micro-interazioni `this.style.transform` rimosse (coperte da CSS `button:active`).
- **Convertitore riusabile: `_mockups/convert-handlers.mjs`** (escluso dal deploy) — converte gli handler "chiamata singola sicura" (anche `window.fn(...)`, anche arg-stringa), gestisce `'${expr}'`, **rifiuta** letture DOM al click-time (`getElementById().value` → vanno a funzione nominata) e ha **self-check** (node --check post-conversione → ripristina il file se rompe la sintassi).
- **Fatto finora:** ~**230 handler convertiti automaticamente** su ~45 file (tutti `node --check` OK). **`ui-emails.js` COMPLETO** (0 handler inline: 3 funzioni nominate `setInboxTab`/`resolveEmail`/`collectBrokerEmail` + 19 SKIP convertiti via `_mockups/fix-emails.mjs`).
- **NUOVI file (da deployare):** `events.js` (delegation + `ceAct()` + helper ceRemove/ceClick/ceThen/ceSetRender/ceSetActive + listener error per `<img>`), `ce-actions.js` (funzioni nominate per DOM-read/codice-multiplo: cePlaceBid, ceCryptoTrade, ceStockAction, ceVtkSell, ceNoop, ceCloseSelf, …), `boot.js` (i 2 vecchi `<script>` inline esternalizzati: onerror banner + DOMContentLoaded + ESC handler; **non-defer** apposta). Caricati in index.html dopo security.js.
- **Convertitori (in `_mockups/`, esclusi dal deploy, riusabili):** `convert-handlers.mjs` (auto, self-check con revert), `fix-skips.mjs`, `fix-factories.mjs` (button-factory `_btn`/`it.fn` → ricevono `ceAct(...)`), `fix-index.mjs` (HTML), `fix-boot.mjs`, `bump-versions.mjs` (+1 a 93 `?v=`). 
- **RISULTATO:** 0 handler inline e 0 `<script>` inline in index.html + tutti i ~45 .js. `?v=` bumpati. **Verifica headless (http.server+chrome-devtools): 0 violazioni CSP, 0 errori JS, 132 elementi `data-ce-act`, delegation testata** (args JSON + `this`). Pattern backdrop: `closest()` "assorbe" il click interno (ceNoop) → rimpiazza stopPropagation; backdrop self-close via `ceCloseSelf`; `<a>`-azione → preventDefault nel dispatcher (rimpiazza `return false`).
- **PRIMA DEL DEPLOY:** consigliata verifica E2E con **login reale** (click sui bottoni dei vari tab) — l'headless senza login copre load+delegation ma non ogni tab. **Fuori scope** (non toccati): `support.html` e `preview-midnight.html` (pagine statiche separate, CSP propria) hanno ancora 1 handler / `<script>` inline; `style-src 'unsafe-inline'` lasciato (gli style inline nel markup sono fuori scope).

**⏳ DA FARE — Onboarding (mappato, non ancora implementato):** i 4 sistemi (`onboarding.js` gate/checklist, `zero-to-hero.js` survival/restricted, `objective-tracker.js`, `vittorio.js`; + `tutorial.js`) derivano TUTTI lo stato da `gameState.questStats.totalRides` + `gameState.prestige`, con **3 patch su `switchTab`** (ui-sidebar→zero-to-hero→em-chrome, ordine fragile) e hook su `updateUI`/`processDailyRoutines`. Piano: macchina a stati unificata (sorgente di verità unica) + tutorial action-gated + demo idle ("hai guadagnato mentre riposavi", aggancio a `_processOfflineCatchup` in engine.js).

**⏳ DA FARE — Economia debito #1 (decisione Vlad: "fai ciò che è meglio"):** scelta = **spec + scaffolding SQL** (ledger + RPC a-delta), SENZA toccare prod né i guadagni live (la scala economica resta indecisa, Decisioni Aperte #6). Non ancora iniziato.



### 🔐 17 giugno 2026 — Audit di sicurezza completo (2 subagent + checklist agentskills)
**✅ Ondata 1 (sicura) FATTA e deployata** (`bda625f`):
- **XSS (P0) chiuso** sui sink multiplayer: nome/descrizione di sindacati/consorzi + `company_name` in classifica avvolti in `CE_Sec.escHtml` (`p2p-render.js`, `ui-ranking.js`). Era un vero stored/DOM XSS (descrizione consorzio con `<img onerror>` → eseguiva nel contesto della vittima).
- **`vercel.json`** con header HTTP (HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP).
- **`slot_*.json`** esclusi dal deploy (`.vercelignore`).
- **Segreti: CLEAN** — nessuna chiave privata nel client (anon key/VAPID public/Mapbox = pubbliche per design; service-role/VAPID-private solo nelle Edge Function via env).

**🔴 DEBITO DI SICUREZZA #1 — economia client-authoritative (NON ancora risolto).**
La cassa è decisa dal client e il server la rispecchia → un giocatore tecnico può darsi soldi infiniti per **3 vie**: (1) upsert diretto del blob `game_saves` con `cash` arbitrario (`saveSystem.js:131`, letto come verità dal P2P); (2) `rpc_sync_cash(v_cash)` che SETtа `companies.cash` al valore client (`10_sync_cash.sql:20`); (3) `rpc_add_driver_coins` coniava valuta premium senza validazione — **✅ ARGINE APPLICATO (Ondata 1.5): tetto 1.000.000/chiamata su entrambi gli overload (`41_cap_driver_coins.sql`, applicata al DB prod, verificata)**; blocca il minting palese (MAX_INT) a falso-positivo zero, MA un loop sotto-soglia lo aggira → cap giornaliero/IAP resta nel progetto (B). I trigger anti-cheat su cash (`38_security_hardening.sql`) **loggano ma NON bloccano** (`RETURN NEW`) — non li tocco (vedi decisione sotto: i salti cassa legittimi sono indistinguibili).
- **DECISIONE PRESA (giu 2026):** NON applicare blocchi/ceiling al volo in prod → i guadagni legittimi (offline, contratti, late-game a magnitudine assurda) sono salti grossi indistinguibili dai cheat, e la scala economica legittima non è decisa (`Decisioni Aperte #6`). Un blocco mal tarato bloccherebbe giocatori veri.
- **FIX VERO = progetto "economia server-authoritative"** (da fare insieme alla scelta della scala economica): ledger unico, ogni guadagno via RPC validato a **delta** (non set assoluto), niente scrittura cassa dal client, `liquid_assets` derivato lato server, trigger `BEFORE` che `RAISE EXCEPTION`. Vedi vault *Anti-Cheat Economico* + *Bilanciamento Economico (spec)*.

**🔒 REQUISITO FUTURO — pagamenti reali (Stripe) [richiesta esplicita di Vlad]:** quando lo store passa a soldi veri, la sicurezza dei coin diventa CRITICA (oggi è "simulato"/gratis). **Pattern OBBLIGATORIO — il client NON accredita MAI valuta:** client apre Stripe Checkout/Payment Intent → Stripe incassa → **webhook firmato** a una Edge Function Supabase → la function (1) **verifica la firma** col signing secret, (2) è **idempotente** (event_id già processato? → tabella `processed_stripe_events`), (3) mappa **`price_id` → quantità coin LATO SERVER** (mai l'`amount` dal client), (4) accredita `companies.driver_coins` con **service-role** + logga su `coin_transactions` con lo `stripe_payment_id`. Poi **REVOCARE `rpc_add_driver_coins` da `authenticated`** (solo webhook/service-role concede coin). Gestire **refund/chargeback** (`charge.refunded` → storna/flag). Stripe secret + signing secret SOLO in env Edge Function (come VAPID/service-role oggi). **Il tetto 1M attuale (`41_*`) è uno stopgap del modello simulato → da rimuovere/sostituire con questo quando arriva Stripe.**

**Follow-up minori (sicuri, non urgenti):** XSS escape anche in `ui-emails.js` (contenuto generato dal gioco, rischio basso); SRI + versioni pinnate sui CDN (`@supabase/supabase-js@2`, Mapbox) in `index.html`; richiedere `PUSH_CRON_SECRET` nella Edge Function `send-push`; togliere `script-src 'unsafe-inline'` dalla CSP (refactor: 296 onclick inline → event delegation). Repo skill di sicurezza clonato in `~/sec-skills` (754 skill = checklist di copertura).

### ✅ 17 giugno 2026 (cont.) — Grafica z-index + Tracker Obiettivi + DEPLOY
- **DEPLOYATO** su Vercel (P0 economia/onboarding + grafica + tracker). Site 200; `40_*.sql` → 404 (no leak). Client e DB ora allineati (€0).
- **Grafica — scala z-index** coerente in `:root` (alert/backdrop/modal/cmdpalette/spotlight/takeover/toast); overlay CSS+JS migrati ai token → fine collisioni (toast sopra i modali, tutorial sotto takeover/toast, via i `99999`). Verificato in Chrome (0 errori, toast>modal).
- **Tutorial/Missioni — backbone pezzo 1: Tracker Obiettivi** (`objective-tracker.js`): barra diegetica fissa che mostra UN prossimo passo, click→naviga; additiva (legge z2h/quests/gates), nascosta in survival/per veterani. Risolve "quest invisibili" + "lasciato solo dopo SVEGLIATI". Verificato 5 scenari in Chrome.
- Audit grafica: 1 fix reale (z-index); **empty-states e overflow sovrastimati** (finance ha già il vuoto, store sono cataloghi statici; layout già responsive con più breakpoint + auto-fit) → nessuna modifica speculativa.
- **Tutorial/Missioni — backbone pezzo 4: Vittorio** (`vittorio.js`): il debito è ora meccanica reale (€500, +3%/giorno, SMS, bivio Ripaga/Più tardi/Ribalta→socio se prestige≥1); agganciato al Tracker ("Ripaga Vittorio €X") e alla schermata survival (debito vero). Verificato in Chrome (init/repay/flip/veteran/tracker/survival, 0 errori).
- **Backbone tutorial — fatto:** pezzo 1 Tracker + pezzo 4 Vittorio. **Da fare:** (2) unificare i 3 sistemi onboarding in una macchina a stati; (3) tutorial action-gated; (5) demo idle "hai guadagnato mentre riposavi".
- **🧠 Cervello Obsidian — grafo riorganizzato:** `.obsidian/graph.json` con gruppi-colore per area + filtri (nasconde canvas/base/Templates) + forze più larghe. Vault: 99 note, 0 orfane/ghost.

### ✅ 17 giugno 2026 — Fix P0 economia/onboarding (server-authoritative)
Audit del codice → 5 bug P0/P1 affrontati. Decisioni prese con Vlad: **cassa server-authoritative** · **start €0 + il Ragazzo eredita l'auto del CEO**.
- **Cassa = server-authoritative (mirror).** Ogni guadagno locale fa ora mirror via `rpc_sync_cash`: aggiunto in `zero-to-hero.js` (executeManualDrive) e `quests.js` (reward cash) — prima mutavano `gs.cash` senza avvisare il server → al bridge venivano azzerati (causa soft-lock onboarding + desync 599 vs 35150). *(Hardening futuro: sostituire il mirror con RPC a delta server-side per anti-cheat puro.)*
- **Cassa iniziale €0** riconciliata su 3 fonti: `engine.js` default + `saveSystem.js` reset + **`rpc_init_company`** (SQL `40_init_company_zero_cash.sql`, **GIÀ APPLICATA al DB prod**; ON CONFLICT non tocca le aziende esistenti). 10 guidate ×15€ = 150€, coerente col modal.
- **Anti-soft-lock:** `engine.js` fresh crea una berlina starter tier `standard` ("riscattata dal pignoramento"); `hireNeighborhoodKid` la assegna al Ragazzo → l'auto-dispatch (gameLoop) lo manda in strada da solo: idle funzionante a €0, senza comprare auto.
- **Doppio offline-catchup rimosso** (`engine.js`: `_processOfflineCatchup` era chiamato OLTRE al loop in `initGame` → redditi/spese contati 2×).
- Falso positivo audit: `assignRideToDriver` è già protetto dallo splice sincrono → non toccato.
- `node --check` OK su tutti i file. Cache-bust: engine v19, quests v11, saveSystem v10, zero-to-hero v2.
- **✅ Deployato (17 giu):** client + SQL allineati in prod (vedi entry "(cont.)" sopra). Risolto il disallineamento temporaneo SQL-live / client-vecchio.

### ✅ TEST LIVE END-TO-END (16 giugno 2026, via Chrome automation su chauffeurempire.com)
Testato sul sito vero con un account loggato (djbladestudio@gmail.com):
- **Zero-to-Hero**: survival render OK · 10 guidate manuali (+15€/-10 energia, esatti) · sleep ripristina energia · evento "SVEGLIATI, SCHIAVO" al 10° · click → Staff, tema rimosso · sidebar ridotta a **solo corse+staff** · "Ragazzo di Quartiere" assunto gratis (stat 35/30/38). **Tutto funziona.**
- **Push VAPID**: subscribe reale (endpoint FCM) → riga in `push_subscriptions` → `send-push` `{sent:1}` → **notifica ricevuta e mostrata dal SW** ("🚗 Il tuo impero ti aspetta", personalizzata con cassa). **Tutto funziona.**

**🐛 BUG TROVATO E FIXATO (solo grazie al test live): CSP bloccava il service worker.**
`worker-src` era `blob:` (solo Mapbox) → `register('sw.js')` falliva con "violates Content Security Policy" → **il push non avrebbe MAI funzionato**. Fix in `index.html`: `worker-src 'self' blob:`. Committato e deployato.

**✅ DECISIONE PRESA (17 giu 2026) — cassa iniziale:** €0 + il Ragazzo eredita l'auto del CEO (berlina starter tier `standard`). Riconciliata client+server (vedi entry "17 giugno" sopra). Il sync client-server (599 vs 35150) è risolto col modello **server-authoritative + mirror `syncCash`** su ogni guadagno locale.


### 🔔 SERVER PUSH VAPID (15 giugno 2026) — CODICE PRONTO, da deployare

Sostituito il push "finto" (solo Notification API locale + setTimeout, moriva a browser chiuso) con **Web Push VAPID reale** che funziona anche a browser chiuso. Server = Edge Function Supabase schedulata con cron.

**File toccati/nuovi (committabili):**
- `39_push_subscriptions.sql` (NUOVO, idempotente) — tabella `push_subscriptions` (endpoint/p256dh/auth/last_seen/last_notified_at) + RLS per-utente + `rpc_due_push_subscriptions(idle_h, cooldown_h, max_idle_d)` SECURITY DEFINER (solo service_role) che ritorna gli inattivi da notificare (join `companies` per nome+cassa).
- `supabase/functions/send-push/index.ts` (NUOVO) — Deno + `npm:web-push@3.6.7`. Legge i target via RPC, invia push firmate VAPID, setta `last_notified_at`, cancella endpoint 404/410. Auth opzionale via header `x-cron-secret`.
- `push-notifications.js` v2 — riscritto: ① server push (subscribe + upsert subscription su Supabase + heartbeat `last_seen` su login/ritorno tab); ② fallback locale se il server push non è disponibile (permesso negato / no VAPID / iOS non installato / subscribe fallito). SW registrato con path **relativo** (`sw.js`) → ok sia root che /ncc/.
- `config.js` v7 — aggiunta `VAPID_PUBLIC_KEY` (pubblica, ok nel repo).
- `sw.js` — `notificationclick` ora apre `notification.data.url`.
- `index.html` — bump `config.js?v=7`, `push-notifications.js?v=2`.

**Chiave VAPID pubblica (già in config.js):** `BE9VSQn6J3eKQxtTKFzoBKzGp9Bkmy8aBHkRQdQkYGmSUgdjyv62SIKsnhjs0-ZN7feMw9ed98miJdIF38QZs5c`
La **privata NON è nel repo** — generata in locale, va messa SOLO come segreto Supabase (vedi checklist). Se l'hai persa, rigenerala: serve nuova coppia (cambia anche la pubblica in config.js).

**✅ DEPLOYATO (15 giu 2026, da Claude via Supabase access token temporaneo, poi da revocare):**
1. ✅ **SQL** `39_push_subscriptions.sql` girato via Management API → `push_subscriptions` + RLS + RPC creati e verificati.
2. ✅ **Segreti** `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` settati (`supabase secrets set`, count 3). `PUSH_CRON_SECRET` NON settato (cron usa solo anon JWT).
3. ✅ **Function** `send-push` deployata (`supabase functions deploy`, project `twstjbykstaioaahfqbe`).
4. ✅ **Cron** `ce-send-push` (`0 * * * *`, active) via `pg_cron`+`pg_net`, header `Authorization: Bearer <anon>` (anon è pubblica → nessun segreto nel DB).
5. ✅ **Smoke test**: `POST /send-push` → `{"ok":true,"candidates":0,"sent":0,"expired":0}` (web-push gira nel runtime Deno, RPC+segreti OK).
   - **Resta solo il test umano:** in gioco accettare le notifiche → verificare una riga in `push_subscriptions`, poi (per vedere la notifica) mettere a mano `last_seen` a >22h fa e invocare la function.
   - 🔑 **Vlad: REVOCA l'access token `sbp_…`** usato per il deploy (Dashboard → Account → Access Tokens).

**Note tecniche:**
- "Inattivo" = `last_seen < now()-22h`, non rinotificato entro 20h, non più vecchio di 7g. Heartbeat aggiorna `last_seen` su login e a ogni ritorno alla tab.
- iOS/Safari: il web push funziona SOLO se la PWA è "Aggiungi a Home" (installata). Altrove fallback locale.
- Se `npm:web-push` desse problemi nel runtime Edge, alternativa = implementazione pura Web Crypto (aes128gcm + VAPID JWT) — non fatta perché web-push è lo standard documentato per Supabase.

### 🎮 ZERO-TO-HERO — Modalità Sopravvivenza iniziale (15 giugno 2026)

Implementata la spec `zero_to_hero_design.md` (di Gemini/antigravity). Onboarding narrativo "povero→ricco":
- **< 10 corse → SURVIVAL** ("Il fondo del barile"): la tab Corse è sostituita dalla **guida manuale** (bottone pulse-gold: −10% energia, +15€). Nessun chrome (nav/topbar/ticker/kpibar nascosti via `body.theme-survival`). Bottone "Dormi in auto" quando energia <10.
- **== 10 corse → evento "SVEGLIATI, SCHIAVO"**: overlay full-screen (copy esatta della spec) → "diventa manager" → sblocca Staff.
- **10–24 corse → nav ridotta**: visibili SOLO "Corse" e "Staff" (sidebar items `display:none` sugli altri).
- **< 25 corse → Staff in fase transitoria**: unico assumibile = **"Ragazzo di Quartiere"** (ingaggio €0, salario €40, stat mediocri). HR Automation + Accademia nascoste.
- **Veterani (prestige > 0 / NG+) → ESENTI** da tutto (scelta mia: non intrappolare chi ha già un impero — coerente con la filosofia di `onboarding.js`).

**File:** `zero-to-hero.js` (NUOVO, tutta la logica) · `ui-dispatch.js` v11 (gate in cima a `renderTabCorse`) · `ui-staff.js` v15 (recruit ridotto + HR/Accademia gated) · `style.css` (tema survival in coda) · `index.html` (script + bump).

**Globals nuove:** `_z2hState()` ('survival'|'restricted'|'free'), `_z2hRestricted()`, `_z2hApplyNav()`, `renderManualSurvivalMode()`, `executeManualDrive()`, `executeSleepInCar()`, `triggerCapitalismEvent()`, `_ceCapitalismAck()`, `hireNeighborhoodKid()`. `switchTab` ri-patchato (in survival ogni destinazione → 'corse').

**Verifica:** `node --check` su tutti i .js OK + harness logico node (10 drive→150€, evento, ack→staff, kid hire no-dup, soglie 25/veterano) → tutti i test passati.

**⚠️ DEVIAZIONI consapevoli dalla spec (e perché):**
1. **`executeSleepInCar` NON avanza `gameState.hour += 8`** → l'orologio è sincronizzato col tempo reale italiano nel `gameLoop` (sovrascriverebbe il +8h al tick dopo). Effetto reale = ripristino energia. Bottone "Dormi in auto (Recupera Energia)" (testo dalla sezione "Testi Esatti", non "(8 ore)" dello pseudo-codice).
2. **"Ragazzo di Quartiere" usa `hireNeighborhoodKid()` dedicata, non `hireDriver()`** → `hireDriver` deduce `salary×2` d'anticipo, incompatibile con l'ingaggio €0 richiesto.
3. **Aggiunte CSS oltre la spec** (hide `#top-bar`/`#news-ticker-wrap`, azzero offset `#main-panel`) per un vero full-screen; le classi della spec sono riprodotte verbatim.
4. **"uffici/bonus" (sez. 5) interpretati come HR Automation + Accademia** (gated). Lasciati visibili Ufficio Centralizzato + "CEO della Settimana" per non rischiare sbilanciamenti di layout — dimmi se vuoi nascondere anche quelli.

**✅ CASSA INIZIALE RISOLTA:** una partita NUOVA ora parte da **€0** (`initGame` ramo `if (fresh)` in engine.js v18) → 10 guidate manuali = €150, coerente col modal "Hai 150€ in tasca ora". I salvataggi esistenti NON sono toccati (caricano la loro cassa). Il default literal di `gameState` resta 35000 (usato solo come fallback prima di initGame). ⚠️ Da testare: se un confine di giorno reale scatta durante la fase survival, `processDailyRoutines` può dedurre il leasing del loaner (€40/g) → cassa negativa breve; innocuo ma da verificare a schermo.

### Cosa è successo nelle ultime sessioni
1. **FASE 3 COMPLETATA**: tutte le ~29 tab convertite da dark → **eRepublik-Modern light** (kit `.em`). Dettaglio più sotto nella sezione storica. Restano scure SOLO le overlay-flair volute (cmd-palette ⌘K, showBigEvent, tutorial, war-map log).
2. **PROGRAMMA RETENTION/SOCIAL/MONETIZZAZIONE/ANTI-CHEAT** — tutto **LIVE** (committato + deployato su `gh-pages`, verificato a schermo):

| Feature | File | Cosa fa |
|---|---|---|
| **Mondo NCC** (feed vivo) | `world-feed.js` | Feed globale sulla home: eventi REALI cross-player da `global_news` (+realtime) **fusi** con eventi NPC simulati (rivali che conquistano/comprano/OPA/scalano classifica). Presenza "● N online" (curva oraria + `_worldRealOnline` reale da ui-ranking). Esporta `renderWorldFeedHTML()`, `renderConflictHTML()` (striscia conflitto del giorno: OPA/poaching/espansione), `_worldOnline()`. |
| **Ordini del Giorno** | `daily-orders.js` | 3 task daily deterministici (reset per game-day), progresso su `questStats`/`todayEarnings`, ricompensa DC/cash/rep da ritirare. `renderDailyOrdersHTML()`, `claimDailyOrder(id)`. |
| **Energia monetizzabile** | `index.html` (`.emc-eplus`) + `engine-store.js` | "+" verde sul chip energia → `energyBoostDC()` refill istantaneo (4 DC); guard se già 100%; se senza DC → switchTab('store'). |
| **Onboarding + soft-lock** | `onboarding.js` | Tab avanzate restano in nav ma se non sbloccate `switchTab` mostra schermata "Sezione bloccata" (recuperabile, gate PRIMA dell'auto-open mappa province). Gate OR (corse>=X **o** prestige>=Y); `prestige>=1` sblocca tutto (veterani/NG+ mai bloccati). Checklist "Primi Passi" in home per i nuovi. `_tabUnlock(tab)`, `renderTabLockHTML(tab)`, `renderOnboardingHTML()`. |
| **Consorzi (alleanze)** | `alliances.js` | Tab `consorzi`: crea/sfoglia/entra · roster con ruoli (leader/officer/member) + espelli/promuovi · **tesoro condiviso + donazioni** · **chat realtime**. Su RPC Supabase. Crea/join fanno broadcast in `global_news` → compaiono nel feed Mondo NCC. |
| **Vetrina Prestigio** (vanity) | `vanity.js` | Tab `prestigio`: cosmetici in DC (stemma/colore/titolo) — puro status. Lo **stemma è prepended in `_broadcastNews`** → visibile agli altri nel feed. Applicato anche al brand topbar. |
| **Classifica anti-cheat** | `ui-ranking.js` | Rank per **Punteggio Potere** (province×100 + contributi consorzio/10k + flotta×3 + rep×20) = metriche SERVER → il cash falsificato non scala. Dedup per user_id + disambiguazione omonimi `#id`. Setta `window._worldRealOnline`. |

### ⚠️ SQL SUPABASE — stato (il frontend è già live, serve il backend)
L'utente ha **già eseguito**: (1) schema Consorzi (4 tabelle+RPC+RLS+realtime), (2) hardening (chat anti-flood + donazioni asset-bound), (3) anomaly logging (`cheat_flags`+trigger su `leaderboard`).

#### 🟡 DA ESEGUIRE: `36_alliance_perks.sql` — Bottega del Consorzio (PRONTO, scritto questa sessione)
- **File:** `36_alliance_perks.sql` (nella root). Idempotente. **L'utente deve girarlo su Supabase SQL editor.**
- **Cosa fa:** `ALTER TABLE alliances ADD perk_type/perk_until` + `rpc_activate_alliance_perk(p_perk)`.
- **Anti-cheat:** la RPC prende SOLO `p_perk`; **costo e durata sono decisi dal server** (catalog `case` in SQL) → un client non può attivare un perk a costo 1 o durata infinita. Verifica `role='leader'`, `FOR UPDATE` sul tesoro (no race su doppia spesa).
- **Catalogo perk (SQL ↔ `PERKS` in alliances.js devono restare allineati):**
  - `boost_income` — +12% guadagni corse · 48h · €50k
  - `fuel_save` — −15% prezzo carburante · 48h · €35k
  - `mega_income` — +25% guadagni corse · 24h · €120k

#### ✅ Frontend Bottega — FATTO (questa sessione), live appena l'SQL è girato
- **`alliances.js` v=2:** card "Bottega del Consorzio" nella vista membro (sotto il Tesoro). Il leader vede i bottoni di spesa (disabilitati se tesoro basso o non-leader); tutti i membri vedono il **perk attivo + countdown** ("scade tra Xg Yh").
- **Buff client-side:** `window._allyPerkMult(kind)` legge `window._allyActivePerk` (cache di `alliances.perk_type/perk_until`). Aggiornata da `window._allyRefreshPerk()` su render tab + in background (`setTimeout 5s` + `setInterval 3min`) → il buff si applica **anche fuori dalla tab Consorzi**.
- **Hook nel motore:**
  - `engine-rides.js` v=7: `_allyEarn = _allyPerkMult('earnings')` innestato nella catena `earned`.
  - `engine-fleet.js` v=7: `_allyFuelDiscount = _allyPerkMult('fuel')` innestato in `fuelDiscount` (acquisto deposito carburante).
- **Degradazione graziosa:** finché l'SQL non è girato, `al.perk_type` è `undefined` → banner "Nessun perk attivo", nessun crash; cliccare un bottone notifica errore RPC (innocuo).
- **NON ancora committato/deployato** — aspetto conferma che l'SQL sia stato girato, poi commit + push `main` e `main:gh-pages`.

### Bug fix recenti (fatti)
- **Sfondo nero in quasi tutte le tab** → causa: `#main-panel{background:#0a0c12 !important}` (style.css ~3850) copriva il cielo. Fix: `.em-shell #main-panel{background:transparent !important}`. Ora il contenuto galleggia sul cielo, i lati mostrano lo **skyline di Milano all'alba** (SVG stratificato self-hosted in `#app-body.em-shell`, e `.em-home` reso `background:transparent` per non raddoppiare).
- **Nome azienda "Chauffeur Empire" ovunque** → la topbar `.emc-bn` era hardcoded; `updateUI` ora scrive `gameState.companyName` + stemma in `.emc-bn/.emc-bm`. NB: se in-game mostra ancora il default, il nome reale non è salvato in quello slot.
- **3 righe identiche in classifica** = vecchi account di test nella tabella `leaderboard`. Fix display (dedup+`#id`); pulizia vera = `delete from leaderboard where user_id <> 'TUO_ID'` su Supabase.

### 🔒 PRIVACY + OPSEC + FONTS (11 giugno 2026)
- **Privacy policy GDPR** (`privacy.html` v1.1): titolare = **Olga Vision** (scelta utente — marchio pre-costituzione, persona fisica resta titolare reale finché non apre P.IVA; nota interna in HTML per aggiornare con ragione sociale+P.IVA al momento della costituzione). Aggiunti sub-processor reali (Mapbox, Google Fonts→poi self-hosted, GitHub Pages, jsDelivr), push notification, breach art. 33 (Garante 72h) + 34 (utente). Contatto: support@chauffeurempire.com (VERIFICARE che la casella riceva davvero).
- **Monetizzazione/fiscale**: confermato che il gioco NON ha pagamenti reali cablati (no Stripe/PayPal, no dominio pagamento in CSP). Path deciso: **lancio gratuito ora** (solo GDPR, utente come privato) → P.IVA + IVA/OSS quando si accendono i pagamenti reali (apertura Olga Vision, con commercialista). La "ritenuta d'acconto fino a 4800" NON calza con vendita digitale B2C continuativa.
- **Self-host Google Fonts**: scaricati 33 woff2 (Cinzel/Orbitron/Roboto Mono/Inter/Montserrat, latin+latin-ext) in `assets/fonts/`, generato `fonts.css`, rimosso il `<link>` Google + i preconnect, **tolto Google da CSP** (`style-src` e `font-src` ora senza fonts.googleapis/gstatic). Zero leak IP verso Google.
- **Opsec/account** (lato utente, NON automatizzabile): 2FA assente su tutti gli account, password DB attuale debole e riusata → punch-list in `SECURITY_PRELAUNCH.md`. Rimossa la password DB in chiaro da `~/.claude.json` (tolto MCP postgres rotto).
- **Nuovi artefatti**: `backup_supabase.sh` (backup DB via env var + pooler), `SECURITY_PRELAUNCH.md` (punch-list), `fonts.css` + `assets/fonts/`. Rimosso `preview-midnight.html` dal repo (orfano). Checklist generale di sicurezza in memoria globale (`security_checklist.md`).

### 🔒 SECURITY HARDENING (10 giugno 2026, sessione 2)

Audit completo su 50 punti + **test live dall'esterno con la anon key**. Esito e fix:

**RISULTATO CHIAVE — RLS è SANA (allarme critico iniziale smentito dai test reali):**
- Tutte le INSERT anonime → bloccate (`42501 violates row-level security`) su game_saves, leaderboard, provinces, cheat_flags, alliance_members, real_estate_listings, global_news.
- UPDATE anonima su leaderboard → tocca **0 righe** (policy filtra per `auth.uid()`).
- `game_saves`/`profiles` → **0 righe leggibili** dagli anonimi.
- Trigger `validate_*` cappano già liquid_assets/cash > 500M (verificato: insert da 999M respinto).
- Unica esposizione in lettura: `leaderboard` mostra gli `user_id` (UUID auth) → accettabile per classifica pubblica, scritture protette.

**FIX APPLICATI nel codice (tutti committabili subito):**
1. **#12/#35 — Leak di errori DB azzerato.** Nuovo `CE_Sec.userError(prefix, err, opts)` in `security.js`: mostra messaggi generici, logga il dettaglio solo in console; i RAISE di gioco (P0001) restano visibili. Sostituiti `error.message` in 13 file: vtk-market, infrastructure, hostile_takeover, b2b, tourism, p2p-market (`_p2pErrMsg`), crypto (`_cErr`), black_ops (`_sErr`), ui-realestate, dispatcher, war_room, ui-lifestyle, nemesis, ui-ops.
2. **#35 — `client_error_log` redatto.** `security.js` ora applica `_redact()` (JWT/email/UUID/token→placeholder) prima di loggare.
3. **#29 — `_mockups/` rimosso dal repo.** `git rm --cached` + `.gitignore` (4.5M, 22 file, anteprime reali dell'app non più servite pubblicamente). File ancora in locale.
4. **#46 — Security headers** in index.html: `<meta name="referrer" strict-origin-when-cross-origin>` + CSP estesa (`frame-ancestors 'none'`, `form-action 'self'`, `upgrade-insecure-requests`).
5. **#14 — Mapbox token RISOLTO (non più pending).** Il vecchio token era il **Default Public Token**, che Mapbox **non permette di restringere** ("Default tokens cannot be updated" — ecco perché il dashboard sembrava bloccato). Via API (sk. temporaneo, poi revocato) ho **creato un token nuovo dedicato `chauffeur-empire-web`** con `allowedUrls` = normally101.github.io / chauffeurempire.com / www. / localhost, scope read-only. `map.js` v9 ora usa il nuovo token. **Verificato dal vivo:** i tile/render danno **403 ai domini non autorizzati**, 200 ai domini reali → niente furto di quota. Endpoint di metadata (style JSON, fonts) restano 200 anche da fuori ma sono innocui senza i tile.
   - **Residuo minore:** il vecchio Default token resta non-ristretto e presente nella git history (read-only). Opzionale: ruotarlo dal dashboard Mapbox se vuoi invalidarlo del tutto. Basso rischio (non più usato dal gioco dopo il deploy di map.js v9).

**⚠️ SQL DA GIRARE — `38_security_hardening.sql` (NUOVO, idempotente):**
- `client_error_log` (mancava → il logger client falliva in 404) con RLS insert-own, zero SELECT via API.
- `security_audit_log` + trigger anti-anomalia su leaderboard (+20M/update) e game_saves (+50M cash/save) → audit trail (#42).
- `_ce_rate_limit(action,max,window)` + `rate_limit_buckets` → rate-limit server-side riutilizzabile (#28).
- Sezione 4 **COMPLETA** (non più template): hardening `rpc_award_mission_vtk`. Scoperto lo schema reale in `21_vtk_token.sql` (companies.vtk_balance/vtk_earned_today/vtk_today_reset, **cap server 500/giorno già esistente** → l'exploit "client manda 999999" era già limitato a 500/g dal server con `LEAST(amount, cap-earned)`). Due fix veri: (a) **mismatch di firma** — la funzione era `(v_mission_id, v_vtk_amount)` ma il frontend chiamava col solo `v_vtk_amount` → il sync FALLIVA in silenzio (ecco il "client is source of truth"); ora `v_mission_id` è opzionale e il sync funziona; (b) aggiunti rate-limit (30/min) + audit su importi fuori range. `quests.js` v10 ora passa `v_mission_id` e riconcilia il saldo locale con l'`awarded` autoritativo del server (cap-aware).

**Non rimossi (verificato, basso rischio):** `slot_*.json` tracciati → contengono solo game state (nessun user_id/email/token reale), tenuti per sync cross-device intenzionale.

**Bonus — bug critico trovato e fixato:** `contracts.js:380` aveva un replacement rovinato della sessione em-kit (`['',' + "'em-pill--gray'..." + ']`) → **SyntaxError** che faceva crashare l'INTERA tab Contratti. Riparato (`['','em-pill--gray',...]`). `node --check` ora passa su TUTTI i .js del progetto. Bumpato a v14.

**Versioni bumpate:** security v7, vtk-market v12, infrastructure v13, hostile_takeover v13, b2b v13, tourism v13, p2p-market v7, crypto v13, black_ops v13, ui-realestate v13, dispatcher v12, war_room v12, ui-lifestyle v12, nemesis v14, ui-ops v12, map v8, contracts v14, quests v10.

### ✅ FATTO IN QUESTA SESSIONE (10 giugno 2026)

1. **Fase 3 em-kit COMPLETATA** — migrazione completa di tutte le tab "solo-remap" al kit `.em` pieno:
   - `crypto.js` v=12 — KPI, market coin cards, offshore jurisdiction cards, trade modal dark (overlay)
   - `auctions.js` v=12 — tier badges `.em-pill`, KPIs, won banner, auction cards, bid history, bid/won modal dark
   - `hq.js` v=13 — city selector, room cards, upgrade buttons, active effects
   - `contracts.js` v=13 — 5-col kpibar, tender cards, contract cards, history table
   - `ui-politics.js` v=13, `ui-help.js` v=13, `black_ops.js` v=12, `infrastructure.js` v=12, `nemesis.js` v=13, `hostile_takeover.js` v=12 — tutti al kit pieno

2. **Streak UI visibile** — `ui-home.js` v=16: card `🔥 Streak N Giorni` con 7 dot progress (ciclo settimanale), prossimo premio, badge "Torna oggi!" o "tra Xh". Inserita tra la striscia conflitto e il grid principale.

3. **gameLoop dirty-check** — `engine.js` v=17: `updateUI()` in gameLoop ora saltato se il fingerprint `cash|energy|rep|hour|minute|weather|driverCoins|vtk|claimableQuests|pendingRides|outOfService` non è cambiato → elimina ~90% dei DOM write ogni 600ms.

### ✅ TUTTI I TODO PRINCIPALI COMPLETATI (5 giugno 2026)

1. ✅ **Bottega del Consorzio** — `alliances.js` v=2 + `36_alliance_perks.sql` (girato)
2. ✅ **Sfondo reale Milano** — `bg_milano.jpg` (vista aerea, luce dorata alba) come background. Gradient overlay cielo 5-livelli sopra. SVG rettangoli rimossi.
3. ✅ **Anti-cheat market/aste** — `37_market_anticheat.sql` (DA GIRARE su Supabase): `cheat_flags` table + `_flag_cheat` helper + `rpc_list_car_for_sale` v2 (€1k–€50M, max 5 listing) + `rpc_place_auction_bid` v2 (rate-limit 10s, cap €100M, spike flag).
4. ✅ **Mobile-first** — CSS responsive em-chrome: ≤900px nav scroll, ≤600px icons-only, ≤768px bg-attachment:scroll (iOS fix).
5. ✅ **PWA + push notifications** — `sw.js` (cache-first shell, push server, notificationclick) + `push-notifications.js` (permesso 90s post-login, notifica ritorno +22h, cancella al ritorno) + `manifest.json` (icone reali, theme#2f74c0, landscape) + `auth.js` v=7 (hook `_onAuthSuccessHooks`).

### ⚠️ SQL DA GIRARE SU SUPABASE
- **`37_market_anticheat.sql`** — anti-cheat market/aste. Idempotente.

### Prossimi step (post-lancio)
- Espansione lane: taxi/truck/water-taxi (`vehicleClass` su fleet + `requiredClass` su pendingRides)
- Server push VAPID reale (ora usa solo browser Notifications API locale)
- HQ multi-città (già strutturato in `hq.js`, serve UI per acquisto sede secondaria)

### Versioni script (giugno 2026)
Nuovi file: `world-feed.js` v2 · `daily-orders.js` v1 · `onboarding.js` v1 · `alliances.js` v1 · `vanity.js` v1.
Bumpati: `ui-home.js` v15 · `ui-ranking.js` v12 · `engine.js` v12 · `dispatcher.js` v11 · `engine-store.js` v10. `style.css`/`premium-ui.css` senza `?v=` (hard-refresh per vederli).

### Deploy (IMPORTANTE — CORRETTO il 15/06/26)
⚠️ I doc vecchi dicevano "GitHub Pages" ma è **SBAGLIATO**. Il sito pubblico **chauffeurempire.com è su VERCEL**. GitHub Pages è **disattivo** sul repo `ncc` (`/pages` API → 404); il branch `gh-pages` è **morto/inutilizzato** (ignoralo).

- **Come si deploya:** Vercel fa **auto-deploy** del repo `ncc`. **Push su `main` → deploy di Produzione** automatico (progetto Vercel `ncc`, account djblade594). Niente comandi manuali, niente `git push main:gh-pages`.
- **Sicurezza (leak chiuso 15/06):** `.vercelignore` esclude dal deploy pubblico `*.sql *.md *.py *.sh supabase/ docs/ .github/ .agents/ .claude/ _mockups/`. Restano nel repo privato (backup) ma danno **404** sul sito. **NON rimuovere `.vercelignore`** o si riapre il leak.
- **Verifica:** `curl -I https://www.chauffeurempire.com/38_security_hardening.sql` deve dare **404**; `…/index.html` deve dare **200**.

---

## 🎯 DIREZIONE ATTIVA: Redesign "eRepublik-Modern" (target bloccato dall'utente)

**CAMBIO DI ROTTA IMPORTANTE.** Il gioco abbandona lo stile *eRepublik flat DARK* e passa a uno stile **eRepublik-Modern**: tema **chiaro**, denso, con chrome a barra-risorse + nav orizzontale + **sfondo cielo/skyline ai lati**, esecuzione moderna e pulita (no glossy 2012). NON applicare più il dark-flat ai nuovi lavori.

- **Target visivo bloccato** = mockup **E4** in `_mockups/E4_erepublik_dense.html` (+ tappe E/E2/E3). Aprire quelli per vedere com'è.
- **Kit nuovo** = classi `.em*` in fondo a `style.css`, **isolate sotto `.em`** così non toccano le tab dark finché non convertite. Font: **Inter** (già caricato).

### FASE 1 — FATTA
- Home reale (`ui-home.js` → **v=9**) riscritta col kit `.em` (light, denso). Contenuto: 4 KPI + banner Sfida + "Corse in Corso" + "In coda" (pendingRides reali) + feed destro (Contratto + Notifiche da emails + sezione "Autisti" da gs.drivers). Centrato con `.em-wrap` (max-width ~1120) → margini/sfondo ai lati. Mantiene `data-countup` e `switchTab`.
- **NB contenuto vs chrome:** la Home renderizza SOLO il contenuto della scheda. Rail giocatore, Power Spin, barra risorse e nav orizzontale sono **chrome (Fase 2)**: nel gioco vero saranno il telaio globale attorno alla Home, non dentro `ui-home.js`. È per questo che l'anteprima sembra "più scarna" del mockup E4 a pagina intera.
- **Come vederla:** apri `_mockups/home_real_preview.html` (usa lo `style.css` + `ui-home.js` VERI, niente login) **oppure** ricarica il gioco con **hard-refresh** (style.css NON ha `?v=`, quindi va forzata la cache).

### FASE 2 — FATTA (2026-06-01)
Chrome globale eRepublik-Modern implementata. **Come vederla:** apri `_mockups/chrome_preview.html` (chrome reale + Home reale, no login) oppure hard-refresh del gioco.

**Cosa è stato fatto:**
- **Sfondo cielo/skyline globale**: `class="em-shell"` su `#app-body` → regola `#app-body.em-shell` in style.css (cielo gradiente + skyline SVG, `background-attachment:fixed`, `!important` per battere `.app-bg` dark). Disabilitato il dot-grid `.app-bg::before`.
- **Topbar barra-risorse** (`#top-bar` riscritta): card bianca centrata (max-width 1130) su cielo → brand, meta (breadcrumb·data·ora), chips risorse (Energia con barra, Reputazione, Driver Coins, VTK, Cash), meteo, azioni (🔍 cmd-palette, ⏻ logout). **TUTTI gli ID `tb-*` conservati** (tb-cash/rep/energy-bar/energy-text/time/date/breadcrumb/weather-icon/weather-label/surge/tc/vtk) → `updateUI` in engine.js continua a scrivere senza modifiche.
- **Nav orizzontale** (`#em-nav`, NUOVO): 6 categorie (🏠 Home · 🏢 Le mie sedi · 🛒 Business · 💹 Finanza · 👑 Potere · 🌐 Community) con **dropdown su hover** che contengono le 28 tab. Mappatura = i 5 gruppi sidebar esistenti. Click categoria → tab primaria; click voce dropdown → `switchTab`.
- **Sidebar dark NASCOSTA** (`.em-shell #sidebar-player{display:none}`) ma **DOM conservato** → cmd-palette (legge `.sidebar-item[data-tab]`), active-state e breadcrumb di ui-sidebar.js continuano a funzionare.
- **`em-chrome.js` (NUOVO, v=3)**: (a) patcha `switchTab` (sopra il patch di ui-sidebar.js) per evidenziare la categoria/voce attiva in `#em-nav`; (b) `syncChromeOffset()` misura l'altezza reale di `#em-chrome` e imposta `#main-panel.style.top` con `setProperty(...,'important')` — eseguito subito + rAF + DOMContentLoaded + load + `document.fonts.ready` + timeout + ResizeObserver.
- **Layout**: topbar+nav avvolti in un **unico wrapper fisso `#em-chrome`** (i due elementi sono `position:static` dentro). `#main-panel` ora `left:0; background:transparent`, `top` dinamico via JS (fallback inline 150px). premium-ui.css aggiornato (left:0 per main-panel/ticker/map-overlay). `#tab-container` max-width 1130. `#panel-title` reso visually-hidden **off-screen** (NON `display:none` — `innerText` su display:none ritorna '' in Chrome e romperebbe l'auto-refresh Home + il guard `if(!title)return` di dispatcher).
  - **ROOT CAUSE overlap (2026-06-01, RISOLTO):** `#main-panel` prendeva `position:fixed` SOLO dalla classe Tailwind `.fixed`. Senza Tailwind (es. nel preview) restava `position:static` → `top` ignorato → contenuto da y=0 dietro la chrome. Fix: regola **`.em-shell #main-panel{position:fixed}`** in style.css (indipendente da Tailwind) + Tailwind aggiunto al preview. **Verificato con Chrome headless** (vedi sotto).
- **Verifica visiva headless (METODO RIUTILIZZABILE):**
  ```
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
    --allow-file-access-from-files --window-size=1400,900 --force-device-scale-factor=1 \
    --virtual-time-budget=3000 --screenshot=/tmp/shot.png \
    "file://$(pwd)/_mockups/chrome_preview.html"
  ```
  Poi leggere `/tmp/shot.png`. Per misure DOM precise, iniettare uno script che scrive `getBoundingClientRect`/`getComputedStyle` in un `<div>` a video e screenshottare.

**Classi CSS chrome**: prefisso `.emc-*` (per non collidere col content-kit `.em-*` che è scoped sotto `.em`). In fondo a style.css, sezione "EM CHROME".

**NB transizione**: chrome light + Home light + 28 tab ancora dark (card #161b22 su pannello, ora su cielo). Per le tab dark il `#main-panel` è trasparente → le card dark "galleggiano" sul cielo. È lo stato di transizione atteso finché non parte la Fase 3.

### FASE 3 — IN CORSO (roll-out tab dark → light) — quasi completa (2026-06-01 sera)

**FATTO questa sessione — 25 tab convertite al light (tutte `?v=10`):**
- **Full kit `.em` (riscritte a mano + verificate via screenshot headless):**
  `ui-dispatch.js` · `ui-fleet.js` · `ui-staff.js` · `ui-finance.js` · `ui-emails.js`
  (+ `ui-home.js` già fatta in Fase 1). Usano `.em-card/.em-kpibar/.em-tbl/.em-pill/.em-gbtn/...`.
- **Remap colori + wrapper `.em em-page em-wrap` (verificate a campione):**
  `ui-ranking.js` · `ui-legal.js` · `ui-market.js` · `ui-realestate.js` · `ui-marketing.js` ·
  `ui-ops.js` (regions+provinces) · `ui-investments.js` · `b2b.js` · `tourism.js`
- **Remap colori + centratura globale (no `.em-wrap`, vedi regola CSS sotto):**
  `ui-politics.js` · `ui-help.js` · `crypto.js` · `contracts.js` · `auctions.js` ·
  `black_ops.js` · `infrastructure.js` · `nemesis.js` · `hostile_takeover.js` · `hq.js` ·
  `ui-career.js` (modal-based).

**Infrastruttura aggiunta (riutilizzabile):**
- **Nuove classi `.em-*` condivise** in fondo a `style.css` (sezione "EM kit — shared helpers for FASE 3"):
  `.em-page .em-sec .em-kpibar .em-tbl .em-ghbtn .em-goldbtn .em-redbtn .em-pill(+--green/blue/gold/red/gray/violet) .em-tabs/.em-tab .em-prog`.
- **Regola centratura globale** in `style.css` (sezione EM CHROME):
  `.em-shell #tab-container{font-family:Inter}` + `.em-shell #tab-container > *{max-width:1158px;margin-inline:auto}` + `> .em{max-width:none}`.
  → ogni tab (anche solo-remap) resta centrata nella larghezza della chrome (1130) senza wrapper per-file.
- **Classi email lightened** in `style.css`: `.inbox-tab*`, `.email-card/-body/-subject/-sender-name/-actions` ora light.
- **Script remap** (color-token dark→light) salvato in `_mockups/fase3_remap.pl` (mappa hex → palette `.em`). Uso: `perl _mockups/fase3_remap.pl < file.js > /tmp/o && mv /tmp/o file.js`. Riutilizzabile per showroom/war_room.

**⚠️ LEZIONE CRITICA (bug risolto):** le `<table>` collassano in Chrome dentro **card a metà larghezza** (grid 1fr 1fr): un `<td>` con dentro un `display:flex` o una progress-bar `flex:1` riporta min-content ~0 → la colonna si schiaccia a 24px e il testo va in overlap. **Regola:** nelle card strette usare **righe flex `.em-lrow`** (come la Home), NON `<table>`. Le tabelle a larghezza piena (card singola) vanno bene se: `.em-tbl td` ha `white-space:nowrap` (già nel kit) e le barre dentro le celle hanno **width fissa** (es. `width:52px`), mai `flex:1`. (Dispatch è stato riscritto: lista autisti ora a righe flex.)

### FASE 3 — COMPLETATA ✅ (2026-06-01 sera, sessione 2)
**TUTTE le 28 tab sono ora light.** Convertite a mano anche le 3 bespoke che mancavano:
- **`war_room.js`** (`?v=10`) — overlay fullscreen mappa province: sfondo cielo light, mare SVG `#bcd3e8`, header/sidebar/card bianche, regioni politiche colorate invariate, bordi neutri regione passati a `rgba(0,0,0,0.22)` per leggibilità su mare chiaro. Verificata via screenshot (mappa Italia OK).
- **`showroom.js`** (`?v=10`) — overlay fullscreen galleria auto + configuratore: CSS riscritto light (sfondo cielo, card bianche, pill filtri blu/viola attivi, bottoni blu, buy-btn gradiente blu). Verificata via screenshot (galleria OK).
- **`ui-store.js`** (`?v=10`) — Executive Club: ora **light-premium**. Mantiene l'**hero band scura** (gradiente, come `.em-banner` della Home) e le **art-tile scure** per pacchetto (accenti premium voluti per monetizzazione), ma tabs/pack-card/service-card/info sono light. Sfondo root → `transparent` (mostra il cielo). Verificata via screenshot.

**La transizione dark→light è finita.** Non resta nessuna tab dark.

**Extra convertiti nella stessa sessione (oltre alle 28+ tab):**
- **`ui-lifestyle.js`** (`?v=10`) — tab Lifestyle (era ancora dark, mancava dalla lista) → remap+wrap light.
- **`p2p-render.js`** (`?v=10`) — sezioni P2P market/azioni renderizzate *dentro* le tab Market e Finance → remap light (altrimenti card dark dentro tab light).
- **`ui-staff.js`** car modal + **configuratore fullscreen** (`openCarConfigurator`) → light (pannello bianco, checkbox/bottoni light, foto auto invariata). `driver_skills.js`, `map-garage.js` (garage 3D), `vtk-market.js` → remap light.

**Overlay lasciati scuri DI PROPOSITO** (flair/utility, coerenti con `.em-banner` dark della Home e hero scuro dello Store):
- `cmd-palette.js` (spotlight ⌘K), `engine.js` → `showBigEvent` (popup celebrativo) + `logToMap` (log sulla mappa Mapbox scura), `tutorial.js` (onboarding). Non sono tab; il dark qui è una scelta estetica, non debito.

### Rifinitura opzionale (non urgente)
Le tab "solo-remap" (politics, crypto, contracts, auctions, black_ops, infrastructure, nemesis, hostile_takeover, hq, help, career) sono light/centrate ma usano HTML inline invece dei componenti `.em-card/.em-pill`. Migrarle al kit pieno è solo polish estetico, non funzionale. Verifica in-game (login reale) consigliata per confermare la regola di centratura globale su strutture multi-figlio.

**Ordine storico consigliato (riferimento):**
1. `ui-dispatch.js` 2. `ui-fleet.js` 3. `ui-staff.js` 4. `ui-finance.js` 5. `ui-emails.js`, poi le restanti.

**Ricetta di conversione (per ogni `renderTab*`):**
1. Avvolgere TUTTO l'HTML in `<div class="em"><div class="em-wrap"> ... </div></div>` (la classe `.em` definisce le var `--em-*` e il font Inter; `.em-wrap` centra a max-width 1120).
2. Sostituire i colori dark inline con le classi `.em-*` (NON ridefinire i colori a mano):
   - card `#161b22`/`#0d1117` → `.em-card` (+ `.em-ch` per l'header card con `.t`/`.a`)
   - KPI strip → `.em-kpis` + `.em-kpi` (`.l` label, `.v` valore, `.s` sub)
   - righe lista/tabella → `.em-lrow` + `.em-th`/`.em-lt`/`.em-lm`/`.em-price`/`.em-bd`
   - bottoni: primario verde `.em-gbtn`, secondario `.em-bbtn`; ghost/altri → vedi palette `.em` (blue `--em-blue` #2f74c0, green #1aa06a, gold #c79a2a, red #db5746)
   - empty state → `.em-empty`; link inline → `.em-link`
   - banner scuro/hero → `.em-banner`; contratto/CTA blu → `.em-contract`; feed item → `.em-ev`/`.em-evi`/`.em-evt`/`.em-evd`
3. Tutte le classi `.em-*` sono in fondo a `style.css` (sezione "EM kit"). Se manca un componente, aggiungerlo lì con prefisso `.em-` (NON `.emc-` che è solo chrome).
4. Bump `?v=` del file in index.html.
5. Verificare con lo screenshot headless (vedi sopra) caricando il file reale — meglio creare un mini-preview tipo `_mockups/home_real_preview.html` se la tab non parte senza login.

**Riferimento target:** `_mockups/E4_erepublik_dense.html` (densità/colori) e `ui-home.js` (esempio già convertito, leggerlo come template).

**Vincoli da NON violare durante la Fase 3:**
- Mai `DS.*`. Mai classi Tailwind arbitrarie non compilate (es. `text-[9px]`, `bg-gold/5`) — solo `.em-*` o inline.
- Non toccare la chrome (`.emc-*`, `#em-chrome`, em-chrome.js) — è chiusa.
- Le mutazioni cash server-authoritative restano via RPC Supabase (invariato).

### Background
Ora è un **placeholder CSS** (skyline disegnato a rettangoli, in `.em-home` di style.css). Da sostituire con asset finale (lo creo io più ricco, oppure lo fornisce l'utente).

### Nota operativa
Verifica visiva possibile in autonomia via **Chrome headless** (comando nella sezione Fase 2 sopra) → screenshot in `/tmp` → leggerlo. Niente più dipendenza dallo "guarda tu nel browser".

---

## Ultima sessione — Analisi bug completa + polish visivo (/impeccable)

### 1. Analisi completa del codebase — codebase SANO

Scansione sistematica di tutti i 76 file JS (~47k righe). Risultati:
- ✅ 0 errori di sintassi (`node --check` su tutti i .js)
- ✅ Routing tab coerente: ogni `switchTab` punta a una `renderTab*` esistente
- ✅ 179 handler `onclick` inline → 0 funzioni orfane
- ✅ Validazione input robusta (`parseInt()||1`, guard `!amount`) — NaN non raggiunge `cash`
- ✅ Gestione errori Supabase di qualità: pattern `{data,error}` + rollback transazionale (es. p2p-market.js rimette l'auto in flotta se l'RPC fallisce)
- ✅ Timer senza leak (`_homeTimer` guard singleton, `_decreesCountdownTimer` clearato)
- ✅ Nessun marker TODO/FIXME/HACK reale

**Unico problema reale trovato e già risolto:** la Home era l'ultima superficie non migrata (vedi sotto).

### 2. ⚠️ CLAUDE.md OBSOLETO su 2 punti (da correggere)
- **`window.gameState` ORA esiste**: a `engine.js:295` c'è `Object.defineProperty(window,'gameState',{get(){return gameState}})`. Quindi `window.gameState` e `gameState` bare sono **equivalenti**. Il bug log CLAUDE.md del 2026-05-24 ("window.gameState non esiste") è superato. Gli usi in serverState.js / design-system.js / contracts.js NON sono bug.
- **I 4 file obsoleti sono già rimossi** (ui-meta.js, ui-finance-mkt.js, vip_clients.js, p2p_market.js): il TODO "git rm" nel CLAUDE.md è già fatto.

### 3. Home / Command Center — RIFATTA in eRepublik flat dark
`ui-home.js` era l'**unico** tab ancora in stile vecchio: tema light (`var(--bg)`) + glassmorphism (`.ce-glass`, blur, radius 12px). Tutti gli altri tab erano già flat dark.
- Convertita interamente a palette dark inline (#0d1117 / #161b22 / #21262d / #e6edf3) — 0 residui `var(--*)`, 0 `ce-*`, 0 colori non-token
- KPI ridisegnati in stile "terminal austero" (scelta utente): niente emoji-icona giant, label 9px mono uppercase, valore mono. Conservati: countup (`data-countup`, triggerato dal MutationObserver di motion.js), delta "vs ieri", auto-refresh 5s, tabella corse live, colonne Autisti/Notifiche, empty states
- **Bug fix:** matching notifiche era case-sensitive (`includes('multa')` non trovava "Multa") → tutte diventavano "📩 Messaggio". Ora `subj.toLowerCase()` → categorie corrette
- Verificata via screenshot (harness mock isolato, non gioco loggato)
- `ui-home.js` → **v=7**

### 4. Micro-interazioni — SISTEMATIZZATE via CSS globale
Censimento: 221 `<button>`, solo 41 con `scale(0.97)` inline (180 mancanti su ~30 file).
- Aggiunta **una regola CSS globale** in `style.css` (sezione "Buttons"): `button:active:not(:disabled){transform:scale(0.97)}` + transition. Copre tutti i bottoni (tab, modal, overlay) inclusi i futuri. Controlli Mapbox esclusi, `prefers-reduced-motion` rispettato. Gli handler inline esistenti vincono per specificità (nessun conflitto)
- `DESIGN.md` aggiornato: la micro-interazione non va più messa inline su ogni bottone
- Questo risolve anche la lacuna di Career (già flat-pulito, gli mancava solo la micro)

### 5. Loading skeleton flat
- Nuova classe `.ce-skel` in `style.css` (shimmer grigio neutro, zero neon, rispetta reduced-motion) — sostituisce la `.ds-skel` cyan-tinted (che violava il flat)
- Applicata a `ui-realestate.js` (era testo "Caricamento immobili…" → v=7) e alle righe placeholder di `ui-ranking.js` (v=8)
- Market/p2p non ha loading esplicito (rende da cache locale) → nessuno skeleton necessario
- Verificata via screenshot

### 6. A — Fix rapidi residui (FATTO)
- `logToMap` (engine.js) convertito da classi Tailwind (`border-white/5 text-[9px]`) a inline flat
- **Guard NaN su cash:** all'inizio di `gameLoop()` (engine.js), se `gameState.cash` diventa NaN/Infinity viene ripristinato l'ultimo saldo valido (`window._lastValidCash`) + notifica. Aggiunto anche `window._addCash(amt)` (utility con guard `Number.isFinite`) per il futuro
- CLAUDE.md allineato ai fatti reali: getter `window.gameState`, 4 file obsoleti già rimossi, micro-interazione ora globale via CSS
- `engine.js` → **v=9**

### 7. D — Coerenza estetica delle 3 isole di stile (FATTO)
- **showroom.js**: accento cyan neon (#00d4ff x11, #22d3ee) → blu flat #58a6ff. → **v=7**
- **war_room.js**: teal #00cccc → #58a6ff, gold-acceso #FFD700 → #d4af37, red #FF4444/#ef4444 → #f85149, green #22c55e → #3fb950. → **v=7**
- **ui-store.js**: LASCIATO premium intenzionalmente. I gradient sono sui badge funzionali (Popular/Value/New/Limited) e l'elevation serve la monetizzazione (PRODUCT.md: store = monetizzazione). Appiattirlo danneggerebbe conversione e leggibilità badge. **Decisione: non è debito, è design.**

### 8. C — Command palette (FATTO) — riduce sovraccarico 29 tab
- Nuovo file **`cmd-palette.js`** (v=1): overlay ricerca rapida sezioni, attivabile con **⌘K / Ctrl+K** o dal campo "🔍 Cerca sezione…" in cima alla sidebar
- Legge i `.sidebar-item[data-tab]` dal DOM a runtime → zero duplicazione, sempre in sync con la sidebar
- Ricerca live case-insensitive, navigazione tastiera (↑↓ Enter Esc), stile flat dark
- Verificata via screenshot

### Nessun commit fatto (non richiesto dall'utente).

---

## Stato del piano di miglioramento

Aree **A, B, C, D completate**. Resta solo, rimandata esplicitamente dall'utente al post-lancio (expansion):
- **E — Espansione contenuti:** lane taxi/truck/water-taxi (vehicleClass/requiredClass), HQ multi-città. NON iniziare finché il gioco non è lanciato — sarà introdotta come "expansion".

---

## Versioni script attuali

| File | Versione |
|---|---|
| `engine.js` | v=17 (dirty-check updateUI in gameLoop) |
| `ui-home.js` | v=16 (streak card 🔥 + dirty-check) |
| `crypto.js` | v=12 (em-kit pieno) |
| `auctions.js` | v=12 (em-kit pieno) |
| `hq.js` | v=13 (em-kit pieno) |
| `contracts.js` | v=13 (em-kit pieno) |
| `ui-politics.js` | v=13 (em-kit pieno) |
| `ui-help.js` | v=13 (em-kit pieno) |
| `black_ops.js` | v=12 (em-kit pieno) |
| `infrastructure.js` | v=12 (em-kit pieno) |
| `nemesis.js` | v=13 (em-kit pieno) |
| `hostile_takeover.js` | v=12 (em-kit pieno) |
| `ui-ranking.js` | v=12 |
| `showroom.js` | v=10 |
| `war_room.js` | v=10 |
| `cmd-palette.js` | v=1 |
| `em-chrome.js` | v=3 |

`style.css` e `DESIGN.md` modificati (style.css non ha `?v=`, è caricato senza cache-busting).

---

## Architettura critica (invariata)

```
gameState           → let in engine.js MA ora ESPOSTO come window.gameState
                      via getter (engine.js:295). I due sono equivalenti.
window.DS           → NON usare — tutti i tab sono eRepublik flat inline
?v= scripts         → bumpare in index.html ad ogni modifica JS
Micro-interazione   → ORA globale via CSS (button:active scale .97 in style.css).
                      Non serve più l'inline onmousedown su ogni bottone.
Skeleton flat       → classe .ce-skel in style.css (shimmer grigio neutro)
countup KPI         → motion.js ha un MutationObserver su #tab-container che
                      chiama _ceTriggerCountUps() ad ogni cambio contenuto
PRODUCT.md/DESIGN.md → contesto per /impeccable. Caricare il loader con
                      IMPECCABLE_CONTEXT_DIR=<project root> (altrimenti carica
                      i file della skill stessa, non quelli del gioco!)

War Room (provinces):
  - openMapOverlay() → _ensureMap() → initMap() (se map===null)
  - initMap() NON chiama più switchTab() — era il bug della sessione precedente
```

### 🎮 15 agosto 2026 — PLAYTEST COMPLETO su account nuovo (browser reale) — 3 bug CRITICAL

Prima sessione di gioco vera del progetto: account nuovo (`qa.alpha@example.com`, creato via Auth
Admin API con `email_confirm:true` perché `supabase-config.js:15` ha `redirectTo` hardcoded sulla
produzione), `python3 -m http.server 8000`, Chrome pilotato via chrome-devtools MCP, con un
collector installato via `initScript` che intercetta **ogni** chiamata `/rest/v1/rpc/` con status e
ogni errore console. Report completo: `docs/PLAYTEST_REPORT_2026-08-15.md`.

Serviva perché tutto il debugging precedente era su codice e DB, mai giocando: i 67 test Node
mockano `ServerState`, quindi lo strato RPC+Realtime reale non era mai stato esercitato.

**Esito di fondo:** il gioco non va in errore — sweep di tutti i 31 tab con **zero eccezioni JS e
zero RPC fallite**. È rotto in modi più insidiosi.

**1. [CRITICAL, FIXATO] Ogni incasso da corsa spariva al reload — il ciclo centrale.**
`engine-rides.js` incrementava `gameState.cash` alle righe 700/792/884 senza **mai** chiamare
`syncCash` (zero occorrenze nel file). Riprodotto: `game_saves.game_state.cash` = 923 ma
`companies.cash` = 650 → al boot `bridgeToGameState()` sovrascrive col server e 273 EUR spariscono.
Fix: 2 `syncCash` (fine `completeRide` per pagamento immediato + mancia Charmante; dopo il loop di
`checkActiveTrips` per i differiti, una sola RPC per passaggio). `?v=10→11`. Verificato dal vivo:
811 = 811, sopravvive al reload. 2 test di regressione → **67/67**.

**2. [CRITICAL, FIXATO] Il canale Realtime principale era completamente muto.**
Nessuna modifica lato server arrivava al client: comprato un veicolo, il server addebitava
correttamente 35.000 EUR ma il giocatore vedeva il saldo vecchio a tempo indefinito. Idem veicoli,
viaggi, immobili, prezzo carburante. Canale regolarmente `joined`/`SUBSCRIBED`.
Causa isolata con test A/B in browser: canale col solo binding `companies` → riceve; stesso canale
+ binding su `drivers` (assente dalla publication) → **non riceve nulla**. In Supabase Realtime
**un binding non valido invalida tutti gli altri binding dello stesso canale, in silenzio**;
`serverState.js` ne registra 7 su `ce_game_events`. Diff sottoscrizioni-client vs publication:
**9 tabelle mancanti** (`drivers`, `market_listings`, `company_shares`, `holding_members`,
`consorzio_members`, `judicial_auctions`, `crypto_market`, `global_events`, `real_world_status`).
Fix: `60_fix_realtime_publication.sql` (ADD TABLE idempotente, zero DDL distruttivo). Verificato:
modifica server di −9.999 applicata dal client in pochi secondi; prima del fix nessun effetto.
⚠️ Conseguenza da valutare a parte: `rpc_sync_cash` fa un **SET assoluto**, quindi finché il client
non riceveva gli addebiti server-side un `syncCash` successivo poteva **annullarli**.

**3. [CRITICAL, FIXATO — responsabilità del reset del 14/08] Nove cataloghi globali vuoti.**
`crypto_market`, `regions`, `real_estate_listings`, `judicial_auctions`, `server_decrees`,
`fuel_market`, `global_tension`, `vehicle_co2_rates`, `real_world_status` a 0 righe → i tab Crypto,
Real Estate, Regioni, Aste e Politica erano gusci vuoti. Forensica `pg_stat_user_tables`:
`n_tup_ins>0`, `n_tup_del=0`, `n_live_tup=0` = firma di un **TRUNCATE**. **La nota del 14/08
(righe 198-204) che dichiarava "tabelle globali intatte" e "judicial_auctions/server_decrees righe
preservate" era INESATTA.** Reseed verbatim dalle migration originali in
`59_reseed_global_catalogs.sql`.

**Confermati e NON corretti** (dettaglio e riproduzione nel report):
- **Schermata "Fonda Azienda" irraggiungibile**: `auth.js:51-57` crea la company col nome di
  default, quindi il ramo `showNewGameSetup()` (`auth.js:167-175`) è codice morto. Ogni giocatore
  si chiama "Chauffeur Empire" con logo 👁️ e **non può rinominarsi da nessuna parte**.
- **`rpc_get_vtk_market_orders` non esiste** (404 PGRST202) e `vtk-market.js:95` ingoia l'errore →
  il mercato VTK sembra "senza venditori" mentre è rotto.
- **18 province su 23 non esistono**: `rpc_add_province_influence` → 400 "Provincia non trovata:
  prov_civita" durante una corsa normale. Mancano i dati di bilanciamento, non il codice.
- **Classifica pubblica sempre vuota**: la landing interroga `companies` (RLS `user_id=auth.uid()`
  → 0 righe per anon, senza errore) invece di `leaderboard` (già pubblica). Link Discord `href="#"`.
- **Il service worker può servire codice vecchio dopo un deploy**: durante il test ha servito un
  `index.html` con `?v=10` mentre su disco era `?v=11`. Il cache-bust non protegge se è
  `index.html` stesso a essere in cache.

**Ritmo — la risposta vera a "non sembra giocabile"** (nessuno è un bug, insieme sono il problema):
zero corse generate all'avvio (solo `setInterval` 5 min) → fino a 5 minuti di Dispatch vuoto subito
dopo l'onboarding; durata corsa = `price×0.4` minuti cap 10-360 → una standard da 187 EUR dura
**36 minuti reali** (misurato); i tab si sbloccano a 25 corse ≈ **9 ore reali** con 1 autista;
primo batch bandi corporate dopo **2 giorni reali**.

**Verificato sano:** tutorial 12 step, onboarding survival completo senza soft-lock, contabilità
cash (0 → +500 premio login → +150 corse = 650), pipeline dispatch, `rpc_buy_vehicle` che addebita
esattamente il listino, `syncCash` che arrotonda prima del `bigint`. Le **7 RPC delle alleanze**
assenti dal repo **esistono in produzione** (migration mai committata → da dumpare e mettere in
repo).

**Rimasto aperto:** i test multi-account (P2P auto, alleanze, IPO, aste competitive, OPA, Shadow
Ops, voto decreti) — il secondo account era creato ma la diagnosi del Realtime ha assorbito il
tempo. **Vanno rifatti dopo il fix al Realtime**, che cambia il comportamento di tutte quelle
feature. Piano di sweep statici per Gemini in `GEMINI_TESTPLAN.md` (8 sweep, il più urgente è la
mappatura degli errori RPC ingoiati in silenzio).

**Pulizia:** account QA eliminati, `auth.users` torna a 1 (solo Vlad, 600 EUR, intatto), cataloghi
seedati mantenuti.

### 🎮 17 agosto 2026 — Fix bug netti + ritmo di gioco (richiesti da Vlad dopo il playtest) — 1 CRITICAL trovato durante la verifica

Seguito al playtest del 15/08: Vlad ha chiesto di correggere sia i bug netti sia il ritmo/flow
(non solo sicurezza). Tutto verificato dal vivo con account puliti (browser context isolati,
mai riusati tra un account e l'altro — lezione imparata a metà sessione, vedi sotto).

**Bug netti:**
- **"Fonda Azienda" reso raggiungibile** (`auth.js`): Phase 1/Phase 4 di `_mmoBootSequence`
  creavano silenziosamente la company con nome default PRIMA che potesse mai scattare
  `showNewGameSetup()` — quel ramo era codice morto (il flusso `_confirmNewGame` → 
  `ServerState.initCompany(nomeVero)` → `_startGameWithSlot` era però già corretto e completo,
  semplicemente mai raggiunto). Rimossa la creazione silenziosa in entrambi i punti; il ramo
  legittimo (utente con save ma company sparita) resta invariato. Verificato dal vivo: nome
  "QA Isolata Test" e logo scelti vengono rispettati end-to-end.
- **Classifica pubblica sulla landing** (`ui-landing.js`): leggeva da `companies` (RLS
  `user_id=auth.uid()` → sempre 0 righe per un anonimo, senza errore) invece di `leaderboard`
  (già pubblica). Verificato dal vivo: "TOP CEO GLOBALI" ora mostra righe reali.
- **`rpc_get_vtk_market_orders` mancante** (404 PGRST202, mai definita in nessun file):
  creata in `61_fix_vtk_orders_provinces_pacing.sql`, stesso stile delle RPC sorelle. Verificato
  con chiamata autenticata reale: nessun errore.
- **18 province su 23 mancanti**: stesso pattern "seed mai applicato" già visto il 15/08 —
  `16_territory_war.sql` aveva 5 UPDATE + 18 INSERT pronti (mapped_pois/required_influence,
  colonne già presenti da ALTER) mai eseguiti. Rieseguiti verbatim. 23/23 confermate.

**Ritmo (dimezzato, non stravolto — numeri documentati per revisione facile):**
- Durata corsa: `price × 0.4` min → `× 0.2` (`engine-rides.js`). Una corsa da ~90€ passa da 36 a
  18 minuti reali.
- Soglie onboarding dimezzate (`onboarding-core.js` GATES + `phase()`): survival 10→6 corse,
  restricted 25→15. Tutti i gate tab proporzionalmente dimezzati (finance 5→3 … opa 80→48).
  Sincronizzate le due copie satellite che altrimenti sarebbero andate fuori fase:
  `zero-to-hero.js` (trigger evento capitalismo, era hardcoded a `totalRides===10`, ora `6`) e
  `objective-tracker.js` (EARLY_GATES, solo display "prossimo obiettivo").
- Zero corse/zero bandi corporate all'avvio di una partita nuova: `initGame(fresh=true)` ora
  genera 2 corse + forza il primo batch di bandi (`CE_Contracts.dailyTick()`, bypassando
  l'attesa di 2 giorni reali) 800ms dopo il boot. Verificato dal vivo: 4 bandi già presenti al
  primo `switchTab('contracts')`.

**🔴 CRITICAL trovato verificando il fix "Fonda Azienda" — raddoppio del cash al primissimo
premio giornaliero, mai osservabile prima perché il percorso che lo espone era proprio quello
appena sbloccato.** Riprodotto 3 volte con browser context isolati: dopo la creazione
dell'azienda, al primo `_checkDailyReward()` (+500, 1.5s dopo il boot) il cash locale saliva a
**1000** mentre `companies.cash` restava correttamente a **500**. `loginStreak`/`lastDailyClaim`
confermavano che il premio era scattato UNA sola volta — non un doppio trigger.

Causa isolata leggendo `serverState.js`: `_onCompanyChange` (il fix "BUG 4" storico) applica
solo il DELTA `newRow.cash - _lastServerCash` per non sovrascrivere guadagni locali non ancora
sincronizzati. Ma `_lastServerCash` viene aggiornato SOLO quando arriva un evento Realtime
(o al bridge di boot) — non quando il client stesso lancia un `syncCash`. Sequenza esatta:
`initCompany()` fissa `_lastServerCash=0`; **nessun altro evento lo aggiorna** prima che
`_checkDailyReward()` faccia `gs.cash += 500` (locale, sincrono) e poi chiami
`syncCash(500)` (RPC); quando l'ECHO Realtime di QUELLA STESSA scrittura torna indietro,
`_onCompanyChange` lo confronta ancora con `_lastServerCash=0` (mai toccato nel frattempo) →
delta=500 → lo riapplica sopra un cash locale che aveva GIÀ quel +500 → 1000. Un client che
mandava un valore e ne riceveva l'eco veniva trattato come se qualcun altro l'avesse cambiato.

Fix minimo (`serverState.js`, funzione `syncCash`): aggiorna `_lastServerCash` **subito**, in
modo sincrono, col valore che si sta per scrivere — non aspetta l'eco Realtime per saperlo.
Qualsiasi eco successivo della propria stessa scrittura calcola correttamente delta=0. I delta
per cambiamenti ESTERNI reali (altro giocatore, altra RPC) restano intatti perché quella logica
non è stata toccata. Verificato dal vivo su un 4° account pulito: cash locale e server
convergono a 500, restano identici, e sopravvivono al reload.

**Lezione operativa**: due dei falsi allarmi durante questa verifica (`cash:1000` su
qa.pacing/qa.pacing2) erano contaminazione tra sessioni Supabase nello stesso browser tab
(sessione precedente mai sloggata, auto-restore al page-load) — non bug del gioco. Isolato
il problema vero usando SEMPRE `isolatedContext` per ogni account di test da ora in poi.

**File**: `auth.js` (v14), `ui-landing.js` (v8), `engine.js` (v28), `engine-rides.js` (v12),
`serverState.js` (v10), `onboarding-core.js` (v2), `zero-to-hero.js` (v6),
`objective-tracker.js` (v5), `vtk-market.js` (v16, nessun edit JS — solo la RPC lato SQL),
`61_fix_vtk_orders_provinces_pacing.sql` (applicata). Suite: 67/67 pass, invariata.

**Non toccato** (fuori scope, resta nel report del 15/08): mercato VTK aveva SOLO la RPC
mancante — non ho ri-verificato l'intero flusso compravendita end-to-end; test multi-account
(P2P, alleanze, aste) ancora da fare; le 18 province nuove hanno numeri di bilanciamento presi
verbatim da una migration mai applicata, non nuovi — non è un mio giudizio di game design.
