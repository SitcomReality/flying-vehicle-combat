// New file: Handles rendering debug information to the DOM
import { getVisualCenter } from '../entities/player-visuals.js';

class DebugRenderer {
    constructor(debugEl, playerManager, networkManager, inputManager, gameConfig) {
        this.debugEl = debugEl;
        this.playerManager = playerManager;
        this.networkManager = networkManager;
        this.inputManager = inputManager;
        this.gameConfig = gameConfig; // { RENDER_SCALE }
        this.localPlayerId = null;

        if (!this.playerManager || !this.networkManager || !this.inputManager || !this.gameConfig) {
             console.warn("DebugRenderer initialized with missing dependencies.");
        }
    }

    setLocalPlayerId(id) {
        this.localPlayerId = id;
    }

    // Replaces the original updateDebugInfo function
    updateDebugInfo() {
        if (!this.debugEl || !this.playerManager || !this.networkManager) return; // Added checks

        const players = this.playerManager.getAllPlayers();
        const localPlayer = this.playerManager.getLocalPlayer();

        let debugText = `Client ID: ${this.localPlayerId || 'N/A'}\n`;
        debugText += `Render Scale: ${this.gameConfig?.RENDER_SCALE || 'N/A'}\n`;
        debugText += `Players (${Object.keys(players).length}):\n`;

        for (const id in players) {
            const p = players[id];
            if (!p || !p.state || p.isMarkedForRemoval) continue;

            const peerInfo = this.networkManager.getPeer(id);
            const name = peerInfo?.username || 'Unknown';
            const state = p.state; // Alias for easier access

            // Basic physics/state info
            debugText += `  ${name} (${id.substring(0, 4)}): [${state.lifecycleState}] P(${state.x?.toFixed(0)}, ${state.y?.toFixed(0)}) V(${state.vx?.toFixed(0)}, ${state.vy?.toFixed(0)}) R:${state.rotation?.toFixed(2)} `;
            debugText += ` F:${state.facingDirection}(${state.visualFacingDirection}) T:${state.targetFacingDirection}`;
            debugText += ` H:${state.health?.toFixed(0)} Fuel:${state.fuel?.toFixed(0)} Inv:${state.isInvulnerable} Ground:${state.isOnGround} `;
            debugText += ` Score:${state.score}\n`;

            // Add charging/firing info for local player
             if (p.isLocalPlayer && state.lifecycleState === 'ACTIVE') { // Check if active
                 debugText += `    Charge: ${state.chargeLevel?.toFixed(0)}/${state.maxChargeLevel} Firing: ${state.wantsToFire} Charging: ${state.isCharging}\n`;
             }

            // Input/Server state
            if (p.isLocalPlayer && this.inputManager) { // Check if inputManager is available
                debugText += `    Input: ${JSON.stringify(this.inputManager.getInputState())} Thrust:${state.isThrusting}\n`;
            } else if (!p.isLocalPlayer) {
                 debugText += `    Server: P(${state.serverX?.toFixed(0)}, ${state.serverY?.toFixed(0)}) R:${state.serverRotation?.toFixed(2)} H:${state.serverHealth?.toFixed(0)} Fuel:${state.serverFuel?.toFixed(0)} Inv:${state.serverIsInvulnerable} State:${state.serverLifecycleState} Score:${state.serverScore}\n`;
            }
        }
        this.debugEl.textContent = debugText;
    }

     // Helper to draw player names/info directly on canvas
     drawPlayerInfo(renderer) {
         if (!this.playerManager || !this.networkManager) return; // Added checks

        const players = this.playerManager.getAllPlayers();
        for (const id in players) {
            const player = players[id];
            // Ensure player exists, has state, not marked for removal, and has vehicle info
            if (player && player.state && !player.isMarkedForRemoval && player.state.currentVehicle &&
                player.state.lifecycleState !== 'CONNECTING' && player.state.lifecycleState !== 'SELECTING')
            {
                const peerInfo = this.networkManager.getPeer(id);
                if (peerInfo) {
                    // Use the imported helper function, passing state and scale
                    // Use player's renderScale property
                    const visualCenter = getVisualCenter(player.state, player.renderScale);
                    if (visualCenter.x !== 0 || visualCenter.y !== 0) { // Check if valid center was returned
                        renderer.drawText(
                            peerInfo.username,
                            visualCenter.x, // Centered horizontally
                            visualCenter.topY - 10, // Positioned above the sprite
                            '#FFFFFF', // White color for better visibility on dark background
                            '11px "Comic Sans MS", "Chalkduster", cursive', // Crayon font
                            'center', // Align text center
                            'bottom' // Baseline at the bottom of the text
                        );
                    }
                }
            }
        }
    }
}

export default DebugRenderer;