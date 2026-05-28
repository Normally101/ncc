'use strict';
/* ================================================================
   p2p-render.js — Chauffeur Empire
   P2P UI render: renderP2PMarketSection, renderP2PSharesSection,
   renderP2PHoldingsSection, renderP2PSindacatoSection, p2pInit.
   Dipendenze: p2p-market.js (state + actions), engine.js
   ================================================================ */

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 6: RENDER — UI P2P nelle tab esistenti
// ─────────────────────────────────────────────────────────────────────────────

window.renderP2PMarketSection = function() {
    const uid      = _uid();
    const listings = window._p2pMarket.listings || [];

    if (!uid) return `<div style="font-size:9px;color:#8b949e;font-style:italic;margin-bottom:12px">Accedi per vedere il mercato P2P reale.</div>`;

    const myListings    = listings.filter(l => l.seller_user_id === uid);
    const otherListings = listings.filter(l => l.seller_user_id !== uid);

    let html = `<div style="font-size:8px;color:#d4af37;text-transform:uppercase;letter-spacing:.1em;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:4px;margin-bottom:8px;margin-top:16px">🌐 Mercato P2P Reale (${otherListings.length} annunci)</div>`;

    if (otherListings.length === 0) {
        html += `<div style="font-size:9px;color:#6b7280;font-style:italic;margin-bottom:12px">Nessun annuncio al momento. Sii il primo!</div>`;
    } else {
        otherListings.slice(0, 20).forEach(l => {
            const car  = l.car_snapshot || {};
            const cond = car.condition ?? 100;
            const condColor = cond > 70 ? '#3fb950' : cond > 40 ? '#f59e0b' : '#f85149';
            const canBuy = (gameState.cash || 0) >= l.ask_price;
            html += `
            <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:8px 12px;margin-bottom:6px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="min-width:0;flex:1">
                        <div style="font-size:10px;font-weight:700;color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${car.name || 'Auto sconosciuta'}</div>
                        <div style="font-size:8px;color:#8b949e">da <span style="color:#d4af37">${l.seller_name}</span> ·
                            <span style="color:${condColor}">Cond. ${cond}%</span> ·
                            ${car.mileage ? Math.round(car.mileage/1000)+'k km' : '—'}</div>
                    </div>
                    <div style="text-align:right;margin-left:8px;flex-shrink:0">
                        <div style="font-size:11px;font-weight:700;font-family:monospace;color:${canBuy ? '#f59e0b' : '#6b7280'}">€${l.ask_price.toLocaleString()}</div>
                        <button onclick="buyP2PCar('${l.id}')"
                            ${canBuy ? '' : 'disabled'}
                            style="margin-top:4px;padding:2px 8px;font-size:8px;font-weight:700;cursor:${canBuy?'pointer':'not-allowed'};background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px;${canBuy?'':'opacity:.4'};transition:opacity .15s"
                            onmousedown="if(!this.disabled)this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
                            Compra
                        </button>
                    </div>
                </div>
            </div>`;
        });
    }

    if (myListings.length > 0) {
        html += `<div style="font-size:8px;color:#8b949e;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:4px;margin-bottom:8px;margin-top:12px">I Miei Annunci</div>`;
        myListings.forEach(l => {
            const car = l.car_snapshot || {};
            html += `
            <div style="background:rgba(212,175,55,0.04);border:1px solid rgba(212,175,55,0.2);border-radius:6px;padding:8px 12px;margin-bottom:6px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <div style="font-size:10px;font-weight:700;color:#e6edf3">${car.name || '?'}</div>
                        <div style="font-size:8px;color:#f59e0b;font-family:monospace">€${l.ask_price.toLocaleString()} · In vendita</div>
                    </div>
                    <button onclick="cancelP2PListing('${l.id}')" style="padding:3px 8px;font-size:8px;font-weight:700;cursor:pointer;background:#2d0d0d;border:1px solid #5a1a1a;color:#f85149;border-radius:4px">Ritira</button>
                </div>
            </div>`;
        });
    }

    return html;
};

