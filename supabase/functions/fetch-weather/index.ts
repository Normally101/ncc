// Supabase Edge Function: fetch-weather
// Chiama OpenWeatherMap, mappa condizioni a game weather, aggiorna real_world_status
// Deploy: supabase functions deploy fetch-weather
// Cron: ogni 30 min via pg_cron o Supabase Scheduler

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CITIES = [
    { province_id: 'prov_roma',    city: 'Rome,IT',    lat: 41.9, lon: 12.5 },
    { province_id: 'prov_milano',  city: 'Milan,IT',   lat: 45.5, lon: 9.2  },
    { province_id: 'prov_napoli',  city: 'Naples,IT',  lat: 40.8, lon: 14.3 },
    { province_id: 'prov_venezia', city: 'Venice,IT',  lat: 45.4, lon: 12.3 },
    { province_id: 'prov_torino',  city: 'Turin,IT',   lat: 45.1, lon: 7.7  },
    { province_id: 'prov_amalfi',  city: 'Amalfi,IT',  lat: 40.6, lon: 14.6 },
];

// Map OWM weather codes to game weather states
function mapWeatherCode(owmId: number, temp: number): string {
    if (owmId >= 600 && owmId < 700) return 'neve';  // Snow
    if (owmId >= 300 && owmId < 600) return 'pioggia'; // Drizzle, Rain, Thunderstorm
    if (owmId >= 200 && owmId < 300) return 'pioggia'; // Thunderstorm
    if (owmId >= 700 && owmId < 800) return 'pioggia'; // Atmosphere (fog, haze)
    if (temp < 0 && owmId === 800) return 'neve'; // Clear but freezing
    return 'sole'; // Clear or clouds
}

// Map OWM wind speed to traffic multiplier
function mapTrafficMult(windSpeedKmh: number, weatherId: number): number {
    let base = 1.0;
    if (windSpeedKmh > 60) base = 1.30;
    else if (windSpeedKmh > 40) base = 1.15;
    else if (windSpeedKmh > 20) base = 1.05;
    if (weatherId >= 200 && weatherId < 300) base *= 1.20; // Storm = extra traffic
    return Math.min(2.0, base);
}

Deno.serve(async (_req: Request) => {
    const apiKey = Deno.env.get('OPENWEATHER_API_KEY');
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'OPENWEATHER_API_KEY not set' }), { status: 500 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const results = [];

    for (const city of CITIES) {
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${city.lat}&lon=${city.lon}&appid=${apiKey}&units=metric`;
            const res = await fetch(url);
            if (!res.ok) { results.push({ ...city, error: res.status }); continue; }

            const data = await res.json();
            const owmId    = data.weather?.[0]?.id || 800;
            const temp     = data.main?.temp || 15;
            const windKmh  = (data.wind?.speed || 0) * 3.6;
            const humidity = data.main?.humidity || 50;

            const gameWeather  = mapWeatherCode(owmId, temp);
            const trafficMult  = mapTrafficMult(windKmh, owmId);
            const description  = data.weather?.[0]?.description || '';
            const icon         = data.weather?.[0]?.icon || '01d';

            const { error } = await sb
                .from('real_world_status')
                .upsert({
                    province_id:  city.province_id,
                    game_weather: gameWeather,
                    traffic_mult: trafficMult,
                    temp_celsius: Math.round(temp),
                    humidity,
                    wind_kmh:     Math.round(windKmh),
                    owm_description: description,
                    owm_icon:     icon,
                    updated_at:   new Date().toISOString(),
                }, { onConflict: 'province_id' });

            results.push({ province_id: city.province_id, weather: gameWeather, traffic: trafficMult, temp, error: error?.message });
        } catch (e) {
            results.push({ province_id: city.province_id, error: String(e) });
        }
    }

    return new Response(JSON.stringify({ ok: true, updated: results.length, results }), {
        headers: { 'Content-Type': 'application/json' },
    });
});
