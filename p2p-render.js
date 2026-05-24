'use strict';
/* ================================================================
   p2p-render.js — Chauffeur Empire
   P2P UI render: renderP2PMarketSection, renderP2PSharesSection,
   renderP2PHoldingsSection, renderP2PSindacatoSection, p2pInit.
   Dipendenze: p2p-market.js (state + actions), engine.js, design-system.js
   ================================================================ */

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 6: RENDER — UI P2P nelle tab esistenti
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Restituisce l'HTML del mercato P2P da iniettare in renderTabMarket().
 * Mostra: auto di ALTRI player in vendita + le mie inserzioni con "Ritira".
 */
window.renderP2PMarketSection = function() {
    const uid     = _uid();
    const listings = window._p2pMarket.listings || [];

    if (!uid) return `<div class="text-[9px] text-gray-500 italic mb-3">Accedi per vedere il mercato P2P reale.</div>`;

    const myListings = listings.filter(l => l.seller_user_id === uid);
    const otherListings = listings.filter(l => l.seller_user_id !== uid);

    let html = `<div class="uppercase tracking-widest text-[8px] text-gold border-b border-white/10 pb-1 mb-2 mt-4">🌐 Mercato P2P Reale (${otherListings.length} annunci)</div>`;

    if (otherListings.length === 0) {
        html += `<div class="text-[9px] text-gray-600 italic mb-3">Nessun annuncio al momento. Sii il primo!</div>`;
    } else {
        otherListings.slice(0, 20).forEach(l => {
            const car   = l.car_snapshot || {};
            const cond  = car.condition ?? 100;
            const condColor = cond > 70 ? '#22c55e' : cond > 40 ? '#f59e0b' : '#ef4444';
            const canBuy = (gameState.cash || 0) >= l.ask_price;
            html += `
            <div class="hud-card mb-2 !py-2">
                <div class="flex justify-between items-center">
                    <div class="min-w-0 flex-1">
                        <div class="text-[10px] font-bold text-white truncate">${car.name || 'Auto sconosciuta'}</div>
                        <div class="text-[8px] text-gray-400">da <span class="text-gold">${l.seller_name}</span> ·
                            <span style="color:${condColor}">Cond. ${cond}%</span> ·
                            ${car.mileage ? Math.round(car.mileage/1000)+'k km' : '—'}</div>
                    </div>
                    <div class="text-right ml-2 shrink-0">
                        <div class="text-[11px] font-bold font-mono ${canBuy ? 'text-yellow-300' : 'text-gray-600'}">€${l.ask_price.toLocaleString()}</div>
                        <button onclick="buyP2PCar('${l.id}')"
                            ${canBuy ? '' : 'disabled'}
                            class="btn-gold !text-[8px] !py-0.5 !px-2 mt-1 ${canBuy ? '' : 'opacity-40 cursor-not-allowed'}">
                            Compra
                        </button>
                    </div>
                </div>
            </div>`;
        });
    }

    if (myListings.length > 0) {
        html += `<div class="uppercase tracking-widest text-[8px] text-gray-500 border-b border-white/10 pb-1 mb-2 mt-3">I Miei Annunci</div>`;
        myListings.forEach(l => {
            const car = l.car_snapshot || {};
            html += `
            <div class="hud-card mb-2 !py-2 !border-yellow-900/40">
                <div class="flex justify-between items-center">
                    <div>
                        <div class="text-[10px] font-bold text-white">${car.name || '?'}</div>
                        <div class="text-[8px] text-yellow-400 font-mono">€${l.ask_price.toLocaleString()} · In vendita</div>
                    </div>
                    <button onclick="cancelP2PListing('${l.id}')" class="btn-gold !bg-red-900/30 !text-red-300 !text-[8px]">Ritira</button>
                </div>
            </div>`;
        });
    }

    return html;
};

/**
 * Restituisce l'HTML della borsa P2P da iniettare in renderTabFinance().
 */
