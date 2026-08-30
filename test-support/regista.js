'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   regista.js — porta il gioco in uno stato NOMINATO

   Fase 2 di PIANO-CHIUSURA.md, ed è il collo di bottiglia di tutto il piano.
   Su 254 azioni del giocatore, **76 non si riescono nemmeno ad attivare** nel
   banco di prova: non perché siano rotte, ma perché chiedono una situazione che
   il banco non sa costruire. Essere in un consorzio. Avere un contratto B2B
   attivo. Un cliente VIP che chiama. Un'asta aperta. Un deposito di carburante.
   Un autista in accademia. Finché quelle situazioni si costruiscono a mano,
   ogni azione costa mezz'ora; con un regista, due minuti.

   ── LA REGOLA CHE TIENE INSIEME QUESTO FILE ──────────────────────────────────
   Ogni funzione **usa il codice vero del gioco** dove esiste, invece di
   fabbricare a mano la forma dei dati. `conClienteVIP` non si inventa l'oggetto
   email: prepara la flotta e chiama `_maybeVipGrigori()`, cioè il generatore
   che gira nella partita vera. Se un giorno quella forma cambia, il regista
   cambia con lei e i test restano veri. Uno stato costruito a mano è uno stato
   che assomiglia al gioco senza esserlo — e un test che gira su una copia
   somigliante non difende niente.

   Dove il gioco non ha una funzione (perché quella parte vive sul server), il
   regista scrive la forma **copiandola dalla RPC** e lo dice nel commento, col
   file .sql accanto.

   ── COSA GARANTISCE OGNI FUNZIONE ────────────────────────────────────────────
   Ognuna è documentata con la frase «GARANTISCE:» e restituisce quello che
   serve per usarla (l'id creato, l'oggetto piazzato). Se non riesce a costruire
   lo stato, **lancia** invece di restituire in silenzio: un regista che fallisce
   di nascosto rimette in piedi il problema che doveva risolvere, cioè un test
   che passa senza aver provato niente.

   Uso tipico:

       const env = freshEnv();
       const R = require('../../test-support/regista.js');
       R.conGiocatoreCollegato(env);
       R.conSoldi(env, 500000);
       R.conConsorzio(env, { ruolo: 'leader' });
       sandbox.window._alDonate();
   ════════════════════════════════════════════════════════════════════════════ */

const vm = require('node:vm');

/* `gameState` va riletto a ogni chiamata e mai catturato: alcune azioni
   (`_confirmNewGame`, `resetGame`, `sellCompanyNGP`) SOSTITUISCONO l'oggetto, e
   chi tiene un riferimento vecchio prepara un mondo che il gioco non guarda più.
   È lo stesso inciampo documentato in azioni-sincronizzano.test.js. */
const gs  = (env) => env.sandbox.window.gameState;
const win = (env) => env.sandbox.window;
const doc = (env) => env.sandbox.document;

/** Legge un catalogo dichiarato `const` dentro il VM (data.js e simili): quei
 *  nomi non finiscono su `window`, quindi l'unico modo di vederli è valutare il
 *  nome nel contesto. Senza id veri il regista costruirebbe stati finti. */
function catalogo(env, nome) {
    try {
        return vm.runInContext(`typeof ${nome} !== 'undefined' ? ${nome} : null`, env.sandbox) || null;
    } catch { return null; }
}

function pretende(condizione, messaggio) {
    if (!condizione) throw new Error(`regista: ${messaggio}`);
}

/* Molti generatori del gioco tirano un dado prima di produrre qualcosa
   (`if (Math.random() > 0.15) return;`). Per costruire uno stato su richiesta il
   dado va truccato, ma solo per la durata della chiamata: `Math` nel banco è lo
   STESSO oggetto del processo Node, quindi lasciarlo truccato avvelenerebbe ogni
   test successivo. Per questo il ripristino sta in un `finally`. */
function conDadoTruccato(valore, azione) {
    const vero = Math.random;
    Math.random = () => valore;
    try { return azione(); }
    finally { Math.random = vero; }
}

