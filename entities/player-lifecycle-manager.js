// New file: Manages player lifecycle transitions (respawn, death, selection)

import { PlayerLifecycleState } from './player-lifecycle.js';
import { SPRITES } from 'config/sprites.js';
import { getVehicleConfig } from './vehicles/vehicle-types.js';

class PlayerLifecycleManager {
    constructor(playerManager, networkManager, vehicleSelector, gameWidth, gameHeight, renderScale) {
        this.playerManager = playerManager;
        this.networkManager = networkManager;
        this.vehicleSelector = vehicleSelector;
        this.gameWidth = gameWidth;
        this.gameHeight = gameHeight;
        this.renderScale = renderScale;

        if (!this.playerManager || !this.networkManager || !this.vehicleSelector) {
            console.error("PlayerLifecycleManager is missing required manager references!");
        }
    }

    triggerLocalPlayerRespawn() {
        const localPlayer = this.playerManager.getLocalPlayer();
        if (localPlayer && localPlayer.transitionToState(PlayerLifecycleState.SELECTING)) {
             console.log(`Player ${localPlayer.id} transitioning to SELECTING for respawn.`);
            this.vehicleSelector?.show(); // Show the UI
            // Presence update happens inside transitionToState
        } else {
             console.warn(`Could not trigger respawn for player ${this.playerManager.localPlayerId}. Player null or transition failed.`);
        }
    }

    confirmLocalPlayerVehicleSelection(selectedVehicleType) {
        const localPlayer = this.playerManager.getLocalPlayer();
        if (!localPlayer || localPlayer.state.lifecycleState !== PlayerLifecycleState.SELECTING) {
            console.warn("Attempted to confirm vehicle selection, but player is not in SELECTING state.");
            return;
        }

        console.log(`Local player ${localPlayer.id} selected vehicle type: ${selectedVehicleType}`);
        localPlayer.setVehicle(selectedVehicleType); // This also resets health/fuel

        // Determine spawn position
        const vehicleConfig = getVehicleConfig(selectedVehicleType);
        // Estimate vehicle height using known render scale and sprite data
        const vehicleHeight = (SPRITES.vehicles.hitboxHeight ?? SPRITES.vehicles.frameHeight) * this.renderScale;
        const spawnX = this.gameWidth / 2;
        // Estimate ground level (needs refinement if dynamic)
        const groundY = this.gameHeight - 30; // Use consistent ground estimate
        const spawnY = groundY - vehicleHeight - 10; // Spawn slightly above ground

        // Reset state and set to ACTIVE
        localPlayer.resetStateForSpawn(spawnX, spawnY);

        // Hide UI
        this.vehicleSelector?.hide();

        // Send presence update
        this.networkManager?.updatePresence(localPlayer.getPresenceData());
        console.log(`Player ${localPlayer.id} spawned and set to ACTIVE. Presence updated.`);
    }

    killLocalPlayer() {
        const localPlayer = this.playerManager.getLocalPlayer();
        if (localPlayer && localPlayer.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
            console.log(`DEBUG: Applying lethal damage to local player ${localPlayer.id}`);
            // Apply enough damage to ensure death, passing current time and playerManager ref
            localPlayer.takeDamage(localPlayer.state.maxHealth * 2, performance.now());
        } else {
            console.log(`Could not kill local player ${this.playerManager.localPlayerId} via debug. State was ${localPlayer?.state.lifecycleState}.`);
        }
    }

    handlePlayerDeath(playerId) {
       const player = this.playerManager.getPlayer(playerId);
       if (!player || !player.isLocalPlayer || player.state.lifecycleState === PlayerLifecycleState.DEAD) {
           console.warn(`handlePlayerDeath called for invalid player: ${playerId} or player already dead.`);
           return;
       }

       // Transition to DEAD state (this also syncs presence)
       if (player.transitionToState(PlayerLifecycleState.DEAD)) {
           console.log(`Local player ${player.id} officially DEAD.`);

           // TODO: Add explosion particle effect here using this.particleSystem (would need reference)
           // Example: this.particleSystem?.emitExplosion(player.x, player.y);

           // Automatically trigger respawn selection after a short delay
           setTimeout(() => {
                this.triggerLocalPlayerRespawn();
           }, 1500); // 1.5 second delay before showing selector
       } else {
           console.error(`Failed to transition player ${playerId} to DEAD state.`);
       }
    }
}

export default PlayerLifecycleManager;