window.renderP2PSharesSection = function() {
    const uid      = _uid();
    const shares   = window._p2pMarket.shares || [];
    const myHoldings = window._p2pMarket.myShareHoldings || [];

    if (!uid) return '';

    let html = `<details style="margin-bottom:12px" open>
        <summary class="finance-section-title" style="cursor:pointer">🌐 Borsa Valori P2P — Aziende Reali</summary>
        <div style="margin-top:8px">`;

    if (shares.length === 0) {
        html += `<div style="font-size:9px;color:#6b7280;font-style:italic">Nessuna azienda quotata. Sii il primo!</div>`;
    } else {
        shares.forEach(s => {
            const isMe = s.issuer_user_id === uid;
            const myH  = myHoldings.find(h => h.listing_id === s.id);
            const pct  = ((s.current_price / s.ipo_price) - 1) * 100;
            const isUp = pct >= 0;
            html += `
            <div class="finance-stock-card" style="margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <div>
                        <div style="font-size:10px;font-weight:700;color:#e6edf3">${s.company_name}${isMe ? ' <span style="font-size:7px;color:#d4af37">TUA</span>' : ''}</div>
                        <div style="font-size:8px;color:${isUp?'#3fb950':'#f85149'}">${isUp ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% da IPO</div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-size:13px;font-weight:700;font-family:monospace;color:#e6edf3">€${s.current_price.toLocaleString()}</div>
                        <div style="font-size:8px;color:#8b949e">${s.shares_available} disp. / ${s.shares_total} tot.</div>
                    </div>
                </div>
                ${myH && myH.shares_owned > 0 ? `
                <div style="font-size:9px;color:#f59e0b;margin-bottom:4px">
                    In portafoglio: <b>${myH.shares_owned}</b> az. (€${(myH.shares_owned * s.current_price).toLocaleString()})
                </div>` : ''}
                ${!isMe ? `
                <div style="display:flex;gap:4px">
                    ${s.shares_available > 0 ? `
                    <button onclick="buyCompanyShares('${s.id}', 10)" style="flex:1;padding:5px;font-size:8px;font-weight:700;cursor:pointer;background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px">Compra 10 (€${(s.current_price * 10).toLocaleString()})</button>
                    <button onclick="buyCompanyShares('${s.id}', 50)" style="flex:1;padding:5px;font-size:8px;font-weight:700;cursor:pointer;background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px">Compra 50</button>
                    ` : '<span style="font-size:8px;color:#6b7280;font-style:italic">Esaurito</span>'}
                    ${myH && myH.shares_owned > 0 ? `
                    <button onclick="sellCompanyShares('${s.id}', ${Math.min(10, myH.shares_owned)})"
                        style="flex:1;padding:5px;font-size:8px;font-weight:700;cursor:pointer;background:#2d0d0d;border:1px solid #5a1a1a;color:#f85149;border-radius:4px">Vendi ${Math.min(10, myH.shares_owned)}</button>
                    ` : ''}
                </div>` : '<div style="font-size:8px;color:#8b949e;font-style:italic">La tua azienda</div>'}
            </div>`;
        });
    }

    html += `</div></details>`;
    return html;
};