/* ══════════════════════════════════════════════════════════════════════════
   FONDAMENTA — quello che serve a quasi tutti gli stati
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * GARANTISCE: `gameState.cash` vale esattamente `quanti`, ed è passato dalla
 * porta del denaro (`CE_money`), quindi il server ne è stato informato come
 * accade nella partita vera.
 *
 * Vlad l'ha chiesto esplicitamente («poter iniettare denaro»). Scrivere
 * `gs.cash = 500000` sarebbe più corto e sbagliato: lascerebbe il saldo locale
 * e quello del server disallineati, cioè costruirebbe di proposito il difetto
 * che mezza suite cerca di prevenire.
 */
function conSoldi(env, quanti) {
    const stato = gs(env);
    pretende(stato, 'gameState non esiste: initGame non è stato chiamato');
    const CE = win(env).CE_money;
    pretende(CE, 'CE_money non è caricato: manca money.js fra i file del banco');

    const delta = quanti - (stato.cash || 0);
    if (delta > 0)      CE.earn(delta, 'regista_iniezione');
    else if (delta < 0) CE.spend(-delta, 'regista_prelievo');
    pretende(gs(env).cash === quanti, `cash atteso ${quanti}, trovato ${gs(env).cash}`);
    return quanti;
}

/**
 * GARANTISCE: le monete premium valgono quanto chiesto (`driverCoins`, `vtkBalance`).
 * Restano separate da `conSoldi` perché sono valute diverse con porte diverse.
 */
function conMonete(env, { driverCoins, vtk } = {}) {
    const stato = gs(env);
    if (typeof driverCoins === 'number') stato.driverCoins = driverCoins;
    if (typeof vtk === 'number')         stato.vtkBalance  = vtk;
    return { driverCoins: stato.driverCoins, vtk: stato.vtkBalance };
}

/**
 * GARANTISCE: esiste un giocatore collegato (`window.currentUser`) e un client
 * Supabase che risponde. Restituisce `{ id, chiamate, rispondiCon, tabella }`.
 *
 * È la fondamenta più importante di tutte, e per una ragione misurata: decine di
 * azioni cominciano con `if (!_uid()) return;` — mercato fra giocatori, consorzi,
 * sindacato, VTK, turismo, holding. Nel banco `window.currentUser` non è mai
 * stato impostato, quindi quelle azioni uscivano alla PRIMA RIGA e finivano
 * fra le «non attivabili». Non erano bloccate da uno stato di gioco mancante:
 * erano bloccate dal non aver fatto il login.
 *
 * - `chiamate`  — l'elenco `{nome, args}` di ogni RPC chiesta al server;
 * - `rispondiCon(nome, fn)` — che cosa deve rispondere una RPC;
 * - `tabella(nome, righe)`  — che cosa deve restituire una `.from(nome)`.
 */
function conGiocatoreCollegato(env, { id = 'giocatore-di-prova' } = {}) {
    const chiamate  = [];
    const risposte  = {};
    const tabelle   = {};

    /* La catena di `.from()`: ogni metodo restituisce se stesso e l'oggetto è
       `then`-abile, così regge sia `await sb.from('x').select()` sia le catene
       lunghe `.select().eq().order().limit()`. È la stessa forma già ricopiata a
       mano in una decina di file di test: da qui in poi ne esiste una sola. */
    function catena(tabella) {
        const risultato = () => Promise.resolve({ data: tabelle[tabella] || [], error: null });
        const c = {
            select: () => c, insert: () => c, update: () => c, upsert: () => c,
            delete: () => c, eq: () => c, neq: () => c, gt: () => c, gte: () => c,
            lt: () => c, lte: () => c, or: () => c, in: () => c, is: () => c,
            like: () => c, ilike: () => c, contains: () => c, filter: () => c,
            order: () => c, limit: () => c, range: () => c,
            single:      () => Promise.resolve({ data: (tabelle[tabella] || [])[0] || null, error: null }),
            maybeSingle: () => Promise.resolve({ data: (tabelle[tabella] || [])[0] || null, error: null }),
            then: (ok, ko) => risultato().then(ok, ko),
        };
        return c;
    }

    const client = {
        from: catena,
        rpc: async (nome, args) => {
            chiamate.push({ nome, args });
            if (risposte[nome]) return risposte[nome](args);
            return { data: null, error: null };
        },
        /* Il Realtime nel banco non deve fare niente, ma deve esistere: il codice
           incatena `.on(...).subscribe()` e su `undefined` esploderebbe. */
        channel: () => {
            const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => ch };
            return ch;
        },
        removeChannel: () => {},
        auth: {
            getUser:    async () => ({ data: { user: { id } }, error: null }),
            getSession: async () => ({ data: { session: { user: { id } } }, error: null }),
        },
    };

    win(env).currentUser    = { id };
    env.sandbox.currentUser = win(env).currentUser;
    win(env).supabaseClient = client;
    env.sandbox.supabaseClient = client;

    return {
        id, chiamate,
        rispondiCon: (nome, fn) => { risposte[nome] = fn; },
        tabella:     (nome, righe) => { tabelle[nome] = righe; },
    };
}

