// New file: Manages active powerups in the game world

import Powerup from './powerup.js';
import { PowerupType, POWERUP_SPAWN_CONFIG, getRandomPowerupType } from './powerup-types.js';

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
        this.networkManager.onPresenceUpdate(this._handlePresenceUpdate.bind(this)); // Need peer list for spawner check
        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate.bind(this));
        this._initializeFromRoomState(); // Initial sync
    }

    _initializeFromRoomState() {
        const roomState = this.networkManager.getRoomState();
        if (roomState && roomState.activePowerups) {
            console.log("Initializing powerups from initial room state:", roomState.activePowerups);
            this._syncPowerups(roomState.activePowerups);
        }
    }

    // Track the current list of peers to determine the spawner
    _handlePresenceUpdate(presence) {
        // The presence update implicitly updates networkManager.peers
    }

    _handleRoomStateUpdate(roomState) {
        // Check if activePowerups exists in the update
        if (roomState.hasOwnProperty('activePowerups')) {
            // console.log("Received room state update for activePowerups:", roomState.activePowerups); // Reduce noise
            const powerupData = roomState.activePowerups || {};
            this._syncPowerups(powerupData);
        }
    }

    _syncPowerups(powerupData) {
        const currentIds = Object.keys(this.activePowerups);
        const myClientId = this.networkManager.getClientId(); // Cache client ID
        const serverIds = Object.keys(powerupData);

        // Remove local powerups that are no longer in roomState
        for (const id of currentIds) {
            if (!powerupData[id]) {
                // console.log(`Removing powerup ${id} locally as it's gone from roomState.`);
                if (this.activePowerups[id]) { // Ensure it exists before deleting
                    delete this.activePowerups[id];
                }
            }
        }

        // Add/Update powerups based on roomState
        for (const id of serverIds) {
            const data = powerupData[id];
            if (!data || !data.type) {
                console.warn(`Invalid data for powerup ${id} in roomState. Skipping.`);
                if(this.activePowerups[id]) delete this.activePowerups[id];
                continue;
            }

            if (!this.activePowerups[id]) {
                console.log(`[PowerupManager ${myClientId}] Sync: Creating new local powerup ${id} type ${data.type}`); // Log creation attempt
                this.activePowerups[id] = new Powerup(
                    id,
                    data.type,
                    data.x,
                    data.y,
                    POWERUP_SPAWN_CONFIG.RADIUS // Use configured radius
                );
                if (!this.activePowerups[id]?.id) {
                    console.error(`[PowerupManager ${myClientId}] Sync: FAILED to create local powerup ${id}`);
                }
            } else {
                // Update existing (though position/type shouldn't change often)
                const localPowerup = this.activePowerups[id];
                localPowerup.x = data.x;
                localPowerup.y = data.y;
                if (localPowerup.type !== data.type) {
                    console.warn(`[PowerupManager ${myClientId}] Powerup ${id} changed type unexpectedly. Recreating.`);
                    delete this.activePowerups[id];
                    this.activePowerups[id] = new Powerup(
                        id, data.type, data.x, data.y, POWERUP_SPAWN_CONFIG.RADIUS
                    );
                }
            }
        }
    }

    // Attempt to spawn a powerup periodically (only by designated spawner)
    attemptRandomSpawn(currentTime, gameWidth, gameHeight, groundLevelY) {
        // --- Spawner Determination ---
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        if (!peerIds.length || this.networkManager.getClientId() !== peerIds[0]) {
            return; // Not the designated spawner
        }

        // --- Spawn Conditions ---
        const numActive = Object.keys(this.activePowerups).length;
        if (numActive >= POWERUP_SPAWN_CONFIG.MAX_ACTIVE) {
            return; // Max limit reached
        }

        if (currentTime - this.lastSpawnAttemptTime > POWERUP_SPAWN_CONFIG.INTERVAL) {
            this.lastSpawnAttemptTime = currentTime;

            // Random chance to spawn within the interval
            if (Math.random() > POWERUP_SPAWN_CONFIG.SPAWN_CHANCE_PER_INTERVAL) {
                return;
            }

            // --- Spawn Logic ---
            const type = getRandomPowerupType();
            if (!type) {
                console.log("Attempted random spawn, but no powerup type selected (check weights).");
                return;
            }

            const padding = 50;
            // Ensure spawnableHeight is positive
            const spawnableHeight = Math.max(0, groundLevelY - padding * 2);
            const x = Math.random() * (gameWidth - padding * 2) + padding;
            const y = Math.random() * spawnableHeight + padding;

            const newId = `powerup-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
            console.log(`Spawner ${this.networkManager.getClientId()} attempting to spawn powerup ${newId} (${type}) at ${x.toFixed(0)},${y.toFixed(0)}`);

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
            // The spawner client will also receive this update via _handleRoomStateUpdate and create the local instance.
        }
    }

    // Spawns a powerup at a specific location (e.g., from object drop)
    spawnPowerupAt(x, y, type = null) {
        // Apply max active limit check even for drops
        const numActive = Object.keys(this.activePowerups).length;
        if (numActive >= POWERUP_SPAWN_CONFIG.MAX_ACTIVE) {
            console.log("Maximum powerup limit reached, cannot spawn from drop.");
            return null;
        }

        if (!type) {
            type = getRandomPowerupType(); // Get a random type based on weights if not specified
        }
        if (!type) {
            console.warn("Could not determine powerup type to spawn from drop.");
            return null; // Invalid type or weights
        }

        // Determine who should actually add this to room state (designated spawner)
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        if (!peerIds.length || this.networkManager.getClientId() !== peerIds[0]) {
            // console.log(`Not designated spawner, skipping roomState update for dropped powerup ${type}`);
            // Still return an ID so the caller knows *a* powerup *should* have dropped,
            // even if this client isn't adding it to the room state.
            // The actual instance will be created via sync from the spawner's update.
            return `dropped-powerup-${type}`; // Placeholder ID
        }

        // If this *is* the designated spawner, add it to room state
        const newId = `powerup-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
        console.log(`Spawner ${this.networkManager.getClientId()} spawning powerup ${newId} (${type}) from drop at ${x.toFixed(0)},${y.toFixed(0)}`);

        this.networkManager.updateRoomState({
            activePowerups: {
                [newId]: {
                    type: type,
                    x: x,
                    y: y
                }
            }
        });
        return newId; // Return the actual ID created
    }
    // Keep old name for compatibility if needed
    spawnPowerup(x, y, type = null) {
        return this.spawnPowerupAt(x, y, type);
    }

    // Called when a local player picks up a powerup
    pickupPowerup(powerupId) {
        if (!this.activePowerups[powerupId]) {
            // console.warn(`Attempted to pick up non-existent or already removed powerup ${powerupId}`);
            return null;
        }

        const powerup = this.activePowerups[powerupId];
        console.log(`Local player picked up powerup ${powerup.id} (${powerup.type})`);

        // Trigger pickup effect BEFORE removing
        this.particleSystem?.emitPowerupPickup(powerup.x, powerup.y);

        // Mark for local removal immediately (visuals disappear)
        delete this.activePowerups[powerupId];

        // Trigger removal from roomState (will propagate to others)
        this.networkManager.updateRoomState({
            activePowerups: { // Ensure update is a new object for reactivity
                [powerupId]: null // Set to null to remove key from state
            }
        });
        console.log(`Powerup ${powerupId} removal requested via roomState.`);

        return powerup; // Return the picked-up powerup details
    }

    getActivePowerups() {
        // Return powerups suitable for collision detection/drawing
        return Object.values(this.activePowerups).filter(p => p && !p.isMarkedForRemoval);
    }

    update(deltaTime, gameWidth, gameHeight, groundLevelY) {
        const currentTime = performance.now(); // Get current time for spawning logic
        // Update local animations (like bobbing)
        for (const id in this.activePowerups) {
            this.activePowerups[id].update(deltaTime);
        }
        // Log active count periodically
        if (Math.random() < 0.01) {
            console.log(`[PowerupManager ${this.networkManager.getClientId()}] Update: Active Powerups Count = ${Object.keys(this.activePowerups).length}`);
        }
        
        this.attemptRandomSpawn(currentTime, gameWidth, gameHeight, groundLevelY);
    }

    draw(ctx) {
        for (const id in this.activePowerups) {
            this.activePowerups[id].draw(ctx, this.assets, this.renderScale);
        }
    }
}

export default PowerupManager;