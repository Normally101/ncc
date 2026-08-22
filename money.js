'use strict';
/* ================================================================
   money.js — l'UNICA porta legale per muovere valuta.

   Perche' esiste: prima di questo file il saldo si muoveva in cinque modi
   diversi (`gameState.cash -=` diretto, `_addCash()`, `syncCash()`, le RPC
   dedicate, e il pattern `if (!isReady()) cash -=`). Cinque convenzioni =
   cinque modi di sbagliare, e infatti 19 azioni scalavano soldi senza mai
   dirlo al server. Il valore autoritativo del server vince al caricamento
   (serverState.js:207-210), quindi ogni spesa non sincronizzata veniva
   RIMBORSATA al ricaricamento mentre l'oggetto comprato restava: acquisti
   gratis, non semplici disallineamenti.

   Il divieto di scavalcare questo file e' sorvegliato da
   test/guardrail/una-sola-porta.test.js, non dalla buona volonta'.

   Caricato subito dopo serverState.js e prima di ogni file di gioco.
   ================================================================ */

var CE_money = (function () {

    function _gs() { return window.gameState; }

    function _avvisa(messaggio, tipo) {
        if (typeof showNotification === 'function') showNotification(messaggio, tipo || 'error');
    }

    /* ── CASSA ────────────────────────────────────────────────────────────
       `cash` viaggia in OVERWRITE dal server (serverState.js:207): il saldo
       locale e' una previsione, `rpc_sync_cash` la rende vera. Senza la
       sincronizzazione la previsione viene semplicemente scartata. */

    function _sincronizzaCassa() {
        var SS = window.ServerState;
        if (!SS || typeof SS.syncCash !== 'function') return;
        try { SS.syncCash(_gs().cash).catch(function () {}); } catch (e) {}
    }

    /**
     * Scala denaro e lo comunica al server.
     * @returns {boolean} false se i fondi non bastano — in quel caso NULLA viene toccato.
     */
    function spend(importo, motivo) {
        var gs = _gs();
        if (!Number.isFinite(importo) || importo < 0) return false;
        if ((gs.cash || 0) < importo) {
            _avvisa('Fondi insufficienti! Servono €' + Math.round(importo).toLocaleString('it-IT'));
            return false;
        }
        gs.cash -= importo;
        _sincronizzaCassa();
        return true;
    }

    /** Accredita denaro e lo comunica al server. */
    function earn(importo, motivo) {
        var gs = _gs();
        if (!Number.isFinite(importo)) return false;
        gs.cash = (gs.cash || 0) + importo;
        _sincronizzaCassa();
        return true;
    }

    /**
     * Allinea il saldo locale a un accredito che il SERVER ha gia' fatto.
     *
     * Serve quando il denaro si muove dentro una RPC (le aste giudiziarie sono
     * il primo caso): li' la colonna `companies.cash` e' gia' aggiornata, e
     * chiamare `earn` rispedirebbe indietro il totale calcolato dal browser —
     * cioe' farebbe decidere al client una cifra che il server aveva gia'
     * deciso da solo. Qui si aggiorna solo la previsione locale, che cosi'
     * torna a coincidere con la verita' senza mai sovrascriverla.
     *
     * @returns {boolean} false se l'importo non e' un numero utilizzabile.
     */
    function accreditatoDalServer(importo, motivo) {
        var gs = _gs();
        if (!Number.isFinite(importo) || importo <= 0) return false;
        gs.cash = (gs.cash || 0) + importo;
        return true;
    }

    /**
     * Allinea il saldo locale a un addebito che il SERVER ha gia' fatto.
     *
     * Serve quando il denaro si muove dentro una RPC: li' la colonna
     * `companies.cash` e' gia' aggiornata, e chiamare `spend` rispedirebbe
     * indietro il totale calcolato dal browser — rischiando di raddoppiare
     * l'addebito se arriva prima l'eco Realtime o di sovrascrivere il server.
     * Qui si aggiorna solo la previsione locale senza risincronizzare.
     *
     * @returns {boolean} false se l'importo non e' un numero utilizzabile.
     */
    function addebitatoDalServer(importo, motivo) {
        var gs = _gs();
        if (!Number.isFinite(importo) || importo <= 0) return false;
        gs.cash = (gs.cash || 0) - importo;
        return true;
    }

    /* ── DRIVER COINS ─────────────────────────────────────────────────────
       I DC sono la valuta premium: si comprano con soldi veri. Anche loro
       arrivano in OVERWRITE (serverState.js:209), quindi una spesa solo
       locale torna indietro al primo evento Realtime lasciando l'effetto
       comprato -> booster gratis, ripetibile. La sola via corretta e' la RPC
       `spendDriverCoins`, che scrive sulla colonna autoritativa e RESTITUISCE
       il saldo vero con cui riallineare il locale.
       Modello: vanity.js:125 `_spend`, l'unico posto che lo faceva giusto. */

    /**
     * Spende Driver Coins tramite la RPC dedicata.
     * @returns {boolean} false se i coin non bastano — in quel caso NULLA viene toccato.
     */
    function spendDC(quantita, motivo) {
        var gs = _gs();
        if (!Number.isFinite(quantita) || quantita < 0) return false;
        if ((gs.driverCoins || 0) < quantita) {
            _avvisa('Servono ' + quantita + ' DC — acquistali nell\'Executive Club.');
            if (typeof switchTab === 'function') switchTab('store');
            return false;
        }
        gs.driverCoins -= quantita;
        try {
            var p = window.ServerState && window.ServerState.spendDriverCoins
                ? window.ServerState.spendDriverCoins(motivo || 'acquisto', quantita)
                : null;
            if (p && typeof p.then === 'function') {
                p.then(function (r) {
                    // Il server e' l'autorita': riallinea sul valore che ci ritorna.
                    if (r && r.driver_coins != null) {
                        gs.driverCoins = r.driver_coins;
                        if (typeof updateUI === 'function') updateUI();
                    }
                }).catch(function (err) {
                    _avvisa((err && err.message) || 'Operazione non andata a buon fine. Riprova.');
                });
            }
        } catch (e) {
            _avvisa((e && e.message) || 'Operazione non andata a buon fine. Riprova.');
        }
        return true;
    }

    /** Accredita Driver Coins tramite la RPC dedicata. */
    function earnDC(quantita, motivo) {
        var gs = _gs();
        if (!Number.isFinite(quantita) || quantita < 0) return false;
        gs.driverCoins = (gs.driverCoins || 0) + quantita;
        try {
            var p = window.ServerState && window.ServerState.addDriverCoins
                ? window.ServerState.addDriverCoins(quantita, motivo || 'premio')
                : null;
            if (p && typeof p.then === 'function') {
                p.then(function (r) {
                    if (r && r.driver_coins != null) {
                        gs.driverCoins = r.driver_coins;
                        if (typeof updateUI === 'function') updateUI();
                    }
                }).catch(function (err) {
                    _avvisa((err && err.message) || 'Operazione non andata a buon fine. Riprova.');
                });
            }
        } catch (e) {
            _avvisa((e && e.message) || 'Operazione non andata a buon fine. Riprova.');
        }
        return true;
    }

    /* ── REPUTAZIONE ──────────────────────────────────────────────────────
       Il tetto e' `5.0 + prestige`, non `5`: copiato a mano ~22 volte nel
       codice e gia' sbagliato in daily-orders.js:157, dove chi ha fatto
       prestigio non guadagnava piu' reputazione. Qui sta una volta sola. */

    function addReputation(delta) {
        var gs = _gs();
        if (!Number.isFinite(delta)) return false;
        var tetto = 5.0 + (gs.prestige || 0);
        gs.reputation = Math.max(0, Math.min(tetto, (gs.reputation || 0) + delta));
        return true;
    }

    return {
        spend: spend, earn: earn, spendDC: spendDC, earnDC: earnDC,
        addReputation: addReputation, accreditatoDalServer: accreditatoDalServer,
        addebitatoDalServer: addebitatoDalServer,
    };
})();

window.CE_money = CE_money;