/**
 * GARANTISCE: nel documento esistono gli input con gli id chiesti e con dentro
 * i valori dati. Restituisce la mappa degli elementi creati.
 *
 * Serve più di quanto sembri. Un'intera famiglia di azioni non legge i propri
 * argomenti dalla chiamata: li legge dal modulo sullo schermo.
 * `_alCreate` prende nome e TAG da `#al-name` e `#al-tag`, `_alDonate` prende
 * l'importo da `#al-donate`. Nel banco quei campi non esistono, quindi le azioni
 * uscivano su «Nome troppo corto» o «Importo non valido» — sembravano bloccate
 * da uno stato di gioco, ed erano bloccate da un campo vuoto.
 */
function conModulo(env, campi) {
    const d = doc(env);
    const creati = {};
    for (const [id, valore] of Object.entries(campi)) {
        let el = d.getElementById(id);
        if (!el) {
            el = d.createElement(typeof valore === 'boolean' ? 'input' : 'input');
            el.id = id;
            d.body.appendChild(el);
        }
        if (typeof valore === 'boolean') { el.type = 'checkbox'; el.checked = valore; }
        else                              { el.value = String(valore); }
        creati[id] = el;
    }
    return creati;
}

/**
 * GARANTISCE: esiste `#tab-container` nel documento.
 * Quasi ogni azione, dopo aver fatto il suo lavoro, ridisegna la sua scheda. Se
 * il contenitore non c'è, il rendering esplode DOPO l'effetto di gioco: il test
 * vede un'eccezione e archivia come rotta un'azione che aveva funzionato.
 */
function conSchermo(env) {
    const d = doc(env);
    let c = d.getElementById('tab-container');
    if (!c) { c = d.createElement('div'); c.id = 'tab-container'; d.body.appendChild(c); }
    return c;
}

/**
 * GARANTISCE: la flotta ha `quante` auto utilizzabili (ferme, sane, senza fermo
 * amministrativo), con la classe e la condizione richieste.
 *
 * `classe` accetta un id di `VEHICLE_CLASSES`/catalogo o un elenco: le azioni VIP
 * pretendono modelli precisi («Serve G-Overlord o Majestic Spirit»), quindi una
 * flotta generica non le sblocca.
 */
function conFlotta(env, quante = 1, { classe = null, condizione = 100, tier = 'business' } = {}) {
    const stato = gs(env);
    stato.fleet = stato.fleet || [];
    const classi = classe == null ? [null] : (Array.isArray(classe) ? classe : [classe]);
    const nuove = [];
    for (let i = 0; i < quante; i++) {
        const vc = classi[i % classi.length];
        const auto = {
            id: `regista_auto_${stato.fleet.length + 1}`,
            _serverId: `srv_regista_auto_${stato.fleet.length + 1}`,
            name: vc || 'Auto del regista',
            vehicleClass: vc || undefined,
            tier, condition: condizione, fuel: 100, tirePressure: 100, engineHealth: 100,
            status: 'idle', mileage: 1000, upgrades: [], isLease: false,
            outOfService: null, isSeized: false,
        };
        stato.fleet.push(auto);
        nuove.push(auto);
    }
    return nuove;
}

/**
 * GARANTISCE: c'è almeno un autista disponibile, col livello chiesto.
 * Il livello conta davvero: L'Onorevole e Grigori rifiutano chi ha meno di 2.
 */
