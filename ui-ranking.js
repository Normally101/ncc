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
        <div style="font-size:9px;color:#6a7480;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px">MULTIPLAYER · LIVE</div>
        <div style="font-size:20px;font-weight:700;color:#1f2733;margin-bottom:2px">Classifica Globale</div>
        <div style="font-size:11px;color:#6a7480">Caricamento dati in tempo reale...</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        ${['La Tua Posizione','Patrimonio','Reputazione','Aziende Globali'].map(l => `
        <div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${l}</div>
            <div style="font-size:16px;font-weight:700;color:#1f2733;font-family:monospace">—</div>
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
        rows.sort((a, b) => b.liquid_assets - a.liquid_assets);
    }

    const myRank  = rows.findIndex(r => r.user_id === myId) + 1;
    const total   = rows.length;
    const myRow   = rows.find(r => r.user_id === myId);
    const rankIcon = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : myRank > 0 ? `#${myRank}` : '—';
    const isTop3  = myRank > 0 && myRank <= 3;

    function _kpi(label, val, color) {
        const c = color === 'gold' ? '#c79a2a' : color === 'green' ? '#1aa06a' : color === 'blue' ? '#2f74c0' : '#1f2733';
        return `<div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${label}</div>
            <div style="font-size:16px;font-weight:700;color:${c};font-family:monospace">${val}</div>
        </div>`;
    }

    const bonusBanner = isTop3 ? `
    <div style="background:#ffffff;border:1px solid #c79a2a;border-radius:6px;padding:12px 16px;margin-bottom:16px">
        <div style="font-size:9px;color:#c79a2a;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Bonus Attivo — Top ${myRank}</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
            <span style="font-size:10px;color:#6a7480">Corse Ultra-Luxury sbloccate</span>
            <span style="font-size:10px;color:#6a7480">Premi assicurativi −15%</span>
            <span style="font-size:10px;color:#6a7480">POI esclusivi visibili</span>
        </div>
    </div>` : '';

    const errBanner = fetchError ? `
    <div style="background:#ffffff;border:1px solid #f0c4bd;border-radius:6px;padding:10px 14px;margin-bottom:12px">
        <span style="font-size:10px;color:#db5746">⚠ ${fetchError}</span>
    </div>` : '';

    let html = `<div class="em em-page"><div class="em-wrap">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;padding:0 0 16px">
        <div>
            <div style="font-size:9px;color:#6a7480;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px">MULTIPLAYER · LIVE</div>
            <div style="font-size:20px;font-weight:700;color:#1f2733;margin-bottom:2px">Classifica Globale</div>
            <div style="font-size:11px;color:#6a7480">${total} aziende attive · Aggiornato adesso</div>
        </div>
        <button onclick="renderTabRanking()" style="background:#ffffff;border:1px solid #d6dee8;border-radius:4px;padding:5px 12px;color:#6a7480;font-size:10px;cursor:pointer">⟳ Aggiorna</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        ${_kpi('La Tua Posizione', rankIcon, isTop3 ? 'gold' : '')}
        ${_kpi('Patrimonio', '€' + Math.floor(myRow?.liquid_assets||gameState.cash||0).toLocaleString('it-IT'), 'green')}
        ${_kpi('Reputazione', '★' + Number(myRow?.reputation||gameState.reputation||0).toFixed(1), 'blue')}
        ${_kpi('Aziende Globali', total, '')}
    </div>
    ${errBanner}${bonusBanner}`;

    if (rows.length === 0) {
        html += `<div style="text-align:center;padding:40px;background:#ffffff;border:1px solid #d6dee8;border-radius:6px">
            <div style="font-size:32px;margin-bottom:8px">🏆</div>
            <div style="font-size:12px;font-weight:700;color:#1f2733;margin-bottom:4px">Classifica vuota</div>
            <div style="font-size:10px;color:#6a7480">Completa una corsa per comparire nella classifica globale.</div>
        </div>`;
    } else {
        html += `<table style="width:100%;border-collapse:collapse;margin-bottom:24px">
            <thead>
                <tr style="border-bottom:1px solid #d6dee8">
                    <th style="width:44px;text-align:center;padding:6px 8px;font-size:9px;color:#6a7480;font-weight:600;text-transform:uppercase;letter-spacing:.08em">#</th>
                    <th style="text-align:left;padding:6px 8px;font-size:9px;color:#6a7480;font-weight:600;text-transform:uppercase;letter-spacing:.08em">Azienda</th>
                    <th style="text-align:right;padding:6px 8px;font-size:9px;color:#6a7480;font-weight:600;text-transform:uppercase;letter-spacing:.08em">Patrimonio</th>
                    <th style="text-align:center;padding:6px 8px;font-size:9px;color:#6a7480;font-weight:600;text-transform:uppercase;letter-spacing:.08em">Rep</th>
                    <th style="text-align:center;padding:6px 8px;font-size:9px;color:#6a7480;font-weight:600;text-transform:uppercase;letter-spacing:.08em">Flotta</th>
                    <th style="text-align:center;padding:6px 8px;font-size:9px;color:#6a7480;font-weight:600;text-transform:uppercase;letter-spacing:.08em">Status</th>
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
            const nameclr = isMe ? '#c79a2a' : '#1f2733';
            html += `<tr style="border-bottom:1px solid #d6dee8;${rowBg}">
                <td style="text-align:center;padding:8px;font-size:${pos<=3?'16':'11'}px;color:#6a7480">${medal}</td>
                <td style="padding:8px">
                    <span style="font-weight:700;font-size:11px;color:${nameclr}">${r.company_name || 'Chauffeur Empire'}</span>
                    ${isMe ? `<span style="font-size:9px;color:#c79a2a;margin-left:6px">(Tu)</span>` : ''}
                    ${online ? `<span style="display:inline-block;width:5px;height:5px;background:#1aa06a;border-radius:50%;margin-left:5px;vertical-align:middle"></span>` : ''}
                </td>
                <td style="text-align:right;padding:8px;font-family:monospace;font-weight:700;font-size:11px;color:#2f74c0">€${(Math.floor(r.liquid_assets||0)/1000).toFixed(0)}k</td>
                <td style="text-align:center;padding:8px;font-family:monospace;font-size:11px;color:#6a7480">${Number(r.reputation||0).toFixed(1)}</td>
                <td style="text-align:center;padding:8px;font-size:11px;color:#6a7480">${r.fleet_count||0}</td>
                <td style="text-align:center;padding:8px">
                    ${online
                        ? `<span style="font-size:9px;color:#1aa06a;border:1px solid #bfe6cd;background:#eafbf1;border-radius:3px;padding:2px 6px">ONLINE</span>`
                        : `<span style="font-size:9px;color:#98a1ae">—</span>`}
                </td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }

    // Guerra dei Prezzi
    const activePricewars = gameState.pricewars || [];
    const unlockedRegionIds = (gameState.unlockedRegions||[]).filter(id => REGIONS[id]);
    html += `<div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.1em;margin:0 0 10px">⚔ Guerra dei Prezzi</div>`;
    activePricewars.forEach(pw => {
        const rname = REGIONS[pw.regionId]?.name || pw.regionId;
        const isMono = !!pw.monopolyEndsDay;
        html += `<div style="background:#ffffff;border:1px solid ${isMono?'#c79a2a':'#f0c4bd'};border-radius:6px;padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
            <div>
                <div style="font-size:11px;font-weight:700;color:${isMono?'#c79a2a':'#db5746'}">${isMono?'MONOPOLIO':'Guerra'}: ${rname}</div>
                <div style="font-size:9px;color:#6a7480">${isMono?`Scade giorno ${pw.monopolyEndsDay} (+40% tariffe)`:`Fine giorno ${pw.endsDay} (−30% prezzi)`}</div>
            </div>
            <span style="font-size:9px;font-weight:700;color:${isMono?'#c79a2a':'#db5746'};border:1px solid ${isMono?'#c79a2a':'#f0c4bd'};border-radius:3px;padding:2px 8px">${isMono?'+40%':'−30%'}</span>
        </div>`;
    });

    if (unlockedRegionIds.length > 0) {
        html += `<div style="background:#ffffff;border:1px solid #d6dee8;border-radius:6px;padding:12px 14px;margin-bottom:16px">
            <div style="font-size:10px;color:#6a7480;margin-bottom:10px">Attacca una regione: −30% tariffe ai rivali per 3 giorni. Se crollano → <strong style="color:#c79a2a">Monopolio +40% per 7 giorni</strong></div>
            <div style="display:flex;gap:8px;align-items:center">
                <select id="attack-region-select" style="flex:1;font-size:11px;background:#f3f6f9;border:1px solid #d6dee8;border-radius:4px;padding:5px 8px;color:#1f2733;font-family:monospace">
                    ${unlockedRegionIds.map(id => {
                        const r = REGIONS[id];
                        const atWar = activePricewars.some(pw => pw.regionId === id);
                        const warCost = Math.floor(r.price * 0.25 + 15000);
                        return `<option value="${id}" ${atWar?'disabled':''}>${r.name}${atWar?' (guerra)':''} — €${warCost.toLocaleString()}</option>`;
                    }).join('')}
                </select>
                <button onclick="attackTerritory(document.getElementById('attack-region-select').value)"
                    style="background:#ffffff;border:1px solid #8b2020;border-radius:4px;padding:5px 12px;color:#db5746;font-size:10px;cursor:pointer;white-space:nowrap">⚔ Attacca</button>
            </div>
        </div>`;
    }

    // Achievements
    if (typeof ACHIEVEMENTS !== 'undefined' && ACHIEVEMENTS.length > 0) {
        const earned = gameState.achievements || [];
        html += `<div style="font-size:9px;color:#6a7480;text-transform:uppercase;letter-spacing:.1em;margin:24px 0 12px">Obiettivi (${earned.length}/${ACHIEVEMENTS.length})</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:24px">`;
        ACHIEVEMENTS.forEach(ach => {
            const done = earned.includes(ach.id);
            html += `<div style="background:#ffffff;border:1px solid ${done?'#c79a2a':'#d6dee8'};border-radius:6px;padding:12px;text-align:center;opacity:${done?1:0.35}">
                <div style="font-size:22px;margin-bottom:6px">${ach.icon}</div>
                <div style="font-size:9px;font-weight:700;color:${done?'#c79a2a':'#6a7480'}">${ach.name}</div>
                <div style="font-size:8px;color:#98a1ae;margin-top:3px">${ach.desc}</div>
            </div>`;
        });
        html += `</div>`;
    }

    // New Game+
    if (gameState.reputation >= 4.5) {
        html += `<div style="background:#ffffff;border:1px solid rgba(168,85,247,0.4);border-radius:6px;padding:20px;text-align:center;margin-top:16px">
            <div style="font-size:28px;margin-bottom:10px">♾</div>
            <div style="font-size:12px;font-weight:700;color:#7c5fc9;margin-bottom:6px">NEW GAME+ DISPONIBILE</div>
            <div style="font-size:10px;color:#6a7480;margin-bottom:16px">Ricomincia da capo con reputazione e bonus iniziale. La tua leggenda continua.</div>
            <button onclick="newGamePlus()" style="background:#f3f6f9;border:1px solid #7c5fc9;border-radius:4px;padding:7px 20px;color:#7c5fc9;font-size:10px;cursor:pointer">Inizia New Game+</button>
        </div>`;
    }

    const _savedRegion = document.getElementById('attack-region-select')?.value;
    container.innerHTML = html + `</div></div>`;
    const _regionSel = document.getElementById('attack-region-select');
    if (_regionSel && _savedRegion) _regionSel.value = _savedRegion;
}
window.renderTabRanking = renderTabRanking;
