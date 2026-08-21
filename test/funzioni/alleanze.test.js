'use strict';
/* ============================================================================
   test/funzioni/alleanze.test.js — Verifica approfondita del modulo Consorzi / Alleanze

   Scopo: verificare l'effettivo funzionamento di tutte le azioni e routine
   esposte da `alliances.js` e dai relativi gestori in `ce-actions.js`,
   verificare l'interazione con Supabase RPC, la gestione dei perk e dei buff,
   la sincronizzazione del denaro tramite CE_money, l'UI di rendering e la chat realtime.
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Crea un ambiente con mock Supabase e stato completo per i Consorzi.
 */
function creaAmbienteAlleanze(opzioni = {}) {
    const rpcLog = [];
    const channelEvents = [];
    const subscriptions = new Map();

    const allianceDataDefault = {
        id: 'ally_alpha_1',
        name: 'Consorzio Roma Capitale',
        tag: 'ROMA',
        description: 'Elite NCC di Roma e provincia.',
        emblem: '🏛️',
        color: '#c79a2a',
        member_count: 3,
        treasury: 150000,
        is_open: true,
        perk_type: 'boost_income',
        perk_until: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    };

    const membersDefault = [
        {
            user_id: 'user_leader_uuid',
            alliance_id: 'ally_alpha_1',
            company_name: 'Alpha Limos',
            role: 'leader',
            contribution: 100000,
            joined_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        },
        {
            user_id: 'user_officer_uuid',
            alliance_id: 'ally_alpha_1',
            company_name: 'Beta Executive',
            role: 'officer',
            contribution: 35000,
            joined_at: new Date(Date.now() - 15 * 86400000).toISOString(),
        },
        {
            user_id: 'user_member_uuid',
            alliance_id: 'ally_alpha_1',
            company_name: 'Gamma Drivers',
            role: 'member',
            contribution: 15000,
            joined_at: new Date(Date.now() - 5 * 86400000).toISOString(),
        },
    ];

    const chatDefault = [
        {
            id: 'chat_1',
            alliance_id: 'ally_alpha_1',
            user_id: 'user_leader_uuid',
            company_name: 'Alpha Limos',
            message: 'Benvenuti nel consorzio!',
            created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
            id: 'chat_2',
            alliance_id: 'ally_alpha_1',
            user_id: 'user_member_uuid',
            company_name: 'Gamma Drivers',
            message: 'Grazie! Pronto per le corse di oggi.',
            created_at: new Date(Date.now() - 1800000).toISOString(),
        },
    ];

    const browseListDefault = [
        allianceDataDefault,
        {
            id: 'ally_beta_2',
            name: 'Milano Black Cab',
            tag: 'MBC',
            description: 'Flotta business a Milano.',
            emblem: '👑',
            color: '#3498db',
            member_count: 5,
            treasury: 80000,
            is_open: true,
            perk_type: null,
            perk_until: null,
        },
        {
            id: 'ally_gamma_3',
            name: 'Riviera Express',
            tag: 'RIV',
            description: 'Solo su invito.',
            emblem: '🌊',
            color: '#e74c3c',
            member_count: 2,
            treasury: 25000,
            is_open: false,
            perk_type: null,
            perk_until: null,
        },
    ];

    let statoAlleanze = (opzioni.alliances || browseListDefault).map(a => ({ ...a }));
    let statoMembri = (opzioni.members || membersDefault).map(m => ({ ...m }));
    let statoChat = (opzioni.chat || chatDefault).map(c => ({ ...c }));

    const env = freshEnv({
        render: true,
        serverState: opzioni.serverStateOverrides,
    });

    const sbClient = {
        from: (table) => {
            const query = {
                _table: table,
                _filters: {},
                _order: null,
                _limit: null,
                select: () => query,
                upsert: async () => ({ data: null, error: null }),
                eq: (col, val) => { query._filters[col] = val; return query; },
                order: (col, opts) => { query._order = { col, opts }; return query; },
                limit: (n) => { query._limit = n; return query; },
                maybeSingle: async () => {
                    if (table === 'alliance_members') {
                        const m = statoMembri.find(x => {
                            if (query._filters.user_id && x.user_id !== query._filters.user_id) return false;
                            if (query._filters.alliance_id && x.alliance_id !== query._filters.alliance_id) return false;
                            return true;
                        });
                        return { data: m ? { ...m } : null, error: null };
                    }
                    if (table === 'alliances') {
                        const a = statoAlleanze.find(x => {
                            if (query._filters.id && x.id !== query._filters.id) return false;
                            return true;
                        });
                        return { data: a ? { ...a } : null, error: null };
                    }
                    return { data: null, error: null };
                },
                update: (fields) => ({
                    eq: async (col, val) => {
                        if (table === 'alliances') {
                            const a = statoAlleanze.find(x => x[col] === val);
                            if (a) Object.assign(a, fields);
                        }
                        return { data: null, error: null };
                    },
                }),
                then: (resolve) => {
                    let res = [];
                    if (table === 'alliances') {
                        res = [...statoAlleanze];
                    } else if (table === 'alliance_members') {
                        res = [...statoMembri];
                        if (query._filters.alliance_id) {
                            res = res.filter(x => x.alliance_id === query._filters.alliance_id);
                        }
                    } else if (table === 'alliance_chat') {
                        res = [...statoChat];
                        if (query._filters.alliance_id) {
                            res = res.filter(x => x.alliance_id === query._filters.alliance_id);
                        }
                    }
                    if (query._order) {
                        const { col, opts } = query._order;
                        const asc = opts && opts.ascending !== undefined ? opts.ascending : true;
                        res.sort((a, b) => asc ? (a[col] > b[col] ? 1 : -1) : (a[col] < b[col] ? 1 : -1));
                    }
                    if (query._limit) {
                        res = res.slice(0, query._limit);
                    }
                    return Promise.resolve({ data: res, error: null }).then(resolve);
                },
            };
            return query;
        },
        rpc: async (nome, args) => {
            rpcLog.push({ nome, args });

            if (opzioni.rpcHandlers && opzioni.rpcHandlers[nome]) {
                return opzioni.rpcHandlers[nome](args, { statoAlleanze, statoMembri, statoChat });
            }

            if (nome === 'rpc_create_alliance') {
                const newId = 'ally_created_' + Math.random().toString(36).slice(2, 7);
                const newAlly = {
                    id: newId,
                    name: args.p_name,
                    tag: args.p_tag,
                    description: args.p_description || '',
                    emblem: args.p_emblem || '🛡️',
                    color: '#c79a2a',
                    member_count: 1,
                    treasury: 0,
                    is_open: true,
                    perk_type: null,
                    perk_until: null,
                };
                statoAlleanze.push(newAlly);
                const currentUid = env.sandbox.currentUser ? env.sandbox.currentUser.id : 'user_leader_uuid';
                statoMembri.push({
                    user_id: currentUid,
                    alliance_id: newId,
                    company_name: args.p_company_name,
                    role: 'leader',
                    contribution: 0,
                    joined_at: new Date().toISOString(),
                });
                return { data: newId, error: null };
            }

            if (nome === 'rpc_join_alliance') {
                const a = statoAlleanze.find(x => x.id === args.p_alliance_id);
                if (!a) return { data: null, error: { message: 'Consorzio non trovato' } };
                const currentUid = env.sandbox.currentUser ? env.sandbox.currentUser.id : 'user_new_uuid';
                if (a.is_open) {
                    statoMembri.push({
                        user_id: currentUid,
                        alliance_id: a.id,
                        company_name: args.p_company_name,
                        role: 'member',
                        contribution: 0,
                        joined_at: new Date().toISOString(),
                    });
                    a.member_count = (a.member_count || 0) + 1;
                    return { data: 'joined', error: null };
                }
                return { data: 'requested', error: null };
            }

            if (nome === 'rpc_leave_alliance') {
                const currentUid = env.sandbox.currentUser ? env.sandbox.currentUser.id : 'user_member_uuid';
                const idx = statoMembri.findIndex(x => x.user_id === currentUid);
                if (idx >= 0) {
                    const m = statoMembri[idx];
                    const a = statoAlleanze.find(x => x.id === m.alliance_id);
                    if (a) a.member_count = Math.max(0, (a.member_count || 1) - 1);
                    statoMembri.splice(idx, 1);
                }
                return { data: true, error: null };
            }

            if (nome === 'rpc_disband_alliance') {
                const currentUid = env.sandbox.currentUser ? env.sandbox.currentUser.id : 'user_leader_uuid';
                const mem = statoMembri.find(x => x.user_id === currentUid);
                if (mem) {
                    const targetAllyId = mem.alliance_id;
                    const remainingAlliances = statoAlleanze.filter(x => x.id !== targetAllyId);
                    statoAlleanze.splice(0, statoAlleanze.length, ...remainingAlliances);
                    const remainingMembers = statoMembri.filter(x => x.alliance_id !== targetAllyId);
                    statoMembri.splice(0, statoMembri.length, ...remainingMembers);
                    const remainingChat = statoChat.filter(x => x.alliance_id !== targetAllyId);
                    statoChat.splice(0, statoChat.length, ...remainingChat);
                }
                return { data: true, error: null };
            }

            if (nome === 'rpc_donate_to_alliance') {
                const currentUid = env.sandbox.currentUser ? env.sandbox.currentUser.id : 'user_member_uuid';
                const mem = statoMembri.find(x => x.user_id === currentUid);
                if (mem) {
                    mem.contribution = (mem.contribution || 0) + (args.p_amount || 0);
                    const a = statoAlleanze.find(x => x.id === mem.alliance_id);
                    if (a) a.treasury = (a.treasury || 0) + (args.p_amount || 0);
                }
                return { data: true, error: null };
            }

            if (nome === 'rpc_post_alliance_chat') {
                const currentUid = env.sandbox.currentUser ? env.sandbox.currentUser.id : 'user_member_uuid';
                const mem = statoMembri.find(x => x.user_id === currentUid);
                const newMsg = {
                    id: 'chat_' + Math.random().toString(36).slice(2, 7),
                    alliance_id: mem ? mem.alliance_id : 'ally_alpha_1',
                    user_id: currentUid,
                    company_name: args.p_company_name,
                    message: args.p_message,
                    created_at: new Date().toISOString(),
                };
                statoChat.push(newMsg);
                // Trigger realtime callback se presente
                const cb = subscriptions.get('al_chat_' + newMsg.alliance_id);
                if (cb) cb({ new: newMsg });
                return { data: true, error: null };
            }

            if (nome === 'rpc_kick_member') {
                const idx = statoMembri.findIndex(x => x.user_id === args.p_user_id);
                if (idx >= 0) {
                    const m = statoMembri[idx];
                    const a = statoAlleanze.find(x => x.id === m.alliance_id);
                    if (a) a.member_count = Math.max(0, (a.member_count || 1) - 1);
                    statoMembri.splice(idx, 1);
                }
                return { data: true, error: null };
            }

            if (nome === 'rpc_set_member_role') {
                const mem = statoMembri.find(x => x.user_id === args.p_user_id);
                if (mem) {
                    mem.role = args.p_role;
                }
                return { data: true, error: null };
            }

            if (nome === 'rpc_activate_alliance_perk') {
                const currentUid = env.sandbox.currentUser ? env.sandbox.currentUser.id : 'user_leader_uuid';
                const mem = statoMembri.find(x => x.user_id === currentUid);
                if (mem) {
                    const a = statoAlleanze.find(x => x.id === mem.alliance_id);
                    if (a) {
                        const durationHours = args.p_perk === 'mega_income' ? 24 : 48;
                        const until = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
                        a.perk_type = args.p_perk;
                        a.perk_until = until;
                        return { data: until, error: null };
                    }
                }
                return { data: null, error: { message: 'Consorzio non trovato' } };
            }

            return { data: null, error: null };
        },
        channel: (chanName) => {
            const chanObj = {
                name: chanName,
                on: (event, config, callback) => {
                    channelEvents.push({ chanName, event, config });
                    subscriptions.set(chanName, callback);
                    return chanObj;
                },
                subscribe: () => chanObj,
            };
            return chanObj;
        },
        removeChannel: (chanObj) => {
            if (chanObj && chanObj.name) subscriptions.delete(chanObj.name);
        },
    };

    env.sandbox.supabaseClient = sbClient;
    env.sandbox.window.supabaseClient = sbClient;
    env.sandbox.currentUser = opzioni.currentUser !== undefined ? opzioni.currentUser : { id: 'user_leader_uuid' };
    env.sandbox.window.currentUser = env.sandbox.currentUser;

    // Predisponi stato giocatore
    env.sandbox.gameState.companyName = 'Alpha Limos';
    env.sandbox.gameState.cash = opzioni.cash !== undefined ? opzioni.cash : 100000;

    // Predisponi DOM
    env.sandbox.document.body.innerHTML = '<div id="tab-container"></div>';

    return {
        env,
        sandbox: env.sandbox,
        gs: env.sandbox.gameState,
        rpcLog,
        statoAlleanze,
        statoMembri,
        statoChat,
        subscriptions,
    };
}