function conAutisti(env, quanti = 1, { livello = 3, stato: st = 'idle' } = {}) {
    const stato = gs(env);
    stato.drivers = stato.drivers || [];
    const nuovi = [];
    for (let i = 0; i < quanti; i++) {
        const d = {
            id: `regista_autista_${stato.drivers.length + 1}`,
            _serverId: `srv_regista_autista_${stato.drivers.length + 1}`,
            name: 'Autista del regista',
            level: livello, tier: livello >= 3 ? 'ultra' : livello >= 2 ? 'vip' : 'standard',
            status: st, salary: 1500, skill: 80, skill_speed: 60,
            energy: 100, stress: 0, stress_level: 0, fatigue: 0, health: 100,
            queue: [], onStrike: false, isOnStrike: false, restHoursLeft: 0,
            assignedCarId: null,
        };
        stato.drivers.push(d);
        nuovi.push(d);
    }
    return nuovi;
}

/**
 * GARANTISCE: il contatore delle corse completate vale almeno `quante`, e con
 * lui i cancelli dell'onboarding che ci si appoggiano (`GATES`).
 *
 * NON è un semplice numero messo a mano: `questStats.totalRides` e
 * `stats.totalRides` sono due contatori diversi letti da parti diverse
 * (onboarding-core.js guarda il primo, la carriera il secondo), e lasciarne
 * indietro uno costruisce uno stato che nella partita vera non esiste.
 */
function conCorseCompletate(env, quante) {
    const stato = gs(env);
    stato.stats      = stato.stats      || {};
    stato.questStats = stato.questStats || {};
    stato.stats.totalRides      = Math.max(stato.stats.totalRides || 0, quante);
    stato.questStats.totalRides = Math.max(stato.questStats.totalRides || 0, quante);
    stato.completedRides        = Math.max(stato.completedRides || 0, quante);
    return quante;
}

/**
 * GARANTISCE: sono passati `giorni` giorni di gioco facendo girare i tick VERI
 * del motore — stipendi, manutenzioni, eventi, email, scadenze.
 *
 * Vlad l'ha chiesto esplicitamente («accelerare il tempo»). La tentazione è
 * `gs.day += 30`, ed è esattamente ciò che rende inutile la prova: se un sistema
 * si rompe al giorno 30 deve rompersi anche qui, e si rompe solo se i trenta
 * giorni sono davvero passati. Restituisce il giorno raggiunto.
 */
function conGiornoAvanzato(env, giorni) {
    const w = win(env);
    pretende(typeof w.processDailyRoutines === 'function',
        'processDailyRoutines non è caricata: manca engine-daily.js fra i file del banco');
    for (let i = 0; i < giorni; i++) {
        gs(env).day = (gs(env).day || 1) + 1;
        try { w.processDailyRoutines(); }
        catch (e) { throw new Error(`regista: il giorno ${gs(env).day} ha rotto il motore — ${e.message}`); }
    }
    return gs(env).day;
}

/* ══════════════════════════════════════════════════════════════════════════
   I SISTEMI — gli stati che sbloccano le 76 azioni ferme
   ══════════════════════════════════════════════════════════════════════════ */

/* I clienti VIP che il gioco sa generare, con quello che ognuno pretende prima
   di scrivere l'email. I requisiti NON sono inventati qui: sono letti uno per uno
   dalle guardie in vip-clients.js, e il generatore vero li ricontrolla — se
   sbagliassi una classe di veicolo, `conClienteVIP` fallirebbe invece di
   costruire uno stato falso. */
