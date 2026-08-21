'use strict';
/* ================================================================
   vtk-market.js — Chauffeur Empire
   VTK (Vettura Token) Market modal + VTK Shop.
   VTK earned from missions → tradeable P2P with DC.

   RPC backend: rpc_place_vtk_sell_order, rpc_fill_vtk_order,
                rpc_cancel_vtk_order, rpc_get_vtk_market_orders
   ================================================================ */

window._vtkState = {
    orders:     [],
    _lastFetch: 0,
    _subTab:    'market', // 'market' | 'shop'
};

// ── VTK SHOP CATALOG ─────────────────────────────────────────────────────────

/* ── CATALOGO VTK SHOP ────────────────────────────────────────────────────────
   REGOLA: qui NON si mette niente che il motore non legga davvero. Ogni effetto
   sotto è stato verificato risalendo al punto del motore che lo consuma.
   Il prezzo qui è solo per il display: quello che conta è il catalogo server-side
   in `rpc_spend_vtk_shop_item` (46_vtk_shop_purchase_scaffold.sql). Se i due
   divergono, il server vince e l'acquisto viene rifiutato — mai fidarsi del client.
   Aggiungendo un item QUI va aggiunto anche LÌ, altrimenti resta non acquistabile. */
const VTK_SHOP_ITEMS = [
    {
        id:    'driver_stress_reset',
        icon:  '💆',
        name:  'Reset Stress Autista',
        desc:  'Azzera stress e burnout dell\'autista più provato.',
        cost:  100,
        // verificato: stress_level/burnout_until esistono (engine-drivers.js:151)
        // e stress_level è letto in engine-rides.js:430.
        apply: (gs) => {
            const drivers = (gs.drivers || []).filter(d => d.id !== 'ceo' && ((d.stress_level || 0) > 0 || d.burnout_until));
            if (!drivers.length) return { ok: false, msg: 'Nessun autista stressato.' };
            const worst = drivers.reduce((a, b) => ((a.stress_level || 0) > (b.stress_level || 0) ? a : b));
            worst.stress_level = 0;
            worst.burnout_until = null;
            return { ok: true, msg: `💆 Stress di ${worst.name} azzerato.` };
        },
    },
    {
        id:    'fuel_refill_full',
        icon:  '⛽',
        name:  'Rifornimento Cisterna',
        desc:  'Riempie all\'istante il deposito carburante aziendale.',
        cost:  150,
        // verificato: fuelTank/fuelTankCapacity sono consumati dal ciclo giornaliero
        // (engine-daily.js:195,210,231). Non duplica nulla dell'Executive Club.
        apply: (gs) => {
            const cap = gs.fuelTankCapacity || 0;
            if (cap <= 0) return { ok: false, msg: 'Non hai ancora un deposito carburante.' };
            const before = Math.floor(gs.fuelTank || 0);
            if (before >= cap) return { ok: false, msg: 'Il deposito è già pieno.' };
            gs.fuelTank = cap;
            return { ok: true, msg: `⛽ Deposito riempito: ${before.toLocaleString('it-IT')}L → ${cap.toLocaleString('it-IT')}L.` };
        },
    },
    {
        id:    'rep_boost_01',
        icon:  '⭐',
        name:  'Boost Reputazione +0.2★',
        desc:  'Incremento immediato della reputazione aziendale.',
        cost:  300,
        apply: (gs) => {
            const cap = 5.0 + (gs.prestige || 0);
            const before = gs.reputation || 0;
            if (before >= cap) return { ok: false, msg: 'Reputazione già al massimo.' };
            gs.reputation = Math.min(cap, before + 0.2);
            return { ok: true, msg: '⭐ Reputazione +0.2★.' };
        },
    },
];

/* RIMOSSO — 'slot_garage_7d' (200 VTK, "Espandi di 1 il limite veicoli per 7 giorni").
   Era un placebo: scriveva `_vtkGarageSlotBonus`/`_vtkGarageSlotExpiry`, che in tutto il
   repo non venivano letti da nessuno, e per di più nel gioco NON esiste alcun limite alla
   flotta da espandere (le uniche "capacity" sono quelle della cisterna carburante).
   Il giocatore pagava 200 VTK e non riceveva nulla. Non va reintrodotto finché un limite
   flotta non esiste davvero e qualcuno non legge quei campi. */

