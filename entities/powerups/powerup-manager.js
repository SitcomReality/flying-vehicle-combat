// New file: Manages active powerups in the game world

import Powerup from './powerup.js';
import { PowerupType, POWERUP_SPAWN_CONFIG } from './powerup-types.js';

class PowerupManager {
    // Added particleSystem as a dependency
    constructor(networkManager, assets, renderScale, particleSystem) {
        this.networkManager = networkManager;
        this.assets = assets; // Loaded sprite sheets
        this.renderScale = renderScale;
        this.particleSystem = particleSystem; // Store particle system reference
        this.activePowerups = {}; // Stores local Powerup instances { id: Powerup }
        this.lastSpawnAttemptTime = 0;

        // Listen for room state changes to sync powerups
        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate.bind(this));
        this._initializeFromRoomState(); // Initial sync
    }

    _initializeFromRoomState() {
        const roomState = this.networkManager.getRoomState();
        if (roomState && roomState.activePowerups) {
            this._syncPowerups(roomState.activePowerups);
        }
    }

    _handleRoomStateUpdate(roomState) {
        const powerupData = roomState.activePowerups || {};
        this._syncPowerups(powerupData);
    }

    _syncPowerups(powerupData) {
        const currentIds = Object.keys(this.activePowerups);
        const serverIds = Object.keys(powerupData);

        // Remove local powerups that are no longer in roomState
        for (const id of currentIds) {
            if (!powerupData[id]) {
                console.log(`Removing powerup ${id} locally as it's gone from roomState.`);
                delete this.activePowerups[id];
            }
        }

        // Add/Update powerups based on roomState
        for (const id of serverIds) {
            const data = powerupData[id];
            if (!this.activePowerups[id]) {
                // Create new local instance
                console.log(`Creating new local powerup instance ${id} of type ${data.type}`);
                this.activePowerups[id] = new Powerup(
                    id,
                    data.type,
                    data.x,
                    data.y,
                    POWERUP_SPAWN_CONFIG.RADIUS // Use configured radius
                );
            } else {
                // Update existing (though position/type shouldn't change often)
                const localPowerup = this.activePowerups[id];
                localPowerup.x = data.x;
                localPowerup.y = data.y;
                // Type change would require recreating, but assume it doesn't happen
            }
        }
    }

    // Only one client should ideally be responsible for spawning.
    // This could be the first client, or determined by some other logic.
    // For simplicity, we'll let any client attempt to spawn if needed.
    // The roomState update mechanism will handle conflicts (last write wins).
    attemptSpawnPowerup(currentTime, gameWidth, gameHeight, groundLevelY) {
        const numActive = Object.keys(this.activePowerups).length;
        if (numActive >= POWERUP_SPAWN_CONFIG.MAX_ACTIVE) {
            return; // Max limit reached
        }

        if (currentTime - this.lastSpawnAttemptTime > POWERUP_SPAWN_CONFIG.INTERVAL) {
            this.lastSpawnAttemptTime = currentTime;

            // Choose a random powerup type
            const availableTypes = Object.values(PowerupType);
            // Exclude types not fully implemented yet if needed
            const spawnableTypes = availableTypes.filter(type => type !== PowerupType.RAPID_FIRE);
            const type = spawnableTypes[Math.floor(Math.random() * spawnableTypes.length)];

            // Choose random spawn position (avoid edges and ground)
            const padding = 50;
            const spawnableHeight = groundLevelY - padding * 2;
            const x = Math.random() * (gameWidth - padding * 2) + padding;
            const y = Math.random() * spawnableHeight + padding;

            const newId = `powerup-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
            console.log(`Attempting to spawn powerup ${newId} (${type}) at ${x.toFixed(0)},${y.toFixed(0)}`);

            // Update room state to add the new powerup
            this.networkManager.updateRoomState({
                activePowerups: {
                    [newId]: {
                        type: type,
                        x: x,
                        y: y
                    }
                }
            });
        }
    }

    // Called when a local player picks up a powerup
    pickupPowerup(powerupId) {
        if (!this.activePowerups[powerupId]) {
            console.warn(`Attempted to pick up non-existent powerup ${powerupId}`);
            return null;
        }

        const powerup = this.activePowerups[powerupId];
        console.log(`Local player picked up powerup ${powerup.id} (${powerup.type})`);

        // Trigger pickup effect BEFORE removing
        this.particleSystem?.emitPowerupPickup(powerup.x, powerup.y);

        // Mark for local removal immediately (visuals)
        // Network removal happens via roomState update
        delete this.activePowerups[powerupId];

        // Trigger removal from roomState
        this.networkManager.updateRoomState({
            activePowerups: {
                [powerupId]: null // Set to null to remove
            }
        });

        return powerup; // Return the picked-up powerup details
    }

    getActivePowerups() {
        // Return powerups suitable for collision detection
        return Object.values(this.activePowerups).filter(p => !p.isMarkedForRemoval);
    }

    update(deltaTime) {
        // Update local animations (like bobbing)
        for (const id in this.activePowerups) {
            this.activePowerups[id].update(deltaTime);
        }
    }

    draw(ctx) {
        for (const id in this.activePowerups) {
            this.activePowerups[id].draw(ctx, this.assets, this.renderScale);
        }
    }
}

export default PowerupManager;