const VIP = {
    // ≥95 di condizione, e un autista Lv2+ ASSEGNATO a quell'auto.
    grigori:   { generatore: '_maybeVipGrigori',   tipo: 'vip_grigori',
                 auto: ['majestic_spirit'] },
    // ≥70, nessun requisito sull'autista.
    strata:    { generatore: '_maybeVipStrata',    tipo: 'vip_strata',
                 auto: ['stellar_s_imp'] },
    // due V-Carrier, ≥70.
    platinum:  { generatore: '_maybeVipPlatinum',  tipo: 'vip_platinum',
                 auto: ['stellar_v_carr', 'stellar_v_carr'] },
    // ≥80 e NON elettrica: `stellar_s_imp` è a benzina malgrado il nome della
    // sorella `stellar_e_exec` (data.js, campo `fuel`). Serve l'autista assegnato.
    onorevole: { generatore: '_maybeVipOnorevole', tipo: 'vip_onorevole',
                 auto: ['stellar_s_imp'] },
    // quattro veicoli del gruppo ammesso, ≥80.
    emiro:     { generatore: '_maybeVipEmiro',     tipo: 'vip_emiro',
                 auto: ['majestic_spirit', 'majestic_e_specter', 'stellar_s_imp', 'stellar_g_over'] },
    // ≥85 e non elettrica.
    garante:   { generatore: '_maybeVipGarante',   tipo: 'vip_garante',
                 auto: ['stellar_g_over'] },
    // ≥80 più la polizza Kasko, che è un investimento non un'auto.
    erede:     { generatore: '_maybeVipErede',     tipo: 'vip_erede',
                 auto: ['volt_s_hyper'], investimenti: ['inv_kasko'] },
    // una Majestic e due V-Carrier, tutte e tre a condizione ESATTAMENTE 100.
    wedding:   { generatore: '_maybeVipWedding',   tipo: 'vip_wedding',
                 auto: ['majestic_spirit', 'stellar_v_carr', 'stellar_v_carr'] },
    // ≥80, nessun requisito sull'autista.
    golden:    { generatore: '_maybeVipGolden',    tipo: 'vip_golden',
                 auto: ['majestic_spirit'] },
    // qui l'auto deve essere ELETTRICA (quarto parametro di `_vipFleetCar`), ≥90,
    // e l'autista assegnato deve avere poco stress.
    techbro:   { generatore: '_maybeVipTechBro',   tipo: 'vip_techbro',
                 auto: ['volt_s_hyper'] },
};

/**
 * GARANTISCE: nella posta c'è una richiesta non letta del cliente VIP indicato,
 * e la flotta/gli autisti soddisfano quello che quel cliente pretende — cioè
 * l'azione `acceptVip…` corrispondente arriva fino in fondo invece di uscire
 * su «Nessun veicolo disponibile». Restituisce l'email.
 *
 * Il percorso è quello vero: prepara il mondo, azzera il tempo di attesa fra due
 * richieste dello stesso cliente, tira un dado favorevole e lascia che sia il
 * gioco a scrivere l'email. Il regista non conosce la forma di `vipData`, e non
 * deve conoscerla.
 */
function conClienteVIP(env, chi) {
    const spec = VIP[chi];
    pretende(spec, `cliente VIP sconosciuto: ${chi}. Ne conosco ${Object.keys(VIP).join(', ')}`);
    const w = win(env);
    const stato = gs(env);

    /* Condizione 100 per tutte: le soglie vanno da 70 a «esattamente 100» (le
       nozze), e un'unica auto perfetta le soddisfa tutte senza dover ricopiare
       qui otto numeri che il gioco può cambiare. */
    const auto = conFlotta(env, spec.auto.length, { classe: spec.auto, condizione: 100, tier: 'ultra' });
    /* Un autista per auto, e ASSEGNATO a quella: `_vipAssignedDriver` cerca
       `d.assignedCarId === car.id`, quindi un autista bravissimo ma non assegnato
       vale come nessun autista. È la guardia su cui uscivano Grigori e
       L'Onorevole. */
    const autisti = conAutisti(env, auto.length, { livello: 3 });
    auto.forEach((a, i) => { autisti[i].assignedCarId = a.id; autisti[i].restHoursLeft = 0; });

    if (spec.investimenti) {
        stato.investments = stato.investments || [];
        for (const i of spec.investimenti) if (!stato.investments.includes(i)) stato.investments.push(i);
    }
    stato.emails = stato.emails || [];
    // Il cooldown si misura in ore di gioco dall'ultima richiesta: azzerarlo è il
    // modo onesto di dire «è passato abbastanza tempo», senza toccare il resto.
    stato.vipCooldowns = {};

    pretende(typeof w[spec.generatore] === 'function',
        `${spec.generatore} non esiste: vip-clients.js non è caricato nel banco`);

    // 0 fa passare ogni `Math.random() > soglia` e sceglie il primo elemento di
    // ogni elenco: percorso, cliente, importo diventano deterministici.
    conDadoTruccato(0, () => w[spec.generatore]());

    const email = gs(env).emails.filter(e => e.type === spec.tipo && e.status === 'unread').pop();
    pretende(email, `il generatore ${spec.generatore} non ha scritto nessuna email ${spec.tipo}: ` +
                    'i requisiti di flotta/autisti in VIP sono cambiati?');
    return email;
}