// ── DATA LAYER ────────────────────────────────────────────────────────────────

window.vtkRefreshOrders = async function(force = false) {
    const now = Date.now();
    if (!force && now - window._vtkState._lastFetch < 30000) return;
    window._vtkState._lastFetch = now;

    const sb = window.supabaseClient;
    if (!sb) return;

    const { data, error } = await sb.rpc('rpc_get_vtk_market_orders');
    if (!error && data) window._vtkState.orders = data;
};

window.vtkPlaceSellOrder = async function(vtkAmount, dcPrice) {
    const vtk = parseInt(vtkAmount, 10);
    const dc  = parseInt(dcPrice, 10);
    if (!vtk || vtk < 1 || !dc || dc < 1) {
        if (typeof showNotification === 'function') showNotification('Inserisci quantità e prezzo validi.', 'error');
        return;
    }
    if ((gameState.vtkBalance || 0) < vtk) {
        if (typeof showNotification === 'function') showNotification(`VTK insufficienti — hai ${gameState.vtkBalance} VTK.`, 'error');
        return;
    }

    const sb = window.supabaseClient;
    if (!sb) return;
    const { error } = await sb.rpc('rpc_place_vtk_sell_order', { v_vtk_amount: vtk, v_dc_price: dc });
    if (error) {
        if (typeof showNotification === 'function') showNotification(window.CE_Sec.userError('Ordine non riuscito', error), 'error');
        return;
    }

    if (typeof updateUI === 'function') updateUI();
    if (typeof saveGame === 'function') saveGame();
    if (typeof showNotification === 'function') showNotification(`✅ Ordine di vendita: ${vtk} VTK → ${dc} DC`, 'success');
    window._vtkState._lastFetch = 0;
    await window.vtkRefreshOrders(true);
    window.renderVTKModal();
};

window.vtkFillOrder = async function(orderId, dcCost) {
    if ((gameState.driverCoins || 0) < dcCost) {
        if (typeof showNotification === 'function') showNotification(`DC insufficienti — servono ${dcCost} DC.`, 'error');
        return;
    }

    const sb = window.supabaseClient;
    if (!sb) return;
    const { data, error } = await sb.rpc('rpc_fill_vtk_order', { v_order_id: orderId });
    if (error) {
        if (typeof showNotification === 'function') showNotification(window.CE_Sec.userError('Acquisto non riuscito', error), 'error');
        return;
    }

    if (typeof updateUI === 'function') updateUI();
    if (typeof saveGame === 'function') saveGame();
    if (typeof showNotification === 'function') showNotification(`✅ Acquistati ${data?.vtk_received || 0} VTK!`, 'success');
    window._vtkState._lastFetch = 0;
    await window.vtkRefreshOrders(true);
    window.renderVTKModal();
};

window.vtkCancelOrder = async function(orderId) {
    const sb = window.supabaseClient;
    if (!sb) return;
    const { data, error } = await sb.rpc('rpc_cancel_vtk_order', { v_order_id: orderId });
    if (error) {
        if (typeof showNotification === 'function') showNotification(window.CE_Sec.userError('Annullamento non riuscito', error), 'error');
        return;
    }

    if (typeof updateUI === 'function') updateUI();
    if (typeof saveGame === 'function') saveGame();
    if (typeof showNotification === 'function') showNotification('Ordine annullato.', 'success');
    window._vtkState._lastFetch = 0;
    await window.vtkRefreshOrders(true);
    window.renderVTKModal();
};

/* Acquisto VTK Shop — server-authoritative, con degrado sicuro.

   Il problema che questa funzione risolve: `vtkBalance` viene RISCRITTO PER INTERO dal
   server ad ogni evento Realtime sulla riga `companies` (serverState.js:210). La vecchia
   versione lo scalava solo in locale, quindi il saldo tornava su al primo evento successivo
   mentre l'oggetto restava applicato e salvato: acquisti gratis, ripetibili all'infinito.

   L'unico modo corretto è far scalare il saldo al SERVER. La RPC `rpc_spend_vtk_shop_item`
   però potrebbe non essere ancora applicata al DB (46_vtk_shop_purchase_scaffold.sql).
   In quel caso questa funzione RIFIUTA l'acquisto invece di regalare l'oggetto: il negozio
   si disattiva da solo con un messaggio onesto, il gioco continua a funzionare, e nel
   momento in cui la SQL viene applicata torna operativo senza bisogno di un nuovo deploy. */
