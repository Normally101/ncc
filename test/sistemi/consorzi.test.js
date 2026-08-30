'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/consorzi — le tredici azioni dei consorzi, una per una.

   Fase 3 di PIANO-CHIUSURA.md, primo sistema dell'elenco. La regola della fase è
   che ogni azione va **eseguita nello stato che richiede**, e che di ognuna si
   guardano i tre effetti:

     1. lo stato locale cambia come promette il bottone;
     2. il denaro passa dalla porta (`CE_money`), mai da `gameState.cash` diretto;
     3. il server riceve la scrittura giusta, con gli argomenti giusti.

   Il terzo è quello che nessun test guardava, ed è dove si nascondono i difetti
   che si vedono solo in produzione: una RPC chiamata col nome sbagliato risponde
   404 e il bottone «non fa niente» senza dire perché.

   ⚠️ Due sistemi diversi chiamano «consorzio» due cose diverse, e vanno provati
   tutti e due: le **alleanze** di alliances.js (tabella `alliances`, RPC
   `rpc_*_alliance`) e i **consorzi** del mercato P2P (p2p-render.js, RPC
   `rpc_*_consorzio`). Hanno perfino due bottoni «entra» distinti. Chi ne prova uno
   solo lascia scoperta metà della funzione.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/consorzi — alleanze (alliances.js)', () => {
    let env, w, server, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        server = R.conGiocatoreCollegato(env);
        R.conSoldi(env, 5_000_000);
        avvisi = [];
        w.showNotification = (msg, tipo) => avvisi.push({ msg, tipo });
        // Il rendering della scheda non c'entra col denaro e qui non ha appigli.
        w.renderTabConsorzi = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const chiamata = (nome) => server.chiamate.find(c => c.nome === nome);
    const errori = () => avvisi.filter(a => a.tipo === 'error').map(a => a.msg);

    test('_alCreate fonda il consorzio: paga, e manda al server quello che ha scritto il giocatore', async () => {
        R.conModulo(env, { 'al-name': 'Consorzio Aurora', 'al-tag': 'AUR',
                           'al-desc': 'I migliori', 'al-emblem': '🦅', 'al-open': true });
        server.rispondiCon('rpc_create_alliance', () => ({ data: 'alleanza-1', error: null }));
        const prima = env.sandbox.window.gameState.cash;

        await w._alCreate();

        assert.deepEqual(errori(), []);
        const c = chiamata('rpc_create_alliance');
        assert.ok(c, 'il server non è stato chiamato');
        assert.equal(c.args.p_name, 'Consorzio Aurora');
        assert.equal(c.args.p_tag, 'AUR');
        assert.equal(c.args.p_emblem, '🦅');
        assert.ok(env.sandbox.window.gameState.cash < prima, 'la fondazione non ha pagato niente');
    });

    test('_alCreate rifiuta un nome troppo corto senza toccare il denaro né il server', async () => {
        R.conModulo(env, { 'al-name': 'AB', 'al-tag': 'AUR' });
        const prima = env.sandbox.window.gameState.cash;

        await w._alCreate();

        assert.equal(env.sandbox.window.gameState.cash, prima, 'ha pagato per un consorzio che non ha fondato');
        assert.equal(chiamata('rpc_create_alliance'), undefined);
        assert.ok(errori().some(m => /corto/i.test(m)));
    });

    test('_alCreate restituisce i soldi se il server rifiuta', async () => {
        R.conModulo(env, { 'al-name': 'Consorzio Aurora', 'al-tag': 'AUR' });
        server.rispondiCon('rpc_create_alliance', () => ({ data: null, error: { message: 'TAG già in uso' } }));
        const prima = env.sandbox.window.gameState.cash;

        await w._alCreate();

        assert.equal(env.sandbox.window.gameState.cash, prima,
            'il server ha detto no e il giocatore ha pagato lo stesso');
        assert.ok(errori().some(m => /TAG/.test(m)));
    });

    test('_alDonate dona quello che c\'è scritto nel campo e scala DOPO la conferma del server', async () => {
        R.conConsorzio(env, { ruolo: 'leader' });
        R.conModulo(env, { 'al-donate': '25000' });
        server.rispondiCon('rpc_donate_to_alliance', () => ({ data: { ok: true }, error: null }));
        const prima = env.sandbox.window.gameState.cash;

        await w._alDonate();

        const c = chiamata('rpc_donate_to_alliance');
        assert.ok(c, 'la donazione non è arrivata al server');
        assert.equal(c.args.p_amount, 25000);
        assert.equal(env.sandbox.window.gameState.cash, prima - 25000);
    });

    test('_alDonate non scala niente se il server rifiuta', async () => {
        R.conConsorzio(env, { ruolo: 'leader' });
        R.conModulo(env, { 'al-donate': '25000' });
        server.rispondiCon('rpc_donate_to_alliance', () => ({ data: null, error: { message: 'non sei membro' } }));
        const prima = env.sandbox.window.gameState.cash;

        await w._alDonate();

        assert.equal(env.sandbox.window.gameState.cash, prima,
            'il denaro è uscito per una donazione che il server non ha accettato');
    });

    test('_alDonate rifiuta un importo non valido e uno più grande del saldo', async () => {
        R.conConsorzio(env, { ruolo: 'leader' });

        R.conModulo(env, { 'al-donate': '0' });
        await w._alDonate();
        assert.equal(chiamata('rpc_donate_to_alliance'), undefined, 'ha donato zero');

        R.conModulo(env, { 'al-donate': '999999999' });
        await w._alDonate();
        assert.equal(chiamata('rpc_donate_to_alliance'), undefined, 'ha donato più di quanto avesse');
        assert.ok(errori().some(m => /insufficienti/i.test(m)));
    });

    test('_alJoin, _alLeave e _alDisband parlano col server con la RPC giusta', async () => {
        R.conConsorzio(env, { ruolo: 'leader' });

        await w._alJoin('alleanza-2');
        assert.equal(chiamata('rpc_join_alliance').args.p_alliance_id, 'alleanza-2');

        await w._alLeave();
        assert.ok(chiamata('rpc_leave_alliance'), 'uscire dal consorzio non è arrivato al server');

        await w._alDisband();
        assert.ok(chiamata('rpc_disband_alliance'), 'sciogliere il consorzio non è arrivato al server');
    });

    test('_alKick e _alSetRole passano al server l\'utente e il ruolo', async () => {
        R.conConsorzio(env, { ruolo: 'leader' });

        await w._alKick('membro-7');
        assert.equal(chiamata('rpc_kick_member').args.p_user_id, 'membro-7');

        await w._alSetRole('membro-7', 'officer');
        const c = chiamata('rpc_set_member_role');
        assert.equal(c.args.p_user_id, 'membro-7');
        assert.equal(c.args.p_role, 'officer');
    });

    test('_alChat manda il messaggio e svuota il campo', async () => {
        R.conConsorzio(env, { ruolo: 'leader' });
        R.conModulo(env, { 'al-chat-input': 'ci vediamo a Milano' });

        await w._alChat();

        const c = chiamata('rpc_post_alliance_chat');
        assert.ok(c, 'il messaggio non è partito');
        assert.equal(c.args.p_message, 'ci vediamo a Milano');
        assert.equal(env.sandbox.document.getElementById('al-chat-input').value, '',
            'il campo è rimasto pieno: al prossimo invio manderebbe due volte lo stesso messaggio');
    });

    test('_alChat non manda un messaggio vuoto', async () => {
        R.conConsorzio(env, { ruolo: 'leader' });
        R.conModulo(env, { 'al-chat-input': '   ' });
        await w._alChat();
        assert.equal(chiamata('rpc_post_alliance_chat'), undefined);
    });

    test('_alPerk attiva il potenziamento pagando dal tesoro, non dalle tasche del leader', async () => {
        R.conConsorzio(env, { ruolo: 'leader' });
        server.rispondiCon('rpc_activate_alliance_perk', () => ({ data: '2026-09-01T00:00:00Z', error: null }));
        const prima = env.sandbox.window.gameState.cash;

        /* Il perk lo sceglie il giocatore da un elenco chiuso dentro alliances.js:
           un id inventato esce alla prima riga. Il primo che compare nel sorgente è
           quello su cui il gioco stesso apre la bottega. */
        const idPerk = /PERKS\s*=\s*\[\s*\{\s*id:\s*'([a-z_0-9]+)'/.exec(
            require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'alliances.js'), 'utf8'));
        assert.ok(idPerk, 'non trovo l\'elenco dei potenziamenti in alliances.js');

        await w._alPerk(idPerk[1]);

        assert.ok(chiamata('rpc_activate_alliance_perk'), 'l\'attivazione non è arrivata al server');
        assert.equal(env.sandbox.window.gameState.cash, prima,
            'il potenziamento si paga dal tesoro del consorzio: il leader non deve rimetterci di tasca sua');
    });
});