/**
 * GARANTISCE: ogni cliente VIP che il gioco sa generare ha scritto la sua
 * richiesta, e la flotta soddisfa tutti insieme. Restituisce l'elenco delle
 * email nell'ordine dei clienti.
 *
 * Serve a chi deve provare TUTTE le azioni VIP in una passata sola: costruire lo
 * scenario dieci volte costa dieci volte tanto, e i requisiti non litigano fra
 * loro — sono auto diverse, non la stessa auto in stati diversi.
 */
function conTuttiIClientiVIP(env) {
    return Object.keys(VIP).map(chi => conClienteVIP(env, chi));
}

/**
 * GARANTISCE: restituisce una copia indipendente delle parti di `gameState` che
 * costruiscono uno scenario (flotta, autisti, investimenti, posta), utile a chi
 * deve rimettere in scena lo stesso mondo molte volte senza ricostruirlo.
 *
 * Nasce da un vincolo di costo, non di eleganza: il banco delle azioni rifà lo
 * stato prima di OGNI tentativo, e i tentativi sono migliaia. Rigenerare dieci
 * clienti VIP ogni volta trasformerebbe un test da secondi in minuti, e un test
 * lento è un test che si smette di lanciare.
 */
function istantanea(env) {
    const stato = gs(env);
    return JSON.parse(JSON.stringify({
        fleet:       stato.fleet       || [],
        drivers:     stato.drivers     || [],
        investments: stato.investments || [],
        emails:      stato.emails      || [],
    }));
}

/** Rimette in scena un'istantanea, AGGIUNGENDOLA a quello che c'è già. */
function rimettiInScena(env, scatto) {
    const stato = gs(env);
    const copia = JSON.parse(JSON.stringify(scatto));
    stato.fleet   = (stato.fleet   || []).concat(copia.fleet);
    stato.drivers = (stato.drivers || []).concat(copia.drivers);
    stato.emails  = (stato.emails  || []).concat(copia.emails);
    stato.investments = [...new Set((stato.investments || []).concat(copia.investments))];
    return stato;
}

/**
 * GARANTISCE: il giocatore risulta dentro un consorzio col ruolo chiesto, sia
 * per la scheda Consorzi (`alliances.js`) sia per il mercato (`_p2pMarket`), e
 * il server finto risponde alle RPC dei consorzi.
 *
 * Due sistemi diversi chiamano «consorzio» due cose diverse — le alleanze di
 * `alliances.js` (tabella `alliances`) e i consorzi del mercato P2P
 * (`rpc_join_consorzio`). Un regista che ne preparasse uno solo lascerebbe metà
 * delle azioni ancora ferme, quindi qui si preparano entrambi.
 * Forma copiata dalle RPC in 12_alliances.sql e dal fetch di p2p-market.js.
 */
function conConsorzio(env, { ruolo = 'leader', id = 'consorzio-di-prova' } = {}) {
    const w = win(env);
    const server = w.supabaseClient && w.supabaseClient.rpc
        ? null
        : conGiocatoreCollegato(env);
    const utente = w.currentUser ? w.currentUser.id : conGiocatoreCollegato(env).id;

    const consorzio = {
        id, name: 'Consorzio di Prova', tag: 'PRV', emblem: '🛡️',
        is_open: true, treasury: 1000000, leader_user_id: ruolo === 'leader' ? utente : 'altro-utente',
        consorzio_members: [{ user_id: utente, role: ruolo, company_name: 'Azienda di Prova' }],
    };

    w._allianceState = Object.assign(w._allianceState || {}, {
        myAlliance: consorzio,
        myRole: ruolo,
        members: consorzio.consorzio_members,
    });
    w._p2pMarket = Object.assign(w._p2pMarket || {}, { myConsorzio: consorzio, consorzi: [consorzio] });
    w._sindacatoState = Object.assign(w._sindacatoState || {}, {
        consorzioId: id, consorzioMembersCount: 1, tension: 50,
        strikeActive: false, gdfRisk: 10,
    });
    return { consorzio, ruolo, server };
}

