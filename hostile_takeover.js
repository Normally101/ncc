'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   hostile_takeover.js — Chauffeur Empire · Espansione 11: OPA Ostili
   ═══════════════════════════════════════════════════════════════════════════ */

window.renderTabOPA = async function() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    container.innerHTML = `<div class="em"><div class="em-page em-wrap">
        <div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--em-line);display:flex;align-items:flex-start;justify-content:space-between">
            <div>
                <div class="em-sec" style="margin-bottom:4px">M&amp;A</div>
                <div style="font-size:20px;font-weight:800;margin-bottom:2px">OPA Ostili</div>
                <div style="font-size:11px;color:var(--em-muted)">Rastrella il 51% delle azioni di un rivale per diventarne il padrone occulto</div>
            </div>
            <span class="em-pill em-pill--gold">51% → Controllo</span>
        </div>

        <div class="em-card" style="padding:14px;margin-bottom:14px;border-color:rgba(199,154,42,.35)">
            <div style="font-size:11px;color:var(--em-gold);line-height:1.5">
                <strong>Come funziona:</strong> Compra azioni di un rivale quotato in borsa dal tab Finance.
                Quando raggiungi il <strong>51%</strong>, scatta l'OPA ostile: il <strong>20%</strong> di ogni sua corsa
                futura finisce nelle tue tasche come dividendo.
            </div>
        </div>

        <div id="opa-list" style="display:flex;flex-direction:column;gap:10px">
            <div class="em-empty">Caricamento…</div>
        </div>
    </div></div>`;

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
        try { console.warn('[OPA] load error', error.code || '', error.message || error); } catch {}
        list.innerHTML = `<div style="color:var(--em-red);font-size:12px;padding:16px">Impossibile caricare le acquisizioni, riprova.</div>`;
        return;
    }

    if (!data || !data.length) {
        list.innerHTML = `
        <div style="text-align:center;padding:40px 0">
          <div style="font-size:48px;margin-bottom:12px">🤝</div>
          <div class="em-empty">Nessuna OPA in corso.<br>
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
        ? `<span class="em-pill em-pill--red">⚠️ Sei il TARGET</span>`
        : isRaider
        ? `<span class="em-pill em-pill--green">🦅 Sei il RAIDER</span>`
        : `<span class="em-pill em-pill--gray">👁 Osservatore</span>`;

    const buybackBtn = isTarget ? `
    <button class="em-bbtn" ${ceAct('_opaRequestBuyback', [opa.opa_id, opa.buyback_price])}
      style="width:100%;margin-top:12px;box-sizing:border-box">
      🛡️ Riacquista maggioranza — €${Number(opa.buyback_price).toLocaleString('it-IT')}
    </button>` : '';

    const borderC = isTarget ? 'rgba(219,87,70,.35)' : isRaider ? 'rgba(26,160,106,.35)' : 'var(--em-line)';

    return `
    <div class="em-card" style="padding:16px;border-color:${borderC}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:12px">${opa.raider_company}</span>
            <span style="color:var(--em-muted);font-size:11px">vs</span>
            <span style="font-weight:700;font-size:12px">${opa.target_company}</span>
          </div>
          <div style="font-size:11px;color:var(--em-muted)">In corso dal ${since}</div>
        </div>
        ${roleLabel}
      </div>

      <div class="em-kpibar" style="margin-bottom:12px">
        <div class="k" style="text-align:center">
          <div class="l">Quota raider</div>
          <div class="v" style="color:var(--em-amber)">${Number(opa.raider_pct).toFixed(1)}%</div>
        </div>
        <div class="k" style="text-align:center">
          <div class="l">Dividendi totali</div>
          <div class="v" style="color:var(--em-green)">€${Number(opa.total_dividends || 0).toLocaleString('it-IT')}</div>
        </div>
        <div class="k" style="text-align:center">
          <div class="l">Prezzo buyback</div>
          <div class="v" style="color:var(--em-blue)">€${Number(opa.buyback_price).toLocaleString('it-IT')}</div>
        </div>
      </div>

      <div class="em-card" style="padding:9px 12px">
        <span style="font-size:11px;color:var(--em-muted)">💸 </span><strong style="color:var(--em-gold)">20%</strong>
        <span style="font-size:11px;color:var(--em-muted)"> di ogni corsa completata da </span>
        <span style="font-size:11px;font-weight:700">${opa.target_company}</span>
        <span style="font-size:11px;color:var(--em-muted)"> va a </span>
        <span style="font-size:11px;font-weight:700">${opa.raider_company}</span>
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
            // rpc_opa_buyback ha gia' scalato la cassa server-side (27_hostile_takeovers.sql:184)
            if (!window.ServerState?.isReady()) gameState.cash = Math.max(0, (gameState.cash || 0) - price);
        }
        await _loadOPAList();
    } catch(e) {
        if (typeof showNotification === 'function') {
            showNotification('❌ ' + window.CE_Sec.userError('Buyback non riuscito', e), 'error');
        }
    }
};
