'use strict';
/* ============================================================
   p2p_market.js — Chauffeur Empire · P2P Marketplace + Realtime
   Dipende da: supabase-config.js, engine.js (gameState, saveGame)
   Carica DOPO dispatcher.js nel tag <script> di index.html
   ============================================================ */

// ── STATO LOCALE CACHE ─────────────────────────────────────────────────────────
window._p2pMarket = {
    listings:      [],   // market_listings (refresh ogni 30s + Realtime)
    shares:        [],   // company_shares (borsa)
    myShareHoldings: [], // share_holdings dove owner = me
    holdings:      [],   // holdings (sindacati)
    myHolding:     null, // la mia holding corrente
    _subs:         [],   // subscriptions Realtime attive
    _lastFetch:    0,
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: riferimento sicuro al client Supabase
// ─────────────────────────────────────────────────────────────────────────────
function _sb() { return window.supabaseClient; }
function _uid() { return window.currentUser?.id || null; }

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 1: MERCATO P2P — LISTING / BUY / CANCEL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metti un'auto in vendita sul mercato P2P reale.
 * Rimpiazza la vecchia funzione locale window.listCarForSale.
 */
window.listCarForSale = async function(carId, askPrice) {
    if (!_uid()) { showNotification('Devi essere loggato per vendere.', 'error'); return; }

    const car = gameState.fleet.find(c => c.id === carId);
    if (!car) return;
    if (car.isLimitedEdition) { showNotification('Le edizioni limitate non si vendono.', 'error'); return; }
    if (car.isLease)          { showNotification('Le auto in leasing non si vendono.', 'error'); return; }

    const driver = gameState.drivers.find(d => d.assignedCarId === carId && d.id !== 'ceo');
    if (driver?.status === 'busy') { showNotification('Autista in servizio — attendi.', 'error'); return; }

    // Rimuovi l'auto dalla flotta locale PRIMA di chiamare Supabase
    if (driver) driver.assignedCarId = null;
    gameState.fleet = gameState.fleet.filter(c => c.id !== carId);
    await saveGame();   // salva lo stato senza l'auto

    // Pubblica su Supabase
    const { data, error } = await _sb().rpc('rpc_list_car_for_sale', {
        v_car_snapshot: car,
        v_ask_price:    Math.round(askPrice),
    });

    if (error) {
        // Rollback: restituisci l'auto
        gameState.fleet.push(car);
        if (driver) driver.assignedCarId = carId;
        await saveGame();
        if (typeof updateUI === 'function') updateUI();
        if (typeof renderTabFleet === 'function') renderTabFleet();
        showNotification(`Errore pubblicazione: ${error.message}`, 'error');
        return;
    }

    logToMap(`🏪 ${car.name} pubblicata sul mercato reale a €${Math.round(askPrice).toLocaleString()}`);
    showNotification(`${car.name} in vendita! (mercato P2P)`, 'success');
    await p2pFetchMarket();
    if (typeof renderTabMarket === 'function') renderTabMarket();
    if (typeof renderTabFleet  === 'function') renderTabFleet();
};

/**
 * Ritira la propria inserzione dal mercato.
 */
window.cancelP2PListing = async function(listingId) {
    if (!_uid()) return;

    const { data, error } = await _sb().rpc('rpc_cancel_listing', {
        v_listing_id: listingId,
    });

    if (error) { showNotification(`Errore ritiro: ${error.message}`, 'error'); return; }

    // L'RPC restituisce lo snapshot auto: reinseriscilo in flotta
    const carSnapshot = data;
    if (carSnapshot) {
        gameState.fleet.push(carSnapshot);
        await saveGame();
    }

    showNotification('Inserzione ritirata — auto restituita alla flotta.', 'success');
    await p2pFetchMarket();
    if (typeof renderTabMarket === 'function') renderTabMarket();
    if (typeof renderTabFleet  === 'function') renderTabFleet();
};

/**
 * Compra un'auto dal mercato P2P di un altro player.
 */
window.buyP2PCar = async function(listingId) {
    if (!_uid()) { showNotification('Devi essere loggato per comprare.', 'error'); return; }

    const listing = window._p2pMarket.listings.find(l => l.id === listingId);
    if (!listing) { showNotification('Inserzione non trovata — potrebbe essere già venduta.', 'error'); return; }
    if (listing.seller_user_id === _uid()) { showNotification('Non puoi comprare la tua stessa auto.', 'info'); return; }
    if ((gameState.cash || 0) < listing.ask_price) {
        showNotification(`Fondi insufficienti — servono €${listing.ask_price.toLocaleString()}`, 'error'); return;
    }

    const { data, error } = await _sb().rpc('rpc_buy_market_car', {
        v_listing_id: listingId,
    });

    if (error || !data) { showNotification(`Acquisto fallito: ${error?.message || 'risposta vuota'}`, 'error'); return; }

    // Aggiorna gameState locale con cash aggiornato e nuova auto
    // ServerState (Realtime) aggiorna gameState.cash dal server; evitiamo doppia deduzione
    if (!window.ServerState?.isReady()) gameState.cash -= data.price_paid;
    const newCar = data.car;
    newCar.id = 'c_p2p_' + Date.now(); // nuovo ID locale per evitare conflitti
    gameState.fleet.push(newCar);
    await saveGame();

    logToMap(`🚗 Comprata ${newCar.name} da ${data.seller_name} — €${data.price_paid.toLocaleString()} (fee 5%: €${data.fee.toLocaleString()})`);
    showNotification(`✅ ${newCar.name} acquistata! (da ${data.seller_name})`, 'success');
    updateUI();
    await p2pFetchMarket();
    if (typeof renderTabMarket === 'function') renderTabMarket();
};

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 2: HOLDINGS / SINDACATI
// ─────────────────────────────────────────────────────────────────────────────

window.createHolding = async function(name, description) {
    if (!_uid()) return;
    const { data, error } = await _sb().rpc('rpc_create_holding', {
        v_name: name, v_description: description || '',
    });
    if (error) { showNotification(`Errore creazione: ${error.message}`, 'error'); return; }
    showNotification(`🏢 Holding "${data.name}" creata!`, 'success');
    await p2pFetchHoldings();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

window.joinHolding = async function(holdingId) {
    if (!_uid()) return;
    const { data, error } = await _sb().rpc('rpc_join_holding', { v_holding_id: holdingId });
    if (error) { showNotification(`Errore ingresso: ${error.message}`, 'error'); return; }
    showNotification('✅ Sei entrato nella holding!', 'success');
    await p2pFetchHoldings();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

window.leaveHolding = async function(holdingId) {
    if (!_uid()) return;
    const { data, error } = await _sb().rpc('rpc_leave_holding', { v_holding_id: holdingId });
    if (error) { showNotification(`Errore uscita: ${error.message}`, 'error'); return; }
    showNotification('Hai lasciato la holding.', 'info');
    await p2pFetchHoldings();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

window.contributeHoldingTreasury = async function(holdingId, amount) {
    if (!_uid()) return;
    const { data, error } = await _sb().rpc('rpc_contribute_holding_treasury', {
        v_holding_id: holdingId, v_amount: Math.round(amount),
    });
    if (error) { showNotification(`Errore contributo: ${error.message}`, 'error'); return; }
    if (!window.ServerState?.isReady()) gameState.cash -= Math.round(amount);
    await saveGame();
    showNotification(`💰 Contribuito €${Math.round(amount).toLocaleString()} alla cassa holding.`, 'success');
    updateUI();
    await p2pFetchHoldings();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 3: BORSA VALORI P2P
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quota la propria azienda in borsa (rimpiazza la versione NPC).
 */
window.listCompanyIPO = async function() {
    if (!_uid()) { showNotification('Devi essere loggato.', 'error'); return; }
    if ((gameState.reputation || 0) < 3.5) {
        showNotification('Reputazione insufficiente (serve 3.5★)', 'error'); return;
    }
    if ((gameState.cash || 0) < 50000) {
        showNotification('Fondi insufficienti (quota €50.000)', 'error'); return;
    }

    const ipoPrice = Math.max(10, Math.round((gameState.cash || 0) / 1000));

    const { data, error } = await _sb().rpc('rpc_list_company_ipo', {
        v_ipo_price:    ipoPrice,
        v_shares_total: 1000,
    });

    if (error || !data) { showNotification(`IPO fallita: ${error?.message || 'risposta vuota'}`, 'error'); return; }

    // Aggiorna gameState locale
    if (!window.ServerState?.isReady()) gameState.cash -= 50000;
    gameState.companyIPO = {
        listed:      true,
        listedDay:   gameState.day,
        supabaseId:  data.id,
        sharesTotal: data.shares_total,
        sharePrice:  data.ipo_price,
        npcSharesOwned: 0,   // in P2P reale non ci sono NPC
        dividendsPaid: 0,
    };
    await saveGame();
    updateUI();

    logToMap(`📈 ${gameState.companyName} quotata sul mercato REALE! 1.000 azioni a €${ipoPrice.toLocaleString()}`);
    showNotification(`🎉 IPO completata! €${ipoPrice}/azione.`, 'success');
    await p2pFetchShares();
    if (typeof renderTabFinance === 'function') renderTabFinance();
};

window.buyCompanyShares = async function(listingId, qty) {
    if (!_uid()) return;
    const listing = window._p2pMarket.shares.find(s => s.id === listingId);
    if (!listing) return;
    const total = listing.current_price * qty;
    if ((gameState.cash || 0) < total) {
        showNotification(`Fondi insufficienti (servono €${total.toLocaleString()})`, 'error'); return;
    }

    const { data, error } = await _sb().rpc('rpc_buy_company_shares', {
        v_listing_id: listingId, v_qty: qty,
    });
    if (error || !data) { showNotification(`Acquisto azioni fallito: ${error?.message || 'risposta vuota'}`, 'error'); return; }

    if (!window.ServerState?.isReady()) gameState.cash -= total;
    await saveGame();
    showNotification(`✅ Comprate ${qty} azioni di ${data.company} a €${data.price}/az.`, 'success');
    updateUI();
    await p2pFetchShares();
    if (typeof renderTabFinance === 'function') renderTabFinance();
};

window.sellCompanyShares = async function(listingId, qty) {
    if (!_uid()) return;
    const { data, error } = await _sb().rpc('rpc_sell_company_shares', {
        v_listing_id: listingId, v_qty: qty,
    });
    if (error || !data) { showNotification(`Vendita azioni fallita: ${error?.message || 'risposta vuota'}`, 'error'); return; }

    if (!window.ServerState?.isReady()) gameState.cash += data.total;
    await saveGame();
    showNotification(`✅ Vendute ${data.qty_sold} azioni di ${data.company} — +€${data.total.toLocaleString()}`, 'success');
    updateUI();
    await p2pFetchShares();
    if (typeof renderTabFinance === 'function') renderTabFinance();
};

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 4: FETCH DATI DAL SERVER
// ─────────────────────────────────────────────────────────────────────────────

async function p2pFetchMarket() {
    if (!_sb()) return;
    const { data, error } = await _sb()
        .from('market_listings')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('listed_at', { ascending: false })
        .limit(50);

    if (!error && data) {
        window._p2pMarket.listings = data;
        window._p2pMarket._lastFetch = Date.now();
    }
}

async function p2pFetchShares() {
    if (!_sb()) return;
    const uid = _uid();

    const { data: listings, error: e1 } = await _sb()
        .from('company_shares')
        .select('*')
        .order('listed_at', { ascending: false });

    if (!e1 && listings) window._p2pMarket.shares = listings;

    if (uid) {
        const { data: myH, error: e2 } = await _sb()
            .from('share_holdings')
            .select('*, company_shares(company_name, current_price)')
            .eq('owner_user_id', uid);
        if (!e2 && myH) window._p2pMarket.myShareHoldings = myH;
    }
}

async function p2pFetchHoldings() {
    if (!_sb()) return;
    const uid = _uid();

    // Two separate queries to avoid PostgREST embedded-join schema cache issues
    const [hRes, mRes] = await Promise.all([
        _sb().from('holdings').select('*').order('created_at', { ascending: false }),
        _sb().from('holding_members').select('holding_id, user_id, company_name, role'),
    ]);

    if (hRes.error || mRes.error) return;

    const members = mRes.data || [];
    const all = (hRes.data || []).map(h => ({
        ...h,
        holding_members: members.filter(m => m.holding_id === h.id),
    }));

    window._p2pMarket.holdings = all;
    window._p2pMarket.myHolding = uid
        ? (all.find(h => h.holding_members.some(m => m.user_id === uid)) || null)
        : null;
}

/** Refresh completo di tutti i dati P2P */
window.p2pRefreshAll = async function() {
    await Promise.all([
        p2pFetchMarket(),
        p2pFetchShares(),
        p2pFetchHoldings(),
    ]);
};

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 5: REALTIME SUBSCRIPTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attiva le sottoscrizioni Realtime su Supabase.
 * Chiama questa funzione DOPO il login (in auth.js, dopo onAuthStateChange).
 */
window.p2pStartRealtime = function() {
    if (!_sb()) { console.warn('[P2P] Supabase non disponibile'); return; }

    // Annulla sottoscrizioni precedenti
    window._p2pMarket._subs.forEach(s => _sb().removeChannel(s));
    window._p2pMarket._subs = [];

    // ── Mercato P2P: nuovi annunci e rimozioni ───────────────────────────────
    const marketChannel = _sb()
        .channel('public:market_listings')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'market_listings' },
            (payload) => {
                if (payload.eventType === 'INSERT') {
                    window._p2pMarket.listings.unshift(payload.new);
                    if (payload.new.seller_user_id !== _uid()) {
                        const car = payload.new.car_snapshot;
                        logToMap(`🏪 Nuovo annuncio: ${car?.name || 'Auto'} a €${(payload.new.ask_price || 0).toLocaleString()} (${payload.new.seller_name})`);
                    }
                } else if (payload.eventType === 'DELETE') {
                    window._p2pMarket.listings = window._p2pMarket.listings
                        .filter(l => l.id !== payload.old.id);
                }
                if (typeof renderTabMarket === 'function' && document.getElementById('tab-container')) {
                    renderTabMarket();
                }
            }
        )
        .subscribe();

    // ── Borsa Valori: aggiornamenti prezzo azioni ────────────────────────────
    const sharesChannel = _sb()
        .channel('public:company_shares')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'company_shares' },
            async () => {
                await p2pFetchShares();
                if (typeof renderTabFinance === 'function') renderTabFinance();
            }
        )
        .subscribe();

    // ── Holdings: nuove gilde, nuovi membri ─────────────────────────────────
    const holdingChannel = _sb()
        .channel('public:holding_members')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'holding_members' },
            async () => {
                await p2pFetchHoldings();
                if (typeof renderTabInvestments === 'function') renderTabInvestments();
            }
        )
        .subscribe();

    window._p2pMarket._subs = [marketChannel, sharesChannel, holdingChannel];
    console.log('[P2P] Realtime attivo su: market_listings, company_shares, holding_members');
};

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
                    ${myRole === 'leader' ? 'Scioglie' : 'Esci'}
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
// SEZIONE 7: INIT — avvia tutto all'avvio
// ─────────────────────────────────────────────────────────────────────────────

window.p2pInit = async function() {
    if (!_sb() || !_uid()) return;
    await window.p2pRefreshAll();
    window.p2pStartRealtime();
    // Refresh automatico ogni 60s (backup del Realtime)
    setInterval(async () => {
        await p2pFetchMarket();
        if (typeof renderTabMarket === 'function' && document.getElementById('tab-container')) {
            // Aggiorna silenziosamente solo se la tab market è aperta
        }
    }, 60_000);
    console.log('[P2P] Market inizializzato — Realtime attivo.');
};

// p2pInit viene chiamato da auth.js dopo il login
