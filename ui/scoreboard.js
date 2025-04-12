// New file: Renders the current game scoreboard

class Scoreboard {
    constructor(element, playerManager, networkManager) {
        this.element = element;
        this.playerManager = playerManager;
        this.networkManager = networkManager;
        this.lastUpdateTime = 0;
        this.updateInterval = 500; // Update twice per second

        if (!this.element) {
            console.error("Scoreboard DOM element not provided!");
            return;
        }
        if (!this.playerManager || !this.networkManager) {
            console.error("Scoreboard requires PlayerManager and NetworkManager!");
            return;
        }

        this.element.innerHTML = '<h2>Scoreboard</h2><ul id="scoreList"><li>Loading...</li></ul>';
        this.scoreListElement = this.element.querySelector('#scoreList');
    }

    update(currentTime) {
        // Throttle updates
        if (currentTime - this.lastUpdateTime < this.updateInterval) {
            return;
        }
        this.lastUpdateTime = currentTime;

        if (!this.scoreListElement) return;

        const players = this.playerManager.getAllPlayers();
        const peers = this.networkManager.getPeers();
        const scoreData = [];

        for (const id in players) {
            const player = players[id];
            // Include players who are active, selecting, or recently dead (to show final score)
            if (player && player.state &&
               (player.state.lifecycleState === 'ACTIVE' ||
                player.state.lifecycleState === 'SELECTING' ||
                player.state.lifecycleState === 'DEAD'))
            {
                const peerInfo = peers[id];
                scoreData.push({
                    id: id,
                    name: peerInfo?.username || `Player ${id.substring(0,4)}`,
                    score: player.state.score || 0,
                    isLocal: player.isLocalPlayer,
                });
            }
        }

        // Sort by score descending
        scoreData.sort((a, b) => b.score - a.score);

        // Generate HTML
        let html = '';
        if (scoreData.length > 0) {
            scoreData.forEach(data => {
                const localIndicator = data.isLocal ? ' (You)' : '';
                // Escape potentially harmful characters in names just in case
                const safeName = data.name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                html += `
                    <li>
                        <span class="score-name" title="${safeName}${localIndicator}">${safeName}${localIndicator}</span>
                        <span class="score-value">${data.score}</span>
                    </li>
                `;
            });
        } else {
            html = '<li>No players yet...</li>';
        }

        this.scoreListElement.innerHTML = html;
    }
}

export default Scoreboard;