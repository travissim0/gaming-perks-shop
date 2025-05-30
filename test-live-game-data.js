// Test script to send game data with the new team structure
// This simulates the scenario in the screenshot: PT C (offense, red) vs WC T (defense, green)
const testGameData = {
    arenaName: "ovd",
    gameType: "OvD",
    baseUsed: "D7",
    players: [
        // PT C Team (Offense) - Collective team, should be RED colored
        { alias: "OBS", team: "PT C", teamType: "Collective", class: "Infantry", isOffense: true, weapon: null },
        
        // WC T Team (Defense) - Titan team, should be GREEN colored
        { alias: "Axidus", team: "WC T", teamType: "Titan", class: "Heavy Weapons", isOffense: false, weapon: null }
    ]
};

async function sendTestData() {
    try {
        const response = await fetch('https://freeinf.org/api/game-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testGameData)
        });

        if (response.ok) {
            const result = await response.json();
            console.log('✅ Test data sent successfully:', result);
        } else {
            console.error('❌ Failed to send test data:', response.status, response.statusText);
        }
    } catch (error) {
        console.error('❌ Error sending test data:', error);
    }
}

sendTestData(); 