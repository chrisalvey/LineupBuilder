// Global variables
let players = [];
let currentLineup = {};
let currentPosition = 'QB';
let contestType = 'classic';
let salaryCap = 50000;
let currentSort = 'salary-high';
let gameOdds = {};
const ODDS_API_KEY = '98134e3b5435f11219c586ef3dcc3f87';

// Enhanced player data
let injuryData = {};
let defenseRankings = {};
let weatherData = {};
let recentPerformance = {};

// Contest configurations based on official DraftKings rules
const contestConfigs = {
    classic: {
        positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'DST'],
        salaryCap: 50000,
        positionTabs: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST'],
        flexEligible: ['RB', 'WR', 'TE']
    },
    showdown: {
        positions: ['CPT', 'FLEX', 'FLEX', 'FLEX', 'FLEX', 'FLEX'],
        salaryCap: 50000,
        positionTabs: ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'ALL'],
        flexEligible: ['QB', 'RB', 'WR', 'TE', 'K', 'DST']
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    updatePositionTabs();
    initializeLineupSlots();
});

function initializeEventListeners() {
    // File upload
    document.getElementById('playerUpload').addEventListener('change', handleFileUpload);

    // Contest type selector
    document.getElementById('contestType').addEventListener('change', function(e) {
        contestType = e.target.value;
        salaryCap = contestConfigs[contestType].salaryCap;
        updatePositionTabs();
        initializeLineupSlots();
        updateSalaryDisplay();
        if (players.length > 0) {
            displayPlayers();
        }
    });

    // Sort selector
    document.getElementById('sortBy').addEventListener('change', function(e) {
        currentSort = e.target.value;
        displayPlayers();
    });

    // Auto-fill and clear buttons
    document.getElementById('autoFillBtn').addEventListener('click', autoFillLineup);
    document.getElementById('clearLineupBtn').addEventListener('click', clearLineup);

    // Position tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentPosition = this.dataset.position;
            displayPlayers();
        });
    });
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('fileName').textContent = file.name;

    const reader = new FileReader();
    reader.onload = function(e) {
        const csv = e.target.result;
        parseCSV(csv);
    };
    reader.readAsText(file);
}

function parseCSV(csv) {
    const lines = csv.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    players = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = lines[i].split(',').map(v => v.trim());
        const player = {};

        headers.forEach((header, index) => {
            player[header] = values[index];
        });

        // Only add if we have essential fields
        if (player.Name && player.Position && player.Salary) {
            players.push(player);
        }
    }

    calculatePlayerValues();
    calculateRecentPerformance();
    displayPlayers();

    // Fetch all enhanced data in background
    fetchGameOdds();
    fetchDefenseRankings();
    fetchInjuryData();
    fetchWeatherData();
}

function calculatePlayerValues() {
    // Calculate PPK (Points Per $1K) for each player
    players.forEach(player => {
        const avgPoints = parseFloat(player.AvgPointsPerGame) || 0;
        const salary = parseInt(player.Salary) || 1;

        // Calculate Points Per $1,000
        player.ppk = avgPoints > 0 ? (avgPoints / salary) * 1000 : 0;
    });

    // Group players by position and find top 10% threshold for each position
    const positionGroups = {};

    players.forEach(player => {
        const pos = player.Position;
        if (!positionGroups[pos]) {
            positionGroups[pos] = [];
        }
        positionGroups[pos].push(player.ppk);
    });

    // Calculate 90th percentile (top 10%) for each position
    const positionThresholds = {};

    Object.keys(positionGroups).forEach(pos => {
        const ppkValues = positionGroups[pos].sort((a, b) => b - a);
        const index = Math.floor(ppkValues.length * 0.10);
        positionThresholds[pos] = ppkValues[index] || 0;
    });

    // Mark players that are in top 10% for their position
    players.forEach(player => {
        const threshold = positionThresholds[player.Position] || 0;
        player.isTopValue = player.ppk >= threshold && player.ppk > 0;
    });
}

