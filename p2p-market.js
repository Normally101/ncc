'use strict';
/* ================================================================
   p2p-market.js — Chauffeur Empire
   P2P backend: stato cache, azioni (listCarForSale, buyP2PCar,
   createHolding, joinHolding, listCompanyIPO, buyCompanyShares,
   sellCompanyShares), fetch Supabase, Realtime subscription.
   Dipendenze: engine.js, supabase-config.js
   ================================================================ */

// ── HELPER ERRORI ──────────────────────────────────────────────────────────────
// Delega al sanitizzatore centrale: nessun dettaglio DB (tabelle/colonne/constraint)
// raggiunge la UI; i messaggi di gioco intenzionali (P0001) restano visibili.
function _p2pErrMsg(prefix, err) {
    if (window.CE_Sec && typeof window.CE_Sec.userError === 'function') {
        return window.CE_Sec.userError(prefix, err, { support: true });
    }
    try { console.warn('[P2P]', prefix, err && (err.message || err)); } catch {}
    return `${prefix}, riprova.`;
}

// ── STATO LOCALE CACHE ─────────────────────────────────────────────────────────
window._p2pMarket = {
    listings:      [],   // market_listings (refresh ogni 30s + Realtime)
    shares:        [],   // company_shares (borsa)
    myShareHoldings: [], // share_holdings dove owner = me
    holdings:      [],   // holdings (sindacati)
    myHolding:     null, // la mia holding corrente
    consorzi:      [],   // consorzi cooperativi
    myConsorzio:   null, // il mio consorzio
    _subs:         [],   // subscriptions Realtime attive
    _lastFetch:    0,
};

