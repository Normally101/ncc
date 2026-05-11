'use strict';
/* ====================================================================
   showroom.js — Chauffeur Empire · Showroom & Configuratore Veicoli
   ==================================================================== */

const _SRM_CATALOG = [
    { id:'stellar_e_exec',     name:'Stellar E-Executive',  tier:'business', price:120000,  body:'sedan',    fuel:'gasoline',
      stats:{ prestigio:6, comfort:7, durabilita:8, velocita:6 },
      desc:'Berlina executive di riferimento. Equilibrio perfetto tra rappresentanza e affidabilità operativa.' },
    { id:'stellar_q_exec',     name:'Stellar Q-Executive',  tier:'business', price:95000,   body:'sedan',    fuel:'electric',
      stats:{ prestigio:7, comfort:7, durabilita:8, velocita:7 },
      desc:'Controparte full-electric. Silenzio assoluto in cabina, zero emissioni, ricarica rapida.' },
    { id:'stellar_v_carr',     name:'Stellar V-Carrier',    tier:'business', price:95000,   body:'van',      fuel:'gasoline',
      stats:{ prestigio:6, comfort:8, durabilita:8, velocita:5 },
      desc:'Monovolume di alta classe per trasporti di gruppo in comfort superiore.' },
    { id:'stellar_q_carr',     name:'Stellar Q-Carrier',    tier:'business', price:110000,  body:'van',      fuel:'electric',
      stats:{ prestigio:7, comfort:8, durabilita:8, velocita:6 },
      desc:'Minivan elettrico sette posti. Zero emissioni per clienti corporate esigenti.' },
    { id:'volt_y_cross',       name:'Volt Y-Cross',         tier:'business', price:70000,   body:'suv',      fuel:'electric',
      stats:{ prestigio:6, comfort:7, durabilita:8, velocita:7 },
      desc:'SUV elettrico crossover. Versatile e sostenibile, per ogni territorio e clientela.' },
    { id:'stellar_g_over',     name:'Stellar G-Overlord',   tier:'ultra',    price:950000,  body:'suv',      fuel:'gasoline',
      stats:{ prestigio:9, comfort:9, durabilita:10, velocita:8 },
      desc:'SUV ultra-blindato off-road. Comfort presidenziale in qualsiasi contesto operativo.' },
    { id:'stellar_s_imp',      name:'Stellar S-Imperial',   tier:'vip',      price:480000,  body:'limo',     fuel:'gasoline',
      stats:{ prestigio:9, comfort:9, durabilita:8, velocita:7 },
      desc:'Limousine presidenziale. Salone posteriore 2,1 m, isolamento acustico totale, privacy vetri.' },
    { id:'stellar_q_imp',      name:'Stellar Q-Imperial',   tier:'vip',      price:320000,  body:'limo',     fuel:'electric',
      stats:{ prestigio:9, comfort:9, durabilita:8, velocita:8 },
      desc:'Limousine elettrica ultra-silenziosa. Zero emissioni per la clientela più esigente.' },
    { id:'majestic_spirit',    name:'Majestic Spirit',      tier:'ultra',    price:2000000, body:'limo',     fuel:'gasoline',
      stats:{ prestigio:10, comfort:10, durabilita:9, velocita:9 },
      desc:'Il pinnacolo della mobilità terrestre. Commissionato da capi di stato e oligarchi.' },
    { id:'volt_s_apex',        name:'Volt S-Apex',          tier:'vip',      price:560000,  body:'hypercar', fuel:'electric',
      stats:{ prestigio:10, comfort:8, durabilita:7, velocita:10 },
      desc:'Hypercar elettrica da 1.020 CV. Tariffe VIP premium per clienti che non accettano compromessi.' },
];