function getFilteredAndSortedPlayers() {
    const config = contestConfigs[contestType];

    const filteredPlayers = players.filter(p => {
        if (currentPosition === 'ALL') return true;
        if (currentPosition === 'FLEX') {
            return config.flexEligible.includes(p.Position);
        }
        return p.Position === currentPosition;
    });

    // Sort based on current sort selection
    switch(currentSort) {
        case 'salary-high':
            filteredPlayers.sort((a, b) => parseInt(b.Salary) - parseInt(a.Salary));
            break;
        case 'salary-low':
            filteredPlayers.sort((a, b) => parseInt(a.Salary) - parseInt(b.Salary));
            break;
        case 'avg-high':
            filteredPlayers.sort((a, b) => {
                const aAvg = parseFloat(a.AvgPointsPerGame) || 0;
                const bAvg = parseFloat(b.AvgPointsPerGame) || 0;
                return bAvg - aAvg;
            });
            break;
        case 'ppk-high':
            filteredPlayers.sort((a, b) => (b.ppk || 0) - (a.ppk || 0));
            break;
        case 'name-az':
            filteredPlayers.sort((a, b) => a.Name.localeCompare(b.Name));
            break;
        default:
            filteredPlayers.sort((a, b) => parseInt(b.Salary) - parseInt(a.Salary));
    }

    return filteredPlayers;
}

