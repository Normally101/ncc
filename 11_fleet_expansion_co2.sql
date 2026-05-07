-- =============================================================================
-- 11_fleet_expansion_co2.sql
-- Chauffeur Empire — CO2 rates per la flotta espansa (Stellar Q, Volt, Majestic)
-- IDEMPOTENT: safe to re-run.
-- =============================================================================

INSERT INTO vehicle_co2_rates (model_id, co2_per_km_kg) VALUES
    -- Stellar Q electric (zero emissioni)
    ('stellar_q_exec',      0.00),
    ('stellar_q_imp',       0.00),
    ('stellar_q_carr',      0.00),
    -- Volt electric (zero emissioni)
    ('volt_s_hyper',        0.00),
    ('volt_3_urban',        0.00),
    ('volt_y_cross',        0.00),
    -- Majestic
    ('majestic_spirit',     0.25),   -- V12 benzina
    ('majestic_e_specter',  0.00)    -- elettrica
ON CONFLICT (model_id) DO UPDATE SET co2_per_km_kg = EXCLUDED.co2_per_km_kg;

-- =============================================================================
-- FINE 11_fleet_expansion_co2.sql
-- =============================================================================
