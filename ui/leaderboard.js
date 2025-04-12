// New file: Renders the all-time leaderboard
import { SPRITES } from '../config/sprites.js'; // Import SPRITES config

class Leaderboard {
    constructor(element, scorePersistence, networkManager, assets, maxEntries = 10) { // Added assets
        this.element = element;
        this.scorePersistence = scorePersistence;
        this.networkManager = networkManager;
        this.assets = assets; // Store assets
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
        if (!this.assets || !this.assets.vehicles) { // Check for assets
             console.warn("Leaderboard initialized without vehicle assets. Sprites will not be shown.");
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


                // --- Vehicle Sprite Rendering ---
                let vehicleSpriteHtml = '';
                const vehicleType = entry.vehicleType; // Get vehicle type from record
                const vehicleSheet = this.assets?.vehicles;

                if (vehicleType !== undefined && vehicleType !== null && vehicleSheet && SPRITES.vehicles.frames[vehicleType]) {
                    const frame = SPRITES.vehicles.frames[vehicleType];
                    // Use background-image for simplicity to avoid extra canvas elements
                    vehicleSpriteHtml = `
                        <div class="leader-vehicle-sprite"
                             style="background-image: url(${SPRITES.vehicles.sheet});
                                    background-position: -${frame.x}px -${frame.y}px;
                                    width: ${frame.width}px;
                                    height: ${frame.height}px;">
                        </div>
                    `;
                } else {
                    // Placeholder or empty if no type/asset
                    vehicleSpriteHtml = '<div class="leader-vehicle-sprite placeholder">?</div>';
                    if (vehicleType === undefined || vehicleType === null) console.warn(`High score entry missing vehicleType:`, entry);
                }
                // --- End Vehicle Sprite Rendering ---

                html += `
                    <li${highlightClass}>
                        <span class="rank">${index + 1}.</span>
                        <span class="leader-info"> 
                            ${vehicleSpriteHtml} 
                            <img src="https://images.websim.ai/avatar/${encodeURIComponent(username)}" class="leader-avatar" alt="">
                            <span class="leader-name" title="${safeName}${localIndicator}">${safeName}${localIndicator}</span>
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