'use strict';

// Unico punto che definisce il tetto della reputazione.
// Il tetto e' 5 + prestigio: ogni copia inline (soprattutto quella
// senza prestigio, che blocca chi ha fatto prestigio a 5 stelle)
// e' un bug. Usare CE_reputationCap, mai riscrivere Math.min(5...).

var CE_reputationCap = function (stateOrPrestige) {
    if (stateOrPrestige == null) return 5.0;
    if (typeof stateOrPrestige === 'number') return 5.0 + stateOrPrestige;
    return 5.0 + (stateOrPrestige.prestige || 0);
};

if (typeof window !== 'undefined') {
    window.CE_reputationCap = CE_reputationCap;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CE_reputationCap: CE_reputationCap };
}
