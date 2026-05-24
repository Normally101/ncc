'use strict';
/* ui-market.js — Chauffeur Empire
   renderTabMarket: mercato auto P2P, aste live.
   Dipendenze: engine.js, design-system.js */

function renderTabMarket() {
    const container = document.getElementById('tab-container');
    const npcList     = gameState.npcMarket || [];
    const myListings  = (gameState.marketplace||[]).map(l => ({...l, car:gameState.fleet.find(c=>c.id===l.carId)})).filter(l=>l.car);
    const auc         = gameState.activeAuction;
    const curH        = gameState.day * 24 + gameState.hour;
    const fleetVal    = gameState.fleet.reduce((s,c)=>{
        const cond = c.condition||100;
        return s + Math.round(20000*(cond/100)*(c.tier==='ultra'?5:c.tier==='vip'?3:c.tier==='business'?1.8:1));
    }, 0);

    let html = DS.header({
        eyebrow: 'Compravendita Veicoli',
        title:   'Mercato Auto',
        subtitle:`${npcList.length} disponibili · ${myListings.length} tuoi annunci · Flotta stimata €${Math.round(fleetVal/1000)}k`,
    }) + DS.kpiStrip([
        { label:'Usato Disponibile', val: npcList.length,                                  color: npcList.length > 0 ? 'blue' : '' },
        { label:'Tuoi Annunci',      val: myListings.length,                               color: myListings.length > 0 ? 'gold' : '' },
        { label:'Asta Live',         val: auc ? 'ATTIVA' : 'Nessuna',                      color: auc ? 'red' : '' },
        { label:'Budget',            val: '€' + ((gameState.cash||0)/1000).toFixed(0)+'k', color:'green' },
    ]);

    // ── ASTA LIVE ─────────────────────────────────────────────────
    html += `<div class="ds-eyebrow" style="margin:0 0 12px">🔨 Asta Live</div>`;
    if (auc) {
        const hoursLeft = Math.max(0, auc.endsHour - curH);
        const isWinning = auc.playerBid && auc.playerBid >= auc.currentBid;
        const urgentColor = hoursLeft < 3 ? 'var(--red)' : 'var(--text)';
        html += `<div class="ds-card ds-card--gold" style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
                <div>
                    <div style="font-size:13px;font-weight:700;color:var(--text)">${auc.name}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${auc.tier.toUpperCase()}</div>
                    <div style="margin-top:6px">
                        ${isWinning ? DS.pill('✅ Stai vincendo!', 'green') : auc.playerBid ? DS.pill('⚠ Superato!', 'red', true) : DS.pill('Fai un\'offerta', 'blue')}
                    </div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:9px;color:var(--text-muted)">Scade in</div>
                    <div style="font-size:20px;font-weight:700;font-family:var(--font-mono);color:${urgentColor}">${hoursLeft}h</div>
                    <div style="font-size:20px;font-weight:700;font-family:var(--font-mono);color:var(--gold)">€${auc.currentBid.toLocaleString()}</div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
                ${[auc.currentBid + 5000, auc.currentBid + 15000, auc.currentBid + 50000].map(bid =>
                    `<button onclick="bidOnAuction(${bid})" class="ds-btn ds-btn--gold" style="flex-direction:column;gap:2px;padding:10px 6px;justify-content:center;font-size:9px">
                        <span>+€${(bid - auc.currentBid).toLocaleString()}</span>
                        <span style="opacity:.6;font-size:8px">tot €${bid.toLocaleString()}</span>
                    </button>`
                ).join('')}
            </div>
        </div>`;
    } else {
        html += DS.empty({ icon:'🔨', title:'Nessuna asta attiva', body:'Le aste rare partono casualmente ogni giorno di gioco.' });
        html += '<div style="margin-bottom:20px"></div>';
    }

    // ── VEICOLI NPC ───────────────────────────────────────────────
    html += `<div class="ds-eyebrow" style="margin:0 0 12px">🚗 Usato Disponibile (${npcList.length})</div>`;
    if (npcList.length === 0) {
        html += DS.empty({ icon:'🚗', title:'Nessun veicolo', body:'Il mercato si aggiorna ogni 3 giorni di gioco.' });
    } else {
        html += `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">`;
        npcList.forEach(listing => {
            const condColor = listing.condition < 40 ? 'red' : listing.condition < 70 ? 'orange' : 'green';
            const canBuy = (gameState.cash||0) >= listing.price;
            html += `<div class="ds-card" style="display:flex;justify-content:space-between;align-items:center;gap:12px">
                <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:700;color:var(--text)">${listing.name}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${listing.tier.toUpperCase()} · ${Math.floor(listing.mileage/1000)}k km</div>
                    <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
                        ${DS.pill(listing.condition + '%', condColor)}
                        ${DS.progress(listing.condition, condColor)}
                    </div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div style="font-size:15px;font-weight:700;color:var(--gold);font-family:var(--font-mono)">€${listing.price.toLocaleString()}</div>
                    ${DS.btn({ label:'Acquista', color: canBuy ? 'gold' : 'ghost', onclick:`buyNpcCar('${listing.id}')`, disabled:!canBuy, size:'sm' })}
                </div>
            </div>`;
        });
        html += `</div>`;
    }

    // ── TUOI ANNUNCI ──────────────────────────────────────────────
    html += `<div class="ds-eyebrow" style="margin:0 0 12px">📋 Tuoi Annunci (${myListings.length})</div>`;
    if (myListings.length === 0) {
        html += `<div style="font-size:11px;color:var(--text-muted);margin-bottom:20px">Nessun annuncio attivo. Vai in <strong>Flotta</strong> → card veicolo → Metti in Vendita.</div>`;
    } else {
        html += `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">`;
        myListings.forEach(l => {
            const daysLeft = Math.max(0, 2 - (gameState.day - l.listedDay));
            html += `<div class="ds-card" style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <div style="font-size:12px;font-weight:700;color:var(--text)">${l.car.name}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:2px">€${l.askPrice.toLocaleString()} · ${daysLeft > 0 ? `Acquirente in ~${daysLeft}g` : 'Vendita in corso…'}</div>
                </div>
                ${DS.btn({ label:'Ritira', color:'red', onclick:`cancelListing('${l.id}')`, size:'sm' })}
            </div>`;
        });
        html += `</div>`;
    }

    // ── VENDI DALLA FLOTTA ────────────────────────────────────────
    const sellableCars = gameState.fleet.filter(c =>
        !c.isLease &&
        !(gameState.marketplace||[]).some(l => l.carId === c.id) &&
        !gameState.drivers.some(d => d.assignedCarId === c.id && d.status === 'busy')
    );
    if (sellableCars.length > 0) {
        html += `<div class="ds-eyebrow" style="margin:0 0 12px">💰 Metti in Vendita</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">`;
        sellableCars.forEach(car => {
            const condPct = Math.floor(car.condition || 0);
            const suggest = Math.round(20000*(condPct/100)*(car.tier==='ultra'?5:car.tier==='vip'?3:car.tier==='business'?1.8:1));
            html += `<div class="ds-card" style="display:flex;justify-content:space-between;align-items:center">
                <div>
                    <div style="font-size:12px;font-weight:700;color:var(--text)">${car.name}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${car.tier.toUpperCase()} · ${condPct}% condizione</div>
                    <div style="font-size:10px;color:var(--green);margin-top:2px">Stima: ~€${suggest.toLocaleString()}</div>
                </div>
                ${DS.btn({ label:`Vendi ~€${(suggest/1000).toFixed(0)}k`, color:'gold', onclick:`listCarForSale('${car.id}', ${suggest})`, size:'sm' })}
            </div>`;
        });
        html += `</div>`;
    }

    // ── P2P MERCATO REALE ─────────────────────────────────────────
    if (typeof renderP2PMarketSection === 'function') html += renderP2PMarketSection();

    container.innerHTML = html;
}
window.renderTabMarket = renderTabMarket;