const _SRM_OPTIONS = [
    { group:'Esterni',  id:'opt_vernice_pearl',    name:'Vernice Madreperla',      price:4000,  mods:{ prestigio:1 } },
    { group:'Esterni',  id:'opt_cerchi_21',         name:'Cerchi 21" Forgiati',     price:6000,  mods:{ velocita:1 } },
    { group:'Esterni',  id:'opt_tetto_panoramico',  name:'Tetto Panoramico',        price:3500,  mods:{ comfort:1 } },
    { group:'Esterni',  id:'opt_oscuramento',       name:'Oscuramento Integrale',   price:1500,  mods:{ prestigio:1 } },
    { group:'Interni',  id:'opt_pelle_nappa',       name:'Pelle Nappa Piena',       price:8000,  mods:{ comfort:2 } },
    { group:'Interni',  id:'opt_massaggi',          name:'Sedili Massaggianti',     price:5000,  mods:{ comfort:1 } },
    { group:'Interni',  id:'opt_audio_bespoke',     name:'Audio Bespoke 1500W',     price:7000,  mods:{ comfort:1, prestigio:1 } },
    { group:'Interni',  id:'opt_bar_bordo',         name:'Minibar a Bordo',         price:4500,  mods:{ comfort:1 } },
    { group:'Speciali', id:'opt_blindatura',        name:'Blindatura B4',           price:45000, mods:{ durabilita:3 } },
    { group:'Speciali', id:'opt_chauffeur_ai',      name:'Chauffeur AI System',     price:15000, mods:{ velocita:1, prestigio:2 } },
];

