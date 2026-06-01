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

const VTK_SHOP_ITEMS = [
    {
        id:    'slot_garage_7d',
        icon:  '🅿️',
        name:  'Slot Garage +7gg',
        desc:  'Espandi di 1 il limite veicoli per 7 giorni di gioco.',
        cost:  200,
        apply: (gs) => {
            if (!gs._vtkGarageSlotBonus) gs._vtkGarageSlotBonus = 0;
            gs._vtkGarageSlotBonus += 1;
            gs._vtkGarageSlotExpiry = (gs.day || 1) + 7;
            if (typeof showNotification === 'function') showNotification('🅿️ Slot Garage +1 attivo per 7 giorni!', 'success');
            if (typeof logToMap === 'function') logToMap('🅿️ VTK Shop: Slot Garage extra attivato per 7 giorni.');
        },
    },
    {
        id:    'driver_stress_reset',
        icon:  '💆',
        name:  'Reset Stress Autista',
        desc:  'Azzera istantaneamente lo stress dell\'autista più stressato.',
        cost:  100,
        apply: (gs) => {
            const drivers = (gs.drivers || []).filter(d => d.id !== 'ceo' && (d.stress_level || 0) > 0);
            if (!drivers.length) {
                if (typeof showNotification === 'function') showNotification('Nessun autista stressato!', 'info');
                return;
            }
            const worst = drivers.reduce((a, b) => ((a.stress_level||0) > (b.stress_level||0) ? a : b));
            worst.stress_level = 0;
            worst.burnout_until = null;
            if (typeof showNotification === 'function') showNotification(`💆 Stress di ${worst.name} azzerato!`, 'success');
            if (typeof logToMap === 'function') logToMap(`💆 VTK Shop: Stress di ${worst.name} azzerato.`);
        },
    },
    {
        id:    'rep_boost_01',
        icon:  '⭐',
        name:  'Boost Reputazione +0.2★',
        desc:  'Incremento immediato reputazione CEO di +0.2 stelle.',
        cost:  300,
        apply: (gs) => {
            const cap = 5.0 + (gs.prestige || 0);
            gs.reputation = Math.min(cap, (gs.reputation || 0) + 0.2);
            if (typeof showNotification === 'function') showNotification('⭐ Reputazione +0.2★!', 'success');
            if (typeof logToMap === 'function') logToMap('⭐ VTK Shop: Reputazione +0.2★');
        },
    },
];

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
        if (typeof showNotification === 'function') showNotification('Errore: ' + (error.message || error), 'error');
        return;
    }

    gameState.vtkBalance = (gameState.vtkBalance || 0) - vtk;
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
        if (typeof showNotification === 'function') showNotification('Errore acquisto: ' + (error.message || error), 'error');
        return;
    }

    gameState.driverCoins = (gameState.driverCoins || 0) - dcCost;
    gameState.vtkBalance  = (gameState.vtkBalance  || 0) + (data?.vtk_received || 0);
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
        if (typeof showNotification === 'function') showNotification('Errore: ' + (error.message || error), 'error');
        return;
    }

    gameState.vtkBalance = (gameState.vtkBalance || 0) + (data?.vtk_refunded || 0);
    if (typeof updateUI === 'function') updateUI();
    if (typeof saveGame === 'function') saveGame();
    if (typeof showNotification === 'function') showNotification('Ordine annullato.', 'success');
    window._vtkState._lastFetch = 0;
    await window.vtkRefreshOrders(true);
    window.renderVTKModal();
};

