// New file: Handles rendering debug information to the DOM

class DebugRenderer {
    constructor(debugEl, playerManager, networkManager, inputManager, gameConfig) {
        this.debugEl = debugEl;
        this.playerManager = playerManager;
        this.networkManager = networkManager;
        this.inputManager = inputManager;
        this.gameConfig = gameConfig; // { RENDER_SCALE }
        this.localPlayerId = null;
    }

    setLocalPlayerId(id) {
        this.localPlayerId = id;
    }

    // Replaces the original updateDebugInfo function
    updateDebugInfo() {
        if (!this.debugEl) return;

        const players = this.playerManager.getAllPlayers();
        const localPlayer = this.playerManager.getLocalPlayer();

        let debugText = `Client ID: ${this.localPlayerId}\n`;
        debugText += `Render Scale: ${this.gameConfig.RENDER_SCALE}\n`;
        debugText += `Players (${Object.keys(players).length}):\n`;

        for (const id in players) {
            const p = players[id];
            if (!p || !p.state || p.isMarkedForRemoval) continue;

            const peerInfo = this.networkManager.getPeer(id);
            const name = peerInfo?.username || 'Unknown';
            debugText += `  ${name} (${id.substring(0, 4)}): P(${p.state.x?.toFixed(0)}, ${p.state.y?.toFixed(0)}) V(${p.state.vx?.toFixed(0)}, ${p.state.vy?.toFixed(0)}) R:${p.state.rotation?.toFixed(2)} F:${p.state.facingDirection === 1 ? 'R' : 'L'}\n`;

            if (p.isLocalPlayer && this.inputManager) { // Check if inputManager is available
                debugText += `    Input: ${JSON.stringify(this.inputManager.getInputState())} Thrust:${p.isThrusting}\n`;
            } else if (!p.isLocalPlayer) {
                 debugText += `    Server: P(${p.state.serverX?.toFixed(0)}, ${p.state.serverY?.toFixed(0)}) R:${p.state.serverRotation?.toFixed(2)}\n`;
            }
        }
        this.debugEl.textContent = debugText;
    }

     // Helper to draw player names/info directly on canvas
     drawPlayerInfo(renderer) {
        const players = this.playerManager.getAllPlayers();
        for (const id in players) {
            const player = players[id];
            // Ensure player exists, has state, and is not marked for removal
            if (player && player.state && !player.isMarkedForRemoval) {
                const peerInfo = this.networkManager.getPeer(id);
                if (peerInfo) {
                    const visualCenter = player.getVisualCenter(); // Use helper to get draw position
                    renderer.drawText(
                        peerInfo.username,
                        visualCenter.x, // Centered horizontally
                        visualCenter.topY - 10, // Positioned above the sprite
                        '#333', // Dark color for readability
                        '11px "Comic Sans MS", "Chalkduster", cursive', // Crayon font
                        'center', // Align text center
                        'bottom' // Baseline at the bottom of the text
                    );
                }
            }
        }
    }
}

export default DebugRenderer;