/* ── SVG silhouettes ────────────────────────────────────────────────── */
const _SRM_SVG = {
    sedan: `<svg viewBox="0 0 400 170" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1e3a5f"/><stop offset="100%" stop-color="#0a0f1e"/></linearGradient></defs>
  <path d="M30,128 L30,98 Q40,58 80,50 L160,40 Q200,36 240,40 L320,50 Q356,58 366,98 L370,128 Z" fill="url(#sg)" stroke="#00d4ff" stroke-width="1.5"/>
  <path d="M90,50 L115,18 Q145,6 200,6 Q255,6 280,18 L305,50 Z" fill="rgba(0,212,255,0.07)" stroke="#00d4ff" stroke-width="1"/>
  <path d="M98,49 L118,20 Q136,10 170,10 L170,49 Z" fill="rgba(0,212,255,0.14)" stroke="rgba(0,212,255,0.3)" stroke-width="0.5"/>
  <path d="M175,10 Q224,8 254,17 L274,49 L175,49 Z" fill="rgba(0,212,255,0.14)" stroke="rgba(0,212,255,0.3)" stroke-width="0.5"/>
  <path d="M280,18 L298,49 L262,49 Z" fill="rgba(0,212,255,0.1)" stroke="rgba(0,212,255,0.3)" stroke-width="0.5"/>
  <rect x="366" y="116" width="14" height="6" rx="2" fill="#00d4ff" opacity="0.85"/>
  <rect x="20" y="116" width="12" height="5" rx="1" fill="#ff4444" opacity="0.7"/>
  <circle cx="90" cy="132" r="26" fill="#0a0f1e" stroke="#00d4ff" stroke-width="1.5"/>
  <circle cx="90" cy="132" r="11" fill="#1e3a5f" stroke="#00d4ff" stroke-width="1"/>
  <circle cx="310" cy="132" r="26" fill="#0a0f1e" stroke="#00d4ff" stroke-width="1.5"/>
  <circle cx="310" cy="132" r="11" fill="#1e3a5f" stroke="#00d4ff" stroke-width="1"/>
  <line x1="0" y1="158" x2="400" y2="158" stroke="rgba(0,212,255,0.18)" stroke-width="1"/>
  <ellipse cx="90" cy="160" rx="31" ry="3.5" fill="rgba(0,0,0,0.5)"/>
  <ellipse cx="310" cy="160" rx="31" ry="3.5" fill="rgba(0,0,0,0.5)"/>
</svg>`,

    van: `<svg viewBox="0 0 400 170" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="vg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1e3a5f"/><stop offset="100%" stop-color="#0a0f1e"/></linearGradient></defs>
  <path d="M28,128 L28,44 Q34,36 58,33 L330,33 Q356,36 368,54 L374,128 Z" fill="url(#vg)" stroke="#00d4ff" stroke-width="1.5"/>
  <path d="M58,33 L58,20 Q64,14 100,12 L300,12 Q330,14 330,33" fill="rgba(0,212,255,0.04)" stroke="#00d4ff" stroke-width="0.8"/>
  <rect x="78" y="46" width="54" height="40" rx="3" fill="rgba(0,212,255,0.14)" stroke="rgba(0,212,255,0.4)" stroke-width="0.8"/>
  <rect x="140" y="46" width="60" height="40" rx="3" fill="rgba(0,212,255,0.11)" stroke="rgba(0,212,255,0.3)" stroke-width="0.8"/>
  <rect x="208" y="46" width="60" height="40" rx="3" fill="rgba(0,212,255,0.11)" stroke="rgba(0,212,255,0.3)" stroke-width="0.8"/>
  <path d="M28,44 L28,82 L74,82 L74,46 Q52,43 28,44 Z" fill="rgba(0,212,255,0.14)" stroke="rgba(0,212,255,0.28)" stroke-width="0.8"/>
  <rect x="16" y="104" width="14" height="8" rx="2" fill="#00d4ff" opacity="0.9"/>
  <rect x="368" y="100" width="12" height="8" rx="2" fill="#ff4444" opacity="0.8"/>
  <circle cx="98" cy="132" r="26" fill="#0a0f1e" stroke="#00d4ff" stroke-width="1.5"/>
  <circle cx="98" cy="132" r="11" fill="#1e3a5f" stroke="#00d4ff" stroke-width="1"/>
  <circle cx="302" cy="132" r="26" fill="#0a0f1e" stroke="#00d4ff" stroke-width="1.5"/>
  <circle cx="302" cy="132" r="11" fill="#1e3a5f" stroke="#00d4ff" stroke-width="1"/>
  <line x1="0" y1="158" x2="400" y2="158" stroke="rgba(0,212,255,0.18)" stroke-width="1"/>
  <ellipse cx="98" cy="160" rx="31" ry="3.5" fill="rgba(0,0,0,0.5)"/>
  <ellipse cx="302" cy="160" rx="31" ry="3.5" fill="rgba(0,0,0,0.5)"/>
</svg>`,

    suv: `<svg viewBox="0 0 400 170" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="sg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1e3a5f"/><stop offset="100%" stop-color="#0a0f1e"/></linearGradient></defs>
  <path d="M24,128 L24,93 Q28,58 46,48 L90,36 Q130,26 200,26 Q270,26 310,36 L354,48 Q370,58 376,93 L376,128 Z" fill="url(#sg2)" stroke="#00d4ff" stroke-width="1.5"/>
  <rect x="87" y="16" width="226" height="21" rx="4" fill="rgba(0,212,255,0.04)" stroke="#00d4ff" stroke-width="0.8"/>
  <rect x="94" y="34" width="68" height="36" rx="3" fill="rgba(0,212,255,0.14)" stroke="rgba(0,212,255,0.35)" stroke-width="0.8"/>
  <rect x="170" y="34" width="74" height="36" rx="3" fill="rgba(0,212,255,0.11)" stroke="rgba(0,212,255,0.28)" stroke-width="0.8"/>
  <rect x="252" y="34" width="52" height="36" rx="3" fill="rgba(0,212,255,0.11)" stroke="rgba(0,212,255,0.28)" stroke-width="0.8"/>
  <line x1="100" y1="16" x2="100" y2="26" stroke="rgba(0,212,255,0.35)" stroke-width="1"/>
  <line x1="200" y1="16" x2="200" y2="26" stroke="rgba(0,212,255,0.35)" stroke-width="1"/>
  <line x1="298" y1="16" x2="298" y2="26" stroke="rgba(0,212,255,0.35)" stroke-width="1"/>
  <rect x="13" y="96" width="16" height="8" rx="2" fill="#00d4ff" opacity="0.9"/>
  <rect x="370" y="96" width="14" height="7" rx="2" fill="#ff4444" opacity="0.8"/>
  <circle cx="94" cy="132" r="30" fill="#0a0f1e" stroke="#00d4ff" stroke-width="1.5"/>
  <circle cx="94" cy="132" r="13" fill="#1e3a5f" stroke="#00d4ff" stroke-width="1"/>
  <circle cx="306" cy="132" r="30" fill="#0a0f1e" stroke="#00d4ff" stroke-width="1.5"/>
  <circle cx="306" cy="132" r="13" fill="#1e3a5f" stroke="#00d4ff" stroke-width="1"/>
  <line x1="0" y1="162" x2="400" y2="162" stroke="rgba(0,212,255,0.18)" stroke-width="1"/>
  <ellipse cx="94" cy="164" rx="35" ry="3.5" fill="rgba(0,0,0,0.5)"/>
  <ellipse cx="306" cy="164" rx="35" ry="3.5" fill="rgba(0,0,0,0.5)"/>
</svg>`,

    limo: `<svg viewBox="0 0 400 170" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a1a3e"/><stop offset="100%" stop-color="#050510"/></linearGradient></defs>
  <path d="M18,128 L18,98 Q26,60 54,50 L88,42 L200,36 L312,42 L346,50 Q368,60 378,98 L380,128 Z" fill="url(#lg)" stroke="#d4af37" stroke-width="1.5"/>
  <path d="M76,42 L96,14 Q114,4 146,4 L180,4 L180,42 Z" fill="rgba(212,175,55,0.07)" stroke="#d4af37" stroke-width="1"/>
  <path d="M183,4 L310,12 L320,42 L183,42 Z" fill="rgba(212,175,55,0.05)" stroke="#d4af37" stroke-width="0.8"/>
  <line x1="180" y1="4" x2="183" y2="42" stroke="rgba(212,175,55,0.5)" stroke-width="1.5"/>
  <line x1="18" y1="103" x2="380" y2="103" stroke="rgba(212,175,55,0.35)" stroke-width="0.8"/>
  <rect x="224" y="18" width="22" height="16" rx="3" fill="rgba(212,175,55,0.11)" stroke="rgba(212,175,55,0.28)" stroke-width="0.5"/>
  <rect x="254" y="18" width="22" height="16" rx="3" fill="rgba(212,175,55,0.11)" stroke="rgba(212,175,55,0.28)" stroke-width="0.5"/>
  <rect x="284" y="18" width="22" height="16" rx="3" fill="rgba(212,175,55,0.11)" stroke="rgba(212,175,55,0.28)" stroke-width="0.5"/>
  <rect x="8" y="106" width="14" height="6" rx="2" fill="#fff8dc" opacity="0.9"/>
  <rect x="376" y="106" width="12" height="5" rx="1" fill="#ff4444" opacity="0.8"/>
  <circle cx="83" cy="132" r="25" fill="#050510" stroke="#d4af37" stroke-width="1.5"/>
  <circle cx="83" cy="132" r="10" fill="#1a1a3e" stroke="#d4af37" stroke-width="1"/>
  <circle cx="190" cy="132" r="25" fill="#050510" stroke="#d4af37" stroke-width="1.5"/>
  <circle cx="190" cy="132" r="10" fill="#1a1a3e" stroke="#d4af37" stroke-width="1"/>
  <circle cx="310" cy="132" r="25" fill="#050510" stroke="#d4af37" stroke-width="1.5"/>
  <circle cx="310" cy="132" r="10" fill="#1a1a3e" stroke="#d4af37" stroke-width="1"/>
  <line x1="0" y1="157" x2="400" y2="157" stroke="rgba(212,175,55,0.22)" stroke-width="1"/>
  <ellipse cx="83" cy="159" rx="29" ry="3" fill="rgba(0,0,0,0.6)"/>
  <ellipse cx="190" cy="159" rx="29" ry="3" fill="rgba(0,0,0,0.6)"/>
  <ellipse cx="310" cy="159" rx="29" ry="3" fill="rgba(0,0,0,0.6)"/>
</svg>`,

    hypercar: `<svg viewBox="0 0 400 170" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a0a30"/><stop offset="100%" stop-color="#0a0010"/></linearGradient></defs>
  <path d="M14,128 L14,113 Q24,93 54,78 L108,60 Q160,44 200,42 Q240,42 284,50 L338,66 Q368,80 382,108 L384,128 Z" fill="url(#hg)" stroke="#b040ff" stroke-width="1.5"/>
  <path d="M118,60 L143,26 Q168,12 200,10 Q234,12 264,26 L284,50 Z" fill="rgba(176,64,255,0.09)" stroke="#b040ff" stroke-width="1"/>
  <path d="M133,58 L153,28 Q176,14 200,12 Q228,14 250,28 L267,50 Z" fill="rgba(176,64,255,0.17)" stroke="rgba(176,64,255,0.38)" stroke-width="0.8"/>
  <path d="M318,66 L338,52 L382,108 L360,108 Z" fill="rgba(176,64,255,0.1)" stroke="#b040ff" stroke-width="0.8"/>
  <line x1="103" y1="83" x2="126" y2="93" stroke="rgba(176,64,255,0.55)" stroke-width="1.2"/>
  <line x1="103" y1="90" x2="126" y2="99" stroke="rgba(176,64,255,0.35)" stroke-width="1"/>
  <path d="M14,113 L28,106 L28,118 L14,123 Z" fill="#b040ff" opacity="0.9"/>
  <path d="M374,108 L384,108 L384,118 L371,120 Z" fill="#ff2020" opacity="0.9"/>
  <circle cx="98" cy="132" r="28" fill="#0a0010" stroke="#b040ff" stroke-width="1.5"/>
  <circle cx="98" cy="132" r="12" fill="#1a0a30" stroke="#b040ff" stroke-width="1"/>
  <circle cx="298" cy="132" r="28" fill="#0a0010" stroke="#b040ff" stroke-width="1.5"/>
  <circle cx="298" cy="132" r="12" fill="#1a0a30" stroke="#b040ff" stroke-width="1"/>
  <line x1="0" y1="160" x2="400" y2="160" stroke="rgba(176,64,255,0.2)" stroke-width="1"/>
  <ellipse cx="98" cy="162" rx="33" ry="3.5" fill="rgba(0,0,0,0.6)"/>
  <ellipse cx="298" cy="162" rx="33" ry="3.5" fill="rgba(0,0,0,0.6)"/>
</svg>`,
};