const _vtkBuyInFlight = new Set();

window.vtkBuyShopItem = async function(itemId) {
    const item = VTK_SHOP_ITEMS.find(x => x.id === itemId);
    if (!item) return;

    // Doppio click / doppio invio: un acquisto per volta per item.
    if (_vtkBuyInFlight.has(itemId)) return;

    const notify = (msg, kind) => { if (typeof showNotification === 'function') showNotification(msg, kind); };

    if ((gameState.vtkBalance || 0) < item.cost) {
        notify(`VTK insufficienti — servono ${item.cost} VTK.`, 'error');
        return;
    }

    // L'effetto va provato PRIMA di pagare: alcuni item non hanno nulla su cui agire
    // (nessun autista stressato, deposito già pieno, reputazione al massimo). Meglio
    // dirlo subito che incassare e non fare niente. Si applica su una copia di prova.
    const dryRun = item.apply({
        ...gameState,
        drivers: (gameState.drivers || []).map(d => ({ ...d })),
    });
    if (dryRun && dryRun.ok === false) { notify(dryRun.msg, 'info'); return; }

    const sb = window.supabaseClient;
    if (!sb) { notify('Non connesso al server: acquisto non disponibile offline.', 'error'); return; }

    _vtkBuyInFlight.add(itemId);
    try {
        const { data, error } = await sb.rpc('rpc_spend_vtk_shop_item', { v_item_id: itemId });

        if (error) {
            // 42883 = funzione inesistente (Postgres) · PGRST202 = non esposta (PostgREST).
            const missing = error.code === '42883' || error.code === 'PGRST202' ||
                            /does not exist|could not find the function/i.test(error.message || '');
            if (missing) {
                notify('VTK Shop non ancora attivo su questo server. Nessun VTK è stato scalato.', 'warning');
                console.warn('[VTK Shop] rpc_spend_vtk_shop_item assente: applicare 46_vtk_shop_purchase_scaffold.sql');
            } else {
                notify(window.CE_Sec?.userError ? window.CE_Sec.userError('Acquisto non riuscito', error)
                                                : 'Acquisto non riuscito.', 'error');
            }
            return;   // in nessun caso l'oggetto viene consegnato
        }

        const res = item.apply(gameState);
        notify((res && res.msg) || 'Acquisto completato.', 'success');
        if (typeof logToMap === 'function' && res && res.msg) logToMap(`◈ VTK Shop: ${res.msg}`);
        if (typeof updateUI === 'function') updateUI();
        if (typeof saveGame === 'function') saveGame();
        if (typeof window.renderVTKModal === 'function') window.renderVTKModal();
    } catch (e) {
        notify('Acquisto non riuscito: errore di rete.', 'error');
    } finally {
        _vtkBuyInFlight.delete(itemId);
    }
};

// ── MODAL RENDERER ────────────────────────────────────────────────────────────

window.openVTKModal = async function() {
    // Remove existing
    document.getElementById('vtk-modal')?.remove();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'vtk-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);

    await window.vtkRefreshOrders();
    window.renderVTKModal();
};

