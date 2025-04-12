// New file: Renders the all-time leaderboard

class Leaderboard {
    constructor(element, scorePersistence, networkManager, maxEntries = 10) {
        this.element = element;
        this.scorePersistence = scorePersistence;
        this.networkManager = networkManager; 
        this.maxEntries = maxEntries;
        this.scores = [];
        this.unsubscribe = null;
        this.localPlayerId = this.networkManager?.getClientId();

        if (!this.element) {
            console.error("Leaderboard DOM element not provided!");
            return;
        }
        if (!this.scorePersistence) {
            console.error("Leaderboard requires ScorePersistence instance!");
            return;
        }
        if (!this.networkManager) {
             console.error("Leaderboard requires NetworkManager instance!");
        }


        this.element.innerHTML = '<h2>High Scores</h2><ul id="leaderboardList"><li>Loading...</li></ul>';
        this.listElement = this.element.querySelector('#leaderboardList');

        this._startSubscription();
    }

    _startSubscription() {
        this.unsubscribe = this.scorePersistence.subscribeToHighScores((scores) => {
            this.scores = scores;
            this.render();
        }, this.maxEntries);
    }

    render() {
        if (!this.listElement) return;

        let html = '';
        if (this.scores.length > 0) {
            this.scores.forEach((entry, index) => {
                const username = entry.username || '???';
                const safeName = username.replace(/</g, "&lt;").replace(/>/g, "&gt;");

                const localPeer = this.networkManager?.getPeer(this.localPlayerId);
                const isLocalUserEntry = localPeer && localPeer.username === entry.username;
                const localIndicator = isLocalUserEntry ? ' (You)' : '';
                const highlightClass = isLocalUserEntry ? ' class="local-player-score"' : '';


                html += `
                    <li${highlightClass}>
                        <span class="rank">${index + 1}.</span>
                        <span class="leader-name" title="${safeName}${localIndicator}">
                            <img src="https://images.websim.ai/avatar/${encodeURIComponent(username)}" class="leader-avatar" alt="">
                            ${safeName}${localIndicator}
                        </span>
                        <span class="leader-score">${entry.score}</span>
                    </li>
                `;
            });
        } else {
            html = '<li>No scores yet!</li>';
        }

        this.listElement.innerHTML = html;
    }

    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        this.element.innerHTML = ''; 
    }
}

export default Leaderboard;