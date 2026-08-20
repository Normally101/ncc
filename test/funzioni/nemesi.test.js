'use strict';
/* ============================================================================
   test/funzioni/nemesi.test.js — Nemici VIP e Agenzia Ombra (nemesis.js & black_ops.js)

   Verifica del funzionamento della feature "nemesi" (attualmente disattivata in config.js).
   Collauda:
   - Creazione ed evoluzione nemesi VIP (_nemesisAddVip, _nemesisTick, _nemesisFundRival)
   - Negoziazione e pacificazione VIP (_nemesisBribeVip)
   - Rendering interfaccia nemici VIP (renderTabNemesis)
   - Agenzia Ombra: inizializzazione, refresh target e log (shadowInit, shadowRefresh)
   - Potenziamento difesa aziendale (shadowUpgradeDefense)
   - Esecuzione operazioni speciali (shadowExecuteOp: spy_fleet, spy_finances, fake_review,
     buy_off_client, bribe_driver, sabotage_vehicle, hijack_client)
   - Rendering interfaccia Agenzia Ombra (renderTabShadow)
   - Trigger di sistema (scadenza email VIP in engine-daily.js, hourly tick in engine.js)
   ============================================================================ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { freshEnv } = require('../../test-support/game-env.js');

describe('funzione nemesi — Nemici VIP e Agenzia Ombra', () => {
    let env, sandbox, gs;
    let syncedCashCalls;
    let supabaseRpcCalls;
    let supabaseSelectCalls;

    function setupSupabaseMock() {
        supabaseRpcCalls = [];
        supabaseSelectCalls = [];

        const mockClient = {
            from: (table) => {
                supabaseSelectCalls.push(table);
                return {
                    upsert: async () => ({ error: null }),
                    select: (_cols) => ({
                        neq: (_col, _val) => ({
                            order: (_col2, _opts) => ({
                                limit: async (_lim) => ({
                                    data: [
                                        { user_id: 'rival_1', company_name: 'Apex Chauffeur', reputation: 4.8 },
                                        { user_id: 'rival_2', company_name: 'Luxe Fleet Roma', reputation: 4.2 },
                                    ],
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            },
            rpc: async (name, params) => {
                supabaseRpcCalls.push({ name, params });
                if (name === 'rpc_get_shadow_targets') {
                    return {
                        data: [
                            { user_id: 'rival_1', company_id: 'c_1', name: 'Apex Chauffeur', reputation: 4.8, hq_city: 'Roma', defense_lvl: 1 },
                            { user_id: 'rival_2', company_id: 'c_2', name: 'Luxe Fleet Roma', reputation: 4.2, hq_city: 'Milano', defense_lvl: 2 },
                        ],
                        error: null,
                    };
                }
                if (name === 'rpc_get_shadow_ops_log') {
                    return {
                        data: [
                            { id: 'op_101', op_type: 'spy_fleet', success: true, detected: false, op_cost: 15000, is_attacker: true },
                        ],
                        error: null,
                    };
                }
                if (name === 'rpc_execute_shadow_op') {
                    return {
                        data: {
                            success: true,
                            detected: false,
                            result: { fleet_size: 6, top_tier: 'vip', condition_damage: 20 },
                        },
                        error: null,
                    };
                }
                if (name === 'rpc_upgrade_shadow_defense') {
                    const currentLvl = sandbox.gameState._shadowDefenseLevel || 0;
                    return { data: { new_level: currentLvl + 1 }, error: null };
                }
                if (name === 'rpc_nemesis_fund_rival') {
                    return {
                        data: { funded_company: 'Apex Chauffeur', amount: params?.v_amount || 25000, vip: params?.v_vip_name || 'VIP' },
                        error: null,
                    };
                }
                return { data: {}, error: null };
            },
        };

        sandbox.supabaseClient = mockClient;
        sandbox.window.supabaseClient = mockClient;
        sandbox.currentUser = { id: 'player_self' };
        sandbox.window.currentUser = sandbox.currentUser;
    }

    beforeEach(() => {
        syncedCashCalls = [];
        env = freshEnv({
            render: true,
            serverState: {
                syncCash: async (v) => {
                    syncedCashCalls.push(v);
                    return { success: true, cash: v };
                },
            },
        });
        sandbox = env.sandbox;
        gs = sandbox.gameState;
        setupSupabaseMock();
    });

    afterEach(() => {
        env.stopAllIntervals();
    });

    // ────────────────────────────────────────────────────────────────────────
    // 1. NEMESI VIP — Inizializzazione, rabbia, escalation, notifiche ed email
    // ────────────────────────────────────────────────────────────────────────
    describe('VIP Nemesi — creazione ed escalation (_nemesisAddVip)', () => {
        test('_nemesisAddVip crea un nuovo nemico con rabbia 30 e livello 1 se la richiesta è solo scaduta/ignorata', () => {
            gs.vipNemeses = {};
            sandbox._nemesisAddVip('vip_emiro', 'Lo Sceicco', 'scaduta');

            assert.ok(gs.vipNemeses.vip_emiro, 'il nemico deve essere inserito in gameState.vipNemeses');
            assert.equal(gs.vipNemeses.vip_emiro.name, 'Lo Sceicco');
            assert.equal(gs.vipNemeses.vip_emiro.level, 1);
            assert.equal(gs.vipNemeses.vip_emiro.anger, 30);
            assert.equal(gs.vipNemeses.vip_emiro.reason, 'scaduta');
            assert.equal(gs.vipNemeses.vip_emiro.lastFunded, 0);

            // Verifica notifica
            assert.ok(env.notifications.some(n => n.msg.includes('Lo Sceicco') && n.msg.includes('deluso')));
        });

        test('_nemesisAddVip crea un nemico con rabbia 60 e livello 2 (guerra aperta) se la corsa è fallita', () => {
            gs.vipNemeses = {};
            sandbox._nemesisAddVip('vip_grigori', 'Grigori V.', 'fallita');

            assert.ok(gs.vipNemeses.vip_grigori);
            assert.equal(gs.vipNemeses.vip_grigori.level, 2);
            assert.equal(gs.vipNemeses.vip_grigori.anger, 60);
            assert.equal(gs.vipNemeses.vip_grigori.reason, 'fallita');

            // Notifica di livello 2
            assert.ok(env.notifications.some(n => n.msg.includes('Grigori V.') && n.msg.includes('FURIOSO')));
        });

        test('_nemesisAddVip su nemico già esistente incrementa la rabbia di +30 fino a max 100 ed eleva il livello', () => {
            gs.vipNemeses = {
                vip_onorevole: { name: 'Il Ministro', level: 1, anger: 40, lastFunded: 0, reason: 'scaduta' },
            };

            sandbox._nemesisAddVip('vip_onorevole', 'Il Ministro', 'scaduta');

            assert.equal(gs.vipNemeses.vip_onorevole.anger, 70, 'rabbia deve salire a 40 + 30 = 70');
            assert.equal(gs.vipNemeses.vip_onorevole.level, 2, 'con rabbia >= 60 il livello sale a 2');

            // Altro incremento satura a 100
            sandbox._nemesisAddVip('vip_onorevole', 'Il Ministro', 'fallita');
            assert.equal(gs.vipNemeses.vip_onorevole.anger, 100);
            assert.equal(gs.vipNemeses.vip_onorevole.level, 2);
        });

        test('_nemesisAddVip invia email di avviso se _vipPushEmail è definita', () => {
            let emailInviata = null;
            sandbox._vipPushEmail = (email) => { emailInviata = email; };

            sandbox._nemesisAddVip('vip_wedding', 'La Diva', 'fallita');

            assert.ok(emailInviata, 'deve chiamare _vipPushEmail');
            assert.equal(emailInviata.type, 'nemesis_warning');
            assert.ok(emailInviata.subject.includes('NEMESI'));
            assert.equal(emailInviata.nemesisData.vipId, 'vip_wedding');
            assert.equal(emailInviata.nemesisData.level, 2);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 2. NEMESI VIP — Ciclo orario (_nemesisTick) e decadimento rabbia
    // ────────────────────────────────────────────────────────────────────────
    describe('VIP Nemesi — decadimento temporale e azioni ostili (_nemesisTick)', () => {
        test('_nemesisTick riduce la rabbia di 0.08 all ora per ogni nemico', () => {
            gs.day = 2;
            gs.hour = 10;
            gs.vipNemeses = {
                vip1: { name: 'VIP 1', level: 1, anger: 50.0, lastFunded: 0, reason: 'scaduta' },
            };

            sandbox._nemesisTick();

            assert.equal(gs.vipNemeses.vip1.anger, 49.92);
            assert.equal(gs.vipNemeses.vip1.level, 1);
        });

        test('_nemesisTick de-escala il livello da 2 a 1 quando la rabbia scende sotto 60', () => {
            gs.day = 1;
            gs.hour = 0;
            gs.vipNemeses = {
                vip1: { name: 'VIP 1', level: 2, anger: 60.05, lastFunded: 0, reason: 'fallita' },
            };

            sandbox._nemesisTick();

            assert.ok(gs.vipNemeses.vip1.anger < 60);
            assert.equal(gs.vipNemeses.vip1.level, 1, 'livello deve retrocedere a 1');
        });

        test('_nemesisTick rimuove il nemico quando la rabbia scende sotto 20 (livello 0)', () => {
            gs.day = 1;
            gs.hour = 0;
            gs.vipNemeses = {
                vip1: { name: 'VIP 1', level: 1, anger: 20.05, lastFunded: 0, reason: 'scaduta' },
            };

            sandbox._nemesisTick();

            // 20.05 - 0.08 = 19.97 -> level diventa 0 -> cancellato
            assert.equal(gs.vipNemeses.vip1, undefined, 'nemico con rabbia < 20 deve essere rimosso');
        });

        test('_nemesisTick scatena _nemesisFundRival se level >= 2 e sono passate >= 48h dall ultimo finanziamento', async () => {
            gs.day = 3;
            gs.hour = 5; // nowHour = 3 * 24 + 5 = 77
            gs.vipNemeses = {
                nem_boss: { name: 'Grigori V.', level: 2, anger: 80, lastFunded: 10, reason: 'fallita' },
            };

            sandbox._nemesisTick();
            // setImmediate per attendere la Promise asincrona di _nemesisFundRival
            await new Promise(r => setImmediate(r));

            // Verifica che abbia chiamato Supabase per trovare i rivali e la RPC
            assert.ok(supabaseSelectCalls.includes('leaderboard'));
            assert.ok(supabaseRpcCalls.some(c => c.name === 'rpc_nemesis_fund_rival'));

            const rpcCall = supabaseRpcCalls.find(c => c.name === 'rpc_nemesis_fund_rival');
            assert.equal(rpcCall.params.v_vip_name, 'Grigori V.');
            assert.ok(rpcCall.params.v_amount > 0);
            assert.equal(gs.vipNemeses.nem_boss.lastFunded, 77, 'lastFunded deve essere aggiornato a nowHour');
        });

        test('_nemesisTick non finanzia i rivali se sono passate meno di 48h dall ultimo finanziamento', async () => {
            gs.day = 2;
            gs.hour = 0; // nowHour = 48
            gs.vipNemeses = {
                nem_boss: { name: 'Grigori V.', level: 2, anger: 80, lastFunded: 20, reason: 'fallita' }, // 48 - 20 = 28h < 48h
            };

            sandbox._nemesisTick();
            await new Promise(r => setImmediate(r));

            assert.equal(supabaseRpcCalls.length, 0, 'non deve finanziare rivali prima del cooldown');
            assert.equal(gs.vipNemeses.nem_boss.lastFunded, 20);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 3. NEMESI VIP — Corruzione e pacificazione (_nemesisBribeVip)
    // ────────────────────────────────────────────────────────────────────────
    describe('VIP Nemesi — corruzione e pacificazione (_nemesisBribeVip)', () => {
        test('corruzione calcola il prezzo proporzionale alla rabbia e deduce 40 di rabbia', () => {
            gs.vipNemeses = {
                vip_tech: { name: 'Il Tech Bro', level: 2, anger: 80, lastFunded: 0, reason: 'fallita' },
            };
            gs.cash = 100000;
            // bribe = Math.floor(5000 + (80 / 100) * 45000) = 41.000€

            sandbox._nemesisBribeVip('vip_tech');

            assert.equal(gs.cash, 59000);
            assert.equal(gs.vipNemeses.vip_tech.anger, 40, 'rabbia deve scendere da 80 a 40 (-40)');
            assert.equal(gs.vipNemeses.vip_tech.level, 1, 'livello deve scendere a 1');
            assert.ok(env.notifications.some(n => n.msg.includes('ha preso i soldi ma resta diffidente')));
        });

        test('corruzione che azzera la rabbia pacifica completamente il VIP e lo rimuove dallo stato', () => {
            gs.vipNemeses = {
                vip_pop: { name: 'La Popstar', level: 1, anger: 35, lastFunded: 0, reason: 'scaduta' },
            };
            gs.cash = 50000;
            // bribe = Math.floor(5000 + (35 / 100) * 45000) = 20.750€

            sandbox._nemesisBribeVip('vip_pop');

            assert.equal(gs.cash, 29250);
            assert.equal(gs.vipNemeses.vip_pop, undefined, 'nemico pacificato viene rimosso');
            assert.ok(env.notifications.some(n => n.msg.includes('Pace fatta')));
        });

        test('corruzione rifiutata dall utente tramite confirm dialog non scala denaro', () => {
            sandbox.confirm = () => false;
            gs.vipNemeses = {
                vip_pop: { name: 'La Popstar', level: 1, anger: 35, lastFunded: 0, reason: 'scaduta' },
            };
            gs.cash = 50000;

            sandbox._nemesisBribeVip('vip_pop');

            assert.equal(gs.cash, 50000);
            assert.equal(gs.vipNemeses.vip_pop.anger, 35);
        });

        test('corruzione con denaro insufficiente fallisce e preserva rabbia e stato', () => {
            gs.vipNemeses = {
                vip_boss: { name: 'Il Don', level: 2, anger: 100, lastFunded: 0, reason: 'fallita' },
            };
            gs.cash = 1000; // bribe = 50.000€

            sandbox._nemesisBribeVip('vip_boss');

            assert.equal(gs.cash, 1000);
            assert.equal(gs.vipNemeses.vip_boss.anger, 100);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 4. NEMESI VIP — Rendering interfaccia (renderTabNemesis)
    // ────────────────────────────────────────────────────────────────────────
    describe('VIP Nemesi — rendering interfaccia (renderTabNemesis)', () => {
        test('renderTabNemesis non fallisce se tab-container non esiste nel DOM', () => {
            assert.doesNotThrow(() => {
                sandbox.renderTabNemesis();
            });
        });

        test('renderTabNemesis mostra stato sereno se non vi sono nemici', () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs.vipNemeses = {};
            sandbox.renderTabNemesis();

            const html = container.innerHTML;
            assert.ok(html.includes('Lista Nemici'), 'manca intestazione');
            assert.ok(html.includes('Nessun VIP deluso'), 'dovrebbe segnalare nessun VIP deluso');
            assert.ok(html.includes('Nessun nemico'), 'dovrebbe mostrare schermata vuota serena');
        });

        test('renderTabNemesis renderizza card dei nemici, barre rabbia e pulsanti azione', () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs.vipNemeses = {
                v1: { name: 'Grigori V.', level: 2, anger: 85, lastFunded: 0, reason: 'fallita' },
                v2: { name: 'Lo Sceicco', level: 1, anger: 30, lastFunded: 0, reason: 'scaduta' },
            };

            sandbox.renderTabNemesis();

            const html = container.innerHTML;
            assert.ok(html.includes('GUERRA APERTA'), 'deve indicare guerra aperta');
            assert.ok(html.includes('Grigori V.'));
            assert.ok(html.includes('Lo Sceicco'));
            assert.ok(html.includes('data-ce-act="_nemesisBribeVip"'));
            assert.ok(html.includes('data-ce-act="hubNavigate"'));
            assert.ok(html.includes('Agenzia Ombra'));
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 5. AGENZIA OMBRA — Inizializzazione, refresh target e registro
    // ────────────────────────────────────────────────────────────────────────
    describe('Agenzia Ombra — inizializzazione e recupero target (shadowInit & shadowRefresh)', () => {
        test('shadowInit imposta il livello di difesa a 0 se assente e carica i target', async () => {
            delete gs._shadowDefenseLevel;

            await sandbox.shadowInit();

            assert.equal(gs._shadowDefenseLevel, 0);
            assert.equal(sandbox._shadowState.targets.length, 2);
            assert.equal(sandbox._shadowState.targets[0].name, 'Apex Chauffeur');
            assert.equal(sandbox._shadowState.log.length, 1);
        });

        test('shadowRefresh rispetta il cooldown di 30 secondi se non forzato', async () => {
            sandbox._shadowState._lastFetch = Date.now();
            supabaseRpcCalls = [];

            await sandbox.shadowRefresh(false);

            assert.equal(supabaseRpcCalls.length, 0, 'non deve chiamare RPC se non è passato il cooldown');

            // Con force = true esegue comunque
            await sandbox.shadowRefresh(true);
            assert.equal(supabaseRpcCalls.length, 2);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 6. AGENZIA OMBRA — Difesa aziendale (shadowUpgradeDefense)
    // ────────────────────────────────────────────────────────────────────────
    describe('Agenzia Ombra — potenziamento difese (shadowUpgradeDefense)', () => {
        test('shadowUpgradeDefense avanza di livello scalando il costo corrispondente', async () => {
            gs.cash = 200000;
            gs._shadowDefenseLevel = 1; // Prossimo: Tier 2 (Controspionaggio) a 100.000€

            await sandbox.shadowUpgradeDefense();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.equal(gs._shadowDefenseLevel, 2);
            assert.deepEqual(syncedCashCalls, [100000]);
            assert.ok(env.notifications.some(n => n.msg.includes('Difesa aggiornata a Livello 2')));
        });

        test('shadowUpgradeDefense impedisce l upgrade se la difesa è già a livello 5 (massimo)', async () => {
            gs.cash = 1000000;
            gs._shadowDefenseLevel = 5;

            await sandbox.shadowUpgradeDefense();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 1000000);
            assert.equal(gs._shadowDefenseLevel, 5);
            assert.equal(syncedCashCalls.length, 0);
            assert.ok(env.notifications.some(n => n.msg.includes('Difesa già al massimo')));
        });

        test('shadowUpgradeDefense non procede se i fondi sono insufficienti', async () => {
            gs.cash = 10000;
            gs._shadowDefenseLevel = 0; // Serve 50.000€ per Tier 1

            await sandbox.shadowUpgradeDefense();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 10000);
            assert.equal(gs._shadowDefenseLevel, 0);
            assert.equal(syncedCashCalls.length, 0);
        });

        test('shadowUpgradeDefense rimborsa il giocatore se la RPC restituisce errore', async () => {
            sandbox.supabaseClient.rpc = async (name) => {
                if (name === 'rpc_upgrade_shadow_defense') {
                    return { data: null, error: new Error('Network error') };
                }
                return { data: {}, error: null };
            };
            gs.cash = 100000;
            gs._shadowDefenseLevel = 0; // Tier 1 costa 50.000€

            await sandbox.shadowUpgradeDefense();
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000, 'il cash deve essere rimborsato integralmente');
            assert.equal(gs._shadowDefenseLevel, 0);
            assert.deepEqual(syncedCashCalls, [50000, 100000]);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 7. AGENZIA OMBRA — Esecuzione operazioni (shadowExecuteOp)
    // ────────────────────────────────────────────────────────────────────────
    describe('Agenzia Ombra — operazioni ostili e sabotaggi (shadowExecuteOp)', () => {
        beforeEach(() => {
            sandbox._shadowState.targets = [
                { user_id: 't_alpha', name: 'Alpha Limo', reputation: 4.5, defense_lvl: 1, hq_city: 'Roma' },
            ];
        });

        test('spy_fleet esegue spionaggio flotta nemica e notifica il risultato', async () => {
            gs.cash = 100000;
            // Costo spy_fleet = 15.000€
            await sandbox.shadowExecuteOp('t_alpha', 'spy_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 85000);
            assert.ok(env.notifications.some(n => n.msg.includes('Flotta rivelata: 6 veicoli, tier max: vip')));
        });

        test('spy_finances esegue spionaggio finanziario', async () => {
            gs.cash = 100000;
            // Costo spy_finances = 20.000€
            await sandbox.shadowExecuteOp('t_alpha', 'spy_finances');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 80000);
            assert.ok(env.notifications.some(n => n.msg.includes('Report finanziario acquisito')));
        });

        test('fake_review pubblica recensione negativa danneggiando reputazione del target', async () => {
            gs.cash = 100000;
            // Costo fake_review = 25.000€
            await sandbox.shadowExecuteOp('t_alpha', 'fake_review');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 75000);
            assert.ok(env.notifications.some(n => n.msg.includes('−0.15★ reputazione inflitta al target')));
        });

        test('buy_off_client attiva un evento dinamico duraturo con boost corse VIP del 30%', async () => {
            gs.cash = 100000;
            gs.day = 5;
            gs.hour = 12;
            gs.activeDynamicEvent = null;

            // Costo buy_off_client = 40.000€
            await sandbox.shadowExecuteOp('t_alpha', 'buy_off_client');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 60000);
            assert.ok(gs.activeDynamicEvent, 'deve registrare l evento dinamico attivo in gameState');
            assert.equal(gs.activeDynamicEvent.id, 'shadow_vip_boost');
            assert.equal(gs.activeDynamicEvent.endsHour, 5 * 24 + 12 + 24, 'deve durare esattamente 24 ore di gioco');
            assert.equal(gs.activeDynamicEvent.tipMult, 1.30, 'deve incrementare le mance/corse VIP del 30%');
            assert.ok(env.notifications.some(n => n.msg.includes('+30% corse VIP per 24h')));
        });

        test('bribe_driver esegue corruzione autista del competitor', async () => {
            gs.cash = 100000;
            // Costo bribe_driver = 50.000€
            await sandbox.shadowExecuteOp('t_alpha', 'bribe_driver');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 50000);
            assert.ok(env.notifications.some(n => n.msg.includes('Autista del target bloccato per 8h')));
        });

        test('sabotage_vehicle esegue sabotaggio veicolo rivale', async () => {
            gs.cash = 150000;
            // Costo sabotage_vehicle = 80.000€
            await sandbox.shadowExecuteOp('t_alpha', 'sabotage_vehicle');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 70000);
            assert.ok(env.notifications.some(n => n.msg.includes('Veicolo sabotato: −20 condizione')));
        });

        test('hijack_client esegue intercettazione corsa premium', async () => {
            gs.cash = 100000;
            // Costo hijack_client = 60.000€
            await sandbox.shadowExecuteOp('t_alpha', 'hijack_client');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 40000);
            assert.ok(env.notifications.some(n => n.msg.includes('Corsa premium intercettata')));
        });

        test('operazione fallita ma non rilevata notifica il fallimento senza avvisare il target', async () => {
            sandbox.supabaseClient.rpc = async (name) => {
                if (name === 'rpc_execute_shadow_op') {
                    return { data: { success: false, detected: false }, error: null };
                }
                return { data: [], error: null };
            };
            gs.cash = 100000;

            await sandbox.shadowExecuteOp('t_alpha', 'spy_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 85000, 'il costo viene comunque speso');
            assert.ok(env.notifications.some(n => n.msg.includes('fallita') && !n.msg.includes('identificato')));
        });

        test('operazione fallita e rilevata avverte che l attaccante è stato scoperto', async () => {
            sandbox.supabaseClient.rpc = async (name) => {
                if (name === 'rpc_execute_shadow_op') {
                    return { data: { success: false, detected: true }, error: null };
                }
                return { data: [], error: null };
            };
            gs.cash = 100000;

            await sandbox.shadowExecuteOp('t_alpha', 'spy_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 85000);
            assert.ok(env.notifications.some(n => n.msg.includes('Sei stato identificato!')));
        });

        test('annullamento del confirm dialog non esegue l operazione e non scala denaro', async () => {
            sandbox.confirm = () => false;
            gs.cash = 100000;

            await sandbox.shadowExecuteOp('t_alpha', 'spy_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.equal(supabaseRpcCalls.length, 0);
        });

        test('target inesistente non fa partire l operazione', async () => {
            gs.cash = 100000;

            await sandbox.shadowExecuteOp('target_fantasma', 'spy_fleet');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.ok(env.notifications.some(n => n.msg.includes('Target non trovato')));
        });

        test('tipo di operazione inesistente non fa partire l operazione', async () => {
            gs.cash = 100000;

            await sandbox.shadowExecuteOp('t_alpha', 'op_inventata');
            await new Promise(r => setImmediate(r));

            assert.equal(gs.cash, 100000);
            assert.equal(supabaseRpcCalls.length, 0);
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 8. AGENZIA OMBRA — Rendering interfaccia (renderTabShadow)
    // ────────────────────────────────────────────────────────────────────────
    describe('Agenzia Ombra — rendering interfaccia (renderTabShadow)', () => {
        test('renderTabShadow non fallisce se tab-container non è presente', () => {
            assert.doesNotThrow(() => {
                sandbox.renderTabShadow();
            });
        });

        test('renderTabShadow visualizza livello difesa, target e pulsanti azione', () => {
            const container = sandbox.document.createElement('div');
            container.id = 'tab-container';
            sandbox.document.body.appendChild(container);

            gs._shadowDefenseLevel = 2;
            sandbox._shadowState.targets = [
                { user_id: 't1', name: 'Imperium Fleet', reputation: 4.9, defense_lvl: 2, hq_city: 'Milano' },
            ];
            sandbox._shadowState.log = [
                { op_type: 'spy_fleet', is_attacker: true, success: true, op_cost: 15000 },
            ];

            sandbox.renderTabShadow();

            const html = container.innerHTML;
            assert.ok(html.includes('Agenzia Ombra'), 'manca titolo tab');
            assert.ok(html.includes('Lv.2/5'), 'manca livello difesa');
            assert.ok(html.includes('Imperium Fleet'), 'manca target');
            assert.ok(html.includes('data-ce-act="shadowUpgradeDefense"'), 'manca azione upgrade difesa');
            assert.ok(html.includes('data-ce-act="shadowExecuteOp"'), 'mancano azioni operazioni ombra');
            assert.ok(html.includes('data-ce-act="ceThen"'), 'manca azione aggiorna');
            assert.ok(html.includes('Registro Operazioni'), 'manca registro');
        });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 9. INTEGRAZIONE CON IL GIOCO — Scadenza email VIP in engine-daily.js
    // ────────────────────────────────────────────────────────────────────────
    describe('Integrazione di gioco — generazione nemesi da email VIP scadute', () => {
        test('quando una mail di tipo vip_ scade in _tickEmails, genera automaticamente un nemico VIP', () => {
            gs.day = 1;
            gs.hour = 10; // gameHour = 34
            gs.vipNemeses = {};
            gs.emails = [
                {
                    id: 99,
                    sender: 'Emiro',
                    subject: 'Richiesta VIP Flotta Gold',
                    type: 'vip_emiro',
                    status: 'unread',
                    expiresAt: 30, // Scaduta (30 <= 34)
                },
            ];

            // Invochiamo _tickEmails
            sandbox._tickEmails();

            assert.ok(gs.vipNemeses.vip_emiro, 'il VIP emiro deve essere diventato un nemico');
            assert.equal(gs.vipNemeses.vip_emiro.name, 'Lo Sceicco');
            assert.equal(gs.vipNemeses.vip_emiro.reason, 'scaduta');
            assert.equal(gs.vipNemeses.vip_emiro.level, 1);
            assert.equal(gs.vipNemeses.vip_emiro.anger, 30);
        });

        test('il catalogo SHADOW_OPS caricato in VM contiene tutte le 7 operazioni canoniche con costi e descrizioni', () => {
            const shadowOps = vm.runInContext('SHADOW_OPS', sandbox);
            assert.ok(Array.isArray(shadowOps), 'SHADOW_OPS deve essere un array');
            assert.equal(shadowOps.length, 7);

            const ids = Array.from(shadowOps).map(o => String(o.id));
            assert.deepEqual(ids, [
                'spy_fleet',
                'spy_finances',
                'fake_review',
                'buy_off_client',
                'bribe_driver',
                'sabotage_vehicle',
                'hijack_client'
            ]);

            shadowOps.forEach(op => {
                assert.ok(op.cost > 0, `costo non valido per op ${op.id}`);
                assert.ok(typeof op.name === 'string' && op.name.length > 0);
                assert.ok(typeof op.desc === 'string' && op.desc.length > 0);
            });
        });
    });
});