window.renderP2PSharesSection = function() {
    const uid     = _uid();
    const shares  = window._p2pMarket.shares || [];
    const myHoldings = window._p2pMarket.myShareHoldings || [];

    if (!uid) return '';

    let html = `<details class="mb-3" open>
        <summary class="finance-section-title cursor-pointer">🌐 Borsa Valori P2P — Aziende Reali</summary>
        <div class="mt-2">`;

    if (shares.length === 0) {
        html += `<div class="text-[9px] text-gray-600 italic">Nessuna azienda quotata. Sii il primo!</div>`;
    } else {
        shares.forEach(s => {
            const isMe = s.issuer_user_id === uid;
            const myH = myHoldings.find(h => h.listing_id === s.id);
            const pct = ((s.current_price / s.ipo_price) - 1) * 100;
            const isUp = pct >= 0;
            html += `
            <div class="finance-stock-card mb-2">
                <div class="flex justify-between items-center mb-1">
                    <div>
                        <div class="text-[10px] font-bold text-white">${s.company_name}${isMe ? ' <span class="text-[7px] text-gold">TUA</span>' : ''}</div>
                        <div class="text-[8px] ${isUp ? 'text-green-400' : 'text-red-400'}">${isUp ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% da IPO</div>
                    </div>
                    <div class="text-right">
                        <div class="text-sm font-bold font-mono text-white">€${s.current_price.toLocaleString()}</div>
                        <div class="text-[8px] text-gray-500">${s.shares_available} disp. / ${s.shares_total} tot.</div>
                    </div>
                </div>
                ${myH && myH.shares_owned > 0 ? `
                <div class="text-[9px] text-yellow-400 mb-1">
                    In portafoglio: <b>${myH.shares_owned}</b> az. (€${(myH.shares_owned * s.current_price).toLocaleString()})
                </div>` : ''}
                ${!isMe ? `
                <div class="flex gap-1">
                    ${s.shares_available > 0 ? `
                    <button onclick="buyCompanyShares('${s.id}', 10)" class="btn-gold !text-[8px] !py-1 flex-1">Compra 10 (€${(s.current_price * 10).toLocaleString()})</button>
                    <button onclick="buyCompanyShares('${s.id}', 50)" class="btn-gold !text-[8px] !py-1 flex-1">Compra 50</button>
                    ` : '<span class="text-[8px] text-gray-600 italic">Esaurito</span>'}
                    ${myH && myH.shares_owned > 0 ? `
                    <button onclick="sellCompanyShares('${s.id}', ${Math.min(10, myH.shares_owned)})"
                        class="btn-gold !bg-red-900/30 !text-red-300 !text-[8px] !py-1 flex-1">Vendi ${Math.min(10, myH.shares_owned)}</button>
                    ` : ''}
                </div>` : '<div class="text-[8px] text-gray-500 italic">La tua azienda</div>'}
            </div>`;
        });
    }

    html += `</div></details>`;
    return html;
};

/**
 * Restituisce l'HTML delle Holdings P2P da iniettare in renderTabInvestments().
 */
