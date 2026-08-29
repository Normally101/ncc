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

   VARIABILI D'AMBIENTE:
     STRIPE_WEBHOOK_SECRET       whsec_… (Stripe → Developers → Webhooks)
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY   la sola chiave che puo' accreditare
   ============================================================================ */

import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLLERANZA_SECONDI = 60 * 5;   // oltre, l'evento e' vecchio: si rifiuta

/** Verifica l'intestazione `stripe-signature` sul corpo GREZZO della richiesta.
 *  Il corpo va usato byte per byte come e' arrivato: se lo si passa da
 *  JSON.parse e si riserializza, la firma non torna piu' e ogni pagamento
 *  legittimo verrebbe rifiutato. */
function firmaValida(corpoGrezzo, intestazione, segreto) {
    if (!intestazione || !segreto) return false;
    const parti = Object.fromEntries(
        intestazione.split(',').map(p => p.split('=').map(s => s.trim()))
    );
    const t = parti.t;
    const v1 = parti.v1;
    if (!t || !v1) return false;

    const eta = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
    if (!Number.isFinite(eta) || eta > TOLLERANZA_SECONDI) return false;

    const atteso = createHmac('sha256', segreto).update(`${t}.${corpoGrezzo}`).digest('hex');
    const a = Buffer.from(atteso, 'utf8');
    const b = Buffer.from(v1, 'utf8');
    // Confronto a tempo costante: un confronto normale rivelerebbe, dalla sua
    // durata, quanti caratteri iniziali sono giusti.
    return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(request) {
    if (request.method !== 'POST') return new Response('metodo non ammesso', { status: 405 });

    const SEGRETO = process.env.STRIPE_WEBHOOK_SECRET;
    const SB_URL  = process.env.SUPABASE_URL;
    const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SEGRETO || !SB_URL || !SB_KEY) {
        console.error('dc-webhook: configurazione incompleta');
        return new Response('non configurato', { status: 503 });
    }

    const grezzo = await request.text();
    if (!firmaValida(grezzo, request.headers.get('stripe-signature'), SEGRETO)) {
        // Nessun dettaglio nella risposta: a chi bussa senza firma non si spiega
        // quale parte non andava.
        return new Response('firma non valida', { status: 400 });
    }

    let evento;
    try { evento = JSON.parse(grezzo); } catch { return new Response('corpo illeggibile', { status: 400 }); }

    /* Solo il completamento di una sessione pagata accredita. `checkout.session.
       completed` puo' arrivare anche con `payment_status` diverso da 'paid'
       (per esempio con i metodi a esito differito): in quel caso non si
       accredita, e si aspetta `checkout.session.async_payment_succeeded`. */
    const tipo = evento?.type;
    const sessione = evento?.data?.object;
    const pagata = sessione?.payment_status === 'paid';

    if (!(tipo === 'checkout.session.completed' && pagata)
        && tipo !== 'checkout.session.async_payment_succeeded') {
        // Non e' un errore: e' un evento che non ci riguarda. Rispondere 200
        // evita che Stripe lo riprovi per giorni.
        return new Response(JSON.stringify({ ricevuto: true, ignorato: tipo }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        });
    }

    const userId   = sessione?.metadata?.user_id || sessione?.client_reference_id;
    const packKey  = sessione?.metadata?.pack_key;
    const importo  = sessione?.amount_total;
    const valuta   = sessione?.currency || 'eur';

    if (!userId || !packKey) {
        console.error('dc-webhook: sessione senza user_id o pack_key', sessione?.id);
        // 200: rimandarcelo non lo aggiusterebbe. Il posto dove guardare e' il
        // log, non la coda di Stripe.
        return new Response(JSON.stringify({ ricevuto: true, incompleto: true }), { status: 200 });
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
                p_session_id:   sessione?.id || null,
                p_event_id:     evento.id,
                p_amount_cents: importo,
                p_currency:     valuta,
            }),
        });
        esito = await r.json();
        if (!r.ok) {
            console.error('dc-webhook: accredito respinto', esito);
            // 500: qui SI vuole che Stripe riprovi — il pagamento e' buono e i
            // coin non sono ancora arrivati al giocatore.
            return new Response('accredito non riuscito', { status: 500 });
        }
    } catch (e) {
        console.error('dc-webhook: database irraggiungibile', e?.message);
        return new Response('database irraggiungibile', { status: 500 });
    }

    if (esito?.ok !== true) {
        /* Il database ha detto no per un motivo suo (importo non corrispondente,
           pacchetto ritirato, azienda inesistente). Riprovare non cambierebbe la
           risposta, quindi si chiude con 200 e si lascia il caso al log: e' un
           pagamento incassato che non ha prodotto coin, e va guardato da un umano. */
        console.error('dc-webhook: DA VERIFICARE A MANO — pagamento incassato senza accredito',
                      { sessione: sessione?.id, utente: userId, pacchetto: packKey, esito });
        return new Response(JSON.stringify({ ricevuto: true, accreditato: false }), { status: 200 });
    }

    return new Response(JSON.stringify({ ricevuto: true, accreditato: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
    });
}
