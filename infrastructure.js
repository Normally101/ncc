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

    container.innerHTML = `<div class="em"><div class="em-page em-wrap">
        <div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--em-line)">
            <div class="em-sec" style="margin-bottom:4px">Monopoli</div>
            <div style="font-size:20px;font-weight:800;margin-bottom:2px">Infrastrutture Carburante</div>
            <div style="font-size:11px;color:var(--em-muted)">Acquista depositi carburante nelle province — riscuoti un levy su tutte le corse</div>
        </div>
        <div id="infra-loading" class="em-empty">Caricamento depositi…</div>
        <div id="infra-content" style="display:none"></div>
    </div></div>`;

    try {
        if (!window.supabaseClient) throw new Error('Client di rete non disponibile');
        const { data: depots, error } = await window.supabaseClient.rpc('rpc_get_fuel_depots');
        if (error) throw error;
        _renderInfraContent(depots || []);
    } catch(e) {
        const el = document.getElementById('infra-loading');
        if (el) el.textContent = (window.CE_Sec && typeof window.CE_Sec.userError === 'function')
            ? window.CE_Sec.userError('Errore caricamento depositi', e)
            : (e?.message || 'Errore caricamento depositi');
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

    const myDepots    = depots.filter(d =>  d.is_mine);
    const otherDepots = depots.filter(d => !d.is_mine);

    content.innerHTML = `
    ${myDepots.length > 0 ? `
      <div style="margin-bottom:20px">
        <div class="em-sec" style="margin-bottom:10px;color:var(--em-green)">I Tuoi Depositi</div>
        ${myDepots.map(d => _renderMyDepotCard(d)).join('')}
      </div>
    ` : ''}

    <div style="margin-bottom:20px">
      <div class="em-sec" style="margin-bottom:10px;color:var(--em-blue)">Province Disponibili</div>
      ${_INFRA_PROVINCES.map(prov => {
          const depot = depotByProv[prov.id];
          if (depot && !depot.is_mine) return _renderOccupiedCard(prov, depot);
          if (depot && depot.is_mine)  return '';
          return _renderAvailableCard(prov);
      }).join('')}
    </div>

    ${otherDepots.length > 0 ? `
      <div style="margin-bottom:20px">
        <div class="em-sec" style="margin-bottom:10px">Depositi Rivali</div>
        ${otherDepots.map(d => _renderRivalCard(d)).join('')}
      </div>
    ` : ''}

    <div class="em-card" style="padding:14px;border-color:rgba(47,116,192,.4);margin-top:4px">
      <div style="font-size:11px;color:var(--em-blue);line-height:1.5">
        <strong>Come funziona:</strong> Ogni volta che un concorrente completa una corsa in una tua provincia,
        paga un <strong>levy carburante</strong> basato sul tuo markup (0–50%).
        Il costo del deposito è <strong>€300.000</strong>. Solo un deposito per provincia.
      </div>
    </div>`;
}

function _renderMyDepotCard(d) {
    const provName = (window.CE_Sec && typeof window.CE_Sec.escHtml === 'function')
        ? window.CE_Sec.escHtml(d.province_name || '')
        : (d.province_name || '');
    return `
    <div class="em-card" style="padding:16px;margin-bottom:10px;border-color:rgba(26,160,106,.4)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
        <div>
          <div style="font-weight:700;margin-bottom:2px">⛽ ${provName}</div>
          <div style="font-size:11px;color:var(--em-green)">Il tuo deposito · Incassato: €${(d.total_earned||0).toLocaleString('it-IT')}</div>
        </div>
        <span class="em-pill em-pill--green">${Math.round(d.markup_pct)}% markup</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:10px">
        <label style="font-size:11px;color:var(--em-muted);flex-shrink:0">Markup:</label>
        <input type="range" min="0" max="50" step="1" value="${Math.round(d.markup_pct)}"
               id="markup-slider-${d.province_id}"
               ${ceAct('ceMarkupPreview', [d.province_id], 'input')}
               style="flex:1;accent-color:var(--em-green)">
        <span id="markup-val-${d.province_id}" style="font-size:11px;color:var(--em-green);width:40px;text-align:right">${Math.round(d.markup_pct)}%</span>
        <button class="em-gbtn" ${ceAct('_infraSetMarkup', [d.province_id])}>Salva</button>
      </div>
    </div>`;
}