window.renderP2PHoldingsSection = function() {
    const uid      = _uid();
    const holdings = window._p2pMarket.holdings || [];
    const myH      = window._p2pMarket.myHolding;

    if (!uid) return '';

    let html = `<div class="uppercase tracking-widest text-[8px] text-gold border-b border-white/10 pb-1 mb-3 mt-4">⚔️ Sindacati P2P Reali</div>`;

    if (myH) {
        const myRole = myH.holding_members?.find(m => m.user_id === uid)?.role || 'member';
        html += `
        <div class="hud-card !border-gold/30 bg-gold/5 mb-3">
            <div class="text-[10px] font-bold text-gold mb-1">🏢 ${myH.name}</div>
            <div class="text-[8px] text-gray-400 mb-1">${myH.description || 'Nessuna descrizione'}</div>
            <div class="text-[8px] text-gray-400">Cassa: <span class="text-yellow-400 font-mono">€${(myH.treasury || 0).toLocaleString()}</span> · Ruolo: <span class="text-white capitalize">${myRole}</span></div>
            <div class="text-[8px] text-gray-500 mt-1">Membri (${myH.holding_members?.length || 0}/${myH.max_members}):</div>
            <div class="flex flex-wrap gap-1 mt-1">
                ${(myH.holding_members || []).map(m => `
                <span class="text-[7px] px-1.5 py-0.5 rounded border border-white/10 ${m.role === 'leader' ? 'text-gold border-gold/30' : 'text-gray-400'}">
                    ${m.company_name} ${m.role === 'leader' ? '👑' : ''}
                </span>`).join('')}
            </div>
            <div class="flex gap-2 mt-2">
                <input id="hld-contrib-amt" type="number" min="1000" step="1000" placeholder="Contributo €"
                    class="finance-input flex-1 text-[9px]">
                <button onclick="contributeHoldingTreasury('${myH.id}', parseInt(document.getElementById('hld-contrib-amt').value)||0)"
                    class="btn-gold !text-[8px]">Contribuisci</button>
                <button onclick="leaveHolding('${myH.id}')"
                    class="btn-gold !bg-red-900/30 !text-red-300 !text-[8px]">
                    ${myRole === 'leader' ? 'Sciogli' : 'Esci'}
                </button>
            </div>
        </div>`;
    } else {
        // Crea nuova holding
        html += `
        <div class="hud-card mb-3">
            <div class="text-[9px] font-bold text-white mb-2">Crea il tuo Sindacato</div>
            <input id="hld-name" placeholder="Nome sindacato..." class="finance-input w-full text-[9px] mb-2">
            <input id="hld-desc" placeholder="Descrizione (opzionale)" class="finance-input w-full text-[9px] mb-2">
            <button onclick="createHolding(document.getElementById('hld-name').value, document.getElementById('hld-desc').value)"
                class="btn-gold w-full !text-[8px]">⚔️ Fonda il Sindacato</button>
        </div>`;

        // Lista holdings disponibili
        if (holdings.length > 0) {
            html += `<div class="text-[8px] text-gray-500 uppercase mb-2">Sindacati disponibili</div>`;
            holdings.slice(0, 10).forEach(h => {
                const cnt = h.holding_members?.length || 0;
                const full = cnt >= h.max_members;
                html += `
                <div class="hud-card mb-2 !py-2 flex justify-between items-center">
                    <div>
                        <div class="text-[10px] font-bold text-white">${h.name}</div>
                        <div class="text-[8px] text-gray-400">${cnt}/${h.max_members} membri · Cassa €${(h.treasury||0).toLocaleString()}</div>
                    </div>
                    <button onclick="joinHolding('${h.id}')" ${full ? 'disabled' : ''}
                        class="btn-gold !text-[8px] ${full ? 'opacity-40 cursor-not-allowed' : ''}">
                        ${full ? 'Pieno' : 'Unisciti'}
                    </button>
                </div>`;
            });
        }
    }

    return html;
};

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 3b: CONSORZI — azioni
// ─────────────────────────────────────────────────────────────────────────────

