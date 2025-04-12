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

        // Bind handlers *before* potentially calling them in _initializeFromRoomState
        this._handlePresenceUpdate = this._handlePresenceUpdate.bind(this);
        this._handleRoomStateUpdate = this._handleRoomStateUpdate.bind(this);

        // Subscribe to network events
        this.networkManager.onPresenceUpdate(this._handlePresenceUpdate);
        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate);

        this._determineSpawner(); // Determine spawner initially
        this._initializeFromRoomState(); // Try to initialize immediately
    }

    _determineSpawner() {
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        const oldSpawnerStatus = this.isSpawner;
        this.isSpawner = peerIds.length > 0 && this.networkManager.getClientId() === peerIds[0];
        if (this.isSpawner !== oldSpawnerStatus) {
        }
    }

    _initializeFromRoomState() {
        const roomState = this.networkManager.getRoomState();
        if (roomState && roomState.activePowerups && Object.keys(roomState.activePowerups).length > 0) {
            this._syncPowerups(roomState.activePowerups);
        } else {
        }
    }

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
        const currentLocalIds = Object.keys(this.activePowerups);
        const myClientId = this.networkManager.getClientId(); // Cache client ID
        const serverIds = Object.keys(powerupData);
        let changed = false;
        const currentServerIds = new Set(serverIds.filter(id => powerupData[id] !== null)); // IDs present in the network state
        const now = performance.now(); // Timestamp for updates

        // --- Step 1: Remove local powerups that are explicitly null or no longer in the server state ---
        for (const localId of currentLocalIds) {
            // Remove if explicitly null OR if it's missing entirely from the server data
            if (powerupData[localId] === null || !currentServerIds.has(localId)) {
                if (this.activePowerups[localId]) { // Ensure it exists locally before deleting
                    // Don't delete if we are the spawner and just created it (network echo might be delayed)
                    // Check if the local powerup's creation time is very recent.
                    const timeSinceCreation = now - (this.activePowerups[localId].creationTime || 0);
                    if (this.isSpawner && timeSinceCreation < 500) { // 500ms grace period for spawner's local creation
                        continue;
                    }

                    delete this.activePowerups[localId];
                    changed = true;
                }
            }
        }

        // --- Step 2: Add/Update powerups based on server data ---
        for (const id of serverIds) {
            const data = powerupData[id];
            // Skip null entries (removal handled above)
            if (data === null) continue;

            // Basic validation of network data
            if (!data || !data.type || typeof data.x !== 'number' || typeof data.y !== 'number') {
                console.warn(`[PowerupMgr ${myClientId}] Sync: Invalid data for powerup ${id} in roomState. Skipping. Data:`, data);
                 if(this.activePowerups[id]) {
                     console.warn(`[PowerupMgr ${myClientId}] Sync: Local powerup ${id} exists but received invalid server data.`);
                 }
                continue;
            }

            // Add new powerup if it doesn't exist locally
            if (!this.activePowerups[id]) {
                try {
                    const newPowerup = new Powerup(
                        id,
                        data.type,
                        data.x,
                        data.y,
                        POWERUP_SPAWN_CONFIG.RADIUS // Use configured radius
                    );
                    if (!newPowerup || !newPowerup.id) {
                         console.error(`[PowerupMgr ${myClientId}] Sync: FAILED to create local powerup ${id}`);
                         continue;
                    }
                    // --- Initialize server state immediately on creation ---
                    newPowerup.serverX = data.x;
                    newPowerup.serverY = data.y;
                    newPowerup.lastServerUpdateTime = now;
                    this.activePowerups[id] = newPowerup;
                    changed = true;
                } catch (error) {
                     console.error(`[PowerupMgr ${myClientId}] Sync: Error creating local powerup ${id} of type ${data.type}:`, error);
                     continue;
                }
            } else {
                // Update existing powerup's server state for interpolation
                const localPowerup = this.activePowerups[id];
                localPowerup.serverX = data.x;
                localPowerup.serverY = data.y;
                localPowerup.lastServerUpdateTime = now;

                if (localPowerup.type !== data.type) {
                    console.warn(`[PowerupMgr ${myClientId}] Sync: Powerup ${id} changed type from ${localPowerup.type} to ${data.type}. Updating.`);
                    localPowerup.type = data.type;
                    localPowerup.spriteFrame = getPowerupSpriteFrame(data.type); // Update sprite frame
                    changed = true;
                }
                 // No need to set changed = true just for position update, as interpolation handles it.
            }
        }

        // Log active count after sync for debugging
        if (changed || Math.random() < 0.05) { // Log on change or occasionally
        }
    }

    // Attempt to spawn a powerup periodically (only by designated spawner)
    attemptRandomSpawn(currentTime, gameWidth, gameHeight, groundLevelY) {
        if (!this.isSpawner) {
            return;
        }

        const numActive = Object.keys(this.activePowerups).length;
        if (numActive >= POWERUP_SPAWN_CONFIG.MAX_ACTIVE) {
            return;
        }

        if (currentTime - this.lastSpawnAttemptTime > POWERUP_SPAWN_CONFIG.INTERVAL) {
            this.lastSpawnAttemptTime = currentTime;

            if (Math.random() > POWERUP_SPAWN_CONFIG.SPAWN_CHANCE_PER_INTERVAL) {
                return;
            }

            const type = getRandomPowerupType();
            if (!type) {
                return;
            }

            const padding = POWERUP_SPAWN_CONFIG.RADIUS * 2; // Use radius for padding
            const spawnableHeight = Math.max(0, groundLevelY - padding * 2);
            const x = Math.random() * (gameWidth - padding * 2) + padding;
            const y = Math.random() * spawnableHeight + padding;

            const newId = `powerup-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
            const creationTime = performance.now(); // Record creation time for spawner grace period

             const updatePayload = {};
             updatePayload[newId] = {
                  type: type,
                  x: x, // Spawner sets initial position
                  y: y
             };

            this.networkManager.updateRoomState({
                activePowerups: updatePayload
            });

            // Spawner also adds locally immediately for responsiveness
            const newPowerup = new Powerup(
                newId, type, x, y, POWERUP_SPAWN_CONFIG.RADIUS
            );
            newPowerup.creationTime = creationTime; // Store creation time locally
            // Initialize server state for local object
            newPowerup.serverX = x;
            newPowerup.serverY = y;
            newPowerup.lastServerUpdateTime = creationTime;
            this.activePowerups[newId] = newPowerup;
        }
    }

    // Spawns a powerup at a specific location (e.g., from object drop)
    spawnPowerupAt(x, y, type = null) {
        const numActive = Object.keys(this.activePowerups).length;
        if (numActive >= POWERUP_SPAWN_CONFIG.MAX_ACTIVE) {
            return null;
        }

        if (!type) {
            type = getRandomPowerupType(); // Get a random type based on weights if not specified
        }
        if (!type) {
            console.warn("[PowerupMgr] Could not determine powerup type to spawn from drop.");
            return null; // Invalid type or weights
        }

        // Only the designated spawner adds this to room state
        if (!this.isSpawner) {
            return `ignored-drop-${type}`; // Placeholder ID, indicates non-spawner ignore
        }

        // If this *is* the designated spawner, add it to room state
        const newId = `powerup-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
        const creationTime = performance.now(); // Record creation time

        const updatePayload = {};
        updatePayload[newId] = {
             type: type,
             x: x, // Spawner sets initial position
             y: y
        };

        this.networkManager.updateRoomState({
            activePowerups: updatePayload
        });

        // Spawner adds locally immediately
        const newPowerup = new Powerup(
            newId, type, x, y, POWERUP_SPAWN_CONFIG.RADIUS
        );
        newPowerup.creationTime = creationTime; // Store creation time locally
        // Initialize server state for local object
        newPowerup.serverX = x;
        newPowerup.serverY = y;
        newPowerup.lastServerUpdateTime = creationTime;
        this.activePowerups[newId] = newPowerup;

        return newId; // Return the actual ID created
    }
    // Keep old name for compatibility if needed
    spawnPowerup(x, y, type = null) {
        return this.spawnPowerupAt(x, y, type);
    }

    // Called when a local player picks up a powerup (via Collision Manager)
    pickupPowerup(powerupId) {
        if (!this.activePowerups[powerupId]) {
            return null;
        }

        const powerup = this.activePowerups[powerupId];

        // Trigger pickup effect BEFORE removing
        this.particleSystem?.emitPowerupPickup(powerup.x, powerup.y);

        // Remove locally immediately (visuals disappear)
        delete this.activePowerups[powerupId];

        // --- Send removal update to roomState ---
        const removalPayload = {};
        removalPayload[powerupId] = null;

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

        for (const id in this.activePowerups) {
             const powerup = this.activePowerups[id];
             if (!powerup) continue; // Was removed mid-iteration

             // --- Apply Interpolation for non-spawners ---
             if (!this.isSpawner) {
                 powerup.interpolateState();
             } else {
                 // Spawner updates its own server state representation
                 powerup.serverX = powerup.x;
                 powerup.serverY = powerup.y;
                 powerup.lastServerUpdateTime = currentTime;
                 // Spawner doesn't need to send position updates unless powerups move dynamically
             }

            powerup.update(deltaTime); // Apply bobbing effect

            // NOTE: Lifespan/removal logic is handled by sync from spawner now
        }

        // Only spawner attempts random spawns
        if (this.isSpawner) {
            this.attemptRandomSpawn(currentTime, gameWidth, gameHeight, groundLevelY);
        }
    }

    draw(ctx) {
        for (const id in this.activePowerups) {
             if (this.activePowerups[id]) { // Check it still exists locally
                this.activePowerups[id].draw(ctx, this.assets, this.renderScale);
             }
        }
    }
}

export default PowerupManager;