'use strict';
/* ui-realestate.js — Chauffeur Empire
   renderTabRealEstate, doBuyRealEstate: immobili Supabase. */

// ─── GLOBAL NEWS FEED (Supabase Realtime) ────────────────────────
function _appendNewsTicker(message) {
    const track = document.getElementById('news-ticker-track');
    if (!track) return;
    const span = document.createElement('span');
    span.textContent = '🌐 ' + message;
    track.appendChild(span);
    const spans = track.querySelectorAll('span');
    if (spans.length > 80) spans[0].remove();
}

async function _initGlobalNewsFeed() {
    if (!window.supabaseClient) return;
    try {
        const { data } = await window.supabaseClient
            .from('global_news').select('message').order('created_at', { ascending: false }).limit(10);
        if (data) [...data].reverse().forEach(row => _appendNewsTicker(row.message));
    } catch(e) { /* offline */ }
    window.supabaseClient.channel('global_news_feed')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_news' },
            payload => _appendNewsTicker(payload.new.message))
        .subscribe();
}

async function renderTabRealEstate() {
    const container = document.getElementById('tab-container');
    container.innerHTML = `
    <div style="padding:16px;max-width:800px">
        <div style="padding-bottom:16px;border-bottom:1px solid #21262d;margin-bottom:20px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Real Estate</div>
            <div style="font-size:20px;font-weight:700;color:#e6edf3">Portafoglio Immobiliare</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
            ${Array(3).fill('<div class="ce-skel" style="height:58px"></div>').join('')}
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
            ${Array(4).fill('<div class="ce-skel" style="height:70px"></div>').join('')}
        </div>
    </div>`;

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
        try { console.warn('[RealEstate] load error', e && (e.message || e)); } catch {}
        container.innerHTML = `<div style="padding:16px;color:#db5746;font-size:12px">Impossibile caricare gli immobili, riprova.</div>`;
        return;
    }

    const ownedIds        = new Set(owned.map(o => o.listing_id));
    const totalDailyRent  = listings.filter(l => ownedIds.has(l.id)).reduce((s,l) => s+(l.daily_rent||0), 0);
    const portfolioValue  = listings.filter(l => ownedIds.has(l.id)).reduce((s,l) => s+(l.cost||0), 0);

    const _pill = (t, c) => `<span style="display:inline-flex;padding:2px 7px;border-radius:3px;font-size:8px;font-weight:700;font-family:monospace;background:${c}18;border:1px solid ${c}44;color:${c}">${t}</span>`;
    const _btn  = (t, fn, c, dis) => {
        const bg = c==='gold'?'#1a1608':'#161b22';
        const bd = c==='gold'?'#c79a2a':'#21262d';
        const tc = c==='gold'?'#c79a2a':'#6b7280';
        return `<button ${dis?'':fn} ${dis?'disabled':''} style="background:${bg};border:1px solid ${bd};color:${tc};padding:5px 12px;border-radius:4px;font-size:11px;font-weight:700;cursor:${dis?'not-allowed':'pointer'};opacity:${dis?.45:1};font-family:inherit;white-space:nowrap">${t}</button>`;
    };

    let html = `
<div style="padding:16px;max-width:800px">

    <div style="padding-bottom:16px;border-bottom:1px solid #21262d;margin-bottom:16px">
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Real Estate</div>
        <div style="font-size:20px;font-weight:700;color:#e6edf3;letter-spacing:-.01em">Portafoglio Immobiliare</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">${ownedIds.size} proprietà · Valore €${portfolioValue.toLocaleString('it-IT')} · Rendita €${totalDailyRent > 0 ? totalDailyRent.toLocaleString('it-IT') : '0'}/g</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Proprietà</div>
            <div style="font-size:18px;font-weight:700;color:${ownedIds.size>0?'#c79a2a':'#6b7280'};font-family:monospace">${ownedIds.size}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Valore Port.</div>
            <div style="font-size:18px;font-weight:700;color:${portfolioValue>0?'#c79a2a':'#6b7280'};font-family:monospace">${portfolioValue>0?'€'+Math.round(portfolioValue/1000)+'k':'—'}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Rendita/g</div>
            <div style="font-size:18px;font-weight:700;color:${totalDailyRent>0?'#1aa06a':'#6b7280'};font-family:monospace">${totalDailyRent>0?'+€'+totalDailyRent.toLocaleString('it-IT'):'—'}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:10px 12px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Budget</div>
            <div style="font-size:18px;font-weight:700;color:#2f74c0;font-family:monospace">€${Math.round((gameState.cash||0)/1000)}k</div>
        </div>
    </div>`;

    if (ownedIds.size > 0) {
        html += `<div style="font-size:10px;color:#1aa06a;padding:10px 14px;background:#0d2116;border:1px solid #1a4731;border-radius:6px;margin-bottom:16px">Le rendite vengono accreditate automaticamente dal server ogni 24h.</div>`;
    }

    if (listings.length === 0) {
        html += `<div style="text-align:center;padding:24px;background:#161b22;border:1px solid #21262d;border-radius:6px;color:#6b7280;font-size:11px">Nessun immobile disponibile — il mercato si espanderà nelle prossime stagioni.</div>`;
    } else {
        html += `<div style="display:flex;flex-direction:column;gap:12px" class="ce-stagger">`;
        listings.forEach(l => {
            const isOwned   = ownedIds.has(l.id);
            const canAfford = gameState.cash >= (l.cost||0);
            const ownedRow  = owned.find(o => o.listing_id === l.id);

            let nextRentStr = '';
            if (isOwned && ownedRow?.last_rent_at) {
                const diffMs = new Date(ownedRow.last_rent_at).getTime() + 86400000 - Date.now();
                if (diffMs > 0) {
                    const hrs = Math.floor(diffMs/3600000), mins = Math.floor((diffMs%3600000)/60000);
                    nextRentStr = `${hrs}h ${mins}m alla prossima rendita`;
                } else {
                    nextRentStr = 'Rendita in arrivo…';
                }
            }

            html += `<div style="background:#161b22;border:1px solid ${isOwned?'#c79a2a':'#21262d'};border-radius:6px;overflow:hidden">`;

            if (l.image_url) {
                html += `<div style="position:relative;height:120px;overflow:hidden">
                    <img src="${l.image_url}" alt="${l.name}" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy">
                    <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.75) 0%,transparent 55%)"></div>
                    ${isOwned ? `<div style="position:absolute;top:8px;right:8px">${_pill('✓ TUO', '#c79a2a')}</div>` : ''}
                    <div style="position:absolute;bottom:10px;left:14px">
                        <div style="font-size:14px;font-weight:700;color:#fff">${l.name}</div>
                        <div style="font-size:11px;color:#c79a2a">${l.city}</div>
                    </div>
                </div>`;
            } else {
                html += `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:14px 14px 0">
                    <div>
                        <div style="font-size:14px;font-weight:700;color:#e6edf3">${l.name}</div>
                        <div style="font-size:11px;color:#c79a2a">${l.city}</div>
                    </div>
                    ${isOwned ? _pill('✓ TUO', '#c79a2a') : ''}
                </div>`;
            }

            html += `<div style="padding:12px 14px">
                ${l.description ? `<div style="font-size:10px;color:#6b7280;line-height:1.5;margin-bottom:10px">${l.description}</div>` : ''}
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
                    ${_pill('+€'+(l.daily_rent||0).toLocaleString('it-IT')+'/g', '#1aa06a')}
                    ${l.bonus_type === 'driver_stress_recovery' ? _pill('Recupero stress', '#7c5fc9') : ''}
                    ${isOwned && nextRentStr ? _pill(nextRentStr, '#2f74c0') : ''}
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="font-size:15px;font-weight:700;color:#c79a2a;font-family:monospace">€${(l.cost||0).toLocaleString('it-IT')}</div>
                    ${isOwned
                        ? _pill('✓ Rendita attiva', '#1aa06a')
                        : _btn(canAfford ? 'Acquista' : `Mancano €${((l.cost||0)-gameState.cash).toLocaleString('it-IT')}`, ceAct('doBuyRealEstate', [l.id]), canAfford?'gold':'', !canAfford)}
                </div>
            </div>
            </div>`;
        });
        html += `</div>`;
    }

    html += `</div>`;
    container.innerHTML = `<div class="em em-page"><div class="em-wrap">` + html + `</div></div>`;
}
window.renderTabRealEstate = renderTabRealEstate;

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
    // NOTE: the old mobile hijack here was removed (BUG 5). It referenced an
    // obsolete sidebar selector (`nav.fixed.left-4`), ran before login when
    // gameState wasn't ready, and rendered a half-broken overlay on top of the
    // live desktop chrome. Mobile is now handled purely with responsive CSS in
    // style.css (the real game UI adapts to narrow screens), so no JS hijack.
    if (_isMobile()) document.body.classList.add('mobile-mode');
});