window.createConsorzio = async function(name, description) {
    if (!_uid()) return;
    const { data, error } = await _sb().rpc('rpc_create_consorzio', {
        v_name: name, v_description: description || '',
    });
    if (error) { showNotification(_p2pErrMsg('Errore creazione consorzio', error), 'error'); return; }
    showNotification(`🤝 Consorzio "${data.name}" fondato!`, 'success');
    await p2pFetchConsorzi();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

window.joinConsorzio = async function(consorzioId) {
    if (!_uid()) return;
    const { data, error } = await _sb().rpc('rpc_join_consorzio', { v_consorzio_id: consorzioId });
    if (error) { showNotification(_p2pErrMsg('Errore ingresso consorzio', error), 'error'); return; }
    showNotification('✅ Sei entrato nel consorzio!', 'success');
    await p2pFetchConsorzi();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

window.leaveConsorzio = async function(consorzioId) {
    if (!_uid()) return;
    const { error } = await _sb().rpc('rpc_leave_consorzio', { v_consorzio_id: consorzioId });
    if (error) { showNotification(_p2pErrMsg('Errore uscita consorzio', error), 'error'); return; }
    showNotification('Hai lasciato il consorzio.', 'info');
    await p2pFetchConsorzi();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

window.contributeConsorzio = async function(consorzioId, amount) {
    if (!_uid()) return;
    const roundedAmount = Math.round(amount);
    const { data, error } = await _sb().rpc('rpc_contribute_consorzio', {
        v_consorzio_id: consorzioId, v_amount: roundedAmount,
    });
    if (error) { showNotification(_p2pErrMsg('Errore contributo consorzio', error), 'error'); return; }
    if (!window.ServerState?.isReady()) gameState.cash -= roundedAmount;
    await saveGame();
    showNotification(`💰 Contribuito €${roundedAmount.toLocaleString()} alla cassa consorzio.`, 'success');
    updateUI();
    await p2pFetchConsorzi();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 3c: ISPETTORATO — azioni
// ─────────────────────────────────────────────────────────────────────────────

window.hireCrumiri = async function() {
    if (!_uid()) return;
    const { data, error } = await _sb().rpc('rpc_hire_crumiri');
    if (error) { showNotification(_p2pErrMsg('Errore crumiri', error), 'error'); return; }
    window._sindacatoState.gdfRisk           = data.risk_level || 0;
    window._sindacatoState.crumiriBoostUntil = data.crumiri_boost_until || null;
    showBigEvent('👷', 'Crumiri Assunti!',
        `Lavoratori non sindacalizzati operativi per 48 ore.\n+50% redditi su tutte le corse.\n\n⚠️ Rischio GdF ora: ${data.risk_level}%.\nSe supera 70%, rischi un\'ispezione con multa del 10% del cash.`);
    logToMap(`👷 Crumiri assunti — +50% redditi 48h | GdF rischio: ${data.risk_level}%`);
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

window.payDonCarmine = async function() {
    if (!_uid()) return;
    const { data, error } = await _sb().rpc('rpc_pay_don_carmine');
    if (error) { showNotification(_p2pErrMsg('Don Carmine', error), 'error'); return; }
    if (!window.ServerState?.isReady()) gameState.cash -= 50000;
    await saveGame();
    window._sindacatoState.gdfRisk              = 0;
    window._sindacatoState.carmineImmunityUntil = data.immunity_until || null;
    showBigEvent('🤵', 'Don Carmine ha parlato.',
        `Dossier GdF distrutto. Rischio azzerato.\nImmunità garantita per 24 ore.\n\n"Non dimenticare chi ti ha aiutato." — Don Carmine`);
    logToMap('🤵 Don Carmine: dossier eliminato. Immunità 24h.');
    updateUI();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 6b: RENDER — Barometro della Collera
// ─────────────────────────────────────────────────────────────────────────────

window.renderBarometroWidget = function() {
    const ss = window._sindacatoState || {};
    const t  = ss.tension || 0;

    const barColor = t >= 90 ? '#ef4444' : t >= 70 ? '#f97316' : t >= 40 ? '#eab308' : '#22c55e';
    const bgColor  = t >= 90 ? 'rgba(239,68,68,0.08)' : t >= 70 ? 'rgba(249,115,22,0.08)' : 'rgba(0,0,0,0)';
    const label    = t >= 90 ? 'CRITICA' : t >= 70 ? 'Alta' : t >= 40 ? 'Moderata' : 'Bassa';

    let html = `
    <div class="hud-card mb-3" style="border-color:${barColor}40;background:${bgColor}">
        <div class="flex justify-between items-center mb-1">
            <div class="text-[10px] font-bold" style="color:${barColor}">🌡️ Barometro della Collera</div>
            <div class="text-[9px] font-mono font-bold" style="color:${barColor}">${Math.round(t)}% — ${label}</div>
        </div>
        <div class="w-full rounded-full h-2 bg-white/10 mb-1">
            <div class="h-2 rounded-full transition-all duration-500" style="width:${Math.round(t)}%;background:${barColor}"></div>
        </div>
        <div class="text-[8px] text-gray-400">Contribuisci alla cassa del tuo Sindacato per abbassare la tensione · €10.000 = −1 punto</div>`;

    if (ss.strikeActive) {
        const endsAt = ss.strikeEndsAt ? new Date(ss.strikeEndsAt) : null;
        const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 3600000)) : '?';
        html += `
        <div class="mt-2 p-2 rounded" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4)">
            <div class="text-[10px] font-bold text-red-400">🚨 SCIOPERO NAZIONALE IN CORSO</div>
            <div class="text-[8px] text-red-300 mt-0.5">Tutti i redditi NCC −30% · Termina tra ~${remaining}h</div>
            <div class="text-[8px] text-gray-400 mt-0.5">Puoi assumere crumiri nell'Ispettorato per mantenere i redditi</div>
        </div>`;
    }

    html += `</div>`;
    return html;
};

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 6c: RENDER — Consorzi
// ─────────────────────────────────────────────────────────────────────────────

window.renderP2PConsorziSection = function() {
    const uid = _uid();
    if (!uid) return '';

    const consorzi   = window._p2pMarket.consorzi   || [];
    const myC        = window._p2pMarket.myConsorzio;
    const memberCount = myC?.consorzio_members?.length || 0;

    let html = `<div class="uppercase tracking-widest text-[8px] text-gold border-b border-white/10 pb-1 mb-3 mt-4">🤝 Consorzi — Gilde Cooperative</div>`;

    // Benefici attivi
    const fuelBonus    = memberCount >= 3;
    const incomeBonus  = memberCount >= 5;
    html += `
    <div class="flex gap-2 mb-3">
        <div class="flex-1 hud-card !py-1.5 text-center">
            <div class="text-[8px] ${fuelBonus ? 'text-green-400' : 'text-gray-600'}">⛽ ${fuelBonus ? '−5% carburante' : '−5% carburante'}</div>
            <div class="text-[7px] text-gray-500">${fuelBonus ? '✅ Attivo' : '≥3 membri'}</div>
        </div>
        <div class="flex-1 hud-card !py-1.5 text-center">
            <div class="text-[8px] ${incomeBonus ? 'text-green-400' : 'text-gray-600'}">💰 ${incomeBonus ? '+8% redditi' : '+8% redditi'}</div>
            <div class="text-[7px] text-gray-500">${incomeBonus ? '✅ Attivo' : '≥5 membri'}</div>
        </div>
    </div>`;

    if (myC) {
        const myRole = myC.consorzio_members?.find(m => m.user_id === uid)?.role || 'member';
        html += `
        <div class="hud-card !border-gold/30 bg-gold/5 mb-3">
            <div class="text-[10px] font-bold text-gold mb-1">🤝 ${myC.name}</div>
            <div class="text-[8px] text-gray-400 mb-1">${myC.description || ''}</div>
            <div class="text-[8px] text-gray-400">Cassa: <span class="text-yellow-400 font-mono">€${(myC.treasury || 0).toLocaleString()}</span> · Ruolo: <span class="text-white capitalize">${myRole}</span></div>
            <div class="text-[8px] text-gray-500 mt-1">Membri (${memberCount}/${myC.max_members}):</div>
            <div class="flex flex-wrap gap-1 mt-1">
                ${(myC.consorzio_members || []).map(m => `
                <span class="text-[7px] px-1.5 py-0.5 rounded border border-white/10 ${m.role === 'leader' ? 'text-gold border-gold/30' : 'text-gray-400'}">
                    ${m.company_name} ${m.role === 'leader' ? '👑' : ''}
                </span>`).join('')}
            </div>
            <div class="flex gap-2 mt-2">
                <input id="cso-contrib-amt" type="number" min="5000" step="5000" placeholder="Contributo €"
                    class="finance-input flex-1 text-[9px]">
                <button onclick="contributeConsorzio('${myC.id}', parseInt(document.getElementById('cso-contrib-amt').value)||0)"
                    class="btn-gold !text-[8px]">Versa</button>
                <button onclick="leaveConsorzio('${myC.id}')"
                    class="btn-gold !bg-red-900/30 !text-red-300 !text-[8px]">
                    ${myRole === 'leader' ? 'Sciogli' : 'Esci'}
                </button>
            </div>
        </div>`;
    } else {
        html += `
        <div class="hud-card mb-3">
            <div class="text-[9px] font-bold text-white mb-2">Fonda il tuo Consorzio</div>
            <input id="cso-name" placeholder="Nome consorzio..." class="finance-input w-full text-[9px] mb-2">
            <input id="cso-desc" placeholder="Descrizione (opzionale)" class="finance-input w-full text-[9px] mb-2">
            <button onclick="createConsorzio(document.getElementById('cso-name').value, document.getElementById('cso-desc').value)"
                class="btn-gold w-full !text-[8px]">🤝 Fonda il Consorzio</button>
        </div>`;

        if (consorzi.length > 0) {
            html += `<div class="text-[8px] text-gray-500 uppercase mb-2">Consorzi disponibili</div>`;
            consorzi.slice(0, 8).forEach(c => {
                const cnt  = c.consorzio_members?.length || 0;
                const full = cnt >= c.max_members;
                const fb   = cnt >= 3 ? '<span class="text-green-400">⛽</span> ' : '';
                const ib   = cnt >= 5 ? '<span class="text-yellow-400">💰</span> ' : '';
                html += `
                <div class="hud-card mb-2 !py-2 flex justify-between items-center">
                    <div>
                        <div class="text-[10px] font-bold text-white">${c.name} ${fb}${ib}</div>
                        <div class="text-[8px] text-gray-400">${cnt}/${c.max_members} membri · Cassa €${(c.treasury||0).toLocaleString()}</div>
                    </div>
                    <button onclick="joinConsorzio('${c.id}')" ${full ? 'disabled' : ''}
                        class="btn-gold !text-[8px] ${full ? 'opacity-40 cursor-not-allowed' : ''}">
                        ${full ? 'Pieno' : 'Unisciti'}
                    </button>
                </div>`;
            });
        }
    }

    return html;
};

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 6d: RENDER — Ispettorato del Lavoro
// ─────────────────────────────────────────────────────────────────────────────

window.renderIspettoratoSection = function() {
    const uid = _uid();
    if (!uid) return '';

    const ss           = window._sindacatoState || {};
    const risk         = ss.gdfRisk || 0;
    const strikeActive = ss.strikeActive || false;
    const crumiriActive = ss.crumiriBoostUntil && new Date() < new Date(ss.crumiriBoostUntil);
    const immActive     = ss.carmineImmunityUntil && new Date() < new Date(ss.carmineImmunityUntil);

    const riskColor = risk >= 70 ? '#ef4444' : risk >= 40 ? '#f97316' : '#22c55e';
    const riskLabel = risk >= 70 ? 'ALTA — Rischi ispezione' : risk >= 40 ? 'Moderato' : 'Basso';

    let html = `<div class="uppercase tracking-widest text-[8px] text-gold border-b border-white/10 pb-1 mb-3 mt-4">🔍 Ispettorato del Lavoro</div>`;

    // Rischio GdF meter
    html += `
    <div class="hud-card mb-3" style="border-color:${riskColor}30">
        <div class="flex justify-between items-center mb-1">
            <div class="text-[9px] font-bold text-white">🚔 Rischio GdF</div>
            <div class="text-[9px] font-mono font-bold" style="color:${riskColor}">${risk}% — ${riskLabel}</div>
        </div>
        <div class="w-full rounded-full h-1.5 bg-white/10 mb-1.5">
            <div class="h-1.5 rounded-full transition-all duration-500" style="width:${risk}%;background:${riskColor}"></div>
        </div>`;

    if (immActive) {
        const immUntil = new Date(ss.carmineImmunityUntil);
        const h = Math.max(0, Math.ceil((immUntil - Date.now()) / 3600000));
        html += `<div class="text-[8px] text-green-400">🛡️ Immunità attiva — ancora ~${h}h (Don Carmine)</div>`;
    } else if (crumiriActive) {
        const cUntil = new Date(ss.crumiriBoostUntil);
        const h = Math.max(0, Math.ceil((cUntil - Date.now()) / 3600000));
        html += `<div class="text-[8px] text-yellow-400">👷 Crumiri attivi (+50% redditi) — ancora ~${h}h</div>`;
    }

    html += `</div>`;

    // Don Carmine (mostra se rischio > 20 o immunità attiva)
    if (risk > 20 || immActive) {
        const canAfford = (gameState.cash || 0) >= 50000;
        html += `
        <div class="hud-card mb-3" style="border-color:rgba(212,175,55,0.3);background:rgba(212,175,55,0.04)">
            <div class="text-[10px] font-bold text-gold mb-1">🤵 Don Carmine</div>
            <div class="text-[8px] text-gray-300 mb-2 italic">"Ho parlato con i giusti uffici. Il tuo dossier può sparire."</div>
            <div class="text-[8px] text-gray-400 mb-2">Azzera il rischio GdF · Immunità 24 ore · Costo: <span class="text-yellow-400 font-mono">€50.000</span></div>
            <button onclick="payDonCarmine()"
                ${canAfford && !immActive ? '' : 'disabled'}
                class="btn-gold w-full !text-[8px] ${!canAfford || immActive ? 'opacity-40 cursor-not-allowed' : ''}">
                ${immActive ? '🛡️ Immunità già attiva' : canAfford ? '🤵 Chiama Don Carmine (€50.000)' : '💸 Fondi insufficienti'}
            </button>
        </div>`;
    }

    // Crumiri (mostra solo durante sciopero)
    if (strikeActive) {
        html += `
        <div class="hud-card mb-3" style="border-color:rgba(249,115,22,0.3);background:rgba(249,115,22,0.04)">
            <div class="text-[10px] font-bold text-orange-400 mb-1">👷 Crumiri</div>
            <div class="text-[8px] text-gray-300 mb-1">Lavoratori non sindacalizzati disposti a operare durante lo sciopero.</div>
            <div class="flex gap-3 mb-2">
                <div class="text-[8px] text-green-400">✅ +50% redditi per 48h</div>
                <div class="text-[8px] text-red-400">⚠️ +25 Rischio GdF</div>
            </div>
            <button onclick="hireCrumiri()"
                ${crumiriActive ? 'disabled' : ''}
                class="btn-gold w-full !text-[8px] ${crumiriActive ? 'opacity-40 cursor-not-allowed' : '!bg-orange-900/40 !text-orange-300'}">
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
        if (typeof renderTabInvestments === 'function' && document.getElementById('tab-container')) {
            // Aggiorna silenziosamente solo se la tab invest è aperta
        }
    }, 5 * 60_000);

    console.log('[P2P] Market inizializzato — Realtime + Barometro attivi.');
};

// p2pInit viene chiamato da auth.js dopo il login