function displayPlayers() {
    const playerList = document.getElementById('playerList');
    const filteredPlayers = getFilteredAndSortedPlayers();

    if (filteredPlayers.length === 0) {
        playerList.innerHTML = '<p class="placeholder-text">No players available for this position</p>';
        return;
    }

    playerList.innerHTML = filteredPlayers.map((player, index) => {
        const salary = parseInt(player.Salary);
        const avgPts = player.AvgPointsPerGame ? parseFloat(player.AvgPointsPerGame).toFixed(1) : '-';
        const gameInfo = player['Game Info'] ? player['Game Info'].split(' ')[0] : '';

        // Value indicators
        const ppkValue = player.ppk > 0 ? player.ppk.toFixed(2) : 'N/A';
        const starIcon = player.isTopValue ? '<span class="value-star">⭐</span>' : '';
        const valueClass = player.isTopValue ? 'value-excellent' : '';

        // Injury status badge
        let injuryBadge = '';
        if (injuryData[player.ID]) {
            const injury = injuryData[player.ID];
            const injuryClass = injury.status === 'OUT' || injury.status === 'IR' ? 'injury-out' :
                               injury.status === 'D' ? 'injury-doubtful' : 'injury-questionable';
            injuryBadge = `<span class="injury-badge ${injuryClass}" title="${injury.description}">${injury.status}</span>`;
        }

        // Defense ranking matchup
        let defenseMatchup = '';
        if (gameInfo && player.Position !== 'DST') {
            const oppTeam = gameInfo.includes('@') ? gameInfo.split('@')[1] : gameInfo.split('vs')[1];
            const defKey = `${oppTeam}_${player.Position}`;
            if (defenseRankings[defKey]) {
                const ranking = defenseRankings[defKey];
                const isFavorable = ranking.rank > ranking.total * 0.67; // Top third worst defenses
                const matchupClass = isFavorable ? 'matchup-good' : ranking.rank < ranking.total * 0.33 ? 'matchup-bad' : 'matchup-neutral';
                defenseMatchup = `<span class="defense-matchup ${matchupClass}" title="Opponent ranks ${ranking.rank} vs ${player.Position}">vs #${ranking.rank} DEF</span>`;
            }
        }

        // Performance trend
        let trendIcon = '';
        if (recentPerformance[player.ID]) {
            const perf = recentPerformance[player.ID];
            if (perf.trend === 'hot') {
                trendIcon = '<span class="trend-icon hot" title="Hot streak">🔥</span>';
            } else if (perf.trend === 'cold') {
                trendIcon = '<span class="trend-icon cold" title="Cold streak">❄️</span>';
            }
        }

        // Target/Touch volume
        let volumeInfo = '';
        if (recentPerformance[player.ID]) {
            const perf = recentPerformance[player.ID];
            if (perf.targets) {
                volumeInfo = `<span class="volume-info" title="Projected targets">~${perf.targets} tgts</span>`;
            } else if (perf.touches) {
                volumeInfo = `<span class="volume-info" title="Projected touches">~${perf.touches} touches</span>`;
            }
        }

        // Weather alert
        let weatherAlert = '';
        if (gameInfo && weatherData[gameInfo]) {
            const weather = weatherData[gameInfo];
            if (weather.indoor) {
                weatherAlert = '<span class="weather-icon" title="Indoor game">🏟️</span>';
            } else if (weather.conditions && weather.conditions.toLowerCase().includes('rain')) {
                weatherAlert = '<span class="weather-icon weather-bad" title="Rain expected">🌧️</span>';
            } else if (weather.conditions && weather.conditions.toLowerCase().includes('snow')) {
                weatherAlert = '<span class="weather-icon weather-bad" title="Snow expected">❄️</span>';
            }
        }

        // Get odds info for this game
        let oddsInfo = '';
        if (index === 0 && gameInfo) {
            console.log('Sample gameInfo from CSV:', gameInfo, 'Odds available:', gameOdds[gameInfo] ? 'Yes' : 'No');
        }
        if (gameInfo && gameOdds[gameInfo]) {
            const odds = gameOdds[gameInfo];
            const spreadText = odds.spread !== null ? `${odds.homeTeam} ${odds.spread > 0 ? '+' : ''}${odds.spread}` : '';
            const totalText = odds.total !== null ? `O/U ${odds.total}` : '';
            const projText = odds.homeTotal && odds.awayTotal ? `(${odds.awayTeam} ${odds.awayTotal}, ${odds.homeTeam} ${odds.homeTotal})` : '';
            oddsInfo = spreadText || totalText ? `<br><small class="odds-info">${spreadText} ${totalText} ${projText}</small>` : '';
        }

        return `
            <div class="player-item ${valueClass}" onclick="addPlayerToLineup(${index})">
                <div class="player-name">
                    ${player.Name} ${starIcon} ${trendIcon} ${injuryBadge} ${weatherAlert}
                </div>
                <div class="player-details">
                    <span>${player.TeamAbbrev || ''} - ${player.Position}</span>
                    <span class="player-avg">${avgPts} avg ${volumeInfo}</span>
                </div>
                <div class="player-details">
                    <span class="player-value">${ppkValue} PPK ${defenseMatchup}</span>
                    <span class="player-salary">$${salary.toLocaleString()}</span>
                </div>
                <div class="player-details">
                    <span class="player-game">${gameInfo}${oddsInfo}</span>
                </div>
            </div>
        `;
    }).join('');
}

function initializeLineupSlots() {
    currentLineup = {};
    const lineupSlots = document.getElementById('lineupSlots');
    const positions = contestConfigs[contestType].positions;

    lineupSlots.innerHTML = positions.map((pos, index) => `
        <div class="lineup-slot" id="slot-${index}">
            <div class="slot-label">${pos}</div>
            <div class="slot-content" id="slot-content-${index}">
                <span class="empty-slot">Empty</span>
            </div>
        </div>
    `).join('');

    updateSalaryDisplay();
}

