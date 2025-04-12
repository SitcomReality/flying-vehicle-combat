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
            // --- Enhanced Logging ---
            console.log(`[PowerupMgr ${this.networkManager?.getClientId()}] Spawner status changed. I am ${this.isSpawner ? 'NOW' : 'NO LONGER'} the spawner. Peer IDs: [${peerIds.join(', ')}]`);
            // --- End Logging ---
        }
    }

    _handlePresenceUpdate(presence) {
        this._determineSpawner(); // Re-determine spawner role immediately
    }

    _handleRoomStateUpdate(roomState) {
        if (roomState.hasOwnProperty('activePowerups')) {
            const powerupData = roomState.activePowerups || {};
            // --- Add log before sync ---
            // console.log(`[PowerupMgr ${this.networkManager?.getClientId()}] Received room state update. Syncing ${Object.keys(powerupData).length} powerups.`);
            // --- End log ---
            this._syncPowerups(powerupData);
        }
    }

    _initializeFromRoomState() {
        const roomState = this.networkManager.getRoomState();
        if (roomState && roomState.activePowerups && Object.keys(roomState.activePowerups).length > 0) {
            this._syncPowerups(roomState.activePowerups);
        } else {
        }
    }

    _syncPowerups(powerupData) {
        const currentLocalIds = Object.keys(this.activePowerups);
        const myClientId = this.networkManager.getClientId();
        const serverIds = Object.keys(powerupData);
        let changed = false;
        const currentServerIds = new Set(serverIds.filter(id => powerupData[id] !== null));
        const now = performance.now();

        // --- Step 1: Remove local powerups explicitly null or missing ---
        for (const localId of currentLocalIds) {
            if (powerupData[localId] === null || !currentServerIds.has(localId)) {
                if (this.activePowerups[localId]) {
                    const timeSinceCreation = now - (this.activePowerups[localId].creationTime || 0);
                    if (this.isSpawner && timeSinceCreation < 500) {
                        // console.log(`[PowerupMgr ${myClientId}] Sync: Skipping removal of recently spawned local powerup ${localId}`);
                        continue;
                    }
                    // --- Add log on removal ---
                    console.log(`[PowerupMgr ${myClientId}] Sync: Removing local powerup ${localId} (Reason: ${powerupData[localId] === null ? 'explicitly null' : 'missing from server'})`);
                    // --- End log ---
                    delete this.activePowerups[localId];
                    changed = true;
                }
            }
        }

        // --- Step 2: Add/Update powerups from server data ---
        for (const id of serverIds) {
            const data = powerupData[id];
            if (data === null) continue;

            if (!data || !data.type || typeof data.x !== 'number' || typeof data.y !== 'number') {
                console.warn(`[PowerupMgr ${myClientId}] Sync: Invalid data for powerup ${id}. Skipping. Data:`, data);
                continue;
            }

            if (!this.activePowerups[id]) {
                // --- Add log on creation ---
                console.log(`[PowerupMgr ${myClientId}] Sync: Creating new local powerup ${id} of type ${data.type}`);
                // --- End log ---
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
            }
        }

        // --- Log active count after sync ---
        if (changed || Math.random() < 0.05) {
            // console.log(`[PowerupMgr ${myClientId}] Active powerups after sync: ${Object.keys(this.activePowerups).length}`);
        }
    }

    attemptRandomSpawn(currentTime, gameWidth, gameHeight, groundLevelY) {
        // --- Added logging ---
        if (!this.isSpawner) {
            if (Math.random() < 0.05) { // Log occasionally
                console.log(`[PowerupMgr ${this.networkManager?.getClientId()}] Not the spawner. Skipping random spawn check.`);
            }
            return;
        }
        console.log(`[PowerupMgr ${this.networkManager?.getClientId()}] SPAWNER checking random spawn conditions.`);
        // --- End Logging ---

        const numActive = Object.keys(this.activePowerups).length;
        if (numActive >= POWERUP_SPAWN_CONFIG.MAX_ACTIVE) {
            console.log(`[PowerupMgr ${this.networkManager?.getClientId()}] SPAWNER: Max powerups reached (${numActive}). Skipping spawn.`);
            return;
        }

        if (currentTime - this.lastSpawnAttemptTime > POWERUP_SPAWN_CONFIG.INTERVAL) {
            this.lastSpawnAttemptTime = currentTime;
            if (Math.random() > POWERUP_SPAWN_CONFIG.SPAWN_CHANCE_PER_INTERVAL) {
                console.log(`[PowerupMgr ${this.networkManager?.getClientId()}] SPAWNER: Random spawn chance failed.`);
                return;
            }
            const type = getRandomPowerupType();
            if (!type) return;
            const padding = POWERUP_SPAWN_CONFIG.RADIUS * 2; // Use radius for padding
            const spawnableHeight = Math.max(0, groundLevelY - padding * 2);
            const x = Math.random() * (gameWidth - padding * 2) + padding;
            const y = Math.random() * spawnableHeight + padding;
            const newId = `powerup-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
            // --- Log the specific spawn ---
            console.log(`[PowerupMgr ${this.networkManager?.getClientId()}] SPAWNER randomly spawning ${type} (${newId})`);
            // --- End Log ---
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

    spawnPowerupAt(x, y, type = null) {
        const numActive = Object.keys(this.activePowerups).length;
        if (numActive >= POWERUP_SPAWN_CONFIG.MAX_ACTIVE) {
            console.log(`[PowerupMgr ${this.networkManager?.getClientId()}] Max powerups reached (${numActive}). Skipping drop spawn.`);
            return null;
        }
        if (!type) {
            type = getRandomPowerupType(); // Get a random type based on weights if not specified
        }
        if (!type) {
            console.warn("[PowerupMgr] Could not determine powerup type to spawn from drop.");
            return null; // Invalid type or weights
        }
        // --- Add logging ---
        if (!this.isSpawner) {
            console.log(`[PowerupMgr ${this.networkManager?.getClientId()}] Not spawner, ignoring powerup drop spawn request for type ${type}.`);
            return `ignored-drop-${type}`;
        }
        console.log(`[PowerupMgr ${this.networkManager?.getClientId()}] SPAWNER spawning dropped powerup ${type} at (${x.toFixed(0)},${y.toFixed(0)})`);
        // --- End logging ---
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

    pickupPowerup(powerupId) {
        if (!this.activePowerups[powerupId]) {
            // console.warn(`[PowerupMgr ${this.networkManager?.getClientId()}] Attempted to pick up non-existent powerup ${powerupId}`);
            return null;
        }
        const powerup = this.activePowerups[powerupId];
        // --- Add logging ---
        console.log(`[PowerupMgr ${this.networkManager?.getClientId()}] Local player picked up powerup ${powerup.id} (${powerup.type}). Sending removal update.`);
        // --- End logging ---
        this.particleSystem?.emitPowerupPickup(powerup.x, powerup.y);
        delete this.activePowerups[powerupId];
        const removalPayload = {};
        removalPayload[powerupId] = null;
        this.networkManager.updateRoomState({
            activePowerups: removalPayload
        });
        return powerup;
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