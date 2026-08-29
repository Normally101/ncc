/* ============================================================================
   api/dc-webhook.mjs — Chauffeur Empire
   L'UNICO punto del sistema che accredita Driver Coins comprati con denaro.

   Lo chiama Stripe, non il browser. E prima di credergli ne verifichiamo la
   firma: senza quel controllo l'endpoint sarebbe pubblico, e chiunque potrebbe
   inventare un «pagamento riuscito» con una richiesta HTTP. La verifica della
   firma NON e' una formalita': e' la sola cosa che distingue questo endpoint da
   un distributore gratuito di valuta.

   L'accredito e' idempotente due volte, e serve che lo sia:
     - qui, ignorando gli eventi gia' visti;
     - nel database, dove `dc_purchases.stripe_event_id` e' UNIQUE.
   Stripe riconsegna lo stesso evento se la nostra risposta tarda o si perde, e
   due consegne possono arrivare in parallelo su due istanze diverse — dove un
   controllo applicativo da solo non le vedrebbe entrambe.

   IL CORPO VA LETTO GREZZO. `bodyParser: false` esiste per questo: la firma si
   calcola sui byte esatti che Stripe ha spedito, e passarli da JSON.parse e
   riserializzarli li cambia (spazi, ordine, escape) facendo fallire OGNI
   pagamento legittimo. Se un giorno il corpo grezzo non fosse disponibile,
   questa funzione deve RIFIUTARE — mai accreditare senza aver verificato.

   FIRMA `(req, res)`, non l'API Web: vedi la nota in dc-checkout.mjs.

   VARIABILI D'AMBIENTE:
     STRIPE_WEBHOOK_SECRET       whsec_… (Stripe → Developers → Webhooks)
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY   la sola chiave che puo' accreditare
   ============================================================================ */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const config = { api: { bodyParser: false } };

const TOLLERANZA_SECONDI = 60 * 5;   // oltre, l'evento e' vecchio: si rifiuta

/** I byte esatti arrivati da Stripe. Stringa vuota se non sono disponibili. */
async function corpoGrezzo(req) {
    if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : String(req.rawBody);
    try {
        const pezzi = [];
        for await (const p of req) pezzi.push(p);
        return Buffer.concat(pezzi).toString('utf8');
    } catch { return ''; }
}

/** Verifica l'intestazione `stripe-signature` sul corpo GREZZO. */
function firmaValida(grezzo, intestazione, segreto) {
    if (!grezzo || !intestazione || !segreto) return false;
    const parti = {};
    for (const pezzo of String(intestazione).split(',')) {
        const i = pezzo.indexOf('=');
        if (i > 0) parti[pezzo.slice(0, i).trim()] = pezzo.slice(i + 1).trim();
    }
    const t = parti.t, v1 = parti.v1;
    if (!t || !v1) return false;

    const eta = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
    if (!Number.isFinite(eta) || eta > TOLLERANZA_SECONDI) return false;

    const atteso = createHmac('sha256', segreto).update(`${t}.${grezzo}`).digest('hex');
    const a = Buffer.from(atteso, 'utf8');
    const b = Buffer.from(v1, 'utf8');
    // Confronto a tempo costante: un confronto normale rivelerebbe, dalla sua
    // durata, quanti caratteri iniziali sono giusti.
    return a.length === b.length && timingSafeEqual(a, b);
}

function testo(res, stato, corpo) {
    res.statusCode = stato;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(typeof corpo === 'string' ? JSON.stringify({ messaggio: corpo }) : JSON.stringify(corpo));
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') return testo(res, 405, 'metodo non ammesso');

        const SEGRETO = process.env.STRIPE_WEBHOOK_SECRET;
        const SB_URL  = process.env.SUPABASE_URL;
        const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SEGRETO || !SB_URL || !SB_KEY) {
            console.error('dc-webhook: configurazione incompleta');
            return testo(res, 503, 'non configurato');
        }

        const grezzo = await corpoGrezzo(req);
        if (!firmaValida(grezzo, req.headers['stripe-signature'], SEGRETO)) {
            // Nessun dettaglio nella risposta: a chi bussa senza firma non si
            // spiega quale parte non andava.
            return testo(res, 400, 'firma non valida');
        }

        let evento;
        try { evento = JSON.parse(grezzo); } catch { return testo(res, 400, 'corpo illeggibile'); }

        /* Solo il completamento di una sessione pagata accredita.
           `checkout.session.completed` puo' arrivare anche con `payment_status`
           diverso da 'paid' (con i metodi a esito differito): in quel caso non
           si accredita, e si aspetta `checkout.session.async_payment_succeeded`. */
        const tipo = evento && evento.type;
        const sessione = evento && evento.data && evento.data.object;
        const pagata = sessione && sessione.payment_status === 'paid';

        if (!(tipo === 'checkout.session.completed' && pagata)
            && tipo !== 'checkout.session.async_payment_succeeded') {
            // Non e' un errore: e' un evento che non ci riguarda. Rispondere 200
            // evita che Stripe lo riprovi per giorni.
            return testo(res, 200, { ricevuto: true, ignorato: tipo });
        }

        const userId  = (sessione.metadata && sessione.metadata.user_id) || sessione.client_reference_id;
        const packKey = sessione.metadata && sessione.metadata.pack_key;
        const importo = sessione.amount_total;
        const valuta  = sessione.currency || 'eur';

        if (!userId || !packKey) {
            console.error('dc-webhook: sessione senza user_id o pack_key', sessione.id);
            // 200: rimandarcelo non lo aggiusterebbe. Il posto dove guardare e'
            // il log, non la coda di Stripe.
            return testo(res, 200, { ricevuto: true, incompleto: true });
        }

        let esito;
        try {
            const r = await fetch(`${SB_URL}/rest/v1/rpc/rpc_credit_dc_purchase`, {
                method: 'POST',
                headers: {
                    apikey: SB_KEY,
                    Authorization: `Bearer ${SB_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    p_user_id:      userId,
                    p_pack_key:     packKey,
                    p_session_id:   sessione.id || null,
                    p_event_id:     evento.id,
                    p_amount_cents: importo,
                    p_currency:     valuta,
                }),
            });
            esito = await r.json();
            if (!r.ok) {
                console.error('dc-webhook: accredito respinto', esito);
                // 500: qui SI vuole che Stripe riprovi — il pagamento e' buono e
                // i coin non sono ancora arrivati al giocatore.
                return testo(res, 500, 'accredito non riuscito');
            }
        } catch (e) {
            console.error('dc-webhook: database irraggiungibile', e && e.message);
            return testo(res, 500, 'database irraggiungibile');
        }

        if (!esito || esito.ok !== true) {
            /* Il database ha detto no per un motivo suo (importo non
               corrispondente, pacchetto ritirato, azienda inesistente).
               Riprovare non cambierebbe la risposta, quindi si chiude con 200 e
               si lascia il caso al log: e' un pagamento incassato che non ha
               prodotto coin, e va guardato da un umano. */
            console.error('dc-webhook: DA VERIFICARE A MANO — pagamento incassato senza accredito',
                          { sessione: sessione.id, utente: userId, pacchetto: packKey, esito });
            return testo(res, 200, { ricevuto: true, accreditato: false });
        }

        return testo(res, 200, { ricevuto: true, accreditato: true });

    } catch (e) {
        console.error('dc-webhook eccezione non prevista', e && e.stack);
        // 500: se e' saltato qualcosa di nostro, Stripe deve riprovare.
        return testo(res, 500, 'errore interno');
    }
}