function addPlayerToLineup(playerIndex) {
    const filteredPlayers = getFilteredAndSortedPlayers();
    const player = filteredPlayers[playerIndex];

    if (!player) return;

    // Check if player is already in lineup
    const alreadyInLineup = Object.values(currentLineup).some(p => p.id === player.ID);
    if (alreadyInLineup) {
        alert('This player is already in your lineup');
        return;
    }

    const positions = contestConfigs[contestType].positions;
    const config = contestConfigs[contestType];

    // Find first empty slot that matches position
    for (let i = 0; i < positions.length; i++) {
        if (!currentLineup[i]) {
            const slotPosition = positions[i];

            // Check if player can fill this slot
            if (slotPosition === player.Position ||
                (slotPosition === 'FLEX' && config.flexEligible.includes(player.Position)) ||
                slotPosition === 'CPT') {

                currentLineup[i] = {
                    name: player.Name,
                    id: player.ID,
                    position: player.Position,
                    salary: parseInt(player.Salary),
                    team: player.TeamAbbrev || '',
                    avgPoints: player.AvgPointsPerGame || '0',
                    isCaptain: slotPosition === 'CPT'
                };
                updateLineupDisplay(i);
                updateSalaryDisplay();
                return;
            }
        }
    }

    alert('No available slot for this player');
}

function removePlayerFromLineup(slotIndex) {
    delete currentLineup[slotIndex];
    updateLineupDisplay(slotIndex);
    updateSalaryDisplay();
}

function updateLineupDisplay(slotIndex) {
    const slotContent = document.getElementById(`slot-content-${slotIndex}`);
    const slot = document.getElementById(`slot-${slotIndex}`);

    if (currentLineup[slotIndex]) {
        const player = currentLineup[slotIndex];
        slot.classList.add('filled');
        const captainBadge = player.isCaptain ? '<span class="captain-badge">1.5x</span>' : '';

        slotContent.innerHTML = `
            <div class="slot-player">
                <div>
                    <strong>${player.name}</strong> ${captainBadge}<br>
                    <small>${player.team} ${player.position} - $${player.salary.toLocaleString()}</small>
                </div>
                <button class="remove-btn" onclick="removePlayerFromLineup(${slotIndex})">Remove</button>
            </div>
        `;
    } else {
        slot.classList.remove('filled');
        slotContent.innerHTML = '<span class="empty-slot">Empty</span>';
    }
}

function updatePositionTabs() {
    const tabsContainer = document.querySelector('.position-tabs');
    const config = contestConfigs[contestType];
    const tabs = config.positionTabs;

    const tabLabels = {
        'QB': 'Quarterback',
        'RB': 'Running Back',
        'WR': 'Wide Receiver',
        'TE': 'Tight End',
        'K': 'Kicker',
        'DST': 'Defense',
        'FLEX': 'Flex',
        'ALL': 'All Players'
    };

    tabsContainer.innerHTML = tabs.map(pos => `
        <button class="tab-btn${pos === currentPosition ? ' active' : ''}" data-position="${pos}">
            ${tabLabels[pos]}
        </button>
    `).join('');

    // Re-attach event listeners
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentPosition = this.dataset.position;
            displayPlayers();
        });
    });

    // Set default position
    currentPosition = tabs[0];
}

function updateSalaryDisplay() {
    const totalSalary = Object.values(currentLineup).reduce((sum, player) => sum + player.salary, 0);
    const remaining = salaryCap - totalSalary;

    // Calculate remaining slots and average remaining per player
    const totalSlots = contestConfigs[contestType].positions.length;
    const filledSlots = Object.keys(currentLineup).length;
    const remainingSlots = totalSlots - filledSlots;
    const avgRemaining = remainingSlots > 0 ? Math.floor(remaining / remainingSlots) : 0;

    document.getElementById('salaryUsed').textContent = `$${totalSalary.toLocaleString()}`;
    document.getElementById('salaryRemaining').textContent = `$${remaining.toLocaleString()}`;
    document.getElementById('salaryRemaining').style.color = remaining < 0 ? '#dc3545' : '#667eea';
    document.getElementById('avgRemaining').textContent = `$${avgRemaining.toLocaleString()}`;
}