/* ── Module state ───────────────────────────────────────────────────── */
const _srmState = {
    selectedId:     null,
    selectedOpts:   new Set(),
    animFrame:      null,
    displayedPrice: 0,
    targetPrice:    0,
};

/* ── Helpers ────────────────────────────────────────────────────────── */
function _srmCurrentVehicle() {
    return _SRM_CATALOG.find(c => c.id === _srmState.selectedId) || null;
}

function _srmComputeStats(v) {
    const s = { ...v.stats };
    for (const oid of _srmState.selectedOpts) {
        const opt = _SRM_OPTIONS.find(o => o.id === oid);
        if (opt) for (const [k, val] of Object.entries(opt.mods)) s[k] = Math.min(12, (s[k] || 0) + val);
    }
    return s;
}

function _srmTotalPrice() {
    const v = _srmCurrentVehicle();
    if (!v) return 0;
    let t = v.price;
    for (const oid of _srmState.selectedOpts) {
        const opt = _SRM_OPTIONS.find(o => o.id === oid);
        if (opt) t += opt.price;
    }
    return t;
}

function _srmTierColor(tier) {
    return { standard:'#9ca3af', business:'#60a5fa', vip:'#d4af37', ultra:'#b040ff' }[tier] || '#9ca3af';
}

function _srmAccent(body) {
    return body === 'limo' ? '#d4af37' : body === 'hypercar' ? '#b040ff' : '#00d4ff';
}

