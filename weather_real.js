'use strict';
/* ================================================================
   weather_real.js — Chauffeur Empire
   Espansione 8: Meteo e Traffico Reale (OpenWeatherMap API)
   ================================================================ */

window._realWeatherState = {
    data:       {},   // { province_id: { game_weather, traffic_mult, temp, ... } }
    _lastFetch: 0,
    _sub:       null,
};

// ── DATA LAYER ────────────────────────────────────────────────────────────────

window.realWeatherRefresh = async function(force = false) {
    const now = Date.now();
    if (!force && now - window._realWeatherState._lastFetch < 300000) return; // 5-min cache
    window._realWeatherState._lastFetch = now;

    const sb = window.supabase;
    if (!sb) return;

    const { data, error } = await sb.rpc('rpc_get_real_weather');
    if (error || !data) return;

    window._realWeatherState.data = {};
    for (const row of data) {
        window._realWeatherState.data[row.province_id] = row;
    }

    _applyRealWeather();
};

// Get real weather for a specific province (falls back to current region)
window.getRealWeatherForProvince = function(provinceId) {
    return window._realWeatherState.data[provinceId] || null;
};

// Apply real weather to gameState.weather based on player's current HQ/region
function _applyRealWeather() {
    if (typeof gameState === 'undefined') return;

    // Determine player's primary province
    const hqRegion  = gameState.hq?.region || null;
    const regionToProvince = {
        lazio:      'prov_roma',
        lombardia:  'prov_milano',
        campania:   'prov_napoli',
        veneto:     'prov_venezia',
        piemonte:   'prov_torino',
    };

    const provinceId = regionToProvince[hqRegion] || 'prov_roma';
    const realData   = window._realWeatherState.data[provinceId];
    if (!realData) return;

    // Override game weather with real data
    const prevWeather = gameState.weather;
    gameState.weather = realData.game_weather || 'sole';
    gameState._realTrafficMult = realData.traffic_mult || 1.0;
    gameState._realWeatherData = realData;

    // Update weather HUD
    const overlay = document.getElementById('weather-overlay');
    if (overlay) {
        overlay.className = 'weather-overlay';
        if (gameState.weather === 'pioggia') overlay.classList.add('weather-rain');
        else if (gameState.weather === 'neve') overlay.classList.add('weather-snow');
    }

    const weatherIcon  = document.getElementById('tb-weather-icon');
    const weatherLabel = document.getElementById('tb-weather-label');
    const WEATHER_MAP = { sole: { icon: '☀️', label: 'Sereno' }, pioggia: { icon: '🌧️', label: 'Pioggia' }, neve: { icon: '❄️', label: 'Neve' } };
    if (weatherIcon  && WEATHER_MAP[gameState.weather]) weatherIcon.textContent  = WEATHER_MAP[gameState.weather].icon;
    if (weatherLabel && WEATHER_MAP[gameState.weather]) weatherLabel.textContent = `${WEATHER_MAP[gameState.weather].label}${realData.temp_celsius != null ? ` ${realData.temp_celsius}°C` : ''}`;

    if (prevWeather !== gameState.weather && typeof logToMap === 'function') {
        const ws = WEATHER_MAP[gameState.weather] || {};
        logToMap(`${ws.icon || '🌍'} Meteo reale aggiornato: ${ws.label || gameState.weather} a ${provinceId} (${realData.owm_description || ''})`);
    }
}

// Override _getTrafficMult in engine.js to include real-world traffic
window._realWeatherGetTrafficMult = function(baseMultFn) {
    const baseMult = typeof baseMultFn === 'function' ? baseMultFn() : 1.0;
    const realMult = (typeof gameState !== 'undefined' && gameState._realTrafficMult) || 1.0;
    return baseMult * realMult;
};

// ── WEATHER HUD PANEL (shown in sidebar or on map) ────────────────────────────

window.renderRealWeatherPanel = function() {
    const container = document.getElementById('real-weather-panel');
    if (!container) return;

    const data = window._realWeatherState.data;
    const provinces = Object.values(data);
    if (provinces.length === 0) {
        container.innerHTML = '<div class="text-[9px] text-gray-500 text-center">Dati meteo non disponibili</div>';
        return;
    }

    const weatherIcons = { sole: '☀️', pioggia: '🌧️', neve: '❄️' };
    container.innerHTML = `
      <div class="text-[9px] text-gold uppercase tracking-widest mb-2">🌍 Meteo Reale Italia</div>
      <div class="grid grid-cols-2 gap-1">
        ${provinces.map(p => {
            const provinceNames = {
                prov_roma: 'Roma', prov_milano: 'Milano', prov_napoli: 'Napoli',
                prov_venezia: 'Venezia', prov_torino: 'Torino', prov_amalfi: 'Amalfi'
            };
            const ageMin = Math.round((Date.now() - new Date(p.updated_at).getTime()) / 60000);
            return `
              <div class="bg-white/3 rounded-lg p-1.5 text-center">
                <div class="text-[8px] text-gray-400">${provinceNames[p.province_id] || p.province_id}</div>
                <div class="text-lg leading-none">${weatherIcons[p.game_weather] || '☁️'}</div>
                ${p.temp_celsius != null ? `<div class="text-[9px] text-white">${p.temp_celsius}°C</div>` : ''}
                ${p.traffic_mult > 1.05 ? `<div class="text-[8px] text-orange-400">Traffico ×${p.traffic_mult.toFixed(1)}</div>` : ''}
                <div class="text-[7px] text-gray-600">${ageMin}m fa</div>
              </div>`;
        }).join('')}
      </div>`;
};

// ── REALTIME SUBSCRIPTION ─────────────────────────────────────────────────────

function _realWeatherSubscribe() {
    const sb = window.supabase;
    if (!sb || window._realWeatherState._sub) return;

    window._realWeatherState._sub = sb
        .channel('real_weather_changes')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'real_world_status' }, (payload) => {
            if (payload.new) {
                window._realWeatherState.data[payload.new.province_id] = payload.new;
                _applyRealWeather();
                window.renderRealWeatherPanel();
            }
        })
        .subscribe();
}

// ── INIT ──────────────────────────────────────────────────────────────────────

window.realWeatherInit = async function() {
    await window.realWeatherRefresh(true);
    _realWeatherSubscribe();

    // Refresh every 10 minutes (edge function runs every 30min)
    setInterval(() => window.realWeatherRefresh(), 600000);
};
