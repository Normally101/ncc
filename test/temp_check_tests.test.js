const { test } = require('node:test');
const fs = require('node:fs');

test('check test occurrences', () => {
    const candidates = [
        'b2bLockedDriverIds',
        'driverSkillEffect',
        'skipAcademyTraining',
        'assignSpecialty',
        'superchargeVehicle',
        'refillTires',
        'buyStandardFuel',
        'buyBlackMarketFuel',
        'getDepotLevelData',
        'returnToHub',
        'applyVehicleSkin',
        'terminateLease',
        '_listCompanyIPO_NPC',
        'skipConstruction',
        'wakeDriverDC',
        'instaHealDC',
        '_getBrandVolumeBonus',
        '_getBrandPrestigeBonus',
        '_getPrestige',
        'toggleBlacklist',
        'openLeasingModal',
        'renderGlobalEventPanel',
        'getLang',
        'removeCheckpointMarker',
        '_hasFleet',
        '_vehicleOk',
        '_driverOk',
        'getMissionRequires',
        'getRoutesByRegion',
        'getRouteById',
        'isVeniceIslandHotel',
        '_getSlotMeta',
        '_fmtTs',
        'getSharedSlotRivals',
        'pushLeaderboardNow',
        'forceCloudSave',
        'startNewGameSlot',
        'loadExistingSlot',
        '_carRewardLine',
        '_updateTrafficLabel',
        '_vipSyncCash',
        'getRealWeatherForProvince',
        '_realWeatherGetTrafficMult',
        '_veteran'
    ];

    function getAllFiles(dir) {
        let results = [];
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            file = dir + '/' + file;
            const stat = fs.statSync(file);
            if (stat && stat.isDirectory()) {
                results = results.concat(getAllFiles(file));
            } else if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.md')) {
                results.push(file);
            }
        });
        return results;
    }

    const testFiles = getAllFiles('test').filter(f => !f.includes('temp_'));
    const testContents = testFiles.map(f => ({ file: f, content: fs.readFileSync(f, 'utf8') }));

    console.log('--- TEST OCCURRENCES ---');
    for (const c of candidates) {
        const matchingTests = testContents.filter(t => t.content.includes(c)).map(t => t.file);
        console.log(`${c}: in ${matchingTests.length} test files -> ${matchingTests.join(', ')}`);
    }
});
