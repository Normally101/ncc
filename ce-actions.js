'use strict';
/* ================================================================
   ce-actions.js — funzioni-azione nominate per l'event-delegation (events.js).
   Sostituiscono gli onclick/oninput/onchange inline che contenevano:
   - letture DOM al click-time (document.getElementById('x').value)
   - codice multiplo (set + render, remove + azione)
   Caricato DOPO events.js e PRIMA dei file UI.
   Convenzione: 'this' = elemento che ha scatenato l'evento; l'ultimo
   argomento (ev) è l'event, passato dal dispatcher di events.js.
   Tutte chiamano le globali di gioco già esistenti (window.*).
   ================================================================ */

/* ── contratti / bid ─────────────────────────────────────────── */
function cePlaceBid(id) { CE_placeBid(id, document.getElementById('pledge-' + id).value); }
function ceBidPreview(id) { CE_updateBidPreview(id, this.value); }

/* ── crypto ──────────────────────────────────────────────────── */
function ceCryptoTrade(side, coinId, inputId) {
    var v = document.getElementById(inputId).value;
    if (side === 'buy') cryptoBuy(coinId, v); else cryptoSell(coinId, v);
}
function ceCryptoDeposit(jid, inputId) { cryptoDepositOffshore(jid, document.getElementById(inputId).value); }
function ceCryptoWithdraw(jid, inputId) { cryptoWithdrawOffshore(jid, document.getElementById(inputId).value); }
function ceCryptoPreview(coinId, side) { window._cryptoUpdatePreview(coinId, side, this.value); }

/* ── p2p holding / consorzio ─────────────────────────────────── */
function ceHoldingContribute(id) { contributeHoldingTreasury(id, parseInt(document.getElementById('hld-contrib-amt').value) || 0); }
function ceCreateHolding() { createHolding(document.getElementById('hld-name').value, document.getElementById('hld-desc').value); }
function ceConsorzioContribute(id) { contributeConsorzio(id, parseInt(document.getElementById('cso-contrib-amt').value) || 0); }
function ceCreateConsorzio() { createConsorzio(document.getElementById('cso-name').value, document.getElementById('cso-desc').value); }

/* ── finanza: azioni / broker ────────────────────────────────── */
function ceStockAction(action, tid) {
    var q = parseInt(document.getElementById('stock-qty-' + tid).value) || 1;
    if (typeof window[action] === 'function') window[action](tid, q);
}
function cePlaceBroker() {
    placeBrokerInvestment(document.getElementById('broker-capital').value, window._brokerRisk || 'low', window._brokerDur || 6);
}

/* ── politica / lobby / ranking ──────────────────────────────── */
function ceDonateLobby() { var el = document.getElementById('lobby-donate-amt'); donateToLobby(el ? el.value : 0); }
function ceVoteDecree(did, inputId) { var el = document.getElementById(inputId); return voteServerDecree(did, el ? el.value : 0); }
function ceAttackTerritory() { attackTerritory(document.getElementById('attack-region-select').value); }

/* ── VTK ─────────────────────────────────────────────────────── */
function ceVtkSell() { vtkPlaceSellOrder(document.getElementById('vtk-sell-amount').value, document.getElementById('vtk-sell-price').value); }

/* ── staff / showroom ────────────────────────────────────────── */
function ceListCar(carId, price) { listCarForSale(carId, price); if (typeof closeModals === 'function') closeModals(); }
function ceSetAvatar(id) { setDriverAvatar(id, this); }

/* ── HQ: chiudi modale + upgrade stanza ──────────────────────── */
function ceHqBuildConfirm(modalId, cityId, roomId, slot) {
    var m = document.getElementById(modalId); if (m) m.remove();
    if (slot === undefined || slot === null) hqUpgradeRoom(cityId, roomId);
    else hqUpgradeRoom(cityId, roomId, slot);
}

/* ── accademia ───────────────────────────────────────────────── */
function ceStartAcademy(did, cid) {
    startAcademyCourse(did, cid);
    if (typeof window.openAcademyModal === 'function') window.openAcademyModal();
}

/* ── career CTA: chiudi overlay + vai alla tab ───────────────── */
function ceCareerCta(tab) {
    var m = document.getElementById('career-modal-overlay'); if (m) m.remove();
    if (typeof switchTab === 'function') switchTab(tab);
}

/* ── ui-help: toggle accordion (usa this) ────────────────────── */
function ceToggleFa() {
    var a = this.querySelector('.fa');
    if (a) a.style.display = (a.style.display === 'none' ? 'block' : 'none');
}

/* ── landing: forgot password (previene submit del link) ─────── */
function ceForgotPassword(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (typeof window._authForgotPassword === 'function') window._authForgotPassword();
}

/* ── vanity: targa presidenziale ─────────────────────────────── */
function ceTargaPresidenziale() {
    if (window._ecTargaPresidenziale) window._ecTargaPresidenziale(); else switchTab('store');
}

/* ── saveSystem: brand color (set + active + preview) ────────── */
function ceSetBrandColor(value) {
    window._selectedColorSS = value;
    document.querySelectorAll('.brand-color-btn').forEach(function (b) { b.classList.remove('active'); });
    if (this && this.classList) this.classList.add('active');
    var p = document.getElementById('ss-color-preview'); if (p) p.style.color = value;
}

/* ── input preview (oninput, usano this.value) ───────────────── */
function ceMarkupPreview(pid) {
    var el = document.getElementById('markup-val-' + pid); if (el) el.textContent = this.value + '%';
}
function ceTPledge(tid) { window._tSetPledge(tid, this.value); }

/* ── alliances: invio chat con Enter (keydown, usa ev) ───────── */
function ceAlChatEnter(ev) { if (ev && ev.key === 'Enter' && typeof window._alChat === 'function') window._alChat(); }

/* ── modali: no-op che "assorbe" il click sul contenuto interno ──
   (rimpiazza event.stopPropagation(): con la delegation, closest() si ferma
   su questo elemento e non risale al backdrop, quindi il modale non si chiude) */
function ceNoop() { }

/* ── backdrop self-close: chiude solo se il click è sul backdrop stesso ──
   (this = elemento con data-ce-act = il backdrop; ev.target = elemento cliccato) */
function ceCloseSelf(closeFn, ev) {
    if (ev && ev.target === this && typeof window[closeFn] === 'function') window[closeFn]();
}
