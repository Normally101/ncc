'use strict';
/* ================================================================
   ui-emails.js — Chauffeur Empire
   3-tab Inbox CEO email client UI.
   Loaded AFTER dispatcher.js (needs: gameState, window._inboxTab,
   EMAIL_TEMPLATES, negotiateEmail, all game action globals)
   ================================================================ */

/* Azioni email (event-delegation: niente onclick inline — CSP no unsafe-inline) */
function setInboxTab(tab) { window._inboxTab = tab; renderTabEmails(); }
function resolveEmail(id) {
    const em = gameState.emails.find(x => x.id == id) || {};
    em.status = 'resolved';
    renderTabEmails();
}
function collectBrokerEmail(id, gain) {
    const em = gameState.emails.find(x => x.id == id) || {};
    em.status = 'resolved';
    if (typeof spawnMoneyParticles === 'function' && this && this.getBoundingClientRect) {
        const r = this.getBoundingClientRect();
        spawnMoneyParticles(r.left + r.width / 2, r.top, gain);
    }
    renderTabEmails();
}

function renderTabEmails() {
    const container = document.getElementById('tab-container');

    // ── Tab state ─────────────────────────────────────────────────────────────
    if (!window._inboxTab) window._inboxTab = 'urgenti';
    const TAB_TYPES = {
        urgenti:   ['ceo_event', 'shadow', 'poaching', 'grey_market', 'rival_provoc'],
        vip:       null,   // vip_* and diamond — handled specially
        comunicazioni: ['broker_result', 'driver_msg', 'info']
    };
    const unreadAll = gameState.emails.filter(e => e.status === 'unread');
    const countUrgenti = unreadAll.filter(e => TAB_TYPES.urgenti.includes(e.type)).length;
    const countVip     = unreadAll.filter(e => e.type.startsWith('vip_') || e.type === 'diamond').length;
    const countComm    = unreadAll.filter(e => TAB_TYPES.comunicazioni.includes(e.type)).length;

    // ── Header ────────────────────────────────────────────────────────────────
    const totalUnread = countUrgenti + countVip + countComm;
    let html = `<div class="em em-page"><div class="em-wrap"><div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #d6dee8;display:flex;align-items:flex-start;justify-content:space-between">
        <div>
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Inbox CEO</div>
            <div style="font-size:20px;font-weight:700;color:#e6edf3">Comunicazioni Riservate</div>
            <div style="font-size:11px;color:#6b7280;margin-top:4px">${totalUnread > 0 ? `${totalUnread} messaggi non letti` : 'Nessun nuovo messaggio'}</div>
        </div>
        ${totalUnread > 0 ? `<span style="font-size:10px;font-weight:700;color:#db5746;background:rgba(248,81,73,0.12);border:1px solid rgba(248,81,73,0.3);border-radius:4px;padding:3px 8px">${totalUnread}</span>` : ''}
    </div>`;

    // ── 3-Tab bar ─────────────────────────────────────────────────────────────
    html += `<div class="inbox-tabs">`;
    html += `<button class="inbox-tab-btn${window._inboxTab==='urgenti'?' active':''}" ${ceAct('setInboxTab', ['urgenti'])}>🚨 Urgenti${countUrgenti>0?`<span class="inbox-tab-badge">${countUrgenti}</span>`:''}</button>`;
    html += `<button class="inbox-tab-btn${window._inboxTab==='vip'?' active':''}" ${ceAct('setInboxTab', ['vip'])}>👑 VIP &amp; Diamond${countVip>0?`<span class="inbox-tab-badge badge-purple">${countVip}</span>`:''}</button>`;
    html += `<button class="inbox-tab-btn${window._inboxTab==='comunicazioni'?' active':''}" ${ceAct('setInboxTab', ['comunicazioni'])}>📋 Comunicazioni${countComm>0?`<span class="inbox-tab-badge badge-blue">${countComm}</span>`:''}</button>`;
    html += `</div>`;

    // ── Active buffs + political tokens banner ─────────────────────────────────
    const now = gameState.day * 24 + gameState.hour;
    const activeBuffs = (gameState.activeBuffs || []).filter(b => b.until > now);
    const polTokens = gameState.politicalTokens || 0;
    if (activeBuffs.length || polTokens) {
        let buffItems = [];
        if (polTokens) buffItems.push(`🏛️ Gettoni Politici: <b>${polTokens}</b>`);
        activeBuffs.forEach(b => {
            const hoursLeft = Math.max(0, b.until - now);
            const label = b.type === 'earnings_pct' ? `+${b.value}% guadagni`
                        : b.type === 'tip_pct'      ? `+${b.value}% mance`
                        : b.type === 'fine_discount' ? `−${b.value}% multe`
                        : b.type === 'speed_boost'  ? `+${b.value}% velocità`
                        : b.type === 'vip_queue'    ? `+${b.value}% clienti VIP`
                        : b.type;
            buffItems.push(`✨ ${label} <span style="color:var(--text-dim)">(${hoursLeft}h)</span>`);
        });
        if (gameState.fuelPriceLock && gameState.fuelPriceLockUntil > now) {
            const h = Math.max(0, gameState.fuelPriceLockUntil - now);
            buffItems.push(`⛽ Carburante bloccato €${gameState.fuelPriceLock.toFixed(2)} <span style="color:var(--text-dim)">(${h}h)</span>`);
        }
        html += `<div style="background:#161b22;border:1px solid rgba(34,197,94,0.3);border-radius:6px;padding:16px;margin-bottom:12px;font-size:10px;color:#1aa06a;display:flex;flex-wrap:wrap;gap:8px">
            ${buffItems.map(i => `<span>${i}</span>`).join('')}
        </div>`;
    }

    // ── Filter by tab ─────────────────────────────────────────────────────────
    let tabEmails;
    if (window._inboxTab === 'urgenti') {
        tabEmails = unreadAll.filter(e => TAB_TYPES.urgenti.includes(e.type));
    } else if (window._inboxTab === 'vip') {
        tabEmails = unreadAll.filter(e => e.type.startsWith('vip_') || e.type === 'diamond');
    } else {
        tabEmails = unreadAll.filter(e => TAB_TYPES.comunicazioni.includes(e.type));
    }

    // ── Empty state ───────────────────────────────────────────────────────────
    if (tabEmails.length === 0) {
        const emptyIcon = window._inboxTab === 'vip' ? '👑' : '📭';
        const emptyTitle = window._inboxTab === 'urgenti' ? 'Nessun messaggio urgente'
                         : window._inboxTab === 'vip'     ? 'Nessuna richiesta VIP'
                         : 'Nessuna comunicazione';
        html += `<div class="em-empty"><div style="font-size:36px;margin-bottom:12px">${emptyIcon}</div><div style="font-size:14px;font-weight:700;color:#e6edf3">${emptyTitle}</div></div>`;
        container.innerHTML = html + `</div></div>`;
        return;
    }

    // ── Helper: derive card class, badge class, badge label, sender icon ──────
    function _emailCardClass(e) {
        if (e.type === 'poaching' || e.type === 'rival_provoc') return 'email-urgent';
        if (e.type === 'ceo_event') return 'email-gold';
        if (e.type === 'shadow' || e.type === 'grey_market') return 'email-red';
        if (e.type.startsWith('vip_')) return 'email-vip';
        if (e.type === 'diamond') return 'email-diamond';
        if (e.type === 'broker_result') return e.brokerGain >= 0 ? 'email-broker-pos' : 'email-broker-neg';
        if (e.type === 'driver_msg' || e.type === 'info') return 'email-blue';
        return '';
    }
    function _emailBadgeClass(e) {
        if (e.type === 'poaching' || e.type === 'rival_provoc') return 'badge-orange';
        if (e.type === 'ceo_event') return 'badge-gold-pill';
        if (e.type === 'shadow' || e.type === 'grey_market') return 'badge-red-pill';
        if (e.type.startsWith('vip_')) return 'badge-purple-pill';
        if (e.type === 'diamond') return 'badge-yellow-pill';
        if (e.type === 'broker_result') return e.brokerGain >= 0 ? 'badge-green-pill' : 'badge-red-pill';
        if (e.type === 'driver_msg' || e.type === 'info') return 'badge-blue-pill';
        return 'badge-blue-pill';
    }
    function _emailBadgeLabel(e) {
        if (e.type === 'poaching')      return '⚠ POACHING';
        if (e.type === 'ceo_event')     return '📅 CEO EVENT';
        if (e.type === 'shadow')        return '🕵 SHADOW';
        if (e.type === 'grey_market')   return '⚠ GREY MARKET';
        if (e.type === 'rival_provoc')  return '💢 RIVALE';
        if (e.type === 'vip_request')   return '👑 VIP REQUEST';
        if (e.type === 'vip_event' || e.type === 'vip_payment') return '⚡ VIP';
        if (e.type.startsWith('vip_'))  return '⚡ VIP';
        if (e.type === 'diamond')       return '💎 DIAMOND';
        if (e.type === 'broker_result') return '📊 BROKER';
        if (e.type === 'driver_msg')    return '🚗 AUTISTA';
        if (e.type === 'info')          return 'ℹ INFO';
        return e.type.replace('_', ' ').toUpperCase();
    }
    function _emailSenderIcon(e) {
        if (e.senderIcon) return e.senderIcon;
        if (e.type === 'poaching' || e.type === 'rival_provoc') return '🏢';
        if (e.type === 'ceo_event')     return '🎩';
        if (e.type === 'shadow')        return '🕵️';
        if (e.type === 'grey_market')   return '⚠️';
        if (e.type.startsWith('vip_'))  return '👑';
        if (e.type === 'diamond')       return '💎';
        if (e.type === 'broker_result') return '📊';
        if (e.type === 'driver_msg')    return '🚗';
        if (e.type === 'info')          return 'ℹ️';
        return '📧';
    }

    // ── Render each email card ────────────────────────────────────────────────
    tabEmails.forEach(e => {
        const gameHour  = gameState.day * 24 + gameState.hour;
        const hoursLeft = e.expiresAt ? Math.max(0, e.expiresAt - gameHour) : null;
        const expiryHtml = hoursLeft !== null
            ? `<div class="email-expiry"><span style="color:${hoursLeft <= 3 ? '#db5746' : '#e0922e'}">⏰ Scade in ${hoursLeft}h</span></div>`
            : '';

        const cardClass    = _emailCardClass(e);
        const badgeClass   = _emailBadgeClass(e);
        const badgeLabel   = _emailBadgeLabel(e);
        const senderIcon   = _emailSenderIcon(e);
        const senderName   = e.senderName || e.sender || '';
        const senderRole   = e.senderRole || '';
        const timestampHtml = (e.day !== undefined && e.hour !== undefined)
            ? `<div class="email-timestamp">Giorno ${e.day}, ore ${String(e.hour).padStart(2,'0')}:00</div>`
            : '';
        const bodyText = e.body || (e.type === 'ceo_event' ? '' : '');
        const bodyHtml = bodyText
            ? `<div class="email-body">${bodyText}</div>`
            : '';
        const sigHtml = e.signature
            ? `<div class="email-signature">${CE_Sec.escHtml(e.signature)}</div>`
            : '';

        html += `<div class="email-card ${cardClass}">`;

        // Header row: sender block + type badge
        html += `<div class="email-header">
            <div class="email-sender-block">
                <div class="email-sender-icon">${senderIcon}</div>
                <div style="min-width:0">
                    <div class="email-sender-name">${senderName}</div>
                    ${senderRole ? `<div class="email-sender-role">${senderRole}</div>` : ''}
                </div>
            </div>
            <span class="email-type-badge ${badgeClass}">${badgeLabel}</span>
        </div>`;

        html += timestampHtml;
        html += `<div class="email-subject">${CE_Sec.escHtml(e.subject)}</div>`;
        html += expiryHtml;
        html += bodyHtml;

        // ── Per-type content & action buttons ─────────────────────────────────
        html += `<div class="email-actions">`;

        if (e.type === 'ceo_event') {
            html += `</div><div style="font-size:10px;color:#4d6480;margin-bottom:12px">${CE_Sec.escHtml(e.eventData.desc)}</div><div style="display:flex;flex-direction:column;gap:8px">`;
            e.eventData.choices.forEach((c, idx) => {
                html += `<button ${ceAct('negotiateEmail', [e.id, 0, idx])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;text-align:left;transition:opacity .15s">${CE_Sec.escHtml(c.text)}</button>`;
            });
            html += `</div>`;

        } else if (e.type === 'shadow') {
            const sr = e.shadowData;
            // Lo sconto dei Vetri Oscurati vale SOLO per l'auto assegnata all'autista che
            // esegue la missione (engine-events.js:293-295), non per la flotta. Qui bastava
            // `fleet.some(...)`: con una sola auto vetrata su venti il giocatore leggeva
            // "−65%" e correva il rischio pieno in 19 casi su 20.
            const _fleet     = gameState.fleet || [];
            const _vetri     = _fleet.filter(c => (c.upgrades||[]).includes('vetri_oscurati')).length;
            const _allVetri  = _fleet.length > 0 && _vetri === _fleet.length;
            // inv_safe_driving fa saltare del tutto il controllo l'85% delle volte
            // (engine-events.js:288): le missioni shadow non sono isGreyMarket, quindi il
            // filtro le copre. È l'effetto più grande dei due e non era nemmeno citato.
            const _training  = (typeof hasInvestment === 'function') && hasInvestment('inv_safe_driving');
            const _passMult  = _training ? 0.15 : 1;
            const _riskHi    = (sr.seizureRisk * _passMult).toFixed(1);
            const _riskLo    = (sr.seizureRisk * _passMult * 0.35).toFixed(1);
            const _riskTxt   = _vetri === 0   ? `${_riskHi}%`
                             : _allVetri      ? `${_riskLo}%`
                                              : `${_riskLo}% – ${_riskHi}%`;
            const _vetriNote = _fleet.length === 0 ? ''
                             : _vetri === 0  ? ` <span style="color:#e0922e">⚠ Nessuna auto con Vetri Oscurati (−65%)</span>`
                             : _allVetri     ? ` <span style="color:#1aa06a">−65% Vetri Oscurati su tutta la flotta</span>`
                                             : ` <span style="color:#e0922e">−65% solo con ${_vetri} auto su ${_fleet.length}: conta quella assegnata all'autista</span>`;
            html += `</div>
            <div style="font-size:10px;color:#db5746;margin-bottom:4px">Pagamento: <b style="color:#db5746">×5 tariffa</b> — Rischio sequestro: <b style="color:#db5746">${_riskTxt}</b> <span style="color:#6b7280">(base ${sr.seizureRisk}%)</span>${_vetriNote}</div>
            ${_training ? `<div style="font-size:10px;color:#1aa06a;margin-bottom:4px">Corso di Guida Sicura: l'85% dei posti di blocco viene superato senza controllo.</div>` : ''}
            <div style="font-size:10px;color:#6b7280;margin-bottom:12px">Un checkpoint della polizia verrà posizionato sulla rotta. Operazione ad altissimo rischio.</div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('acceptShadowMission', [e.id])} style="background:#fff5f3;border:1px solid #e7a79c;color:#db5746;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">🔴 ACCETTA RISCHIO (×5)</button>
                <button ${ceAct('resolveEmail', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">Rifiuta</button>
            </div>`;

        } else if (e.type === 'poaching') {
            html += `</div>
            <div style="font-size:10px;color:#e0922e;margin-bottom:12px">${CE_Sec.escHtml(e.rivalName)} offre a <b>${CE_Sec.escHtml(e.driverName)}</b> €${e.counterOffer.toLocaleString()}/mese. Vuoi pareggiare l'offerta?</div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('respondPoaching', [e.id, true])}  style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s">✅ Pareggia (€${e.counterOffer.toLocaleString()}/mese)</button>
                <button ${ceAct('respondPoaching', [e.id, false])} style="background:#0d1117;border:1px solid #cfe0f1;color:#db5746;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">❌ Lascialo andare</button>
            </div>`;

        } else if (e.type === 'grey_market') {
            html += `</div>
            <div style="font-size:10px;color:#6b7280;margin-bottom:12px">Tariffa tripla. Se la polizia ti ferma durante questa corsa il veicolo viene sequestrato per 7 giorni.</div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('acceptGreyMarket', [e.id])} style="background:#fff5f3;border:1px solid #e7a79c;color:#db5746;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">⚠ Accetta Rischio</button>
                <button ${ceAct('resolveEmail', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">Rifiuta</button>
            </div>`;

        } else if (e.type === 'diamond') {
            html += `</div>
            <div style="font-size:10px;margin-bottom:8px" style="color:#c79a2a">Contratto Diamond — €${(e.offer||0).toLocaleString()}</div>
            <div style="font-size:9px;color:#6b7280;margin-bottom:12px">Richiede asset Lifestyle specifici e reputazione minima. Pagamento in contanti alla consegna.</div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('acceptDiamondContract', [e.id])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s" style="background:linear-gradient(135deg,#92400e,#78350f);border-color:#c79a2a">🔶 ACCETTA</button>
                <button ${ceAct('resolveEmail', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">Declina</button>
            </div>`;

        } else if (e.type === 'broker_result') {
            const pl = e.brokerGain >= 0 ? `+€${e.brokerGain.toLocaleString()}` : `−€${Math.abs(e.brokerGain).toLocaleString()}`;
            const plColor = e.brokerGain >= 0 ? '#1aa06a' : '#db5746';
            html += `</div>
            <div style="font-size:10px;margin-bottom:8px">Capitale investito: <b>€${(e.brokerCapital||0).toLocaleString()}</b> · Profilo: ${CE_Sec.escHtml(e.brokerRisk||'')}</div>
            <div style="font-size:12px;font-weight:700;margin-bottom:12px" style="color:${plColor}">${pl}</div>
            <button ${ceAct('collectBrokerEmail', [e.id, e.brokerGain||0])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;width:100%">OK, Incassato</button>`;

        } else if (e.type === 'driver_msg') {
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:12px;line-height:1.5">${CE_Sec.escHtml(e.body || e.subject)}</div>
            <button ${ceAct('resolveEmail', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;width:100%">Ho capito</button>`;

        } else if (e.type === 'info') {
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:12px">${CE_Sec.escHtml(e.subject)}</div>
            <button ${ceAct('resolveEmail', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;width:100%">OK, Capito</button>`;

        // ── VIP CLIENTS ──────────────────────────────────────────────────────
        } else if (e.type === 'vip_grigori') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:8px">🕵️ Richiede: <b>Majestic Spirit o E-Specter ≥95%</b> e autista Lv2+.<br>Rotta: ${from} → ${to} — <b style="color:#c79a2a">€${(d.price||0).toLocaleString()}</b> + mancia €15.000</div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('acceptVipGrigori', [e.id])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s">🕵️ Accetta (VVIP)</button>
                <button ${ceAct('resolveEmail', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">Declina</button>
            </div>`;

        } else if (e.type === 'vip_grigori_event') {
            const cost = (e.vipEventData||{}).cost||500;
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:12px">Durante il trasporto Grigori ha richiesto un rerouting di emergenza per motivi di sicurezza. Come gestite la situazione?</div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('vipGrigoriEventAccept', [e.id])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s">✅ Soddisfa (−€${cost})</button>
                <button ${ceAct('vipGrigoriEventDecline', [e.id])} style="background:#0d1117;border:1px solid #cfe0f1;color:#db5746;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">❌ Ignora (−0.1★)</button>
            </div>`;

        } else if (e.type === 'vip_strata') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:8px">💼 Richiede: <b>Berlina Business (Stellar E/S/Q)</b> ≥70%.<br>Rotta: ${from} → ${to} — <b style="color:#c79a2a">€${(d.price||0).toLocaleString()}</b><br><span style="color:#e0922e">⚠ 20% rischio chargeback · 5-streak = buff +10% guadagni</span></div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('acceptVipStrata', [e.id])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s">💼 Accetta B2B</button>
                <button ${ceAct('resolveEmail', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">Declina</button>
            </div>`;

        } else if (e.type === 'vip_platinum') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            const vCount = (gameState.fleet||[]).filter(c=>c.vehicleClass==='stellar_v_carr'&&(c.condition||0)>=70&&!c.outOfService&&!c.isSeized).length;
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:8px">⭐ Richiede: <b>2× Stellar V-Carrier ≥70%</b> (disponibili: ${vCount}/2).<br>Rotta: ${from} → ${to} — <b style="color:#c79a2a">€${(d.price||0).toLocaleString()}</b><br><span style="color:#e0922e">40% paparazzi event · Hype buff +20% mance</span></div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('acceptVipPlatinum', [e.id])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s">⭐ Accetta (Diva)</button>
                <button ${ceAct('resolveEmail', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">Declina</button>
            </div>`;

        } else if (e.type === 'vip_platinum_event') {
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:12px">📸 Paparazzi intercettati sul percorso. Come vuoi gestire la situazione?</div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('vipPlatinumEventBlock', [e.id])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s">🚫 Blocca (−€300 + buff)</button>
                <button ${ceAct('vipPlatinumEventAllow', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">📸 Lascia scattare (+0.15★)</button>
            </div>`;

        } else if (e.type === 'vip_onorevole') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:8px">🏛️ Richiede: <b>Berlina Discreta (no EV) Lv2+ autista</b>.<br>Rotta: ${from} → ${to} — <b style="color:#c79a2a">€${(d.price||0).toLocaleString()}</b><br>Compenso: +1 Gettone Politico · 10% GdF check</div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('acceptVipOnorevole', [e.id])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s">🏛️ Accetta</button>
                <button ${ceAct('resolveEmail', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">Declina</button>
            </div>`;

        } else if (e.type === 'vip_onorevole_event') {
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:12px">🚔 La Guardia di Finanza ha fermato il veicolo durante il trasporto istituzionale. Come procedi?</div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('vipOnorevoleEventCopera', [e.id])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s">🤝 Coopera (−Token o −€1k)</button>
                <button ${ceAct('vipOnorevoleEventResisti', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">⚖️ Resisti (+1 Token, −0.05★)</button>
            </div>`;

        } else if (e.type === 'vip_emiro') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            const validVcSet = ['majestic_spirit','majestic_e_specter','stellar_s_imp','stellar_g_over','volt_s_hyper'];
            const readyCount = (gameState.fleet||[]).filter(c=>validVcSet.includes(c.vehicleClass)&&(c.condition||0)>=80&&!c.outOfService&&!c.isSeized).length;
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:8px">👑 Richiede: <b>4 veicoli VIP/Ultra ≥80%</b> (disponibili: ${readyCount}/4).<br>Rotta: ${from} → ${to} — <b style="color:#c79a2a">€${(d.price||0).toLocaleString()}</b><br>Bonus: blocco prezzo carburante 48h · 30% shopping +€5k</div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('acceptVipEmiro', [e.id])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s">👑 Accetta Convoglio</button>
                <button ${ceAct('resolveEmail', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">Declina</button>
            </div>`;

        } else if (e.type === 'vip_golden') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:8px">⚽ Richiede: <b>Majestic Spirit / Volt S-Hyper / E-Specter ≥80%</b>.<br>Rotta: ${from} → ${to} — <b style="color:#c79a2a">€${(d.price||0).toLocaleString()}</b><br><span style="color:#e0922e">60% danno auto · Tutti autisti −20 stress dopo la corsa</span></div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('acceptVipGolden', [e.id])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s">⚽ Accetta</button>
                <button ${ceAct('resolveEmail', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">Declina</button>
            </div>`;

        } else if (e.type === 'vip_techbro') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:8px">⚡ Richiede: <b>EV ≥90% condizione · autista stress ≤20%</b>.<br>Rotta: ${from} → ${to} — <b style="color:#c79a2a">€${(d.price||0).toLocaleString()}</b><br>Bonus: routing buff +5% velocità per 24h</div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('acceptVipTechBro', [e.id])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s">⚡ Accetta</button>
                <button ${ceAct('resolveEmail', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">Declina</button>
            </div>`;

        } else if (e.type === 'vip_garante') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:8px">⚠️ Richiede: <b>G-Overlord o Majestic Spirit ≥85% (no EV)</b>.<br>Rotta: ${from} → ${to} — <b style="color:#c79a2a">€${(d.price||0).toLocaleString()}</b><br><span style="color:#db5746">25% posto di blocco · Autista +50 stress · Multa −50% per 24h</span></div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('acceptVipGarante', [e.id])} style="background:#fff5f3;border:1px solid #e7a79c;color:#db5746;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">⚠️ Accetta (Rischio)</button>
                <button ${ceAct('resolveEmail', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">Declina</button>
            </div>`;

        } else if (e.type === 'vip_garante_event') {
            const fine = (e.vipEventData||{}).fine||2000;
            const disc = typeof window._getBuffValue === 'function' ? window._getBuffValue('fine_discount') : 0;
            const finalFine = Math.floor(fine * (1 - disc/100));
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:12px">🚔 Posto di blocco durante il trasporto. Multa stimata: €${finalFine.toLocaleString()}${disc>0?` (−${disc}% buff Il Garante)`:''}</div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('vipGaranteEventPaga', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">💸 Paga (€${finalFine.toLocaleString()})</button>
                <button ${ceAct('vipGaranteEventIntimidisci', [e.id])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s">😤 Intimidisci (Token/Rischio)</button>
            </div>`;

        } else if (e.type === 'vip_wedding') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            const majesticOk = (gameState.fleet||[]).some(c=>c.vehicleClass==='majestic_spirit'&&c.condition>=100&&!c.outOfService&&!c.isSeized);
            const vCount = (gameState.fleet||[]).filter(c=>c.vehicleClass==='stellar_v_carr'&&c.condition>=100&&!c.outOfService&&!c.isSeized).length;
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:8px">💍 Richiede: <b>Majestic Spirit 100%</b> ${majesticOk?'✅':'❌'} <b>+ 2× V-Carrier 100%</b> (${vCount}/2).<br>Rotta: ${from} → ${to} — <b style="color:#c79a2a">€${(d.price||0).toLocaleString()}</b><br>Saldo posticipato · 30% drama · VIP queue +25% 24h</div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('acceptVipWedding', [e.id])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s">💍 Accetta Corteo</button>
                <button ${ceAct('resolveEmail', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">Declina</button>
            </div>`;

        } else if (e.type === 'vip_wedding_event') {
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:12px">💥 Drama nuziale: uno sposo ha abbandonato la cerimonia. White Lace chiede il tuo intervento immediato.</div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('vipWeddingEventGestisci', [e.id])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s">💍 Gestisci (−€800 +€2k)</button>
                <button ${ceAct('vipWeddingEventIgnora', [e.id])} style="background:#0d1117;border:1px solid #cfe0f1;color:#db5746;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">❌ Ignora (−0.2★)</button>
            </div>`;

        } else if (e.type === 'vip_wedding_payment') {
            const bonus = (e.vipEventData||{}).bonus||0;
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:12px">💍 Saldo posticipato White Lace Weddings: <b style="color:#1aa06a">+€${bonus.toLocaleString()}</b></div>
            <button ${ceAct('vipWeddingPaymentCollect', [e.id])} style="width:100%;padding:7px;font-size:9px;font-weight:700;cursor:pointer;background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px;transition:opacity .15s">💰 Incassa Saldo</button>`;

        } else if (e.type === 'vip_erede') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            const hasKasko = typeof hasInvestment === 'function' && hasInvestment('inv_kasko');
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:8px">💸 Richiede: <b>Volt S-Hyper / Majestic ≥80%</b> + Kasko ${hasKasko?'✅':'❌ MANCANTE'}.<br>Rotta: ${from} → ${to} — <b style="color:#c79a2a">€${(d.price||0).toLocaleString()}</b><br><span style="color:#e0922e">30% incidente (Kasko protegge) · 30% viral +100% tip</span></div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('acceptVipErede', [e.id])} style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1;transition:opacity .15s" ${!hasKasko?'disabled style="opacity:0.4"':''}>💸 Accetta</button>
                <button ${ceAct('resolveEmail', [e.id])} style="background:#0d1117;border:1px solid #21262d;color:#58a6ff;padding:5px 12px;border-radius:4px;font-size:9px;cursor:pointer;flex:1">Declina</button>
            </div>`;

        } else {
            html += `</div>
            <div style="font-size:10px;color:#4d6480;margin-bottom:12px">Appalto potenziale da €${(e.offer||0).toLocaleString()}.</div>
            <div style="display:flex;gap:8px">
                <button ${ceAct('negotiateEmail', [e.id, e.offer||0])} style="flex:1;padding:7px;font-size:10px;font-weight:700;cursor:pointer;background:#1a1608;border:1px solid #b8962b;color:#d4af37;border-radius:4px;transition:opacity .15s">Accetta</button>
                <button ${ceAct('negotiateEmail', [e.id, Math.floor((e.offer||0)*1.3)])} style="flex:1;padding:7px;font-size:10px;font-weight:700;cursor:pointer;background:#161b22;border:1px solid #21262d;color:#6b7280;border-radius:4px;transition:opacity .15s">Rilancia</button>
            </div>`;
        }

        html += sigHtml;
        html += `</div>`;  // close .email-card
    });

    container.innerHTML = html + `</div></div>`;
}