window.renderVTKModal = function() {
    const overlay = document.getElementById('vtk-modal');
    if (!overlay) return;

    const vtk   = gameState.vtkBalance || 0;
    const dc    = gameState.driverCoins || 0;
    const orders = window._vtkState.orders || [];
    const subTab = window._vtkState._subTab;
    const myUid  = window.currentUser?.id;

    const myOrders  = orders.filter(o => o.seller_id === myUid);
    const otherOrders = orders.filter(o => o.seller_id !== myUid);

    // Sub-tab: market or shop
    const marketContent = subTab === 'market' ? _vtkRenderMarket(vtk, dc, myOrders, otherOrders) : '';
    const shopContent   = subTab === 'shop'   ? _vtkRenderShop(vtk) : '';

    overlay.innerHTML = `
    <div style="background:#161b22;border:1px solid #21262d;border-radius:8px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;position:relative">
        <!-- Header -->
        <div style="padding:16px 20px;border-bottom:1px solid #21262d;display:flex;align-items:center;justify-content:space-between">
            <div>
                <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">VTK Economy</div>
                <div style="font-size:18px;font-weight:700;color:#e6edf3">Vettura Token</div>
            </div>
            <div style="display:flex;align-items:center;gap:16px">
                <div style="text-align:center">
                    <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">VTK</div>
                    <div style="font-size:16px;font-weight:700;color:#2f74c0;font-family:monospace">◈ ${vtk}</div>
                </div>
                <div style="text-align:center">
                    <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">DC</div>
                    <div style="font-size:16px;font-weight:700;color:#c79a2a;font-family:monospace">🪙 ${dc}</div>
                </div>
                <button ${ceAct('ceRemove', ['vtk-modal'])}
                    style="background:transparent;border:1px solid #21262d;color:#6b7280;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:14px;line-height:1">✕</button>
            </div>
        </div>

        <!-- Sub-tab bar -->
        <div style="display:flex;gap:0;border-bottom:1px solid #21262d">
            <button ${ceAct('ceSetRender', ['_vtkState', '_subTab', 'market', 'renderVTKModal'])}
                style="flex:1;padding:10px;font-size:10px;font-weight:600;cursor:pointer;border:none;transition:all .15s;
                    ${subTab==='market' ? 'background:#1a1a2a;color:#2f74c0;border-bottom:2px solid #2f74c0' : 'background:transparent;color:#6b7280;border-bottom:2px solid transparent'}">
                📈 Mercato P2P
            </button>
            <button ${ceAct('ceSetRender', ['_vtkState', '_subTab', 'shop', 'renderVTKModal'])}
                style="flex:1;padding:10px;font-size:10px;font-weight:600;cursor:pointer;border:none;transition:all .15s;
                    ${subTab==='shop' ? 'background:#1a1a2a;color:#c79a2a;border-bottom:2px solid #c79a2a' : 'background:transparent;color:#6b7280;border-bottom:2px solid transparent'}">
                🛒 VTK Shop
            </button>
        </div>

        <!-- Content -->
        <div style="padding:16px 20px">
            ${marketContent}
            ${shopContent}
        </div>
    </div>`;
};

