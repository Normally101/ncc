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
    container.innerHTML = DS.header({
        eyebrow: 'VIP Relations',
        title:   'Lista Nemici',
        subtitle: nemeses.length === 0 ? 'Nessun VIP deluso — ottimo!' : `${nemeses.length} VIP ostili · ${criticalNem > 0 ? criticalNem + ' guerra aperta' : 'Gestibile'}`,
        actions: criticalNem > 0 ? DS.pill('⚠ GUERRA APERTA', 'red', true) : (nemeses.length > 0 ? DS.pill(nemeses.length + ' Ostili', 'orange') : DS.pill('✓ OK', 'green')),
    }) + `
    <div class="p-1">
      ${nemeses.length === 0 ? DS.empty({ icon:'😇', title:'Nessun nemico', body:'Continua a non deludere i VIP.' })
        : nemeses.map(([vipId, nem]) => _renderNemesisCard(vipId, nem)).join('')}

      <div class="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-xs text-blue-200">
        <strong>Come farsi perdonare:</strong> Paga una corruzione (riduci la rabbia) oppure usa
        l'<strong>Agenzia Ombra</strong> → Sabotaggio per danneggiare i rivali che hanno ricevuto fondi,
        dimostrando che nessuno può servire il VIP meglio di te.
      </div>
    </div>`;
};

function _renderNemesisCard(vipId, nem) {
    const levelColor = nem.level >= 2 ? 'border-red-500/40 bg-red-500/5' : 'border-orange-500/30 bg-orange-500/5';
    const angerBar   = Math.round(nem.anger);
    const barColor   = nem.anger >= 60 ? 'bg-red-500' : 'bg-orange-400';
    const bribeAmt   = Math.floor(5000 + (nem.anger / 100) * 45000);

    return `
    <div class="border ${levelColor} rounded-2xl p-5 mb-4">
      <div class="flex items-start justify-between mb-3">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-lg">${nem.level >= 2 ? '🔥' : '😠'}</span>
            <span class="text-white font-bold">${nem.name}</span>
          </div>
          <div class="text-xs text-gray-500 mt-0.5">
            ${nem.level >= 2 ? '⚠️ GUERRA APERTA — finanzia i tuoi rivali' : '😤 Deluso — potrebbe agire presto'}
          </div>
        </div>
        <span class="text-xs px-2 py-1 rounded-full font-bold ${nem.level >= 2 ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}">
          Livello ${nem.level}
        </span>
      </div>

      <div class="mb-3">
        <div class="flex justify-between text-xs text-gray-400 mb-1">
          <span>Rabbia</span>
          <span>${angerBar}/100</span>
        </div>
        <div class="w-full bg-white/10 rounded-full h-2">
          <div class="${barColor} h-2 rounded-full transition-all" style="width:${angerBar}%"></div>
        </div>
      </div>

      <div class="text-xs text-gray-500 mb-4">
        Motivo: <span class="text-gray-300">${nem.reason === 'fallita' ? 'Corsa fallita / ritardo' : 'Richiesta ignorata'}</span>
      </div>

      <div class="flex gap-2">
        <button onclick="window._nemesisBribeVip('${vipId}')"
          class="flex-1 py-2.5 rounded-xl text-xs font-bold
                 bg-yellow-500/20 border border-yellow-500/30 text-yellow-300
                 hover:bg-yellow-500/30 transition-colors cursor-pointer">
          💰 Corrompi (€${bribeAmt.toLocaleString('it-IT')})
        </button>
        <button onclick="window.hubNavigate('shadow')"
          class="flex-1 py-2.5 rounded-xl text-xs font-bold
                 bg-gray-500/20 border border-gray-500/30 text-gray-300
                 hover:bg-gray-500/30 transition-colors cursor-pointer">
          🕵️ Agenzia Ombra
        </button>
      </div>
    </div>`;
}
