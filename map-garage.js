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
        ? `<div style="width:60%;position:relative;overflow:hidden;min-height:320px;flex-shrink:0">
               <img src="${carImg}" alt="${car.name}"
                    style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center">
               ${isElec ? `<div style="position:absolute;top:16px;left:16px;background:rgba(34,197,94,0.9);color:#fff;font-size:10px;font-weight:700;padding:4px 8px;border-radius:4px">⚡ CO2 ESENTE</div>` : ''}
               <div style="position:absolute;bottom:12px;left:16px;color:rgba(255,255,255,0.5);font-size:8px;text-transform:uppercase;letter-spacing:.1em;font-family:monospace">${vClass.replace(/_/g,' ').toUpperCase()}</div>
           </div>`
        : `<div style="width:60%;background:rgba(0,0,0,0.8);position:relative;display:flex;align-items:center;justify-content:center;padding:32px;overflow:hidden;min-height:320px;flex-shrink:0">
               <div style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(29,78,216,0.2),rgba(0,0,0,0.9));pointer-events:none"></div>
               <div style="position:relative;z-index:10;width:100%">
                   ${typeof _generateVehicleSVG === 'function' ? _generateVehicleSVG(vClass, upgrades) : ''}
               </div>
           </div>`;

    modal.innerHTML = `
        <div style="background:#161b22;border:1px solid #21262d;border-radius:8px;width:95%;max-width:900px;min-height:500px;overflow:hidden;position:relative;display:flex;flex-direction:row;max-height:90vh">
            ${leftPanel}
            <div style="flex:1;padding:32px;background:#161b22;border-left:1px solid #d6dee8;display:flex;flex-direction:column;justify-content:space-between;overflow-y:auto">
                <div>
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                        <div style="font-size:22px;font-weight:700;color:#e6edf3;text-transform:uppercase;letter-spacing:.06em;line-height:1.2">${car.name}</div>
                        <span style="background:#21262d;color:#e6edf3;padding:4px 8px;border-radius:4px;font-size:10px;font-family:monospace;border:1px solid rgba(255,255,255,0.15);margin-left:8px;flex-shrink:0">${car.tier.toUpperCase()}</span>
                    </div>
                    <div style="color:#c79a2a;font-size:12px;margin-bottom:24px;font-family:monospace">${vClass.replace(/_/g, ' ').toUpperCase()}</div>
                    <div style="display:flex;flex-direction:column;gap:16px">
                        <div>
                            <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:5px;font-weight:700"><span style="color:#6b7280">🔧 CONDIZIONE</span><span style="color:#e6edf3">${Math.floor(car.condition)}%</span></div>
                            <div style="height:10px;border-radius:5px;background:rgba(0,0,0,0.5);overflow:hidden;border:1px solid #21262d">
                                <div style="height:100%;background:${car.condition > 50 ? '#1aa06a' : '#db5746'};transition:width 1s ease-out;width:0%" id="anim-cond"></div>
                            </div>
                        </div>
                        <div>
                            <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:5px;font-weight:700"><span style="color:#6b7280">${isElec ? '⚡ BATTERIA' : '⛽ CARBURANTE'}</span><span style="color:#e6edf3">${isElec ? Math.floor(car.chargeLevel ?? 100) : Math.floor(car.fuel || 100)}%</span></div>
                            <div style="height:10px;border-radius:5px;background:rgba(0,0,0,0.5);overflow:hidden;border:1px solid #21262d">
                                <div style="height:100%;background:${isElec ? '#1aa06a' : '#2f74c0'};transition:width 1s ease-out;width:0%" id="anim-fuel"></div>
                            </div>
                        </div>
                        <div>
                            <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:5px;font-weight:700"><span style="color:#6b7280">🛞 PRESSIONE GOMME</span><span style="color:#e6edf3">${Math.floor(car.tirePressure !== undefined ? car.tirePressure : 100)}%</span></div>
                            <div style="height:10px;border-radius:5px;background:rgba(0,0,0,0.5);overflow:hidden;border:1px solid #21262d">
                                <div style="height:100%;background:#e0922e;transition:width 1s ease-out;width:0%" id="anim-tire"></div>
                            </div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:4px">
                            <div style="background:rgba(0,0,0,0.35);padding:12px;border-radius:6px;border:1px solid #eef1f5;display:flex;align-items:center;gap:12px">
                                <span style="font-size:22px">💺</span>
                                <div><div style="font-size:9px;color:#6b7280;font-weight:700">POSTI</div><div style="font-size:16px;font-weight:700;color:#e6edf3">${seats}</div></div>
                            </div>
                            <div style="background:rgba(0,0,0,0.35);padding:12px;border-radius:6px;border:1px solid #eef1f5;display:flex;align-items:center;gap:12px">
                                <span style="font-size:22px">🧳</span>
                                <div><div style="font-size:9px;color:#6b7280;font-weight:700">BAGAGLI</div><div style="font-size:16px;font-weight:700;color:#e6edf3">${luggage}</div></div>
                            </div>
                        </div>
                        <div>
                            <div style="font-size:9px;color:#6b7280;font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em">Upgrade Installati</div>
                            <div style="display:flex;flex-wrap:wrap;gap:6px">
                                ${upgrades.length > 0
                                    ? upgrades.map(u => `<span style="background:rgba(88,166,255,0.12);color:#2f74c0;border:1px solid rgba(88,166,255,0.3);font-size:9px;padding:2px 8px;border-radius:4px">${u.replace('upg_','').toUpperCase()}</span>`).join('')
                                    : '<span style="color:#6b7280;font-size:11px;font-style:italic">Nessun upgrade</span>'}
                            </div>
                        </div>
                    </div>
                </div>
                <button ${ceAct('closeGarage3D', [])} style="margin-top:24px;width:100%;padding:12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;border-radius:6px;background:rgba(127,29,29,0.3);border:1px solid rgba(185,28,28,0.4);color:#db5746;cursor:pointer;transition:all .15s">✕ Chiudi Ispezione</button>
            </div>
        </div>`;

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
        modal.style.display = 'none';
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
    const neonColor  = hasLivrea ? '#2f74c0' : 'none';

    const wheelY = 250;
    const drawWheel = (cx) => `
        <circle cx="${cx}" cy="${wheelY}" r="45" fill="#040404"/>
        <circle cx="${cx}" cy="${wheelY}" r="36" fill="#111"/>
        <circle cx="${cx}" cy="${wheelY}" r="26" fill="none" stroke="${rimColor}" stroke-width="4"/>
        <circle cx="${cx}" cy="${wheelY}" r="10" fill="#444"/>
        <path d="M${cx},${wheelY-26} L${cx},${wheelY+26} M${cx-26},${wheelY} L${cx+26},${wheelY} M${cx-18},${wheelY-18} L${cx+18},${wheelY+18} M${cx-18},${wheelY+18} L${cx+18},${wheelY-18}" stroke="${rimColor}" stroke-width="3"/>
        ${hasLivrea ? `<circle cx="${cx}" cy="${wheelY}" r="46" fill="none" stroke="#2f74c0" stroke-width="1.5" opacity="0.5"/>` : ''}`;

    let bodyPath, windowsPath, details;

    if (vClass === 'mercedes_v') {
        bodyPath    = "M110,140 C110,100 130,90 150,90 L520,90 C560,90 640,140 680,160 L710,230 C715,250 700,250 680,250 L110,250 Z";
        windowsPath = "M150,150 L170,100 L500,100 L620,150 Z";
        details = `${drawWheel(220)} ${drawWheel(580)}
            <path d="M680,160 L710,175 L700,195 L670,180 Z" fill="#eef" filter="url(#glow)"/>
            <path d="M110,140 L100,150 L100,190 L110,190 Z" fill="#f00" filter="url(#glow)"/>
            <line x1="360" y1="100" x2="360" y2="240" stroke="#111" stroke-width="2"/>
            ${hasLivrea ? '<line x1="110" y1="248" x2="680" y2="248" stroke="#2f74c0" stroke-width="2" opacity="0.7"/>' : ''}`;
    } else if (vClass === 'mercedes_sprinter') {
        bodyPath    = "M90,250 L90,50 C90,30 110,20 130,20 L520,20 C550,20 620,130 670,160 L710,240 C715,250 700,250 680,250 Z";
        windowsPath = "M520,60 L600,150 L530,150 Z";
        details = `${drawWheel(220)} ${drawWheel(580)}
            <rect x="130" y="50" width="370" height="180" rx="5" fill="#15171e" stroke="#111" stroke-width="2"/>
            <path d="M670,160 L710,180 L700,200 L660,180 Z" fill="#eef" filter="url(#glow)"/>
            <path d="M90,100 L80,110 L80,200 L90,200 Z" fill="#f00" filter="url(#glow)"/>
            ${hasLivrea ? '<rect x="91" y="248" width="589" height="2" fill="#2f74c0" opacity="0.7"/>' : ''}`;
    } else if (vClass === 'mercedes_s') {
        bodyPath    = "M70,180 L180,175 L330,120 L530,120 L680,175 L780,190 C790,200 790,240 760,250 L70,250 C50,250 50,190 70,180 Z";
        windowsPath = "M195,175 L335,125 L520,125 L650,175 Z";
        details = `${drawWheel(210)} ${drawWheel(630)}
            <path d="M70,240 L780,240" stroke="#444" stroke-width="2"/>
            <path d="M760,190 L780,195 L775,205 L755,200 Z" fill="#fff" filter="url(#glow)"/>
            <path d="M70,185 L60,195 L60,205 L70,205 Z" fill="#f00" filter="url(#glow)"/>
            <rect x="340" y="118" width="170" height="3" rx="1.5" fill="#c79a2a" opacity="0.8"/>
            ${hasLivrea ? '<path d="M70,249 L780,249" stroke="#2f74c0" stroke-width="2" opacity="0.7"/>' : ''}`;
    } else if (vClass === 'water_taxi') {
        bodyPath    = "M100,220 C100,250 150,280 200,280 L600,280 C680,280 720,240 750,200 L100,200 Z";
        windowsPath = "M250,200 L300,120 L550,120 L600,200 Z";
        details = `
            <path d="M250,200 L300,120 L550,120 L600,200 Z" fill="#4a2e15" stroke="#2b1a0a" stroke-width="3"/>
            <path d="M280,190 L320,130 L530,130 L570,190 Z" fill="url(#glass)"/>
            <path d="M80,270 Q425,250 780,270" stroke="#2f74c0" stroke-width="2" stroke-dasharray="12 6" opacity="0.4"/>
            <path d="M730,200 L745,205 L740,215 L725,210 Z" fill="#fff" filter="url(#glow)"/>
            <path d="M110,205 L100,210 L100,220 L110,215 Z" fill="#f00" filter="url(#glow)"/>
            <ellipse cx="155" cy="170" rx="25" ry="35" fill="none" stroke="#f0d2a8" stroke-width="3"/>
            <line x1="155" y1="135" x2="155" y2="100" stroke="#f0d2a8" stroke-width="3"/>`;
    } else {
        // Default: mercedes_e sedan
        bodyPath    = "M90,180 L180,175 L310,120 L490,120 L630,175 L740,190 C750,200 750,240 720,250 L90,250 C70,250 70,190 90,180 Z";
        windowsPath = "M195,175 L315,125 L480,125 L610,175 Z";
        details = `${drawWheel(210)} ${drawWheel(600)}
            <rect x="420" y="125" width="15" height="50" fill="#111"/>
            <path d="M720,190 L740,195 L735,205 L715,200 Z" fill="#eef" filter="url(#glow)"/>
            <path d="M90,185 L80,195 L80,205 L90,205 Z" fill="#f00" filter="url(#glow)"/>
            ${hasLivrea ? '<path d="M90,249 L720,249" stroke="#2f74c0" stroke-width="2" opacity="0.7"/>' : ''}`;
    }

    return `<svg viewBox="0 0 850 320" style="width:100%;height:auto" xmlns="http://www.w3.org/2000/svg">
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

