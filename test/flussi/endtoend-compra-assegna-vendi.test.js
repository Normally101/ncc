'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { freshEnv } = require('../../test-support/game-env.js');

/**
 * Test end-to-end flow: buy car -> assign to driver -> sell car
 * 
 * This test verifies that the full flow works correctly in both online and offline modes.
 * In offline mode (ServerState not ready), purchases use CE_money.spend and sales 
 * should use CE_money.earn to maintain proper money flow.
 */
describe('End-to-end flow: buy -> assign -> sell vehicle', () => {
    
    test('offline mode: buy car via CE_money.spend, assign driver, sell car via CE_money.earn', async () => {
        // Create environment with ServerState NOT ready (offline/fallback mode)
        const env = freshEnv({
            render: true,
            serverState: {
                isReady: () => false, // ServerState not ready -> use CE_money fallback
                // Provide mocks for other RPCs that might be called during the test
                // (though in offline mode, these shouldn't be reached for buy/sell vehicle)
            },
        });
        
        const { sandbox, gs, env: testEnv } = env;
        const stopIntervals = env.stopAllIntervals.bind(env);
        
        try {
            // Setup: give player enough cash to buy a car
            gs.cash = 500000; // Enough for Stellar E-Executive (120000) or similar
            
            // Store initial state for verification
            const initialCash = gs.cash;
            const initialFleetSize = gs.fleet.length;
            
            // STEP 1: Buy a car from showroom (should use CE_money.spend in offline mode)
            sandbox.renderTabShowroom(); // opens showroom tab
            sandbox._srmOpenConfig('stellar_e_exec'); // select Stellar E-Executive
            
            // Verify the car price
            const carPrice = sandbox._srmTotalPrice(); // Should be 120000 for base Stellar E-Executive
            assert.strictEqual(carPrice, 120000, 'Stellar E-Executive should cost 120000€');
            
            // Buy the car
            await sandbox._srmPurchase();
            
            // Verify purchase worked correctly
            assert.strictEqual(gs.fleet.length, initialFleetSize + 1, 'Fleet should have one more car');
            const boughtCar = gs.fleet[gs.fleet.length - 1]; // Most recently added car
            assert.strictEqual(boughtCar.name, 'Stellar E-Executive');
            assert.strictEqual(boughtCar.tier, 'business');
            assert.strictEqual(boughtCar.condition, 100);
            assert.strictEqual(boughtCar.isLease, false);
            // In offline mode, _serverId should be null because ServerState.buyVehicle wasn't called
            assert.strictEqual(boughtCar._serverId, null, 'In offline mode, bought car should have null _serverId');
            
            // Verify money was deducted via CE_money.spend (local fallback)
            assert.strictEqual(gs.cash, initialCash - carPrice, 
                `Cash should decrease by car price (${carPrice}) in offline mode`);
            
            // STEP 2: Assign the car to a driver
            // First, add a driver to assign to the car
            gs.drivers.push({ 
                id: 'd_test_driver', 
                name: 'Test Driver', 
                status: 'idle', 
                assignedCarId: null, 
                queue: [], 
                salary: 3000, 
                fatigue: 0, 
                restHoursLeft: 0, 
                xp: 0, 
                level: 0, 
                morale: 100 
            });
            
            const driverId = 'd_test_driver';
            const carId = boughtCar.id;
            
            // Assign car to driver
            sandbox.assignCarToDriver(carId, driverId);
            
            // Verify assignment worked
            const driver = gs.drivers.find(d => d.id === driverId);
            assert.strictEqual(driver.assignedCarId, carId, 
                'Driver should be assigned to the car');
            assert.strictEqual(driver.status, 'idle', 
                'Driver status should remain idle after assignment');
            
            // STEP 3: Sell the car (should use CE_money.earn fallback in offline mode)
            await sandbox.sellCar(carId);
            
            // Verify sale worked correctly
            // In offline mode with the bug fix, selling should:
            // 1. Add money back via CE_money.earn 
            // 2. Remove car from fleet
            // 3. Clear driver's assignedCarId
            
            // Check that car was removed from fleet
            assert.strictEqual(gs.fleet.length, initialFleetSize, 
                'Fleet should have same number of cars as before purchase (car was sold)');
            
            // Check that the specific car is no longer in fleet
            assert.strictEqual(gs.fleet.find(c => c.id === carId), null,
                'Sold car should no longer be in fleet');
            
            // Check that driver's assignment was cleared
            assert.strictEqual(driver.assignedCarId, null,
                'Driver should no longer be assigned to the sold car');
            assert.strictEqual(driver.status, 'idle',
                'Driver status should remain idle after selling car');
            
            // Check money flow: 
            // - Initially: initialCash
            // - After buy: initialCash - carPrice (via CE_money.spend)
            // - After sell: (initialCash - carPrice) + sellPrice (via CE_money.earn)
            // 
            // For a car in perfect condition (100%) with tier 'business':
            // baseValue = 35000 (from engine.js::sellCar)
            // sellPrice = Math.floor(35000 * (100 / 100) * 0.7) = 24500
            //
            // So final cash should be: initialCash - carPrice + sellPrice
            //                     = initialCash - 120000 + 24500
            //                     = initialCash - 95500
            
            const expectedSellPrice = Math.floor(35000 * (100 / 100) * 0.7); // 24500
            const expectedFinalCash = initialCash - carPrice + expectedSellPrice;
            
            assert.strictEqual(gs.cash, expectedFinalCash,
                `After buy+sell, cash should be initial - ${carPrice} + ${expectedSellPrice} = ${expectedFinalCash}. ` +
                `Actual: ${gs.cash}`);
                
            // Also verify that the net cash change is correct
            const netCashChange = gs.cash - initialCash;
            const expectedNetChange = -carPrice + expectedSellPrice; // -120000 + 24500 = -95500
            assert.strictEqual(netCashChange, expectedNetChange,
                `Net cash change should be -${carPrice} + ${expectedSellPrice} = ${expectedNetChange}`);
        } finally {
            stopIntervals();
        }
    });
    
    test('online mode: buy car via ServerState.buyVehicle, assign driver, sell car via ServerState.sellVehicle', async () => {
        // Create environment with ServerState ready (online mode)
        let syncedCash = null;
        const env = freshEnv({
            render: true,
            serverState: {
                isReady: () => true, // ServerState ready
                syncCash: async (cash) => {
                    syncedCash = cash;
                    return { success: true, cash };
                },
                // Mock the buyVehicle and sellVehicle RPCs to track calls and simulate proper behavior
                buyVehicle: async (modelId, price, hqCity) => {
                    // Simulate server deducting money and returning vehicle data
                    syncedCash = (syncedCash || gs.cash) - price;
                    return {
                        id: 'srv_veh_' + modelId + '_' + Math.random().toString(36).slice(2),
                        model_id: modelId,
                        current_city: hqCity || 'roma',
                        status: 'IDLE',
                    };
                },
                sellVehicle: async (vehicleId, price) => {
                    // Simulate server adding money
                    syncedCash = (syncedCash || gs.cash) + price;
                    return { success: true, sold_price: price };
                }
            },
        });
        
        const { sandbox, gs, env: testEnv } = env;
        const stopIntervals = env.stopAllIntervals.bind(env);
        
        try {
            // Setup: give player enough cash to buy a car
            gs.cash = 500000;
            syncedCash = gs.cash; // Initialize synced cash to match gameState
            
            // Store initial state for verification
            const initialCash = gs.cash;
            const initialFleetSize = gs.fleet.length;
            
            // STEP 1: Buy a car from showroom (should use ServerState.buyVehicle in online mode)
            sandbox.renderTabShowroom();
            sandbox._srmOpenConfig('stellar_e_exec');
            
            const carPrice = sandbox._srmTotalPrice();
            assert.strictEqual(carPrice, 120000);
            
            await sandbox._srmPurchase();
            
            // Verify purchase worked correctly
            assert.strictEqual(gs.fleet.length, initialFleetSize + 1, 'Fleet should have one more car');
            const boughtCar = gs.fleet[gs.fleet.length - 1];
            assert.strictEqual(boughtCar.name, 'Stellar E-Executive');
            assert.strictEqual(boughtCar.tier, 'business');
            assert.strictEqual(boughtCar.condition, 100);
            assert.strictEqual(boughtCar.isLease, false);
            // In online mode, _serverId should be set from ServerState.buyVehicle result
            assert.ok(boughtCar._serverId, 'In online mode, bought car should have _serverId from server');
            
            // Verify money was deducted via ServerState (which should sync via Realtime)
            // Note: In this test, we're manually managing syncedCash to simulate the Realtime sync
            // In reality, the Realtime subscription would update gameState.cash when server cash changes
            assert.strictEqual(gs.cash, initialCash - carPrice, 
                `Cash should decrease by car price (${carPrice}) in online mode`);
            assert.strictEqual(syncedCash, gs.cash,
                'Synced cash should match gameState.cash after server transaction');
            
            // STEP 2: Assign the car to a driver
            gs.drivers.push({ 
                id: 'd_test_driver', 
                name: 'Test Driver', 
                status: 'idle', 
                assignedCarId: null, 
                queue: [], 
                salary: 3000, 
                fatigue: 0, 
                restHoursLeft: 0, 
                xp: 0, 
                level: 0, 
                morale: 100 
            });
            
            const driverId = 'd_test_driver';
            const carId = boughtCar.id;
            
            sandbox.assignCarToDriver(carId, driverId);
            
            // Verify assignment worked
            const driver = gs.drivers.find(d => d.id === driverId);
            assert.strictEqual(driver.assignedCarId, carId, 
                'Driver should be assigned to the car');
            
            // STEP 3: Sell the car (should use ServerState.sellVehicle in online mode)
            await sandbox.sellCar(carId);
            
            // Verify sale worked correctly
            assert.strictEqual(gs.fleet.length, initialFleetSize, 
                'Fleet should have same number of cars as before purchase (car was sold)');
            assert.strictEqual(gs.fleet.find(c => c.id === carId), null,
                'Sold car should no longer be in fleet');
            assert.strictEqual(driver.assignedCarId, null,
                'Driver should no longer be assigned to the sold car');
            
            // Check money flow in online mode
            // For a car in perfect condition (100%) with tier 'business':
            // baseValue = 35000
            // sellPrice = Math.floor(35000 * (100 / 100) * 0.7) = 24500
            //
            // Final cash should be: initialCash - carPrice + sellPrice
            
            const expectedSellPrice = Math.floor(35000 * (100 / 100) * 0.7); // 24500
            const expectedFinalCash = initialCash - carPrice + expectedSellPrice;
            
            assert.strictEqual(gs.cash, expectedFinalCash,
                `After buy+sell, cash should be initial - ${carPrice} + ${expectedSellPrice} = ${expectedFinalCash}. ` +
                `Actual: ${gs.cash}`);
                
            const netCashChange = gs.cash - initialCash;
            const expectedNetChange = -carPrice + expectedSellPrice;
            assert.strictEqual(netCashChange, expectedNetChange,
                `Net cash change should be -${carPrice} + ${expectedSellPrice} = ${expectedNetChange}`);
                
            // Verify that syncCash was called appropriately (simulating Realtime sync)
            // We expect two syncCash calls: one after buy (deduction), one after sell (addition)
            // Note: In this simplified test, we're not actually testing the Realtime mechanism,
            // but rather that the money flow is correct when ServerState is ready
        } finally {
            stopIntervals();
        }
    });
});