// Clear lineup
function clearLineup() {
    if (Object.keys(currentLineup).length === 0) {
        return;
    }

    if (confirm('Are you sure you want to clear your lineup?')) {
        currentLineup = {};
        const positions = contestConfigs[contestType].positions;

        for (let i = 0; i < positions.length; i++) {
            updateLineupDisplay(i);
        }

        updateSalaryDisplay();
    }
}

// Auto-fill lineup with best value players
function autoFillLineup() {
    if (players.length === 0) {
        alert('Please upload a CSV file first');
        return;
    }

    const positions = contestConfigs[contestType].positions;
    const config = contestConfigs[contestType];

    // Track already used players from existing lineup
    const usedPlayerIds = new Set();
    let currentSalary = 0;

    // Add existing players to used set and calculate current salary
    Object.values(currentLineup).forEach(player => {
        usedPlayerIds.add(player.id);
        currentSalary += player.salary;
    });

    // Sort all players by PPK (value) descending
    const sortedPlayers = [...players].sort((a, b) => (b.ppk || 0) - (a.ppk || 0));

    // Count empty slots to calculate remaining slots correctly
    const emptySlots = positions.filter((_, idx) => !currentLineup[idx]).length;
    let emptySlotsFilled = 0;

    // Fill each position slot
    for (let slotIndex = 0; slotIndex < positions.length; slotIndex++) {
        // Skip if slot is already filled
        if (currentLineup[slotIndex]) {
            continue;
        }

        const slotPosition = positions[slotIndex];
        const remainingSalary = salaryCap - currentSalary;
        const remainingEmptySlots = emptySlots - emptySlotsFilled;
        const maxSalaryForSlot = remainingSalary - (remainingEmptySlots - 1) * 3000; // Reserve min $3k per remaining slot

        // Find best available player for this position
        let bestPlayer = null;

        for (const player of sortedPlayers) {
            // Skip if already used
            if (usedPlayerIds.has(player.ID)) continue;

            const playerSalary = parseInt(player.Salary) || 0;

            // Skip if too expensive
            if (playerSalary > maxSalaryForSlot) continue;

            // Check position eligibility
            let eligible = false;

            if (slotPosition === 'CPT') {
                // Captain can be any position
                eligible = true;
            } else if (slotPosition === 'FLEX') {
                // FLEX can be RB/WR/TE in classic, or any in showdown
                eligible = config.flexEligible.includes(player.Position);
            } else {
                // Must match exact position
                eligible = player.Position === slotPosition;
            }

            if (eligible) {
                bestPlayer = player;
                break;
            }
        }

        // Add player to lineup if found
        if (bestPlayer) {
            const playerSalary = parseInt(bestPlayer.Salary) || 0;

            currentLineup[slotIndex] = {
                name: bestPlayer.Name,
                id: bestPlayer.ID,
                position: bestPlayer.Position,
                salary: playerSalary,
                team: bestPlayer.TeamAbbrev || '',
                avgPoints: bestPlayer.AvgPointsPerGame || '0',
                isCaptain: slotPosition === 'CPT'
            };

            usedPlayerIds.add(bestPlayer.ID);
            currentSalary += playerSalary;
            emptySlotsFilled++;
            updateLineupDisplay(slotIndex);
        }
    }

    updateSalaryDisplay();

    // Alert if lineup is incomplete
    const filledSlots = Object.keys(currentLineup).length;
    const totalSlots = positions.length;

    if (emptySlotsFilled > 0) {
        // Show success message if we filled any slots
        if (filledSlots < totalSlots) {
            alert(`Auto-fill added ${emptySlotsFilled} player${emptySlotsFilled !== 1 ? 's' : ''}. ${totalSlots - filledSlots} position${totalSlots - filledSlots !== 1 ? 's' : ''} still empty.`);
        }
    } else if (filledSlots < totalSlots) {
        alert(`Could not auto-fill any positions. Try adjusting salary constraints or check available players.`);
    }
}

