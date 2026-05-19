'use strict';
/* ================================================================
   ui-emails.js — Chauffeur Empire
   3-tab Inbox CEO email client UI.
   Loaded AFTER dispatcher.js (needs: gameState, window._inboxTab,
   EMAIL_TEMPLATES, negotiateEmail, all game action globals)
   ================================================================ */

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
    let html = DS.header({
        eyebrow: 'Inbox CEO',
        title:   'Comunicazioni Riservate',
        subtitle: totalUnread > 0 ? `${totalUnread} messaggi non letti` : 'Nessun nuovo messaggio',
        actions: totalUnread > 0 ? DS.pill(String(totalUnread), 'red', true) : '',
    });

    // ── 3-Tab bar ─────────────────────────────────────────────────────────────
    html += `<div class="inbox-tabs">`;
    html += `<button class="inbox-tab-btn${window._inboxTab==='urgenti'?' active':''}" onclick="window._inboxTab='urgenti';renderTabEmails();">🚨 Urgenti${countUrgenti>0?`<span class="inbox-tab-badge">${countUrgenti}</span>`:''}</button>`;
    html += `<button class="inbox-tab-btn${window._inboxTab==='vip'?' active':''}" onclick="window._inboxTab='vip';renderTabEmails();">👑 VIP &amp; Diamond${countVip>0?`<span class="inbox-tab-badge badge-purple">${countVip}</span>`:''}</button>`;
    html += `<button class="inbox-tab-btn${window._inboxTab==='comunicazioni'?' active':''}" onclick="window._inboxTab='comunicazioni';renderTabEmails();">📋 Comunicazioni${countComm>0?`<span class="inbox-tab-badge badge-blue">${countComm}</span>`:''}</button>`;
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
        html += `<div class="ds-card" style="border-color:rgba(34,197,94,0.3);margin-bottom:12px;font-size:10px;color:var(--green);display:flex;flex-wrap:wrap;gap:8px">
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
        html += DS.empty({ icon: emptyIcon, title: emptyTitle });
        container.innerHTML = html;
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
            ? `<div class="email-expiry"><span class="text-${hoursLeft <= 3 ? 'red' : 'orange'}-400">⏰ Scade in ${hoursLeft}h</span></div>`
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
            ? `<div class="email-signature">${e.signature}</div>`
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
        html += `<div class="email-subject">${e.subject}</div>`;
        html += expiryHtml;
        html += bodyHtml;

        // ── Per-type content & action buttons ─────────────────────────────────
        html += `<div class="email-actions">`;

        if (e.type === 'ceo_event') {
            html += `</div><div class="text-[10px] text-gray-300 mb-3">${e.eventData.desc}</div><div class="flex flex-col gap-2">`;
            e.eventData.choices.forEach((c, idx) => {
                html += `<button onclick="negotiateEmail(${e.id}, 0, ${idx})" class="btn-gold !text-[9px] !text-left">${c.text}</button>`;
            });
            html += `</div>`;

        } else if (e.type === 'shadow') {
            const sr = e.shadowData;
            const hasVetri = gameState.fleet.some(c => (c.upgrades||[]).includes('vetri_oscurati'));
            html += `</div>
            <div class="text-[10px] text-red-200 mb-1">Pagamento: <b style="color:#ff4060">×5 tariffa</b> — Rischio sequestro: <b style="color:#ff4060">${sr.seizureRisk}%</b>${hasVetri ? ' <span style="color:#22c55e">(−65% con Vetri Oscurati)</span>' : ' <span style="color:#f59e0b">⚠ Installa Vetri Oscurati</span>'}</div>
            <div class="text-[10px] text-gray-400 mb-3">Un checkpoint della polizia verrà posizionato sulla rotta. Operazione ad altissimo rischio.</div>
            <div class="flex gap-2">
                <button onclick="acceptShadowMission(${e.id})" class="btn-gold !bg-red-950/60 !text-red-200 !border !border-red-600/60 flex-1">🔴 ACCETTA RISCHIO (×5)</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved'; renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Rifiuta</button>
            </div>`;

        } else if (e.type === 'poaching') {
            html += `</div>
            <div class="text-[10px] text-orange-300 mb-3">${e.rivalName} offre a <b>${e.driverName}</b> €${e.counterOffer.toLocaleString()}/mese. Vuoi pareggiare l'offerta?</div>
            <div class="flex gap-2">
                <button onclick="respondPoaching(${e.id}, true)"  class="btn-gold flex-1 !text-[9px]">✅ Pareggia (€${e.counterOffer.toLocaleString()}/mese)</button>
                <button onclick="respondPoaching(${e.id}, false)" class="btn-blue flex-1 !text-[9px] !text-red-300">❌ Lascialo andare</button>
            </div>`;

        } else if (e.type === 'grey_market') {
            html += `</div>
            <div class="text-[10px] text-gray-400 mb-3">Tariffa tripla. Se la polizia ti ferma durante questa corsa il veicolo viene sequestrato per 7 giorni.</div>
            <div class="flex gap-2">
                <button onclick="acceptGreyMarket(${e.id})" class="btn-gold !bg-red-900/40 !text-red-300 !border !border-red-700/50 flex-1">⚠ Accetta Rischio</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved'; renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Rifiuta</button>
            </div>`;

        } else if (e.type === 'diamond') {
            html += `</div>
            <div class="text-[10px] mb-2" style="color:#d4af37">Contratto Diamond — €${(e.offer||0).toLocaleString()}</div>
            <div class="text-[9px] text-gray-400 mb-3">Richiede asset Lifestyle specifici e reputazione minima. Pagamento in contanti alla consegna.</div>
            <div class="flex gap-2">
                <button onclick="acceptDiamondContract(${e.id})" class="btn-gold flex-1 !text-[9px]" style="background:linear-gradient(135deg,#92400e,#78350f);border-color:#d4af37">🔶 ACCETTA</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved'; renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'broker_result') {
            const pl = e.brokerGain >= 0 ? `+€${e.brokerGain.toLocaleString()}` : `−€${Math.abs(e.brokerGain).toLocaleString()}`;
            const plColor = e.brokerGain >= 0 ? '#22c55e' : '#ef4444';
            html += `</div>
            <div class="text-[10px] mb-2">Capitale investito: <b>€${(e.brokerCapital||0).toLocaleString()}</b> · Profilo: ${e.brokerRisk||''}</div>
            <div class="text-sm font-bold mb-3" style="color:${plColor}">${pl}</div>
            <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved'; if(typeof spawnMoneyParticles==='function'){const r=this.getBoundingClientRect();spawnMoneyParticles(r.left+r.width/2,r.top,${e.brokerGain||0});} renderTabEmails();" class="btn-blue w-full !text-[9px]">OK, Incassato</button>`;

        } else if (e.type === 'driver_msg') {
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-3 leading-relaxed">${e.body || e.subject}</div>
            <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved'; renderTabEmails();" class="btn-blue w-full !text-[9px]">Ho capito</button>`;

        } else if (e.type === 'info') {
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-3">${e.subject}</div>
            <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved'; renderTabEmails();" class="btn-blue w-full !text-[9px]">OK, Capito</button>`;

        // ── VIP CLIENTS ──────────────────────────────────────────────────────
        } else if (e.type === 'vip_grigori') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-2">🕵️ Richiede: <b>Majestic Spirit o E-Specter ≥95%</b> e autista Lv2+.<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b> + mancia €15.000</div>
            <div class="flex gap-2">
                <button onclick="acceptVipGrigori(${e.id})" class="btn-gold flex-1 !text-[9px]">🕵️ Accetta (VVIP)</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_grigori_event') {
            const cost = (e.vipEventData||{}).cost||500;
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-3">Durante il trasporto Grigori ha richiesto un rerouting di emergenza per motivi di sicurezza. Come gestite la situazione?</div>
            <div class="flex gap-2">
                <button onclick="vipGrigoriEventAccept(${e.id})" class="btn-gold flex-1 !text-[9px]">✅ Soddisfa (−€${cost})</button>
                <button onclick="vipGrigoriEventDecline(${e.id})" class="btn-blue flex-1 !text-[9px] !text-red-300">❌ Ignora (−0.1★)</button>
            </div>`;

        } else if (e.type === 'vip_strata') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-2">💼 Richiede: <b>Berlina Business (Stellar E/S/Q)</b> ≥70%.<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br><span class="text-orange-300">⚠ 20% rischio chargeback · 5-streak = buff +10% guadagni</span></div>
            <div class="flex gap-2">
                <button onclick="acceptVipStrata(${e.id})" class="btn-gold flex-1 !text-[9px]">💼 Accetta B2B</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_platinum') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            const vCount = (gameState.fleet||[]).filter(c=>c.vehicleClass==='stellar_v_carr'&&(c.condition||0)>=70&&!c.outOfService&&!c.isSeized).length;
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-2">⭐ Richiede: <b>2× Stellar V-Carrier ≥70%</b> (disponibili: ${vCount}/2).<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br><span class="text-orange-300">40% paparazzi event · Hype buff +20% mance</span></div>
            <div class="flex gap-2">
                <button onclick="acceptVipPlatinum(${e.id})" class="btn-gold flex-1 !text-[9px]">⭐ Accetta (Diva)</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_platinum_event') {
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-3">📸 Paparazzi intercettati sul percorso. Come vuoi gestire la situazione?</div>
            <div class="flex gap-2">
                <button onclick="vipPlatinumEventBlock(${e.id})" class="btn-gold flex-1 !text-[9px]">🚫 Blocca (−€300 + buff)</button>
                <button onclick="vipPlatinumEventAllow(${e.id})" class="btn-blue flex-1 !text-[9px]">📸 Lascia scattare (+0.15★)</button>
            </div>`;

        } else if (e.type === 'vip_onorevole') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-2">🏛️ Richiede: <b>Berlina Discreta (no EV) Lv2+ autista</b>.<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br>Compenso: +1 Gettone Politico · 10% GdF check</div>
            <div class="flex gap-2">
                <button onclick="acceptVipOnorevole(${e.id})" class="btn-gold flex-1 !text-[9px]">🏛️ Accetta</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_onorevole_event') {
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-3">🚔 La Guardia di Finanza ha fermato il veicolo durante il trasporto istituzionale. Come procedi?</div>
            <div class="flex gap-2">
                <button onclick="vipOnorevoleEventCopera(${e.id})" class="btn-gold flex-1 !text-[9px]">🤝 Coopera (−Token o −€1k)</button>
                <button onclick="vipOnorevoleEventResisti(${e.id})" class="btn-blue flex-1 !text-[9px]">⚖️ Resisti (+1 Token, −0.05★)</button>
            </div>`;

        } else if (e.type === 'vip_emiro') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            const validVcSet = ['majestic_spirit','majestic_e_specter','stellar_s_imp','stellar_g_over','volt_s_hyper'];
            const readyCount = (gameState.fleet||[]).filter(c=>validVcSet.includes(c.vehicleClass)&&(c.condition||0)>=80&&!c.outOfService&&!c.isSeized).length;
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-2">👑 Richiede: <b>4 veicoli VIP/Ultra ≥80%</b> (disponibili: ${readyCount}/4).<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br>Bonus: blocco prezzo carburante 48h · 30% shopping +€5k</div>
            <div class="flex gap-2">
                <button onclick="acceptVipEmiro(${e.id})" class="btn-gold flex-1 !text-[9px]">👑 Accetta Convoglio</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_golden') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-2">⚽ Richiede: <b>Majestic Spirit / Volt S-Hyper / E-Specter ≥80%</b>.<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br><span class="text-orange-300">60% danno auto · Tutti autisti −20 stress dopo la corsa</span></div>
            <div class="flex gap-2">
                <button onclick="acceptVipGolden(${e.id})" class="btn-gold flex-1 !text-[9px]">⚽ Accetta</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_techbro') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-2">⚡ Richiede: <b>EV ≥90% condizione · autista stress ≤20%</b>.<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br>Bonus: routing buff +5% velocità per 24h</div>
            <div class="flex gap-2">
                <button onclick="acceptVipTechBro(${e.id})" class="btn-gold flex-1 !text-[9px]">⚡ Accetta</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_garante') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-2">⚠️ Richiede: <b>G-Overlord o Majestic Spirit ≥85% (no EV)</b>.<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br><span class="text-red-400">25% posto di blocco · Autista +50 stress · Multa −50% per 24h</span></div>
            <div class="flex gap-2">
                <button onclick="acceptVipGarante(${e.id})" class="btn-gold !bg-red-950/50 !border-red-700/50 flex-1 !text-[9px] !text-red-200">⚠️ Accetta (Rischio)</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_garante_event') {
            const fine = (e.vipEventData||{}).fine||2000;
            const disc = typeof window._getBuffValue === 'function' ? window._getBuffValue('fine_discount') : 0;
            const finalFine = Math.floor(fine * (1 - disc/100));
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-3">🚔 Posto di blocco durante il trasporto. Multa stimata: €${finalFine.toLocaleString()}${disc>0?` (−${disc}% buff Il Garante)`:''}</div>
            <div class="flex gap-2">
                <button onclick="vipGaranteEventPaga(${e.id})" class="btn-blue flex-1 !text-[9px]">💸 Paga (€${finalFine.toLocaleString()})</button>
                <button onclick="vipGaranteEventIntimidisci(${e.id})" class="btn-gold flex-1 !text-[9px]">😤 Intimidisci (Token/Rischio)</button>
            </div>`;

        } else if (e.type === 'vip_wedding') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            const majesticOk = (gameState.fleet||[]).some(c=>c.vehicleClass==='majestic_spirit'&&c.condition>=100&&!c.outOfService&&!c.isSeized);
            const vCount = (gameState.fleet||[]).filter(c=>c.vehicleClass==='stellar_v_carr'&&c.condition>=100&&!c.outOfService&&!c.isSeized).length;
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-2">💍 Richiede: <b>Majestic Spirit 100%</b> ${majesticOk?'✅':'❌'} <b>+ 2× V-Carrier 100%</b> (${vCount}/2).<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br>Saldo posticipato · 30% drama · VIP queue +25% 24h</div>
            <div class="flex gap-2">
                <button onclick="acceptVipWedding(${e.id})" class="btn-gold flex-1 !text-[9px]">💍 Accetta Corteo</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else if (e.type === 'vip_wedding_event') {
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-3">💥 Drama nuziale: uno sposo ha abbandonato la cerimonia. White Lace chiede il tuo intervento immediato.</div>
            <div class="flex gap-2">
                <button onclick="vipWeddingEventGestisci(${e.id})" class="btn-gold flex-1 !text-[9px]">💍 Gestisci (−€800 +€2k)</button>
                <button onclick="vipWeddingEventIgnora(${e.id})" class="btn-blue flex-1 !text-[9px] !text-red-300">❌ Ignora (−0.2★)</button>
            </div>`;

        } else if (e.type === 'vip_wedding_payment') {
            const bonus = (e.vipEventData||{}).bonus||0;
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-3">💍 Saldo posticipato White Lace Weddings: <b class="text-green-400">+€${bonus.toLocaleString()}</b></div>
            <button onclick="vipWeddingPaymentCollect(${e.id})" class="btn-gold w-full !text-[9px]">💰 Incassa Saldo</button>`;

        } else if (e.type === 'vip_erede') {
            const d = e.vipData||{};
            const from = POIS[d.fromId]?.name||d.fromId, to = POIS[d.toId]?.name||d.toId;
            const hasKasko = typeof hasInvestment === 'function' && hasInvestment('inv_kasko');
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-2">💸 Richiede: <b>Volt S-Hyper / Majestic ≥80%</b> + Kasko ${hasKasko?'✅':'❌ MANCANTE'}.<br>Rotta: ${from} → ${to} — <b class="text-yellow-300">€${(d.price||0).toLocaleString()}</b><br><span class="text-orange-300">30% incidente (Kasko protegge) · 30% viral +100% tip</span></div>
            <div class="flex gap-2">
                <button onclick="acceptVipErede(${e.id})" class="btn-gold flex-1 !text-[9px]" ${!hasKasko?'disabled style="opacity:0.4"':''}>💸 Accetta</button>
                <button onclick="(gameState.emails.find(x=>x.id==${e.id})||{}).status='resolved';renderTabEmails();" class="btn-blue flex-1 !text-[9px]">Declina</button>
            </div>`;

        } else {
            html += `</div>
            <div class="text-[10px] text-gray-300 mb-3">Appalto potenziale da €${(e.offer||0).toLocaleString()}.</div>
            <div class="flex gap-2">
                <button onclick="negotiateEmail(${e.id}, ${e.offer||0})" class="btn-gold flex-1">Accetta</button>
                <button onclick="negotiateEmail(${e.id}, ${Math.floor((e.offer||0)*1.3)})" class="btn-gold !bg-gray-800 flex-1">Rilancia</button>
            </div>`;
        }

        html += sigHtml;
        html += `</div>`;  // close .email-card
    });

    container.innerHTML = html;
}
