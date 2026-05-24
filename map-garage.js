'use strict';
/* ================================================================
   map-garage.js — Chauffeur Empire
   Ispezione veicolo 3D: openGarage3D, closeGarage3D, _generateVehicleSVG.
   Dipendenze: engine.js (gameState, STELLAR_VOLT_CATALOG, FLEET_VEHICLE_CLASSES)
   Caricato dopo: map.js
   ================================================================ */

// ─── GARAGE SVG — ISPEZIONE VEICOLO ─────────────────────────────
window.openGarage3D = function(carId) {
    let car = gameState.fleet.find(c => c.id === carId);
    if (!car) return;

    const modal = document.getElementById('modal-garage3d');

    // Remap legacy vehicleClass on the fly for display (persistent fix is in loadGame migration)
    const _VC_LEGACY = { 'mercedes_e':'stellar_e_exec', 'mercedes_v':'stellar_v_carr', 'mercedes_sprinter':'stellar_v_carr', 'mercedes_s':'stellar_s_imp' };
    const vClass   = _VC_LEGACY[car.vehicleClass] || car.vehicleClass || 'stellar_e_exec';
    const upgrades = car.upgrades || [];

    const _LEGACY_NAMES = {
        'standard_sedan':'Stellar C-Line', 'van_x':'Vanguard Transit',
        'sedan':'Stellar C-Line', 'van':'Vanguard Transit',
        'mercedes e-class sedan':'Stellar E-Executive', 'mercedes e-class':'Stellar E-Executive',
        'mercedes v-class minivan':'Stellar V-Carrier', 'mercedes v-class':'Stellar V-Carrier',
        'mercedes v-class (leasing)':'Stellar V-Carrier (Leasing)', 'mercedes v-class minivan (leasing)':'Stellar V-Carrier (Leasing)',
        'mercedes e-class sedan (leasing)':'Stellar E-Executive (Leasing)', 'mercedes e-class (leasing)':'Stellar E-Executive (Leasing)',
        'mercedes s-class presidential (leasing)':'Stellar S-Imperial (Leasing)', 'mercedes s-class (leasing)':'Stellar S-Imperial (Leasing)',
        'mercedes sprinter (leasing)':'Stellar V-Carrier (Leasing)',
        'mercedes sprinter':'Stellar V-Carrier',
        'mercedes s-class presidential':'Stellar S-Imperial', 'mercedes s-class':'Stellar S-Imperial',
    };
    const _nameLow = (car.name || '').toLowerCase();
    if (_LEGACY_NAMES[_nameLow]) car = { ...car, name: _LEGACY_NAMES[_nameLow] };

    const catalog  = (typeof STELLAR_VOLT_CATALOG !== 'undefined' ? STELLAR_VOLT_CATALOG : []).find(c => c.vehicleClass === vClass || c.id === vClass);
    const carImg   = catalog?.img || 'assets/fleet/stellar-e-executive.jpg';
    const isElec   = catalog?.fuel === 'electric';

    const template = (typeof FLEET_VEHICLE_CLASSES !== 'undefined' ? FLEET_VEHICLE_CLASSES : []).find(x => x.id === vClass) || {};
    const seats   = template.capacity || (vClass.includes('carr') ? 7 : vClass.includes('sprinter') ? 8 : 3);
    const luggage = vClass.includes('carr') ? 7 : vClass.includes('sprinter') ? 12 : 3;

    const leftPanel = carImg
        ? `<div class="w-full md:w-3/5 relative overflow-hidden" style="min-height:320px">
               <img src="${carImg}" alt="${car.name}"
                    class="absolute inset-0 w-full h-full object-cover"
                    style="object-position:center">
               ${isElec ? `<div class="absolute top-4 left-4 bg-green-500/90 text-white text-xs font-bold px-2 py-1 rounded shadow">⚡ CO2 ESENTE</div>` : ''}
               <div class="absolute bottom-3 left-4 text-white/50 text-[8px] uppercase tracking-widest font-mono">${vClass.replace(/_/g,' ').toUpperCase()}</div>
           </div>`
        : `<div class="w-full md:w-3/5 bg-black/80 relative flex items-center justify-center p-8 overflow-hidden" style="min-height:320px">
               <div class="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-black/90 pointer-events-none"></div>
               <div class="relative z-10 w-full drop-shadow-[0_20px_30px_rgba(0,0,0,1)] transition-transform duration-700 hover:scale-105">
                   ${typeof _generateVehicleSVG === 'function' ? _generateVehicleSVG(vClass, upgrades) : ''}
               </div>
           </div>`;

    modal.innerHTML = `
        <div class="bg-panel border border-white/10 rounded-2xl w-[95%] max-w-5xl min-h-[500px] overflow-hidden relative shadow-2xl flex flex-col md:flex-row transform transition-all" style="max-height:90vh">
            ${leftPanel}
            <div class="w-full md:w-2/5 p-8 bg-panel border-l border-white/10 flex flex-col justify-between overflow-y-auto">
                <div>
                    <div class="flex justify-between items-start mb-2">
                        <h2 class="text-2xl font-bold text-white uppercase tracking-wider leading-tight">${car.name}</h2>
                        <span class="bg-white/10 text-white px-2 py-1 rounded text-xs font-mono border border-white/20 ml-2 flex-shrink-0">${car.tier.toUpperCase()}</span>
                    </div>
                    <p class="text-gold text-sm mb-6 font-mono">${vClass.replace(/_/g, ' ').toUpperCase()}</p>
                    <div class="space-y-5">
                        <div>
                            <div class="flex justify-between text-xs mb-1.5 font-bold"><span class="text-gray-400">🔧 CONDIZIONE</span><span class="text-white">${Math.floor(car.condition)}%</span></div>
                            <div class="w-full bg-black/60 h-3 rounded-full overflow-hidden border border-white/10">
                                <div class="h-full transition-all duration-1000 ease-out ${car.condition > 50 ? 'bg-green-500' : 'bg-red-500'}" style="width:0%" id="anim-cond"></div>
                            </div>
                        </div>
                        <div>
                            <div class="flex justify-between text-xs mb-1.5 font-bold"><span class="text-gray-400">${isElec ? '⚡ BATTERIA' : '⛽ CARBURANTE'}</span><span class="text-white">${isElec ? Math.floor(car.chargeLevel ?? 100) : Math.floor(car.fuel || 100)}%</span></div>
                            <div class="w-full bg-black/60 h-3 rounded-full overflow-hidden border border-white/10">
                                <div class="h-full ${isElec ? 'bg-green-500' : 'bg-blue-500'} transition-all duration-1000 ease-out" style="width:0%" id="anim-fuel"></div>
                            </div>
                        </div>
                        <div>
                            <div class="flex justify-between text-xs mb-1.5 font-bold"><span class="text-gray-400">🛞 PRESSIONE GOMME</span><span class="text-white">${Math.floor(car.tirePressure !== undefined ? car.tirePressure : 100)}%</span></div>
                            <div class="w-full bg-black/60 h-3 rounded-full overflow-hidden border border-white/10">
                                <div class="h-full bg-yellow-500 transition-all duration-1000 ease-out" style="width:0%" id="anim-tire"></div>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-3 mt-4">
                            <div class="bg-black/40 p-3 rounded-lg border border-white/5 flex items-center gap-3 hover:border-white/20 transition-colors">
                                <span class="text-2xl">💺</span>
                                <div><p class="text-[9px] text-gray-500 font-bold">POSTI</p><p class="text-base font-bold text-white">${seats}</p></div>
                            </div>
                            <div class="bg-black/40 p-3 rounded-lg border border-white/5 flex items-center gap-3 hover:border-white/20 transition-colors">
                                <span class="text-2xl">🧳</span>
                                <div><p class="text-[9px] text-gray-500 font-bold">BAGAGLI</p><p class="text-base font-bold text-white">${luggage}</p></div>
                            </div>
                        </div>
                        <div class="mt-4">
                            <p class="text-[9px] text-gray-500 font-bold mb-2 uppercase tracking-widest">Upgrade Installati</p>
                            <div class="flex flex-wrap gap-1.5">
                                ${upgrades.length > 0
                                    ? upgrades.map(u => `<span class="bg-blue-900/40 text-blue-300 border border-blue-500/30 text-[9px] px-2 py-0.5 rounded">${u.replace('upg_','').toUpperCase()}</span>`).join('')
                                    : '<span class="text-gray-600 text-xs italic">Nessun upgrade</span>'}
                            </div>
                        </div>
                    </div>
                </div>
                <button onclick="closeGarage3D()" class="mt-6 w-full py-3 text-sm font-bold uppercase tracking-widest rounded-xl bg-red-900/30 border border-red-500/40 text-red-300 hover:bg-red-900/50 transition-colors">✕ Chiudi Ispezione</button>
            </div>
        </div>`;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.style.cssText = 'position:fixed;inset:0;z-index:110;background:rgba(0,0,0,0.45);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;';

    setTimeout(() => {
        const condEl = document.getElementById('anim-cond');
        const fuelEl = document.getElementById('anim-fuel');
        const tireEl = document.getElementById('anim-tire');
        if (condEl) condEl.style.width = `${Math.floor(car.condition)}%`;
        if (fuelEl) fuelEl.style.width = `${isElec ? Math.floor(car.chargeLevel ?? 100) : Math.floor(car.fuel || 100)}%`;
        if (tireEl) tireEl.style.width = `${Math.floor(car.tirePressure !== undefined ? car.tirePressure : 100)}%`;
    }, 50);
};

