'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   infrastructure.js — Chauffeur Empire · Espansione 12: Monopolio Infrastrutture
   ═══════════════════════════════════════════════════════════════════════════ */

const _INFRA_PROVINCES = [
    { id: 'prov_roma',    name: 'Roma Capitale',    region: 'Lazio' },
    { id: 'prov_milano',  name: 'Grande Milano',    region: 'Lombardia' },
    { id: 'prov_firenze', name: 'Firenze Storica',  region: 'Toscana' },
    { id: 'prov_napoli',  name: 'Napoli Metropoli', region: 'Campania' },
    { id: 'prov_venezia', name: 'Venezia Laguna',   region: 'Veneto' }
];

window.renderTabInfrastructure = async function() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    container.innerHTML = `
    <div class="p-4 max-w-2xl mx-auto">
      <div class="flex items-center gap-3 mb-6">
        <span class="text-3xl">⛽</span>
        <div>
          <h2 class="text-xl font-bold text-white">Monopolio Infrastrutture</h2>
          <p class="text-xs text-gray-400">Acquista depositi carburante nelle province — riscuoti un levy su tutte le corse</p>
        </div>
      </div>
      <div id="infra-loading" class="text-center py-8 text-gray-500 text-sm">Caricamento depositi...</div>
      <div id="infra-content" class="hidden"></div>
    </div>`;

    try {
        const { data: depots, error } = await window.supabaseClient.rpc('rpc_get_fuel_depots');
        if (error) throw error;
        _renderInfraContent(depots || []);
    } catch(e) {
        const el = document.getElementById('infra-loading');
        if (el) el.textContent = 'Errore caricamento: ' + (e.message || e);
    }
};

function _renderInfraContent(depots) {
    const loading = document.getElementById('infra-loading');
    const content = document.getElementById('infra-content');
    if (!loading || !content) return;
    loading.classList.add('hidden');
    content.classList.remove('hidden');

    const depotByProv = {};
    depots.forEach(d => { depotByProv[d.province_id] = d; });

    const myDepots = depots.filter(d => d.is_mine);
    const otherDepots = depots.filter(d => !d.is_mine);

    content.innerHTML = `
    ${myDepots.length > 0 ? `
      <div class="mb-6">
        <div class="text-xs font-bold text-green-400 uppercase tracking-wider mb-3">I Tuoi Depositi</div>
        ${myDepots.map(d => _renderMyDepotCard(d)).join('')}
      </div>
    ` : ''}

    <div class="mb-6">
      <div class="text-xs font-bold text-blue-400 uppercase tracking-wider mb-3">Province Disponibili</div>
      ${_INFRA_PROVINCES.map(prov => {
          const depot = depotByProv[prov.id];
          if (depot && !depot.is_mine) return _renderOccupiedCard(prov, depot);
          if (depot && depot.is_mine) return '';
          return _renderAvailableCard(prov);
      }).join('')}
    </div>

    ${otherDepots.length > 0 ? `
      <div class="mb-6">
        <div class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Depositi Rivali</div>
        ${otherDepots.map(d => _renderRivalCard(d)).join('')}
      </div>
    ` : ''}

    <div class="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-xs text-blue-200 mt-4">
      <strong>Come funziona:</strong> Ogni volta che un concorrente completa una corsa in una tua provincia,
      paga un <strong>levy carburante</strong> basato sul tuo markup (0–50%).
      Il costo del deposito è <strong>€300.000</strong>. Solo un deposito per provincia.
    </div>`;
}

