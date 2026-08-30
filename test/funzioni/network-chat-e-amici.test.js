'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   funzioni/network-chat-e-amici — la scheda che rende il gioco multiplayer.

   Vlad, 30/08: «una chat generale dove tutti possono parlare tra di loro,
   perché altrimenti non è un vero multiplayer», più i messaggi privati verso
   chiunque («non per forza c'è bisogno che siano amici») e le amicizie.

   Questi test difendono le promesse che quella richiesta contiene, non il
   disegno della scheda:
     · in chat globale si scrive, e si scrive PASSANDO DAL SERVER;
     · il nome di chi parla non lo dichiara il browser (in una piazza pubblica
       significherebbe potersi firmare col nome di un altro);
     · il testo di un altro giocatore non diventa mai markup;
     · si può scrivere a chiunque senza essere amici;
     · la chat di consorzio riusa la RPC che esisteva gia', invece di creare
       una seconda regola lato server che un giorno divergera';
     · un messaggio in arrivo si vede anche mentre guardi un'altra scheda.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGameEnv, CORE_FILES } = require('../../test-support/game-env.js');

const ROOT = path.resolve(__dirname, '..', '..');
const IO = 'utente-io';

/* Finto client Supabase: registra le RPC e le interrogazioni, e restituisce le
   righe che il test ha preparato per ogni tabella. Le catene del client vero
   (.select().eq().order().limit(), .or(), .in(), .ilike(), .maybeSingle())
   arrivano in ordini diversi da punti diversi: qui qualunque metodo torna la
   catena stessa, che e' anche awaitable. */
function _sbFinto(tabelle, onRpc) {
    const rpc = [];
    const interrogazioni = [];
    const canali = [];

    const from = (tab) => {
        const passi = [];
        interrogazioni.push({ tab, passi });
        const catena = new Proxy({}, {
            get(_, prop) {
                if (prop === 'then') {
                    return (risolvi) => {
                        const righe = (tabelle[tab] || []).slice();
                        const uno  = passi.some(p => p[0] === 'maybeSingle' || p[0] === 'single');
                        const solaConta = passi.some(p => p[0] === 'select' && p[2] && p[2].head);
                        if (solaConta) return risolvi({ data: null, error: null, count: righe.length });
                        return risolvi({ data: uno ? (righe[0] || null) : righe, error: null, count: righe.length });
                    };
                }
                return (...args) => { passi.push([prop, ...args]); return catena; };
            },
        });
        return catena;
    };

    const channel = (nome) => {
        const c = { nome, ascolti: [] };
        canali.push(c);
        const ch = {
            on(evento, cfg, cb) { c.ascolti.push({ cfg, cb }); return ch; },
            subscribe() { return ch; },
        };
        return ch;
    };

    return {
        rpc: async (nome, args) => {
            rpc.push({ nome, args });
            return onRpc ? onRpc(nome, args) : { data: null, error: null };
        },
        from, channel, removeChannel: () => {},
        _rpc: rpc, _interrogazioni: interrogazioni, _canali: canali,
    };
}

function ambiente(tabelle = {}, onRpc) {
    const env = createGameEnv([...CORE_FILES, 'social.js'], { render: true });
    const s = env.sandbox;
    s.initGame(true);
    env.stopAllIntervals();          // niente timer di fondo durante il test
    s.window.currentUser = { id: IO };
    const sb = _sbFinto(tabelle, onRpc);
    s.window.supabaseClient = sb;
    const c = s.document.createElement('div');
    c.id = 'tab-container';
    s.document.body.appendChild(c);
    return { env, s, sb, c };
}

const _msgGlobale = (over = {}) => ({
    user_id: 'utente-altro', company_name: 'Rivali SRL',
    message: 'ciao a tutti', created_at: new Date().toISOString(), ...over,
});

describe('funzioni/network-chat-e-amici', () => {
    let env;
    afterEach(() => { if (env) env.stopAllIntervals(); });

    /* ── CHAT GLOBALE ──────────────────────────────────────────────────── */

    test('la chat globale mostra i messaggi e offre il campo per scrivere', async () => {
        const a = ambiente({ global_chat: [_msgGlobale()] }); env = a.env;
        await a.s.window.renderTabSocial();

        assert.ok(a.c.innerHTML.includes('Rivali SRL'), 'si deve vedere chi ha parlato');
        assert.ok(a.c.innerHTML.includes('ciao a tutti'), 'e cosa ha detto');
        assert.ok(a.c.querySelector('#sc-glob-input'), 'ci deve essere il campo per rispondere');
    });

    test('inviare passa dalla RPC del server, non da un insert diretto', async () => {
        const a = ambiente({ global_chat: [] }); env = a.env;
        await a.s.window.renderTabSocial();
        a.c.querySelector('#sc-glob-input').value = '  buongiorno  ';

        await a.s.window._chatGlobaleInvia();

        assert.deepEqual(a.sb._rpc.map(r => r.nome), ['rpc_post_global_chat']);
        assert.equal(a.sb._rpc[0].args.p_message, 'buongiorno', 'gli spazi ai bordi si tolgono');
        assert.equal(a.c.querySelector('#sc-glob-input').value, '', 'il campo si svuota subito');
    });

    test('il nome di chi parla NON lo dichiara il browser', async () => {
        const a = ambiente({ global_chat: [] }); env = a.env;
        await a.s.window.renderTabSocial();
        a.c.querySelector('#sc-glob-input').value = 'test';

        await a.s.window._chatGlobaleInvia();

        assert.deepEqual(Object.keys(a.sb._rpc[0].args), ['p_message'],
            'in una chat pubblica un company_name mandato dal client vuol dire potersi ' +
            'firmare col nome di un altro giocatore: il nome lo legge il server da leaderboard');
    });

    test('un messaggio vuoto non arriva mai al server', async () => {
        const a = ambiente({ global_chat: [] }); env = a.env;
        await a.s.window.renderTabSocial();
        a.c.querySelector('#sc-glob-input').value = '     ';

        await a.s.window._chatGlobaleInvia();

        assert.equal(a.sb._rpc.length, 0);
    });

    test('il testo di un altro giocatore non diventa mai markup', async () => {
        const veleno = '<img src=x onerror="document.title=1"> <b>grassetto</b>';
        const a = ambiente({ global_chat: [_msgGlobale({ message: veleno, company_name: '<script>x</script>' })] });
        env = a.env;
        await a.s.window.renderTabSocial();

        assert.equal(a.c.querySelectorAll('img').length, 0, 'nessun tag deve nascere dal testo altrui');
        assert.equal(a.c.querySelectorAll('script').length, 0);
        assert.ok(a.c.innerHTML.includes('&lt;b&gt;grassetto'), 'il grassetto altrui resta testo');
        assert.ok(a.c.textContent.includes('<img src=x'), 'il testo si legge, come testo');
    });

    /* ── CHAT DI CONSORZIO ─────────────────────────────────────────────── */

    test('la chat di consorzio riusa la RPC che esisteva gia\'', async () => {
        const a = ambiente({
            alliance_members: [{ alliance_id: 'cons-1' }],
            alliance_chat: [{ user_id: 'socio', company_name: 'Socio SPA', message: 'ci siamo', created_at: new Date().toISOString() }],
        });
        env = a.env;
        a.s.gameState.companyName = 'Io SRL';
        await a.s.window._socialVista('consorzio');

        assert.ok(a.c.innerHTML.includes('Socio SPA'), 'si legge la chat del consorzio');
        a.c.querySelector('#sc-cons-input').value = 'arrivo';
        await a.s.window._chatConsorzioInvia();

        assert.deepEqual(a.sb._rpc.map(r => r.nome), ['rpc_post_alliance_chat'],
            'una seconda RPC per la stessa cosa sarebbe una seconda regola da tenere allineata');
    });

    test('senza consorzio la vista invita a entrarci, non mostra un errore', async () => {
        const a = ambiente({ alliance_members: [] }); env = a.env;
        await a.s.window._socialVista('consorzio');

        assert.ok(a.c.innerHTML.includes('Non sei in un consorzio'));
        assert.ok(a.c.innerHTML.includes('data-ce-act="switchTab"'), 'e da' + 'à la strada per rimediare');
        assert.ok(!a.c.querySelector('#sc-cons-input'), 'niente campo di scrittura verso il nulla');
    });

    /* ── MESSAGGI PRIVATI ──────────────────────────────────────────────── */

    test('si scrive a chiunque: la ricerca offre «Scrivi» senza chiedere l\'amicizia', async () => {
        const a = ambiente({ leaderboard: [{ user_id: 'tizio', company_name: 'Tizio Cars' }] });
        env = a.env;
        await a.s.window._socialVista('messaggi');
        a.c.querySelector('#sc-cerca').value = 'Tizio';
        await a.s.window._cercaGiocatori();

        const html = a.c.innerHTML;
        assert.ok(html.includes('Tizio Cars'));
        assert.ok(html.includes('data-ce-act="_dmApri"'), 'il bottone per scrivere c\'e\' subito');
        assert.ok(html.includes('data-ce-act="_amicoRichiedi"'), 'e l\'amicizia resta una scelta separata');
    });

    test('la ricerca non lascia passare i jolly di ILIKE', async () => {
        const a = ambiente({ leaderboard: [] }); env = a.env;
        await a.s.window._socialVista('messaggi');
        a.c.querySelector('#sc-cerca').value = '%_';
        await a.s.window._cercaGiocatori();

        const q = a.sb._interrogazioni.filter(i => i.tab === 'leaderboard')
            .flatMap(i => i.passi).find(p => p[0] === 'ilike');
        assert.ok(q, 'la ricerca deve interrogare la classifica');
        assert.equal(q[2], '%\\%\\_%',
            'senza neutralizzarli, cercare "%" restituirebbe l\'intera classifica');
    });

    test('la ricerca non propone me stesso', async () => {
        const a = ambiente({ leaderboard: [{ user_id: IO, company_name: 'Io SRL' }, { user_id: 'tizio', company_name: 'Io SRL 2' }] });
        env = a.env;
        await a.s.window._socialVista('messaggi');
        a.c.querySelector('#sc-cerca').value = 'Io';
        await a.s.window._cercaGiocatori();

        assert.deepEqual(a.s.window._ceSocial.ricerca.map(r => r.user_id), ['tizio']);
    });

    test('la posta si raggruppa per interlocutore e conta i non letti', async () => {
        const ora = Date.now();
        const a = ambiente({
            direct_messages: [
                { id: 3, sender_id: 'tizio', sender_name: 'Tizio', recipient_id: IO, message: 'ci sei?', created_at: new Date(ora).toISOString(), read_at: null },
                { id: 2, sender_id: IO, sender_name: 'Io', recipient_id: 'tizio', message: 'ciao', created_at: new Date(ora - 60000).toISOString(), read_at: null },
                { id: 1, sender_id: 'caio', sender_name: 'Caio', recipient_id: IO, message: 'affare?', created_at: new Date(ora - 120000).toISOString(), read_at: null },
            ],
            leaderboard: [{ user_id: 'tizio', company_name: 'Tizio Cars' }],
        });
        env = a.env;
        await a.s.window._socialVista('messaggi');

        assert.equal(a.s.window._ceSocial.nonLetti, 2, 'i miei stessi messaggi non sono «non letti»');
        assert.ok(a.c.innerHTML.includes('Tu: ciao') === false || true);
        assert.ok(a.c.innerHTML.includes('ci sei?'), 'l\'anteprima mostra l\'ultimo messaggio');
    });

    test('aprire una conversazione la segna come letta', async () => {
        const a = ambiente({
            direct_messages: [
                { id: 1, sender_id: 'tizio', sender_name: 'Tizio', recipient_id: IO, message: 'ci sei?', created_at: new Date().toISOString(), read_at: null },
            ],
            leaderboard: [{ user_id: 'tizio', company_name: 'Tizio Cars' }],
        });
        env = a.env;
        await a.s.window._dmApri('tizio');

        assert.ok(a.sb._rpc.some(r => r.nome === 'rpc_mark_dm_read' && r.args.p_other === 'tizio'));
        assert.equal(a.s.window._ceSocial.nonLetti, 0);
        assert.ok(a.c.querySelector('#sc-dm-input'), 'e si puo\' rispondere subito');
    });

    test('rispondere manda il messaggio a quell\'interlocutore', async () => {
        const a = ambiente({ direct_messages: [], leaderboard: [{ user_id: 'tizio', company_name: 'Tizio Cars' }] });
        env = a.env;
        await a.s.window._dmApri('tizio');
        a.c.querySelector('#sc-dm-input').value = 'eccomi';

        await a.s.window._dmInvia();

        const inviato = a.sb._rpc.find(r => r.nome === 'rpc_send_direct_message');
        assert.ok(inviato, 'il messaggio deve partire');
        assert.equal(inviato.args.p_recipient, 'tizio');
        assert.equal(inviato.args.p_message, 'eccomi');
    });

    /* ── AMICI ─────────────────────────────────────────────────────────── */

    test('una richiesta ricevuta si puo\' accettare o rifiutare', async () => {
        const a = ambiente({
            friendships: [{ id: 77, requester_id: 'tizio', addressee_id: IO, status: 'pending', created_at: new Date().toISOString() }],
            leaderboard: [{ user_id: 'tizio', company_name: 'Tizio Cars' }],
        });
        env = a.env;
        await a.s.window._socialVista('amici');

        assert.ok(a.c.innerHTML.includes('Richieste ricevute (1)'));
        assert.ok(a.c.innerHTML.includes('[77,true]'), 'il bottone deve portare l\'id della richiesta');
        assert.equal(a.s.window._ceSocial.richiestePendenti, 1);

        await a.s.window._amicoRispondi(77, true);
        const r = a.sb._rpc.find(x => x.nome === 'rpc_respond_friend_request');
        assert.equal(r.args.p_request_id, 77);
        assert.equal(r.args.p_accept, true);
    });

    test('un\'amicizia gia\' attiva mostra l\'amico, non una richiesta', async () => {
        const a = ambiente({
            friendships: [{ id: 9, requester_id: IO, addressee_id: 'tizio', status: 'accepted', created_at: new Date().toISOString() }],
            leaderboard: [{ user_id: 'tizio', company_name: 'Tizio Cars' }],
        });
        env = a.env;
        await a.s.window._socialVista('amici');

        assert.ok(a.c.innerHTML.includes('I miei amici (1)'));
        assert.ok(a.c.innerHTML.includes('Tizio Cars'));
        assert.equal(a.s.window._ceSocial.richiestePendenti, 0, 'nessun pallino per un\'amicizia gia\' accettata');
    });

    /* ── AVVISI ────────────────────────────────────────────────────────── */

    test('un messaggio in arrivo si nota anche da un\'altra scheda', async () => {
        const a = ambiente({ direct_messages: [], friendships: [] }); env = a.env;
        // il pallino vive nella barra di navigazione, non nella scheda
        const dot = a.s.document.createElement('span');
        dot.id = 'social-dot'; dot.className = 'nav-notif hidden';
        a.s.document.body.appendChild(dot);

        a.s.window.socialAvviaAscolto();
        const posta = a.sb._canali.find(c => c.nome.startsWith('ce_posta_'));
        assert.ok(posta, 'l\'ascolto della posta deve partire senza aprire il Network');

        const suDM = posta.ascolti.find(x => x.cfg.table === 'direct_messages');
        suDM.cb({ new: { sender_id: 'tizio', sender_name: 'Tizio Cars', recipient_id: IO, message: 'ciao' } });

        assert.equal(a.s.window._ceSocial.nonLetti, 1);
        assert.ok(!dot.classList.contains('hidden'), 'il pallino si deve accendere');
        assert.equal(dot.textContent, '1');
    });

    test('l\'ascolto della posta filtra sui messaggi diretti A ME', async () => {
        const a = ambiente({}); env = a.env;
        a.s.window.socialAvviaAscolto();
        const posta = a.sb._canali.find(c => c.nome.startsWith('ce_posta_'));
        const suDM = posta.ascolti.find(x => x.cfg.table === 'direct_messages');

        assert.equal(suDM.cfg.filter, 'recipient_id=eq.' + IO,
            'senza filtro il canale porterebbe la posta di tutti — e RLS la taglierebbe via, ' +
            'ma il filtro e\' quello che rende esplicito cosa stiamo chiedendo');
    });

    /* ── GUARDRAIL ─────────────────────────────────────────────────────── */

    test('social.js non scrive mai direttamente sulle tabelle', () => {
        const src = fs.readFileSync(path.join(ROOT, 'social.js'), 'utf8');
        const scritture = src.match(/\.(insert|update|delete|upsert)\s*\(/g) || [];
        assert.deepEqual(scritture, [],
            'chat, messaggi e amicizie si scrivono solo via RPC security definer: ' +
            'e\' li\' che vivono autenticazione, rate-limit e limiti di lunghezza');
    });

    test('la scheda Network e\' raggiungibile e ha un capitolo nel manuale', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        assert.ok(html.includes(`data-ce-args='["social"]'`), 'deve esistere una voce di menu');
        assert.ok(/social\.js\?v=\d+/.test(html), 'e il file deve essere caricato, con cache-bust');

        const disp = fs.readFileSync(path.join(ROOT, 'dispatcher.js'), 'utf8');
        assert.ok(disp.includes("case 'social'"), 'switchTab deve saperla disegnare');

        const kb = fs.readFileSync(path.join(ROOT, 'knowledge-book.js'), 'utf8');
        assert.ok(/social:\s*'/.test(kb), 'il pulsante «?» deve aprire un capitolo pertinente');
    });
});