/**
 * GARANTISCE: esiste un'asta in corso con un rilancio possibile.
 * Forma copiata da `judicial_auctions` (62_aste_ciclo_di_vita.sql) e dallo stato
 * locale che auctions.js costruisce dopo il fetch.
 */
function conAstaAperta(env, { rilancioMinimo = 1000 } = {}) {
    const w = win(env);
    const stato = gs(env);
    const asta = {
        id: 'asta-di-prova',
        vehicle_name: 'Berlina sequestrata', vehicle_class: 'majestic_spirit',
        current_bid: rilancioMinimo, min_increment: 500, status: 'open',
        ends_at: new Date(Date.now() + 3600000).toISOString(),
        top_bidder_user_id: null, condition: 80,
    };
    w._auctionsState = Object.assign(w._auctionsState || {}, { auctions: [asta], mine: [] });
    // Il motore locale ha una sua asta separata da quelle del server (l'usata
    // dell'asta cittadina): serve anche quella, o metà delle azioni non parte.
    stato.activeAuction = { id: asta.id, name: asta.vehicle_name, currentBid: rilancioMinimo, playerBid: 0 };
    return asta;
}

/**
 * GARANTISCE: c'è un bando aziendale aperto su cui fare un'offerta e un
 * contratto B2B attivo da poter interrompere.
 * Forma copiata da contracts.js (bandi locali) e dalle RPC di b2b.js.
 */
function conContrattoB2B(env) {
    const w = win(env);
    const stato = gs(env);
    stato.corporateTenders = stato.corporateTenders || [];
    stato.corporateContracts = stato.corporateContracts || [];
    const bando = { id: 'bando-di-prova', status: 'open', playerBid: null,
                    company: { name: 'ACME', tier: 'gold', vehType: 'business' } };
    const contratto = { id: 'contratto-di-prova', status: 'active', tier: 3,
                        company: { name: 'ACME' }, dailyRevenue: 5000 };
    stato.corporateTenders.push(bando);
    stato.corporateContracts.push(contratto);

    const b2b = { id: 'b2b-di-prova', client_name: 'ACME', status: 'active',
                  reliability: 90, daily_payout: 5000, vehicles_required: 1 };
    w._b2bState = Object.assign(w._b2bState || {}, { contracts: [b2b], offers: [b2b] });
    return { bando, contratto, b2b };
}

/**
 * GARANTISCE: il deposito carburante aziendale esiste, è vuoto e ha capienza —
 * cioè comprare gasolio ha un effetto invece di essere un no-op.
 */
function conDepositoCarburante(env, { livello = 1, capienza = 20000 } = {}) {
    const stato = gs(env);
    stato.investments = stato.investments || [];
    if (!stato.investments.includes('inv_fuel_depot')) stato.investments.push('inv_fuel_depot');
    stato.fuelTankLevel = livello;
    stato.fuelTankCapacity = capienza;
    stato.fuelTank = 0;
    stato.fuelPrice = stato.fuelPrice || 1.85;
    return { livello, capienza };
}

/**
 * GARANTISCE: un autista sta seguendo un corso in accademia, con giorni residui.
 */
function conAutistaInAccademia(env, { giorniResidui = 3 } = {}) {
    const stato = gs(env);
    const autista = (stato.drivers && stato.drivers[0]) || conAutisti(env, 1)[0];
    stato.driverAcademy = stato.driverAcademy || [];
    const corso = { driverId: autista.id, courseId: 'c_eco', daysLeft: giorniResidui,
                    completesDay: (stato.day || 1) + giorniResidui };
    stato.driverAcademy.push(corso);
    return { autista, corso };
}

/**
 * GARANTISCE: un prestito attivo con un debito residuo da ripagare.
 * Forma copiata da `company_loans` e da `ServerState.takeLoan`.
 */
function conPrestito(env, { importo = 100000 } = {}) {
    const stato = gs(env);
    stato.loans = stato.loans || [];
    const prestito = {
        id: 'prestito-di-prova', _serverId: 'srv_prestito_di_prova',
        principal: importo, remaining: importo, amount: importo,
        interestRate: 0.08, dailyPayment: Math.round(importo / 30), daysLeft: 30,
    };
    stato.loans.push(prestito);
    return prestito;
}

