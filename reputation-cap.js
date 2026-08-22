// Unico punto che calcola il tetto della reputazione.
// Regola delle globali: var al top-level, mai const.
var CE_reputationCap = function (prestige) {
  var p = typeof prestige === 'number' ? prestige : 0;
  return 5.0 + p;
};
window.CE_reputationCap = CE_reputationCap;