window.renderP2PHoldingsSection = function() {
    const uid      = _uid();
    const holdings = window._p2pMarket.holdings || [];
    const myH      = window._p2pMarket.myHolding;

    if (!uid) return '';

    let html = `<div style="font-size:8px;color:#d4af37;text-transform:uppercase;letter-spacing:.1em;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:4px;margin-bottom:12px;margin-top:16px">⚔️ Sindacati P2P Reali</div>`;

    if (myH) {
        const myRole = myH.holding_members?.find(m => m.user_id === uid)?.role || 'member';
        html += `
        <div style="background:rgba(212,175,55,0.04);border:1px solid rgba(212,175,55,0.25);border-radius:6px;padding:14px;margin-bottom:12px">
            <div style="font-size:10px;font-weight:700;color:#d4af37;margin-bottom:4px">🏢 ${myH.name}</div>
            <div style="font-size:8px;color:#8b949e;margin-bottom:4px">${myH.description || 'Nessuna descrizione'}</div>
            <div style="font-size:8px;color:#8b949e">Cassa: <span style="color:#f59e0b;font-family:monospace">€${(myH.treasury || 0).toLocaleString()}</span> · Ruolo: <span style="color:#e6edf3;text-transform:capitalize">${myRole}</span></div>
            <div style="font-size:8px;color:#8b949e;margin-top:4px">Membri (${myH.holding_members?.length || 0}/${myH.max_members}):</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
                ${(myH.holding_members || []).map(m => `
                <span style="font-size:7px;padding:2px 6px;border-radius:4px;border:1px solid ${m.role==='leader'?'rgba(212,175,55,0.3)':'rgba(255,255,255,0.1)'};color:${m.role==='leader'?'#d4af37':'#8b949e'}">
                    ${m.company_name} ${m.role === 'leader' ? '👑' : ''}
                </span>`).join('')}
            </div>
            <div style="display:flex;gap:8px;margin-top:8px">
                <input id="hld-contrib-amt" type="number" min="1000" step="1000" placeholder="Contributo €"
                    style="flex:1;background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:5px 8px;font-size:9px;color:#e6edf3;outline:none">
                <button onclick="contributeHoldingTreasury('${myH.id}', parseInt(document.getElementById('hld-contrib-amt').value)||0)"
                    style="padding:5px 10px;font-size:8px;font-weight:700;cursor:pointer;background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px">Contribuisci</button>
                <button onclick="leaveHolding('${myH.id}')"
                    style="padding:5px 10px;font-size:8px;font-weight:700;cursor:pointer;background:#2d0d0d;border:1px solid #5a1a1a;color:#f85149;border-radius:4px">
                    ${myRole === 'leader' ? 'Sciogli' : 'Esci'}
                </button>
            </div>
        </div>`;
    } else {
        html += `
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:14px;margin-bottom:12px">
            <div style="font-size:9px;font-weight:700;color:#e6edf3;margin-bottom:8px">Crea il tuo Sindacato</div>
            <input id="hld-name" placeholder="Nome sindacato..." style="width:100%;background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:6px 8px;font-size:9px;color:#e6edf3;outline:none;margin-bottom:6px;box-sizing:border-box">
            <input id="hld-desc" placeholder="Descrizione (opzionale)" style="width:100%;background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:6px 8px;font-size:9px;color:#e6edf3;outline:none;margin-bottom:8px;box-sizing:border-box">
            <button onclick="createHolding(document.getElementById('hld-name').value, document.getElementById('hld-desc').value)"
                style="width:100%;padding:7px;font-size:8px;font-weight:700;cursor:pointer;background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px">⚔️ Fonda il Sindacato</button>
        </div>`;

        if (holdings.length > 0) {
            html += `<div style="font-size:8px;color:#8b949e;text-transform:uppercase;margin-bottom:8px">Sindacati disponibili</div>`;
            holdings.slice(0, 10).forEach(h => {
                const cnt  = h.holding_members?.length || 0;
                const full = cnt >= h.max_members;
                html += `
                <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:8px 12px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <div style="font-size:10px;font-weight:700;color:#e6edf3">${h.name}</div>
                        <div style="font-size:8px;color:#8b949e">${cnt}/${h.max_members} membri · Cassa €${(h.treasury||0).toLocaleString()}</div>
                    </div>
                    <button onclick="joinHolding('${h.id}')" ${full ? 'disabled' : ''}
                        style="padding:5px 10px;font-size:8px;font-weight:700;cursor:${full?'not-allowed':'pointer'};background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px;${full?'opacity:.4':''}">
                        ${full ? 'Pieno' : 'Unisciti'}
                    </button>
                </div>`;
            });
        }
    }

    return html;
};

