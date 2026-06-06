'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   nemesis.js — Chauffeur Empire · Espansione 11: Sistema Nemesi VIP
   ═══════════════════════════════════════════════════════════════════════════
   gameState.vipNemeses = {
       vipId: {
           name:       string,   // nome VIP
           level:      1|2,      // 1=freddo, 2=guerra aperta
           anger:      0-100,    // "rabbia" VIP (scende col tempo o corruzione)
           lastFunded: gameHour, // ultima volta che ha finanziato un rivale
           reason:     string    // motivo (scaduta|fallita)
       }
   }
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Aggiunge un VIP alla lista nemici ─────────────────────────────────────
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

    // Push email di minaccia
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
                ? `${vipName} non dimentica. A partire da oggi finanzierà attivamente le tue concorrenti per vederti fallire. Paga una compensazione o affronta le conseguenze.`
                : `${vipName} si aspettava di meglio. Se non provvederai a rimediare, inizierà a supportare le agenzie rivali.`
        });
    }
    if (typeof saveGame === 'function') saveGame();
};

// ── Tick nemesi — chiamato ogni N game ticks dal loop principale ──────────
window._nemesisTick = function() {
    if (!gameState.vipNemeses) return;
    const nowHour = (gameState.day || 1) * 24 + (gameState.hour || 0);

    Object.entries(gameState.vipNemeses).forEach(([vipId, nem]) => {
        if (nem.anger <= 0) { delete gameState.vipNemeses[vipId]; return; }

        // Rabbia cala nel tempo (−1 ogni 12 ore di gioco)
        nem.anger = Math.max(0, nem.anger - 0.08);
        nem.level = nem.anger >= 60 ? 2 : nem.anger >= 20 ? 1 : 0;
        if (nem.level === 0) { delete gameState.vipNemeses[vipId]; return; }

        // Livello 2: finanzia un rivale ogni 48 ore di gioco
        if (nem.level >= 2 && (nowHour - (nem.lastFunded || 0)) >= 48) {
            _nemesisFundRival(vipId, nem);
        }
    });
};

async function _nemesisFundRival(vipId, nem) {
    if (!window.supabaseClient) return;

    // Cerca un rivale dalla leaderboard
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

// ── Corruzione VIP (pace) ────────────────────────────────────────────────
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
        gameState.cash -= bribe;
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
        if (typeof showNotification === 'function') showNotification('Errore corruzione: ' + (e.message || e), 'error');
    }
};

// ── UI — Tab Nemesi ───────────────────────────────────────────────────────
window.renderTabNemesis = function() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    const nemeses = Object.entries(gameState.vipNemeses || {});

    const criticalNem = nemeses.filter(([, n]) => n.level >= 2).length;
    const _nemBadge = criticalNem > 0
        ? `<span style="font-size:9px;font-weight:700;color:#db5746;background:rgba(248,81,73,0.12);border:1px solid rgba(248,81,73,0.3);border-radius:4px;padding:3px 8px">⚠ GUERRA APERTA</span>`
        : nemeses.length > 0
            ? `<span style="font-size:9px;font-weight:700;color:#e0922e;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);border-radius:4px;padding:3px 8px">${nemeses.length} Ostili</span>`
            : `<span style="font-size:9px;font-weight:700;color:#1aa06a;background:rgba(63,185,80,0.12);border:1px solid rgba(63,185,80,0.3);border-radius:4px;padding:3px 8px">✓ OK</span>`;
    const _nemEmpty = `<div style="text-align:center;padding:40px 0"><div style="font-size:32px;margin-bottom:10px">😇</div><div style="font-size:14px;font-weight:600;color:#e6edf3">Nessun nemico</div><div style="font-size:11px;color:#6b7280;margin-top:4px">Continua a non deludere i VIP.</div></div>`;
    container.innerHTML = `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #21262d;display:flex;align-items:flex-start;justify-content:space-between">
        <div>
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">VIP Relations</div>
            <div style="font-size:20px;font-weight:700;color:#e6edf3">Lista Nemici</div>
            <div style="font-size:11px;color:#6b7280;margin-top:4px">${nemeses.length === 0 ? 'Nessun VIP deluso — ottimo!' : `${nemeses.length} VIP ostili · ${criticalNem > 0 ? criticalNem + ' guerra aperta' : 'Gestibile'}`}</div>
        </div>
        ${_nemBadge}
    </div>
    ${nemeses.length === 0 ? _nemEmpty : nemeses.map(([vipId, nem]) => _renderNemesisCard(vipId, nem)).join('')}
    <div style="background:rgba(88,166,255,0.06);border:1px solid rgba(88,166,255,0.18);border-radius:6px;padding:14px 16px;margin-top:16px;font-size:11px;color:#79c0ff;line-height:1.6">
        <strong>Come farsi perdonare:</strong> Paga una corruzione (riduci la rabbia) oppure usa
        l'<strong>Agenzia Ombra</strong> → Sabotaggio per danneggiare i rivali che hanno ricevuto fondi,
        dimostrando che nessuno può servire il VIP meglio di te.
    </div>`;
};

