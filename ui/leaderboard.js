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
                    const sheetWidth = vehicleSheet.naturalWidth; // Get original sheet width
                    const sheetHeight = vehicleSheet.naturalHeight; // Get original sheet height

                    // Calculate background position as percentages for better scaling? No, stick to pixels for now.
                    // const bgPosX = (frame.x / sheetWidth) * 100;
                    // const bgPosY = (frame.y / sheetHeight) * 100;

                    // Calculate background-size based on sheet dimensions and frame dimensions
                    // We want to show just one frame (frame.width x frame.height) from the sheet (sheetWidth x sheetHeight)
                    // scaled down to fit the div size defined in CSS.
                    const bgSizeX = (sheetWidth / frame.width) * 100; // Percentage width of the sheet to show one frame's width
                    const bgSizeY = (sheetHeight / frame.height) * 100; // Percentage height of the sheet to show one frame's height

                    // Adjust background position based on the scaled background size
                    const bgPosX = (frame.x / (sheetWidth - frame.width)) * 100;
                    const bgPosY = (frame.y / (sheetHeight - frame.height)) * 100;


                    vehicleSpriteHtml = `
                        <div class="leader-vehicle-sprite"
                             style="background-image: url(${SPRITES.vehicles.sheet});
                                    background-position: ${bgPosX}% ${bgPosY}%;
                                    background-size: ${bgSizeX}% ${bgSizeY}%;
                                    ">
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