'use strict';
/* ============================================================================
   test/funzioni/alleanze.test.js — Tab Consorzi e Alleanze (alliances.js)

   Verifica del funzionamento della feature "alleanze" (attualmente disattivata in config.js).
   Collauda tutte le azioni esposte:
   - renderTabConsorzi (vista non loggato, browse consorzi, vista membro/leader)
   - _alCreate (creazione consorzio con validazione e spesa)
   - _alJoin (ingresso in un consorzio)
   - _alLeave (uscita dal consorzio)
   - _alDisband (scioglimento consorzio da parte del leader)
   - _alDonate (donazione al tesoro del consorzio con spesa e sincronizzazione)
   - _alChat e ceAlChatEnter (invio messaggi nella chat di gruppo)
   - _alKick (espulsione membro)
   - _alSetRole (promozione/declassamento membro)
   - _alPerk (attivazione perk dal tesoro comune)
   - _allyRefreshPerk e _allyPerkMult (calcolo e applicazione buff su corse e carburante)
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

function createSupabaseMock(initialData = {}) {
    const db = {
        alliances: initialData.alliances || [],
        alliance_members: initialData.alliance_members || [],
        alliance_chat: initialData.alliance_chat || [],
    };
    const rpcCalls = [];
    const updates = [];
    let channels = [];

    const mock = {
        _db: db,
        _rpcCalls: rpcCalls,
        _updates: updates,
        _channels: channels,
        rpc: async (fn, args) => {
            rpcCalls.push({ fn, args });
            if (fn === 'rpc_create_alliance') {
                const newId = 'ally_' + (db.alliances.length + 1);
                db.alliances.push({
                    id: newId,
                    name: args.p_name,
                    tag: args.p_tag,
                    description: args.p_description,
                    emblem: args.p_emblem,
                    member_count: 1,
                    treasury: 0,
                    is_open: true,
                });
                db.alliance_members.push({
                    alliance_id: newId,
                    user_id: 'usr_me',
                    company_name: args.p_company_name,
                    role: 'leader',
                    contribution: 0,
                });
                return { data: newId, error: null };
            }
            if (fn === 'rpc_join_alliance') {
                const al = db.alliances.find(a => a.id === args.p_alliance_id);
                if (al) {
                    al.member_count = (al.member_count || 0) + 1;
                    db.alliance_members.push({
                        alliance_id: args.p_alliance_id,
                        user_id: 'usr_me',
                        company_name: args.p_company_name,
                        role: 'member',
                        contribution: 0,
                    });
                }
                return { data: 'joined', error: null };
            }
            if (fn === 'rpc_leave_alliance') {
                db.alliance_members = db.alliance_members.filter(m => m.user_id !== 'usr_me');
                return { data: true, error: null };
            }
            if (fn === 'rpc_disband_alliance') {
                db.alliances = [];
                db.alliance_members = [];
                return { data: true, error: null };
            }
            if (fn === 'rpc_donate_to_alliance') {
                const mem = db.alliance_members.find(m => m.user_id === 'usr_me');
                if (mem) {
                    mem.contribution = (mem.contribution || 0) + args.p_amount;
                    const al = db.alliances.find(a => a.id === mem.alliance_id);
                    if (al) al.treasury = (al.treasury || 0) + args.p_amount;
                }
                return { data: true, error: null };
            }
            if (fn === 'rpc_post_alliance_chat') {
                const mem = db.alliance_members.find(m => m.user_id === 'usr_me');
                const aid = mem ? mem.alliance_id : 'ally_1';
                db.alliance_chat.push({
                    alliance_id: aid,
                    user_id: 'usr_me',
                    company_name: args.p_company_name,
                    message: args.p_message,
                    created_at: new Date().toISOString(),
                });
                return { data: true, error: null };
            }
            if (fn === 'rpc_kick_member') {
                db.alliance_members = db.alliance_members.filter(m => m.user_id !== args.p_user_id);
                return { data: true, error: null };
            }
            if (fn === 'rpc_set_member_role') {
                const mem = db.alliance_members.find(m => m.user_id === args.p_user_id);
                if (mem) mem.role = args.p_role;
                return { data: true, error: null };
            }
            if (fn === 'rpc_activate_alliance_perk') {
                const until = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
                const mem = db.alliance_members.find(m => m.user_id === 'usr_me');
                if (mem) {
                    const al = db.alliances.find(a => a.id === mem.alliance_id);
                    if (al) {
                        al.perk_type = args.p_perk;
                        al.perk_until = until;
                    }
                }
                return { data: until, error: null };
            }
            return { data: null, error: null };
        },
        from: (table) => {
            let filters = [];
            let orderCol = null;
            let orderAsc = true;
            let limitVal = null;

            const chain = {
                select: () => chain,
                upsert: async () => ({ data: null, error: null }),
                eq: (col, val) => {
                    filters.push({ col, val });
                    return chain;
                },
                order: (col, opt = {}) => {
                    orderCol = col;
                    orderAsc = opt.ascending !== false;
                    return chain;
                },
                limit: (n) => {
                    limitVal = n;
                    return chain;
                },
                update: (fields) => ({
                    eq: async (col, val) => {
                        updates.push({ table, fields, col, val });
                        const rows = db[table] || [];
                        for (const r of rows) {
                            if (r[col] === val) Object.assign(r, fields);
                        }
                        return { data: null, error: null };
                    },
                }),
                then: (resolve) => {
                    let rows = [...(db[table] || [])];
                    for (const f of filters) {
                        rows = rows.filter(r => r[f.col] === f.val);
                    }
                    if (orderCol) {
                        rows.sort((a, b) => {
                            if (a[orderCol] < b[orderCol]) return orderAsc ? -1 : 1;
                            if (a[orderCol] > b[orderCol]) return orderAsc ? 1 : -1;
                            return 0;
                        });
                    }
                    if (limitVal) rows = rows.slice(0, limitVal);
                    resolve({ data: rows, error: null });
                },
                maybeSingle: async () => {
                    let rows = [...(db[table] || [])];
                    for (const f of filters) {
                        rows = rows.filter(r => r[f.col] === f.val);
                    }
                    return { data: rows[0] || null, error: null };
                },
            };
            return chain;
        },
        channel: (chanName) => {
            const chan = {
                name: chanName,
                on: () => chan,
                subscribe: () => chan,
            };
            channels.push(chan);
            return chan;
        },
        removeChannel: (chan) => {
            channels = channels.filter(c => c !== chan);
        },
    };

    return mock;
}

describe('funzione alleanze — consorzi tra aziende (alliances.js)', () => {
    let env, sandbox, gs, sbMock;
    let syncedCashCalls;

    beforeEach(() => {
        syncedCashCalls = [];
        env = freshEnv({
            render: true,
            serverState: {
                syncCash: async (cash) => {
                    syncedCashCalls.push(cash);
                    sandbox.gameState.cash = cash;
                    return { success: true, cash };
                },
            },
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;
        gs.cash = 100000;
        gs.companyName = 'Flotta Romana SpA';

        sbMock = createSupabaseMock();
        sandbox.supabaseClient = sbMock;
        sandbox.window.supabaseClient = sbMock;
        sandbox.currentUser = { id: 'usr_me' };
        sandbox.window.currentUser = sandbox.currentUser;
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    describe('renderTabConsorzi — stati della vista', () => {
        test('mostra avviso di login richiesto se currentUser non è presente', async () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.renderTabConsorzi();

            const html = container.innerHTML;
            assert.ok(html.includes('Consorzi non disponibili'), 'manca messaggio non disponibili');
            assert.ok(html.includes('Accedi al tuo account'), 'manca invito al login');
        });

        test('mostra vista Browse e creazione se il giocatore non appartiene ad alcun consorzio', async () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            sbMock._db.alliances.push({
                id: 'ally_pub',
                name: 'Consorzio Capitolino',
                tag: 'CCAP',
                description: 'La flotta unita di Roma',
                emblem: '🏛️',
                member_count: 5,
                treasury: 120000,
                is_open: true,
            });

            await sandbox.renderTabConsorzi();

            const html = container.innerHTML;
            assert.ok(html.includes('Fonda un Consorzio'), 'manca modulo per fondare');
            assert.ok(html.includes('Consorzio Capitolino'), 'manca consorzio pubblico a elenco');
            assert.ok(html.includes('data-ce-act="_alJoin"'), 'manca bottone Entra');
            assert.ok(html.includes('data-ce-act="_alCreate"'), 'manca bottone Fonda');
        });

        test('mostra vista Membro completa con bottega perk, cassa, membri e chat se già iscritto', async () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            sbMock._db.alliances.push({
                id: 'ally_1',
                name: 'Consorzio Impero',
                tag: 'IMP',
                description: 'Unione di prestigio',
                emblem: '🦅',
                member_count: 2,
                treasury: 75000,
                is_open: true,
                perk_type: 'boost_income',
                perk_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            });
            sbMock._db.alliance_members.push(
                { alliance_id: 'ally_1', user_id: 'usr_me', company_name: 'Flotta Romana SpA', role: 'leader', contribution: 50000 },
                { alliance_id: 'ally_1', user_id: 'usr_other', company_name: 'Aurelia Express', role: 'member', contribution: 25000 }
            );
            sbMock._db.alliance_chat.push(
                { alliance_id: 'ally_1', user_id: 'usr_other', company_name: 'Aurelia Express', message: 'Benvenuti nel consorzio!', created_at: new Date().toISOString() }
            );

            await sandbox.renderTabConsorzi();

            const html = container.innerHTML;
            assert.ok(html.includes('Consorzio Impero'), 'manca titolo consorzio');
            assert.ok(html.includes('Tesoro del Consorzio'), 'manca sezione tesoro');
            assert.ok(html.includes('Bottega del Consorzio'), 'manca bottega dei perk');
            assert.ok(html.includes('Boost Ricavi · ATTIVO'), 'manca indicazione perk attivo');
            assert.ok(html.includes('Aurelia Express'), 'manca secondo membro nel roster');
            assert.ok(html.includes('Benvenuti nel consorzio!'), 'manca messaggio in chat');
            assert.ok(html.includes('data-ce-act="_alDisband"'), 'leader deve avere opzione Sciogli');
            assert.ok(html.includes('data-ce-act="_alDonate"'), 'manca opzione Dona');
            assert.ok(html.includes('data-ce-act="_alChat"'), 'manca invio Chat');
        });
    });

    describe('_alCreate — fondazione consorzio', () => {
        test('crea con successo un consorzio scalando 25.000€ e chiamando RPC', async () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            sandbox.document.body.innerHTML += `
                <input id="al-name" value="Nuova Alleanza">
                <input id="al-tag" value="NALL">
                <input id="al-desc" value="Consorzio di prova">
                <input id="al-emblem" value="🛡️">
                <input id="al-open" type="checkbox" checked>
            `;

            gs.cash = 60000;
            await sandbox._alCreate();

            assert.equal(gs.cash, 35000, 'la cassa deve diminuire di 25.000€');
            assert.deepEqual(syncedCashCalls, [35000]);
            assert.equal(sbMock._rpcCalls.length, 1);
            assert.equal(sbMock._rpcCalls[0].fn, 'rpc_create_alliance');
            assert.equal(sbMock._rpcCalls[0].args.p_name, 'Nuova Alleanza');
            assert.equal(sbMock._rpcCalls[0].args.p_tag, 'NALL');
            assert.ok(env.notifications.some(n => n.msg.includes('Consorzio fondato')));
        });

        test('rifiuta la creazione se il nome ha meno di 3 caratteri', async () => {
            sandbox.document.body.innerHTML = `
                <input id="al-name" value="AB">
                <input id="al-tag" value="TAG">
            `;
            gs.cash = 50000;

            await sandbox._alCreate();

            assert.equal(gs.cash, 50000);
            assert.equal(sbMock._rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Nome troppo corto')));
        });

        test('rifiuta la creazione se il tag ha meno di 2 caratteri', async () => {
            sandbox.document.body.innerHTML = `
                <input id="al-name" value="Alleanza Valida">
                <input id="al-tag" value="A">
            `;
            gs.cash = 50000;

            await sandbox._alCreate();

            assert.equal(gs.cash, 50000);
            assert.equal(sbMock._rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('TAG troppo corto')));
        });

        test('se il consorzio è creato come chiuso (open false) aggiorna la tabella alliances', async () => {
            sandbox.document.body.innerHTML = `
                <input id="al-name" value="Consorzio Privato">
                <input id="al-tag" value="PRIV">
                <input id="al-desc" value="Solo su invito">
                <input id="al-emblem" value="🔒">
                <input id="al-open" type="checkbox">
            `;
            gs.cash = 50000;

            await sandbox._alCreate();

            assert.equal(sbMock._rpcCalls[0].fn, 'rpc_create_alliance');
            assert.ok(sbMock._updates.some(u => u.table === 'alliances' && u.fields.is_open === false));
        });
    });

    describe('_alJoin — adesione a un consorzio', () => {
        test('invia la chiamata RPC rpc_join_alliance con id e nome azienda', async () => {
            sbMock._db.alliances.push({
                id: 'ally_target',
                name: 'Consorzio Destinazione',
                tag: 'DEST',
                member_count: 1,
                treasury: 0,
                is_open: true,
            });

            await sandbox._alJoin('ally_target');

            assert.equal(sbMock._rpcCalls.length, 1);
            assert.equal(sbMock._rpcCalls[0].fn, 'rpc_join_alliance');
            assert.equal(sbMock._rpcCalls[0].args.p_alliance_id, 'ally_target');
            assert.equal(sbMock._rpcCalls[0].args.p_company_name, 'Flotta Romana SpA');
            assert.ok(env.notifications.some(n => n.msg.includes('Sei entrato nel consorzio')));
        });
    });

    describe('_alLeave — abbandono consorzio', () => {
        test('invia la chiamata RPC rpc_leave_alliance e mostra notifica', async () => {
            sbMock._db.alliance_members.push({
                alliance_id: 'ally_1',
                user_id: 'usr_me',
                company_name: 'Flotta Romana SpA',
                role: 'member',
            });

            await sandbox._alLeave();

            assert.equal(sbMock._rpcCalls.length, 1);
            assert.equal(sbMock._rpcCalls[0].fn, 'rpc_leave_alliance');
            assert.ok(env.notifications.some(n => n.msg.includes('Hai lasciato il consorzio')));
        });
    });

    describe('_alDisband — scioglimento consorzio da parte del leader', () => {
        test('invia la chiamata RPC rpc_disband_alliance e disiscrive dalla chat', async () => {
            sbMock._db.alliances.push({ id: 'ally_1', name: 'Mio Consorzio' });
            sbMock._db.alliance_members.push({ alliance_id: 'ally_1', user_id: 'usr_me', role: 'leader' });

            await sandbox._alDisband();

            assert.equal(sbMock._rpcCalls.length, 1);
            assert.equal(sbMock._rpcCalls[0].fn, 'rpc_disband_alliance');
            assert.ok(env.notifications.some(n => n.msg.includes('Consorzio sciolto')));
        });
    });

    describe('_alDonate — donazione alla cassa comune', () => {
        test('scala i soldi tramite CE_money, invia rpc_donate_to_alliance e sincronizza con ServerState', async () => {
            sandbox.document.body.innerHTML = '<input id="al-donate" value="10000">';
            gs.cash = 40000;

            await sandbox._alDonate();

            assert.equal(gs.cash, 30000, 'la cassa deve essere scalata di 10.000€');
            assert.deepEqual(syncedCashCalls, [30000]);
            assert.equal(sbMock._rpcCalls.length, 1);
            assert.equal(sbMock._rpcCalls[0].fn, 'rpc_donate_to_alliance');
            assert.equal(sbMock._rpcCalls[0].args.p_amount, 10000);
            assert.ok(env.notifications.some(n => n.msg.includes('Hai donato')));
        });

        test('con importo <= 0 o non valido rifiuta la donazione', async () => {
            sandbox.document.body.innerHTML = '<input id="al-donate" value="-500">';
            gs.cash = 40000;

            await sandbox._alDonate();

            assert.equal(gs.cash, 40000);
            assert.equal(sbMock._rpcCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Importo non valido')));
        });
    });

    describe('chat consorzio (_alChat e ceAlChatEnter)', () => {
        test('_alChat invia il messaggio via rpc_post_alliance_chat e svuota l input', async () => {
            sandbox.document.body.innerHTML = '<input id="al-chat-input" value="Ciao a tutti i soci!">';

            await sandbox._alChat();

            const input = sandbox.document.getElementById('al-chat-input');
            assert.equal(input.value, '');
            assert.equal(sbMock._rpcCalls.length, 1);
            assert.equal(sbMock._rpcCalls[0].fn, 'rpc_post_alliance_chat');
            assert.equal(sbMock._rpcCalls[0].args.p_message, 'Ciao a tutti i soci!');
            assert.equal(sbMock._rpcCalls[0].args.p_company_name, 'Flotta Romana SpA');
        });

        test('_alChat non invia nulla se l input è vuoto o composto solo da spazi', async () => {
            sandbox.document.body.innerHTML = '<input id="al-chat-input" value="   ">';

            await sandbox._alChat();

            assert.equal(sbMock._rpcCalls.length, 0);
        });

        test('ceAlChatEnter chiama _alChat alla pressione del tasto Enter', async () => {
            let chatChiamata = false;
            sandbox._alChat = async () => { chatChiamata = true; };

            sandbox.ceAlChatEnter({ key: 'Enter' });
            assert.equal(chatChiamata, true);

            chatChiamata = false;
            sandbox.ceAlChatEnter({ key: 'a' });
            assert.equal(chatChiamata, false);
        });
    });

    describe('gestione membri consorzio (_alKick e _alSetRole)', () => {
        test('_alKick invia rpc_kick_member con user_id bersaglio', async () => {
            await sandbox._alKick('usr_fannullone');

            assert.equal(sbMock._rpcCalls.length, 1);
            assert.equal(sbMock._rpcCalls[0].fn, 'rpc_kick_member');
            assert.equal(sbMock._rpcCalls[0].args.p_user_id, 'usr_fannullone');
        });

        test('_alSetRole invia rpc_set_member_role con user_id e nuovo ruolo', async () => {
            await sandbox._alSetRole('usr_braccio_destro', 'officer');

            assert.equal(sbMock._rpcCalls.length, 1);
            assert.equal(sbMock._rpcCalls[0].fn, 'rpc_set_member_role');
            assert.equal(sbMock._rpcCalls[0].args.p_user_id, 'usr_braccio_destro');
            assert.equal(sbMock._rpcCalls[0].args.p_role, 'officer');
        });
    });

    describe('bottega dei perk consorzio (_alPerk, _allyRefreshPerk, _allyPerkMult)', () => {
        test('_alPerk attiva un perk dal tesoro comune via rpc_activate_alliance_perk e memorizza il perk attivo', async () => {
            await sandbox._alPerk('boost_income');

            assert.equal(sbMock._rpcCalls.length, 1);
            assert.equal(sbMock._rpcCalls[0].fn, 'rpc_activate_alliance_perk');
            assert.equal(sbMock._rpcCalls[0].args.p_perk, 'boost_income');
            assert.ok(sandbox._allyActivePerk);
            assert.equal(sandbox._allyActivePerk.type, 'boost_income');
            assert.ok(env.notifications.some(n => n.msg.includes('Boost Ricavi attivato')));
        });

        test('_alPerk con ID perk inesistente viene ignorato senza chiamare RPC', async () => {
            await sandbox._alPerk('perk_inventato');

            assert.equal(sbMock._rpcCalls.length, 0);
        });

        test('_allyRefreshPerk aggiorna la cache del perk leggendo dal database', async () => {
            sbMock._db.alliance_members.push({
                alliance_id: 'ally_10',
                user_id: 'usr_me',
            });
            sbMock._db.alliances.push({
                id: 'ally_10',
                perk_type: 'fuel_save',
                perk_until: new Date(Date.now() + 100000).toISOString(),
            });

            await sandbox._allyRefreshPerk();

            assert.ok(sandbox._allyActivePerk);
            assert.equal(sandbox._allyActivePerk.type, 'fuel_save');
        });

        test('_allyRefreshPerk azzera il perk se il timestamp until è nel passato', async () => {
            sbMock._db.alliance_members.push({
                alliance_id: 'ally_10',
                user_id: 'usr_me',
            });
            sbMock._db.alliances.push({
                id: 'ally_10',
                perk_type: 'fuel_save',
                perk_until: new Date(Date.now() - 10000).toISOString(), // scaduto
            });

            await sandbox._allyRefreshPerk();

            assert.equal(sandbox._allyActivePerk, null);
        });

        test('_allyPerkMult restituisce il moltiplicatore corretto per earnings e fuel quando attivo', () => {
            sandbox._allyActivePerk = {
                type: 'boost_income',
                until: new Date(Date.now() + 100000).toISOString(),
            };

            assert.equal(sandbox._allyPerkMult('earnings'), 1.12);
            assert.equal(sandbox._allyPerkMult('fuel'), 1.0);

            sandbox._allyActivePerk = {
                type: 'fuel_save',
                until: new Date(Date.now() + 100000).toISOString(),
            };
            assert.equal(sandbox._allyPerkMult('fuel'), 0.85);
            assert.equal(sandbox._allyPerkMult('earnings'), 1.0);

            sandbox._allyActivePerk = {
                type: 'mega_income',
                until: new Date(Date.now() + 100000).toISOString(),
            };
            assert.equal(sandbox._allyPerkMult('earnings'), 1.25);
        });

        test('_allyPerkMult restituisce 1.0 se il perk è scaduto o non presente', () => {
            sandbox._allyActivePerk = null;
            assert.equal(sandbox._allyPerkMult('earnings'), 1.0);

            sandbox._allyActivePerk = {
                type: 'boost_income',
                until: new Date(Date.now() - 1000).toISOString(), // scaduto
            };
            assert.equal(sandbox._allyPerkMult('earnings'), 1.0);
        });
    });

    describe('impatto economico effettivo dei perk nel motore di gioco', () => {
        test('il perk boost_income aumenta i ricavi effettivi accreditati alla cassa al termine di una corsa', () => {
            const initialCash = 10000;
            gs.cash = initialCash;

            // Prepariamo una corsa completata
            const driver = gs.drivers[0];
            const car = gs.vehicles[0];
            const testRide = {
                id: 'ride_perk_test',
                distance: 10,
                price: 1000,
                status: 'completed',
                driverId: driver.id,
                vehicleId: car.id,
                tier: 'standard',
                regionId: 'lazio',
                pickupName: 'Roma Centro',
                dropoffName: 'Fiumicino',
            };

            // Eseguiamo senza perk
            sandbox._allyActivePerk = null;
            sandbox.completeRide(testRide);
            const cashSenzaPerk = gs.cash;
            const incassoSenzaPerk = cashSenzaPerk - initialCash;

            // Reset cassa ed eseguiamo con perk boost_income (+12%)
            gs.cash = initialCash;
            sandbox._allyActivePerk = {
                type: 'boost_income',
                until: new Date(Date.now() + 100000).toISOString(),
            };
            sandbox.completeRide(testRide);
            const incassoConPerk = gs.cash - initialCash;

            assert.ok(incassoConPerk > incassoSenzaPerk, 'il perk deve incrementare l incasso netto');
            // Il rapporto degli incassi lordi deve riflettere il bonus 1.12
            assert.equal(Math.round((incassoConPerk / incassoSenzaPerk) * 100) / 100, 1.12);
        });
    });
});
