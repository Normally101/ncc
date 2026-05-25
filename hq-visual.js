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
    const bgUrl = \`assets/cities/bg_\${currentCityId}.jpg\`;

    let html = \`
    <div class="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-gray-900" 
         style="background-image: url('\${bgUrl}'); background-size: cover; background-position: center;">
        
        <!-- Fallback layer se l'immagine manca -->
        <div class="absolute inset-0 bg-gradient-to-b from-[#1a1c29]/80 to-[#0a0d14]/95 -z-10"></div>
    \`;

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
                html += \`
                <div class="absolute group cursor-pointer hover:scale-105 transition-transform"
                     style="left: \${slotDef.left}; top: \${slotDef.top}; transform: translate(-50%, -100%);"
                     onclick="window.hqShowInfoPanel('\${roomId}')">
                     
                     <!-- Placeholder se l'immagine manca -->
                     <div class="w-32 h-32 border-2 border-dashed border-gold/40 bg-black/40 rounded flex flex-col items-center justify-center text-center p-2 absolute bottom-0 left-1/2 -translate-x-1/2">
                         <span class="text-[10px] text-gray-400">Immagine mancante</span>
                         <span class="text-xs text-gold font-bold mt-1">\${roomName} Lvl\${level}</span>
                     </div>
                     
                     <img src="assets/buildings/\${roomId}_lvl\${level}.png" 
                          alt="\${roomName}" 
                          class="relative z-10 drop-shadow-2xl" 
                          style="max-height: 200px; width: auto;"
                          onerror="this.style.display='none'">
                          
                     <!-- Label Livello -->
                     <div class="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/80 border border-gold/30 text-gold text-[9px] font-mono px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                        \${roomDef?.icon || ''} \${roomName} Lvl \${level}
                     </div>
                </div>\`;
            } else {
                // Disegna slot libero
                html += \`
                <div class="absolute cursor-pointer hq-slot-pulse"
                     style="left: \${slotDef.left}; top: \${slotDef.top}; transform: translate(-50%, -50%);"
                     onclick="window.hqOpenBuildModal('\${currentCityId}', \${slotId})">
                     <div class="w-16 h-8 rounded-full border-2 border-dashed border-gold/40 bg-gold/5 flex items-center justify-center shadow-[0_0_15px_rgba(212,175,55,0.1)] hover:bg-gold/20 hover:border-gold/80 transition-all">
                        <span class="text-gold font-bold text-lg">+</span>
                     </div>
                     <div class="text-center mt-1 text-[9px] text-gold/80 bg-black/50 px-1 rounded whitespace-nowrap">Lotto Libero</div>
                </div>\`;
            }
        });
    }

    html += \`</div>\`;
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
    modal.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center backdrop-blur-sm';
    modal.innerHTML = \`
      <div class="bg-[#1a1a2e] border border-white/10 rounded-xl p-5 w-80 max-w-full mx-4 shadow-2xl max-h-[80vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-4">
          <div class="text-sm font-bold text-white">🏗️ Costruisci (Lotto \${slotIndex})</div>
          <button onclick="document.getElementById('hq-build-modal').remove()" class="text-gray-500 hover:text-white text-lg">✕</button>
        </div>
        \${unlockedRooms.length === 0
            ? '<div class="text-[10px] text-gray-500 text-center py-4">Nessuna struttura disponibile per questo lotto. Costruisci prima i prerequisiti.</div>'
            : unlockedRooms.map(r => {
                const tDef = r.tiers.find(t => t.level === 1);
                const canAfford = (gameState.cash || 0) >= tDef.cost && (gameState.reputation || 0) >= tDef.reqRep;
                return \`
              <div class="bg-white/3 border border-white/8 rounded-lg p-3 mb-2">
                <div class="font-bold text-white text-sm">\${r.icon} \${r.name}</div>
                <div class="text-[10px] text-gray-400 mt-0.5 mb-2">\${r.desc}</div>
                <div class="flex justify-between items-center">
                  <span class="text-gold text-[11px] font-mono">€\${tDef.cost.toLocaleString()}</span>
                  <button onclick="document.getElementById('hq-build-modal').remove(); window.hqUpgradeRoom('\${cityId}', '\${r.id}', \${slotIndex})"
                    class="btn-gold !text-[9px] !py-1 !px-2 \${!canAfford ? 'opacity-40' : ''}">
                    Costruisci qui
                  </button>
                </div>
              </div>\`;
            }).join('')}
      </div>\`;
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
            const val = k.endsWith('Mult') ? \`×\${v.toFixed(2)}\` : \`+\${v}\`;
            fxHtml += \`<span class="text-[10px] bg-gold/10 text-gold px-2 py-1 rounded mr-1">\${val}</span>\`;
        } else {
            fxHtml += \`<span class="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-1 rounded mr-1">\${v}</span>\`;
        }
    }

    const nextTier = room.tiers.find(t => t.level === currentLevel + 1);
    let upgradeBtnHtml = '';
    if (nextTier) {
        const canAfford = (gameState.cash || 0) >= nextTier.cost && (gameState.reputation || 0) >= nextTier.reqRep;
        upgradeBtnHtml = \`
            <div class="mt-4 pt-3 border-t border-white/10 flex justify-between items-center">
                <div>
                    <div class="text-[10px] text-gray-400">Prossimo Livello (\${nextTier.level})</div>
                    <div class="text-gold text-xs font-mono">€\${nextTier.cost.toLocaleString()}</div>
                    \${nextTier.reqRep > 0 ? \`<div class="text-blue-400 text-[9px]">Req: \${nextTier.reqRep}⭐</div>\` : ''}
                </div>
                <button onclick="document.getElementById('hq-info-panel').remove(); window.hqUpgradeRoom('\${currentCityId}', '\${roomId}')"
                    class="btn-gold !text-[10px] !py-1 !px-3 \${!canAfford ? 'opacity-40' : ''}">
                    ⬆️ Migliora
                </button>
            </div>
        \`;
    } else {
        upgradeBtnHtml = \`<div class="mt-4 pt-3 border-t border-white/10 text-center text-[10px] text-green-400 font-bold uppercase">Livello Massimo Raggiunto</div>\`;
    }

    const existing = document.getElementById('hq-info-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'hq-info-panel';
    panel.className = 'absolute z-50 bg-[#161b22]/95 border border-white/20 p-4 rounded-xl shadow-2xl backdrop-blur-md hq-info-pop max-w-[280px] pointer-events-auto';
    panel.style.left = '50%';
    panel.style.top = '50%';
    panel.style.transform = 'translate(-50%, -50%)';

    panel.innerHTML = \`
        <div class="flex justify-between items-start mb-2">
            <div>
                <h3 class="text-white font-bold text-sm">\${room.icon} \${room.name}</h3>
                <div class="text-xs text-gold font-mono uppercase">Livello \${currentLevel}</div>
            </div>
            <button onclick="this.closest('#hq-info-panel').remove()" class="text-gray-400 hover:text-white ml-4">✕</button>
        </div>
        <p class="text-[11px] text-gray-300 mb-3">\${room.desc}</p>
        <div class="mb-3">
            <div class="text-[9px] text-gray-500 uppercase mb-1">Effetti Attuali</div>
            <div class="flex flex-wrap">\${fxHtml}</div>
        </div>
        \${upgradeBtnHtml}
    \`;

    document.getElementById('tab-container').appendChild(panel);
};