window.vtkBuyShopItem = function(itemId) {
    const item = VTK_SHOP_ITEMS.find(x => x.id === itemId);
    if (!item) return;
    if ((gameState.vtkBalance || 0) < item.cost) {
        if (typeof showNotification === 'function') showNotification(`VTK insufficienti — servono ${item.cost} VTK.`, 'error');
        return;
    }
    gameState.vtkBalance -= item.cost;
    item.apply(gameState);
    if (typeof updateUI === 'function') updateUI();
    if (typeof saveGame === 'function') saveGame();
    window.renderVTKModal();
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
    <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:8px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;position:relative">
        <!-- Header -->
        <div style="padding:16px 20px;border-bottom:1px solid #d6dee8;display:flex;align-items:center;justify-content:space-between">
            <div>
                <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">VTK Economy</div>
                <div style="font-size:18px;font-weight:700;color:#1f2733">Vettura Token</div>
            </div>
            <div style="display:flex;align-items:center;gap:16px">
                <div style="text-align:center">
                    <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.06em">VTK</div>
                    <div style="font-size:16px;font-weight:700;color:#2f74c0;font-family:monospace">◈ ${vtk}</div>
                </div>
                <div style="text-align:center">
                    <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.06em">DC</div>
                    <div style="font-size:16px;font-weight:700;color:#c79a2a;font-family:monospace">🪙 ${dc}</div>
                </div>
                <button onclick="document.getElementById('vtk-modal').remove()"
                    style="background:transparent;border:1px solid #d6dee8;color:#6a7480;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:14px;line-height:1">✕</button>
            </div>
        </div>

        <!-- Sub-tab bar -->
        <div style="display:flex;gap:0;border-bottom:1px solid #d6dee8">
            <button onclick="window._vtkState._subTab='market';window.renderVTKModal()"
                style="flex:1;padding:10px;font-size:10px;font-weight:600;cursor:pointer;border:none;transition:all .15s;
                    ${subTab==='market' ? 'background:#1a1a2a;color:#2f74c0;border-bottom:2px solid #2f74c0' : 'background:transparent;color:#6a7480;border-bottom:2px solid transparent'}">
                📈 Mercato P2P
            </button>
            <button onclick="window._vtkState._subTab='shop';window.renderVTKModal()"
                style="flex:1;padding:10px;font-size:10px;font-weight:600;cursor:pointer;border:none;transition:all .15s;
                    ${subTab==='shop' ? 'background:#1a1a2a;color:#c79a2a;border-bottom:2px solid #c79a2a' : 'background:transparent;color:#6a7480;border-bottom:2px solid transparent'}">
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
    <div style="background:#f3f6f9;border:1px solid #d6dee8;border-radius:6px;padding:14px;margin-bottom:16px">
        <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Crea Ordine di Vendita</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div>
                <div style="font-size:9px;color:#6a7480;margin-bottom:4px">VTK da vendere</div>
                <input id="vtk-sell-amount" type="number" min="1" max="${vtk}" step="10" value="50"
                    style="width:100%;background:#ffffff;border:1px solid #d6dee8;border-radius:4px;padding:6px 8px;font-size:11px;color:#1f2733;outline:none;box-sizing:border-box">
            </div>
            <div>
                <div style="font-size:9px;color:#6a7480;margin-bottom:4px">Prezzo (DC totale)</div>
                <input id="vtk-sell-price" type="number" min="1" step="1" value="10"
                    style="width:100%;background:#ffffff;border:1px solid #d6dee8;border-radius:4px;padding:6px 8px;font-size:11px;color:#1f2733;outline:none;box-sizing:border-box">
            </div>
        </div>
        <button onclick="window.vtkPlaceSellOrder(document.getElementById('vtk-sell-amount').value, document.getElementById('vtk-sell-price').value)"
            style="width:100%;padding:7px;font-size:10px;font-weight:700;cursor:pointer;background:#0d1b2a;border:1px solid rgba(88,166,255,0.4);color:#2f74c0;border-radius:4px;transition:opacity .15s"
            onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
            📤 Pubblica Ordine di Vendita
        </button>
    </div>

    <!-- My orders -->
    ${myOrders.length > 0 ? `
    <div style="margin-bottom:16px">
        <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">I Tuoi Ordini Attivi</div>
        ${myOrders.map(o => `
        <div style="background:#ffffff;border:1px solid rgba(212,175,55,0.2);border-radius:6px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:11px;color:#1f2733">
                <span style="color:#2f74c0;font-family:monospace">◈ ${o.vtk_amount} VTK</span>
                <span style="color:#6a7480;margin:0 8px">→</span>
                <span style="color:#c79a2a;font-family:monospace">🪙 ${o.dc_price} DC</span>
            </div>
            <button onclick="window.vtkCancelOrder('${o.id}')"
                style="font-size:9px;padding:3px 8px;cursor:pointer;background:#ffffff;border:1px solid #f0c4bd;color:#db5746;border-radius:4px">
                Annulla
            </button>
        </div>`).join('')}
    </div>` : ''}

    <!-- Other orders -->
    <div>
        <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Ordini Disponibili</div>
        ${otherOrders.length === 0
            ? `<div style="text-align:center;padding:24px 0;font-size:10px;color:#6a7480;font-style:italic">Nessun ordine disponibile al momento.</div>`
            : otherOrders.map(o => `
            <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">
                <div>
                    <div style="font-size:11px;color:#1f2733">
                        <span style="color:#2f74c0;font-family:monospace">◈ ${o.vtk_amount} VTK</span>
                        <span style="color:#6a7480;margin:0 8px">→</span>
                        <span style="color:#c79a2a;font-family:monospace">🪙 ${o.dc_price} DC</span>
                    </div>
                    <div style="font-size:9px;color:#6a7480;margin-top:2px">
                        ${(o.dc_price / o.vtk_amount).toFixed(2)} DC/VTK · da ${o.seller_name || 'Anonimo'}
                    </div>
                </div>
                <button onclick="window.vtkFillOrder('${o.id}', ${o.dc_price})"
                    ${dc < o.dc_price ? 'disabled' : ''}
                    style="font-size:9px;padding:5px 12px;cursor:${dc < o.dc_price ? 'not-allowed' : 'pointer'};background:#fff8e8;border:1px solid #c79a2a;color:#c79a2a;border-radius:4px;${dc < o.dc_price ? 'opacity:.4' : ''};transition:opacity .15s"
                    onmousedown="if(!this.disabled)this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
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
        <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div style="flex:1">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                    <span style="font-size:20px">${item.icon}</span>
                    <span style="font-size:12px;font-weight:700;color:#1f2733">${item.name}</span>
                </div>
                <div style="font-size:10px;color:#6a7480;margin-left:28px">${item.desc}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
                <div style="font-size:12px;font-weight:700;color:#2f74c0;font-family:monospace">◈ ${item.cost}</div>
                <button onclick="window.vtkBuyShopItem('${item.id}')"
                    ${canBuy ? '' : 'disabled'}
                    style="padding:5px 12px;font-size:9px;font-weight:700;border-radius:4px;cursor:${canBuy?'pointer':'not-allowed'};background:${canBuy?'#0d1b2a':'#ffffff'};border:1px solid ${canBuy?'rgba(88,166,255,0.4)':'#d6dee8'};color:${canBuy?'#2f74c0':'#6a7480'};${canBuy?'':'opacity:.5'};transition:opacity .15s"
                    onmousedown="if(!this.disabled)this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
                    Acquista
                </button>
            </div>
        </div>`;
    }).join('')}`;
}