window.renderBarometroWidget = function() {
    const ss = window._sindacatoState || {};
    const t  = ss.tension || 0;

    const barColor = t >= 90 ? '#f85149' : t >= 70 ? '#f97316' : t >= 40 ? '#f59e0b' : '#3fb950';
    const bgColor  = t >= 90 ? 'rgba(248,81,73,0.06)' : t >= 70 ? 'rgba(249,115,22,0.06)' : 'rgba(0,0,0,0)';
    const label    = t >= 90 ? 'CRITICA' : t >= 70 ? 'Alta' : t >= 40 ? 'Moderata' : 'Bassa';

    let html = `
    <div style="background:${bgColor};border:1px solid ${barColor}33;border-radius:6px;padding:14px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div style="font-size:10px;font-weight:700;color:${barColor}">🌡️ Barometro della Collera</div>
            <div style="font-size:9px;font-family:monospace;font-weight:700;color:${barColor}">${Math.round(t)}% — ${label}</div>
        </div>
        <div style="height:8px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;margin-bottom:4px">
            <div style="height:100%;width:${Math.round(t)}%;background:${barColor};border-radius:4px;transition:width .5s"></div>
        </div>
        <div style="font-size:8px;color:#8b949e">Contribuisci alla cassa del tuo Sindacato per abbassare la tensione · €10.000 = −1 punto</div>`;

    if (ss.strikeActive) {
        const endsAt    = ss.strikeEndsAt ? new Date(ss.strikeEndsAt) : null;
        const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 3600000)) : '?';
        html += `
        <div style="margin-top:8px;padding:8px;border-radius:4px;background:rgba(248,81,73,0.1);border:1px solid rgba(248,81,73,0.35)">
            <div style="font-size:10px;font-weight:700;color:#f85149">🚨 SCIOPERO NAZIONALE IN CORSO</div>
            <div style="font-size:8px;color:#fca5a5;margin-top:2px">Tutti i redditi NCC −30% · Termina tra ~${remaining}h</div>
            <div style="font-size:8px;color:#8b949e;margin-top:2px">Puoi assumere crumiri nell'Ispettorato per mantenere i redditi</div>
        </div>`;
    }

    html += `</div>`;
    return html;
};

