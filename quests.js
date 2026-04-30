'use strict';
/* ================================================================
   quests.js — Olga Vision · Quest Engine & Campaign Database
   ================================================================ */

const QUEST_DB = [
  /* ═══════════════ CAPITOLO 1 — IL PADRONCINO ═══════════════ */
  { id:'q01', ch:1, icon:'🚗', title:'Prima Corsa',
    desc:'Completa la tua prima corsa NCC.',
    prereqs:[],
    check: gs => ({ cur: gs.questStats.totalRides, tgt: 1 }),
    rewards:{ cash:1500, tc:3, rep:0, desc:'+€1.500 · +3 Titan Coins' } },

  { id:'q02', ch:1, icon:'⛽', title:'Liquidità di Base',
    desc:'Raggiungi €8.000 di cassa. Le corse si pagano in anticipo.',
    prereqs:['q01'],
    check: gs => ({ cur: Math.min(gs.cash, 8000), tgt: 8000 }),
    rewards:{ cash:2000, tc:2, rep:0, desc:'+€2.000 · +2 TC' } },

  { id:'q03', ch:1, icon:'👔', title:'Primo Autista',
    desc:'Assumi il tuo primo autista professionale.',
    prereqs:['q01'],
    check: gs => ({ cur: gs.drivers.filter(d=>d.id!=='ceo').length, tgt: 1 }),
    rewards:{ cash:3000, tc:3, rep:0.1, desc:'+€3.000 · +3 TC · +0.1★' } },

  { id:'q04', ch:1, icon:'⭐', title:'Reputazione Base',
    desc:'Raggiungi 1.5★ di reputazione sul mercato.',
    prereqs:['q01'],
    check: gs => ({ cur: Math.min(gs.reputation, 1.5), tgt: 1.5 }),
    rewards:{ cash:2500, tc:2, rep:0, desc:'+€2.500 · +2 TC' } },

  { id:'q05', ch:1, icon:'✈️', title:'Corsa Fiumicino',
    desc:'Completa 3 trasferimenti da/per l\'aeroporto FCO.',
    prereqs:['q01'],
    check: gs => ({ cur: gs.questStats.fcoRides, tgt: 3 }),
    rewards:{ cash:2000, tc:2, rep:0.05, desc:'+€2.000 · +2 TC' } },

  { id:'q06', ch:1, icon:'🚘', title:'Flotta Doppia',
    desc:'Possiedi almeno 2 veicoli in flotta.',
    prereqs:['q02'],
    check: gs => ({ cur: gs.fleet.length, tgt: 2 }),
    rewards:{ cash:5000, tc:3, rep:0.1, desc:'+€5.000 · +3 TC · +0.1★' } },

  { id:'q07', ch:1, icon:'🔟', title:'Dieci Corse',
    desc:'Completa 10 corse totali.',
    prereqs:['q03'],
    check: gs => ({ cur: gs.questStats.totalRides, tgt: 10 }),
    rewards:{ cash:4000, tc:4, rep:0, desc:'+€4.000 · +4 TC' } },

  { id:'q08', ch:1, icon:'🗺️', title:'Prima Regione',
    desc:'Sblocca la prima regione fuori dal Lazio.',
    prereqs:['q02'],
    check: gs => ({ cur: gs.unlockedRegions.filter(r=>r!=='lazio').length, tgt: 1 }),
    rewards:{ cash:8000, tc:5, rep:0.2, desc:'+€8.000 · +5 TC · +0.2★' } },

  { id:'q09', ch:1, icon:'💼', title:'Prima VIP',
    desc:'Completa la tua prima corsa di livello VIP.',
    prereqs:['q04'],
    check: gs => ({ cur: gs.questStats.vipRides, tgt: 1 }),
    rewards:{ cash:5000, tc:3, rep:0.1, desc:'+€5.000 · +3 TC · +0.1★' } },

  { id:'q10', ch:1, icon:'🔧', title:'Primo Upgrade',
    desc:'Installa il primo upgrade su un veicolo della flotta.',
    prereqs:['q06'],
    check: gs => ({ cur: gs.fleet.some(c=>(c.upgrades||[]).length>0)?1:0, tgt: 1 }),
    rewards:{ cash:3000, tc:3, rep:0, desc:'+€3.000 · +3 TC' } },

  { id:'q11', ch:1, icon:'👥', title:'Team Raddoppiato',
    desc:'Porta la squadra a 2 autisti professionisti.',
    prereqs:['q03'],
    check: gs => ({ cur: gs.drivers.filter(d=>d.id!=='ceo').length, tgt: 2 }),
    rewards:{ cash:6000, tc:4, rep:0.1, desc:'+€6.000 · +4 TC · +0.1★' } },

  { id:'q12', ch:1, icon:'💰', title:'Diecimila',
    desc:'Accumula €20.000 di liquidità.',
    prereqs:['q07'],
    check: gs => ({ cur: Math.min(gs.cash, 20000), tgt: 20000 }),
    rewards:{ cash:3000, tc:2, rep:0, desc:'+€3.000 · +2 TC' } },

  { id:'q13', ch:1, icon:'🌟', title:'Reputazione Solida',
    desc:'Raggiungi 2.0★ di reputazione.',
    prereqs:['q04'],
    check: gs => ({ cur: Math.min(gs.reputation, 2.0), tgt: 2.0 }),
    rewards:{ cash:8000, tc:5, rep:0, desc:'+€8.000 · +5 TC' } },

  { id:'q14', ch:1, icon:'🏁', title:'Venticinque Corse',
    desc:'Completa 25 corse totali.',
    prereqs:['q07'],
    check: gs => ({ cur: gs.questStats.totalRides, tgt: 25 }),
    rewards:{ cash:10000, tc:6, rep:0.1, desc:'+€10.000 · +6 TC · +0.1★' } },

  { id:'q15', ch:1, icon:'🏆', title:'Padroncino Affermato',
    desc:'Completa tutte le sfide del Capitolo 1.',
    prereqs:['q05','q08','q09','q10','q11','q12','q13','q14'],
    check: gs => {
      const need=['q05','q08','q09','q10','q11','q12','q13','q14'];
      return { cur: need.filter(id=>gs.completedQuests.includes(id)).length, tgt: need.length };
    },
    rewards:{ cash:25000, tc:15, rep:0.2, desc:'+€25.000 · +15 TC · +0.2★' } },

  /* ═══════════════ CAPITOLO 2 — L\'AGENZIA ═══════════════ */
  { id:'q16', ch:2, icon:'🚐', title:'Minivan Aziendale',
    desc:'Acquista un Mercedes V-Class per il trasporto gruppi.',
    prereqs:['q15'],
    check: gs => ({ cur: gs.fleet.some(c=>c.vehicleClass==='mercedes_v')?1:0, tgt: 1 }),
    rewards:{ cash:20000, tc:8, rep:0.2, desc:'+€20.000 · +8 TC · +0.2★' } },

  { id:'q17', ch:2, icon:'🚚', title:'Sprinter in Flotta',
    desc:'Acquista un Mercedes Sprinter per i transfer di gruppo.',
    prereqs:['q16'],
    check: gs => ({ cur: gs.fleet.some(c=>c.vehicleClass==='mercedes_sprinter')?1:0, tgt: 1 }),
    rewards:{ cash:25000, tc:10, rep:0.2, desc:'+€25.000 · +10 TC · +0.2★' } },

  { id:'q18', ch:2, icon:'🛢️', title:'Deposito Carburante',
    desc:'Acquista il Deposito Carburante Aziendale.',
    prereqs:['q15'],
    check: gs => ({ cur: (gs.investments.includes('inv_fuel_depot')||(gs.constructions||[]).some(c=>c.id==='inv_fuel_depot'))?1:0, tgt: 1 }),
    rewards:{ cash:30000, tc:8, rep:0, desc:'+€30.000 · +8 TC' } },

  { id:'q19', ch:2, icon:'📦', title:'Logistics Manager',
    desc:'Assumi il Logistics Manager.',
    prereqs:['q18'],
    check: gs => ({ cur: gs.staff.some(s=>s.id==='logistics')?1:0, tgt: 1 }),
    rewards:{ cash:15000, tc:5, rep:0.1, desc:'+€15.000 · +5 TC · +0.1★' } },

  { id:'q20', ch:2, icon:'🏢', title:'HQ Executive',
    desc:'Fai upgrade alla sede: Ufficio Executive (HQ Lv2).',
    prereqs:['q15'],
    check: gs => ({ cur: (gs.investments.includes('inv_hq_office')||(gs.constructions||[]).some(c=>c.id==='inv_hq_office'))?1:0, tgt: 1 }),
    rewards:{ cash:40000, tc:12, rep:0.2, desc:'+€40.000 · +12 TC · +0.2★' } },

  { id:'q21', ch:2, icon:'📋', title:'Primo Contratto CV',
    desc:'Completa la prima corsa del contratto Classic Vacations.',
    prereqs:['q16'],
    check: gs => ({ cur: gs.questStats.contractRides, tgt: 1 }),
    rewards:{ cash:10000, tc:5, rep:0.1, desc:'+€10.000 · +5 TC · +0.1★' } },

  { id:'q22', ch:2, icon:'📄', title:'Cinque Contratti CV',
    desc:'Completa 5 corse Classic Vacations.',
    prereqs:['q21'],
    check: gs => ({ cur: gs.questStats.contractRides, tgt: 5 }),
    rewards:{ cash:20000, tc:8, rep:0.1, desc:'+€20.000 · +8 TC · +0.1★' } },

  { id:'q23', ch:2, icon:'5️⃣', title:'Cinquanta Corse',
    desc:'Completa 50 corse totali.',
    prereqs:['q14'],
    check: gs => ({ cur: gs.questStats.totalRides, tgt: 50 }),
    rewards:{ cash:30000, tc:10, rep:0.2, desc:'+€30.000 · +10 TC · +0.2★' } },

  { id:'q24', ch:2, icon:'🧭', title:'Espansione Nord',
    desc:'Sblocca 2 regioni fuori dal Lazio.',
    prereqs:['q08'],
    check: gs => ({ cur: gs.unlockedRegions.filter(r=>r!=='lazio').length, tgt: 2 }),
    rewards:{ cash:20000, tc:7, rep:0.2, desc:'+€20.000 · +7 TC · +0.2★' } },

  { id:'q25', ch:2, icon:'💯', title:'Centomila',
    desc:'Accumula €100.000 di liquidità.',
    prereqs:['q12'],
    check: gs => ({ cur: Math.min(gs.cash, 100000), tgt: 100000 }),
    rewards:{ cash:20000, tc:10, rep:0, desc:'+€20.000 · +10 TC' } },

  { id:'q26', ch:2, icon:'⚓', title:'Trasferimenti Porto',
    desc:'Completa 3 trasferimenti da/per porti italiani.',
    prereqs:['q08'],
    check: gs => ({ cur: gs.questStats.portRides, tgt: 3 }),
    rewards:{ cash:15000, tc:6, rep:0.1, desc:'+€15.000 · +6 TC · +0.1★' } },

  { id:'q27', ch:2, icon:'👩‍💼', title:'HR Manager',
    desc:'Assumi l\'HR Manager per la gestione del team.',
    prereqs:['q11'],
    check: gs => ({ cur: gs.staff.some(s=>s.id==='hr')?1:0, tgt: 1 }),
    rewards:{ cash:12000, tc:5, rep:0.1, desc:'+€12.000 · +5 TC · +0.1★' } },

  { id:'q28', ch:2, icon:'🚗🚗🚗', title:'Flotta Tripla',
    desc:'Possiedi almeno 3 veicoli.',
    prereqs:['q06'],
    check: gs => ({ cur: gs.fleet.length, tgt: 3 }),
    rewards:{ cash:15000, tc:6, rep:0.1, desc:'+€15.000 · +6 TC · +0.1★' } },

  { id:'q29', ch:2, icon:'📡', title:'Senior Dispatcher',
    desc:'Assumi il Senior Dispatcher per le corse VIP automatiche.',
    prereqs:['q27'],
    check: gs => ({ cur: gs.staff.some(s=>s.id==='sr_disp')?1:0, tgt: 1 }),
    rewards:{ cash:20000, tc:8, rep:0.1, desc:'+€20.000 · +8 TC · +0.1★' } },

  { id:'q30', ch:2, icon:'🗺️', title:'Tre Regioni',
    desc:'Sblocca 3 regioni extra oltre al Lazio.',
    prereqs:['q24'],
    check: gs => ({ cur: gs.unlockedRegions.filter(r=>r!=='lazio').length, tgt: 3 }),
    rewards:{ cash:35000, tc:12, rep:0.2, desc:'+€35.000 · +12 TC · +0.2★' } },

  /* ═══════════════ CAPITOLO 3 — IL LUSSO ═══════════════ */
  { id:'q31', ch:3, icon:'🤝', title:'Airport Greeter',
    desc:'Assumi un assistente Meet & Greet aeroportuale.',
    prereqs:['q20','q29'],
    check: gs => ({ cur: gs.staff.some(s=>s.skill==='meetgreet')?1:0, tgt: 1 }),
    rewards:{ cash:50000, tc:15, rep:0.2, desc:'+€50.000 · +15 TC · +0.2★' } },

  { id:'q32', ch:3, icon:'👑', title:'Limousine Presidenziale',
    desc:'Acquista la Mercedes S-Class Presidential.',
    prereqs:['q25','q31'],
    check: gs => ({ cur: gs.fleet.some(c=>c.vehicleClass==='mercedes_s')?1:0, tgt: 1 }),
    rewards:{ cash:60000, tc:20, rep:0.3, desc:'+€60.000 · +20 TC · +0.3★' } },

  { id:'q33', ch:3, icon:'💎', title:'Cinque Ultra',
    desc:'Completa 5 corse di livello Ultra.',
    prereqs:['q09'],
    check: gs => ({ cur: gs.questStats.ultraRides, tgt: 5 }),
    rewards:{ cash:40000, tc:12, rep:0.2, desc:'+€40.000 · +12 TC · +0.2★' } },

  { id:'q34', ch:3, icon:'⭐⭐⭐⭐', title:'Quattro Stelle',
    desc:'Raggiungi 4.0★ di reputazione.',
    prereqs:['q13'],
    check: gs => ({ cur: Math.min(gs.reputation, 4.0), tgt: 4.0 }),
    rewards:{ cash:50000, tc:15, rep:0, desc:'+€50.000 · +15 TC' } },

  { id:'q35', ch:3, icon:'🚘×5', title:'Fleet Elite',
    desc:'Possiedi almeno 5 veicoli in flotta.',
    prereqs:['q28'],
    check: gs => ({ cur: gs.fleet.length, tgt: 5 }),
    rewards:{ cash:40000, tc:12, rep:0.2, desc:'+€40.000 · +12 TC · +0.2★' } },

  { id:'q36', ch:3, icon:'⛵', title:'Licenza Veneto',
    desc:'Sblocca il Veneto per accedere a Venezia.',
    prereqs:['q30'],
    check: gs => ({ cur: gs.unlockedRegions.includes('veneto')?1:0, tgt: 1 }),
    rewards:{ cash:60000, tc:15, rep:0.3, desc:'+€60.000 · +15 TC · +0.3★' } },

  { id:'q37', ch:3, icon:'🛥️', title:'Capitano Acqueo',
    desc:'Acquista un Water Taxi per le corse lagunari di Venezia.',
    prereqs:['q36'],
    check: gs => ({ cur: gs.fleet.some(c=>c.vehicleClass==='water_taxi')?1:0, tgt: 1 }),
    rewards:{ cash:80000, tc:20, rep:0.3, desc:'+€80.000 · +20 TC · +0.3★' } },

  { id:'q38', ch:3, icon:'📋×20', title:'Venti Contratti CV',
    desc:'Completa 20 corse Classic Vacations.',
    prereqs:['q22'],
    check: gs => ({ cur: gs.questStats.contractRides, tgt: 20 }),
    rewards:{ cash:45000, tc:15, rep:0.2, desc:'+€45.000 · +15 TC · +0.2★' } },

  { id:'q39', ch:3, icon:'💯', title:'Cento Corse',
    desc:'Completa 100 corse totali.',
    prereqs:['q23'],
    check: gs => ({ cur: gs.questStats.totalRides, tgt: 100 }),
    rewards:{ cash:75000, tc:20, rep:0.2, desc:'+€75.000 · +20 TC · +0.2★' } },

  { id:'q40', ch:3, icon:'💎💎', title:'Mezzo Milione',
    desc:'Accumula €500.000 di liquidità.',
    prereqs:['q25'],
    check: gs => ({ cur: Math.min(gs.cash, 500000), tgt: 500000 }),
    rewards:{ cash:50000, tc:15, rep:0, desc:'+€50.000 · +15 TC' } },

  { id:'q41', ch:3, icon:'🗺️×5', title:'Cinque Regioni',
    desc:'Sblocca 5 regioni extra oltre al Lazio.',
    prereqs:['q30'],
    check: gs => ({ cur: gs.unlockedRegions.filter(r=>r!=='lazio').length, tgt: 5 }),
    rewards:{ cash:50000, tc:15, rep:0.3, desc:'+€50.000 · +15 TC · +0.3★' } },

  { id:'q42', ch:3, icon:'📣', title:'Brand Power',
    desc:'Lancia la campagna Elite Media Blitz.',
    prereqs:['q20'],
    check: gs => ({ cur: gs.activeMarketing==='elite'?1:0, tgt: 1 }),
    rewards:{ cash:30000, tc:10, rep:0.3, desc:'+€30.000 · +10 TC · +0.3★' } },

  /* ═══════════════ CAPITOLO 4 — L\'IMPERO ═══════════════ */
  { id:'q43', ch:4, icon:'🏔️', title:'Italia Settentrionale',
    desc:'Sblocca almeno 5 regioni del Nord Italia.',
    prereqs:['q41'],
    check: gs => {
      const nord=['emilia','liguria','piemonte','lombardia','veneto','friuli','trentino','valle_aosta'];
      return { cur: gs.unlockedRegions.filter(r=>nord.includes(r)).length, tgt: 5 };
    },
    rewards:{ cash:150000, tc:30, rep:0.3, desc:'+€150.000 · +30 TC · +0.3★' } },

  { id:'q44', ch:4, icon:'🏙️', title:'Capitale del Nord',
    desc:'Sblocca la Lombardia e conquista Milano.',
    prereqs:['q43'],
    check: gs => ({ cur: gs.unlockedRegions.includes('lombardia')?1:0, tgt: 1 }),
    rewards:{ cash:200000, tc:35, rep:0.5, desc:'+€200.000 · +35 TC · +0.5★' } },

  { id:'q45', ch:4, icon:'🚗×10', title:'Flotta Totale',
    desc:'Possiedi almeno 10 veicoli in flotta.',
    prereqs:['q35'],
    check: gs => ({ cur: gs.fleet.length, tgt: 10 }),
    rewards:{ cash:100000, tc:25, rep:0.2, desc:'+€100.000 · +25 TC · +0.2★' } },

  { id:'q46', ch:4, icon:'⭐×5', title:'Stella Suprema',
    desc:'Raggiungi la reputazione massima: 5.0★.',
    prereqs:['q34'],
    check: gs => ({ cur: Math.min(gs.reputation, 5.0), tgt: 5.0 }),
    rewards:{ cash:200000, tc:40, rep:0, desc:'+€200.000 · +40 TC' } },

  { id:'q47', ch:4, icon:'⚓', title:'Porto Cervo Ultra',
    desc:'Completa una corsa Ultra a Porto Cervo.',
    prereqs:['q37'],
    check: gs => ({ cur: gs.questStats.portoCervoRides||0, tgt: 1 }),
    rewards:{ cash:80000, tc:20, rep:0.2, desc:'+€80.000 · +20 TC · +0.2★' } },

  { id:'q48', ch:4, icon:'🥇', title:'Numero Uno',
    desc:'Raggiungi la prima posizione nella classifica globale.',
    prereqs:['q46'],
    check: gs => {
      const pos = typeof RIVALS!=='undefined' ? RIVALS.filter(r=>r.rep>gs.reputation).length+1 : 99;
      return { cur: pos===1?1:0, tgt: 1 };
    },
    rewards:{ cash:250000, tc:50, rep:0, desc:'+€250.000 · +50 TC' } },

  { id:'q49', ch:4, icon:'200', title:'Duecento Corse',
    desc:'Completa 200 corse totali. Una leggenda del settore.',
    prereqs:['q39'],
    check: gs => ({ cur: gs.questStats.totalRides, tgt: 200 }),
    rewards:{ cash:150000, tc:30, rep:0.3, desc:'+€150.000 · +30 TC · +0.3★' } },

  { id:'q50', ch:4, icon:'🌟', title:'CEO Supremo',
    desc:'Dominio assoluto: 10+ veicoli, 5.0★, €1M liquidità, #1 classifica.',
    prereqs:['q44','q45','q46','q48'],
    check: gs => {
      const pos = typeof RIVALS!=='undefined' ? RIVALS.filter(r=>r.rep>gs.reputation).length+1 : 99;
      const ok = [gs.fleet.length>=10, gs.reputation>=5.0, gs.cash>=1000000, pos===1];
      return { cur: ok.filter(Boolean).length, tgt: 4 };
    },
    rewards:{ cash:1000000, tc:100, rep:0, desc:'+€1.000.000 · +100 TC · TITOLO: CEO SUPREMO' } },
];