function _renderNemesisCard(vipId, nem) {
    const isWar    = nem.level >= 2;
    const angerBar = Math.round(nem.anger);
    const bribeAmt = Math.floor(5000 + (nem.anger / 100) * 45000);
    const borderC  = isWar ? 'rgba(248,81,73,0.3)' : 'rgba(245,158,11,0.25)';
    const bgC      = isWar ? 'rgba(248,81,73,0.04)' : 'rgba(245,158,11,0.04)';
    const barC     = nem.anger >= 60 ? '#db5746' : '#e0922e';
    const lvlColor = isWar ? '#db5746' : '#e0922e';
    const lvlBg    = isWar ? 'rgba(248,81,73,0.12)' : 'rgba(245,158,11,0.12)';

    return `
    <div style="background:${bgC};border:1px solid ${borderC};border-radius:6px;padding:16px;margin-bottom:12px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
            <div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                    <span style="font-size:18px">${isWar ? '🔥' : '😠'}</span>
                    <span style="font-size:13px;font-weight:700;color:#e6edf3">${nem.name}</span>
                </div>
                <div style="font-size:10px;color:#6b7280">${isWar ? '⚠️ GUERRA APERTA — finanzia i tuoi rivali' : '😤 Deluso — potrebbe agire presto'}</div>
            </div>
            <span style="font-size:9px;font-weight:700;color:${lvlColor};background:${lvlBg};border:1px solid ${lvlColor};border-radius:10px;padding:3px 8px">Livello ${nem.level}</span>
        </div>

        <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:9px;color:#6b7280;margin-bottom:4px">
                <span>Rabbia</span><span>${angerBar}/100</span>
            </div>
            <div style="height:6px;border-radius:3px;background:#21262d;overflow:hidden">
                <div style="height:100%;width:${angerBar}%;background:${barC};border-radius:3px;transition:width .3s"></div>
            </div>
        </div>

        <div style="font-size:10px;color:#6b7280;margin-bottom:14px">
            Motivo: <span style="color:#e6edf3">${nem.reason === 'fallita' ? 'Corsa fallita / ritardo' : 'Richiesta ignorata'}</span>
        </div>

        <div style="display:flex;gap:8px">
            <button onclick="window._nemesisBribeVip('${vipId}')"
                style="flex:1;padding:8px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.3);color:#c79a2a;transition:opacity .15s"
                onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
                💰 Corrompi (€${bribeAmt.toLocaleString('it-IT')})
            </button>
            <button onclick="window.hubNavigate('shadow')"
                style="flex:1;padding:8px;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;background:#161b22;border:1px solid #21262d;color:#6b7280;transition:opacity .15s"
                onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
                🕵️ Agenzia Ombra
            </button>
        </div>
    </div>`;
}