function _srmStatMeta() {
    return { prestigio:'🌟 Prestigio', comfort:'🛋️ Comfort', durabilita:'🛡️ Durabilità', velocita:'⚡ Velocità' };
}

/* ── CSS injection (once) ───────────────────────────────────────────── */
function _srmInjectStyles() {
    if (document.getElementById('srm-styles')) return;
    const st = document.createElement('style');
    st.id = 'srm-styles';
    st.textContent = `
        #srm-wrap {
            display: grid;
            grid-template-columns: 230px 1fr 270px;
            height: 100%;
            min-height: 560px;
            background: #070c14;
        }
        #srm-left {
            padding: 14px 10px;
            border-right: 1px solid rgba(0,212,255,0.1);
            overflow-y: auto;
        }
        #srm-center {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px 16px;
            background: radial-gradient(ellipse at 50% 65%, rgba(0,80,120,0.13) 0%, transparent 70%);
        }
        #srm-right {
            padding: 14px 10px;
            border-left: 1px solid rgba(0,212,255,0.1);
            overflow-y: auto;
        }
        .srm-vh {
            font-size: 9px;
            color: #4b5563;
            text-transform: uppercase;
            letter-spacing: .12em;
            margin-bottom: 8px;
            padding-bottom: 4px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .srm-card {
            padding: 9px 11px;
            border-radius: 8px;
            border: 1px solid rgba(0,212,255,0.09);
            margin-bottom: 5px;
            cursor: pointer;
            transition: all .18s;
            background: rgba(0,20,40,0.35);
        }
        .srm-card:hover { border-color: rgba(0,212,255,0.32); background: rgba(0,40,80,0.38); }
        .srm-card.srm-active { border-color: rgba(0,212,255,0.65); background: rgba(0,55,95,0.48); box-shadow: 0 0 10px rgba(0,212,255,0.12); }
        .srm-card-tier { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
        .srm-card-name { font-size: 12px; font-weight: 600; color: #e2e8f0; margin-top: 1px; }
        .srm-card-price { font-size: 10px; color: #9ca3af; margin-top: 2px; display: flex; align-items: center; gap: 5px; }
        .srm-fuel { display: inline-block; font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 3px; text-transform: uppercase; letter-spacing: .04em; }
        .srm-fuel-electric { background: rgba(34,211,238,0.14); color: #22d3ee; }
        .srm-fuel-gasoline  { background: rgba(251,191,36,0.11); color: #fbbf24; }
        #srm-sil { width: 100%; max-width: 400px; }
        #srm-vname { font-size: 18px; font-weight: 700; color: #e2e8f0; text-align: center; margin: 10px 0 3px; }
        #srm-vdesc { font-size: 11px; color: #6b7280; text-align: center; max-width: 370px; line-height: 1.5; margin-bottom: 10px; }
        #srm-price {
            font-size: 26px; font-weight: 700; color: #00d4ff;
            font-family: 'Courier New', monospace; letter-spacing: .04em;
            text-align: center; margin: 8px 0 14px;
        }
        .srm-stats { width: 100%; max-width: 340px; }
        .srm-stat-row { margin-bottom: 8px; }
        .srm-stat-hd { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: .07em; display: flex; justify-content: space-between; margin-bottom: 3px; }
        .srm-stat-track { height: 5px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; }
        .srm-stat-fill { height: 100%; border-radius: 3px; transition: width .45s cubic-bezier(.4,0,.2,1); }
        .srm-opt-group { margin-bottom: 12px; }
        .srm-opt-gh { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #4b5563; margin-bottom: 5px; }
        .srm-opt {
            display: flex; align-items: flex-start; gap: 7px;
            padding: 7px 9px; border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.06);
            margin-bottom: 3px; cursor: pointer; transition: all .18s;
        }
        .srm-opt:hover { border-color: rgba(0,212,255,0.28); background: rgba(0,40,80,0.28); }
        .srm-opt.srm-sel { border-color: rgba(0,212,255,0.55); background: rgba(0,55,95,0.38); }
        .srm-opt-chk {
            width: 15px; height: 15px; border-radius: 3px;
            border: 1px solid rgba(255,255,255,0.18);
            display: flex; align-items: center; justify-content: center;
            font-size: 9px; flex-shrink: 0; margin-top: 1px; transition: all .14s;
        }
        .srm-opt.srm-sel .srm-opt-chk { background: #00d4ff; border-color: #00d4ff; color: #000; }
        .srm-opt-name { font-size: 11px; color: #e2e8f0; }
        .srm-opt-price { font-size: 10px; color: #6b7280; }
        .srm-opt-mods  { font-size: 9px; color: #22d3ee; margin-top: 1px; }
        #srm-buy {
            width: 100%; padding: 13px; border-radius: 9px; font-size: 13px;
            font-weight: 700; cursor: pointer; border: none; transition: all .2s;
            text-transform: uppercase; letter-spacing: .1em; margin-top: 10px;
        }
        #srm-buy:not(:disabled) {
            background: linear-gradient(135deg, #00a8cc, #006699);
            color: #fff; box-shadow: 0 4px 18px rgba(0,160,200,0.28);
        }
        #srm-buy:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 6px 26px rgba(0,160,200,0.42); }
        #srm-buy:disabled { background: rgba(255,255,255,0.05); color: #374151; cursor: not-allowed; }
    `;
    document.head.appendChild(st);
}

