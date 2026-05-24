'use strict';
/* ui-ranking.js — Chauffeur Empire
   renderTabRanking: classifica globale Supabase.
   Dipendenze: engine.js, dispatcher.js, design-system.js */

'use strict';
/* ui-meta.js — remaining renderTab* from dispatcher.js */

async function renderTabRanking() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    const renderToken = Symbol();
    renderTabRanking._token = renderToken;

    // Loading skeleton
    container.innerHTML = DS.header({
        eyebrow: 'MULTIPLAYER · LIVE',
        title:   'Classifica Globale',
        subtitle:'Caricamento dati in tempo reale...',
        actions: DS.btn({ label:'⟳ Aggiorna', color:'ghost', onclick:'renderTabRanking()', size:'sm' }),
    }) + DS.kpiStrip([
        { label:'La Tua Posizione', val:'—' },
        { label:'Patrimonio',       val:'—' },
        { label:'Reputazione',      val:'—' },
        { label:'Aziende Globali',  val:'—' },
    ]) + `<div style="display:flex;flex-direction:column;gap:8px">${Array(5).fill(`<div class="ds-skel" style="height:52px;border-radius:10px"></div>`).join('')}</div>`;

    // Fetch leaderboard from Supabase — columns match table exactly
    let rows = [];
    let fetchError = null;
    if (window.supabaseClient) {
        try {
            console.log('MULTIPLAYER: Caricamento classifica globale...');
            const { data, error } = await window.supabaseClient
                .from('leaderboard')
                .select('user_id,company_name,liquid_assets,reputation,fleet_count,last_active')
                .order('liquid_assets', { ascending: false })
                .limit(50);
            if (error) {
                fetchError = error.message || JSON.stringify(error);
                console.error('ERRORE MULTIPLAYER fetch classifica:', error);
            } else {
                rows = data || [];
                console.log('MULTIPLAYER: Classifica caricata —', rows.length, 'aziende:', rows);
            }
        } catch(e) {
            fetchError = e.message || 'Errore di rete';
            console.error('ERRORE MULTIPLAYER fetch eccezione:', e);
        }
    } else {
        fetchError = 'Supabase non disponibile';
    }

    // User switched tab while fetching — don't overwrite their current tab
    if (renderTabRanking._token !== renderToken) return;

    const myId   = window.currentUser?.id;
    const now    = Date.now();
    const ONLINE_MS = 5 * 60 * 1000;

    // Inject own row if not in top 50 (using exact table column names)
    const myInList = rows.some(r => r.user_id === myId);
    if (!myInList && myId) {
        rows.push({
            user_id:      myId,
            company_name: gameState.companyName || 'Chauffeur Empire',
            liquid_assets: Math.floor(gameState.cash || 0),
            reputation:   gameState.reputation || 0,
            fleet_count:  (gameState.fleet || []).length,
            last_active:  new Date().toISOString(),
            _injected:    true,
        });
        rows.sort((a, b) => b.liquid_assets - a.liquid_assets);
    }

    const myRank  = rows.findIndex(r => r.user_id === myId) + 1;
    const total   = rows.length;
    const myRow   = rows.find(r => r.user_id === myId);
    const rankIcon = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : myRank > 0 ? `#${myRank}` : '—';
    const isTop3  = myRank > 0 && myRank <= 3;

    // Top-3 bonus banner
    const bonusBanner = isTop3 ? `<div class="ds-card ds-card--gold" style="margin-bottom:20px">
        <div class="ds-eyebrow" style="color:var(--gold);margin-bottom:8px">✨ Bonus Attivo — Top ${myRank}</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
            <span style="font-size:11px;color:var(--text-muted)">🚘 Corse Ultra-Luxury sbloccate</span>
            <span style="font-size:11px;color:var(--text-muted)">🛡 Premi assicurativi −15%</span>
            <span style="font-size:11px;color:var(--text-muted)">📍 POI esclusivi visibili</span>
        </div>
    </div>` : '';

    // Error banner
    const errBanner = fetchError ? `<div class="ds-card ds-card--alert" style="margin-bottom:16px">
        <span style="font-size:11px;color:var(--red)">⚠ ${fetchError}</span>
    </div>` : '';

    let html = DS.header({
        eyebrow: 'MULTIPLAYER · LIVE',
        title:   'Classifica Globale',
        subtitle:`${total} aziende attive · Aggiornato adesso`,
        actions: DS.btn({ label:'⟳ Aggiorna', color:'ghost', onclick:'renderTabRanking()', size:'sm' }),
    }) + DS.kpiStrip([
        { label:'La Tua Posizione', val: rankIcon,                                          color: isTop3 ? 'gold' : '' },
        { label:'Patrimonio',       val: '€' + Math.floor(myRow?.liquid_assets||gameState.cash||0).toLocaleString('it-IT'), color:'green' },
        { label:'Reputazione',      val: '★' + Number(myRow?.reputation||gameState.reputation||0).toFixed(1), color:'blue' },
        { label:'Aziende Globali',  val: total },
    ]) + errBanner + bonusBanner;

    // ── Leaderboard table ────────────────────────────────────────
    if (rows.length === 0) {
        html += DS.empty({ icon:'🏆', title:'Classifica vuota', body:'Completa una corsa per comparire nella classifica globale.' });
    } else {
        html += `<div class="ds-table-wrap">
        <table class="ds-table">
            <thead><tr>
                <th style="width:50px">#</th>
                <th>Azienda</th>
                <th class="col-right">Patrimonio</th>
                <th class="col-center">⭐ Rep</th>
                <th class="col-center">🚘</th>
                <th class="col-center">Status</th>
            </tr></thead>
            <tbody>`;
        rows.forEach((r, i) => {
            const pos    = i + 1;
            const isMe   = r.user_id === myId;
            const tsMs   = r.last_active ? new Date(r.last_active).getTime() : 0;
            const online = tsMs && (now - tsMs) < ONLINE_MS;
            const medal  = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos;
            const rowStyle = isMe ? 'background:rgba(212,175,55,0.07);' : '';
            const nameColor = isMe ? 'color:var(--gold);' : '';
            const onlineDot = online ? `<span style="display:inline-block;width:6px;height:6px;background:var(--green);border-radius:50%;margin-left:6px;box-shadow:var(--glow-green)"></span>` : '';
            html += `<tr style="${rowStyle}">
                <td style="text-align:center;font-size:${pos<=3?'18':'12'}px">${medal}</td>
                <td>
                    <div style="font-weight:700;${nameColor}font-size:11px">${r.company_name || 'Chauffeur Empire'}${isMe?`<span style="font-size:9px;color:var(--gold);margin-left:6px">(Tu)</span>`:''}${onlineDot}</div>
                </td>
                <td class="col-right" style="font-family:var(--font-mono);font-weight:700;color:var(--blue)">€${(Math.floor(r.liquid_assets||0)/1000).toFixed(0)}k</td>
                <td class="col-center" style="font-family:var(--font-mono)">${Number(r.reputation||0).toFixed(1)}</td>
                <td class="col-center" style="color:var(--text-muted)">${r.fleet_count||0}</td>
                <td class="col-center">${online ? `<span class="ds-pill ds-pill--green">ONLINE</span>` : `<span style="font-size:9px;color:var(--text-dim)">—</span>`}</td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    }

    // ── Guerra dei Prezzi ────────────────────────────────────────
    const activePricewars = gameState.pricewars || [];
    const unlockedRegionIds = (gameState.unlockedRegions||[]).filter(id => REGIONS[id]);
    html += `<div class="ds-eyebrow" style="margin:24px 0 12px">⚔️ Guerra dei Prezzi</div>`;
    activePricewars.forEach(pw => {
        const rname = REGIONS[pw.regionId]?.name || pw.regionId;
        const isMono = !!pw.monopolyEndsDay;
        html += `<div class="ds-card ds-card--${isMono?'gold':'alert'}" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
            <div>
                <div style="font-size:11px;font-weight:700;color:${isMono?'var(--gold)':'var(--red)'}">${isMono?'👑 MONOPOLIO':'⚔️ Guerra'}: ${rname}</div>
                <div style="font-size:9px;color:var(--text-muted)">${isMono?`Scade giorno ${pw.monopolyEndsDay} (+40% tariffe)`:`Fine giorno ${pw.endsDay} (−30% prezzi)`}</div>
            </div>
            ${DS.pill(isMono?'+40%':'−30%', isMono?'gold':'red')}
        </div>`;
    });

    if (unlockedRegionIds.length > 0) {
        html += `<div class="ds-card" style="margin-bottom:16px">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Attacca una regione: −30% tariffe ai rivali per 3 giorni. Se crollano → <strong style="color:var(--gold)">Monopolio +40% per 7 giorni</strong></div>
            <div style="display:flex;gap:8px;align-items:center">
                <select id="attack-region-select" style="flex:1;font-size:11px;background:rgba(0,0,0,0.5);border:1px solid var(--border-sub);border-radius:6px;padding:6px 10px;color:var(--text);font-family:var(--font-mono)">
                    ${unlockedRegionIds.map(id => {
                        const r = REGIONS[id];
                        const atWar = activePricewars.some(pw => pw.regionId === id);
                        const warCost = Math.floor(r.price * 0.25 + 15000);
                        return `<option value="${id}" ${atWar?'disabled':''}>${r.name}${atWar?' (guerra)':''} — €${warCost.toLocaleString()}</option>`;
                    }).join('')}
                </select>
                ${DS.btn({ label:'⚔️ Attacca', color:'red', onclick:"attackTerritory(document.getElementById('attack-region-select').value)" })}
            </div>
        </div>`;
    }

    // ── Obiettivi ────────────────────────────────────────────────
    if (typeof ACHIEVEMENTS !== 'undefined' && ACHIEVEMENTS.length > 0) {
        const earned = gameState.achievements || [];
        html += `<div class="ds-eyebrow" style="margin:24px 0 12px">🏅 Obiettivi (${earned.length}/${ACHIEVEMENTS.length})</div>
        <div class="ds-grid-4">`;
        ACHIEVEMENTS.forEach(ach => {
            const done = earned.includes(ach.id);
            html += `<div class="ds-card" style="text-align:center;padding:12px;${!done?'opacity:0.35':''}${done?'border-color:var(--gold-border)':''}">
                <div style="font-size:24px;margin-bottom:6px">${ach.icon}</div>
                <div style="font-size:9px;font-weight:700;color:${done?'var(--gold)':'var(--text-muted)'}">${ach.name}</div>
                <div style="font-size:8px;color:var(--text-dim);margin-top:3px">${ach.desc}</div>
            </div>`;
        });
        html += `</div>`;
    }

    // ── New Game+ ────────────────────────────────────────────────
    if (gameState.reputation >= 4.5) {
        html += `<div class="ds-card" style="margin-top:20px;text-align:center;border-color:rgba(168,85,247,0.4);background:rgba(168,85,247,0.05)">
            <div style="font-size:32px;margin-bottom:10px">♾️</div>
            <div style="font-size:12px;font-weight:700;color:var(--purple);margin-bottom:6px;font-family:var(--font-display)">NEW GAME+ DISPONIBILE</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:16px">Ricomincia da capo con reputazione e bonus iniziale. La tua leggenda continua.</div>
            ${DS.btn({ label:'Inizia New Game+', color:'blue', onclick:'newGamePlus()' })}
        </div>`;
    }

    const _savedRegion = document.getElementById('attack-region-select')?.value;
    container.innerHTML = html;
    const _regionSel = document.getElementById('attack-region-select');
    if (_regionSel && _savedRegion) _regionSel.value = _savedRegion;
}/* ================================================================
   dispatcher.js — RECOVERY PARTE 3: MERCATI, STAFF & EMAIL
   ================================================================ */
window.renderTabRanking = renderTabRanking;