function _renderAvailableCard(prov) {
    const pName = (window.CE_Sec && typeof window.CE_Sec.escHtml === 'function')
        ? window.CE_Sec.escHtml(prov.name || '')
        : (prov.name || '');
    const pRegion = (window.CE_Sec && typeof window.CE_Sec.escHtml === 'function')
        ? window.CE_Sec.escHtml(prov.region || '')
        : (prov.region || '');
    return `
    <div class="em-card" style="padding:14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-weight:700;font-size:12px;margin-bottom:2px">${pName}</div>
        <div style="font-size:11px;color:var(--em-muted)">${pRegion} · Libero</div>
      </div>
      <button class="em-bbtn" ${ceAct('_infraBuyDepot', [prov.id,prov.name])}>Acquista €300k</button>
    </div>`;
}

function _renderOccupiedCard(prov, d) {
    const pName = (window.CE_Sec && typeof window.CE_Sec.escHtml === 'function')
        ? window.CE_Sec.escHtml(prov.name || '')
        : (prov.name || '');
    const pRegion = (window.CE_Sec && typeof window.CE_Sec.escHtml === 'function')
        ? window.CE_Sec.escHtml(prov.region || '')
        : (prov.region || '');
    const owner = (window.CE_Sec && typeof window.CE_Sec.escHtml === 'function')
        ? window.CE_Sec.escHtml(d.owner_company || 'Un rivale')
        : (d.owner_company || 'Un rivale');
    return `
    <div class="em-card" style="padding:14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;opacity:.6;border-color:rgba(219,87,70,.3)">
      <div>
        <div style="font-weight:700;font-size:12px;margin-bottom:2px">${pName}</div>
        <div style="font-size:11px;color:var(--em-red)">${pRegion} · Occupato da ${owner}</div>
      </div>
      <span class="em-pill em-pill--red">${d.markup_pct}% markup</span>
    </div>`;
}

function _renderRivalCard(d) {
    const pName = (window.CE_Sec && typeof window.CE_Sec.escHtml === 'function')
        ? window.CE_Sec.escHtml(d.province_name || '')
        : (d.province_name || '');
    const owner = (window.CE_Sec && typeof window.CE_Sec.escHtml === 'function')
        ? window.CE_Sec.escHtml(d.owner_company || 'Un rivale')
        : (d.owner_company || 'Un rivale');
    return `
    <div class="em-card" style="padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:12px;font-weight:600">${pName}</div>
      <div style="font-size:11px;color:var(--em-muted)">${owner} · ${d.markup_pct}% · incassato €${(d.total_earned||0).toLocaleString('it-IT')}</div>
    </div>`;
}

window._infraBuyDepot = async function(provinceId, provinceName) {
    const cost = 300000;
    if (!window.confirm(`Acquistare il deposito carburante a ${provinceName} per €300.000?`)) return;
    if (((window.gameState && window.gameState.cash) || 0) < cost) {
        if (typeof showNotification === 'function') {
            showNotification('Fondi insufficienti! Servono €' + cost.toLocaleString('it-IT'), 'error');
        }
        return;
    }

    try {
        if (!window.supabaseClient) throw new Error('Client di rete non disponibile');
        const { error } = await window.supabaseClient.rpc('rpc_buy_fuel_depot', { v_province_id: provinceId });
        if (error) throw error;

        window.CE_money.addebitatoDalServer(cost, 'buy_fuel_depot');
        if (typeof showNotification === 'function') showNotification(`⛽ Deposito acquistato a ${provinceName}!`, 'success');
        if (typeof saveGame === 'function') saveGame();
        if (typeof updateUI === 'function') updateUI();
        if (typeof window.renderTabInfrastructure === 'function') window.renderTabInfrastructure();
    } catch(e) {
        const errMsg = (window.CE_Sec && typeof window.CE_Sec.userError === 'function')
            ? window.CE_Sec.userError('Acquisto deposito non riuscito', e)
            : (e?.message || 'Acquisto deposito non riuscito');
        if (typeof showNotification === 'function') showNotification(errMsg, 'error');
    }
};

window._infraSetMarkup = async function(provinceId) {
    const slider = document.getElementById('markup-slider-' + provinceId);
    if (!slider) return;
    const markup = parseFloat(slider.value);

    try {
        if (!window.supabaseClient) throw new Error('Client di rete non disponibile');
        const { error } = await window.supabaseClient.rpc('rpc_set_fuel_markup', {
            v_province_id: provinceId,
            v_markup_pct:  markup
        });
        if (error) throw error;
        if (typeof showNotification === 'function') showNotification(`Markup aggiornato a ${markup}%`, 'success');
        if (typeof window.renderTabInfrastructure === 'function') window.renderTabInfrastructure();
    } catch(e) {
        const errMsg = (window.CE_Sec && typeof window.CE_Sec.userError === 'function')
            ? window.CE_Sec.userError('Aggiornamento markup non riuscito', e)
            : (e?.message || 'Aggiornamento markup non riuscito');
        if (typeof showNotification === 'function') showNotification(errMsg, 'error');
    }
};