window.renderP2PConsorziSection = function() {
    const uid = _uid();
    if (!uid) return '';

    const consorzi    = window._p2pMarket.consorzi   || [];
    const myC         = window._p2pMarket.myConsorzio;
    const memberCount = myC?.consorzio_members?.length || 0;

    let html = `<div style="font-size:8px;color:#d4af37;text-transform:uppercase;letter-spacing:.1em;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:4px;margin-bottom:12px;margin-top:16px">🤝 Consorzi — Gilde Cooperative</div>`;

    const fuelBonus   = memberCount >= 3;
    const incomeBonus = memberCount >= 5;
    html += `
    <div style="display:flex;gap:8px;margin-bottom:12px">
        <div style="flex:1;background:#161b22;border:1px solid #21262d;border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:8px;color:${fuelBonus?'#3fb950':'#6b7280'}">⛽ −5% carburante</div>
            <div style="font-size:7px;color:#8b949e">${fuelBonus ? '✅ Attivo' : '≥3 membri'}</div>
        </div>
        <div style="flex:1;background:#161b22;border:1px solid #21262d;border-radius:6px;padding:6px;text-align:center">
            <div style="font-size:8px;color:${incomeBonus?'#3fb950':'#6b7280'}">💰 +8% redditi</div>
            <div style="font-size:7px;color:#8b949e">${incomeBonus ? '✅ Attivo' : '≥5 membri'}</div>
        </div>
    </div>`;

    if (myC) {
        const myRole = myC.consorzio_members?.find(m => m.user_id === uid)?.role || 'member';
        html += `
        <div style="background:rgba(212,175,55,0.04);border:1px solid rgba(212,175,55,0.25);border-radius:6px;padding:14px;margin-bottom:12px">
            <div style="font-size:10px;font-weight:700;color:#d4af37;margin-bottom:4px">🤝 ${myC.name}</div>
            <div style="font-size:8px;color:#8b949e;margin-bottom:4px">${myC.description || ''}</div>
            <div style="font-size:8px;color:#8b949e">Cassa: <span style="color:#f59e0b;font-family:monospace">€${(myC.treasury || 0).toLocaleString()}</span> · Ruolo: <span style="color:#e6edf3;text-transform:capitalize">${myRole}</span></div>
            <div style="font-size:8px;color:#8b949e;margin-top:4px">Membri (${memberCount}/${myC.max_members}):</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
                ${(myC.consorzio_members || []).map(m => `
                <span style="font-size:7px;padding:2px 6px;border-radius:4px;border:1px solid ${m.role==='leader'?'rgba(212,175,55,0.3)':'rgba(255,255,255,0.1)'};color:${m.role==='leader'?'#d4af37':'#8b949e'}">
                    ${m.company_name} ${m.role === 'leader' ? '👑' : ''}
                </span>`).join('')}
            </div>
            <div style="display:flex;gap:8px;margin-top:8px">
                <input id="cso-contrib-amt" type="number" min="5000" step="5000" placeholder="Contributo €"
                    style="flex:1;background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:5px 8px;font-size:9px;color:#e6edf3;outline:none">
                <button onclick="contributeConsorzio('${myC.id}', parseInt(document.getElementById('cso-contrib-amt').value)||0)"
                    style="padding:5px 10px;font-size:8px;font-weight:700;cursor:pointer;background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px">Versa</button>
                <button onclick="leaveConsorzio('${myC.id}')"
                    style="padding:5px 10px;font-size:8px;font-weight:700;cursor:pointer;background:#2d0d0d;border:1px solid #5a1a1a;color:#f85149;border-radius:4px">
                    ${myRole === 'leader' ? 'Sciogli' : 'Esci'}
                </button>
            </div>
        </div>`;
    } else {
        html += `
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:14px;margin-bottom:12px">
            <div style="font-size:9px;font-weight:700;color:#e6edf3;margin-bottom:8px">Fonda il tuo Consorzio</div>
            <input id="cso-name" placeholder="Nome consorzio..." style="width:100%;background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:6px 8px;font-size:9px;color:#e6edf3;outline:none;margin-bottom:6px;box-sizing:border-box">
            <input id="cso-desc" placeholder="Descrizione (opzionale)" style="width:100%;background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:6px 8px;font-size:9px;color:#e6edf3;outline:none;margin-bottom:8px;box-sizing:border-box">
            <button onclick="createConsorzio(document.getElementById('cso-name').value, document.getElementById('cso-desc').value)"
                style="width:100%;padding:7px;font-size:8px;font-weight:700;cursor:pointer;background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px">🤝 Fonda il Consorzio</button>
        </div>`;

        if (consorzi.length > 0) {
            html += `<div style="font-size:8px;color:#8b949e;text-transform:uppercase;margin-bottom:8px">Consorzi disponibili</div>`;
            consorzi.slice(0, 8).forEach(c => {
                const cnt  = c.consorzio_members?.length || 0;
                const full = cnt >= c.max_members;
                const fb   = cnt >= 3 ? '<span style="color:#3fb950">⛽</span> ' : '';
                const ib   = cnt >= 5 ? '<span style="color:#f59e0b">💰</span> ' : '';
                html += `
                <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:8px 12px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <div style="font-size:10px;font-weight:700;color:#e6edf3">${c.name} ${fb}${ib}</div>
                        <div style="font-size:8px;color:#8b949e">${cnt}/${c.max_members} membri · Cassa €${(c.treasury||0).toLocaleString()}</div>
                    </div>
                    <button onclick="joinConsorzio('${c.id}')" ${full ? 'disabled' : ''}
                        style="padding:5px 10px;font-size:8px;font-weight:700;cursor:${full?'not-allowed':'pointer'};background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px;${full?'opacity:.4':''}">
                        ${full ? 'Pieno' : 'Unisciti'}
                    </button>
                </div>`;
            });
        }
    }

    return html;
};