describe('sistemi/consorzi — i consorzi del mercato (p2p-render.js)', () => {
    let env, w, server, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        server = R.conGiocatoreCollegato(env);
        R.conSoldi(env, 5_000_000);
        avvisi = [];
        w.showNotification = (msg, tipo) => avvisi.push({ msg, tipo });
        w.renderTabInvestments = () => {};
    });
    afterEach(() => env.stopAllIntervals());

    const chiamata = (nome) => server.chiamate.find(c => c.nome === nome);

    test('createConsorzio manda nome e descrizione al server', async () => {
        server.rispondiCon('rpc_create_consorzio', () => ({ data: { name: 'Rete Nord' }, error: null }));
        await w.createConsorzio('Rete Nord', 'Lombardia e Piemonte');
        const c = chiamata('rpc_create_consorzio');
        assert.equal(c.args.v_name, 'Rete Nord');
        assert.equal(c.args.v_description, 'Lombardia e Piemonte');
    });

    test('ceCreateConsorzio legge i campi dello schermo e li passa a createConsorzio', async () => {
        R.conModulo(env, { 'cso-name': 'Rete Sud', 'cso-desc': 'Campania' });
        server.rispondiCon('rpc_create_consorzio', () => ({ data: { name: 'Rete Sud' }, error: null }));

        await w.ceCreateConsorzio();

        const c = chiamata('rpc_create_consorzio');
        assert.ok(c, 'il bottone dello schermo non ha fondato niente');
        assert.equal(c.args.v_name, 'Rete Sud');
    });

    test('contributeConsorzio scala solo dopo la conferma del server', async () => {
        server.rispondiCon('rpc_contribute_consorzio', () => ({ data: { ok: true }, error: null }));
        const prima = env.sandbox.window.gameState.cash;

        await w.contributeConsorzio('consorzio-1', 30000);

        assert.equal(chiamata('rpc_contribute_consorzio').args.v_amount, 30000);
        assert.equal(env.sandbox.window.gameState.cash, prima - 30000);
    });

    test('contributeConsorzio non scala niente se il server rifiuta', async () => {
        server.rispondiCon('rpc_contribute_consorzio', () => ({ data: null, error: { message: 'non sei membro' } }));
        const prima = env.sandbox.window.gameState.cash;

        await w.contributeConsorzio('consorzio-1', 30000);

        assert.equal(env.sandbox.window.gameState.cash, prima);
    });

    test('contributeConsorzio arrotonda e rifiuta gli importi impossibili', async () => {
        server.rispondiCon('rpc_contribute_consorzio', () => ({ data: { ok: true }, error: null }));

        await w.contributeConsorzio('consorzio-1', 1000.7);
        assert.equal(chiamata('rpc_contribute_consorzio').args.v_amount, 1001,
            'un importo con la virgola arriva al server come intero');

        server.chiamate.length = 0;
        await w.contributeConsorzio('consorzio-1', -5000);
        assert.equal(chiamata('rpc_contribute_consorzio'), undefined,
            'un contributo negativo avrebbe restituito denaro dal tesoro');

        await w.contributeConsorzio('consorzio-1', 99_999_999);
        assert.equal(chiamata('rpc_contribute_consorzio'), undefined,
            'ha contribuito più di quanto avesse in cassa');
    });

    test('ceConsorzioContribute legge l\'importo dal campo dello schermo', async () => {
        R.conModulo(env, { 'cso-contrib-amt': '7500' });
        server.rispondiCon('rpc_contribute_consorzio', () => ({ data: { ok: true }, error: null }));

        await w.ceConsorzioContribute('consorzio-1');

        assert.equal(chiamata('rpc_contribute_consorzio').args.v_amount, 7500);
    });

    test('joinConsorzio e leaveConsorzio usano le RPC del mercato, non quelle delle alleanze', async () => {
        await w.joinConsorzio('consorzio-9');
        assert.equal(chiamata('rpc_join_consorzio').args.v_consorzio_id, 'consorzio-9');
        assert.equal(chiamata('rpc_join_alliance'), undefined,
            'ha chiamato la RPC dell\'altro sistema: sono due funzioni diverse con lo stesso nome in italiano');

        await w.leaveConsorzio('consorzio-9');
        assert.equal(chiamata('rpc_leave_consorzio').args.v_consorzio_id, 'consorzio-9');
    });

    test('senza login nessuna di queste azioni parla col server', async () => {
        w.currentUser = null;
        env.sandbox.currentUser = null;

        await w.createConsorzio('X', 'Y');
        await w.joinConsorzio('c');
        await w.leaveConsorzio('c');
        await w.contributeConsorzio('c', 1000);

        assert.deepEqual(server.chiamate, [],
            'un utente non collegato è riuscito a toccare il mondo condiviso');
    });
});
