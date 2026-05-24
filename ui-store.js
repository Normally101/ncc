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

    // ── INJECT STYLES ────────────────────────────────────────────────────────
    if (!document.getElementById('ec-style')) {
        const st = document.createElement('style');
        st.id = 'ec-style';
        st.textContent = `
            .ec-tab { padding:8px 20px;font-size:11px;font-weight:700;letter-spacing:.08em;
                border-bottom:2px solid transparent;color:rgba(240,244,255,0.4);cursor:pointer;
                transition:color .15s,border-color .15s;user-select:none;text-transform:uppercase; }
            .ec-tab.active { color:#d4af37;border-bottom-color:#d4af37; }
            .ec-tab:hover:not(.active) { color:rgba(240,244,255,0.8); }

            .ec-pack-card {
                border-radius:14px;padding:0;overflow:hidden;position:relative;
                transition:transform .18s ease,box-shadow .18s ease;cursor:pointer;
                display:flex;flex-direction:column;
            }
            .ec-pack-card:hover { transform:translateY(-4px);box-shadow:0 16px 40px rgba(0,0,0,0.5); }
            .ec-pack-card.featured { grid-column:span 2; }

            .ec-pack-art {
                display:flex;align-items:center;justify-content:center;flex-direction:column;
                gap:4px;padding:24px 16px 16px;position:relative;min-height:120px;
            }
            .ec-pack-body { padding:14px 16px 16px;flex:1;display:flex;flex-direction:column; }

            .ec-badge {
                position:absolute;top:10px;left:10px;font-size:8px;font-weight:900;
                padding:3px 9px;border-radius:20px;letter-spacing:.06em;text-transform:uppercase;
            }
            .ec-badge-popular { background:linear-gradient(90deg,#f97316,#ef4444);color:#fff; }
            .ec-badge-value   { background:linear-gradient(90deg,#16a34a,#15803d);color:#fff; }
            .ec-badge-new     { background:linear-gradient(90deg,#6366f1,#8b5cf6);color:#fff; }
            .ec-badge-limited { background:linear-gradient(90deg,#c9a227,#f0d060);color:#000; }

            .ec-buy-btn {
                width:100%;padding:11px;border:none;border-radius:8px;font-weight:800;
                font-size:12px;letter-spacing:.04em;cursor:pointer;
                transition:all .15s ease;margin-top:auto;
            }
            .ec-buy-btn:hover:not(:disabled) { filter:brightness(1.12);transform:translateY(-1px); }
            .ec-buy-btn:disabled { opacity:.35;cursor:not-allowed;background:#374151!important;color:#9ca3af!important; }

            .ec-service-card {
                background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);
                border-radius:12px;padding:14px 16px;display:flex;align-items:center;
                gap:14px;transition:background .15s,border-color .15s;
            }
            .ec-service-card:hover:not(.ec-disabled) { background:rgba(255,255,255,0.06);border-color:rgba(212,175,55,0.2); }
            .ec-service-card.ec-disabled { opacity:.45; }
            .ec-service-icon {
                width:44px;height:44px;border-radius:10px;display:flex;align-items:center;
                justify-content:center;font-size:20px;flex-shrink:0;
            }
            .ec-svc-btn {
                padding:7px 14px;border:none;border-radius:7px;font-weight:800;font-size:11px;
                cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all .15s;
                background:linear-gradient(135deg,#c9a227,#d4af37);color:#000;
            }
            .ec-svc-btn:hover:not(:disabled) { background:linear-gradient(135deg,#d4af37,#edd97a);box-shadow:0 4px 12px rgba(212,175,55,0.3); }
            .ec-svc-btn:disabled { opacity:.4;cursor:not-allowed;background:#374151!important;color:#9ca3af!important; }
            .ec-cat-head {
                font-size:9px;font-weight:700;letter-spacing:.14em;color:rgba(212,175,55,0.65);
                text-transform:uppercase;padding-bottom:8px;margin-bottom:10px;margin-top:20px;
                border-bottom:1px solid rgba(212,175,55,0.15);display:flex;align-items:center;gap:8px;
            }
            .ec-cat-head:first-child { margin-top:0; }
        `;
        document.head.appendChild(st);
    }

    const kaskoActive    = typeof hasInvestment === 'function' && hasInvestment('inv_kasko');
    const tempKaskoDay   = gameState.tempKaskoExpiresDay || 0;
    const tempKaskoActive = kaskoActive && tempKaskoDay > 0 && gameState.day <= tempKaskoDay;
    const execPassActive = !!(gameState.executivePassActive && gameState.day <= (gameState.executivePassExpiresDay||0));
    const radarActive    = (gameState.activeBuffs||[]).some(b => b.type==='vip_queue' && b.until > gameState.day*24+gameState.hour);
    const plate          = !!gameState.hasPrestigiousPlate;
    const restingCount   = (gameState.drivers||[]).filter(d => d.id!=='ceo' && d.status==='resting').length;
    const stressedCount  = (gameState.drivers||[]).filter(d => d.id!=='ceo' && ((d.stress_level||0)>0||d.burnout_until)).length;
    const trainingCount  = (gameState.driverAcademy||[]).length;
    const constructions  = (gameState.constructions||[]);
    const lowFuel        = (gameState.fleet||[]).filter(c => (c.fuel||0)<100).length;
    const ceoNeedEnergy  = (gameState.energy||0) < 100;

    // ── TAB: PACCHETTI DC ────────────────────────────────────────────────────
    const ecPkgs = [
        {
            dc:50,   price:'€4,99',  label:'Starter Pack',       sub:'Per iniziare con il piede giusto',
            art:'🪙', artBg:'linear-gradient(160deg,#1a1200,#2d1e00)',
            border:'rgba(184,134,11,0.35)', btnBg:'linear-gradient(135deg,#b8860b,#d4af37)', btnColor:'#000',
            badge:null, coins:'🟡',
        },
        {
            dc:220,  price:'€19,99', label:'Corporate Pack',      sub:'+10% Executive Yield incluso',
            art:'💰', artBg:'linear-gradient(160deg,#0a1525,#102040)',
            border:'rgba(96,165,250,0.35)', btnBg:'linear-gradient(135deg,#1d4ed8,#3b82f6)', btnColor:'#fff',
            badge:{cls:'ec-badge-popular',txt:'POPOLARE'}, coins:'🟡🟡',
        },
        {
            dc:600,  price:'€49,99', label:'Offshore Pack',       sub:'+20% Rendimento garantito',
            art:'💎', artBg:'linear-gradient(160deg,#0c1a0c,#163016)',
            border:'rgba(34,197,94,0.40)', btnBg:'linear-gradient(135deg,#15803d,#22c55e)', btnColor:'#fff',
            badge:{cls:'ec-badge-value',txt:'BEST VALUE'}, coins:'🟡🟡🟡',
        },
        {
            dc:1300, price:'€99,99', label:'Il Fondo Sovrano',    sub:'+30% Rendimento massimizzato',
            art:'👑', artBg:'linear-gradient(160deg,#16080a,#2d0f15)',
            border:'rgba(212,175,55,0.60)', btnBg:'linear-gradient(135deg,#b8860b,#f0d060,#b8860b)', btnColor:'#000',
            badge:{cls:'ec-badge-limited',txt:'PREMIUM'}, coins:'🟡🟡🟡🟡', featured:false,
        },
    ];

    const _packCard = (p) => `
<div class="ec-pack-card${p.featured?' featured':''}" style="border:1px solid ${p.border};background:#0a0c14">
  ${p.badge ? `<div class="ec-badge ${p.badge.cls}">${p.badge.txt}</div>` : ''}
  <div class="ec-pack-art" style="background:${p.artBg}">
    <div style="font-size:44px;line-height:1;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.6))">${p.art}</div>
    <div style="font-size:11px;letter-spacing:.06em;color:rgba(255,255,255,0.4)">${p.coins}</div>
  </div>
  <div class="ec-pack-body">
    <div style="margin-bottom:6px">
      <div style="display:flex;align-items:baseline;gap:5px">
        <span style="font-size:32px;font-weight:900;color:#d4af37;font-family:'Roboto Mono',monospace;line-height:1">${p.dc}</span>
        <span style="font-size:13px;font-weight:700;color:rgba(212,175,55,0.7)">DC</span>
      </div>
      <div style="font-size:12px;font-weight:700;color:var(--text);margin-top:4px">${p.label}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${p.sub}</div>
    </div>
    <button class="ec-buy-btn" style="background:${p.btnBg};color:${p.btnColor}"
      onclick="window._dcSimPurchase(${p.dc})">
      Acquista · ${p.price}
    </button>
  </div>
</div>`;

    const _acqHtml = `
<div style="font-size:10px;color:rgba(212,175,55,0.45);text-align:center;margin-bottom:16px">
  Acquisti simulati (demo) — i Driver Coins si accumulano anche completando missioni Presidential e trasferimenti VIP
</div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
  ${ecPkgs.map(_packCard).join('')}
</div>
<div style="margin-top:20px;padding:14px 16px;background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.15);border-radius:10px;display:flex;align-items:center;gap:14px">
  <span style="font-size:24px">ℹ️</span>
  <div style="font-size:11px;color:var(--text-muted);line-height:1.5">
    <strong style="color:var(--gold)">Driver Coins (DC)</strong> sono la valuta premium di Chauffeur Empire.
    Usali nella scheda <em>Servizi Esclusivi</em> per accelerare operazioni, sbloccare bonus e attivare pass speciali.
    Non scadono mai.
  </div>
</div>`;

    // ── TAB: SERVIZI ESCLUSIVI ────────────────────────────────────────────────
    const _svcCard = (it) => `
<div class="ec-service-card${it.disabled?' ec-disabled':''}">
  <div class="ec-service-icon" style="background:${it.iconBg||'rgba(255,255,255,0.06)'}">
    ${it.icon}
  </div>
  <div style="flex:1;min-width:0">
    <div style="font-size:12px;font-weight:700;color:var(--text);line-height:1.2">${it.label}</div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:2px;line-height:1.3">${it.sub}</div>
  </div>
  <button class="ec-svc-btn" onclick="${it.disabled?'':it.fn}" ${it.disabled?'disabled':''}>
    ${it.disabled ? `<span style="font-size:9px">${it.disabledLabel}</span>` : `<span style="font-size:9px;opacity:.7">DC</span> ${it.cost}`}
  </button>
</div>`;

    const opItems = [
        { label:'Rifornimento Flotta',  sub:`${lowFuel} veicoli con carburante < 100%`,     cost:3,   icon:'⛽', iconBg:'rgba(249,115,22,0.15)', fn:'fuelBoostDC()',                    disabled:lowFuel===0,            disabledLabel:'Flotta piena' },
        { label:'Ricarica Energia CEO', sub:'Recupero immediato al 100%',                    cost:4,   icon:'⚡', iconBg:'rgba(250,204,21,0.15)',  fn:'energyBoostDC()',                  disabled:!ceoNeedEnergy,         disabledLabel:'Energia al 100%' },
        { label:'Sveglia Flotta',       sub:`${restingCount} autisti in pausa forzata`,      cost:Math.max(3,restingCount*2), icon:'⏰', iconBg:'rgba(96,165,250,0.15)', fn:'wakeAllDriversDC()', disabled:restingCount===0, disabledLabel:'Nessuno a riposo' },
        { label:'Caffè Sospeso',        sub:'Azzera lo stress del driver più esausto',       cost:10,  icon:'☕', iconBg:'rgba(180,120,60,0.20)',  fn:'window._ecCaffeSospeso()',         disabled:stressedCount===0,      disabledLabel:'Staff in forma' },
        { label:'Benessere Staff',      sub:`${stressedCount} autisti con stress o burnout`, cost:Math.max(4,stressedCount*2), icon:'💊', iconBg:'rgba(34,197,94,0.15)', fn:'healAllDriversDC()', disabled:stressedCount===0, disabledLabel:'Staff in forma' },
        { label:'Manutenzione Express', sub:'Ripara il veicolo più danneggiato al 100%',     cost:25,  icon:'🔧', iconBg:'rgba(148,163,184,0.12)', fn:'window._ecManutenzioneExpress()',  disabled:(gameState.fleet||[]).every(c=>(c.condition||100)>=100), disabledLabel:'Flotta perfetta' },
        { label:'Completamento Corsi',  sub:`${trainingCount} corsi in accademia attivi`,    cost:Math.max(1,trainingCount*5), icon:'🎓', iconBg:'rgba(139,92,246,0.15)', fn:'skipAllAcademyDC()', disabled:trainingCount===0, disabledLabel:'Nessun corso' },
        { label:'Costruzioni Lampo',    sub:`${constructions.length} cantieri in corso`,     cost:Math.max(1,constructions.length*8), icon:'🏗️', iconBg:'rgba(251,191,36,0.12)', fn:'skipAllConstructionsDC()', disabled:constructions.length===0, disabledLabel:'Nessuna costruzione' },
        { label:'Tangente al Sindacato',sub:'Blocca scioperi per 1 giorno di gioco',         cost:50,  icon:'🤝', iconBg:'rgba(244,63,94,0.12)',   fn:'window._ecTangenteSindacato()',    disabled:(gameState.tangenteUntil||0)>gameState.day, disabledLabel:'Già protetto' },
        { label:'Limite Offline +2h',   sub:`Progressione offline attuale: ${offLimit}h / max 12h`, cost:20, icon:'🕐', iconBg:'rgba(99,102,241,0.15)', fn:"window._dcSpend('offline_limit',20)", disabled:offLimit>=12, disabledLabel:'Massimo raggiunto' },
        { label:'Auto-Rest CEO',        sub:'Recupero energetico automatico durante offline', cost:30,  icon:'🛌', iconBg:'rgba(6,182,212,0.12)',   fn:"window._dcSpend('auto_rest',30)", disabled:autoRest, disabledLabel:'Già attivo' },
    ];

    const bundleItems = [
        { label:'Pacchetto Operativo',  sub:'Carburante + Energia CEO + Sveglia autisti',     cost:9,   icon:'🚀', iconBg:'rgba(34,197,94,0.18)',   fn:'opsBundleDC()',  disabled:lowFuel===0&&!ceoNeedEnergy&&restingCount===0, disabledLabel:'Tutto OK' },
        { label:'Pacchetto Imperiale',  sub:'Tutto in uno: flotta, staff, corsi, edifici',    cost:35,  icon:'👑', iconBg:'rgba(212,175,55,0.18)',   fn:'fullBundleDC()', disabled:false, disabledLabel:'' },
    ];

    const assicItems = [
        { label:'Polizza Kasko Corporate', icon:'🛡️', iconBg:'rgba(59,130,246,0.15)', cost:150, fn:'window._ecPolizzaKasko()',
          sub: tempKaskoActive ? `Attiva fino al giorno ${tempKaskoDay} (${tempKaskoDay-gameState.day} gg rimasti)` : kaskoActive&&!tempKaskoActive ? 'Polizza permanente attiva' : 'Copertura incidenti per 7 giorni di gioco',
          disabled:kaskoActive&&!tempKaskoActive, disabledLabel:'Attiva' },
        { label:'Executive Pass', icon:'💎', iconBg:'rgba(212,175,55,0.15)', cost:150, fn:'activateExecutivePass()',
          sub: execPassActive ? `Attivo — ${(gameState.executivePassExpiresDay||0)-gameState.day} giorni rimasti` : '+25% slot corse · −50% stress · Insta-Repair 1DC · corse VIP extra',
          disabled:execPassActive, disabledLabel:'Attivo' },
        { label:'Radar VIP', icon:'📡', iconBg:'rgba(167,139,250,0.15)', cost:200, fn:'window._ecRadarVip()',
          sub: radarActive ? 'Attivo — corse VIP in priorità assoluta' : 'Priority queue +100% per 72 ore di gioco',
          disabled:radarActive, disabledLabel:'Attivo' },
        { label:'Targa Nera Presidenziale', icon:'🏴', iconBg:'rgba(0,0,0,0.4)', cost:500, fn:'window._ecTargaPresidenziale()',
          sub: plate ? 'Già applicata — prestigio massimo' : 'Cosmetico permanente · sblocca clienti esclusivi e rep extra',
          disabled:plate, disabledLabel:'Posseduta' },
    ];

    const _serviziHtml = `
<div class="ec-cat-head">⚡ Operatività & Flotta</div>
<div style="display:flex;flex-direction:column;gap:6px">${opItems.map(_svcCard).join('')}</div>
<div class="ec-cat-head">📦 Bundle</div>
<div style="display:flex;flex-direction:column;gap:6px">${bundleItems.map(_svcCard).join('')}</div>
<div class="ec-cat-head">🏅 Abbonamenti & Licenze</div>
<div style="display:flex;flex-direction:column;gap:6px">${assicItems.map(_svcCard).join('')}</div>`;

    // ── RENDER ────────────────────────────────────────────────────────────────
    container.innerHTML = `
<div style="background:var(--bg);min-height:100%;padding-bottom:60px">

  <!-- Hero banner -->
  <div style="background:linear-gradient(135deg,rgba(12,8,25,0.98) 0%,rgba(25,15,50,0.98) 50%,rgba(12,8,25,0.98) 100%);border-bottom:1px solid rgba(212,175,55,0.20);padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px">
    <div>
      <div style="font-size:9px;letter-spacing:.22em;color:rgba(212,175,55,0.55);text-transform:uppercase;font-weight:700;margin-bottom:4px">Chauffeur Empire</div>
      <div style="font-size:22px;font-weight:900;color:#d4af37;letter-spacing:.04em;font-family:var(--font-display)">Executive Club</div>
      <div style="font-size:11px;color:rgba(240,244,255,0.35);margin-top:3px">Driver Coins · Servizi Esclusivi · Potenziamenti Flotta</div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div style="font-size:8px;letter-spacing:.1em;color:rgba(212,175,55,0.4);text-transform:uppercase;margin-bottom:6px">Il tuo saldo</div>
      <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end">
        <div style="width:32px;height:32px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#f0d060,#c9a227 55%,#8b6914);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#000;box-shadow:0 2px 8px rgba(212,175,55,0.4)">DC</div>
        <div>
          <span style="font-size:28px;font-weight:900;color:#d4af37;font-family:'Roboto Mono',monospace">${dc.toLocaleString()}</span>
          <span style="font-size:12px;color:rgba(212,175,55,0.5);margin-left:4px">DC</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Tabs -->
  <div style="display:flex;border-bottom:1px solid rgba(255,255,255,0.07);background:rgba(0,0,0,0.20);padding:0 16px">
    <div class="ec-tab ${_ecActiveTab==='acquire'?'active':''}" onclick="window._ecSwitchTab('acquire')">💳 Acquista DC</div>
    <div class="ec-tab ${_ecActiveTab==='services'?'active':''}" onclick="window._ecSwitchTab('services')">⚡ Servizi Esclusivi</div>
  </div>

  <!-- Content -->
  <div style="padding:20px 16px">
    ${_ecActiveTab === 'acquire' ? _acqHtml : _serviziHtml}
  </div>

</div>`;
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

