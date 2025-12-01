// Global variables
let players = [];
let currentLineup = {};
let currentPosition = 'QB';
let contestType = 'classic';
let salaryCap = 50000;
let currentSort = 'dfs-high';
let gameOdds = {};
const ODDS_API_KEY = '98134e3b5435f11219c586ef3dcc3f87';

// Enhanced player data
let injuryData = {};
let defenseRankings = {};
let weatherData = {};
let recentPerformance = {};

// Search and filter state
let searchQuery = '';
let selectedGames = new Set();
let availableGames = [];
let markedOutPlayers = new Set();

// Contest management
let availableContests = [];
let selectedContest = null;

// LocalStorage functions for marked out players
function loadMarkedOutPlayers() {
    const saved = localStorage.getItem('markedOutPlayers');
    if (saved) {
        try {
            markedOutPlayers = new Set(JSON.parse(saved));
        } catch (e) {
            markedOutPlayers = new Set();
        }
    }
}

function saveMarkedOutPlayers() {
    localStorage.setItem('markedOutPlayers', JSON.stringify([...markedOutPlayers]));
}

// Load available contests from contests.json
async function loadAvailableContests() {
    try {
        const response = await fetch('contests.json');
        if (!response.ok) {
            console.warn('⚠️ Could not load contests.json - using manual upload only');
            populateContestDropdown([]);
            return;
        }

        const data = await response.json();
        const contests = data.contests || [];

        // Validate and filter contests
        const validatedContests = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time to start of day

        contests.forEach(contest => {
            const validation = validateContestFilename(contest.file);

            if (!validation.valid) {
                console.warn(`⚠️ Misnamed file: ${contest.file} - ${validation.error}`);
                return; // Skip invalid contests
            }

            // Parse date in local timezone (not UTC) to avoid timezone issues
            const [year, month, day] = contest.date.split('-');
            const contestDate = new Date(year, month - 1, day); // month is 0-indexed

            // Show contests until the day AFTER they occur
            // Example: Nov 30 contest shows on Nov 30 and Dec 1, hides on Dec 2
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            if (contestDate >= yesterday) {
                validatedContests.push(contest);
            }
        });

        availableContests = validatedContests;
        populateContestDropdown(validatedContests);
    } catch (error) {
        console.error('Error loading contests:', error);
        populateContestDropdown([]);
    }
}

// Validate contest filename format: YYYY-MM-DD-ContestType-Description.csv
function validateContestFilename(filename) {
    if (!filename || !filename.endsWith('.csv')) {
        return { valid: false, error: 'File must have .csv extension' };
    }

    const nameWithoutExt = filename.replace('.csv', '');
    const parts = nameWithoutExt.split('-');

    if (parts.length < 3) {
        return { valid: false, error: 'Format should be: YYYY-MM-DD-ContestType-Description.csv' };
    }

    // Validate date (first 3 parts: YYYY-MM-DD)
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];

    if (!/^\d{4}$/.test(year)) {
        return { valid: false, error: `Invalid year: ${year} (should be 4 digits)` };
    }
    if (!/^\d{2}$/.test(month) || parseInt(month) < 1 || parseInt(month) > 12) {
        return { valid: false, error: `Invalid month: ${month} (should be 01-12)` };
    }
    if (!/^\d{2}$/.test(day) || parseInt(day) < 1 || parseInt(day) > 31) {
        return { valid: false, error: `Invalid day: ${day} (should be 01-31)` };
    }

    // Validate contest type (4th part)
    const contestType = parts[3];
    if (!contestType || !['classic', 'showdown'].includes(contestType.toLowerCase())) {
        return { valid: false, error: `Invalid contest type: ${contestType} (should be "Classic" or "Showdown")` };
    }

    // Description is optional (5th+ parts)
    if (parts.length < 4) {
        return { valid: false, error: 'Missing description in filename' };
    }

    return { valid: true };
}

// Populate contest dropdown with available contests
function populateContestDropdown(contests) {
    const select = document.getElementById('contestSelect');
    select.innerHTML = '';

    if (contests.length === 0) {
        // No contests available, go straight to manual upload
        const option = document.createElement('option');
        option.value = 'upload';
        option.textContent = 'Upload Custom CSV';
        select.appendChild(option);
        handleContestSelection('upload');
        return;
    }

    // Add placeholder option
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = 'Select a contest...';
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    select.appendChild(placeholderOption);

    // Add contest options
    contests.forEach(contest => {
        const option = document.createElement('option');
        option.value = contest.file;
        option.textContent = contest.display;
        option.dataset.type = contest.type;
        select.appendChild(option);
    });

    // Add separator
    const separator = document.createElement('option');
    separator.disabled = true;
    separator.textContent = '──────────────';
    select.appendChild(separator);

    // Add manual upload option at the bottom
    const uploadOption = document.createElement('option');
    uploadOption.value = 'upload';
    uploadOption.textContent = 'Upload Custom CSV';
    select.appendChild(uploadOption);
}

// Handle contest selection
async function handleContestSelection(value) {
    if (value === 'upload') {
        // Show upload section and contest type selector
        document.getElementById('uploadSection').style.display = 'block';
        document.getElementById('contestTypeSelector').style.display = 'flex';
        selectedContest = null;

        // Clear current players if any
        players = [];
        displayPlayers();
        document.getElementById('fileName').textContent = '';
        return;
    }

    if (!value) {
        // No selection
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('contestTypeSelector').style.display = 'none';
        return;
    }

    // Load selected contest
    selectedContest = availableContests.find(c => c.file === value);
    if (!selectedContest) {
        console.error('Contest not found:', value);
        return;
    }

    // Hide upload section and contest type selector
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('contestTypeSelector').style.display = 'none';

    // Set contest type from selection
    contestType = selectedContest.type;
    salaryCap = contestConfigs[contestType].salaryCap;

    // Update UI
    updatePositionTabs();
    initializeLineupSlots();

    // Load CSV from contests folder
    try {
        const response = await fetch(`contests/${selectedContest.file}`);
        if (!response.ok) {
            throw new Error(`Failed to load contest file: ${selectedContest.file}`);
        }

        const csvText = await response.text();
        parseCSV(csvText);
    } catch (error) {
        console.error('Error loading contest file:', error);
        alert(`Failed to load contest: ${selectedContest.display}\n\nMake sure the file exists in the /contests/ folder.`);
    }
}

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
    loadMarkedOutPlayers();
    loadAvailableContests();
    initializeEventListeners();
    updatePositionTabs();
    initializeLineupSlots();
});

function initializeEventListeners() {
    // File upload
    document.getElementById('playerUpload').addEventListener('change', handleFileUpload);

    // Contest selector
    document.getElementById('contestSelect').addEventListener('change', function(e) {
        handleContestSelection(e.target.value);
    });

    // Contest type selector (only for custom uploads)
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

    // Player search
    document.getElementById('playerSearch').addEventListener('input', function(e) {
        searchQuery = e.target.value.trim().toLowerCase();

        // Show/hide clear button
        const clearBtn = document.getElementById('searchClear');
        if (searchQuery) {
            clearBtn.style.display = 'inline-block';
        } else {
            clearBtn.style.display = 'none';
        }

        displayPlayers();
    });

    document.getElementById('searchClear').addEventListener('click', function() {
        document.getElementById('playerSearch').value = '';
        searchQuery = '';
        this.style.display = 'none';
        displayPlayers();
    });

    // Auto-fill, analyze, and clear buttons
    document.getElementById('autoFillBtn').addEventListener('click', autoFillLineup);
    document.getElementById('analyzeBtn').addEventListener('click', analyzeLineup);
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
    extractUniqueGames();
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

    let filteredPlayers = players.filter(p => {
        // SEARCH FILTER - applies first, overrides position tabs when active
        if (searchQuery) {
            const nameMatch = p.Name.toLowerCase().includes(searchQuery);
            const teamMatch = (p.TeamAbbrev || '').toLowerCase().includes(searchQuery);
            if (!nameMatch && !teamMatch) return false;

            // If searching, skip position filter (search all positions)
            // But still apply game filter
            if (selectedGames.size > 0) {
                const gameInfo = p['Game Info'];
                if (!gameInfo) return false;
                const game = gameInfo.split(' ')[0];
                return selectedGames.has(game);
            }
            return true; // Search match, no game filter
        }

        // POSITION FILTER - only applies when NOT searching
        let positionMatch;
        if (currentPosition === 'ALL') {
            positionMatch = true;
        } else if (currentPosition === 'FLEX') {
            positionMatch = config.flexEligible.includes(p.Position);
        } else {
            positionMatch = p.Position === currentPosition;
        }

        // GAME FILTER - applies with or without position filter
        if (selectedGames.size > 0) {
            const gameInfo = p['Game Info'];
            if (!gameInfo) return false;
            const game = gameInfo.split(' ')[0];
            return positionMatch && selectedGames.has(game);
        }

        return positionMatch;
    });

    // Separate marked-out players and move them to bottom
    const activePlayers = filteredPlayers.filter(p => !markedOutPlayers.has(p.ID));
    const outPlayers = filteredPlayers.filter(p => markedOutPlayers.has(p.ID));
    filteredPlayers = [...activePlayers, ...outPlayers];

    // Sort based on current sort selection
    switch(currentSort) {
        case 'dfs-high':
            filteredPlayers.sort((a, b) => (b.dfsScore || 0) - (a.dfsScore || 0));
            break;
        case 'mppk-high':
            filteredPlayers.sort((a, b) => (b.mppk || b.ppk || 0) - (a.mppk || a.ppk || 0));
            break;
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
            filteredPlayers.sort((a, b) => (b.dfsScore || 0) - (a.dfsScore || 0));
    }

    return filteredPlayers;
}

