'use strict';
/* ui-realestate.js — Chauffeur Empire
   renderTabRealEstate, doBuyRealEstate: immobili Supabase.
   Dipendenze: engine.js, design-system.js, supabase-config.js */

// ─── GLOBAL NEWS FEED (Supabase Realtime) ────────────────────────
function _appendNewsTicker(message) {
    const track = document.getElementById('news-ticker-track');
    if (!track) return;
    const span = document.createElement('span');
    span.textContent = '🌐 ' + message;
    track.appendChild(span);
    // Rimuovi le notizie più vecchie se si accumulano troppo
    const spans = track.querySelectorAll('span');
    if (spans.length > 80) spans[0].remove();
}

async function _initGlobalNewsFeed() {
    if (!window.supabaseClient) return;
    // Carica le ultime 10 notizie già esistenti
    try {
        const { data } = await window.supabaseClient
            .from('global_news')
            .select('message')
            .order('created_at', { ascending: false })
            .limit(10);
        if (data) [...data].reverse().forEach(row => _appendNewsTicker(row.message));
    } catch(e) { /* offline, silenzioso */ }
    // Sottoscrizione Realtime: aggiunge live le nuove notizie
    window.supabaseClient.channel('global_news_feed')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'global_news' },
            payload => _appendNewsTicker(payload.new.message))
        .subscribe();
}

// ─── PROVINCE WAR TAB ───────────────────────────────────────────────────────

