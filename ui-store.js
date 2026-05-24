'use strict';
/* ui-store.js — Chauffeur Empire
   renderTabPremiumStore: Driver Coins, Executive Club, DC boosters.
   Dipendenze: engine.js, engine-store.js, design-system.js */

window._ecSwitchTab = function(tab) { _ecActiveTab = tab; renderTabPremiumStore(); };


function renderTabPremiumStore() {
    const container = document.getElementById('tab-container');
    const dc = gameState.driverCoins || 0;
    const offLimit = gameState.offlineLimit || 2;
    const autoRest = gameState.autoRestEnabled || false;

    // ── INJECT EXECUTIVE CLUB STYLES ─────────────────────────────────────────
    if (!document.getElementById('ec-style')) {
        const st = document.createElement('style');
        st.id = 'ec-style';
        st.textContent = `
            .ec-card {
                background: linear-gradient(135deg, rgba(10,10,25,0.95), rgba(20,20,45,0.9));
                border: 1px solid rgba(212,175,55,0.25);
                border-radius: 12px; padding: 14px; position: relative;
                transition: box-shadow .2s, border-color .2s;
            }
            .ec-card:hover { border-color: rgba(212,175,55,0.5); box-shadow: 0 0 18px rgba(212,175,55,0.12); }
            .ec-tab {
                padding: 7px 18px; font-size: 0.72rem; font-weight: 700; letter-spacing: .08em;
                border-bottom: 2px solid transparent; color: #6b7280; cursor: pointer;
                transition: color .15s, border-color .15s; user-select: none;
            }
            .ec-tab.active { color: #d4af37; border-bottom-color: #d4af37; }
            .ec-yield-ribbon {
                position: absolute; top: -1px; right: 10px;
                background: linear-gradient(90deg, #c9a227, #f0d060);
                color: #000; font-size: 7.5px; font-weight: 900; letter-spacing: .05em;
                padding: 2px 8px 3px; border-radius: 0 0 6px 6px;
            }
            .ec-section-label {
                font-size: 0.62rem; font-weight: 700; letter-spacing: .14em;
                color: rgba(212,175,55,0.65); text-transform: uppercase;
                border-bottom: 1px solid rgba(212,175,55,0.15);
                padding-bottom: 5px; margin-bottom: 10px; margin-top: 16px;
            }
            .ec-section-label:first-child { margin-top: 0; }
            .ec-btn {
                display: inline-flex; align-items: center; justify-content: center;
                background: linear-gradient(135deg, #c9a227, #d4af37); color: #000;
                font-weight: 800; font-size: 0.72rem; padding: 7px 12px;
                border-radius: 6px; border: none; cursor: pointer; transition: all .15s;
            }
            .ec-btn:hover:not(:disabled) { background: linear-gradient(135deg, #d4af37, #edd97a); box-shadow: 0 4px 12px rgba(212,175,55,0.3); }
            .ec-btn:disabled { opacity: 0.35; cursor: not-allowed; background: #374151; color: #9ca3af; }
            .ec-coin {
                border-radius: 50%;
                background: radial-gradient(circle at 35% 35%, #f0d060 0%, #c9a227 55%, #8b6914 100%);
                display: inline-flex; align-items: center; justify-content: center;
                font-weight: 900; color: #000; flex-shrink: 0;
                box-shadow: 0 2px 5px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.3);
            }
        `;
        document.head.appendChild(st);
    }

    const kaskoActive = typeof hasInvestment === 'function' && hasInvestment('inv_kasko');
    const tempKaskoDay = gameState.tempKaskoExpiresDay || 0;
    const tempKaskoActive = kaskoActive && tempKaskoDay > 0 && gameState.day <= tempKaskoDay;
    const execPassActive = !!(gameState.executivePassActive && gameState.day <= (gameState.executivePassExpiresDay||0));
    const radarActive = (gameState.activeBuffs||[]).some(b => b.type==='vip_queue' && b.until > gameState.day*24+gameState.hour);
    const plate = !!gameState.hasPrestigiousPlate;
    const restingCount   = (gameState.drivers||[]).filter(d => d.id!=='ceo' && d.status==='resting').length;
    const stressedCount  = (gameState.drivers||[]).filter(d => d.id!=='ceo' && ((d.stress_level||0)>0||d.burnout_until)).length;
    const trainingCount  = (gameState.driverAcademy||[]).length;
    const constructions  = (gameState.constructions||[]);
    const lowFuel        = (gameState.fleet||[]).filter(c => (c.fuel||0)<100).length;
    const ceoNeedEnergy  = (gameState.energy||0) < 100;

    // ── TAB: ACQUISISCI FONDI ─────────────────────────────────────────────────
    const ecPkgs = [
        { dc:50,   bonus:null,  price:'€4,99',  label:'Il Fondo Cassa',       sub:'Liquidità operativa immediata' },
        { dc:220,  bonus:'+10%', price:'€19,99', label:'Portafoglio Corporate', sub:'Executive Yield incluso' },
        { dc:600,  bonus:'+20%', price:'€49,99', label:'Conto Offshore',        sub:'Rendimento garantito' },
        { dc:1300, bonus:'+30%', price:'€99,99', label:'Il Fondo Sovrano',      sub:'Rendimento massimizzato' },
    ];

    const _acqHtml = `
        <div style="font-size:0.68rem;color:rgba(212,175,55,0.5);text-align:center;margin-bottom:16px;letter-spacing:.03em;">
            Pacchetti simulati (demo) — I Driver Coins si accumulano con missioni Presidential e trasferimenti VIP.
        </div>
        <div class="grid grid-cols-2 gap-3">
        ${ecPkgs.map(p => `
            <div class="ec-card" style="${p.bonus==='+30%'?'border-color:rgba(212,175,55,0.6);background:linear-gradient(135deg,rgba(15,12,30,0.98),rgba(30,22,60,0.96));':''}">
                ${p.bonus ? `<div class="ec-yield-ribbon">Executive Yield ${p.bonus}</div>` : ''}
                <div style="padding-top:${p.bonus?'12px':'0'};">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                        <div class="ec-coin" style="width:24px;height:24px;font-size:8px;">CE</div>
                        <span style="font-size:1.4rem;font-weight:900;color:#d4af37;line-height:1;">${p.dc}</span>
                        <span style="font-size:0.62rem;color:#9ca3af;margin-top:6px;">DC</span>
                    </div>
                    <div style="font-size:0.78rem;font-weight:700;color:#fff;line-height:1.2;margin-bottom:2px;">${p.label}</div>
                    <div style="font-size:0.62rem;color:rgba(212,175,55,0.55);margin-bottom:10px;">${p.sub}</div>
                    <div style="font-size:1.05rem;font-weight:900;color:#d4af37;margin-bottom:10px;">${p.price}</div>
                    <button class="ec-btn" style="width:100%;" onclick="window._dcSimPurchase(${p.dc})">Acquisisci</button>
                </div>
            </div>`).join('')}
        </div>
    `;

    // ── TAB: SERVIZI ESCLUSIVI ────────────────────────────────────────────────
    const _itemRow = (it) => `
        <div class="ec-card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;${it.disabled?'opacity:0.4;':''}">
            <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                <span style="font-size:1.25rem;flex-shrink:0;">${it.icon}</span>
                <div style="min-width:0;">
                    <div style="font-size:0.77rem;font-weight:700;color:#fff;line-height:1.2;">${it.label}</div>
                    <div style="font-size:0.62rem;color:#9ca3af;line-height:1.3;">${it.sub}</div>
                </div>
            </div>
            <button class="ec-btn" style="width:auto;padding:6px 12px;white-space:nowrap;flex-shrink:0;"
                onclick="${it.disabled?'':it.fn}" ${it.disabled?'disabled':''}>
                ${it.disabled ? it.disabledLabel : `${it.cost} DC`}
            </button>
        </div>`;

    const opItems = [
        { label:'Caffè Sospeso',        sub:'Azzera lo stress del driver più esausto',          cost:10,  icon:'☕',  fn:'window._ecCaffeSospeso()',        disabled:stressedCount===0,     disabledLabel:'Staff in forma' },
        { label:'Manutenzione Express', sub:'Ripara il veicolo più danneggiato al 100%',        cost:25,  icon:'🔧', fn:'window._ecManutenzioneExpress()',  disabled:(gameState.fleet||[]).every(c=>(c.condition||100)>=100), disabledLabel:'Flotta perfetta' },
        { label:'Tangente al Sindacato',sub:'Blocca scioperi per 1 giorno di gioco',            cost:50,  icon:'🤝', fn:'window._ecTangenteSindacato()',    disabled:(gameState.tangenteUntil||0)>gameState.day, disabledLabel:'Già protetto' },
        { label:'Rifornimento Flotta',  sub:`${lowFuel} veicoli sotto al 100% di carburante`,  cost:3,   icon:'⛽',  fn:'fuelBoostDC()',                    disabled:lowFuel===0,           disabledLabel:'Flotta piena' },
        { label:'Ricarica Energia CEO', sub:'Recupero immediato al 100%',                       cost:4,   icon:'⚡',  fn:'energyBoostDC()',                  disabled:!ceoNeedEnergy,        disabledLabel:'Già al 100%' },
        { label:'Sveglia Flotta',       sub:`${restingCount} autisti in pausa forzata`,         cost:Math.max(3,restingCount*2), icon:'⏰', fn:'wakeAllDriversDC()', disabled:restingCount===0, disabledLabel:'Nessuno a riposo' },
        { label:'Benessere Staff',      sub:`${stressedCount} autisti con stress o burnout`,    cost:Math.max(4,stressedCount*2), icon:'💊', fn:'healAllDriversDC()', disabled:stressedCount===0, disabledLabel:'Staff in forma' },
        { label:'Completamento Corsi',  sub:`${trainingCount} corsi in accademia attivi`,       cost:Math.max(1,trainingCount*5), icon:'🎓', fn:'skipAllAcademyDC()', disabled:trainingCount===0, disabledLabel:'Nessun corso' },
        { label:'Costruzioni Lampo',    sub:`${constructions.length} cantieri in corso`,        cost:Math.max(1,constructions.length*8), icon:'🏗️', fn:'skipAllConstructionsDC()', disabled:constructions.length===0, disabledLabel:'Nessuna costruzione' },
        { label:'Pacchetto Operativo',  sub:'Carburante + Energia CEO + Sveglia autisti',       cost:9,   icon:'🚀', fn:'opsBundleDC()',  disabled:lowFuel===0&&!ceoNeedEnergy&&restingCount===0, disabledLabel:'Tutto OK' },
        { label:'Pacchetto Imperiale',  sub:'Tutto in uno: flotta, staff, corsi, edifici',      cost:35,  icon:'👑', fn:'fullBundleDC()', disabled:false,  disabledLabel:'' },
        { label:'Limite Offline +2h',   sub:`Progressione offline attuale: ${offLimit}h (max 12h)`, cost:20, icon:'🕐', fn:"window._dcSpend('offline_limit',20)", disabled:offLimit>=12, disabledLabel:'Massimo raggiunto' },
        { label:'Auto-Rest CEO',        sub:'Recupero energetico automatico durante offline',   cost:30,  icon:'🛌', fn:"window._dcSpend('auto_rest',30)", disabled:autoRest, disabledLabel:'Già attivo' },
    ];

    const assicItems = [
        {
            label:'Polizza Kasko Corporate',
            sub: kaskoActive && !tempKaskoActive ? 'Polizza permanente attiva — copertura illimitata'
                : tempKaskoActive ? `Attiva fino al giorno ${tempKaskoDay} (${tempKaskoDay - gameState.day} gg rimasti)`
                : 'Copertura incidenti per 7 giorni di gioco',
            cost:150, icon:'🛡️', fn:'window._ecPolizzaKasko()',
            disabled: kaskoActive && !tempKaskoActive, disabledLabel:'Polizza attiva'
        },
        {
            label:'Executive Pass',
            sub: execPassActive ? `Attivo — ${(gameState.executivePassExpiresDay||0)-gameState.day} giorni rimasti`
                : '+25% slot corse · −50% stress · Insta-Repair 1DC · VIP extra',
            cost:150, icon:'💎', fn:'activateExecutivePass()',
            disabled:execPassActive, disabledLabel:'Già attivo'
        },
    ];

    const presItems = [
        {
            label:'Radar VIP',
            sub: radarActive ? 'Attivo — accesso prioritario corse VIP potenziato'
                : 'Priority queue +100% per 72 ore di gioco',
            cost:200, icon:'📡', fn:'window._ecRadarVip()',
            disabled:radarActive, disabledLabel:'Già attivo'
        },
        {
            label:'Targa Nera Presidenziale',
            sub: plate ? 'Targa applicata — prestigio massimo sbloccato'
                : 'Cosmetico permanente. Sblocca clienti esclusivi e reputazione extra.',
            cost:500, icon:'🏴', fn:'window._ecTargaPresidenziale()',
            disabled:plate, disabledLabel:'Già posseduta'
        },
    ];

    const _serviziHtml = `
        <div class="ec-section-label">Operatività & Flotta</div>
        ${opItems.map(_itemRow).join('')}
        <div class="ec-section-label">Assicurazioni & Licenze</div>
        ${assicItems.map(_itemRow).join('')}
        <div class="ec-section-label">Prestigio</div>
        ${presItems.map(_itemRow).join('')}
    `;

    // ── RENDER ────────────────────────────────────────────────────────────────
    container.innerHTML = `
        <div style="background:linear-gradient(135deg,rgba(5,5,15,0.98),rgba(15,12,35,0.98));border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">
            <div>
                <div style="font-size:0.58rem;letter-spacing:.2em;color:rgba(212,175,55,0.55);text-transform:uppercase;font-weight:700;">Chauffeur Empire</div>
                <div style="font-size:1.05rem;font-weight:900;color:#d4af37;letter-spacing:.04em;font-family:serif;">Executive Club</div>
                <div style="font-size:0.6rem;color:#4b5563;margin-top:2px;">Private Banking · Black Card Services</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:0.58rem;letter-spacing:.1em;color:rgba(212,175,55,0.45);text-transform:uppercase;">Saldo</div>
                <div style="display:flex;align-items:center;gap:5px;justify-content:flex-end;margin-top:3px;">
                    <div class="ec-coin" style="width:20px;height:20px;font-size:7px;">CE</div>
                    <span style="font-size:1.15rem;font-weight:900;color:#d4af37;font-family:monospace;">${dc.toLocaleString()}</span>
                    <span style="font-size:0.62rem;color:#6b7280;">DC</span>
                </div>
            </div>
        </div>

        <div style="display:flex;border-bottom:1px solid rgba(212,175,55,0.15);margin-bottom:16px;">
            <div class="ec-tab ${_ecActiveTab==='acquire'?'active':''}" onclick="window._ecSwitchTab('acquire')">Acquisisci Fondi</div>
            <div class="ec-tab ${_ecActiveTab==='services'?'active':''}" onclick="window._ecSwitchTab('services')">Servizi Esclusivi</div>
        </div>

        ${_ecActiveTab === 'acquire' ? _acqHtml : _serviziHtml}
    `;
}
window.renderTabPremiumStore = renderTabPremiumStore;

