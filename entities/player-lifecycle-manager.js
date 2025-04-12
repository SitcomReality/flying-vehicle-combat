// Manages player lifecycle transitions (respawn, death, selection)

import { PlayerLifecycleState } from './player-lifecycle.js';
import { SPRITES } from 'config/sprites.js';
import { getVehicleConfig } from './vehicles/vehicle-types.js';
// Import particle constants for explosions
import { PLAYER_EXPLOSION_PARTICLE_COUNT, EXPLOSION_SPEED_MIN, PLAYER_EXPLOSION_SPEED_MAX, EXPLOSION_COLORS_PLAYER } from '../rendering/particle-system.js';


class PlayerLifecycleManager {
    // Added scorePersistence and particleSystem parameters
    constructor(playerManager, networkManager, vehicleSelector, scorePersistence, gameWidth, gameHeight, renderScale, particleSystem) {
        this.playerManager = playerManager;
        this.networkManager = networkManager;
        this.vehicleSelector = vehicleSelector;
        this.scorePersistence = scorePersistence; // Store reference
        this.particleSystem = particleSystem; // Store reference
        this.gameWidth = gameWidth;
        this.gameHeight = gameHeight;
        this.renderScale = renderScale;

        if (!this.playerManager || !this.networkManager || !this.vehicleSelector) {
            console.error("PlayerLifecycleManager is missing required manager references!");
        }
        if (!this.scorePersistence) {
             console.warn("PlayerLifecycleManager initialized without ScorePersistence. High scores will not be saved.");
        }
        if (!this.particleSystem) {
             console.warn("PlayerLifecycleManager initialized without ParticleSystem. Effects will be missing.");
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
        const spawnX = this.gameWidth / 2; // Spawn horizontally centered

        // --- CHANGE: Spawn near the top ---
        const spawnY = vehicleHeight + 10; // Spawn slightly below the top edge
        // --- END CHANGE ---

        // Reset state and set to ACTIVE
        localPlayer.resetStateForSpawn(spawnX, spawnY); // This should reset score

        // Hide UI
        this.vehicleSelector?.hide();

        // Send presence update
        this.networkManager?.updatePresence(localPlayer.getPresenceData());
        console.log(`Player ${localPlayer.id} spawned and set to ACTIVE at (${spawnX.toFixed(0)}, ${spawnY.toFixed(0)}). Presence updated.`);
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
       // Prevent handling death multiple times or if not the local player
       if (!player || !player.isLocalPlayer || player.state.lifecycleState === PlayerLifecycleState.DEAD) {
           return;
       }

       console.log(`Handling local player death for ${playerId}`);

       // --- Save Score ---
       // Get final score BEFORE resetting state
       const finalScore = player.state.score || 0;
       // Get username from network manager's peers list
       const localPeer = this.networkManager?.getPeer(playerId);
       const username = localPeer?.username;
       // Get vehicle type BEFORE resetting state
       const vehicleType = player.state.vehicleType;

       if (username && finalScore > 0 && this.scorePersistence) {
           console.log(`Player ${username} died with score ${finalScore} in vehicle type ${vehicleType}. Saving score...`);
           // Pass vehicleType to saveScore
           this.scorePersistence.saveScore(finalScore, vehicleType).catch(err => {
               console.error("Failed to save score asynchronously:", err);
           });
       } else if (finalScore <= 0) {
           console.log(`Player ${username || playerId} died with score ${finalScore}. Not saving score.`);
       } else if (!this.scorePersistence) {
            console.warn("ScorePersistence not available, cannot save score.");
       } else if (!username) {
            console.warn(`Could not get username for player ${playerId}, cannot save score.`);
       }
       // --- End Save Score ---

       // Store position BEFORE resetting state for the explosion effect
       const deathX = player.state.x + (player.state.width * this.renderScale / 2); // Center X
       const deathY = player.state.y + (player.state.height * this.renderScale / 2); // Center Y


       // Transition to DEAD state FIRST (this also syncs presence)
       // This prevents the player from being drawn in the frame the explosion starts
       if (player.transitionToState(PlayerLifecycleState.DEAD)) {
           console.log(`Local player ${player.id} officially DEAD.`);

           // Trigger explosion particle effect at the player's last position AFTER setting state
           // Use player-specific constants for a bigger explosion
           this.particleSystem?.emitExplosion(
               deathX,
               deathY,
               PLAYER_EXPLOSION_PARTICLE_COUNT, // Use player-specific count
               EXPLOSION_SPEED_MIN, // Use standard min speed
               PLAYER_EXPLOSION_SPEED_MAX, // Use player-specific max speed
               EXPLOSION_COLORS_PLAYER // Use player-specific colors
           );
            console.log(`Player explosion effect triggered for ${player.id} at (${deathX.toFixed(0)}, ${deathY.toFixed(0)})`);

           // Automatically trigger respawn selection after a short delay
           setTimeout(() => {
                // Ensure player still exists and is dead before respawning
                const currentPlayer = this.playerManager.getPlayer(playerId);
                if(currentPlayer && currentPlayer.state.lifecycleState === PlayerLifecycleState.DEAD) {
                    this.triggerLocalPlayerRespawn();
                } else {
                     console.log(`Skipping respawn trigger for ${playerId} as they are no longer in DEAD state.`);
                }
           }, 1500); // 1.5 second delay before showing selector
       } else {
           console.error(`Failed to transition player ${playerId} to DEAD state.`);
       }
    }
}

export default PlayerLifecycleManager;