function _renderMyDepotCard(d) {
    return `
    <div class="border border-green-500/30 bg-green-500/5 rounded-2xl p-5 mb-3">
      <div class="flex items-start justify-between mb-3">
        <div>
          <div class="text-white font-bold">⛽ ${d.province_name}</div>
          <div class="text-xs text-green-400 mt-0.5">Il tuo deposito · Incassato: €${(d.total_earned||0).toLocaleString('it-IT')}</div>
        </div>
        <span class="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 font-bold">${d.markup_pct}% markup</span>
      </div>
      <div class="flex items-center gap-3 mt-3">
        <label class="text-xs text-gray-400 flex-shrink-0">Markup:</label>
        <input type="range" min="0" max="50" step="1" value="${d.markup_pct}"
               id="markup-slider-${d.province_id}"
               oninput="document.getElementById('markup-val-${d.province_id}').textContent=this.value+'%'"
               class="flex-1 accent-green-500">
        <span id="markup-val-${d.province_id}" class="text-xs text-green-400 w-10 text-right">${d.markup_pct}%</span>
        <button onclick="_infraSetMarkup('${d.province_id}')"
          class="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30 transition-colors cursor-pointer">
          Salva
        </button>
      </div>
    </div>`;
}

function _renderAvailableCard(prov) {
    return `
    <div class="border border-white/10 bg-white/3 rounded-2xl p-4 mb-3 flex items-center justify-between">
      <div>
        <div class="text-white font-semibold text-sm">${prov.name}</div>
        <div class="text-xs text-gray-500">${prov.region} · Libero</div>
      </div>
      <button onclick="_infraBuyDepot('${prov.id}','${prov.name}')"
        class="px-4 py-2 rounded-xl text-xs font-bold bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 transition-colors cursor-pointer">
        Acquista €300k
      </button>
    </div>`;
}

function _renderOccupiedCard(prov, d) {
    return `
    <div class="border border-red-500/20 bg-red-500/3 rounded-2xl p-4 mb-3 flex items-center justify-between opacity-60">
      <div>
        <div class="text-white font-semibold text-sm">${prov.name}</div>
        <div class="text-xs text-red-400">${prov.region} · Occupato da ${d.owner_company}</div>
      </div>
      <span class="text-xs text-red-400 font-bold">${d.markup_pct}% markup</span>
    </div>`;
}

function _renderRivalCard(d) {
    return `
    <div class="border border-gray-500/20 rounded-xl p-3 mb-2 flex items-center justify-between">
      <div class="text-sm text-gray-300">${d.province_name}</div>
      <div class="text-xs text-gray-500">${d.owner_company} · ${d.markup_pct}% · incassato €${(d.total_earned||0).toLocaleString('it-IT')}</div>
    </div>`;
}

window._infraBuyDepot = async function(provinceId, provinceName) {
    const cost = 300000;
    if ((gameState.cash || 0) < cost) {
        if (typeof showNotification === 'function') showNotification('Fondi insufficienti (servono €300.000)', 'error');
        return;
    }
    if (!window.confirm(`Acquistare il deposito carburante a ${provinceName} per €300.000?`)) return;

    try {
        const { error } = await window.supabaseClient.rpc('rpc_buy_fuel_depot', { v_province_id: provinceId });
        if (error) throw error;
        gameState.cash -= cost;
        if (typeof showNotification === 'function') showNotification(`⛽ Deposito acquistato a ${provinceName}!`, 'success');
        if (typeof saveGame === 'function') saveGame();
        window.renderTabInfrastructure();
    } catch(e) {
        if (typeof showNotification === 'function') showNotification('Errore: ' + (e.message || e), 'error');
    }
};

window._infraSetMarkup = async function(provinceId) {
    const slider = document.getElementById('markup-slider-' + provinceId);
    if (!slider) return;
    const markup = parseFloat(slider.value);

    try {
        const { error } = await window.supabaseClient.rpc('rpc_set_fuel_markup', {
            v_province_id: provinceId,
            v_markup_pct: markup
        });
        if (error) throw error;
        if (typeof showNotification === 'function') showNotification(`Markup aggiornato a ${markup}%`, 'success');
    } catch(e) {
        if (typeof showNotification === 'function') showNotification('Errore: ' + (e.message || e), 'error');
    }
};
