'use strict';
/* ui-market.js — Chauffeur Empire
   renderTabMarket: mercato auto P2P, aste live. */

function renderTabMarket() {
    const container = document.getElementById('tab-container');
    const npcList    = gameState.npcMarket || [];
    const myListings = (gameState.marketplace||[]).map(l => ({...l, car:gameState.fleet.find(c=>c.id===l.carId)})).filter(l=>l.car);
    const auc        = gameState.activeAuction;
    const curH       = gameState.day * 24 + gameState.hour;
    const fleetVal   = gameState.fleet.reduce((s,c) => {
        const cond = c.condition||100;
        return s + Math.round(20000*(cond/100)*(c.tier==='ultra'?5:c.tier==='vip'?3:c.tier==='business'?1.8:1));
    }, 0);

    const _pill = (t, c) => `<span style="display:inline-flex;padding:2px 7px;border-radius:3px;font-size:8px;font-weight:700;font-family:monospace;background:${c}18;border:1px solid ${c}44;color:${c}">${t}</span>`;
    const _btn  = (t, fn, c, dis) => {
        const bg = c==='gold'?'#1a1608':c==='red'?'#1e0d0d':'#161b22';
        const bd = c==='gold'?'#c79a2a':c==='red'?'#471a1a':'#21262d';
        const tc = c==='gold'?'#c79a2a':c==='red'?'#db5746':'#6b7280';
        return `<button onclick="${dis?'':fn}" ${dis?'disabled':''} style="background:${bg};border:1px solid ${bd};color:${tc};padding:5px 12px;border-radius:4px;font-size:11px;font-weight:700;cursor:${dis?'not-allowed':'pointer'};opacity:${dis?.45:1};font-family:inherit;white-space:nowrap">${t}</button>`;
    };
    const _SEC = t => `<div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin:20px 0 8px;font-weight:600">${t}</div>`;

    // ── KPI STRIP ────────────────────────────────────────────────
    let html = `
<div style="padding:16px;max-width:800px">

    <div style="padding-bottom:16px;border-bottom:1px solid #21262d;margin-bottom:16px">
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Compravendita Veicoli</div>
        <div style="font-size:20px;font-weight:700;color:#e6edf3;letter-spacing:-.01em">Mercato Auto</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">${npcList.length} disponibili · ${myListings.length} tuoi annunci · Flotta stimata €${Math.round(fleetVal/1000)}k</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Usato Disponibile</div>
            <div style="font-size:18px;font-weight:700;color:${npcList.length>0?'#2f74c0':'#6b7280'};font-family:monospace">${npcList.length}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Tuoi Annunci</div>
            <div style="font-size:18px;font-weight:700;color:${myListings.length>0?'#c79a2a':'#6b7280'};font-family:monospace">${myListings.length}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Asta Live</div>
            <div style="font-size:18px;font-weight:700;color:${auc?'#db5746':'#6b7280'};font-family:monospace">${auc?'ATTIVA':'—'}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Budget</div>
            <div style="font-size:18px;font-weight:700;color:#1aa06a;font-family:monospace">€${((gameState.cash||0)/1000).toFixed(0)}k</div>
        </div>
    </div>`;

    // ── ASTA LIVE ─────────────────────────────────────────────────
    html += _SEC('Asta Live');
    if (auc) {
        const hoursLeft = Math.max(0, auc.endsHour - curH);
        const isWinning = auc.playerBid && auc.playerBid >= auc.currentBid;
        const urgColor  = hoursLeft < 3 ? '#db5746' : '#6b7280';
        const bids      = [auc.currentBid + 5000, auc.currentBid + 15000, auc.currentBid + 50000];
        html += `
        <div style="background:#161b22;border:1px solid #c79a2a;border-radius:6px;padding:16px;margin-bottom:4px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
                <div>
                    <div style="font-size:13px;font-weight:700;color:#e6edf3">${auc.name}</div>
                    <div style="font-size:10px;color:#6b7280;margin-top:2px;font-family:monospace">${auc.tier.toUpperCase()}</div>
                    <div style="margin-top:8px">
                        ${isWinning ? _pill('STAI VINCENDO', '#1aa06a') : auc.playerBid ? _pill('SUPERATO', '#db5746') : _pill('FAI UN\'OFFERTA', '#2f74c0')}
                    </div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:9px;color:#6b7280;margin-bottom:2px">Scade in</div>
                    <div style="font-size:22px;font-weight:700;font-family:monospace;color:${urgColor}">${hoursLeft}h</div>
                    <div style="font-size:20px;font-weight:700;font-family:monospace;color:#c79a2a">€${auc.currentBid.toLocaleString()}</div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
                ${bids.map(bid => `
                <button onclick="bidOnAuction(${bid})" style="background:#1a1608;border:1px solid #c79a2a;color:#c79a2a;padding:8px 6px;border-radius:4px;cursor:pointer;font-family:monospace;font-weight:700;font-size:9px;display:flex;flex-direction:column;align-items:center;gap:2px">
                    <span>+€${(bid-auc.currentBid).toLocaleString()}</span>
                    <span style="opacity:.6;font-size:8px">tot €${bid.toLocaleString()}</span>
                </button>`).join('')}
            </div>
        </div>`;
    } else {
        html += `<div style="text-align:center;padding:20px;background:#161b22;border:1px solid #21262d;border-radius:6px;margin-bottom:4px">
            <div style="font-size:13px;color:#6b7280;margin-bottom:4px">Nessuna asta attiva</div>
            <div style="font-size:11px;color:#6b7280">Le aste rare partono casualmente ogni giorno di gioco.</div>
        </div>`;
    }

    // ── VEICOLI NPC ───────────────────────────────────────────────
    html += _SEC(`Usato Disponibile (${npcList.length})`);
    if (npcList.length === 0) {
        html += `<div style="text-align:center;padding:16px;background:#161b22;border:1px solid #21262d;border-radius:6px;color:#6b7280;font-size:11px">Il mercato si aggiorna ogni 3 giorni di gioco.</div>`;
    } else {
        html += `<div style="background:#161b22;border:1px solid #21262d;border-radius:6px;overflow:hidden" class="ce-stagger">`;
        npcList.forEach(l => {
            const cond = l.condition||0;
            const condColor = cond < 40 ? '#db5746' : cond < 70 ? '#e0922e' : '#1aa06a';
            const canBuy    = (gameState.cash||0) >= l.price;
            html += `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 14px;border-bottom:1px solid #21262d;gap:12px">
                <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:700;color:#e6edf3">${l.name}</div>
                    <div style="font-size:10px;color:#6b7280;margin-top:2px;font-family:monospace">${l.tier.toUpperCase()} · ${Math.floor(l.mileage/1000)}k km · <span style="color:${condColor}">${cond}%</span></div>
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
                    <div style="font-size:14px;font-weight:700;color:#c79a2a;font-family:monospace">€${l.price.toLocaleString()}</div>
                    ${_btn('Acquista', `buyNpcCar('${l.id}')`, canBuy?'gold':'', !canBuy)}
                </div>
            </div>`;
        });
        html += `</div>`;
    }

    // ── TUOI ANNUNCI ──────────────────────────────────────────────
    html += _SEC(`Tuoi Annunci (${myListings.length})`);
    if (myListings.length === 0) {
        html += `<div style="font-size:11px;color:#6b7280;padding:12px 0">Nessun annuncio attivo. Vai in <strong style="color:#e6edf3">Flotta</strong> → card veicolo → Metti in Vendita.</div>`;
    } else {
        html += `<div style="background:#161b22;border:1px solid #21262d;border-radius:6px;overflow:hidden">`;
        myListings.forEach(l => {
            const daysLeft = Math.max(0, 2 - (gameState.day - l.listedDay));
            html += `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 14px;border-bottom:1px solid #21262d;gap:12px">
                <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:700;color:#e6edf3">${l.car.name}</div>
                    <div style="font-size:10px;color:#6b7280;margin-top:2px;font-family:monospace">€${l.askPrice.toLocaleString()} · ${daysLeft > 0 ? `Acquirente ~${daysLeft}g` : 'Vendita in corso…'}</div>
                </div>
                ${_btn('Ritira', `cancelListing('${l.id}')`, 'red', false)}
            </div>`;
        });
        html += `</div>`;
    }

    // ── METTI IN VENDITA ──────────────────────────────────────────
    const sellable = gameState.fleet.filter(c =>
        !c.isLease &&
        !(gameState.marketplace||[]).some(l => l.carId === c.id) &&
        !gameState.drivers.some(d => d.assignedCarId === c.id && d.status === 'busy')
    );
    if (sellable.length > 0) {
        html += _SEC('Metti in Vendita');
        html += `<div style="background:#161b22;border:1px solid #21262d;border-radius:6px;overflow:hidden">`;
        sellable.forEach(car => {
            const condPct = Math.floor(car.condition || 0);
            const suggest = Math.round(20000*(condPct/100)*(car.tier==='ultra'?5:car.tier==='vip'?3:car.tier==='business'?1.8:1));
            html += `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 14px;border-bottom:1px solid #21262d;gap:12px">
                <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:700;color:#e6edf3">${car.name}</div>
                    <div style="font-size:10px;color:#6b7280;margin-top:2px;font-family:monospace">${car.tier.toUpperCase()} · ${condPct}% · Stima <span style="color:#1aa06a">~€${suggest.toLocaleString()}</span></div>
                </div>
                ${_btn(`Vendi ~€${(suggest/1000).toFixed(0)}k`, `listCarForSale('${car.id}', ${suggest})`, 'gold', false)}
            </div>`;
        });
        html += `</div>`;
    }

    // ── P2P MERCATO REALE ─────────────────────────────────────────
    if (typeof renderP2PMarketSection === 'function') html += renderP2PMarketSection();

    html += `</div>`;
    container.innerHTML = `<div class="em em-page"><div class="em-wrap">` + html + `</div></div>`;
}
window.renderTabMarket = renderTabMarket;