/* ── Main render ────────────────────────────────────────────────────── */
function renderTabShowroom() {
    const container = document.getElementById('tab-container');
    if (!container) return;
    _srmInjectStyles();

    if (!_srmState.selectedId) _srmState.selectedId = _SRM_CATALOG[0].id;
    const v = _srmCurrentVehicle();
    const accent = v ? _srmAccent(v.body) : '#00d4ff';
    const statMeta = _srmStatMeta();

    const vehicleList = _SRM_CATALOG.map(c => {
        const active = c.id === _srmState.selectedId;
        return `<div class="srm-card${active ? ' srm-active' : ''}" onclick="window._srmSelect('${c.id}')">
            <div class="srm-card-tier" style="color:${_srmTierColor(c.tier)}">${c.tier.toUpperCase()}</div>
            <div class="srm-card-name">${c.name}</div>
            <div class="srm-card-price">
                € ${c.price.toLocaleString('it-IT')}
                <span class="srm-fuel srm-fuel-${c.fuel}">${c.fuel === 'electric' ? '⚡ EV' : '⛽ Gas'}</span>
            </div>
        </div>`;
    }).join('');

    const optGroups = ['Esterni', 'Interni', 'Speciali'].map(g => {
        const items = _SRM_OPTIONS.filter(o => o.group === g).map(o => {
            const sel = _srmState.selectedOpts.has(o.id);
            const modStr = Object.entries(o.mods).map(([k, val]) => `+${val} ${k}`).join(' · ');
            return `<div class="srm-opt${sel ? ' srm-sel' : ''}" onclick="window._srmToggle('${o.id}')">
                <div class="srm-opt-chk">${sel ? '✓' : ''}</div>
                <div>
                    <div class="srm-opt-name">${o.name}</div>
                    <div class="srm-opt-price">+€ ${o.price.toLocaleString('it-IT')}</div>
                    <div class="srm-opt-mods">${modStr}</div>
                </div>
            </div>`;
        }).join('');
        return `<div class="srm-opt-group"><div class="srm-opt-gh">${g}</div>${items}</div>`;
    }).join('');

    const statBars = Object.keys(statMeta).map(s => `
        <div class="srm-stat-row">
            <div class="srm-stat-hd"><span>${statMeta[s]}</span><span id="srm-sv-${s}">—</span></div>
            <div class="srm-stat-track"><div class="srm-stat-fill" id="srm-sb-${s}" style="width:0%;background:${accent}"></div></div>
        </div>`).join('');

    container.innerHTML = `<div id="srm-wrap">
        <div id="srm-left">
            <div class="srm-vh">Modelli Disponibili</div>
            ${vehicleList}
        </div>
        <div id="srm-center">
            <div id="srm-sil">${v ? (_SRM_SVG[v.body] || _SRM_SVG.sedan) : ''}</div>
            <div id="srm-vname">${v ? v.name : '—'}</div>
            <div id="srm-vdesc">${v ? v.desc : ''}</div>
            <div id="srm-price">€ ${v ? v.price.toLocaleString('it-IT') : '0'}</div>
            <div class="srm-stats">${statBars}</div>
        </div>
        <div id="srm-right">
            <div class="srm-vh">Opzionali Configuratore</div>
            ${optGroups}
            <button id="srm-buy" onclick="window._srmPurchase()"${v ? '' : ' disabled'}>
                Acquista Veicolo
            </button>
        </div>
    </div>`;

    _srmUpdateDisplay(true);
}

