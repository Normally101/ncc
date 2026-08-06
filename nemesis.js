'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   nemesis.js — Chauffeur Empire · Espansione 11: Sistema Nemesi VIP
   ═══════════════════════════════════════════════════════════════════════════
   gameState.vipNemeses = {
       vipId: { name, level(1|2), anger(0-100), lastFunded, reason }
   }
   ═══════════════════════════════════════════════════════════════════════════ */

window._nemesisAddVip = function(vipId, vipName, reason) {
    if (!gameState.vipNemeses) gameState.vipNemeses = {};
    const existing = gameState.vipNemeses[vipId];
    if (existing) {
        existing.anger = Math.min(100, existing.anger + 30);
        existing.level = existing.anger >= 60 ? 2 : 1;
        existing.reason = reason;
    } else {
        gameState.vipNemeses[vipId] = {
            name: vipName,
            level: reason === 'fallita' ? 2 : 1,
            anger: reason === 'fallita' ? 60 : 30,
            lastFunded: 0,
            reason
        };
    }
    const n = gameState.vipNemeses[vipId];
    const msg = n.level >= 2
        ? `🦹 ${vipName} è FURIOSO con te! Finanzierà i tuoi rivali.`
        : `😠 ${vipName} è deluso. Potrebbe diventare il tuo nemico.`;
    if (typeof showNotification === 'function') showNotification(msg, 'error');
    if (typeof logToMap === 'function') logToMap(msg);

    if (typeof _vipPushEmail === 'function') {
        _vipPushEmail({
            id: gameState.nextId++,
            sender: vipName + ' — Avvocato',
            subject: n.level >= 2
                ? `⚠️ NEMESI: ${vipName} dichiara guerra alla tua agenzia`
                : `😠 ${vipName} insoddisfatto — conseguenze in arrivo`,
            type: 'nemesis_warning',
            status: 'unread',
            nemesisData: { vipId, vipName, level: n.level },
            body: n.level >= 2
                ? `${vipName} non dimentica. A partire da oggi finanzierà attivamente le tue concorrenti per vederti fallire.`
                : `${vipName} si aspettava di meglio. Se non provvederai a rimediare, inizierà a supportare le agenzie rivali.`
        });
    }
    if (typeof saveGame === 'function') saveGame();
};

window._nemesisTick = function() {
    if (!gameState.vipNemeses) return;
    const nowHour = (gameState.day || 1) * 24 + (gameState.hour || 0);

    Object.entries(gameState.vipNemeses).forEach(([vipId, nem]) => {
        if (nem.anger <= 0) { delete gameState.vipNemeses[vipId]; return; }
        nem.anger = Math.max(0, nem.anger - 0.08);
        nem.level = nem.anger >= 60 ? 2 : nem.anger >= 20 ? 1 : 0;
        if (nem.level === 0) { delete gameState.vipNemeses[vipId]; return; }
        if (nem.level >= 2 && (nowHour - (nem.lastFunded || 0)) >= 48) {
            _nemesisFundRival(vipId, nem);
        }
    });
};

async function _nemesisFundRival(vipId, nem) {
    if (!window.supabaseClient) return;

    let rival = null;
    try {
        const { data } = await window.supabaseClient
            .from('leaderboard')
            .select('user_id, company_name')
            .neq('user_id', window.currentUser?.id)
            .order('reputation', { ascending: false })
            .limit(10);
        if (data && data.length) {
            rival = data[Math.floor(Math.random() * Math.min(data.length, 5))];
        }
    } catch(e) { return; }

    if (!rival) return;

    const amount = Math.floor((20000 + Math.random() * 30000) * (nem.anger / 100));

    try {
        await window.supabaseClient.rpc('rpc_nemesis_fund_rival', {
            v_rival_user_id: rival.user_id,
            v_amount:        amount,
            v_vip_name:      nem.name
        });
        nem.lastFunded = (gameState.day || 1) * 24 + (gameState.hour || 0);

        const msg = `🦹 ${nem.name} ha finanziato ${rival.company_name} con €${amount.toLocaleString('it-IT')} per danneggiarti!`;
        if (typeof showNotification === 'function') showNotification(msg, 'error');
        if (typeof logToMap === 'function') logToMap(msg);
        if (typeof saveGame === 'function') saveGame();
    } catch(e) {}
}