window._dcSimPurchase = async function(amount) {
    // Optimistic local credit
    gameState.driverCoins = (gameState.driverCoins || 0) + amount;
    renderTabPremiumStore();
    updateUI();

    // Persist to DB so RPCs can debit the authoritative column
    try {
        const result = await window.ServerState?.addDriverCoins(amount);
        if (result?.ok && result.driver_coins != null) {
            gameState.driverCoins = result.driver_coins;
            renderTabPremiumStore();
            updateUI();
        }
    } catch (e) {
        console.warn('[_dcSimPurchase] RPC error — balance is local only:', e);
    }

    if (typeof showNotification === 'function') showNotification(`🪙 +${amount} Driver Coins! (Acquisto simulato)`, 'success');
    saveGame();
};

window._dcSpend = async function(itemId, cost) {
    if ((gameState.driverCoins || 0) < cost) {
        if (typeof showNotification === 'function') showNotification(`Driver Coins insufficienti! Servono ${cost} DC.`, 'error');
        return;
    }

    // Optimistic local debit — server RPC is the authority
    gameState.driverCoins -= cost;
    updateUI();

    try {
        let result;
        switch (itemId) {
            case 'energy_full':
                result = await window.ServerState?.buyEnergyRefill(cost);
                if (result?.ok) {
                    gameState.energy = 100;
                    logToMap('⚡ Energia CEO ricaricata (DC)!');
                }
                break;
            case 'repair_all':
                result = await window.ServerState?.buyFleetRepair(cost);
                if (result?.ok) {
                    (gameState.fleet || []).forEach(c => { c.condition = 100; c.fuel = 100; c.tirePressure = 100; });
                    logToMap('🔧 Tutta la flotta riparata (DC)!');
                }
                break;
            case 'unlock_ride':
                result = await window.ServerState?.buyVipContact(cost);
                if (result?.ok && typeof generatePOIRide === 'function') {
                    const r = generatePOIRide('ultra');
                    if (r) logToMap('🎫 Contatto VIP: corsa ultra generata (DC)!');
                }
                break;
            case 'offline_limit':
                result = await window.ServerState?.upgradeOfflineLimit(cost);
                if (result?.ok) {
                    gameState.offlineLimit = result.offline_limit_hours;
                    logToMap(`🕐 Limite offline espanso a ${result.offline_limit_hours}h (DC)!`);
                }
                break;
            case 'auto_rest':
                result = await window.ServerState?.buyAutoRest(cost);
                if (result?.ok) {
                    gameState.autoRestEnabled = true;
                    logToMap('🛌 Auto-Rest CEO attivato (DC)!');
                }
                break;
            default:
                // itemId non riconosciuto — rollback immediato
                gameState.driverCoins += cost;
                if (typeof showNotification === 'function') showNotification(`⚠ Operazione non riconosciuta: ${itemId}`, 'error');
                return;
        }

        if (result && !result.ok) {
            // RPC rejected — roll back local debit
            gameState.driverCoins += cost;
            if (typeof showNotification === 'function') showNotification(`⚠ ${result.error || 'Operazione fallita'}`, 'error');
        } else if (result?.ok) {
            // Sync authoritative coin count from server response
            if (result.driver_coins !== undefined) gameState.driverCoins = result.driver_coins;
            if (typeof showNotification === 'function') showNotification(`🪙 −${cost} DC · attivato!`, 'success');
        }
    } catch (e) {
        // Network error — roll back
        gameState.driverCoins += cost;
        console.error('[_dcSpend] RPC error:', e);
        if (typeof showNotification === 'function') showNotification('⚠ Errore di rete — operazione annullata', 'error');
    }

    if (typeof window.checkQuestProgress === 'function') window.checkQuestProgress();
    renderTabPremiumStore();
    updateUI();
    saveGame();
};

