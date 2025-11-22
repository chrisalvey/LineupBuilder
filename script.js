// Global variables
let players = [];
let currentLineup = {};
let currentPosition = 'QB';
let contestType = 'classic';
let salaryCap = 50000;
let currentSort = 'salary-high';

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
    displayPlayers();
}

function calculatePlayerValues() {
    // Calculate PPK (Points Per $1K) for each player
    players.forEach(player => {
        const avgPoints = parseFloat(player.AvgPointsPerGame) || 0;
        const salary = parseInt(player.Salary) || 1;

        // Calculate Points Per $1,000
        player.ppk = avgPoints > 0 ? (avgPoints / salary) * 1000 : 0;
    });

    // Group players by position and find top 25% threshold for each position
    const positionGroups = {};

    players.forEach(player => {
        const pos = player.Position;
        if (!positionGroups[pos]) {
            positionGroups[pos] = [];
        }
        positionGroups[pos].push(player.ppk);
    });

    // Calculate 75th percentile (top 25%) for each position
    const positionThresholds = {};

    Object.keys(positionGroups).forEach(pos => {
        const ppkValues = positionGroups[pos].sort((a, b) => b - a);
        const index = Math.floor(ppkValues.length * 0.25);
        positionThresholds[pos] = ppkValues[index] || 0;
    });

    // Mark players that are in top 25% for their position
    players.forEach(player => {
        const threshold = positionThresholds[player.Position] || 0;
        player.isTopValue = player.ppk >= threshold && player.ppk > 0;
    });
}

function displayPlayers() {
    const playerList = document.getElementById('playerList');
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

        return `
            <div class="player-item ${valueClass}" onclick="addPlayerToLineup(${index})">
                <div class="player-name">${player.Name} ${starIcon}</div>
                <div class="player-details">
                    <span>${player.TeamAbbrev || ''} - ${player.Position}</span>
                    <span class="player-avg">${avgPts} avg</span>
                </div>
                <div class="player-details">
                    <span class="player-value">${ppkValue} PPK</span>
                    <span class="player-salary">$${salary.toLocaleString()}</span>
                </div>
                <div class="player-details">
                    <span class="player-game">${gameInfo}</span>
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
    const player = players.filter(p => {
        if (currentPosition === 'ALL') return true;
        if (currentPosition === 'FLEX') {
            return contestConfigs[contestType].flexEligible.includes(p.Position);
        }
        return p.Position === currentPosition;
    }).sort((a, b) => parseInt(b.Salary) - parseInt(a.Salary))[playerIndex];

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

    document.getElementById('salaryUsed').textContent = `$${totalSalary.toLocaleString()}`;
    document.getElementById('salaryRemaining').textContent = `$${remaining.toLocaleString()}`;
    document.getElementById('salaryRemaining').style.color = remaining < 0 ? '#dc3545' : '#667eea';
}
