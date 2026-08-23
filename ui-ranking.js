'use strict';
/* ui-ranking.js — Chauffeur Empire */

async function renderTabRanking() {
    const container = document.getElementById('tab-container');
    if (!container) return;

    const renderToken = Symbol();
    renderTabRanking._token = renderToken;

    // Loading skeleton
    container.innerHTML = `<div class="em em-page"><div class="em-wrap">
    <div style="padding:0 0 16px">
        <div style="font-size:9px;color:#9ca3af;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px">MULTIPLAYER · LIVE</div>
        <div style="font-size:20px;font-weight:700;color:#e6edf3;margin-bottom:2px">Classifica Globale</div>
        <div style="font-size:11px;color:#9ca3af">Caricamento dati in tempo reale...</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        ${['La Tua Posizione','Patrimonio','Reputazione','Aziende Globali'].map(l => `
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${l}</div>
            <div style="font-size:16px;font-weight:700;color:#e6edf3;font-family:monospace">—</div>
        </div>`).join('')}
    </div>
    ${Array(5).fill(`<div class="ce-skel" style="height:40px;margin-bottom:6px"></div>`).join('')}</div></div>`;

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

    // ── Segnali SERVER-AUTHORITATIVE per il Punteggio Potere (anti-cheat) ──
    // province conquistate (via RPC) e contributi al consorzio (asset-bound):
    // un client modificato può gonfiare il cash, ma NON questi → non scala in classifica.
    const provCount = {}, contribByUser = {};
    if (window.supabaseClient) {
        try {
            const { data: pv } = await window.supabaseClient.from('provinces').select('owner_id').not('owner_id', 'is', null);
            (pv || []).forEach(p => { if (p.owner_id) provCount[p.owner_id] = (provCount[p.owner_id] || 0) + 1; });
        } catch (e) { /* RLS/offline → degrada con grazia */ }
        try {
            const { data: cb } = await window.supabaseClient.from('alliance_members').select('user_id,contribution');
            (cb || []).forEach(m => { contribByUser[m.user_id] = (contribByUser[m.user_id] || 0) + (m.contribution || 0); });
        } catch (e) {}
    }
    const _power = r => (provCount[r.user_id] || 0) * 100
                      + Math.floor((contribByUser[r.user_id] || 0) / 10000)
                      + Math.min(100, (r.fleet_count || 0)) * 3
                      + Math.round((r.reputation || 0) * 20);

    if (renderTabRanking._token !== renderToken) return;

    const myId = window.currentUser?.id;
    const now  = Date.now();
    const ONLINE_MS = 5 * 60 * 1000;

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
    }
    // ranking per POTERE (metriche server) invece del cash dichiarato dal client
    rows.forEach(r => { r._prov = provCount[r.user_id] || 0; r._contrib = contribByUser[r.user_id] || 0; r._power = _power(r); });
    rows.sort((a, b) => b._power - a._power || (b.liquid_assets || 0) - (a.liquid_assets || 0));
    // dedup difensivo: una azienda (user_id) compare una sola volta
    { const _seen = new Set(); rows = rows.filter(r => { if (!r.user_id) return true; if (_seen.has(r.user_id)) return false; _seen.add(r.user_id); return true; }); }
    // conteggio nomi per disambiguare aziende omonime (es. molte "Chauffeur Empire" di default)
    const _nameCount = {}; rows.forEach(r => { const n = r.company_name || 'Chauffeur Empire'; _nameCount[n] = (_nameCount[n] || 0) + 1; });
    // presenza reale → alimenta il chip "online" del feed Mondo NCC
    try { window._worldRealOnline = rows.filter(r => r.last_active && (now - new Date(r.last_active).getTime()) < ONLINE_MS).length; } catch (e) {}

    const myRank  = rows.findIndex(r => r.user_id === myId) + 1;
    const total   = rows.length;
    const myRow   = rows.find(r => r.user_id === myId);
    const rankIcon = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : myRank > 0 ? `#${myRank}` : '—';
    const isTop3  = myRank > 0 && myRank <= 3;

    function _kpi(label, val, color) {
        const c = color === 'gold' ? '#c79a2a' : color === 'green' ? '#1aa06a' : color === 'blue' ? '#2f74c0' : '#9ca3af';
        return `<div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${label}</div>
            <div style="font-size:16px;font-weight:700;color:${c};font-family:monospace">${val}</div>
        </div>`;
    }

    // I bonus NON dipendono da questa classifica. Il motore li cancella su
    // `_getRankPosition()` (engine.js:362), cioè la posizione per REPUTAZIONE contro i
    // rivali NPC, mentre `myRank` qui sopra è la classifica multiplayer per potere.
    // Il banner era agganciato a myRank: chi era top 3 fra i giocatori se lo vedeva
    // annunciare senza averne nessuno, e chi era top 3 per reputazione ma cinquantesimo
    // nel multiplayer li aveva senza saperlo. Inoltre elencava "premi assicurativi −15%",
    // che non esistono: l'effetto vero è il rischio incidenti (engine-rides.js:456).
    const repRank = (typeof _getRankPosition === 'function') ? _getRankPosition() : null;
    const _perk = txt => `<span style="font-size:10px;color:#9ca3af">${txt}</span>`;
    const perks = [];
    if (repRank !== null) {
        if (repRank <= 5) perks.push(_perk('POI esclusivi: Porto Cervo, Armani Hotel'));
        if (repRank <= 4) perks.push(_perk('POI esclusivi: Borgo Egnazia, Belmond Splendido'));
        if (repRank <= 3) perks.push(_perk('Rischio incidenti −15%'));
    }
    const bonusBanner = perks.length ? `
    <div style="background:#161b22;border:1px solid #c79a2a;border-radius:6px;padding:12px 16px;margin-bottom:16px">
        <div style="font-size:9px;color:#c79a2a;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Bonus attivi — #${repRank} per reputazione fra i rivali</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">${perks.join('')}</div>
    </div>` : '';

    const errBanner = fetchError ? `
    <div style="background:#161b22;border:1px solid #f0c4bd;border-radius:6px;padding:10px 14px;margin-bottom:12px">
        <span style="font-size:10px;color:#db5746">⚠ ${fetchError}</span>
    </div>` : '';

    let html = `<div class="em em-page"><div class="em-wrap">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:0 0 16px">
        <div>
            <div style="font-size:9px;color:#9ca3af;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px">MULTIPLAYER · LIVE</div>
            <div style="font-size:20px;font-weight:700;color:#e6edf3;margin-bottom:2px">Classifica Globale</div>
            <div style="font-size:11px;color:#9ca3af">${total} aziende · classifica per <b style="color:#c79a2a">Potere</b> (province · consorzio · flotta · reputazione) — a prova di cheat</div>
        </div>
        <button ${ceAct('renderTabRanking', [])} style="background:#161b22;border:1px solid #21262d;border-radius:4px;padding:5px 12px;color:#9ca3af;font-size:10px;cursor:pointer">⟳ Aggiorna</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        ${_kpi('La Tua Posizione', rankIcon, isTop3 ? 'gold' : '')}
        ${_kpi('Punteggio Potere', (myRow?._power||0).toLocaleString('it-IT'), 'gold')}
        ${_kpi('Province', String(myRow?._prov||0), 'green')}
        ${_kpi('Aziende Globali', total, '')}
    </div>
    ${errBanner}${bonusBanner}`;

    if (rows.length === 0) {
        html += `<div style="text-align:center;padding:40px;background:#161b22;border:1px solid #21262d;border-radius:6px">
            <div style="font-size:32px;margin-bottom:8px">🏆</div>
            <div style="font-size:12px;font-weight:700;color:#e6edf3;margin-bottom:4px">Classifica vuota</div>
            <div style="font-size:10px;color:#9ca3af">Completa una corsa per comparire nella classifica globale.</div>
        </div>`;
    } else {
        html += `<table style="width:100%;border-collapse:collapse;margin-bottom:24px">
            <thead>
                <tr style="border-bottom:1px solid #21262d">
                    <th style="width:44px;text-align:center;padding:6px 8px;font-size:9px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.08em">#</th>
                    <th style="text-align:left;padding:6px 8px;font-size:9px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.08em">Azienda</th>
                    <th style="text-align:right;padding:6px 8px;font-size:9px;color:#c79a2a;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Potere</th>
                    <th style="text-align:center;padding:6px 8px;font-size:9px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.08em">Prov</th>
                    <th style="text-align:right;padding:6px 8px;font-size:9px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.08em">Patrimonio</th>
                    <th style="text-align:center;padding:6px 8px;font-size:9px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.08em">Rep</th>
                    <th style="text-align:center;padding:6px 8px;font-size:9px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.08em">Flotta</th>
                    <th style="text-align:center;padding:6px 8px;font-size:9px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.08em">Status</th>
                </tr>
            </thead>
            <tbody>`;
        rows.forEach((r, i) => {
            const pos    = i + 1;
            const isMe   = r.user_id === myId;
            const tsMs   = r.last_active ? new Date(r.last_active).getTime() : 0;
            const online = tsMs && (now - tsMs) < ONLINE_MS;
            const medal  = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos;
            const rowBg  = isMe ? 'background:rgba(212,175,55,0.06);' : '';
            const nameclr = isMe ? '#c79a2a' : '#e5e7eb';
            html += `<tr style="border-bottom:1px solid #21262d;${rowBg}">
                <td style="text-align:center;padding:8px;font-size:${pos<=3?'16':'11'}px;color:#9ca3af">${medal}</td>
                <td style="padding:8px">
                    <span style="font-weight:700;font-size:11px;color:${nameclr}">${CE_Sec.escHtml(r.company_name || 'Chauffeur Empire')}${_nameCount[r.company_name || 'Chauffeur Empire'] > 1 ? ` <span style="color:#9ca3af;font-weight:500">#${String(r.user_id||'').slice(0,4)}</span>` : ''}</span>
                    ${isMe ? `<span style="font-size:9px;color:#c79a2a;margin-left:6px">(Tu)</span>` : ''}
                    ${online ? `<span style="display:inline-block;width:5px;height:5px;background:#1aa06a;border-radius:50%;margin-left:5px;vertical-align:middle"></span>` : ''}
                </td>
                <td style="text-align:right;padding:8px;font-family:monospace;font-weight:800;font-size:12px;color:#c79a2a">${(r._power||0).toLocaleString('it-IT')}</td>
                <td style="text-align:center;padding:8px;font-family:monospace;font-size:11px;color:${(r._prov||0)>0?'#1aa06a':'#98a1ae'}">${r._prov||0}</td>
                <td style="text-align:right;padding:8px;font-family:monospace;font-weight:700;font-size:11px;color:#9ca3af">€${(Math.floor(r.liquid_assets||0)/1000).toFixed(0)}k</td>
                <td style="text-align:center;padding:8px;font-family:monospace;font-size:11px;color:#9ca3af">${Number(r.reputation||0).toFixed(1)}</td>
                <td style="text-align:center;padding:8px;font-size:11px;color:#9ca3af">${r.fleet_count||0}</td>
                <td style="text-align:center;padding:8px">
                    ${online
                        ? `<span style="font-size:9px;color:#1aa06a;border:1px solid #bfe6cd;background:#eafbf1;border-radius:3px;padding:2px 6px">ONLINE</span>`
                        : `<span style="font-size:9px;color:#9ca3af">—</span>`}
                </td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }

    // Guerra dei Prezzi
    const activePricewars = gameState.pricewars || [];
    const unlockedRegionIds = (gameState.unlockedRegions||[]).filter(id => REGIONS[id]);
    html += `<div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.1em;margin:0 0 10px">⚔ Guerra dei Prezzi</div>`;
    activePricewars.forEach(pw => {
        const rname = REGIONS[pw.regionId]?.name || pw.regionId;
        const isMono = !!pw.monopolyEndsDay;
        html += `<div style="background:#161b22;border:1px solid ${isMono?'#c79a2a':'#f0c4bd'};border-radius:6px;padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
            <div>
                <div style="font-size:11px;font-weight:700;color:${isMono?'#c79a2a':'#db5746'}">${isMono?'MONOPOLIO':'Guerra'}: ${rname}</div>
                <div style="font-size:9px;color:#9ca3af">${isMono?`Scade giorno ${pw.monopolyEndsDay} (+40% tariffe)`:`Fine giorno ${pw.endsDay} (−30% prezzi)`}</div>
            </div>
            <span style="font-size:9px;font-weight:700;color:${isMono?'#c79a2a':'#db5746'};border:1px solid ${isMono?'#c79a2a':'#f0c4bd'};border-radius:3px;padding:2px 8px">${isMono?'+40%':'−30%'}</span>
        </div>`;
    });

    if (unlockedRegionIds.length > 0) {
        html += `<div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 14px;margin-bottom:16px">
            <div style="font-size:10px;color:#9ca3af;margin-bottom:10px">Attacca una regione: −30% tariffe ai rivali per 3 giorni. Se crollano → <strong style="color:#c79a2a">Monopolio +40% per 7 giorni</strong></div>
            <div style="display:flex;gap:8px;align-items:center">
                <select id="attack-region-select" style="flex:1;font-size:11px;background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:5px 8px;color:#e6edf3;font-family:monospace">
                    ${unlockedRegionIds.map(id => {
                        const r = REGIONS[id];
                        const atWar = activePricewars.some(pw => pw.regionId === id);
                        const warCost = Math.floor(r.price * 0.25 + 15000);
                        return `<option value="${id}" ${atWar?'disabled':''}>${r.name}${atWar?' (guerra)':''} — €${warCost.toLocaleString()}</option>`;
                    }).join('')}
                </select>
                <button ${ceAct('ceAttackTerritory', [])}
                    style="background:#161b22;border:1px solid #8b2020;border-radius:4px;padding:5px 12px;color:#db5746;font-size:10px;cursor:pointer;white-space:nowrap">⚔ Attacca</button>
            </div>
        </div>`;
    }

    // Achievements
    if (typeof ACHIEVEMENTS !== 'undefined' && ACHIEVEMENTS.length > 0) {
        const earned = gameState.achievements || [];
        html += `<div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:.1em;margin:24px 0 12px">Obiettivi (${earned.length}/${ACHIEVEMENTS.length})</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:24px">`;
        ACHIEVEMENTS.forEach(ach => {
            const done = earned.includes(ach.id);
            html += `<div style="background:#161b22;border:1px solid ${done?'#c79a2a':'#d6dee8'};border-radius:6px;padding:12px;text-align:center;opacity:${done?1:0.35}">
                <div style="font-size:22px;margin-bottom:6px">${ach.icon}</div>
                <div style="font-size:9px;font-weight:700;color:${done?'#c79a2a':'#9ca3af'}">${ach.name}</div>
                <div style="font-size:8px;color:#9ca3af;margin-top:3px">${ach.desc}</div>
            </div>`;
        });
        html += `</div>`;
    }

    // New Game+
    if (gameState.reputation >= 4.5) {
        html += `<div style="background:#161b22;border:1px solid rgba(168,85,247,0.4);border-radius:6px;padding:20px;text-align:center;margin-top:16px">
            <div style="font-size:28px;margin-bottom:10px">♾</div>
            <div style="font-size:12px;font-weight:700;color:#7c5fc9;margin-bottom:6px">NEW GAME+ DISPONIBILE</div>
            <div style="font-size:10px;color:#9ca3af;margin-bottom:16px">Ricomincia da capo con reputazione e bonus iniziale. La tua leggenda continua.</div>
            <button ${ceAct('newGamePlus', [])} style="background:#0d1117;border:1px solid #7c5fc9;border-radius:4px;padding:7px 20px;color:#7c5fc9;font-size:10px;cursor:pointer">Inizia New Game+</button>
        </div>`;
    }

    const _savedRegion = document.getElementById('attack-region-select')?.value;
    container.innerHTML = html + `</div></div>`;
    const _regionSel = document.getElementById('attack-region-select');
    if (_regionSel && _savedRegion) _regionSel.value = _savedRegion;
}
window.renderTabRanking = renderTabRanking;
