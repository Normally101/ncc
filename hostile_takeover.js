'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   hostile_takeover.js — Chauffeur Empire · Espansione 11: OPA Ostili
   ═══════════════════════════════════════════════════════════════════════════ */

window.renderTabOPA = async function() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    container.innerHTML = `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #21262d;display:flex;align-items:flex-start;justify-content:space-between">
        <div>
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">M&amp;A</div>
            <div style="font-size:20px;font-weight:700;color:#e6edf3">OPA Ostili</div>
            <div style="font-size:11px;color:#6b7280;margin-top:4px">Rastrella il 51% delle azioni di un rivale per diventarne il padrone occulto</div>
        </div>
        <span style="font-size:9px;font-weight:700;color:#c79a2a;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.3);border-radius:4px;padding:3px 8px">51% → Controllo</span>
    </div>` + `<div>
      <div style="background:rgba(234,179,8,0.04);border:1px solid rgba(234,179,8,0.3);border-radius:6px;padding:16px;margin-bottom:16px;font-size:11px;color:#fde68a;line-height:1.5">
        <strong>Come funziona:</strong> Compra azioni di un rivale quotato in borsa dal tab Finance.
        Quando raggiungi il <strong>51%</strong>, scatta l'OPA ostile: il <strong>20%</strong> di ogni sua corsa
        futura finisce nelle tue tasche come dividendo.
      </div>

      <div id="opa-list" style="display:flex;flex-direction:column;gap:12px">
        <div style="text-align:center;padding:32px 0;color:var(--text-dim);font-size:11px">Caricamento…</div>
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
        list.innerHTML = `<div style="color:#db5746;font-size:12px;padding:16px">Errore: ${error.message || error}</div>`;
        return;
    }

    if (!data || !data.length) {
        list.innerHTML = `
        <div style="text-align:center;padding:48px 0">
          <div style="font-size:48px;margin-bottom:12px">🤝</div>
          <div style="color:#6b7280;font-size:12px">Nessuna OPA in corso.<br>
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
        ? '<span style="background:rgba(239,68,68,0.2);color:#db5746;border:1px solid rgba(239,68,68,0.3);font-size:11px;padding:2px 8px;border-radius:99px;font-weight:700">⚠️ Sei il TARGET</span>'
        : isRaider
        ? '<span style="background:rgba(34,197,94,0.2);color:#1aa06a;border:1px solid rgba(34,197,94,0.3);font-size:11px;padding:2px 8px;border-radius:99px;font-weight:700">🦅 Sei il RAIDER</span>'
        : '<span style="background:rgba(107,114,128,0.2);color:#6b7280;border:1px solid rgba(107,114,128,0.3);font-size:11px;padding:2px 8px;border-radius:99px">👁 Osservatore</span>';

    const buybackBtn = isTarget ? `
    <button
      onclick="window._opaRequestBuyback('${opa.opa_id}', ${opa.buyback_price})"
      style="width:100%;margin-top:12px;padding:12px;border-radius:6px;font-weight:700;font-size:12px;background:rgba(59,130,246,0.2);border:1px solid rgba(59,130,246,0.4);color:#2f74c0;cursor:pointer">
      🛡️ Riacquista maggioranza — €${Number(opa.buyback_price).toLocaleString('it-IT')}
    </button>` : '';

    const borderClr = isTarget ? 'rgba(239,68,68,0.3)' : isRaider ? 'rgba(34,197,94,0.3)' : '#d6dee8';
    const bgClr     = isTarget ? 'rgba(239,68,68,0.05)' : isRaider ? 'rgba(34,197,94,0.05)' : '#eef1f5';

    return `
    <div style="background:${bgClr};border:1px solid ${borderClr};border-radius:6px;padding:20px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
            <span style="color:#e6edf3;font-weight:700;font-size:12px">${opa.raider_company}</span>
            <span style="color:#6b7280;font-size:11px">vs</span>
            <span style="color:#e6edf3;font-weight:700;font-size:12px">${opa.target_company}</span>
          </div>
          <div style="font-size:11px;color:#6b7280">In corso dal ${since}</div>
        </div>
        ${roleLabel}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div style="background:#21262d;border-radius:6px;padding:12px;text-align:center">
          <div style="font-size:18px;font-weight:700;color:#e0922e">${Number(opa.raider_pct).toFixed(1)}%</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">Quota raider</div>
        </div>
        <div style="background:#21262d;border-radius:6px;padding:12px;text-align:center">
          <div style="font-size:18px;font-weight:700;color:#1aa06a">€${Number(opa.total_dividends || 0).toLocaleString('it-IT')}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">Dividendi totali</div>
        </div>
        <div style="background:#21262d;border-radius:6px;padding:12px;text-align:center">
          <div style="font-size:18px;font-weight:700;color:#2f74c0">€${Number(opa.buyback_price).toLocaleString('it-IT')}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">Prezzo buyback</div>
        </div>
      </div>

      <div style="font-size:11px;color:#6b7280;background:#0d1117;border-radius:6px;padding:10px">
        💸 <strong style="color:#facc15">20%</strong> di ogni corsa completata da
        <span style="color:#e6edf3">${opa.target_company}</span>
        va automaticamente a <span style="color:#e6edf3">${opa.raider_company}</span>
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