// Fetch defense rankings from ESPN
async function fetchDefenseRankings() {
    try {
        // Fetch defensive stats for all teams
        const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?enable=stats');
        if (!response.ok) return;

        const data = await response.json();
        const teams = data.sports[0].leagues[0].teams;

        // Initialize rankings by position
        const defRankings = {
            QB: [], RB: [], WR: [], TE: []
        };

        // Process each team's defensive stats
        teams.forEach(teamData => {
            const team = teamData.team;
            const stats = team.record?.items?.[0]?.stats || [];

            // Get yards allowed stats (lower is better for defense)
            const passYdsAllowed = stats.find(s => s.name === 'avgPassingYardsAllowed')?.value || 250;
            const rushYdsAllowed = stats.find(s => s.name === 'avgRushingYardsAllowed')?.value || 120;

            defRankings.QB.push({ team: team.abbreviation, value: parseFloat(passYdsAllowed) });
            defRankings.WR.push({ team: team.abbreviation, value: parseFloat(passYdsAllowed) });
            defRankings.TE.push({ team: team.abbreviation, value: parseFloat(passYdsAllowed) });
            defRankings.RB.push({ team: team.abbreviation, value: parseFloat(rushYdsAllowed) });
        });

        // Sort and rank (higher yards allowed = worse defense = better matchup)
        ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
            defRankings[pos].sort((a, b) => b.value - a.value);
            defRankings[pos].forEach((item, index) => {
                defenseRankings[`${item.team}_${pos}`] = {
                    rank: index + 1,
                    total: defRankings[pos].length,
                    value: item.value
                };
            });
        });

        console.log('Defense rankings loaded');
        displayPlayers();
    } catch (error) {
        console.error('Error fetching defense rankings:', error);
    }
}

// Fetch injury data from ESPN
async function fetchInjuryData() {
    try {
        // ESPN injury endpoint - fetch for all teams
        const teamAbbrevs = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN',
                            'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LAR', 'MIA',
                            'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS'];

        // Fetch injuries from ESPN scoreboard which includes injury data
        const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
        if (!response.ok) return;

        const data = await response.json();
        const events = data.events || [];

        events.forEach(event => {
            event.competitions?.[0]?.competitors?.forEach(competitor => {
                const roster = competitor.roster || [];
                roster.forEach(player => {
                    if (player.injury) {
                        injuryData[player.athlete.id] = {
                            status: player.injury.status || 'Q',
                            description: player.injury.longComment || player.injury.type || 'Injury'
                        };
                    }
                });
            });
        });

        console.log('Injury data loaded:', Object.keys(injuryData).length, 'injured players');
        displayPlayers();
    } catch (error) {
        console.error('Error fetching injury data:', error);
    }
}

// Fetch weather data (using game locations)
async function fetchWeatherData() {
    try {
        // Get current week's games
        const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
        if (!response.ok) return;

        const data = await response.json();
        const events = data.events || [];

        events.forEach(event => {
            const competition = event.competitions?.[0];
            if (competition?.weather) {
                const weather = competition.weather;
                const homeTeam = competition.competitors?.find(c => c.homeAway === 'home')?.team.abbreviation;
                const awayTeam = competition.competitors?.find(c => c.homeAway === 'away')?.team.abbreviation;
                const gameKey = `${awayTeam}@${homeTeam}`;

                weatherData[gameKey] = {
                    temp: weather.temperature,
                    conditions: weather.displayValue || 'Clear',
                    indoor: weather.conditionId === '1' || competition.venue?.indoor
                };
            }
        });

        console.log('Weather data loaded');
        displayPlayers();
    } catch (error) {
        console.error('Error fetching weather data:', error);
    }
}