/* ──────────────────────────────────────────────────────────────
   ENGINE FUNCTIONS
────────────────────────────────────────────────────────────── */
function _questUnlocked(q, gs) {
  return q.prereqs.every(id => (gs.completedQuests||[]).includes(id));
}

window.checkQuestProgress = function() {
  const gs = gameState;
  if (!gs.questStats) return;
  let anyNew = false;
  if (!gs.claimableQuests) gs.claimableQuests = [];
  if (!gs.completedQuests) gs.completedQuests = [];

  QUEST_DB.forEach(q => {
    if (gs.completedQuests.includes(q.id)) return;
    if (gs.claimableQuests.includes(q.id)) return;
    if (!_questUnlocked(q, gs)) return;
    try {
      const { cur, tgt } = q.check(gs);
      if (cur >= tgt) { gs.claimableQuests.push(q.id); anyNew = true; }
    } catch(e) {}
  });

  if (anyNew) {
    const dot = document.getElementById('career-dot');
    if (dot) dot.classList.remove('hidden');
    if (typeof showNotification==='function') showNotification('🏆 Ricompensa quest disponibile!', 'success');
  }
};

window.claimQuestReward = function(questId) {
  const gs = gameState;
  if (!(gs.claimableQuests||[]).includes(questId)) return;
  const q = QUEST_DB.find(x => x.id === questId);
  if (!q) return;

  gs.claimableQuests = gs.claimableQuests.filter(id => id !== questId);
  if (!gs.completedQuests) gs.completedQuests = [];
  gs.completedQuests.push(questId);

  if (q.rewards.cash) { gs.cash += q.rewards.cash; gs.annualProfitTracker = (gs.annualProfitTracker||0) + q.rewards.cash; }
  if (q.rewards.tc)   gs.titanCoins = (gs.titanCoins||0) + q.rewards.tc;
  if (q.rewards.rep)  gs.reputation = Math.min(5.0 + (gs.prestige||0), gs.reputation + q.rewards.rep);

  // Money particles from the claim button
  if (q.rewards.cash && typeof window.spawnMoneyParticles === 'function') {
    const btn = document.activeElement;
    const rect = btn ? btn.getBoundingClientRect() : { left: window.innerWidth/2, top: window.innerHeight/2 };
    window.spawnMoneyParticles(rect.left + (rect.width||0)/2, rect.top, q.rewards.cash);
  }

  if (typeof showBigEvent==='function') showBigEvent('🏆', q.title, `Missione completata!\n${q.rewards.desc}`);
  if (typeof logToMap==='function') logToMap(`🏆 Quest: "${q.title}" → ${q.rewards.desc}`);

  const dot = document.getElementById('career-dot');
  if (dot && !(gs.claimableQuests?.length > 0)) dot.classList.add('hidden');

  if (typeof updateUI==='function') updateUI();
  if (typeof renderTabCareer==='function' && typeof _tabIs==='function' && _tabIs('career')) renderTabCareer();
  if (typeof saveGame==='function') saveGame();
};

window.QUEST_DB = QUEST_DB;