function displayPlayers() {
    const playerList = document.getElementById('playerList');

    // Calculate advanced metrics BEFORE filtering and sorting
    calculateAdvancedMetrics();

    const filteredPlayers = getFilteredAndSortedPlayers();

    if (filteredPlayers.length === 0) {
        playerList.innerHTML = '<p class="placeholder-text">No players available for this position</p>';
        return;
    }

    // Calculate remaining salary cap
    const totalSalaryUsed = Object.values(currentLineup).reduce((sum, player) => sum + player.salary, 0);
    const remainingSalary = salaryCap - totalSalaryUsed;

    playerList.innerHTML = filteredPlayers.map((player, index) => {
        const salary = parseInt(player.Salary);
        const avgPts = player.AvgPointsPerGame ? parseFloat(player.AvgPointsPerGame).toFixed(1) : '-';
        const gameInfo = player['Game Info'] ? player['Game Info'].split(' ')[0] : '';

        // Value indicators - use MPPK if available, otherwise PPK
        const basePpk = player.ppk > 0 ? player.ppk.toFixed(2) : 'N/A';
        const mppkValue = player.mppk > 0 ? player.mppk.toFixed(2) : basePpk;

        // Build tooltip explaining the value
        let valueTooltip = 'Matchup-Adjusted PPK: Base value adjusted for defensive matchup strength. ';
        if (player.mppk && player.mppk !== player.ppk) {
            const multiplier = ((player.mppk / player.ppk - 1) * 100).toFixed(0);
            const multDesc = player.defenseMultiplier > 1.0 ? 'boost vs weak defense' :
                           player.defenseMultiplier < 1.0 ? 'penalty vs strong defense' : 'neutral matchup';
            valueTooltip += `${multiplier > 0 ? '+' : ''}${multiplier}% ${multDesc} (×${player.defenseMultiplier.toFixed(2)})`;
        } else {
            valueTooltip += 'No matchup data available yet.';
        }

        const ppkDisplay = player.mppk && player.mppk !== player.ppk ?
            `<span title="${valueTooltip}">${mppkValue}</span> <small style="color:#999;text-decoration:line-through;" title="Base PPK: ${basePpk}">${basePpk}</small>` :
            `<span title="${valueTooltip}">${mppkValue}</span>`;
        const starIcon = player.isTopValue ? '<span class="value-star" title="Top 10% value for position">⭐</span>' : '';
        const valueClass = player.isTopValue ? 'value-excellent' : '';

        // Check if player salary exceeds remaining budget
        const isOverBudget = salary > remainingSalary;
        const overBudgetClass = isOverBudget ? 'over-budget' : '';
        const overBudgetBadge = isOverBudget ? '<span class="over-budget-badge" title="Exceeds remaining salary cap">💰</span>' : '';

        // Overall DFS Score badge
        let dfsScoreBadge = '';
        if (player.dfsScore !== undefined) {
            const score = Math.round(player.dfsScore);
            let scoreClass = 'env-bad';
            if (score >= 70) {
                scoreClass = 'env-excellent';
            } else if (score >= 55) {
                scoreClass = 'env-good';
            } else if (score >= 40) {
                scoreClass = 'env-neutral';
            }

            // Build detailed tooltip explaining all components
            let dfsTooltip = `Overall DFS Score: ${score}/100\n\nComposite Score Breakdown:\n`;

            // Show all 6 components
            dfsTooltip += `• Value (MPPK ${player.mppk ? player.mppk.toFixed(2) : 'N/A'}): 30% weight\n`;
            dfsTooltip += `• Performance (${parseFloat(player.AvgPointsPerGame || 0).toFixed(1)} avg): 25% weight\n`;
            dfsTooltip += `• Game Conditions (${player.impliedTeamTotal ? player.impliedTeamTotal.toFixed(1) + ' team total' : 'N/A'}): 20% weight\n`;
            dfsTooltip += `• Game Script (${player.playerSpread !== null ? (player.playerSpread > 0 ? '+' : '') + player.playerSpread.toFixed(1) + ' spread' : 'N/A'}): 15% weight\n`;

            if (recentPerformance[player.ID]) {
                const trend = recentPerformance[player.ID].trend;
                dfsTooltip += `• Recent Trend (${trend}): 5% weight\n`;
            }

            const normalizedPlayerName = normalizePlayerName(player.Name);
            if (injuryData[normalizedPlayerName]) {
                const injury = injuryData[normalizedPlayerName];
                dfsTooltip += `• Injury Status (${injury.status}): 5% penalty\n`;
            }

            dfsTooltip += `\nHigher score = better DFS play`;

            dfsScoreBadge = `<span class="env-score ${scoreClass}" title="${dfsTooltip}">${score}</span>`;
        }

        // Injury/Info status badge
        let injuryBadge = '';
        const normalizedPlayerName = normalizePlayerName(player.Name);
        if (injuryData[normalizedPlayerName]) {
            const injury = injuryData[normalizedPlayerName];

            // All Q status shows as info icon, D and OUT show as badges
            if (injury.status === 'Q') {
                injuryBadge = `<span class="info-badge" title="${injury.description || 'Questionable'}">ℹ️</span>`;
            } else if (injury.status === 'D') {
                injuryBadge = `<span class="injury-badge injury-doubtful" title="${injury.description || 'Doubtful'}">D</span>`;
            } else if (injury.status === 'OUT' || injury.status === 'IR') {
                injuryBadge = `<span class="injury-badge injury-out" title="${injury.description || 'Out'}">OUT</span>`;
            }
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

        // Check if player is marked out
        const isMarkedOut = markedOutPlayers.has(player.ID);
        const markedOutClass = isMarkedOut ? 'marked-out' : '';
        const markedOutButton = `
            <button class="mark-out-btn ${isMarkedOut ? 'active' : ''}"
                    onclick="togglePlayerOut('${player.ID}', event)"
                    title="${isMarkedOut ? 'Unmark as Out' : 'Mark as Out'}">
                ${isMarkedOut ? '✓ OUT' : 'Mark Out'}
            </button>
        `;

        return `
            <div class="player-item ${valueClass} ${overBudgetClass} ${markedOutClass}"
                 ${isMarkedOut ? '' : `onclick="addPlayerToLineup(${index})"`}>
                ${dfsScoreBadge}
                ${markedOutButton}
                <div class="player-name">
                    ${player.Name} ${starIcon} ${trendIcon} ${injuryBadge} ${weatherAlert}
                </div>
                <div class="player-details">
                    <span>${player.TeamAbbrev || ''} - ${player.Position}</span>
                    <span class="player-avg">${avgPts} avg ${volumeInfo}</span>
                </div>
                <div class="player-details">
                    <span class="player-value">${ppkDisplay} MPPK ${defenseMatchup}</span>
                    <span class="player-salary">${overBudgetBadge} $${salary.toLocaleString()}</span>
                </div>
                <div class="player-details">
                    <span class="player-game">${gameInfo}${oddsInfo}</span>
                </div>
            </div>
        `;
    }).join('');
}

// Extract unique games from player data
function extractUniqueGames() {
    const gameSet = new Set();

    players.forEach(player => {
        const gameInfo = player['Game Info'];
        if (gameInfo) {
            // Extract just the matchup (e.g., "JAX@TEN")
            const game = gameInfo.split(' ')[0];
            if (game) gameSet.add(game);
        }
    });

    availableGames = Array.from(gameSet).sort();
    renderGameFilters();
}

// Render game filter chips
function renderGameFilters() {
    const container = document.getElementById('gameFilters');

    if (availableGames.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = `
        <div class="game-chips">
            ${availableGames.map(game => `
                <button class="game-chip ${selectedGames.has(game) ? 'active' : ''}"
                        onclick="toggleGameFilter('${game}')">
                    ${game}
                </button>
            `).join('')}
            ${selectedGames.size > 0 ? '<button class="game-chip clear-all" onclick="clearGameFilters()">Clear All</button>' : ''}
        </div>
    `;
}

// Toggle game filter
function toggleGameFilter(game) {
    if (selectedGames.has(game)) {
        selectedGames.delete(game);
    } else {
        selectedGames.add(game);
    }
    renderGameFilters();
    displayPlayers();
}

// Clear all game filters
function clearGameFilters() {
    selectedGames.clear();
    renderGameFilters();
    displayPlayers();
}

// Toggle player out status
function togglePlayerOut(playerId, event) {
    event.stopPropagation(); // Prevent clicking player card

    if (markedOutPlayers.has(playerId)) {
        markedOutPlayers.delete(playerId);
    } else {
        markedOutPlayers.add(playerId);
        // Remove from lineup if currently in it
        Object.keys(currentLineup).forEach(slotIndex => {
            if (currentLineup[slotIndex]?.id === playerId) {
                removePlayerFromLineup(slotIndex);
            }
        });
    }

    saveMarkedOutPlayers();
    displayPlayers();
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
                    <strong>${player.position} - ${player.name}</strong> ${captainBadge}<br>
                    <small>${player.team} - $${player.salary.toLocaleString()}</small>
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

    // Enable/disable analyze button based on lineup completion
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (filledSlots === totalSlots) {
        analyzeBtn.disabled = false;
    } else {
        analyzeBtn.disabled = true;
        // Hide analysis results if lineup is no longer full
        document.getElementById('analysisResults').style.display = 'none';
    }
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

// Auto-fill lineup with CASH GAME optimized strategy - ENHANCED VERSION
// Focuses on floor, consistency, and volume rather than ceiling
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

    // ============================================================================
    // STEP 1: Calculate Floor Scores for all players
    // ============================================================================

    const scoredPlayers = players
        .filter(p => !markedOutPlayers.has(p.ID)) // Exclude marked-out players
        .map(player => {
            const floorScore = calculateFloorScore(player);
            const valueScore = floorScore / (parseInt(player.Salary) / 1000);

            return {
                ...player,
                floorScore: floorScore,
                valueScore: valueScore
            };
        });

    // ============================================================================
    // STEP 2: Filter players by position-specific criteria
    // ============================================================================

    const filteredByPosition = {
        QB: filterQBs(scoredPlayers),
        RB: filterRBs(scoredPlayers),
        WR: filterWRs(scoredPlayers),
        TE: filterTEs(scoredPlayers),
        DST: filterDSTs(scoredPlayers)
    };

    // ============================================================================
    // STEP 3: Build lineup in optimal order (RB → QB → WR → TE → FLEX → DST)
    // ============================================================================

    const buildOrder = [
        { position: 'RB', count: 2 },
        { position: 'QB', count: 1 },
        { position: 'WR', count: 3 },
        { position: 'TE', count: 1 },
        { position: 'FLEX', count: 1 },
        { position: 'DST', count: 1 }
    ];

    // Map position slots to indices
    const positionSlots = {};
    positions.forEach((pos, idx) => {
        if (!positionSlots[pos]) positionSlots[pos] = [];
        positionSlots[pos].push(idx);
    });

    let filled = 0;
    let selectedQBTeam = null; // Track QB team for stacking logic
    const gameConcentration = {}; // Track players per game (e.g., "KC@BUF": 2)
    const passCatchersByTeam = {}; // Track WR/TE by team for correlation checking

    buildOrder.forEach(({ position, count }) => {
        const slotsForPosition = positionSlots[position] || [];
        let positionFilled = 0;

        for (const slotIdx of slotsForPosition) {
            // Skip if slot already filled
            if (currentLineup[slotIdx]) continue;
            if (positionFilled >= count) break;

            const remainingSalary = salaryCap - currentSalary;
            const remainingSlots = positions.length - Object.keys(currentLineup).length;
            const minSalaryReserve = (remainingSlots - 1) * 3000;
            const maxSalaryForSlot = remainingSalary - minSalaryReserve;

            let bestPlayer = null;

            if (position === 'FLEX') {
                // FLEX: Best floor play among RB/WR/TE (with stacking bonus)
                bestPlayer = findBestFlexPlayer(filteredByPosition, usedPlayerIds, maxSalaryForSlot, selectedQBTeam, gameConcentration, passCatchersByTeam);
            } else {
                // Regular position: Find best floor score
                const pool = filteredByPosition[position] || [];

                for (const player of pool) {
                    if (usedPlayerIds.has(player.ID)) continue;
                    if (parseInt(player.Salary) > maxSalaryForSlot) continue;

                    // Game total filtering: Avoid low-scoring games (<42), prefer high-scoring (>=48)
                    const gameTotal = parseFloat(player.GameTotal) || 0;
                    if (position !== 'DST' && gameTotal > 0 && gameTotal < 42) {
                        continue; // Skip players in low-total games
                    }

                    // Game concentration: Avoid 4+ players from same game
                    const game = player.Game || '';
                    if (game && (gameConcentration[game] || 0) >= 3) {
                        continue; // Already have 3 players from this game
                    }

                    // Correlation checking: Avoid multiple pass-catchers from same team without QB
                    if (['WR', 'TE'].includes(player.Position)) {
                        const playerTeam = player.TeamAbbrev;
                        const teamPassCatcherCount = passCatchersByTeam[playerTeam] || 0;

                        // If we already have a pass-catcher from this team and don't have the QB, skip
                        if (teamPassCatcherCount > 0 && playerTeam !== selectedQBTeam) {
                            continue; // Negative correlation - avoid
                        }
                    }

                    // Calculate effective floor score with QB stacking bonus
                    let effectiveFloorScore = player.floorScore;

                    // QB Stacking: Boost WR/TE on same team as selected QB
                    if (selectedQBTeam && ['WR', 'TE'].includes(player.Position) && player.TeamAbbrev === selectedQBTeam) {
                        effectiveFloorScore *= 1.15; // 15% boost for QB stack
                    }

                    // Game total boost: Reward high-scoring games (>=48)
                    if (gameTotal >= 48) {
                        effectiveFloorScore *= 1.08; // 8% boost for high-total games
                    }

                    // Weather penalty: Penalize QB/WR/TE in bad weather, boost dome games
                    if (['QB', 'WR', 'TE'].includes(player.Position)) {
                        const game = (player['Game Info'] || '').split(' ')[0];
                        if (game && weatherData[game]) {
                            const conditions = (weatherData[game].conditions || '').toLowerCase();
                            if (conditions.includes('rain') || conditions.includes('snow')) {
                                effectiveFloorScore *= 0.85; // 15% penalty for bad weather
                            } else if (weatherData[game].indoor) {
                                effectiveFloorScore *= 1.03; // 3% boost for dome/indoor
                            }
                        }
                    }

                    bestPlayer = { ...player, effectiveFloorScore };
                    break; // Take first (highest floor score)
                }
            }

            if (bestPlayer) {
                const playerSalary = parseInt(bestPlayer.Salary);

                currentLineup[slotIdx] = {
                    name: bestPlayer.Name,
                    id: bestPlayer.ID,
                    position: bestPlayer.Position,
                    salary: playerSalary,
                    team: bestPlayer.TeamAbbrev || '',
                    avgPoints: bestPlayer.AvgPointsPerGame || '0',
                    isCaptain: false
                };

                usedPlayerIds.add(bestPlayer.ID);
                currentSalary += playerSalary;
                positionFilled++;
                filled++;

                // Track QB team for stacking
                if (position === 'QB') {
                    selectedQBTeam = bestPlayer.TeamAbbrev;
                }

                // Track pass-catchers by team for correlation checking
                if (['WR', 'TE'].includes(bestPlayer.Position)) {
                    const team = bestPlayer.TeamAbbrev;
                    passCatchersByTeam[team] = (passCatchersByTeam[team] || 0) + 1;
                }

                // Track game concentration
                const game = bestPlayer.Game || '';
                if (game) {
                    gameConcentration[game] = (gameConcentration[game] || 0) + 1;
                }

                updateLineupDisplay(slotIdx);
            }
        }
    });

    // ============================================================================
    // STEP 4: Salary optimization - Use remaining cap to upgrade
    // ============================================================================

    const remainingSalary = salaryCap - currentSalary;
    if (remainingSalary >= 500 && filled > 0) {
        optimizeSalaryUsage(filteredByPosition, usedPlayerIds, remainingSalary);
    }

    updateSalaryDisplay();

    // Alert results
    const totalSlots = positions.length;
    const filledSlots = Object.keys(currentLineup).length;

    if (filled > 0) {
        if (filledSlots < totalSlots) {
            alert(`Auto-fill added ${filled} player${filled !== 1 ? 's' : ''}. ${totalSlots - filledSlots} position${totalSlots - filledSlots !== 1 ? 's' : ''} still empty.`);
        } else {
            alert(`✅ Lineup complete! Using $${currentSalary.toLocaleString()} of $${salaryCap.toLocaleString()} (${((currentSalary/salaryCap)*100).toFixed(1)}%)`);
        }
    } else if (filledSlots < totalSlots) {
        alert(`Could not auto-fill any positions. Try adjusting salary constraints or check available players.`);
    }
}

// ============================================================================
// FLOOR SCORE CALCULATION
// ============================================================================

function calculateFloorScore(player) {
    // Floor Score = (Projected Points * 0.40) + (Volume * 0.30) + (Consistency * 0.20) + (Bonus Proximity * 0.10)

    const projectedPoints = parseFloat(player.AvgPointsPerGame) || 0;
    const volumeScore = calculateVolumeScore(player);
    const consistencyScore = 0.7; // Default - would need game log data for real variance calc
    const bonusProximity = calculateBonusProximity(player);

    const floorScore = (
        (projectedPoints * 0.40) +
        (volumeScore * 0.30) +
        (consistencyScore * 0.20) +
        (bonusProximity * 0.10)
    );

    return floorScore;
}

function calculateVolumeScore(player) {
    // Normalize volume metrics by position
    // Higher volume = more consistent floor

    const pos = player.Position;
    const avgPoints = parseFloat(player.AvgPointsPerGame) || 0;

    // Estimate volume from average points (proxy until we have targets/carries data)
    // QB: 35+ attempts = high volume
    // RB: 18+ touches = high volume
    // WR/TE: 7+ targets = high volume

    if (pos === 'QB') {
        // QBs averaging 18+ points likely throwing 35+ times
        return avgPoints >= 18 ? 8 : avgPoints >= 15 ? 6 : 4;
    } else if (pos === 'RB') {
        // RBs averaging 12+ points likely getting 18+ touches
        return avgPoints >= 12 ? 8 : avgPoints >= 9 ? 6 : 4;
    } else if (pos === 'WR') {
        // WRs averaging 12+ points likely getting 7+ targets
        return avgPoints >= 12 ? 8 : avgPoints >= 9 ? 6 : 4;
    } else if (pos === 'TE') {
        // TEs averaging 10+ points likely getting 6+ targets
        return avgPoints >= 10 ? 8 : avgPoints >= 7 ? 6 : 4;
    }

    return 5; // Default for DST
}

function calculateBonusProximity(player) {
    // Players close to 100/300 yard bonuses get boost
    const avgPoints = parseFloat(player.AvgPointsPerGame) || 0;
    const pos = player.Position;

    if (pos === 'QB' && avgPoints >= 20) {
        // Likely approaching 300 yard bonus
        return 3;
    } else if (['RB', 'WR', 'TE'].includes(pos) && avgPoints >= 13) {
        // Likely approaching 100 yard bonus
        return 3;
    } else if (avgPoints >= 10) {
        return 1.5;
    }

    return 0;
}

// ============================================================================
// POSITION-SPECIFIC FILTERS
// ============================================================================

function filterQBs(players) {
    // QB Priority: Pass attempts >= 35, Rushing upside, Bonus proximity

    let qbs = players.filter(p => p.Position === 'QB');

    // Apply filters based on strategy
    qbs = qbs.filter(p => {
        const avgPoints = parseFloat(p.AvgPointsPerGame) || 0;
        const salary = parseInt(p.Salary);
        const impliedTotal = p.impliedTeamTotal || 0;

        // RED FLAGS - Auto exclude
        if (impliedTotal > 0 && impliedTotal <= 17) return false; // Low team total
        if (avgPoints < 12 && salary > 5000) return false; // Bad value

        return true;
    });

    // Sort by floor score descending
    qbs.sort((a, b) => b.floorScore - a.floorScore);

    return qbs;
}

function filterRBs(players) {
    // RB Priority: Workload (carries >= 18), Pass-catching (targets >= 3), Avoid committees

    let rbs = players.filter(p => p.Position === 'RB');

    rbs = rbs.filter(p => {
        const avgPoints = parseFloat(p.AvgPointsPerGame) || 0;
        const salary = parseInt(p.Salary);
        const impliedTotal = p.impliedTeamTotal || 0;

        // RED FLAGS
        if (impliedTotal > 0 && impliedTotal <= 17) return false;
        if (avgPoints < 6 && salary > 4500) return false; // Low floor, expensive

        // GREEN FLAGS - Boost score for bellcows
        if (avgPoints >= 12) {
            p.floorScore *= 1.1; // Likely bellcow with 18+ touches
        }

        return true;
    });

    // Sort by floor score descending
    rbs.sort((a, b) => b.floorScore - a.floorScore);

    return rbs;
}

function filterWRs(players) {
    // WR Priority: Target share >= 22%, Targets >= 7, Slot receivers for floor

    let wrs = players.filter(p => p.Position === 'WR');

    wrs = wrs.filter(p => {
        const avgPoints = parseFloat(p.AvgPointsPerGame) || 0;
        const salary = parseInt(p.Salary);

        // RED FLAGS
        if (avgPoints < 5 && salary > 4000) return false; // Deep threat with low volume

        // GREEN FLAGS - Boost for high-volume receivers
        if (avgPoints >= 12) {
            p.floorScore *= 1.05; // Likely 8+ targets
        }

        return true;
    });

    // Sort by floor score descending
    wrs.sort((a, b) => b.floorScore - a.floorScore);

    return wrs;
}

function filterTEs(players) {
    // TE Priority: Elite tier (top 3-4) OR punt ($3k-$4k). Avoid mid-tier trap.

    let tes = players.filter(p => p.Position === 'TE');

    tes = tes.filter(p => {
        const avgPoints = parseFloat(p.AvgPointsPerGame) || 0;
        const salary = parseInt(p.Salary);

        // AVOID mid-tier trap ($4,500-$5,500)
        if (salary >= 4500 && salary <= 5500 && avgPoints < 10) {
            return false; // Mid-tier without elite production
        }

        // Either elite (10+ avg) or cheap (<= $4000)
        return avgPoints >= 10 || salary <= 4000;
    });

    // Sort by floor score descending
    tes.sort((a, b) => b.floorScore - a.floorScore);

    return tes;
}

function filterDSTs(players) {
    // DST Priority: Cheap (<= $3,500), Vegas favorite, Low opponent total

    let dsts = players.filter(p => p.Position === 'DST');

    dsts = dsts.filter(p => {
        const salary = parseInt(p.Salary);

        // Prefer cheap DSTs
        if (salary > 3500) {
            p.floorScore *= 0.8; // Penalize expensive DSTs
        }

        return true;
    });

    // Sort by floor score descending
    dsts.sort((a, b) => b.floorScore - a.floorScore);

    return dsts;
}

// ============================================================================
// FLEX SELECTION
// ============================================================================

function findBestFlexPlayer(filteredByPosition, usedPlayerIds, maxSalary, selectedQBTeam, gameConcentration, passCatchersByTeam) {
    // FLEX: Best remaining floor play among RB/WR/TE
    // Priority order: RB (more consistent) > Slot WR > TE

    const flexPool = [
        ...(filteredByPosition.RB || []),
        ...(filteredByPosition.WR || []),
        ...(filteredByPosition.TE || [])
    ];

    // Filter available and affordable
    const available = flexPool.filter(p => {
        if (usedPlayerIds.has(p.ID)) return false;
        if (parseInt(p.Salary) > maxSalary) return false;

        // Game total filtering: Avoid low-scoring games (<42)
        const gameTotal = parseFloat(p.GameTotal) || 0;
        if (gameTotal > 0 && gameTotal < 42) return false;

        // Game concentration: Avoid 4+ players from same game
        const game = p.Game || '';
        if (game && (gameConcentration[game] || 0) >= 3) return false;

        // Correlation checking: Avoid multiple pass-catchers from same team without QB
        if (['WR', 'TE'].includes(p.Position)) {
            const playerTeam = p.TeamAbbrev;
            const teamPassCatcherCount = passCatchersByTeam[playerTeam] || 0;

            // If we already have a pass-catcher from this team and don't have the QB, skip
            if (teamPassCatcherCount > 0 && playerTeam !== selectedQBTeam) {
                return false; // Negative correlation - avoid
            }
        }

        return true;
    });

    // Calculate effective floor scores with bonuses
    available.forEach(p => {
        let effectiveScore = p.floorScore;

        // Slight preference for RBs in FLEX (more consistent floor)
        if (p.Position === 'RB') {
            effectiveScore *= 1.02;
        }

        // QB Stacking: Boost WR/TE on same team as selected QB
        if (selectedQBTeam && ['WR', 'TE'].includes(p.Position) && p.TeamAbbrev === selectedQBTeam) {
            effectiveScore *= 1.15; // 15% boost for QB stack
        }

        // Game total boost: Reward high-scoring games (>=48)
        const gameTotal = parseFloat(p.GameTotal) || 0;
        if (gameTotal >= 48) {
            effectiveScore *= 1.08; // 8% boost for high-total games
        }

        // Weather penalty: Penalize QB/WR/TE in bad weather, boost dome games
        if (['QB', 'WR', 'TE'].includes(p.Position)) {
            const game = (p['Game Info'] || '').split(' ')[0];
            if (game && weatherData[game]) {
                const conditions = (weatherData[game].conditions || '').toLowerCase();
                if (conditions.includes('rain') || conditions.includes('snow')) {
                    effectiveScore *= 0.85; // 15% penalty for bad weather
                } else if (weatherData[game].indoor) {
                    effectiveScore *= 1.03; // 3% boost for dome/indoor
                }
            }
        }

        p.effectiveFloorScore = effectiveScore;
    });

    // Sort by effective floor score
    available.sort((a, b) => b.effectiveFloorScore - a.effectiveFloorScore);

    return available[0] || null;
}

// ============================================================================
// SALARY OPTIMIZATION
// ============================================================================

function optimizeSalaryUsage(filteredByPosition, usedPlayerIds, remainingSalary) {
    // Use remaining salary to upgrade lowest floor-score player

    const lineupArray = Object.values(currentLineup);
    if (lineupArray.length === 0) return;

    // Find player with lowest floor score in current lineup
    let lowestFloorSlot = null;
    let lowestFloorScore = Infinity;

    Object.keys(currentLineup).forEach(slotIdx => {
        const player = currentLineup[slotIdx];
        const fullPlayer = players.find(p => p.ID === player.id);
        if (fullPlayer) {
            const floorScore = calculateFloorScore(fullPlayer);
            if (floorScore < lowestFloorScore) {
                lowestFloorScore = floorScore;
                lowestFloorSlot = slotIdx;
            }
        }
    });

    if (lowestFloorSlot === null) return;

    const currentPlayer = currentLineup[lowestFloorSlot];
    const position = currentPlayer.position;
    const currentSalary = currentPlayer.salary;
    const maxUpgradeSalary = currentSalary + remainingSalary;

    // Find upgrade in same position
    const pool = filteredByPosition[position] || [];
    const upgrade = pool.find(p =>
        !usedPlayerIds.has(p.ID) &&
        parseInt(p.Salary) > currentSalary &&
        parseInt(p.Salary) <= maxUpgradeSalary &&
        p.floorScore > lowestFloorScore
    );

    if (upgrade) {
        // Remove old player
        const oldSalary = currentPlayer.salary;
        usedPlayerIds.delete(currentPlayer.id);

        // Add upgrade
        currentLineup[lowestFloorSlot] = {
            name: upgrade.Name,
            id: upgrade.ID,
            position: upgrade.Position,
            salary: parseInt(upgrade.Salary),
            team: upgrade.TeamAbbrev || '',
            avgPoints: upgrade.AvgPointsPerGame || '0',
            isCaptain: false
        };

        usedPlayerIds.add(upgrade.ID);
        updateLineupDisplay(lowestFloorSlot);

        console.log(`Upgraded ${position}: ${currentPlayer.name} ($${oldSalary}) → ${upgrade.Name} ($${upgrade.Salary})`);
    }
}

// Analyze lineup for DFS best practices - ENHANCED VERSION
function analyzeLineup() {
    const lineupArray = Object.values(currentLineup);
    const redFlags = [];
    const greenFlags = [];

    // Get full player objects with all data
    const lineupPlayers = lineupArray.map(slot => {
        const fullPlayer = players.find(p => p.ID === slot.id);
        return { ...slot, ...fullPlayer };
    });

    // Calculate total salary
    const totalSalary = lineupArray.reduce((sum, player) => sum + player.salary, 0);
    const remainingSalary = salaryCap - totalSalary;

    // ============================================================================
    // SALARY CONSTRUCTION CHECKS
    // ============================================================================

    // RED FLAG: Poor Salary Cap Usage
    if (remainingSalary > 1000) {
        redFlags.push({
            category: 'Construction',
            weight: -1,
            title: 'Poor Salary Usage',
            description: `You have $${remainingSalary.toLocaleString()} remaining. Try to get closer to the $50k cap for maximum value.`
        });
    }

    // GREEN FLAG: Optimal Salary Usage
    if (remainingSalary < 500) {
        greenFlags.push({
            category: 'Construction',
            weight: 1,
            title: 'Excellent Salary Usage',
            description: `Only $${remainingSalary} left unused. You're maximizing your salary cap value!`
        });
    }

    // NEW: RED FLAG - Punt Play Overload
    const puntPlays = lineupPlayers.filter(p => p.position !== 'DST' && p.salary < 4000);
    if (puntPlays.length >= 3) {
        redFlags.push({
            category: 'Construction',
            weight: -1,
            title: 'Punt Play Overload',
            description: `You have ${puntPlays.length} cheap players (<$4000): ${puntPlays.map(p => p.name).join(', ')}. Too many punt plays limits ceiling.`
        });
    }

    // NEW: RED FLAG - Single RB Strategy
    const rbs = lineupPlayers.filter(p => p.position === 'RB');
    if (rbs.length === 1) {
        redFlags.push({
            category: 'Construction',
            weight: -0.5,
            title: 'Single RB Strategy',
            description: `Only 1 RB in lineup (${rbs[0].name}). RBs have highest floor and TD equity - single-RB builds are risky.`
        });
    }

    // NEW: RED FLAG - Missing Elite Player
    const elitePlayers = lineupPlayers.filter(p => p.salary >= 8500);
    if (elitePlayers.length === 0) {
        redFlags.push({
            category: 'Construction',
            weight: -0.5,
            title: 'No Elite Player',
            description: `No players priced ≥$8500. Consider anchoring lineup with at least one premium stud.`
        });
    }

    // NEW: GREEN FLAG - Balanced Stars & Scrubs
    const studs = lineupPlayers.filter(p => p.salary >= 8000);
    const value = lineupPlayers.filter(p => p.position !== 'DST' && p.salary <= 4500);
    if (studs.length >= 2 && value.length >= 2) {
        greenFlags.push({
            category: 'Construction',
            weight: 1,
            title: 'Balanced Stars & Scrubs',
            description: `Optimal salary distribution: ${studs.length} studs (≥$8000) and ${value.length} value plays (≤$4500).`
        });
    }

    // ============================================================================
    // CORRELATION & STACKING CHECKS
    // ============================================================================

    const qb = lineupPlayers.find(p => p.position === 'QB');
    const dst = lineupPlayers.find(p => p.position === 'DST');

    // NEW: CRITICAL RED FLAG - QB + DST from Same Team
    if (qb && dst && qb.team === dst.team) {
        redFlags.push({
            category: 'Correlation',
            weight: -2,
            title: 'QB + DST Same Team (CRITICAL ERROR)',
            description: `Your QB (${qb.name}) and DST (${dst.name}) are from ${qb.team}. This is negative correlation - if QB scores, DST likely fails. Fix immediately!`
        });
    }

    // QB Stacking Analysis
    if (qb) {
        const qbTeammates = lineupPlayers.filter(p =>
            p.team === qb.team && p.position !== 'QB' && ['WR', 'TE', 'RB'].includes(p.position)
        );

        if (qbTeammates.length === 0) {
            redFlags.push({
                category: 'Correlation',
                weight: -1,
                title: 'No QB Stack',
                description: `Your QB (${qb.name}) has no pass-catchers from ${qb.team}. QB-WR correlation is crucial in DFS.`
            });
        } else if (qbTeammates.length >= 2) {
            greenFlags.push({
                category: 'Correlation',
                weight: 1,
                title: 'Strong QB Stack',
                description: `QB ${qb.name} stacked with ${qbTeammates.length} teammates (${qbTeammates.map(p => p.name).join(', ')}). This is optimal!`
            });

            // Check for bring-back
            const qbGame = qb['Game Info'] ? qb['Game Info'].split(' ')[0] : '';
            if (qbGame) {
                const opponentTeam = qbGame.includes('@')
                    ? (qb.team === qbGame.split('@')[0] ? qbGame.split('@')[1] : qbGame.split('@')[0])
                    : (qb.team === qbGame.split('vs')[0] ? qbGame.split('vs')[1] : qbGame.split('vs')[0]);

                const bringBack = lineupPlayers.find(p => p.team === opponentTeam);

                if (bringBack) {
                    greenFlags.push({
                        category: 'Correlation',
                        weight: 1,
                        title: 'Game Stack with Bring-Back',
                        description: `You have ${bringBack.name} from ${opponentTeam} to correlate with your ${qb.team} stack. Perfect for shootouts!`
                    });
                } else {
                    redFlags.push({
                        category: 'Correlation',
                        weight: -0.5,
                        title: 'Missing Bring-Back',
                        description: `You have a QB + 2 teammate stack but no player from the opposing team. Add a bring-back for optimal game stack.`
                    });
                }
            }
        } else {
            greenFlags.push({
                category: 'Correlation',
                weight: 0.5,
                title: 'QB Stack Present',
                description: `QB ${qb.name} stacked with ${qbTeammates[0].name}. Consider adding another ${qb.team} pass-catcher for stronger correlation.`
            });
        }
    }

    // Same-Position Teammates Without QB
    const teamCounts = {};
    lineupPlayers.forEach(p => {
        if (!teamCounts[p.team]) {
            teamCounts[p.team] = { WR: [], RB: [], TE: [], hasQB: false };
        }
        if (p.position === 'QB') teamCounts[p.team].hasQB = true;
        if (['WR', 'RB', 'TE'].includes(p.position)) {
            teamCounts[p.team][p.position].push(p.name);
        }
    });

    Object.keys(teamCounts).forEach(team => {
        const teamData = teamCounts[team];
        ['WR', 'RB'].forEach(pos => {
            if (teamData[pos].length >= 2 && !teamData.hasQB) {
                redFlags.push({
                    category: 'Correlation',
                    weight: -1,
                    title: 'Negative Correlation',
                    description: `You have ${teamData[pos].length} ${pos}s from ${team} (${teamData[pos].join(', ')}) without their QB. They'll cannibalize each other's points.`
                });
            }
        });
    });

    // NEW: RED FLAG - Incomplete Passing Game Stack
    Object.keys(teamCounts).forEach(team => {
        const teamData = teamCounts[team];
        const passCatchers = teamData.WR.length + teamData.TE.length;
        if (passCatchers >= 2 && !teamData.hasQB) {
            redFlags.push({
                category: 'Correlation',
                weight: -0.5,
                title: 'Incomplete Passing Stack',
                description: `You have ${passCatchers} pass-catchers from ${team} without their QB. You're missing the correlation benefit.`
            });
        }
    });

    // ============================================================================
    // GAME ENVIRONMENT & VEGAS CHECKS
    // ============================================================================

    const games = new Set();
    const gameData = {};
    lineupPlayers.forEach(p => {
        const game = p['Game Info'] ? p['Game Info'].split(' ')[0] : '';
        if (game) {
            games.add(game);
            if (!gameData[game]) {
                gameData[game] = {
                    players: [],
                    total: gameOdds[game]?.total || null
                };
            }
            gameData[game].players.push(p);
        }
    });

    // Game Diversity
    if (games.size >= 3) {
        greenFlags.push({
            category: 'Game Environment',
            weight: 0.5,
            title: 'Good Game Diversity',
            description: `Your lineup spans ${games.size} different games. Good diversification!`
        });
    } else if (games.size <= 2) {
        redFlags.push({
            category: 'Game Environment',
            weight: -0.5,
            title: 'Limited Game Exposure',
            description: `Your lineup only covers ${games.size} game(s). Consider diversifying across more games.`
        });
    }

    // NEW: RED FLAG - Too Many Players from One Game
    Object.keys(gameData).forEach(game => {
        if (gameData[game].players.length >= 4) {
            redFlags.push({
                category: 'Game Environment',
                weight: -1,
                title: 'Over-Concentrated in One Game',
                description: `You have ${gameData[game].players.length} players from ${game}. If this game disappoints, your lineup is dead.`
            });
        }
    });

    // NEW: RED FLAG - Low Game Total Exposure
    const lowTotalPlayers = lineupPlayers.filter(p => {
        const game = p['Game Info'] ? p['Game Info'].split(' ')[0] : '';
        return game && gameOdds[game]?.total && gameOdds[game].total < 42;
    });
    if (lowTotalPlayers.length > 0) {
        redFlags.push({
            category: 'Game Environment',
            weight: -1,
            title: 'Low Game Total Exposure',
            description: `${lowTotalPlayers.length} player(s) in games with total <42: ${lowTotalPlayers.map(p => p.name).join(', ')}. Low totals = fewer scoring opportunities.`
        });
    }

    // NEW: GREEN FLAG - Optimal Game Total Concentration
    const highTotalPlayers = lineupPlayers.filter(p => {
        const game = p['Game Info'] ? p['Game Info'].split(' ')[0] : '';
        return game && gameOdds[game]?.total && gameOdds[game].total >= 48;
    });
    if (highTotalPlayers.length >= 4) {
        greenFlags.push({
            category: 'Game Environment',
            weight: 1,
            title: 'High-Total Game Concentration',
            description: `${highTotalPlayers.length} players in high-scoring games (total ≥48). Excellent ceiling potential!`
        });
    }

    // NEW: RED FLAG - No Shootout Game Exposure
    const allGameTotals = Object.keys(gameOdds).map(g => gameOdds[g].total).filter(t => t);
    const hasShootout = allGameTotals.some(t => t >= 50);
    if (hasShootout) {
        const shootoutPlayers = lineupPlayers.filter(p => {
            const game = p['Game Info'] ? p['Game Info'].split(' ')[0] : '';
            return game && gameOdds[game]?.total && gameOdds[game].total >= 50;
        });
        if (shootoutPlayers.length === 0) {
            redFlags.push({
                category: 'Game Environment',
                weight: -0.5,
                title: 'Missing Shootout Exposure',
                description: `There are games with total ≥50 on this slate, but you have no exposure. Shootouts provide best ceiling outcomes.`
            });
        }
    }

    // NEW: GREEN FLAG - Game Script Alignment (Passing Game)
    if (qb && qb.playerSpread > 6) {
        greenFlags.push({
            category: 'Game Environment',
            weight: 0.5,
            title: 'QB in Negative Game Script',
            description: `QB ${qb.name} is a ${qb.playerSpread.toFixed(1)} point underdog. Underdogs throw more = increased volume.`
        });
    }

    // NEW: GREEN FLAG - Game Script Alignment (RBs in Positive Script)
    const favoriteRBs = rbs.filter(rb => rb.playerSpread && rb.playerSpread < -3);
    if (favoriteRBs.length >= 2) {
        greenFlags.push({
            category: 'Game Environment',
            weight: 0.5,
            title: 'RBs in Positive Game Script',
            description: `${favoriteRBs.length} RBs are on favored teams. Favorites run more late in games = volume + TDs.`
        });
    }

    // NEW: RED FLAG - Too Many Low Team Totals
    const lowTeamTotalPlayers = lineupPlayers.filter(p => p.impliedTeamTotal && p.impliedTeamTotal < 20);
    if (lowTeamTotalPlayers.length >= 3) {
        redFlags.push({
            category: 'Game Environment',
            weight: -1,
            title: 'Low Team Total Exposure',
            description: `${lowTeamTotalPlayers.length} players from teams projected <20 points. Limited scoring upside.`
        });
    }

    // ============================================================================
    // WEATHER CHECKS
    // ============================================================================

    // NEW: RED FLAG - Bad Weather Exposure
    const badWeatherPlayers = lineupPlayers.filter(p => {
        const game = p['Game Info'] ? p['Game Info'].split(' ')[0] : '';
        if (!game || !weatherData[game]) return false;
        const conditions = (weatherData[game].conditions || '').toLowerCase();
        return ['QB', 'WR', 'TE'].includes(p.position) && (conditions.includes('rain') || conditions.includes('snow'));
    });
    if (badWeatherPlayers.length > 0) {
        redFlags.push({
            category: 'Weather',
            weight: -1,
            title: 'Bad Weather Exposure',
            description: `${badWeatherPlayers.length} skill player(s) in rain/snow: ${badWeatherPlayers.map(p => p.name).join(', ')}. Passing production drops 12-25% in bad weather.`
        });
    }

    // NEW: GREEN FLAG - Dome/Indoor Game Stack
    if (qb) {
        const qbGame = qb['Game Info'] ? qb['Game Info'].split(' ')[0] : '';
        if (qbGame && weatherData[qbGame]?.indoor) {
            const qbTeammates = lineupPlayers.filter(p =>
                p.team === qb.team && p.position !== 'QB' && ['WR', 'TE'].includes(p.position)
            );
            if (qbTeammates.length >= 2) {
                greenFlags.push({
                    category: 'Weather',
                    weight: 0.5,
                    title: 'Dome/Indoor Game Stack',
                    description: `Your QB stack (${qb.name} + teammates) is in a dome/indoor game. No weather concerns!`
                });
            }
        }
    }

    // ============================================================================
    // QUALITY & VALUE METRICS
    // ============================================================================

    // Expensive Defense
    if (dst && dst.salary > 3500) {
        redFlags.push({
            category: 'Construction',
            weight: -0.5,
            title: 'Expensive Defense',
            description: `Your defense costs $${dst.salary.toLocaleString()}. Defenses are volatile - consider downgrading to add value elsewhere.`
        });
    }

    // NEW: RED FLAG - Low DFS Score Lineup
    const validScores = lineupPlayers.filter(p => p.dfsScore !== undefined);
    if (validScores.length > 0) {
        const avgDFSScore = validScores.reduce((sum, p) => sum + p.dfsScore, 0) / validScores.length;
        if (avgDFSScore < 55) {
            redFlags.push({
                category: 'Quality',
                weight: -1,
                title: 'Low DFS Score Lineup',
                description: `Average DFS score is ${avgDFSScore.toFixed(1)}/100. This lineup has weak overall construction.`
            });
        }

        // NEW: GREEN FLAG - Elite DFS Score Concentration
        const eliteScores = lineupPlayers.filter(p => p.dfsScore >= 75);
        if (eliteScores.length >= 3) {
            greenFlags.push({
                category: 'Quality',
                weight: 1,
                title: 'Elite DFS Score Concentration',
                description: `${eliteScores.length} players with DFS score ≥75. Elite value+matchup combination!`
            });
        }
    }

    // NEW: GREEN FLAG - High-Value Leverage Play
    const leveragePlays = lineupPlayers.filter(p => p.mppk > 4.0 && p.salary > 5000);
    if (leveragePlays.length > 0) {
        greenFlags.push({
            category: 'Quality',
            weight: 0.5,
            title: 'High-Value Leverage Play',
            description: `${leveragePlays.length} mispriced stud(s): ${leveragePlays.map(p => `${p.name} (${p.mppk.toFixed(2)} MPPK)`).join(', ')}. Great value at medium-high price!`
        });
    }

    // Display results
    displayAnalysisResults(redFlags, greenFlags);
}

// Display analysis results - ENHANCED VERSION with categorization and weighted scoring
function displayAnalysisResults(redFlags, greenFlags) {
    const resultsDiv = document.getElementById('analysisResults');

    // Calculate weighted score
    const redScore = redFlags.reduce((sum, flag) => sum + (flag.weight || -1), 0);
    const greenScore = greenFlags.reduce((sum, flag) => sum + (flag.weight || 1), 0);
    const rawScore = 5 + greenScore + redScore; // Start at 5, add green, subtract red
    const score = Math.max(0, Math.min(10, rawScore));

    // Group flags by category
    const groupedRed = {};
    const groupedGreen = {};

    redFlags.forEach(flag => {
        const cat = flag.category || 'Other';
        if (!groupedRed[cat]) groupedRed[cat] = [];
        groupedRed[cat].push(flag);
    });

    greenFlags.forEach(flag => {
        const cat = flag.category || 'Other';
        if (!groupedGreen[cat]) groupedGreen[cat] = [];
        groupedGreen[cat].push(flag);
    });

    // Category icons
    const categoryIcons = {
        'Construction': '🏗️',
        'Correlation': '🔗',
        'Game Environment': '🎮',
        'Weather': '🌤️',
        'Quality': '⭐'
    };

    let html = `
        <div class="analysis-header">
            <h3>Lineup Analysis</h3>
            <div class="lineup-score">
                <span class="score-label">Quality Score:</span>
                <span class="score-value ${score >= 7 ? 'score-good' : score >= 4 ? 'score-ok' : 'score-bad'}">${score.toFixed(1)}/10</span>
            </div>
        </div>
        <p style="font-size: 12px; color: #888; margin-top: -10px;">Enhanced analyzer with 26 validation checks</p>
    `;

    // Display red flags by category
    if (redFlags.length > 0) {
        html += '<div class="analysis-section red-flags">';
        html += '<h4>🚨 Issues to Address</h4>';

        Object.keys(groupedRed).sort().forEach(category => {
            const icon = categoryIcons[category] || '📋';
            html += `<div class="flag-category"><strong>${icon} ${category}</strong></div>`;
            html += '<ul>';
            groupedRed[category].forEach(flag => {
                html += `<li><strong>${flag.title}:</strong> ${flag.description}</li>`;
            });
            html += '</ul>';
        });

        html += '</div>';
    }

    // Display green flags by category
    if (greenFlags.length > 0) {
        html += '<div class="analysis-section green-flags">';
        html += '<h4>✅ Strengths</h4>';

        Object.keys(groupedGreen).sort().forEach(category => {
            const icon = categoryIcons[category] || '📋';
            html += `<div class="flag-category"><strong>${icon} ${category}</strong></div>`;
            html += '<ul>';
            groupedGreen[category].forEach(flag => {
                html += `<li><strong>${flag.title}:</strong> ${flag.description}</li>`;
            });
            html += '</ul>';
        });

        html += '</div>';
    }

    if (redFlags.length === 0 && greenFlags.length === 0) {
        html += '<p class="analysis-neutral">Your lineup looks decent! No major issues detected.</p>';
    }

    resultsDiv.innerHTML = html;
    resultsDiv.style.display = 'block';
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
        // Try the dedicated injuries endpoint first
        const injuryResponse = await fetch('https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/injuries');

        if (injuryResponse.ok) {
            const injuryDataRaw = await injuryResponse.json();

            console.log('Raw injury API response keys:', Object.keys(injuryDataRaw));
            console.log('Injuries array length:', injuryDataRaw.injuries?.length || 0);
            if (injuryDataRaw.injuries && injuryDataRaw.injuries.length > 0) {
                console.log('First injury structure:', injuryDataRaw.injuries[0]);
            }

            // Clear existing injury data
            injuryData = {};

            // Parse the injuries array - each item is a team with nested injuries
            const teams = injuryDataRaw.injuries || [];

            teams.forEach(teamObj => {
                const teamInjuries = teamObj.injuries || [];

                teamInjuries.forEach(injury => {
                    const athlete = injury.athlete;
                    if (!athlete) return;

                    const playerName = athlete.displayName || athlete.fullName || '';
                    const normalizedName = normalizePlayerName(playerName);

                    // Map ESPN injury status to DFS-friendly status
                    let status = 'Q'; // Default to Questionable
                    const injuryStatus = injury.status?.toUpperCase() || '';

                    if (injuryStatus.includes('OUT') || injuryStatus === 'IR') {
                        status = 'OUT';
                    } else if (injuryStatus.includes('DOUBTFUL') || injuryStatus === 'D') {
                        status = 'D';
                    } else if (injuryStatus.includes('QUESTIONABLE') || injuryStatus === 'Q') {
                        status = 'Q';
                    }

                    // Ensure description is always a string
                    const desc = injury.longComment || injury.details?.detail || injury.type || 'Injury';
                    const descStr = typeof desc === 'string' ? desc : String(desc || 'Injury');

                    injuryData[normalizedName] = {
                        status: status,
                        description: descStr,
                        originalName: playerName,
                        team: teamObj.displayName || ''
                    };
                });
            });

            console.log('Injury data loaded:', Object.keys(injuryData).length, 'injured players');
            if (Object.keys(injuryData).length > 0) {
                console.log('Sample injuries:', Object.keys(injuryData).slice(0, 5).map(k => `${injuryData[k].originalName} (${injuryData[k].status})`));
            }
            displayPlayers();
            return;
        }

        // Fallback to scoreboard endpoint
        console.log('Injuries endpoint failed, trying scoreboard...');
        const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
        if (!response.ok) return;

        const data = await response.json();
        const events = data.events || [];

        // Clear existing injury data
        injuryData = {};

        events.forEach(event => {
            event.competitions?.[0]?.competitors?.forEach(competitor => {
                const roster = competitor.roster || [];
                roster.forEach(player => {
                    if (player.injury) {
                        const playerName = player.athlete.displayName || player.athlete.fullName || '';
                        const normalizedName = normalizePlayerName(playerName);

                        // Ensure description is always a string
                        const desc = player.injury.longComment || player.injury.type || 'Injury';
                        const descStr = typeof desc === 'string' ? desc : String(desc || 'Injury');

                        injuryData[normalizedName] = {
                            status: player.injury.status || 'Q',
                            description: descStr,
                            originalName: playerName
                        };
                    }
                });
            });
        });

        console.log('Injury data loaded from scoreboard:', Object.keys(injuryData).length, 'injured players');
        displayPlayers();
    } catch (error) {
        console.error('Error fetching injury data:', error);
    }
}

// Normalize player names for matching between CSV and ESPN data
function normalizePlayerName(name) {
    if (!name) return '';
    return name
        .toUpperCase()
        .replace(/\s+(JR\.?|SR\.?|III|IV|II)$/i, '') // Remove suffixes
        .replace(/[.\-']/g, '') // Remove punctuation
        .trim();
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

// Helper function to get player's team spread from odds data
function getPlayerTeamSpread(player, gameInfo) {
    if (!gameInfo || !gameOdds[gameInfo]) return null;

    const odds = gameOdds[gameInfo];
    const playerTeam = player.TeamAbbrev;

    // Spread is from home team's perspective
    // Positive spread = home team underdog, negative = home team favorite
    if (odds.homeTeam === playerTeam) {
        return odds.spread; // Return as-is for home team
    } else if (odds.awayTeam === playerTeam) {
        return odds.spread ? -odds.spread : null; // Flip sign for away team
    }

    return null;
}

// Calculate advanced metrics (MPPK, Vegas Value, Game Environment Score)
function calculateAdvancedMetrics() {
    players.forEach(player => {
        const gameInfo = player['Game Info'] ? player['Game Info'].split(' ')[0] : '';

        // 1. Matchup-Adjusted PPK (MPPK)
        let mppk = player.ppk || 0;
        let defenseMultiplier = 1.0;

        if (gameInfo && player.Position !== 'DST') {
            const oppTeam = gameInfo.includes('@') ? gameInfo.split('@')[1] : gameInfo.split('vs')[1];
            const defKey = `${oppTeam}_${player.Position}`;

            if (defenseRankings[defKey]) {
                const ranking = defenseRankings[defKey];
                const percentile = ranking.rank / ranking.total;

                // Top 33% worst defenses (rank > 67th percentile) = good matchup
                if (percentile > 0.67) {
                    defenseMultiplier = 1.20; // 20% boost for great matchup
                }
                // Bottom 33% (rank < 33rd percentile) = tough matchup
                else if (percentile < 0.33) {
                    defenseMultiplier = 0.85; // 15% penalty for tough matchup
                }
                // Middle 34% = neutral (1.0)
            }
        }

        mppk = mppk * defenseMultiplier;

        // 2. Vegas-Implied Player Value
        let vegasBonus = 0;
        let impliedTeamTotal = null;

        if (gameInfo && gameOdds[gameInfo] && player.Position !== 'DST') {
            const odds = gameOdds[gameInfo];
            const playerTeam = player.TeamAbbrev;

            // Determine which team total to use
            if (odds.homeTeam === playerTeam && odds.homeTotal) {
                impliedTeamTotal = parseFloat(odds.homeTotal);
            } else if (odds.awayTeam === playerTeam && odds.awayTotal) {
                impliedTeamTotal = parseFloat(odds.awayTotal);
            }

            // Apply Vegas bonus/penalty
            if (impliedTeamTotal !== null) {
                if (impliedTeamTotal >= 28) {
                    vegasBonus = 15; // High-scoring game environment
                } else if (impliedTeamTotal >= 24) {
                    vegasBonus = 8; // Above average
                } else if (impliedTeamTotal >= 20) {
                    vegasBonus = 0; // Average
                } else {
                    vegasBonus = -10; // Low-scoring game
                }
            }
        }

        // 3. Overall DFS Score (0-100) - Composite Player + Game Quality
        let dfsScore = 50; // Start at baseline
        let gameTotal = null;
        let playerSpread = null;

        // COMPONENT 1: Player Value (MPPK) - 30% weight (±25 points)
        // Normalize MPPK to score contribution
        if (mppk > 0) {
            // Scale: 4.0 MPPK = max (+25), 0.5 MPPK = min (-25)
            const mppkContribution = ((mppk - 2.0) / 1.5) * 25;
            dfsScore += Math.max(-25, Math.min(25, mppkContribution));
        } else {
            dfsScore -= 25; // No value = big penalty
        }

        // COMPONENT 2: Player Performance (Avg Points) - 25% weight (±20 points)
        const avgPoints = parseFloat(player.AvgPointsPerGame) || 0;
        if (avgPoints > 0) {
            // Scale: 25+ avg = max (+20), 0-5 avg = min (-20)
            const avgContribution = ((avgPoints - 12.5) / 12.5) * 20;
            dfsScore += Math.max(-20, Math.min(20, avgContribution));
        } else {
            dfsScore -= 20; // No production = penalty
        }

        // COMPONENT 3: Game Conditions (Vegas) - 20% weight (±15 points)
        if (gameInfo && gameOdds[gameInfo] && player.Position !== 'DST') {
            const odds = gameOdds[gameInfo];

            // Team Total (10 points)
            if (impliedTeamTotal !== null) {
                const totalContribution = ((impliedTeamTotal - 22.5) / 7.5) * 10; // Center at 22.5
                dfsScore += Math.max(-10, Math.min(10, totalContribution));
            }

            // Game Pace (5 points)
            if (odds.total !== null) {
                gameTotal = parseFloat(odds.total);
                if (gameTotal >= 50) {
                    dfsScore += 5; // Fast game
                } else if (gameTotal >= 46) {
                    dfsScore += 2;
                } else if (gameTotal <= 38) {
                    dfsScore -= 5; // Slow game
                } else if (gameTotal <= 42) {
                    dfsScore -= 2;
                }
            }
        }

        // COMPONENT 4: Game Script (Spread) - 15% weight (±10 points)
        if (gameInfo && gameOdds[gameInfo] && player.Position !== 'DST') {
            playerSpread = getPlayerTeamSpread(player, gameInfo);
            if (playerSpread !== null) {
                if (['WR', 'TE', 'QB'].includes(player.Position)) {
                    if (playerSpread > 7) dfsScore += 10; // Big underdog
                    else if (playerSpread > 3) dfsScore += 5;
                    else if (playerSpread < -10) dfsScore -= 6;
                    else if (playerSpread < -6) dfsScore -= 3;
                } else if (player.Position === 'RB') {
                    if (playerSpread < -7) dfsScore += 10; // Big favorite
                    else if (playerSpread < -3) dfsScore += 5;
                    else if (playerSpread > 10) dfsScore -= 6;
                    else if (playerSpread > 6) dfsScore -= 3;
                }
            }
        }

        // COMPONENT 5: Recent Performance Trend - 5% weight (±5 points)
        if (recentPerformance[player.ID]) {
            const trend = recentPerformance[player.ID].trend;
            if (trend === 'hot') dfsScore += 5;
            else if (trend === 'cold') dfsScore -= 5;
        }

        // COMPONENT 6: Injury Status - REMOVED
        // Injuries are now managed manually via "Mark Out" button
        // DFS score is no longer penalized for injury status

        // Clamp score to 0-100
        dfsScore = Math.max(0, Math.min(100, dfsScore));

        // Store advanced metrics on player object
        player.mppk = mppk;
        player.vegasBonus = vegasBonus;
        player.impliedTeamTotal = impliedTeamTotal;
        player.gameTotal = gameTotal;
        player.playerSpread = playerSpread;
        player.dfsScore = dfsScore; // Overall DFS Score (renamed from envScore)
        player.defenseMultiplier = defenseMultiplier;
    });

    // Log sample DFS scores for debugging
    const samplePlayers = players.slice(0, 3);
    console.log('Advanced metrics calculated. Sample DFS Scores:',
        samplePlayers.map(p => `${p.Name}: ${Math.round(p.dfsScore || 0)}`).join(', '));
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
