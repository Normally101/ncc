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

    container.innerHTML = `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #d6dee8">
        <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Monopoli</div>
        <div style="font-size:20px;font-weight:700;color:#1f2733">Infrastrutture Carburante</div>
        <div style="font-size:11px;color:#6a7480;margin-top:4px">Acquista depositi carburante nelle province — riscuoti un levy su tutte le corse</div>
    </div>` + `<div>
      <div id="infra-loading" style="text-align:center;padding:32px 0;color:#6a7480;font-size:11px">Caricamento depositi…</div>
      <div id="infra-content" style="display:none"></div>
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
    loading.style.display = 'none';
    content.style.display = '';

    const depotByProv = {};
    depots.forEach(d => { depotByProv[d.province_id] = d; });

    const myDepots = depots.filter(d => d.is_mine);
    const otherDepots = depots.filter(d => !d.is_mine);

    content.innerHTML = `
    ${myDepots.length > 0 ? `
      <div style="margin-bottom:24px">
        <div style="font-size:11px;font-weight:700;color:#1aa06a;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">I Tuoi Depositi</div>
        ${myDepots.map(d => _renderMyDepotCard(d)).join('')}
      </div>
    ` : ''}

    <div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;color:#2f74c0;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">Province Disponibili</div>
      ${_INFRA_PROVINCES.map(prov => {
          const depot = depotByProv[prov.id];
          if (depot && !depot.is_mine) return _renderOccupiedCard(prov, depot);
          if (depot && depot.is_mine) return '';
          return _renderAvailableCard(prov);
      }).join('')}
    </div>

    ${otherDepots.length > 0 ? `
      <div style="margin-bottom:24px">
        <div style="font-size:11px;font-weight:700;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">Depositi Rivali</div>
        ${otherDepots.map(d => _renderRivalCard(d)).join('')}
      </div>
    ` : ''}

    <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:6px;padding:16px;font-size:11px;color:#2f74c0;margin-top:16px">
      <strong>Come funziona:</strong> Ogni volta che un concorrente completa una corsa in una tua provincia,
      paga un <strong>levy carburante</strong> basato sul tuo markup (0–50%).
      Il costo del deposito è <strong>€300.000</strong>. Solo un deposito per provincia.
    </div>`;
}

function _renderMyDepotCard(d) {
    return `
    <div style="border:1px solid rgba(34,197,94,0.3);background:rgba(34,197,94,0.05);border-radius:6px;padding:20px;margin-bottom:12px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
        <div>
          <div style="color:#1f2733;font-weight:700">⛽ ${d.province_name}</div>
          <div style="font-size:11px;color:#1aa06a;margin-top:2px">Il tuo deposito · Incassato: €${(d.total_earned||0).toLocaleString('it-IT')}</div>
        </div>
        <span style="font-size:11px;padding:4px 8px;border-radius:99px;background:rgba(34,197,94,0.2);color:#1aa06a;font-weight:700">${Math.round(d.markup_pct)}% markup</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:12px">
        <label style="font-size:11px;color:#6a7480;flex-shrink:0">Markup:</label>
        <input type="range" min="0" max="50" step="1" value="${Math.round(d.markup_pct)}"
               id="markup-slider-${d.province_id}"
               oninput="document.getElementById('markup-val-${d.province_id}').textContent=this.value+'%'"
               style="flex:1;accent-color:#1aa06a">
        <span id="markup-val-${d.province_id}" style="font-size:11px;color:#1aa06a;width:40px;text-align:right">${Math.round(d.markup_pct)}%</span>
        <button onclick="_infraSetMarkup('${d.province_id}')"
          style="padding:6px 12px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(34,197,94,0.2);border:1px solid rgba(34,197,94,0.3);color:#86efac;cursor:pointer">
          Salva
        </button>
      </div>
    </div>`;
}

function _renderAvailableCard(prov) {
    return `
    <div style="border:1px solid #d6dee8;background:rgba(255,255,255,0.03);border-radius:6px;padding:16px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="color:#1f2733;font-weight:600;font-size:12px">${prov.name}</div>
        <div style="font-size:11px;color:#6a7480">${prov.region} · Libero</div>
      </div>
      <button onclick="_infraBuyDepot('${prov.id}','${prov.name}')"
        style="padding:8px 16px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(59,130,246,0.2);border:1px solid rgba(59,130,246,0.3);color:#2f74c0;cursor:pointer">
        Acquista €300k
      </button>
    </div>`;
}

function _renderOccupiedCard(prov, d) {
    return `
    <div style="border:1px solid rgba(239,68,68,0.2);background:rgba(239,68,68,0.03);border-radius:6px;padding:16px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;opacity:.6">
      <div>
        <div style="color:#1f2733;font-weight:600;font-size:12px">${prov.name}</div>
        <div style="font-size:11px;color:#db5746">${prov.region} · Occupato da ${d.owner_company}</div>
      </div>
      <span style="font-size:11px;color:#db5746;font-weight:700">${d.markup_pct}% markup</span>
    </div>`;
}

function _renderRivalCard(d) {
    return `
    <div style="border:1px solid rgba(107,114,128,0.2);border-radius:6px;padding:12px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:12px;color:#4d6480">${d.province_name}</div>
      <div style="font-size:11px;color:#6a7480">${d.owner_company} · ${d.markup_pct}% · incassato €${(d.total_earned||0).toLocaleString('it-IT')}</div>
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