// ── STATO SINDACATO GLOBALE (cache server-side) ────────────────────────────
window._sindacatoState = {
    tension:               0,
    strikeActive:          false,
    strikeEndsAt:          null,
    gdfRisk:               0,
    crumiriBoostUntil:     null,
    carmineImmunityUntil:  null,
    consorzioId:           null,
    consorzioMembersCount: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: riferimento sicuro al client Supabase
// ─────────────────────────────────────────────────────────────────────────────
function _p2pSb() { return window.supabaseClient; }
function _p2pUid() { return window.currentUser?.id || null; }
window._p2pSb = _p2pSb;
window._p2pUid = _p2pUid;

// ─────────────────────────────────────────────────────────────────────────────
// SEZIONE 1: MERCATO P2P — LISTING / BUY / CANCEL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metti un'auto in vendita sul mercato P2P reale.
 * Rimpiazza la vecchia funzione locale window.listCarForSale.
 */
window.listCarForSale = async function(carId, askPrice) {
    if (!_p2pUid()) { showNotification('Devi essere loggato per vendere.', 'error'); return; }

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
    const { data, error } = await _p2pSb().rpc('rpc_list_car_for_sale', {
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
        showNotification(_p2pErrMsg('Errore pubblicazione', error), 'error');
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
    if (!_p2pUid()) return;

    const { data, error } = await _p2pSb().rpc('rpc_cancel_listing', {
        v_listing_id: listingId,
    });

    if (error) { showNotification(_p2pErrMsg('Errore ritiro', error), 'error'); return; }

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
    if (!_p2pUid()) { showNotification('Devi essere loggato per comprare.', 'error'); return; }

    const listing = window._p2pMarket.listings.find(l => l.id === listingId);
    if (!listing) { showNotification('Inserzione non trovata — potrebbe essere già venduta.', 'error'); return; }
    if (listing.seller_user_id === _p2pUid()) { showNotification('Non puoi comprare la tua stessa auto.', 'info'); return; }
    if ((gameState.cash || 0) < listing.ask_price) {
        showNotification(`Fondi insufficienti — servono €${listing.ask_price.toLocaleString()}`, 'error'); return;
    }

    const { data, error } = await _p2pSb().rpc('rpc_buy_market_car', {
        v_listing_id: listingId,
    });

    if (error || !data) { showNotification(_p2pErrMsg('Acquisto fallito', error || {message: 'risposta vuota'}), 'error'); return; }

    window.CE_money.addebitatoDalServer(data.price_paid, 'buy_p2p_car');
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
    if (!_p2pUid()) return;
    const { data, error } = await _p2pSb().rpc('rpc_create_holding', {
        v_name: name, v_description: description || '',
    });
    if (error) { showNotification(_p2pErrMsg('Errore creazione holding', error), 'error'); return; }
    showNotification(`🏢 Holding "${data.name}" creata!`, 'success');
    await p2pFetchHoldings();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

window.joinHolding = async function(holdingId) {
    if (!_p2pUid()) return;
    const { data, error } = await _p2pSb().rpc('rpc_join_holding', { v_holding_id: holdingId });
    if (error) { showNotification(_p2pErrMsg('Errore ingresso holding', error), 'error'); return; }
    showNotification('✅ Sei entrato nella holding!', 'success');
    await p2pFetchHoldings();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

window.leaveHolding = async function(holdingId) {
    if (!_p2pUid()) return;
    const { data, error } = await _p2pSb().rpc('rpc_leave_holding', { v_holding_id: holdingId });
    if (error) { showNotification(_p2pErrMsg('Errore uscita holding', error), 'error'); return; }
    showNotification('Hai lasciato la holding.', 'info');
    await p2pFetchHoldings();
    if (typeof renderTabInvestments === 'function') renderTabInvestments();
};

window.contributeHoldingTreasury = async function(holdingId, amount) {
    if (!_p2pUid()) return;
    const roundedAmount = Math.round(amount);
    if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) return;
    if ((gameState.cash || 0) < roundedAmount) {
        showNotification(`Fondi insufficienti — servono €${roundedAmount.toLocaleString()}`, 'error');
        return;
    }
    const { data, error } = await _p2pSb().rpc('rpc_contribute_holding_treasury', {
        v_holding_id: holdingId, v_amount: roundedAmount,
    });
    if (error) { showNotification(_p2pErrMsg('Errore contributo holding', error), 'error'); return; }
    window.CE_money.addebitatoDalServer(roundedAmount, 'contribute_holding_treasury');
    await saveGame();

    // rpc_contribute_holding_treasury internalizza il dampening tensione e
    // ritorna sempre { treasury, tension } — verificato sul DB, la migration
    // che l'ha introdotto è già applicata. Rimossa la vecchia chiamata
    // separata a rpc_dampen_tension (REVOKEd da authenticated/anon, quindi
    // sarebbe comunque sempre fallita): era codice morto, mai raggiunto.
    if (data && typeof data === 'object' && data.tension != null) {
        window._sindacatoState.tension = data.tension;
        if (roundedAmount >= 10000) {
            const reduction = Math.floor(roundedAmount / 10000);
            showNotification(`🌡️ Barometro −${reduction} pt (${Math.round(data.tension)}%)`, 'info');
        }
    }

    showNotification(`💰 Contribuito €${roundedAmount.toLocaleString()} alla cassa holding.`, 'success');
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
    if (!_p2pUid()) { showNotification('Devi essere loggato.', 'error'); return; }
    if ((gameState.reputation || 0) < 3.5) {
        showNotification('Reputazione insufficiente (serve 3.5★)', 'error'); return;
    }
    if ((gameState.cash || 0) < 50000) {
        showNotification('Fondi insufficienti (quota €50.000)', 'error'); return;
    }

    const ipoPrice = Math.max(10, Math.round((gameState.cash || 0) / 1000));

    const { data, error } = await _p2pSb().rpc('rpc_list_company_ipo', {
        v_ipo_price:    ipoPrice,
        v_shares_total: 1000,
    });

    if (error || !data) { showNotification(_p2pErrMsg('IPO fallita', error || {message: 'risposta vuota'}), 'error'); return; }

    // Aggiorna gameState locale
    window.CE_money.addebitatoDalServer(50000, 'list_company_ipo_fee');
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
    if (!_p2pUid()) return;
    const listing = window._p2pMarket.shares.find(s => s.id === listingId);
    if (!listing) return;
    const total = listing.current_price * qty;
    if ((gameState.cash || 0) < total) {
        showNotification(`Fondi insufficienti (servono €${total.toLocaleString()})`, 'error'); return;
    }

    const { data, error } = await _p2pSb().rpc('rpc_buy_company_shares', {
        v_listing_id: listingId, v_qty: qty,
    });
    if (error || !data) { showNotification(_p2pErrMsg('Acquisto azioni fallito', error || {message: 'risposta vuota'}), 'error'); return; }

    window.CE_money.addebitatoDalServer(total, 'buy_company_shares');
    await saveGame();
    showNotification(`✅ Comprate ${qty} azioni di ${data.company} a €${data.price}/az.`, 'success');
    updateUI();
    await p2pFetchShares();
    if (typeof renderTabFinance === 'function') renderTabFinance();
};

window.sellCompanyShares = async function(listingId, qty) {
    if (!_p2pUid()) return;
    const { data, error } = await _p2pSb().rpc('rpc_sell_company_shares', {
        v_listing_id: listingId, v_qty: qty,
    });
    if (error || !data) { showNotification(_p2pErrMsg('Vendita azioni fallita', error || {message: 'risposta vuota'}), 'error'); return; }

    window.CE_money.accreditatoDalServer(data.total, 'sell_company_shares');
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
    if (!_p2pSb()) return;
    const { data, error } = await _p2pSb()
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
    if (!_p2pSb()) return;
    const uid = _p2pUid();

    const { data: listings, error: e1 } = await _p2pSb()
        .from('company_shares')
        .select('*')
        .order('listed_at', { ascending: false });

    if (!e1 && listings) window._p2pMarket.shares = listings;

    if (uid) {
        const { data: myH, error: e2 } = await _p2pSb()
            .from('share_holdings')
            .select('*, company_shares(company_name, current_price)')
            .eq('owner_user_id', uid);
        if (!e2 && myH) window._p2pMarket.myShareHoldings = myH;
    }
}

async function p2pFetchHoldings() {
    if (!_p2pSb()) return;
    const uid = _p2pUid();

    // Two separate queries to avoid PostgREST embedded-join schema cache issues
    const [hRes, mRes] = await Promise.all([
        _p2pSb().from('holdings').select('*').order('created_at', { ascending: false }),
        _p2pSb().from('holding_members').select('holding_id, user_id, company_name, role'),
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

async function p2pFetchConsorzi() {
    if (!_p2pSb()) return;
    const uid = _p2pUid();

    const [cRes, mRes] = await Promise.all([
        _p2pSb().from('consorzi').select('*').order('created_at', { ascending: false }),
        _p2pSb().from('consorzio_members').select('consorzio_id, user_id, company_name, role'),
    ]);
    if (cRes.error || mRes.error) return;

    const members = mRes.data || [];
    const all = (cRes.data || []).map(c => ({
        ...c,
        consorzio_members: members.filter(m => m.consorzio_id === c.id),
    }));

    window._p2pMarket.consorzi   = all;
    window._p2pMarket.myConsorzio = uid
        ? (all.find(c => c.consorzio_members.some(m => m.user_id === uid)) || null)
        : null;

    // Aggiorna sindacatoState con info consorzio
    if (window._p2pMarket.myConsorzio) {
        window._sindacatoState.consorzioId           = window._p2pMarket.myConsorzio.id;
        window._sindacatoState.consorzioMembersCount = window._p2pMarket.myConsorzio.consorzio_members.length;
    } else {
        window._sindacatoState.consorzioId           = null;
        window._sindacatoState.consorzioMembersCount = 0;
    }
}

async function p2pFetchTension() {
    if (!_p2pSb()) return;
    // Tick server-side (aggiorna tensione in base al tempo trascorso)
    const { data, error } = await _p2pSb().rpc('rpc_tick_tension');
    if (error || !data) return;
    window._sindacatoState.tension      = data.tension      ?? 0;
    window._sindacatoState.strikeActive = data.strike_active ?? false;
    window._sindacatoState.strikeEndsAt = data.strike_ends_at ?? null;
    if (data.strike_started) {
        showBigEvent('🚨', 'SCIOPERO NAZIONALE!',
            'La tensione sindacale ha raggiunto il limite. Tutti i redditi NCC sono ridotti del 30% per 24 ore.\nContribuisci alla cassa del tuo Sindacato per abbassare il Barometro prima del prossimo sciopero.');
        if (typeof renderTabInvestments === 'function') renderTabInvestments();
    }
}

async function p2pFetchGdfRisk() {
    if (!_p2pSb() || !_p2pUid()) return;
    const { data, error } = await _p2pSb().rpc('rpc_get_gdf_risk');
    if (error || !data) return;
    window._sindacatoState.gdfRisk              = data.risk_level           ?? 0;
    window._sindacatoState.crumiriBoostUntil    = data.crumiri_boost_until  ?? null;
    window._sindacatoState.carmineImmunityUntil = data.carmine_immunity_until ?? null;
}

/** Check giornaliero GdF — chiamata da processDailyRoutines() in engine.js */
window._sindacatoGdfDailyCheck = async function() {
    if (!_p2pSb() || !_p2pUid()) return;
    const { data, error } = await _p2pSb().rpc('rpc_gdf_inspection_check');
    if (error || !data) return;
    if (data.inspected) {
        const fine = data.fine || 0;
        if (fine > 0) {
            window.CE_money.addebitatoDalServer(fine, 'gdf_fine');
        }
        await saveGame();
        showBigEvent('🚔', 'ISPEZIONE GdF!',
            `La Guardia di Finanza ha fatto irruzione. Multa: −€${fine.toLocaleString()}.\nRischio GdF ridotto di 30 punti dopo l'ispezione.\nPaga Don Carmine per evitare future visite.`);
        logToMap(`🚔 GdF: ispezione! Multa −€${fine.toLocaleString()}`);
        window._sindacatoState.gdfRisk = Math.max(0, (window._sindacatoState.gdfRisk || 0) - 30);
        updateUI();
        if (typeof renderTabInvestments === 'function') renderTabInvestments();
    }
};

/** Refresh completo di tutti i dati P2P */
window.p2pRefreshAll = async function() {
    await Promise.all([
        p2pFetchMarket(),
        p2pFetchShares(),
        p2pFetchHoldings(),
        p2pFetchConsorzi(),
        p2pFetchTension(),
        p2pFetchGdfRisk(),
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
    if (!_p2pSb()) { console.warn('[P2P] Supabase non disponibile'); return; }

    // Annulla sottoscrizioni precedenti
    window._p2pMarket._subs.forEach(s => _p2pSb().removeChannel(s));
    window._p2pMarket._subs = [];

    // ── Mercato P2P: nuovi annunci e rimozioni ───────────────────────────────
    const marketChannel = _p2pSb()
        .channel('public:market_listings')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'market_listings' },
            (payload) => {
                if (payload.eventType === 'INSERT') {
                    window._p2pMarket.listings.unshift(payload.new);
                    if (payload.new.seller_user_id !== _p2pUid()) {
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
    const sharesChannel = _p2pSb()
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
    const holdingChannel = _p2pSb()
        .channel('public:holding_members')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'holding_members' },
            async () => {
                await p2pFetchHoldings();
                if (typeof renderTabInvestments === 'function') renderTabInvestments();
            }
        )
        .subscribe();

    // ── Consorzi: nuovi membri, nuove gilde ─────────────────────────────────
    const consorzioChannel = _p2pSb()
        .channel('public:consorzio_members')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'consorzio_members' },
            async () => {
                await p2pFetchConsorzi();
                if (typeof renderTabInvestments === 'function') renderTabInvestments();
            }
        )
        .subscribe();

    window._p2pMarket._subs = [marketChannel, sharesChannel, holdingChannel, consorzioChannel];
    console.log('[P2P] Realtime attivo su: market_listings, company_shares, holding_members, consorzio_members');
};