/* ── Vehicle selection ──────────────────────────────────────────────── */
window._srmSelect = function(vehicleId) {
    _srmState.selectedId = vehicleId;
    _srmState.selectedOpts.clear();
    renderTabShowroom();
};

/* ── Option toggle ──────────────────────────────────────────────────── */
window._srmToggle = function(optId) {
    if (_srmState.selectedOpts.has(optId)) {
        _srmState.selectedOpts.delete(optId);
    } else {
        _srmState.selectedOpts.add(optId);
    }
    // Partial DOM update — no full re-render
    document.querySelectorAll('.srm-opt').forEach(el => {
        const m = el.getAttribute('onclick')?.match(/'([^']+)'/);
        if (!m) return;
        const sel = _srmState.selectedOpts.has(m[1]);
        el.classList.toggle('srm-sel', sel);
        const chk = el.querySelector('.srm-opt-chk');
        if (chk) chk.textContent = sel ? '✓' : '';
    });
    _srmUpdateDisplay(false);
};

/* ── Live display update (stats + animated price) ───────────────────── */
function _srmUpdateDisplay(instant) {
    const v = _srmCurrentVehicle();
    if (!v) return;

    const stats  = _srmComputeStats(v);
    const accent = _srmAccent(v.body);

    Object.keys(_srmStatMeta()).forEach(s => {
        const val  = stats[s] || 0;
        const pct  = Math.min(100, (val / 12) * 100);
        const fill = document.getElementById(`srm-sb-${s}`);
        const lbl  = document.getElementById(`srm-sv-${s}`);
        if (fill) { fill.style.background = accent; fill.style.width = pct + '%'; }
        if (lbl)  lbl.textContent = val;
    });

    const target = _srmTotalPrice();
    if (instant) {
        _srmState.displayedPrice = target;
        _srmState.targetPrice    = target;
        const el = document.getElementById('srm-price');
        if (el) el.textContent = '€ ' + Math.round(target).toLocaleString('it-IT');
        return;
    }

    _srmState.targetPrice = target;
    if (_srmState.animFrame) cancelAnimationFrame(_srmState.animFrame);
    const tick = () => {
        const diff = _srmState.targetPrice - _srmState.displayedPrice;
        if (Math.abs(diff) < 1) {
            _srmState.displayedPrice = _srmState.targetPrice;
        } else {
            _srmState.displayedPrice += diff * 0.14;
        }
        const el = document.getElementById('srm-price');
        if (el) el.textContent = '€ ' + Math.round(_srmState.displayedPrice).toLocaleString('it-IT');
        if (_srmState.displayedPrice !== _srmState.targetPrice) {
            _srmState.animFrame = requestAnimationFrame(tick);
        }
    };
    _srmState.animFrame = requestAnimationFrame(tick);
}