window.closeGarage3D = function() {
    const modal = document.getElementById('modal-garage3d');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.style.cssText = '';
        modal.innerHTML = '';
    }
};

function _generateVehicleSVG(vClass, upgrades) {
    const isTinted = upgrades.includes('upg_tint') || upgrades.includes('tint');
    const isArmor  = upgrades.includes('upg_armor') || upgrades.includes('blindatura');
    const hasLivrea = upgrades.includes('upg_vip') || upgrades.includes('livrea') || upgrades.includes('neon');

    const paint1     = isArmor ? '#1a1a1c' : '#232733';
    const paint2     = isArmor ? '#0d0d0e' : '#080a0f';
    const glassColor = isTinted ? '#030303' : '#1e2436';
    const rimColor   = isArmor ? '#333' : '#778090';
    const neonColor  = hasLivrea ? '#00f2ff' : 'none';

    const wheelY = 250;
    const drawWheel = (cx) => `
        <circle cx="${cx}" cy="${wheelY}" r="45" fill="#040404"/>
        <circle cx="${cx}" cy="${wheelY}" r="36" fill="#111"/>
        <circle cx="${cx}" cy="${wheelY}" r="26" fill="none" stroke="${rimColor}" stroke-width="4"/>
        <circle cx="${cx}" cy="${wheelY}" r="10" fill="#444"/>
        <path d="M${cx},${wheelY-26} L${cx},${wheelY+26} M${cx-26},${wheelY} L${cx+26},${wheelY} M${cx-18},${wheelY-18} L${cx+18},${wheelY+18} M${cx-18},${wheelY+18} L${cx+18},${wheelY-18}" stroke="${rimColor}" stroke-width="3"/>
        ${hasLivrea ? `<circle cx="${cx}" cy="${wheelY}" r="46" fill="none" stroke="#00f2ff" stroke-width="1.5" opacity="0.5"/>` : ''}`;

    let bodyPath, windowsPath, details;

    if (vClass === 'mercedes_v') {
        bodyPath    = "M110,140 C110,100 130,90 150,90 L520,90 C560,90 640,140 680,160 L710,230 C715,250 700,250 680,250 L110,250 Z";
        windowsPath = "M150,150 L170,100 L500,100 L620,150 Z";
        details = `${drawWheel(220)} ${drawWheel(580)}
            <path d="M680,160 L710,175 L700,195 L670,180 Z" fill="#eef" filter="url(#glow)"/>
            <path d="M110,140 L100,150 L100,190 L110,190 Z" fill="#f00" filter="url(#glow)"/>
            <line x1="360" y1="100" x2="360" y2="240" stroke="#111" stroke-width="2"/>
            ${hasLivrea ? '<line x1="110" y1="248" x2="680" y2="248" stroke="#00f2ff" stroke-width="2" opacity="0.7"/>' : ''}`;
    } else if (vClass === 'mercedes_sprinter') {
        bodyPath    = "M90,250 L90,50 C90,30 110,20 130,20 L520,20 C550,20 620,130 670,160 L710,240 C715,250 700,250 680,250 Z";
        windowsPath = "M520,60 L600,150 L530,150 Z";
        details = `${drawWheel(220)} ${drawWheel(580)}
            <rect x="130" y="50" width="370" height="180" rx="5" fill="#15171e" stroke="#111" stroke-width="2"/>
            <path d="M670,160 L710,180 L700,200 L660,180 Z" fill="#eef" filter="url(#glow)"/>
            <path d="M90,100 L80,110 L80,200 L90,200 Z" fill="#f00" filter="url(#glow)"/>
            ${hasLivrea ? '<rect x="91" y="248" width="589" height="2" fill="#00f2ff" opacity="0.7"/>' : ''}`;
    } else if (vClass === 'mercedes_s') {
        bodyPath    = "M70,180 L180,175 L330,120 L530,120 L680,175 L780,190 C790,200 790,240 760,250 L70,250 C50,250 50,190 70,180 Z";
        windowsPath = "M195,175 L335,125 L520,125 L650,175 Z";
        details = `${drawWheel(210)} ${drawWheel(630)}
            <path d="M70,240 L780,240" stroke="#444" stroke-width="2"/>
            <path d="M760,190 L780,195 L775,205 L755,200 Z" fill="#fff" filter="url(#glow)"/>
            <path d="M70,185 L60,195 L60,205 L70,205 Z" fill="#f00" filter="url(#glow)"/>
            <rect x="340" y="118" width="170" height="3" rx="1.5" fill="#d4af37" opacity="0.8"/>
            ${hasLivrea ? '<path d="M70,249 L780,249" stroke="#00f2ff" stroke-width="2" opacity="0.7"/>' : ''}`;
    } else if (vClass === 'water_taxi') {
        bodyPath    = "M100,220 C100,250 150,280 200,280 L600,280 C680,280 720,240 750,200 L100,200 Z";
        windowsPath = "M250,200 L300,120 L550,120 L600,200 Z";
        details = `
            <path d="M250,200 L300,120 L550,120 L600,200 Z" fill="#4a2e15" stroke="#2b1a0a" stroke-width="3"/>
            <path d="M280,190 L320,130 L530,130 L570,190 Z" fill="url(#glass)"/>
            <path d="M80,270 Q425,250 780,270" stroke="#00f2ff" stroke-width="2" stroke-dasharray="12 6" opacity="0.4"/>
            <path d="M730,200 L745,205 L740,215 L725,210 Z" fill="#fff" filter="url(#glow)"/>
            <path d="M110,205 L100,210 L100,220 L110,215 Z" fill="#f00" filter="url(#glow)"/>
            <ellipse cx="155" cy="170" rx="25" ry="35" fill="none" stroke="#5a3a1a" stroke-width="3"/>
            <line x1="155" y1="135" x2="155" y2="100" stroke="#5a3a1a" stroke-width="3"/>`;
    } else {
        // Default: mercedes_e sedan
        bodyPath    = "M90,180 L180,175 L310,120 L490,120 L630,175 L740,190 C750,200 750,240 720,250 L90,250 C70,250 70,190 90,180 Z";
        windowsPath = "M195,175 L315,125 L480,125 L610,175 Z";
        details = `${drawWheel(210)} ${drawWheel(600)}
            <rect x="420" y="125" width="15" height="50" fill="#111"/>
            <path d="M720,190 L740,195 L735,205 L715,200 Z" fill="#eef" filter="url(#glow)"/>
            <path d="M90,185 L80,195 L80,205 L90,205 Z" fill="#f00" filter="url(#glow)"/>
            ${hasLivrea ? '<path d="M90,249 L720,249" stroke="#00f2ff" stroke-width="2" opacity="0.7"/>' : ''}`;
    }

    return `<svg viewBox="0 0 850 320" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bodyPaint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${paint1}"/><stop offset="100%" stop-color="${paint2}"/>
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${glassColor}" stop-opacity="0.9"/><stop offset="100%" stop-color="#050505" stop-opacity="0.95"/>
        </linearGradient>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
        <filter id="shadow">
          <feGaussianBlur stdDeviation="18" result="blur"/>
        </filter>
      </defs>
      <ellipse cx="425" cy="278" rx="350" ry="14" fill="#000" filter="url(#shadow)" opacity="0.85"/>
      <path d="${bodyPath}" fill="url(#bodyPaint)" stroke="${isArmor ? '#2a2a30' : '#1a1c28'}" stroke-width="1.5"/>
      ${vClass !== 'water_taxi' ? `<path d="${windowsPath}" fill="url(#glass)"/>` : ''}
      ${details}
    </svg>`;
}

