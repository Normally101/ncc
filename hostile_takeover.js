'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   hostile_takeover.js — Chauffeur Empire · Espansione 11: OPA Ostili
   ═══════════════════════════════════════════════════════════════════════════ */

window.renderTabOPA = async function() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    container.innerHTML = `
    <div class="p-4 max-w-3xl mx-auto">
      <div class="flex items-center gap-3 mb-6">
        <span class="text-3xl">🦅</span>
        <div>
          <h2 class="text-xl font-bold text-white">OPA Ostili</h2>
          <p class="text-xs text-gray-400">Rastrella il 51% delle azioni di un rivale per diventarne il padrone occulto</p>
        </div>
      </div>

      <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-6 text-sm text-yellow-200">
        <strong>Come funziona:</strong> Compra azioni di un rivale quotato in borsa dal tab Finance.
        Quando raggiungi il <strong>51%</strong>, scatta l'OPA ostile: il <strong>20%</strong> di ogni sua corsa
        futura finisce nelle tue tasche come dividendo. Il target può riacquistare la maggioranza
        pagando il prezzo di buyback.
      </div>

      <div id="opa-list" class="flex flex-col gap-4">
        <div class="text-center text-gray-500 py-8 text-sm">Caricamento...</div>
      </div>
    </div>`;

    await _loadOPAList();
};

async function _loadOPAList() {
    const list = document.getElementById('opa-list');
    if (!list) return;

    let data, error;
    try {
        const res = await window.supabaseClient.rpc('rpc_get_hostile_takeovers');
        data  = res.data;
        error = res.error;
    } catch(e) { error = e; }

    if (error) {
        list.innerHTML = `<div class="text-red-400 text-sm p-4">Errore: ${error.message || error}</div>`;
        return;
    }

    if (!data || !data.length) {
        list.innerHTML = `
        <div class="text-center py-12">
          <div class="text-5xl mb-3">🤝</div>
          <div class="text-gray-400 text-sm">Nessuna OPA in corso.<br>
          Compra azioni di un rivale dal tab Finance → Borsa per iniziare.</div>
        </div>`;
        return;
    }

    list.innerHTML = data.map(opa => _renderOPACard(opa)).join('');
}

function _renderOPACard(opa) {
    const isTarget = opa.is_my_target;
    const isRaider = opa.is_my_raid;
    const since    = new Date(opa.triggered_at).toLocaleDateString('it-IT');

    const roleLabel = isTarget
        ? '<span class="bg-red-500/20 text-red-400 border border-red-500/30 text-xs px-2 py-0.5 rounded-full font-bold">⚠️ Sei il TARGET</span>'
        : isRaider
        ? '<span class="bg-green-500/20 text-green-400 border border-green-500/30 text-xs px-2 py-0.5 rounded-full font-bold">🦅 Sei il RAIDER</span>'
        : '<span class="bg-gray-500/20 text-gray-400 border border-gray-500/30 text-xs px-2 py-0.5 rounded-full">👁 Osservatore</span>';

    const buybackBtn = isTarget ? `
    <button
      onclick="window._opaRequestBuyback('${opa.opa_id}', ${opa.buyback_price})"
      class="w-full mt-3 py-3 rounded-xl font-bold text-sm
             bg-blue-500/20 border border-blue-500/40 text-blue-300
             hover:bg-blue-500/30 active:scale-95 transition-all cursor-pointer">
      🛡️ Riacquista maggioranza — €${Number(opa.buyback_price).toLocaleString('it-IT')}
    </button>` : '';

    const borderColor = isTarget ? 'border-red-500/30' : isRaider ? 'border-green-500/30' : 'border-white/10';
    const bgColor     = isTarget ? 'bg-red-500/5' : isRaider ? 'bg-green-500/5' : 'bg-white/5';

    return `
    <div class="${bgColor} border ${borderColor} rounded-2xl p-5">
      <div class="flex items-start justify-between mb-4">
        <div>
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="text-white font-bold text-sm">${opa.raider_company}</span>
            <span class="text-gray-500 text-xs">vs</span>
            <span class="text-white font-bold text-sm">${opa.target_company}</span>
          </div>
          <div class="text-xs text-gray-500">In corso dal ${since}</div>
        </div>
        ${roleLabel}
      </div>

      <div class="grid grid-cols-3 gap-3 mb-3">
        <div class="bg-white/5 rounded-xl p-3 text-center">
          <div class="text-lg font-bold text-orange-400">${Number(opa.raider_pct).toFixed(1)}%</div>
          <div class="text-xs text-gray-500 mt-0.5">Quota raider</div>
        </div>
        <div class="bg-white/5 rounded-xl p-3 text-center">
          <div class="text-lg font-bold text-green-400">€${Number(opa.total_dividends || 0).toLocaleString('it-IT')}</div>
          <div class="text-xs text-gray-500 mt-0.5">Dividendi totali</div>
        </div>
        <div class="bg-white/5 rounded-xl p-3 text-center">
          <div class="text-lg font-bold text-blue-400">€${Number(opa.buyback_price).toLocaleString('it-IT')}</div>
          <div class="text-xs text-gray-500 mt-0.5">Prezzo buyback</div>
        </div>
      </div>

      <div class="text-xs text-gray-500 bg-black/20 rounded-lg p-2.5">
        💸 <strong class="text-yellow-400">20%</strong> di ogni corsa completata da
        <span class="text-white">${opa.target_company}</span>
        va automaticamente a <span class="text-white">${opa.raider_company}</span>
      </div>

      ${buybackBtn}
    </div>`;
}

window._opaRequestBuyback = async function(opaId, price) {
    const cash = (typeof gameState !== 'undefined' && gameState?.cash) ? gameState.cash : 0;
    if (cash < price) {
        if (typeof showNotification === 'function') {
            showNotification(`❌ Fondi insufficienti per il buyback (servono €${Number(price).toLocaleString('it-IT')})`, 'error');
        }
        return;
    }

    const ok = window.confirm(
        `Riacquistare la maggioranza per €${Number(price).toLocaleString('it-IT')}?\n\n` +
        `Il 50% andrà al raider come compensazione. Confermi?`
    );
    if (!ok) return;

    try {
        const { data, error } = await window.supabaseClient.rpc('rpc_opa_buyback', { v_opa_id: opaId });
        if (error) throw error;
        if (typeof showNotification === 'function') {
            showNotification('🛡️ Buyback completato! Hai ripreso il controllo della tua azienda.', 'success');
        }
        if (typeof gameState !== 'undefined' && gameState) {
            gameState.cash = Math.max(0, (gameState.cash || 0) - price);
        }
        await _loadOPAList();
    } catch(e) {
        if (typeof showNotification === 'function') {
            showNotification('❌ Errore buyback: ' + (e.message || e), 'error');
        }
    }
};