/* ── Purchase flow ──────────────────────────────────────────────────── */
window._srmPurchase = async function() {
    const v = _srmCurrentVehicle();
    if (!v) return;

    const total = _srmTotalPrice();
    const opts  = [..._srmState.selectedOpts];

    if ((gameState.capital || 0) < total) {
        showNotification(`Fondi insufficienti. Servono € ${total.toLocaleString('it-IT')}`, 'error');
        return;
    }

    const btn = document.getElementById('srm-buy');
    if (btn) { btn.disabled = true; btn.textContent = 'Elaborazione…'; }

    const result = await ServerState.buyVehicle(
        v.id,
        total,
        ServerState.getCompany()?.hq_city || 'roma'
    );
    if (!result) {
        if (btn) { btn.disabled = false; btn.textContent = 'Acquista Veicolo'; }
        return;
    }

    gameState.fleet.push({
        id: 'c_' + Date.now(), _serverId: result.id,
        name: v.name, tier: v.tier, condition: 100,
        isLease: false, fuel: 100, mileage: 0, tirePressure: 100, engineHealth: 100,
        upgrades: opts, vehicleClass: v.id, outOfService: false,
    });

    _srmState.selectedOpts.clear();
    updateUI();
    if (typeof saveGame === 'function') saveGame();
    showBigEvent('🚗', `${v.name} Acquisita!`,
        opts.length > 0
            ? `${opts.length} optional configurati · veicolo pronto al servizio.`
            : 'Veicolo pronto per la flotta.');
    if ((v.tier === 'ultra' || v.tier === 'vip') && v.price >= 300000) {
        if (typeof _broadcastNews === 'function')
            _broadcastNews(`${gameState.companyName} ha acquisito una ${v.name} 🚗`, 'milestone');
    }
    renderTabShowroom();
};