// Calculate recent performance trends from CSV data
function calculateRecentPerformance() {
    players.forEach(player => {
        // Use the AvgPointsPerGame as a baseline
        // In a real implementation, you'd fetch last 3-5 game logs
        const avg = parseFloat(player.AvgPointsPerGame) || 0;

        // For now, we'll use the PPK as an indicator of recent form
        // This is a simplified version - ideally you'd fetch actual game logs
        recentPerformance[player.ID] = {
            last3Avg: avg,
            trend: player.ppk > 2.5 ? 'hot' : player.ppk < 1.5 ? 'cold' : 'neutral',
            targets: player.Position === 'WR' || player.Position === 'TE' ? Math.round(avg / 1.5) : null,
            touches: player.Position === 'RB' ? Math.round(avg / 0.8) : null
        };
    });

    console.log('Recent performance calculated');
}

// Fetch odds from The Odds API
async function fetchGameOdds() {
    try {
        const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads,totals&oddsFormat=american`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        parseOddsData(data);
        console.log('Successfully fetched odds data');
        displayPlayers(); // Refresh display with odds data
    } catch (error) {
        console.error('Error fetching odds:', error);
        if (error.message.includes('CORS')) {
            alert('Unable to fetch odds due to CORS restrictions. The Odds API may not support browser requests.');
        }
    }
}

// Parse odds data and match to games
function parseOddsData(oddsData) {
    gameOdds = {};

    oddsData.forEach(game => {
        const homeTeam = game.home_team;
        const awayTeam = game.away_team;

        // Get the first bookmaker's odds (typically DraftKings)
        const bookmaker = game.bookmakers && game.bookmakers[0];
        if (!bookmaker) return;

        let spread = null;
        let total = null;

        // Extract spread
        const spreadMarket = bookmaker.markets.find(m => m.key === 'spreads');
        if (spreadMarket && spreadMarket.outcomes) {
            const homeSpread = spreadMarket.outcomes.find(o => o.name === homeTeam);
            spread = homeSpread ? homeSpread.point : null;
        }

        // Extract total
        const totalsMarket = bookmaker.markets.find(m => m.key === 'totals');
        if (totalsMarket && totalsMarket.outcomes) {
            const overOutcome = totalsMarket.outcomes.find(o => o.name === 'Over');
            total = overOutcome ? overOutcome.point : null;
        }

        // Calculate implied team totals
        let homeTotal = null;
        let awayTotal = null;
        if (total && spread !== null) {
            homeTotal = (total + spread) / 2;
            awayTotal = (total - spread) / 2;
        }

        // Store odds using team abbreviations as keys
        const homeAbbrev = getTeamAbbreviation(homeTeam);
        const awayAbbrev = getTeamAbbreviation(awayTeam);
        const gameKey = `${awayAbbrev}@${homeAbbrev}`;

        gameOdds[gameKey] = {
            spread: spread,
            total: total,
            homeTotal: homeTotal ? homeTotal.toFixed(1) : null,
            awayTotal: awayTotal ? awayTotal.toFixed(1) : null,
            homeTeam: homeAbbrev,
            awayTeam: awayAbbrev
        };
    });

    console.log('Game odds keys:', Object.keys(gameOdds));
}

// Team name to abbreviation mapping
function getTeamAbbreviation(fullName) {
    const teamMap = {
        'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL',
        'Buffalo Bills': 'BUF', 'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI',
        'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE', 'Dallas Cowboys': 'DAL',
        'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
        'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX',
        'Kansas City Chiefs': 'KC', 'Las Vegas Raiders': 'LV', 'Los Angeles Chargers': 'LAC',
        'Los Angeles Rams': 'LAR', 'Miami Dolphins': 'MIA', 'Minnesota Vikings': 'MIN',
        'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
        'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT',
        'San Francisco 49ers': 'SF', 'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB',
        'Tennessee Titans': 'TEN', 'Washington Commanders': 'WAS'
    };

    return teamMap[fullName] || fullName;
}