async function renderTabRealEstate() {
    const container = document.getElementById('tab-container');
    container.innerHTML = `<div class="text-[10px] text-gray-500 text-center py-10">Caricamento immobili…</div>`;

    let listings = [], owned = [];
    try {
        const [lRes, oRes] = await Promise.all([
            window.supabaseClient.from('real_estate_listings').select('*').order('cost'),
            window.supabaseClient.from('company_real_estate').select('*'),
        ]);
        if (lRes.error) throw lRes.error;
        listings = lRes.data || [];
        owned    = oRes.data || [];
    } catch(e) {
        container.innerHTML = `<div class="text-red-400 text-xs p-4">Errore caricamento immobili: ${e.message}</div>`;
        return;
    }

    const ownedIds = new Set(owned.map(o => o.listing_id));
    const totalDailyRent = listings
        .filter(l => ownedIds.has(l.id))
        .reduce((s, l) => s + (l.daily_rent || 0), 0);
    const portfolioValue = listings
        .filter(l => ownedIds.has(l.id))
        .reduce((s, l) => s + (l.cost || 0), 0);

    let html = DS.header({
        eyebrow: 'Real Estate',
        title:   'Portafoglio Immobiliare',
        subtitle: `${ownedIds.size} proprietà · Valore €${portfolioValue.toLocaleString('it-IT')} · Rendita €${totalDailyRent > 0 ? totalDailyRent.toLocaleString('it-IT') : '0'}/g`,
        actions: ownedIds.size > 0 ? DS.pill(`🏛 ${ownedIds.size} Proprietà`, 'gold') : '',
    }) + DS.kpiStrip([
        { label: 'Proprietà',    val: ownedIds.size,  color: ownedIds.size > 0 ? 'gold' : '' },
        { label: 'Valore Port.', val: portfolioValue > 0 ? '€' + Math.round(portfolioValue/1000) + 'k' : '—', color: portfolioValue > 0 ? 'gold' : '' },
        { label: 'Rendita/g',   val: totalDailyRent > 0 ? '+€' + totalDailyRent.toLocaleString('it-IT') : '—', color: totalDailyRent > 0 ? 'green' : '' },
        { label: 'Budget',       val: '€' + Math.round((gameState.cash||0)/1000) + 'k', color: 'blue' },
    ]);

    if (ownedIds.size > 0) {
        html += `<div class="ds-card" style="border-color:rgba(34,197,94,0.3);margin-bottom:16px;font-size:10px;color:var(--text-muted)">
            Le rendite vengono accreditate automaticamente dal server ogni 24h.
        </div>`;
    }

    html += `<div style="display:flex;flex-direction:column;gap:12px">`;
    listings.forEach(l => {
        const isOwned   = ownedIds.has(l.id);
        const canAfford = gameState.cash >= (l.cost || 0);
        const ownedRow  = owned.find(o => o.listing_id === l.id);

        let nextRentStr = '';
        if (isOwned && ownedRow?.last_rent_at) {
            const diffMs = new Date(ownedRow.last_rent_at).getTime() + 86400000 - Date.now();
            if (diffMs > 0) {
                const hrs = Math.floor(diffMs / 3600000), mins = Math.floor((diffMs % 3600000) / 60000);
                nextRentStr = `🕐 ${hrs}h ${mins}m alla prossima rendita`;
            } else {
                nextRentStr = '🕐 Rendita in arrivo…';
            }
        }

        html += `<div class="ds-card${isOwned ? ' ds-card--gold' : !canAfford ? '' : ''}${!canAfford && !isOwned ? '' : ''}">`;

        if (l.image_url) {
            html += `<div style="position:relative;border-radius:var(--radius-sm);overflow:hidden;margin:-16px -16px 12px">
                <img src="${l.image_url}" alt="${l.name}" style="width:100%;height:120px;object-fit:cover;display:block" loading="lazy">
                <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 60%)"></div>
                ${isOwned ? `<div style="position:absolute;top:8px;right:8px">${DS.pill('✓ Tuo', 'gold')}</div>` : ''}
                <div style="position:absolute;bottom:8px;left:12px">
                    <div style="font-size:14px;font-weight:700;color:#fff">${l.name}</div>
                    <div style="font-size:11px;color:var(--gold)">${l.city}</div>
                </div>
            </div>`;
        } else {
            html += `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                <div>
                    <div style="font-size:14px;font-weight:700;color:var(--text)">${l.name}</div>
                    <div style="font-size:11px;color:var(--gold)">${l.city}</div>
                </div>
                ${isOwned ? DS.pill('✓ Tuo', 'gold') : ''}
            </div>`;
        }

        html += `<div>`;
        if (l.description) {
            html += `<div style="font-size:10px;color:var(--text-muted);line-height:1.5;margin-bottom:8px">${l.description}</div>`;
        }
        html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
            ${DS.pill('+€' + (l.daily_rent||0).toLocaleString('it-IT') + '/g', 'green')}
            ${l.bonus_type === 'driver_stress_recovery' ? DS.pill('✨ Recupero stress', 'purple') : ''}
            ${isOwned && nextRentStr ? DS.pill(nextRentStr, 'blue') : ''}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:15px;font-weight:700;color:var(--gold);font-family:var(--font-mono)">€${(l.cost||0).toLocaleString('it-IT')}</div>
            ${isOwned
                ? DS.pill('✓ Rendita attiva', 'green')
                : DS.btn({ label: canAfford ? 'Acquista' : `Mancano €${((l.cost||0) - gameState.cash).toLocaleString('it-IT')}`, color: canAfford ? 'gold' : 'ghost', onclick:`window.doBuyRealEstate('${l.id}')`, disabled: !canAfford, size:'sm' })}
        </div></div></div>`;
    });

    html += `</div>`;
    if (listings.length === 0) {
        html += DS.empty({ icon: '🏛', title: 'Nessun immobile disponibile', body: 'Il mercato immobiliare si espanderà nelle prossime stagioni.' });
    }
    container.innerHTML = html;
}

window.doBuyRealEstate = async function(listingId) {
    const result = await window.ServerState?.buyRealEstate(listingId);
    if (result?.success) {
        showBigEvent('🏛', `${result.name} Acquistata!`, `Rendita: €${(result.daily_rent||0).toLocaleString()}/giorno`);
        renderTabRealEstate();
    }
};

window.addEventListener('DOMContentLoaded', () => {
    setupDragAndDrop();
    _initGlobalNewsFeed();
    if (_isMobile()) {
        document.body.classList.add('mobile-mode');
        const sidebar = document.querySelector('nav.fixed.left-4');
        if (sidebar) sidebar.style.display = 'none';
        if (typeof window.renderMobileDispatcher === 'function') {
            window.renderMobileDispatcher();
        }
    }
});
window.renderTabRealEstate = renderTabRealEstate;
