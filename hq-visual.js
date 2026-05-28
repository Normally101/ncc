'use strict';
/* ================================================================
   hq-visual.js — Chauffeur Empire
   Visual Campus — v4: Fixed Backgrounds (Ikariam Style)
   ================================================================ */

window.renderHQCampus = function() {
    const placeholder = document.getElementById('hq-visual-placeholder');
    if (!placeholder) return;

    if (!gameState.hqs) return;
    const currentCityId = gameState.currentHQCity || 'roma';
    
    const cityConfig = window.HQ_CITIES.find(c => c.id === currentCityId);
    if (!cityConfig) return;

    const cityData = gameState.hqs[currentCityId];
    if (!cityData) return;

    const builtRooms = cityData.rooms || {};
    const grid = cityData.grid || {};

    // Sfondo cittadino (se manca mostriamo un fallback gradiente scuro)
    const bgUrl = `assets/cities/bg_${currentCityId}.jpg`;

    let html = `
    <div style="position:relative;width:100%;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);aspect-ratio:16/9;min-height:240px;background-image:url('${bgUrl}');background-size:cover;background-position:center;background-color:#1a1c29;">
    `;

    // Scorriamo i lotti di terra definiti in hq-data.js
    if (cityConfig.slots) {
        cityConfig.slots.forEach(slotDef => {
            const slotId = slotDef.id;
            const isOccupied = !!grid[slotId];
            
            if (isOccupied) {
                // Disegna edificio
                const roomId = grid[slotId];
                const level = builtRooms[roomId] || 1;
                const roomDef = window.HQ_ROOMS.find(r => r.id === roomId);
                const roomName = roomDef ? roomDef.name : roomId;
                
                // L'immagine dell'edificio ha la base nel punto esatto del left/top. 
                // Usiamo transform: translate(-50%, -100%) in modo che le coordinate left/top 
                // si riferiscano al "suolo" al centro dell'edificio.
                html += `
                <div class="hq-building-wrapper"
                     style="position:absolute;left:${slotDef.left};top:${slotDef.top};transform:translate(-50%,-100%);cursor:pointer;transition:transform 0.2s;"
                     onclick="window.hqShowInfoPanel('${roomId}')">
                     
                     <!-- Placeholder visibile solo se l'immagine manca -->
                     <div style="display:none; width:128px; height:128px; border:2px dashed rgba(212,175,55,0.4); background:rgba(0,0,0,0.4); border-radius:6px; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:8px; position:absolute; bottom:0; left:50%; transform:translateX(-50%);">
                         <span style="font-size:10px; color:#9ca3af">Immagine mancante</span>
                         <span style="font-size:12px; color:#d4af37; font-weight:bold; margin-top:4px">${roomName} Lvl${level}</span>
                     </div>

                     <img src="assets/buildings/${roomId}_lvl${level}.png"
                          alt="${roomName}"
                          style="position:relative; z-index:10; max-height:200px; width:auto; filter:drop-shadow(0 4px 12px rgba(0,0,0,0.6));"
                          onerror="this.style.display='none'; this.previousElementSibling.style.display='flex'">

                     <!-- Label Livello (visibile su hover) -->
                     <div class="hq-building-label" style="position:absolute; top:-24px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.85); border:1px solid rgba(212,175,55,0.3); color:#d4af37; font-size:9px; font-family:monospace; padding:2px 8px; border-radius:4px; opacity:0; transition:opacity 0.2s; white-space:nowrap; z-index:20; pointer-events:none;">
                        ${roomDef?.icon || ''} ${roomName} Lvl ${level}
                     </div>
                </div>`;
            } else {
                // Disegna slot libero
                html += `
                <div class="hq-slot-pulse"
                     style="position:absolute;left:${slotDef.left};top:${slotDef.top};transform:translate(-50%,-50%);cursor:pointer;">
                     <div onclick="window.hqOpenBuildModal('${currentCityId}', ${slotId})"
                          style="width:56px; height:32px; border:2px dashed rgba(212,175,55,0.5); background:rgba(212,175,55,0.06); border-radius:999px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s;"
                          onmouseover="this.style.background='rgba(212,175,55,0.2)'; this.style.borderColor='rgba(212,175,55,0.9)'"
                          onmouseout="this.style.background='rgba(212,175,55,0.06)'; this.style.borderColor='rgba(212,175,55,0.5)'">
                        <span style="color:#d4af37; font-weight:bold; font-size:18px; line-height:1">+</span>
                     </div>
                     <div style="text-align:center; margin-top:4px; font-size:9px; color:rgba(212,175,55,0.8); background:rgba(0,0,0,0.5); padding:1px 4px; border-radius:3px; white-space:nowrap">Lotto Libero</div>
                </div>`;
            }
        });
    }

    html += `</div>`;
    placeholder.innerHTML = html;
};