function _vtkRenderMarket(vtk, dc, myOrders, otherOrders) {
    return `
    <!-- Explanation -->
    <div style="background:rgba(88,166,255,0.06);border:1px solid rgba(88,166,255,0.18);border-radius:6px;padding:12px;margin-bottom:16px;font-size:10px;color:#79c0ff;line-height:1.5">
        <strong>VTK → DC:</strong> Vendi i tuoi VTK guadagnati dalle missioni agli altri giocatori in cambio di Driver Coins.
    </div>

    <!-- Create sell order -->
    <div style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:14px;margin-bottom:16px">
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Crea Ordine di Vendita</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div>
                <div style="font-size:9px;color:#6b7280;margin-bottom:4px">VTK da vendere</div>
                <input id="vtk-sell-amount" type="number" min="1" max="${vtk}" step="10" value="50"
                    style="width:100%;background:#161b22;border:1px solid #21262d;border-radius:4px;padding:6px 8px;font-size:11px;color:#e6edf3;outline:none;box-sizing:border-box">
            </div>
            <div>
                <div style="font-size:9px;color:#6b7280;margin-bottom:4px">Prezzo (DC totale)</div>
                <input id="vtk-sell-price" type="number" min="1" step="1" value="10"
                    style="width:100%;background:#161b22;border:1px solid #21262d;border-radius:4px;padding:6px 8px;font-size:11px;color:#e6edf3;outline:none;box-sizing:border-box">
            </div>
        </div>
        <button ${ceAct('ceVtkSell', [])}
            style="width:100%;padding:7px;font-size:10px;font-weight:700;cursor:pointer;background:#0d1b2a;border:1px solid rgba(88,166,255,0.4);color:#2f74c0;border-radius:4px;transition:opacity .15s">
            📤 Pubblica Ordine di Vendita
        </button>
    </div>

    <!-- My orders -->
    ${myOrders.length > 0 ? `
    <div style="margin-bottom:16px">
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">I Tuoi Ordini Attivi</div>
        ${myOrders.map(o => `
        <div style="background:#161b22;border:1px solid rgba(212,175,55,0.2);border-radius:6px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:11px;color:#e6edf3">
                <span style="color:#2f74c0;font-family:monospace">◈ ${o.vtk_amount} VTK</span>
                <span style="color:#6b7280;margin:0 8px">→</span>
                <span style="color:#c79a2a;font-family:monospace">🪙 ${o.dc_price} DC</span>
            </div>
            <button ${ceAct('vtkCancelOrder', [o.id])}
                style="font-size:9px;padding:3px 8px;cursor:pointer;background:#161b22;border:1px solid #f0c4bd;color:#db5746;border-radius:4px">
                Annulla
            </button>
        </div>`).join('')}
    </div>` : ''}

    <!-- Other orders -->
    <div>
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Ordini Disponibili</div>
        ${otherOrders.length === 0
            ? `<div style="text-align:center;padding:24px 0;font-size:10px;color:#6b7280;font-style:italic">Nessun ordine disponibile al momento.</div>`
            : otherOrders.map(o => `
            <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">
                <div>
                    <div style="font-size:11px;color:#e6edf3">
                        <span style="color:#2f74c0;font-family:monospace">◈ ${o.vtk_amount} VTK</span>
                        <span style="color:#6b7280;margin:0 8px">→</span>
                        <span style="color:#c79a2a;font-family:monospace">🪙 ${o.dc_price} DC</span>
                    </div>
                    <div style="font-size:9px;color:#6b7280;margin-top:2px">
                        ${(o.dc_price / o.vtk_amount).toFixed(2)} DC/VTK · da ${CE_Sec.escHtml(o.seller_name || 'Anonimo')}
                    </div>
                </div>
                <button ${ceAct('vtkFillOrder', [o.id, o.dc_price])}
                    ${dc < o.dc_price ? 'disabled' : ''}
                    style="font-size:9px;padding:5px 12px;cursor:${dc < o.dc_price ? 'not-allowed' : 'pointer'};background:#161b228e8;border:1px solid #c79a2a;color:#c79a2a;border-radius:4px;${dc < o.dc_price ? 'opacity:.4' : ''};transition:opacity .15s">
                    Acquista
                </button>
            </div>`).join('')
        }
    </div>`;
}

function _vtkRenderShop(vtk) {
    return `
    <div style="background:rgba(212,175,55,0.04);border:1px solid rgba(212,175,55,0.15);border-radius:6px;padding:12px;margin-bottom:16px;font-size:10px;color:#c79a2a;line-height:1.5">
        Spendi i tuoi VTK per potenziamenti istantanei. I VTK non scadono mai.
    </div>
    ${VTK_SHOP_ITEMS.map(item => {
        const canBuy = vtk >= item.cost;
        return `
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div style="flex:1">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                    <span style="font-size:20px">${item.icon}</span>
                    <span style="font-size:12px;font-weight:700;color:#e6edf3">${item.name}</span>
                </div>
                <div style="font-size:10px;color:#6b7280;margin-left:28px">${item.desc}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
                <div style="font-size:12px;font-weight:700;color:#2f74c0;font-family:monospace">◈ ${item.cost}</div>
                <button ${ceAct('vtkBuyShopItem', [item.id])}
                    ${canBuy ? '' : 'disabled'}
                    style="padding:5px 12px;font-size:9px;font-weight:700;border-radius:4px;cursor:${canBuy?'pointer':'not-allowed'};background:${canBuy?'#0d1b2a':'#ffffff'};border:1px solid ${canBuy?'rgba(88,166,255,0.4)':'#d6dee8'};color:${canBuy?'#2f74c0':'#6a7480'};${canBuy?'':'opacity:.5'};transition:opacity .15s">
                    Acquista
                </button>
            </div>
        </div>`;
    }).join('')}`;
}