// ── EXECUTIVE CLUB — SPEND HANDLERS ──────────────────────────────────────────

window._ecCaffeSospeso = async function() {
    const COST = 10;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    const stressed = (gameState.drivers||[]).filter(d => d.id!=='ceo' && ((d.stress_level||0)>0 || d.burnout_until));
    if (!stressed.length) { showNotification('Nessun autista esausto.','info'); return; }
    stressed.sort((a,b) => (b.stress_level||0)-(a.stress_level||0));
    const target = stressed[0];
    gameState.driverCoins -= COST;
    target.stress_level = 0; delete target.burnout_until;
    try { await window.ServerState?.spendDriverCoins('caffe_sospeso', COST); } catch(e) { console.error(e); }
    logToMap(`☕ Caffè Sospeso: ${target.name} è tornato operativo!`);
    showNotification(`☕ ${target.name}: stress azzerato! (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

window._ecManutenzioneExpress = async function() {
    const COST = 25;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    const damaged = (gameState.fleet||[]).filter(c => (c.condition||100)<100);
    if (!damaged.length) { showNotification('Flotta in perfette condizioni.','info'); return; }
    damaged.sort((a,b) => (a.condition||100)-(b.condition||100));
    const car = damaged[0];
    gameState.driverCoins -= COST;
    car.condition = 100; car.fuel = 100;
    try { await window.ServerState?.spendDriverCoins('manutenzione_express', COST); } catch(e) { console.error(e); }
    logToMap(`🔧 Manutenzione Express: ${car.name||car.id} ripristinata al 100%!`);
    showNotification(`🔧 ${car.name||car.id}: condizione 100%! (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

window._ecTangenteSindacato = async function() {
    const COST = 50;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    if ((gameState.tangenteUntil||0) > gameState.day) { showNotification('Già protetto dagli scioperi!','info'); return; }
    gameState.driverCoins -= COST;
    gameState.tangenteUntil = gameState.day + 1;
    try { await window.ServerState?.spendDriverCoins('tangente_sindacato', COST); } catch(e) { console.error(e); }
    logToMap('🤝 Tangente al Sindacato pagata — scioperi bloccati per 24 ore!');
    showNotification(`🤝 Scioperi bloccati per 24h! (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

window._ecPolizzaKasko = async function() {
    const COST = 150;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    const hasPerm = typeof hasInvestment === 'function' && hasInvestment('inv_kasko') && !gameState.tempKaskoExpiresDay;
    if (hasPerm) { showNotification('Polizza Kasko permanente già attiva!','info'); return; }
    const tempStillActive = (gameState.tempKaskoExpiresDay||0) > 0 && gameState.day <= gameState.tempKaskoExpiresDay;
    if (tempStillActive) { showNotification('Polizza Kasko già attiva!','info'); return; }
    gameState.driverCoins -= COST;
    if (!hasInvestment('inv_kasko')) {
        if (!gameState.investments) gameState.investments = [];
        gameState.investments.push('inv_kasko');
    }
    gameState.tempKaskoExpiresDay = gameState.day + 7;
    try { await window.ServerState?.spendDriverCoins('polizza_kasko', COST); } catch(e) { console.error(e); }
    logToMap('🛡️ Polizza Kasko Corporate attivata per 7 giorni di gioco!');
    showNotification(`🛡️ Kasko attiva per 7 giorni! (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

window._ecRadarVip = async function() {
    const COST = 200;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    const already = (gameState.activeBuffs||[]).some(b => b.type==='vip_queue' && b.until > gameState.day*24+gameState.hour);
    if (already) { showNotification('Radar VIP già attivo!','info'); return; }
    gameState.driverCoins -= COST;
    if (typeof window._applyBuff === 'function') window._applyBuff('radar_vip', 'vip_queue', 100, 72);
    try { await window.ServerState?.spendDriverCoins('radar_vip', COST); } catch(e) { console.error(e); }
    logToMap('📡 Radar VIP: accesso prioritario corse VIP per 72 ore!');
    showNotification(`📡 Radar VIP attivato per 72 ore! (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

window._ecTargaPresidenziale = async function() {
    const COST = 500;
    if ((gameState.driverCoins||0) < COST) { showNotification('Driver Coins insufficienti!','error'); return; }
    if (gameState.hasPrestigiousPlate) { showNotification('Targa Presidenziale già posseduta!','info'); return; }
    gameState.driverCoins -= COST;
    gameState.hasPrestigiousPlate = true;
    try { await window.ServerState?.spendDriverCoins('targa_presidenziale', COST); } catch(e) { console.error(e); }
    logToMap('🏴 Targa Nera Presidenziale: massimo prestigio raggiunto!');
    showNotification(`🏴 Targa Presidenziale applicata! Benvenuto nell\'élite. (−${COST} DC)`, 'success');
    renderTabPremiumStore(); updateUI(); saveGame();
};

// ── MERCATO AUTO + ASTE LIVE ──────────────────────────────────────────────────