// Modifica la vecchia funzione che non accettava cityId e slotIndex assieme
window.hqOpenBuildModal = function(cityId, slotIndex) {
    const builtRooms = gameState.hqs[cityId].rooms || {};
    
    // Trova le stanze che l'utente PUO' costruire a livello 1 in questo slot
    const unlockedRooms = window.HQ_ROOMS.filter(r => {
        // Se l'ha già costruita (livello > 0) in QUESTA città, non può rimetterla da zero.
        if (builtRooms[r.id] && builtRooms[r.id] > 0) return false;
        
        // Verifica città
        if (r.citySpecific && !r.citySpecific.includes(cityId)) return false;
        
        // Verifica prerequisiti
        const hasPrereqs = r.prereqs.every(p => builtRooms[p] && builtRooms[p] > 0);
        return hasPrereqs;
    });

    const existing = document.getElementById('hq-build-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'hq-build-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:50;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#1a1a2e;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:20px;width:320px;max-width:calc(100vw - 32px);margin:16px;box-shadow:0 20px 60px rgba(0,0,0,0.8);max-height:80vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:#e6edf3">🏗️ Costruisci (Lotto ${slotIndex})</div>
          <button onclick="document.getElementById('hq-build-modal').remove()" style="color:#6b7280;background:none;border:none;font-size:18px;cursor:pointer;padding:0;line-height:1">✕</button>
        </div>
        ${unlockedRooms.length === 0
            ? '<div style="font-size:10px;color:#6b7280;text-align:center;padding:16px 0">Nessuna struttura disponibile per questo lotto. Costruisci prima i prerequisiti.</div>'
            : unlockedRooms.map(r => {
                const tDef = r.tiers.find(t => t.level === 1);
                const canAfford = (gameState.cash || 0) >= tDef.cost && (gameState.reputation || 0) >= tDef.reqRep;
                return `
              <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:12px;margin-bottom:8px">
                <div style="font-weight:700;color:#e6edf3;font-size:12px">${r.icon} ${r.name}</div>
                <div style="font-size:10px;color:#8b949e;margin:4px 0 8px">${r.desc}</div>
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <span style="color:#d4af37;font-size:11px;font-family:monospace">€${tDef.cost.toLocaleString()}</span>
                  <button onclick="document.getElementById('hq-build-modal').remove(); window.hqUpgradeRoom('${cityId}', '${r.id}', ${slotIndex})"
                    style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:4px 8px;border-radius:4px;font-size:9px;cursor:pointer;${!canAfford ? 'opacity:.4' : ''}">
                    Costruisci qui
                  </button>
                </div>
              </div>`;
            }).join('')}
      </div>`;
    document.body.appendChild(modal);
};


window.hqShowInfoPanel = function(roomId) {
    const currentCityId = gameState.currentHQCity || 'roma';
    const currentLevel = window.hqGetRoomLevel(currentCityId, roomId);
    if (currentLevel === 0) return;

    const room = window.HQ_ROOMS.find(r => r.id === roomId);
    if (!room) return;
    
    const tDef = room.tiers.find(t => t.level === currentLevel);
    if (!tDef) return;

    let fxHtml = '';
    for (const [k, v] of Object.entries(tDef.effect)) {
        if (typeof v === 'number') {
            const val = k.endsWith('Mult') ? `×${v.toFixed(2)}` : `+${v}`;
            fxHtml += `<span style="font-size:10px;background:rgba(212,175,55,0.1);color:#d4af37;padding:4px 8px;border-radius:4px;margin-right:4px">${val}</span>`;
        } else {
            fxHtml += `<span style="font-size:10px;background:rgba(59,130,246,0.1);color:#60a5fa;padding:4px 8px;border-radius:4px;margin-right:4px">${v}</span>`;
        }
    }

    const nextTier = room.tiers.find(t => t.level === currentLevel + 1);
    let upgradeBtnHtml = '';
    if (nextTier) {
        const canAfford = (gameState.cash || 0) >= nextTier.cost && (gameState.reputation || 0) >= nextTier.reqRep;
        upgradeBtnHtml = `
            <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center">
                <div>
                    <div style="font-size:10px;color:#8b949e">Prossimo Livello (${nextTier.level})</div>
                    <div style="color:#d4af37;font-size:11px;font-family:monospace">€${nextTier.cost.toLocaleString()}</div>
                    ${nextTier.reqRep > 0 ? `<div style="color:#60a5fa;font-size:9px">Req: ${nextTier.reqRep}⭐</div>` : ''}
                </div>
                <button onclick="document.getElementById('hq-info-panel').remove(); window.hqUpgradeRoom('${currentCityId}', '${roomId}')"
                    style="background:#1a1608;border:1px solid #b8962b;color:#d4af37;padding:4px 12px;border-radius:4px;font-size:10px;cursor:pointer;${!canAfford ? 'opacity:.4' : ''}">
                    ⬆️ Migliora
                </button>
            </div>
        `;
    } else {
        upgradeBtnHtml = `<div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);text-align:center;font-size:10px;color:#4ade80;font-weight:700;text-transform:uppercase">Livello Massimo Raggiunto</div>`;
    }

    const existing = document.getElementById('hq-info-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'hq-info-panel';
    panel.style.cssText = 'position:absolute;z-index:50;background:rgba(22,27,34,0.95);border:1px solid rgba(255,255,255,0.2);padding:16px;border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,0.8);max-width:280px;pointer-events:auto;left:50%;top:50%;transform:translate(-50%,-50%)';

    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
            <div>
                <div style="color:#e6edf3;font-weight:700;font-size:12px">${room.icon} ${room.name}</div>
                <div style="font-size:11px;color:#d4af37;font-family:monospace;text-transform:uppercase">Livello ${currentLevel}</div>
            </div>
            <button onclick="document.getElementById('hq-info-panel').remove()" style="color:#8b949e;background:none;border:none;margin-left:16px;cursor:pointer;font-size:16px;padding:0;line-height:1">✕</button>
        </div>
        <p style="font-size:11px;color:#d1d5db;margin-bottom:12px">${room.desc}</p>
        <div style="margin-bottom:12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Effetti Attuali</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">${fxHtml}</div>
        </div>
        ${upgradeBtnHtml}
    `;

    document.getElementById('tab-container').appendChild(panel);
};
