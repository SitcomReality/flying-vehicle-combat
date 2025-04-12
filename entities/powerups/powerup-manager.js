// New file: Manages active powerups in the game world

import Powerup from './powerup.js';
import { PowerupType, POWERUP_SPAWN_CONFIG, getRandomPowerupType } from './powerup-types.js';

class PowerupManager {
    constructor(networkManager, assets, renderScale, particleSystem) {
        this.networkManager = networkManager;
        this.assets = assets; // Loaded sprite sheets
        this.renderScale = renderScale;
        this.particleSystem = particleSystem; // Store particle system reference
        this.activePowerups = {}; // Stores local Powerup instances { id: Powerup }
        this.lastSpawnAttemptTime = 0;
        this.isSpawner = false; // Flag to indicate if this client is the designated spawner

        this.networkManager.onPresenceUpdate(this._handlePresenceUpdate.bind(this));
        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate.bind(this));
        this._determineSpawner(); // Determine spawner initially
        this._initializeFromRoomState(); // Try to initialize immediately
    }

    _determineSpawner() {
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        const oldSpawnerStatus = this.isSpawner;
        this.isSpawner = peerIds.length > 0 && this.networkManager.getClientId() === peerIds[0];
        if (this.isSpawner !== oldSpawnerStatus) {
            // console.log(`[PowerupMgr] Spawner status changed to: ${this.isSpawner}`);
        }
    }

    _initializeFromRoomState() {
        const roomState = this.networkManager.getRoomState();
        if (roomState && roomState.activePowerups && Object.keys(roomState.activePowerups).length > 0) {
            console.log("Attempting immediate initialization of powerups from room state:", roomState.activePowerups);
            this._syncPowerups(roomState.activePowerups);
        } else {
             console.log("No initial powerups found in room state during immediate check.");
        }
    }

    // Track the current list of peers to determine the spawner
    _handlePresenceUpdate(presence) {
        // Re-determine spawner role on presence changes
        this._determineSpawner();
    }

    _handleRoomStateUpdate(roomState) {
        // Check if activePowerups exists in the update
        if (roomState.hasOwnProperty('activePowerups')) {
            const powerupData = roomState.activePowerups || {};
            this._syncPowerups(powerupData);
        }
    }

    _syncPowerups(powerupData) {
        const currentIds = Object.keys(this.activePowerups);
        const myClientId = this.networkManager.getClientId(); // Cache client ID
        const serverIds = Object.keys(powerupData);
        let changed = false;

        // Remove powerups explicitly marked as null in the network data
        for (const id of currentIds) {
            if (powerupData[id] === null) {
                if (this.activePowerups[id]) { // Ensure it exists before deleting
                    // console.log(`[PowerupMgr ${myClientId}] Removing powerup ${id} due to explicit null`);
                    delete this.activePowerups[id];
                    changed = true;
                }
            }
        }

        // Add/Update powerups based on roomState
        for (const id of serverIds) {
            const data = powerupData[id];
            // Skip null entries
            if (data === null) continue;

            if (!data || !data.type || typeof data.x !== 'number' || typeof data.y !== 'number') {
                console.warn(`Invalid data for powerup ${id} in roomState. Skipping.`);
                if(this.activePowerups[id]) delete this.activePowerups[id];
                changed = true;
                continue;
            }

            if (!this.activePowerups[id]) {
                // console.log(`[PowerupMgr ${myClientId}] Creating new powerup ${id} of type ${data.type} at (${data.x}, ${data.y})`);
                try {
                    const newPowerup = new Powerup(
                        id,
                        data.type,
                        data.x,
                        data.y,
                        POWERUP_SPAWN_CONFIG.RADIUS // Use configured radius
                    );
                    if (!newPowerup || !newPowerup.id) {
                         console.error(`[PowerupManager ${myClientId}] Sync: FAILED to create local powerup ${id}`);
                         continue;
                    }
                    this.activePowerups[id] = newPowerup;
                    changed = true;
                } catch (error) {
                     console.error(`[PowerupMgr ${myClientId}] Sync: Error creating local powerup ${id} of type ${data.type}:`, error);
                     continue;
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
                    changed = true;
                }
            }
        }

        // ADDED: Log active count after sync for debugging
        if (changed || Math.random() < 0.01) { // Log on change or occasionally
            // console.log(`[PowerupMgr ${myClientId}] Active powerups after sync: ${Object.keys(this.activePowerups).length}`);
        }
    }

    // Attempt to spawn a powerup periodically (only by designated spawner)
    attemptRandomSpawn(currentTime, gameWidth, gameHeight, groundLevelY) {
        // --- Spawner Check ---
        // Use the isSpawner flag instead of calculating each time
        if (!this.isSpawner) {
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
            // console.log(`Spawner ${this.networkManager.getClientId()} attempting to spawn powerup ${newId} (${type}) at ${x.toFixed(0)},${y.toFixed(0)}`);

            // Use dynamic key for update
             const updatePayload = {};
             updatePayload[newId] = {
                  type: type,
                  x: x,
                  y: y
             };

            // Spawner updates room state to add the new powerup
            this.networkManager.updateRoomState({
                activePowerups: updatePayload
            });

            // Spawner also adds locally immediately for responsiveness
            const newPowerup = new Powerup(
                newId, type, x, y, POWERUP_SPAWN_CONFIG.RADIUS
            );
            this.activePowerups[newId] = newPowerup;
            // console.log(`[PowerupMgr ${this.networkManager.getClientId()}] Locally added powerup ${newId} after spawning.`);
        }
    }

    // Spawns a powerup at a specific location (e.g., from object drop)
    spawnPowerupAt(x, y, type = null) {
        // Check limit before determining spawner role
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

        // Only the designated spawner adds this to room state
        if (!this.isSpawner) {
            // console.log(`[PowerupMgr] Non-spawner received spawnPowerupAt request for type ${type}. Ignoring state update.`);
            return `dropped-powerup-${type}`; // Placeholder ID
        }

        // If this *is* the designated spawner, add it to room state
        const newId = `powerup-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
        // console.log(`Spawner ${this.networkManager.getClientId()} spawning powerup ${newId} (${type}) from drop at ${x.toFixed(0)},${y.toFixed(0)}`);

        // Use dynamic key for update
        const updatePayload = {};
        updatePayload[newId] = {
             type: type,
             x: x,
             y: y
        };

        this.networkManager.updateRoomState({
            activePowerups: updatePayload
        });

        // Spawner adds locally immediately
        const newPowerup = new Powerup(
            newId, type, x, y, POWERUP_SPAWN_CONFIG.RADIUS
        );
        this.activePowerups[newId] = newPowerup;
        // console.log(`[PowerupMgr ${this.networkManager.getClientId()}] Locally added powerup ${newId} after spawning from drop.`);

        return newId; // Return the actual ID created
    }
    // Keep old name for compatibility if needed
    spawnPowerup(x, y, type = null) {
        return this.spawnPowerupAt(x, y, type);
    }

    // Called when a local player picks up a powerup (via Collision Manager)
    pickupPowerup(powerupId) {
        if (!this.activePowerups[powerupId]) {
            // This can happen if two clients collide in the same frame and both send removal
            // console.warn(`[PowerupMgr] Attempted to pick up non-existent or already removed powerup ${powerupId}`);
            return null;
        }

        const powerup = this.activePowerups[powerupId];
        console.log(`[PowerupMgr ${this.networkManager.getClientId()}] Local player picked up powerup ${powerup.id} (${powerup.type})`);

        // Trigger pickup effect BEFORE removing
        this.particleSystem?.emitPowerupPickup(powerup.x, powerup.y);

        // Remove locally immediately (visuals disappear)
        delete this.activePowerups[powerupId];

        // Use dynamic key for removal
        const removalPayload = {};
        removalPayload[powerupId] = null;

        // Trigger removal from roomState (will propagate to others)
        console.log(`[PowerupMgr ${this.networkManager.getClientId()}] Sending removal update for powerup ${powerupId}`);
        this.networkManager.updateRoomState({
            activePowerups: removalPayload
        });

        return powerup; // Return the picked-up powerup details for applying effect
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

        // Only spawner attempts random spawns
        if (this.isSpawner) {
            this.attemptRandomSpawn(currentTime, gameWidth, gameHeight, groundLevelY);
        }
    }

    draw(ctx) {
        for (const id in this.activePowerups) {
            // Only draw if the powerup still exists locally
             if (this.activePowerups[id]) {
                this.activePowerups[id].draw(ctx, this.assets, this.renderScale);
             }
        }
    }
}

export default PowerupManager;