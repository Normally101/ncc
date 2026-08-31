'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   sistemi/engine — le azioni "di regia" in engine.js.

   Fase 3 di PIANO-CHIUSURA.md, sistema 15. Venti azioni sparse: campagne
   marketing, multe, missioni ombra/diamond, assegnazione auto↔autista, regioni,
   investimenti e costruzioni, leasing, riposo CEO, New Game+.

   Denaro: `payFine`/`sellInvestment`/`speedUpConstruction` locali; `sellCar`/
   `rest`/`buyRegion`/`buyInvestment`/`payToRepairCar` passano da ServerState (il
   mock muove la cassa come farebbe il bridge). `newGamePlus`/`sellCompanyNGP`
   **sostituiscono `gameState`**: qui il riferimento va riletto dopo la chiamata.
   ════════════════════════════════════════════════════════════════════════════ */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');
const R = require('../../test-support/regista.js');

describe('sistemi/engine', () => {
    let env, w, avvisi;

    beforeEach(() => {
        env = freshEnv();
        w = env.sandbox.window;
        R.conSchermo(env);
        R.conSoldi(env, 5_000_000);
        w.gameState.driverCoins = 500;
        avvisi = [];
        w.showNotification = (m, t) => avvisi.push({ m, t });
        w.showBigEvent = () => {};
        w.confirm = () => true;
        w.openCarModal = () => {};
        w.closeModals = () => {};
        w.MapBackend = { drawHighways(){}, drawPOIs(){}, addPostoBlocco(){}, drawPostiBlocco(){} };
    });
    afterEach(() => env.stopAllIntervals());

    const gs     = () => env.sandbox.window.gameState;
    const errori = () => avvisi.filter(a => a.t === 'error').map(a => a.m);
    const cat    = (n) => R.catalogo(env, n);

    // ── marketing ──────────────────────────────────────────────────────────

    test('_applyMarketingCampaign avvia la campagna; _stopMarketingCampaign la toglie', () => {
        const camp = cat('MARKETING_CAMPAIGNS').find(c => c.tier === 'starter');
        gs().brandVolume = 9999; gs().brandPrestige = 9999;

        const ok = w._applyMarketingCampaign(camp.id);
        assert.equal(ok, true);
        assert.ok(gs().activeCampaigns.some(a => a.id === camp.id));

        w._stopMarketingCampaign(camp.id);
        assert.ok(!gs().activeCampaigns.some(a => a.id === camp.id));
    });

    test('_applyMarketingCampaign: slot pieni → rifiuta la seconda', () => {
        const camps = cat('MARKETING_CAMPAIGNS').filter(c => c.tier === 'starter');
        gs().brandVolume = 9999;
        w._applyMarketingCampaign(camps[0].id);
        const ok2 = w._applyMarketingCampaign(camps[1].id);
        assert.equal(ok2, false);
        assert.ok(errori().some(m => /Slot/i.test(m)));
    });

    // ── multe ──────────────────────────────────────────────────────────────

    test('payFine: paga la multa in sospeso e la marca pagata', () => {
        gs().activeFines = [{ id: 'f1', amount: 2000, status: 'pending' }];
        const prima = gs().cash;
        w.payFine('f1');
        assert.equal(gs().cash, prima - 2000);
        assert.equal(gs().activeFines[0].status, 'paid');
    });

    test('payFine: fondi insufficienti → multa ancora in sospeso', () => {
        gs().activeFines = [{ id: 'f1', amount: 2000, status: 'pending' }];
        R.conSoldi(env, 100);
        w.payFine('f1');
        assert.equal(gs().activeFines[0].status, 'pending');
        assert.equal(gs().cash, 100);
    });

    test('contestFine: l\'esito dipende dal dado, ma la multa esce dallo stato "pending"', () => {
        gs().activeFines = [{ id: 'f1', amount: 2000, status: 'pending' }];
        w.contestFine('f1');
        assert.ok(['contested_won', 'contested_lost'].includes(gs().activeFines[0].status));
    });

    // ── missioni email ─────────────────────────────────────────────────────

    test('acceptShadowMission: crea la corsa ultra e alza il police heat', () => {
        const pois = cat('POIS');
        const ids = Object.keys(pois).slice(0, 2);
        gs().emails.push({ id: 'sh1', type: 'shadow', status: 'unread',
            shadowData: { fromId: ids[0], toId: ids[1], price: 20000, seizureRisk: 70 } });
        const heat = gs().policeHeat || 0;
        const n = gs().pendingRides.length;

        w.acceptShadowMission('sh1');

        assert.equal(gs().pendingRides.length, n + 1);
        assert.equal(gs().policeHeat, heat + 10);
        assert.equal(gs().emails.find(e => e.id === 'sh1').status, 'resolved');
    });

    test('acceptDiamondContract: senza autista/auto adeguati → errore, nessun incasso', () => {
        gs().emails.push({ id: 'd1', offer: 30000 });
        const prima = gs().cash;
        w.acceptDiamondContract('d1');
        assert.equal(gs().cash, prima);
        assert.ok(errori().some(m => /autista|veicolo/i.test(m)));
    });

    test('acceptDiamondContract: con autista Expert e auto Ultra → incassa e alza reputazione', () => {
        gs().reputation = 2;
        gs().drivers.push({ id: 'dx', name: 'Ace', status: 'idle', level: 3 });
        gs().fleet.push({ id: 'cx', name: 'Limo', tier: 'ultra' });
        gs().emails.push({ id: 'd1', offer: 30000 });
        const prima = gs().cash;

        w.acceptDiamondContract('d1');

        assert.equal(gs().cash, prima + 30000);
        assert.ok(gs().reputation > 2);
    });

    test('respondPoaching: accettare pareggia lo stipendio; rifiutare fa partire l\'autista', () => {
        gs().drivers.push({ id: 'dp', name: 'Gino', salary: 2000, status: 'idle' });
        gs().emails.push({ id: 'p1', type: 'poaching', status: 'unread', driverId: 'dp', driverName: 'Gino', counterOffer: 3200, rivalName: 'RivalCo' });

        w.respondPoaching('p1', true);
        assert.equal(gs().drivers.find(d => d.id === 'dp').salary, 3200);

        gs().emails.push({ id: 'p2', type: 'poaching', status: 'unread', driverId: 'dp', driverName: 'Gino', counterOffer: 4000, rivalName: 'RivalCo' });
        w.respondPoaching('p2', false);
        assert.equal(gs().drivers.find(d => d.id === 'dp'), undefined, 'l\'autista doveva andarsene');
    });

    // ── auto ↔ autista ────────────────────────────────────────────────────

    test('assignCarToDriver: assegna e libera il proprietario precedente', () => {
        gs().drivers.push({ id: 'd1', name: 'A', assignedCarId: 'car1' });
        gs().drivers.push({ id: 'd2', name: 'B', assignedCarId: null });

        w.assignCarToDriver('car1', 'd2');

        assert.equal(gs().drivers.find(d => d.id === 'd2').assignedCarId, 'car1');
        assert.equal(gs().drivers.find(d => d.id === 'd1').assignedCarId, null, 'il vecchio proprietario doveva restare senza auto');
    });

    // ── regioni / investimenti ───────────────────────────────────────────

    test('buyRegion: reputazione ok → regione sbloccata via ServerState', async () => {
        const reg = Object.values(cat('REGIONS')).find(r => r.id !== 'lazio' && !gs().unlockedRegions.includes(r.id));
        gs().reputation = Math.max(gs().reputation, reg.repReq + 1);

        await w.buyRegion(reg.id);

        assert.ok(gs().unlockedRegions.includes(reg.id));
    });

    test('buyRegion: reputazione insufficiente → niente sblocco', async () => {
        const reg = Object.values(cat('REGIONS')).find(r => r.repReq > 0 && !gs().unlockedRegions.includes(r.id));
        gs().reputation = 0;
        await w.buyRegion(reg.id);
        assert.ok(!gs().unlockedRegions.includes(reg.id));
        assert.ok(errori().some(m => /Reputazione/i.test(m)));
    });

    test('buyInvestment: senza buildTime entra subito negli investimenti', async () => {
        const inv = cat('INVESTMENTS').find(i => !i.buildTime && !i.reqRides);
        await w.buyInvestment(inv.id);
        assert.ok(gs().investments.includes(inv.id));
    });

    test('buyInvestment: con buildTime entra in coda di costruzione, non fra gli investimenti', async () => {
        const inv = cat('INVESTMENTS').find(i => i.buildTime && !i.reqRides);
        await w.buyInvestment(inv.id);
        assert.ok((gs().constructions || []).some(c => c.invId === inv.id));
        assert.ok(!gs().investments.includes(inv.id));
    });

    test('speedUpConstruction: paga in DC e completa subito', () => {
        const inv = cat('INVESTMENTS').find(i => i.buildTime && !i.reqRides);
        gs().constructions = [{ invId: inv.id, completesDay: gs().day + 3 }];
        w.speedUpConstruction(inv.id);
        assert.ok(gs().investments.includes(inv.id));
        assert.equal((gs().constructions || []).length, 0);
        assert.ok(gs().driverCoins < 500);
    });

    test('sellInvestment: rimborsa il 40% e toglie l\'investimento (solo dopo conferma)', () => {
        const inv = cat('INVESTMENTS').find(i => !i.buildTime && !i.reqRides);
        gs().investments = [inv.id];
        w.confirm = () => false;
        w.sellInvestment(inv.id);
        assert.ok(gs().investments.includes(inv.id), 'venduto senza conferma');

        w.confirm = () => true;
        const prima = gs().cash;
        w.sellInvestment(inv.id);
        assert.ok(!gs().investments.includes(inv.id));
        assert.equal(gs().cash, prima + Math.floor(inv.price * 0.40));
    });

    // ── leasing / hotel ──────────────────────────────────────────────────

    test('rest: recupera energia CEO tramite ServerState', async () => {
        gs().energy = 20;
        await w.rest(4);
        assert.ok(gs().energy > 20);
    });

    // ── auto: ripara / vendi ─────────────────────────────────────────────

    test('payToRepairCar: ripara la carrozzeria via ServerState e scala il costo', async () => {
        gs().fleet.push({ id: 'cr', name: 'X', condition: 50, engineHealth: 100, _serverId: 's1' });
        const prima = gs().cash;
        await w.payToRepairCar('cr');
        assert.equal(gs().fleet.find(c => c.id === 'cr').condition, 100);
        assert.ok(gs().cash < prima);
    });

    test('sellCar: rimuove l\'auto e incassa (ServerState); un\'auto in leasing non si vende', async () => {
        gs().fleet.push({ id: 'sv', name: 'X', tier: 'vip', condition: 80, isLease: false, _serverId: 's2' });
        const prima = gs().cash;
        const n = gs().fleet.length;
        await w.sellCar('sv');
        assert.equal(gs().fleet.length, n - 1);
        assert.ok(gs().cash > prima);

        gs().fleet.push({ id: 'lz', name: 'Y', tier: 'vip', condition: 80, isLease: true });
        const n2 = gs().fleet.length;
        await w.sellCar('lz');
        assert.equal(gs().fleet.length, n2, 'un\'auto in leasing non si vende');
    });

    // ── New Game+ ───────────────────────────────────────────────────────

    test('newGamePlus: conferma annullata → la partita resta com\'è', () => {
        w.confirm = () => false;
        const cashPrima = gs().cash;
        w.newGamePlus();
        assert.equal(gs().cash, cashPrima);
    });

    test('newGamePlus: conferma → riparte con cassa d\'eredità e contatore +1', () => {
        gs().reputation = 4;
        w.newGamePlus();
        assert.equal(gs().newGamePlusCount, 1);
        assert.equal(gs().day, 1);
        assert.ok(gs().cash <= 20000, 'la nuova partita riparte con poca cassa d\'eredità');
    });

    test('sellCompanyNGP: senza Elite Wealth Manager → errore, partita intatta', () => {
        const cashPrima = gs().cash;
        w.sellCompanyNGP();
        assert.equal(gs().cash, cashPrima);
        assert.ok(errori().some(m => /Wealth Manager/i.test(m)));
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// I modali (open*Modal) sono stub no-op nell'env di default: per leasing e hotel
// serve il rendering vero.
describe('sistemi/engine — leasing e hotel (render vero)', () => {
    let env, sb;

    beforeEach(() => {
        env = freshEnv({ render: true });
        sb = env.sandbox;
        R.conSchermo(env);
        R.conSoldi(env, 2_000_000);
        sb.window.showNotification = () => {};
        sb.window.showBigEvent = () => {};
        sb.window.closeModals = () => {};
        for (const id of ['lease-km', 'lease-duration']) {
            const el = sb.document.createElement('input'); el.id = id;
            el.value = id === 'lease-km' ? '20000' : '12';
            sb.document.body.appendChild(el);
        }
        for (const id of ['lease-car-name', 'lease-km-display', 'lease-duration-display',
                          'lease-base-price', 'lease-km-price', 'lease-total-price', 'lease-penalty-price']) {
            const el = sb.document.createElement('div'); el.id = id;
            sb.document.body.appendChild(el);
        }
        const ml = sb.document.createElement('div'); ml.id = 'modal-leasing'; ml.className = 'hidden';
        sb.document.body.appendChild(ml);
    });
    afterEach(() => env.stopAllIntervals());

    const gs = () => env.sandbox.window.gameState;

    test('updateLeasePreview: scrive i prezzi calcolati nelle label del modal', () => {
        sb.openLeasingModal('business');   // imposta tempLeaseTier e chiama updateLeasePreview
        assert.equal(sb.document.getElementById('lease-duration-display').innerText, '12 Mesi');
        assert.match(sb.document.getElementById('lease-total-price').innerText, /€\d/);
    });

    test('confirmLease: aggiunge alla flotta un\'auto in leasing con canone', () => {
        sb.openLeasingModal('business');
        const n = gs().fleet.length;

        sb.confirmLease();

        assert.equal(gs().fleet.length, n + 1);
        const auto = gs().fleet[gs().fleet.length - 1];
        assert.equal(auto.isLease, true);
        assert.ok(auto.dailyCost > 0);
    });

    test('openHotelModal: toglie hidden e mostra il modal', () => {
        const m = sb.document.createElement('div'); m.id = 'modal-hotel'; m.className = 'hidden';
        sb.document.body.appendChild(m);
        sb.openHotelModal();
        assert.equal(m.classList.contains('hidden'), false);
        assert.equal(m.classList.contains('flex'), true);
    });
});
