// Supabase Edge Function: send-push
// Web Push (VAPID) — notifica di ritorno ai giocatori inattivi.
//
// Flusso:
//   1. rpc_due_push_subscriptions() → subscription inattive >22h, non già
//      notificate negli ultimi 20h, non più vecchie di 7g (vedi 39_push_subscriptions.sql)
//   2. web-push invia la notifica firmata VAPID a ogni endpoint
//   3. last_notified_at = now() sui inviati (anti-spam); cancella i 404/410 (scadute)
//
// Secrets richiesti (Dashboard → Edge Functions → send-push → Secrets):
//   VAPID_PUBLIC_KEY        (la stessa pubblica messa in config.js)
//   VAPID_PRIVATE_KEY       (segreta — NON nel repo)
//   VAPID_SUBJECT           (opz., default mailto:support@chauffeurempire.com)
//   PUSH_CRON_SECRET        (opz., se settato richiede header x-cron-secret)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (iniettati da Supabase)
//
// Deploy: supabase functions deploy send-push
// Cron:   ogni ora via pg_cron+pg_net (vedi 39_push_subscriptions.sql) o Dashboard.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const IDLE_HOURS     = 22; // inattivo da almeno 22h
const COOLDOWN_HOURS = 20; // non rinotificare entro 20h
const MAX_IDLE_DAYS  = 7;  // smetti di insistere dopo 7g

interface Target {
    endpoint: string;
    p256dh: string;
    auth: string;
    company_name: string | null;
    cash: number | null;
}

function buildBody(t: Target): string {
    const name = t.company_name || 'La tua azienda';
    if (t.cash != null) {
        const cash = '€' + Number(t.cash).toLocaleString('it-IT');
        return `${name}: hai ${cash} in cassa e le corse continuano senza di te. Torna a guidare l'impero.`;
    }
    return `${name} ti aspetta — le corse continuano. Torna a guidare l'impero.`;
}

Deno.serve(async (req: Request) => {
    // ── Auth opzionale via secret condiviso ──────────────────────────────────
    const cronSecret = Deno.env.get('PUSH_CRON_SECRET');
    if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
        return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
    }

    const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@chauffeurempire.com';
    if (!vapidPublic || !vapidPrivate) {
        return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), { status: 500 });
    }
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const sb = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Target dal DB ────────────────────────────────────────────────────────
    const { data: targets, error } = await sb.rpc('rpc_due_push_subscriptions', {
        p_idle_hours:     IDLE_HOURS,
        p_cooldown_hours: COOLDOWN_HOURS,
        p_max_idle_days:  MAX_IDLE_DAYS,
    });
    if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    const sent: string[]    = [];
    const expired: string[] = [];

    // ── Invio sequenziale (volumi bassi; evita rate-limit dei push service) ──
    for (const t of (targets ?? []) as Target[]) {
        const payload = JSON.stringify({
            title: '🚗 Il tuo impero ti aspetta',
            body:  buildBody(t),
            icon:  '/assets/ce-favicon.png',
            badge: '/assets/ce-favicon.png',
            tag:   'ce-return',
            url:   '/',
        });
        try {
            await webpush.sendNotification(
                { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
                payload,
            );
            sent.push(t.endpoint);
        } catch (e) {
            const code = (e as { statusCode?: number })?.statusCode;
            // 404/410 = subscription morta → rimuovi. Altri errori = transitori, riprova al prossimo giro.
            if (code === 404 || code === 410) expired.push(t.endpoint);
        }
    }

    // ── Aggiorna stato ───────────────────────────────────────────────────────
    if (sent.length) {
        await sb.from('push_subscriptions')
            .update({ last_notified_at: new Date().toISOString() })
            .in('endpoint', sent);
    }
    if (expired.length) {
        await sb.from('push_subscriptions').delete().in('endpoint', expired);
    }

    return new Response(JSON.stringify({
        ok:         true,
        candidates: targets?.length ?? 0,
        sent:       sent.length,
        expired:    expired.length,
    }), { headers: { 'Content-Type': 'application/json' } });
});