window.renderIspettoratoSection = function() {
    const uid = _uid();
    if (!uid) return '';

    const ss            = window._sindacatoState || {};
    const risk          = ss.gdfRisk || 0;
    const strikeActive  = ss.strikeActive || false;
    const crumiriActive = ss.crumiriBoostUntil && new Date() < new Date(ss.crumiriBoostUntil);
    const immActive     = ss.carmineImmunityUntil && new Date() < new Date(ss.carmineImmunityUntil);

    const riskColor = risk >= 70 ? '#f85149' : risk >= 40 ? '#f97316' : '#3fb950';
    const riskLabel = risk >= 70 ? 'ALTA — Rischi ispezione' : risk >= 40 ? 'Moderato' : 'Basso';

    let html = `<div style="font-size:8px;color:#d4af37;text-transform:uppercase;letter-spacing:.1em;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:4px;margin-bottom:12px;margin-top:16px">🔍 Ispettorato del Lavoro</div>`;

    html += `
    <div style="background:#161b22;border:1px solid ${riskColor}22;border-radius:6px;padding:14px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div style="font-size:9px;font-weight:700;color:#e6edf3">🚔 Rischio GdF</div>
            <div style="font-size:9px;font-family:monospace;font-weight:700;color:${riskColor}">${risk}% — ${riskLabel}</div>
        </div>
        <div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden;margin-bottom:6px">
            <div style="height:100%;width:${risk}%;background:${riskColor};border-radius:3px;transition:width .5s"></div>
        </div>`;

    if (immActive) {
        const h = Math.max(0, Math.ceil((new Date(ss.carmineImmunityUntil) - Date.now()) / 3600000));
        html += `<div style="font-size:8px;color:#3fb950">🛡️ Immunità attiva — ancora ~${h}h (Don Carmine)</div>`;
    } else if (crumiriActive) {
        const h = Math.max(0, Math.ceil((new Date(ss.crumiriBoostUntil) - Date.now()) / 3600000));
        html += `<div style="font-size:8px;color:#f59e0b">👷 Crumiri attivi (+50% redditi) — ancora ~${h}h</div>`;
    }

    html += `</div>`;

    if (risk > 20 || immActive) {
        const canAfford = (gameState.cash || 0) >= 50000;
        html += `
        <div style="background:rgba(212,175,55,0.04);border:1px solid rgba(212,175,55,0.25);border-radius:6px;padding:14px;margin-bottom:12px">
            <div style="font-size:10px;font-weight:700;color:#d4af37;margin-bottom:4px">🤵 Don Carmine</div>
            <div style="font-size:8px;color:#d1d5db;margin-bottom:8px;font-style:italic">"Ho parlato con i giusti uffici. Il tuo dossier può sparire."</div>
            <div style="font-size:8px;color:#8b949e;margin-bottom:8px">Azzera il rischio GdF · Immunità 24 ore · Costo: <span style="color:#f59e0b;font-family:monospace">€50.000</span></div>
            <button onclick="payDonCarmine()"
                ${canAfford && !immActive ? '' : 'disabled'}
                style="width:100%;padding:7px;font-size:8px;font-weight:700;cursor:${canAfford&&!immActive?'pointer':'not-allowed'};background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px;${!canAfford||immActive?'opacity:.4':''}">
                ${immActive ? '🛡️ Immunità già attiva' : canAfford ? '🤵 Chiama Don Carmine (€50.000)' : '💸 Fondi insufficienti'}
            </button>
        </div>`;
    }

    if (strikeActive) {
        html += `
        <div style="background:rgba(249,115,22,0.04);border:1px solid rgba(249,115,22,0.25);border-radius:6px;padding:14px;margin-bottom:12px">
            <div style="font-size:10px;font-weight:700;color:#f97316;margin-bottom:4px">👷 Crumiri</div>
            <div style="font-size:8px;color:#d1d5db;margin-bottom:4px">Lavoratori non sindacalizzati disposti a operare durante lo sciopero.</div>
            <div style="display:flex;gap:12px;margin-bottom:8px">
                <div style="font-size:8px;color:#3fb950">✅ +50% redditi per 48h</div>
                <div style="font-size:8px;color:#f85149">⚠️ +25 Rischio GdF</div>
            </div>
            <button onclick="hireCrumiri()"
                ${crumiriActive ? 'disabled' : ''}
                style="width:100%;padding:7px;font-size:8px;font-weight:700;cursor:${crumiriActive?'not-allowed':'pointer'};background:${crumiriActive?'#161b22':'rgba(127,79,29,0.3)'};border:1px solid ${crumiriActive?'#21262d':'rgba(249,115,22,0.4)'};color:${crumiriActive?'#6b7280':'#fb923c'};border-radius:4px;${crumiriActive?'opacity:.4':''}">
                ${crumiriActive ? '👷 Crumiri già operativi' : '👷 Assumi i Crumiri'}
            </button>
        </div>`;
    }

    return html;
};

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 7: INIT — avvia tutto all'avvio
// ─────────────────────────────────────────────────────────────────────────────

window.p2pInit = async function() {
    if (!_sb() || !_uid()) return;
    await window.p2pRefreshAll();
    window.p2pStartRealtime();

    // Refresh automatico ogni 60s (backup del Realtime)
    setInterval(async () => {
        await p2pFetchMarket();
    }, 60_000);

    // Barometro: tick tensione ogni 5 minuti
    setInterval(async () => {
        await p2pFetchTension();
    }, 5 * 60_000);
};