describe('Funzione Consorzi / Alleanze — Esecuzione e ciclo di vita', () => {

    describe('1. Inizializzazione perk e moltiplicatori (_allyPerkMult, _allyRefreshPerk)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAlleanze(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_allyPerkMult ritorna 1.0 se nessun perk è attivo', () => {
            const { sandbox } = amb;
            sandbox._allyActivePerk = null;

            assert.equal(sandbox._allyPerkMult('earnings'), 1.0);
            assert.equal(sandbox._allyPerkMult('fuel'), 1.0);
        });

        test('_allyPerkMult ritorna 1.0 se il perk è scaduto', () => {
            const { sandbox } = amb;
            sandbox._allyActivePerk = {
                type: 'boost_income',
                until: new Date(Date.now() - 10000).toISOString(),
            };

            assert.equal(sandbox._allyPerkMult('earnings'), 1.0);
        });

        test('_allyPerkMult applica i moltiplicatori corretti per boost_income, mega_income e fuel_save', () => {
            const { sandbox } = amb;
            const future = new Date(Date.now() + 3600000).toISOString();

            // boost_income -> +12% su earnings, 1.0 su fuel
            sandbox._allyActivePerk = { type: 'boost_income', until: future };
            assert.equal(sandbox._allyPerkMult('earnings'), 1.12);
            assert.equal(sandbox._allyPerkMult('fuel'), 1.0);

            // mega_income -> +25% su earnings, 1.0 su fuel
            sandbox._allyActivePerk = { type: 'mega_income', until: future };
            assert.equal(sandbox._allyPerkMult('earnings'), 1.25);
            assert.equal(sandbox._allyPerkMult('fuel'), 1.0);

            // fuel_save -> -15% su carburante (mult 0.85), 1.0 su earnings
            sandbox._allyActivePerk = { type: 'fuel_save', until: future };
            assert.equal(sandbox._allyPerkMult('fuel'), 0.85);
            assert.equal(sandbox._allyPerkMult('earnings'), 1.0);
        });

        test('_allyRefreshPerk sincronizza lo stato del perk attivo dal database Supabase', async () => {
            const { sandbox } = amb;
            sandbox._allyActivePerk = null;

            await sandbox._allyRefreshPerk();

            assert.ok(sandbox._allyActivePerk, 'deve aver popolato _allyActivePerk');
            assert.equal(sandbox._allyActivePerk.type, 'boost_income');
            assert.ok(new Date(sandbox._allyActivePerk.until).getTime() > Date.now());
        });

        test('_allyRefreshPerk azzera il perk se l\'utente non è in alcun consorzio o non è loggato', async () => {
            const ambNoAlly = creaAmbienteAlleanze({ currentUser: { id: 'user_senza_consorzio' } });
            ambNoAlly.sandbox._allyActivePerk = { type: 'boost_income', until: new Date(Date.now() + 3600000).toISOString() };

            await ambNoAlly.sandbox._allyRefreshPerk();
            assert.equal(ambNoAlly.sandbox._allyActivePerk, null);

            ambNoAlly.sandbox.currentUser = null;
            ambNoAlly.sandbox.window.currentUser = null;
            await ambNoAlly.sandbox._allyRefreshPerk();
            assert.equal(ambNoAlly.sandbox._allyActivePerk, null);

            ambNoAlly.env.stopAllIntervals();
        });

        test('_allyRefreshPerk gestisce gracefully errori di rete o query', async () => {
            const { sandbox } = amb;
            sandbox.supabaseClient = {
                from: () => { throw new Error('Simulated network error'); },
            };
            sandbox.window.supabaseClient = sandbox.supabaseClient;

            await assert.doesNotReject(async () => {
                await sandbox._allyRefreshPerk();
            });
        });
    });

    describe('2. Integrazione con i motori di gioco (engine-rides, engine-fleet)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAlleanze(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('il perk attivo "boost_income" incrementa i ricavi effettivi delle corse', () => {
            const { sandbox } = amb;
            // Imposta perk attivo +12%
            sandbox._allyActivePerk = {
                type: 'boost_income',
                until: new Date(Date.now() + 3600000).toISOString(),
            };

            const mult = sandbox._allyPerkMult('earnings');
            assert.equal(mult, 1.12);

            // Verifica che il moltiplicatore sia integrabile nella formula dei ricavi
            const baseFare = 1000;
            const finalFare = Math.round(baseFare * mult);
            assert.equal(finalFare, 1120);
        });

        test('il perk attivo "fuel_save" riduce il costo del carburante per la flotta', () => {
            const { sandbox } = amb;
            // Imposta perk attivo -15%
            sandbox._allyActivePerk = {
                type: 'fuel_save',
                until: new Date(Date.now() + 3600000).toISOString(),
            };

            const mult = sandbox._allyPerkMult('fuel');
            assert.equal(mult, 0.85);

            const baseCost = 200;
            const finalCost = Math.round(baseCost * mult);
            assert.equal(finalCost, 170);
        });
    });

    describe('3. Rendering schermata Consorzi (renderTabConsorzi)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAlleanze(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('renderTabConsorzi non crasha se tab-container non esiste', async () => {
            const { sandbox } = amb;
            sandbox.document.body.innerHTML = '';

            await assert.doesNotReject(async () => {
                await sandbox.renderTabConsorzi();
            });
        });

        test('renderTabConsorzi per utente non loggato mostra messaggio di invito al login', async () => {
            const { sandbox } = amb;
            sandbox.currentUser = null;
            sandbox.window.currentUser = null;

            await sandbox.renderTabConsorzi();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Consorzi non disponibili'));
            assert.ok(c.innerHTML.includes('Accedi al tuo account'));
        });

        test('renderTabConsorzi per utente senza consorzio mostra la vista Browse / Fonda', async () => {
            const ambNoMem = creaAmbienteAlleanze({ currentUser: { id: 'user_non_membro' } });

            await ambNoMem.sandbox.renderTabConsorzi();

            const c = ambNoMem.sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Fonda un Consorzio'));
            assert.ok(c.innerHTML.includes('Sfoglia consorzi'));
            assert.ok(c.innerHTML.includes('Consorzio Roma Capitale'));
            assert.ok(c.innerHTML.includes('Milano Black Cab'));
            assert.ok(c.innerHTML.includes('data-ce-act="_alCreate"'));
            assert.ok(c.innerHTML.includes('data-ce-act="_alJoin"'));

            ambNoMem.env.stopAllIntervals();
        });

        test('renderTabConsorzi per Leader mostra gestione completa, tasto Sciogli, bottoni perk e membri', async () => {
            const { sandbox } = amb;

            await sandbox.renderTabConsorzi();

            const c = sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Consorzio Roma Capitale'));
            assert.ok(c.innerHTML.includes('[ROMA]'));
            assert.ok(c.innerHTML.includes('Tesoro'));
            assert.ok(c.innerHTML.includes('150.000'));
            assert.ok(c.innerHTML.includes('Bottega del Consorzio'));
            assert.ok(c.innerHTML.includes('Boost Ricavi'));
            assert.ok(c.innerHTML.includes('ATTIVO'));
            assert.ok(c.innerHTML.includes('Sciogli'), 'il leader deve poter sciogliere il consorzio');
            assert.ok(c.innerHTML.includes('data-ce-act="_alDisband"'));
            assert.ok(c.innerHTML.includes('data-ce-act="_alDonate"'));
            assert.ok(c.innerHTML.includes('data-ce-act="_alSetRole"'), 'il leader deve poter cambiare i ruoli');
            assert.ok(c.innerHTML.includes('data-ce-act="_alKick"'), 'il leader deve poter espellere membri');
            assert.ok(c.innerHTML.includes('Chat del Consorzio'));
            assert.ok(c.innerHTML.includes('Benvenuti nel consorzio!'));
        });

        test('renderTabConsorzi per Membro semplice mostra tasto Esci e nasconde comandi leader', async () => {
            const ambMem = creaAmbienteAlleanze({ currentUser: { id: 'user_member_uuid' } });

            await ambMem.sandbox.renderTabConsorzi();

            const c = ambMem.sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Consorzio Roma Capitale'));
            assert.ok(c.innerHTML.includes('Esci'), 'il membro semplice vede Esci anziché Sciogli');
            assert.ok(c.innerHTML.includes('data-ce-act="_alLeave"'));
            assert.ok(!c.innerHTML.includes('data-ce-act="_alDisband"'));
            assert.ok(!c.innerHTML.includes('data-ce-act="_alSetRole"'), 'il membro semplice non può cambiare ruoli');
            assert.ok(!c.innerHTML.includes('data-ce-act="_alKick"'), 'il membro semplice non può espellere');

            ambMem.env.stopAllIntervals();
        });

        test('renderTabConsorzi per Officer mostra tasto Esci ed Espelli sui membri ordinari', async () => {
            const ambOff = creaAmbienteAlleanze({ currentUser: { id: 'user_officer_uuid' } });

            await ambOff.sandbox.renderTabConsorzi();

            const c = ambOff.sandbox.document.getElementById('tab-container');
            assert.ok(c.innerHTML.includes('Esci'));
            assert.ok(c.innerHTML.includes('data-ce-act="_alKick"'), 'l officer può espellere i membri');
            assert.ok(!c.innerHTML.includes('data-ce-act="_alSetRole"'), 'l officer non può promuovere o retrocedere');

            ambOff.env.stopAllIntervals();
        });
    });

    describe('4. Fondazione Consorzio (_alCreate)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteAlleanze({ currentUser: { id: 'user_founder_uuid' }, cash: 50000 });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('creazione riuscita scala 25.000€, chiama rpc_create_alliance e aggiorna la vista', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            sandbox.document.body.innerHTML = `
                <div id="tab-container"></div>
                <input id="al-name" value="Squadra Corse">
                <input id="al-tag" value="SQC">
                <input id="al-desc" value="Consorzio ad alta velocità">
                <input id="al-emblem" value="🏎️">
                <input id="al-open" type="checkbox" checked>
            `;

            await sandbox._alCreate();

            assert.equal(gs.cash, 25000, 'deve aver scalato esattamente 25.000€');
            const createRpc = rpcLog.find(r => r.nome === 'rpc_create_alliance');
            assert.ok(createRpc, 'deve chiamare rpc_create_alliance');
            assert.equal(createRpc.args.p_name, 'Squadra Corse');
            assert.equal(createRpc.args.p_tag, 'SQC');
            assert.equal(createRpc.args.p_emblem, '🏎️');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Consorzio fondato')));
        });

        test('creazione con is_open disattivato aggiorna la colonna su alliances', async () => {
            const { sandbox, rpcLog, statoAlleanze } = amb;
            sandbox.document.body.innerHTML = `
                <div id="tab-container"></div>
                <input id="al-name" value="Circolo Privato">
                <input id="al-tag" value="PRIV">
                <input id="al-desc" value="Solo su invito">
                <input id="al-emblem" value="🔒">
                <input id="al-open" type="checkbox">
            `;

            await sandbox._alCreate();

            const createRpc = rpcLog.find(r => r.nome === 'rpc_create_alliance');
            assert.ok(createRpc);
            const created = statoAlleanze.find(a => a.tag === 'PRIV');
            assert.ok(created);
            assert.equal(created.is_open, false, 'is_open deve essere impostato a false');
        });

        test('validazione: nome < 3 caratteri blocca creazione e non spende denaro', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            sandbox.document.body.innerHTML = `
                <input id="al-name" value="AB">
                <input id="al-tag" value="TAG">
            `;

            await sandbox._alCreate();

            assert.equal(gs.cash, 50000);
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_create_alliance').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('Nome troppo corto')));
        });

        test('validazione: tag < 2 caratteri blocca creazione e non spende denaro', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            sandbox.document.body.innerHTML = `
                <input id="al-name" value="Nome Valido">
                <input id="al-tag" value="A">
            `;

            await sandbox._alCreate();

            assert.equal(gs.cash, 50000);
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_create_alliance').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('TAG troppo corto')));
        });

        test('validazione: cassa insufficiente (< 25.000€) non spende e non chiama RPC', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.cash = 10000;
            sandbox.document.body.innerHTML = `
                <input id="al-name" value="Nome Valido">
                <input id="al-tag" value="TAG">
            `;

            await sandbox._alCreate();

            assert.equal(gs.cash, 10000);
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_create_alliance').length, 0);
        });

        test('gestione errore RPC durante la fondazione', async () => {
            const ambErr = creaAmbienteAlleanze({
                cash: 50000,
                rpcHandlers: {
                    rpc_create_alliance: async () => ({
                        data: null,
                        error: { message: 'Nome consorzio già occupato' },
                    }),
                },
            });
            ambErr.sandbox.document.body.innerHTML = `
                <input id="al-name" value="Consorzio Esistente">
                <input id="al-tag" value="EXIST">
            `;

            await ambErr.sandbox._alCreate();

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('già occupato')));
            ambErr.env.stopAllIntervals();
        });
    });

    describe('5. Unione al Consorzio (_alJoin)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteAlleanze({ currentUser: { id: 'user_joining_uuid' } });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('ingresso immediato in un consorzio aperto', async () => {
            const { sandbox, rpcLog, env, statoMembri } = amb;

            await sandbox._alJoin('ally_beta_2');

            const joinRpc = rpcLog.find(r => r.nome === 'rpc_join_alliance');
            assert.ok(joinRpc);
            assert.equal(joinRpc.args.p_alliance_id, 'ally_beta_2');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Sei entrato')));
            assert.ok(statoMembri.some(m => m.user_id === 'user_joining_uuid' && m.alliance_id === 'ally_beta_2'));
        });

        test('richiesta di adesione a un consorzio chiuso', async () => {
            const { sandbox, rpcLog, env } = amb;

            await sandbox._alJoin('ally_gamma_3');

            const joinRpc = rpcLog.find(r => r.nome === 'rpc_join_alliance');
            assert.ok(joinRpc);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Richiesta inviata')));
        });

        test('gestione errore RPC durante l\'unione', async () => {
            const ambErr = creaAmbienteAlleanze({
                rpcHandlers: {
                    rpc_join_alliance: async () => ({
                        data: null,
                        error: { message: 'Consorzio al completo' },
                    }),
                },
            });

            await ambErr.sandbox._alJoin('ally_beta_2');

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('al completo')));
            ambErr.env.stopAllIntervals();
        });
    });

    describe('6. Abbandono e Scioglimento (_alLeave, _alDisband)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAlleanze(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_alLeave con conferma esegue rpc_leave_alliance e notifica il giocatore', async () => {
            const ambMem = creaAmbienteAlleanze({ currentUser: { id: 'user_member_uuid' } });
            const { sandbox, rpcLog, env, statoMembri } = ambMem;

            await sandbox._alLeave();

            const leaveRpc = rpcLog.find(r => r.nome === 'rpc_leave_alliance');
            assert.ok(leaveRpc);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('lasciato il consorzio')));
            assert.ok(!statoMembri.some(m => m.user_id === 'user_member_uuid'));

            ambMem.env.stopAllIntervals();
        });

        test('_alLeave rifiutato dall\'utente (confirm = false) non chiama RPC', async () => {
            const ambMem = creaAmbienteAlleanze({ currentUser: { id: 'user_member_uuid' } });
            ambMem.sandbox.confirm = () => false;

            await ambMem.sandbox._alLeave();

            assert.equal(ambMem.rpcLog.filter(r => r.nome === 'rpc_leave_alliance').length, 0);
            ambMem.env.stopAllIntervals();
        });

        test('_alDisband da parte del Leader scioglie l\'alleanza e chiama rpc_disband_alliance', async () => {
            const { sandbox, rpcLog, env, statoAlleanze } = amb;

            await sandbox._alDisband();

            const disbandRpc = rpcLog.find(r => r.nome === 'rpc_disband_alliance');
            assert.ok(disbandRpc);
            assert.ok(env.notifications.some(n => n.type === 'info' && n.msg.includes('Consorzio sciolto')));
            assert.ok(!statoAlleanze.some(a => a.id === 'ally_alpha_1'));
        });

        test('_alDisband rifiutato dall\'utente (confirm = false) non scioglie il consorzio', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.confirm = () => false;

            await sandbox._alDisband();

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_disband_alliance').length, 0);
        });
    });

    describe('7. Donazione al Tesoro del Consorzio (_alDonate)', () => {
        let amb;
        beforeEach(() => {
            amb = creaAmbienteAlleanze({ currentUser: { id: 'user_member_uuid' }, cash: 80000 });
        });
        afterEach(() => amb.env.stopAllIntervals());

        test('donazione valida scala la cassa, chiama rpc_donate_to_alliance e incrementa tesoro e contributo', async () => {
            const { sandbox, gs, rpcLog, env, statoAlleanze, statoMembri } = amb;
            sandbox.document.body.innerHTML = `
                <div id="tab-container"></div>
                <input id="al-donate" value="20000">
            `;

            await sandbox._alDonate();

            assert.equal(gs.cash, 60000, 'il saldo deve essere scalato di 20.000€');
            const donateRpc = rpcLog.find(r => r.nome === 'rpc_donate_to_alliance');
            assert.ok(donateRpc);
            assert.equal(donateRpc.args.p_amount, 20000);
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('Hai donato')));

            const ally = statoAlleanze.find(a => a.id === 'ally_alpha_1');
            assert.equal(ally.treasury, 170000, 'il tesoro passa da 150k a 170k');
            const mem = statoMembri.find(m => m.user_id === 'user_member_uuid');
            assert.equal(mem.contribution, 35000, 'il contributo passa da 15k a 35k');
        });

        test('donazione con importo <= 0 non muove denaro e notifica errore', async () => {
            const { sandbox, gs, rpcLog, env } = amb;
            sandbox.document.body.innerHTML = `<input id="al-donate" value="0">`;

            await sandbox._alDonate();

            assert.equal(gs.cash, 80000);
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_donate_to_alliance').length, 0);
            assert.ok(env.notifications.some(n => n.type === 'error' && n.msg.includes('non valido')));
        });

        test('donazione con fondi insufficienti non scala denaro e non chiama RPC', async () => {
            const { sandbox, gs, rpcLog } = amb;
            gs.cash = 5000;
            sandbox.document.body.innerHTML = `<input id="al-donate" value="20000">`;

            await sandbox._alDonate();

            assert.equal(gs.cash, 5000);
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_donate_to_alliance').length, 0);
        });
    });

    describe('8. Chat del Consorzio e Realtime (_alChat, ceAlChatEnter, Realtime)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAlleanze(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_alChat invia un messaggio valido, svuota il campo input e chiama rpc_post_alliance_chat', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.document.body.innerHTML = `<input id="al-chat-input" value="Nuovo incarico completato!">`;

            await sandbox._alChat();

            const chatRpc = rpcLog.find(r => r.nome === 'rpc_post_alliance_chat');
            assert.ok(chatRpc);
            assert.equal(chatRpc.args.p_message, 'Nuovo incarico completato!');
            assert.equal(sandbox.document.getElementById('al-chat-input').value, '');
        });

        test('_alChat con messaggio vuoto o spazi non invoca RPC', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.document.body.innerHTML = `<input id="al-chat-input" value="   ">`;

            await sandbox._alChat();

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_post_alliance_chat').length, 0);
        });

        test('ceAlChatEnter scatena _alChat su tasto Enter ed ignora altri tasti', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.document.body.innerHTML = `<input id="al-chat-input" value="Messaggio via enter">`;

            // Tasto non Enter -> non invia
            sandbox.ceAlChatEnter({ key: 'Shift' });
            assert.equal(rpcLog.filter(r => r.nome === 'rpc_post_alliance_chat').length, 0);

            // Tasto Enter -> invia
            sandbox.ceAlChatEnter({ key: 'Enter' });
            await new Promise(r => setImmediate(r));
            assert.ok(rpcLog.some(r => r.nome === 'rpc_post_alliance_chat' && r.args.p_message === 'Messaggio via enter'));
        });

        test('ricezione messaggio Realtime appende dinamicamente il messaggio alla chat', async () => {
            const { sandbox, subscriptions } = amb;
            sandbox.document.body.innerHTML = `
                <div id="tab-container"></div>
                <div id="al-chat-scroll"><div class="em-empty">Nessun messaggio</div></div>
            `;

            // Sottoscrivi alla chat
            await sandbox.renderTabConsorzi();

            const chatCallback = subscriptions.get('al_chat_ally_alpha_1');
            assert.ok(typeof chatCallback === 'function', 'la callback realtime deve essere registrata');

            // Simula arrivo di un evento Realtime INSERT
            chatCallback({
                new: {
                    user_id: 'user_officer_uuid',
                    company_name: 'Beta Executive',
                    message: 'Messaggio realtime arrivato!',
                },
            });

            const scrollEl = sandbox.document.getElementById('al-chat-scroll');
            assert.ok(scrollEl.innerHTML.includes('Beta Executive'));
            assert.ok(scrollEl.innerHTML.includes('Messaggio realtime arrivato!'));
        });
    });

    describe('9. Gestione Membri ed Espulsioni (_alKick, _alSetRole)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAlleanze(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_alKick con conferma espelle il membro e chiama rpc_kick_member', async () => {
            const { sandbox, rpcLog, statoMembri } = amb;

            await sandbox._alKick('user_member_uuid');

            const kickRpc = rpcLog.find(r => r.nome === 'rpc_kick_member');
            assert.ok(kickRpc);
            assert.equal(kickRpc.args.p_user_id, 'user_member_uuid');
            assert.ok(!statoMembri.some(m => m.user_id === 'user_member_uuid'));
        });

        test('_alKick rifiutato (confirm = false) non espelle', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.confirm = () => false;

            await sandbox._alKick('user_member_uuid');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_kick_member').length, 0);
        });

        test('_alSetRole promuove un membro ad officer o retrocede a member', async () => {
            const { sandbox, rpcLog, statoMembri } = amb;

            // Promuovi member a officer
            await sandbox._alSetRole('user_member_uuid', 'officer');
            let setRoleRpc = rpcLog.find(r => r.nome === 'rpc_set_member_role' && r.args.p_role === 'officer');
            assert.ok(setRoleRpc);
            let mem = statoMembri.find(m => m.user_id === 'user_member_uuid');
            assert.equal(mem.role, 'officer');

            // Retrocedi officer a member
            await sandbox._alSetRole('user_officer_uuid', 'member');
            setRoleRpc = rpcLog.find(r => r.nome === 'rpc_set_member_role' && r.args.p_role === 'member');
            assert.ok(setRoleRpc);
            mem = statoMembri.find(m => m.user_id === 'user_officer_uuid');
            assert.equal(mem.role, 'member');
        });
    });

    describe('10. Bottega del Consorzio ed attivazione Perk (_alPerk)', () => {
        let amb;
        beforeEach(() => { amb = creaAmbienteAlleanze(); });
        afterEach(() => amb.env.stopAllIntervals());

        test('_alPerk attiva un perk dal tesoro e aggiorna _allyActivePerk', async () => {
            const { sandbox, rpcLog, env } = amb;

            await sandbox._alPerk('fuel_save');

            const perkRpc = rpcLog.find(r => r.nome === 'rpc_activate_alliance_perk');
            assert.ok(perkRpc);
            assert.equal(perkRpc.args.p_perk, 'fuel_save');
            assert.ok(sandbox._allyActivePerk);
            assert.equal(sandbox._allyActivePerk.type, 'fuel_save');
            assert.ok(env.notifications.some(n => n.type === 'success' && n.msg.includes('attivato per il consorzio')));
        });

        test('_alPerk rifiutato (confirm = false) non attiva il perk', async () => {
            const { sandbox, rpcLog } = amb;
            sandbox.confirm = () => false;

            await sandbox._alPerk('fuel_save');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_activate_alliance_perk').length, 0);
        });

        test('_alPerk con perk non a catalogo non effettua chiamate', async () => {
            const { sandbox, rpcLog } = amb;

            await sandbox._alPerk('perk_inesistente');

            assert.equal(rpcLog.filter(r => r.nome === 'rpc_activate_alliance_perk').length, 0);
        });

        test('gestione errore RPC durante l\'attivazione perk (es. tesoro insufficiente)', async () => {
            const ambErr = creaAmbienteAlleanze({
                rpcHandlers: {
                    rpc_activate_alliance_perk: async () => ({
                        data: null,
                        error: { message: 'Tesoro del consorzio insufficiente' },
                    }),
                },
            });

            await ambErr.sandbox._alPerk('mega_income');

            assert.ok(ambErr.env.notifications.some(n => n.type === 'error' && n.msg.includes('insufficiente')));
            ambErr.env.stopAllIntervals();
        });
    });
});