/**
 * GARANTISCE: il portafoglio cripto ha un saldo vendibile e il mercato ha un
 * prezzo, così le azioni di vendita non escono su «non possiedi niente».
 */
function conCriptoInPortafoglio(env, { quantita = 1 } = {}) {
    const w = win(env);
    const stato = gs(env);
    stato.cryptoWallet = Object.assign(stato.cryptoWallet || {}, { BTC: quantita });
    stato.offshoreBalance = stato.offshoreBalance || 100000;
    w._cryptoState = Object.assign(w._cryptoState || {}, {
        market: [{ symbol: 'BTC', price: 50000, change24h: 1.5 }],
        wallet: { BTC: quantita },
        offshore: stato.offshoreBalance,
    });
    return { quantita };
}

/**
 * GARANTISCE: il giocatore possiede un immobile che rende, e il catalogo ne
 * espone almeno uno comprabile.
 */
function conImmobile(env) {
    const stato = gs(env);
    stato.realEstate = stato.realEstate || [];
    const immobile = { id: 're_roma_centro', listing_id: 're_roma_centro',
                       name: 'Appartamento Piazza Navona', daily_rent: 650 };
    stato.realEstate.push(immobile);
    return immobile;
}

/**
 * GARANTISCE: il giocatore controlla una provincia, con influenza sufficiente
 * per le azioni di territorio.
 */
function conProvincia(env, { id = 'prov_roma' } = {}) {
    const w = win(env);
    const stato = gs(env);
    stato.provinces = stato.provinces || [];
    stato.provinces.push({ id, name: 'Roma', influence: 100, owner: true });
    stato.influence = Math.max(stato.influence || 0, 1000);
    w._territoryState = Object.assign(w._territoryState || {}, {
        mine: [{ province_id: id, influence: 100 }],
        provinces: [{ id, name: 'Roma', mapped_pois: 5, required_influence: 50 }],
    });
    return id;
}

/**
 * GARANTISCE: esiste una nemesi VIP arrabbiata, cioè le azioni di corruzione e
 * di agenzia ombra hanno un bersaglio. Forma copiata da `_nemesisBribeVip`.
 */
function conNemesi(env, { rabbia = 80, id = 'grigori' } = {}) {
    const stato = gs(env);
    stato.vipNemeses = stato.vipNemeses || {};
    stato.vipNemeses[id] = { name: 'Grigori V.', anger: rabbia, level: 2, lastFunded: 0 };
    return stato.vipNemeses[id];
}

/**
 * GARANTISCE: il giocatore ha una holding col ruolo chiesto, azioni proprie in
 * circolazione e una sussidiaria da poter cedere.
 */
function conHolding(env, { ruolo = 'emittente' } = {}) {
    const w = win(env);
    const stato = gs(env);
    stato.holding = { name: 'Holding di Prova', founded: stato.day || 1,
                      subsidiaries: [{ id: 'sub1', name: 'NCC Milano', value: 500000 }] };
    stato.companyIPO = { listed: true, sharePrice: 100, sharesTotal: 1000, npcSharesOwned: 300 };
    stato.cempShares = ruolo === 'emittente' ? 0 : 50;
    w._holdingState = Object.assign(w._holdingState || {}, {
        myListing: { id: 'listing-di-prova', issuer_user_id: w.currentUser?.id || 'io',
                     shares_total: 1000, current_price: 100 },
        holdings: [{ listing_id: 'listing-di-prova', shares_owned: 50 }],
    });
    return stato.holding;
}

module.exports = {
    // fondamenta
    conSoldi, conMonete, conGiocatoreCollegato, conModulo, conSchermo,
    conFlotta, conAutisti, conCorseCompletate, conGiornoAvanzato,
    // sistemi
    conClienteVIP, conTuttiIClientiVIP, istantanea, rimettiInScena,
    conConsorzio, conAstaAperta, conContrattoB2B,
    conDepositoCarburante, conAutistaInAccademia, conPrestito,
    conCriptoInPortafoglio, conImmobile, conProvincia, conNemesi, conHolding,
    // utilità per chi costruisce stati nuovi
    catalogo, conDadoTruccato,
};