window._nemesisBribeVip = async function(vipId) {
    const nem = (gameState.vipNemeses || {})[vipId];
    if (!nem) return;

    const bribe = Math.floor(5000 + (nem.anger / 100) * 45000);
    const ok = window.confirm(
        `Corrompere ${nem.name} per €${bribe.toLocaleString('it-IT')}?\n\n` +
        `Ridurrà la sua rabbia (attuale: ${Math.round(nem.anger)}/100).\n` +
        `Potrebbe non bastare a pacificarlo completamente.`
    );
    if (!ok) return;

    if ((gameState.cash || 0) < bribe) {
        if (typeof showNotification === 'function') showNotification('Fondi insufficienti per la corruzione!', 'error');
        return;
    }

    try {
        const { error } = await window.supabaseClient.rpc('rpc_nemesis_bribe_vip', { v_bribe_amount: bribe });
        if (error) throw error;
        // La RPC ha già scalato la cassa server-side: scaliamo in locale solo se
        // il sync Realtime non è attivo, altrimenti evitiamo doppia deduzione.
        if (!window.ServerState?.isReady()) gameState.cash -= bribe;
        nem.anger = Math.max(0, nem.anger - 40);
        nem.level = nem.anger >= 60 ? 2 : nem.anger >= 20 ? 1 : 0;
        if (nem.level === 0) delete gameState.vipNemeses[vipId];
        if (typeof showNotification === 'function') {
            showNotification(
                nem.level === 0
                    ? `🤝 ${nem.name} ha accettato la tua offerta. Pace fatta.`
                    : `😐 ${nem.name} ha preso i soldi ma resta diffidente.`,
                nem.level === 0 ? 'success' : 'warning'
            );
        }
        if (typeof saveGame === 'function') saveGame();
        if (typeof window.renderTabNemesis === 'function') window.renderTabNemesis();
    } catch(e) {
        if (typeof showNotification === 'function') showNotification(window.CE_Sec.userError('Corruzione non riuscita', e), 'error');
    }
};

window.renderTabNemesis = function() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    const nemeses = Object.entries(gameState.vipNemeses || {});
    const criticalNem = nemeses.filter(([, n]) => n.level >= 2).length;

    const statusBadge = criticalNem > 0
        ? `<span class="em-pill em-pill--red">⚠ GUERRA APERTA</span>`
        : nemeses.length > 0
            ? `<span class="em-pill em-pill--gold">${nemeses.length} Ostili</span>`
            : `<span class="em-pill em-pill--green">✓ OK</span>`;

    container.innerHTML = `<div class="em"><div class="em-page em-wrap">
        <div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--em-line);display:flex;align-items:flex-start;justify-content:space-between">
            <div>
                <div class="em-sec" style="margin-bottom:4px">VIP Relations</div>
                <div style="font-size:20px;font-weight:800;margin-bottom:2px">Lista Nemici</div>
                <div style="font-size:11px;color:var(--em-muted)">${nemeses.length === 0 ? 'Nessun VIP deluso — ottimo!' : `${nemeses.length} VIP ostili · ${criticalNem > 0 ? criticalNem + ' guerra aperta' : 'Gestibile'}`}</div>
            </div>
            ${statusBadge}
        </div>

        ${nemeses.length === 0
            ? `<div style="text-align:center;padding:40px 0">
                <div style="font-size:32px;margin-bottom:10px">😇</div>
                <div style="font-size:14px;font-weight:700;margin-bottom:4px">Nessun nemico</div>
                <div class="em-empty">Continua a non deludere i VIP.</div>
               </div>`
            : nemeses.map(([vipId, nem]) => _renderNemesisCard(vipId, nem)).join('')}

        <div class="em-card" style="padding:14px;margin-top:16px;border-color:rgba(47,116,192,.3)">
            <div style="font-size:11px;color:var(--em-blue);line-height:1.6">
                <strong>Come farsi perdonare:</strong> Paga una corruzione (riduci la rabbia) oppure usa
                l'<strong>Agenzia Ombra</strong> → Sabotaggio per danneggiare i rivali che hanno ricevuto fondi.
            </div>
        </div>
    </div></div>`;
};

function _renderNemesisCard(vipId, nem) {
    const isWar    = nem.level >= 2;
    const angerBar = Math.round(nem.anger);
    const bribeAmt = Math.floor(5000 + (nem.anger / 100) * 45000);
    const barC     = nem.anger >= 60 ? 'var(--em-red)' : 'var(--em-amber)';
    const borderC  = isWar ? 'rgba(219,87,70,.35)' : 'rgba(224,146,46,.3)';

    return `
    <div class="em-card" style="padding:14px;margin-bottom:10px;border-color:${borderC}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
            <div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
                    <span style="font-size:18px">${isWar ? '🔥' : '😠'}</span>
                    <span style="font-size:13px;font-weight:700">${nem.name}</span>
                </div>
                <div style="font-size:10px;color:var(--em-muted)">${isWar ? '⚠️ GUERRA APERTA — finanzia i tuoi rivali' : '😤 Deluso — potrebbe agire presto'}</div>
            </div>
            <span class="em-pill ${isWar ? 'em-pill--red' : 'em-pill--gold'}">Livello ${nem.level}</span>
        </div>

        <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--em-muted);margin-bottom:4px">
                <span>Rabbia</span><span>${angerBar}/100</span>
            </div>
            <div class="em-prog">
                <i style="width:${angerBar}%;background:${barC};transition:width .3s"></i>
            </div>
        </div>

        <div style="font-size:10px;color:var(--em-muted);margin-bottom:12px">
            Motivo: <span style="color:var(--em-ink)">${nem.reason === 'fallita' ? 'Corsa fallita / ritardo' : 'Richiesta ignorata'}</span>
        </div>

        <div style="display:flex;gap:8px">
            <button class="em-goldbtn" ${ceAct('_nemesisBribeVip', [vipId])} style="flex:1">
                💰 Corrompi (€${bribeAmt.toLocaleString('it-IT')})
            </button>
            <button class="em-ghbtn" ${ceAct('hubNavigate', ['shadow'])} style="flex:1">
                🕵️ Agenzia Ombra
            </button>
        </div>
    </div>`;
}
