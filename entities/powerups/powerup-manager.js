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
             console.log(`[PowerupMgr] Spawner status changed to: ${this.isSpawner}`);
        }
    }

    _initializeFromRoomState() {
        const roomState = this.networkManager.getRoomState();
        if (roomState && roomState.activePowerups && Object.keys(roomState.activePowerups).length > 0) {
            console.log("[PowerupMgr] Attempting immediate initialization of powerups from room state:", JSON.stringify(Object.keys(roomState.activePowerups)));
            this._syncPowerups(roomState.activePowerups);
        } else {
             console.log("[PowerupMgr] No initial powerups found in room state during immediate check.");
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
            console.log(`[PowerupMgr ${this.networkManager.getClientId()}] Received room state update for powerups. Syncing...`);
            this._syncPowerups(powerupData);
        }
    }

    _syncPowerups(powerupData) {
        const currentLocalIds = Object.keys(this.activePowerups);
        const myClientId = this.networkManager.getClientId(); // Cache client ID
        const serverIds = Object.keys(powerupData);
        let changed = false;
        const currentServerIds = new Set(serverIds.filter(id => powerupData[id] !== null)); // IDs present in the network state

        // --- Step 1: Remove local powerups that are explicitly null or no longer in the server state ---
        for (const localId of currentLocalIds) {
            // Remove if explicitly null OR if it's missing entirely from the server data (and wasn't just created locally by spawner)
            if (powerupData[localId] === null || !currentServerIds.has(localId)) {
                if (this.activePowerups[localId]) { // Ensure it exists locally before deleting
                    // Don't delete if we are the spawner and just created it (network echo might be delayed)
                    // A simple time check might work, or a dedicated flag. Let's use a time check for now.
                    const timeSinceCreation = performance.now() - (this.activePowerups[localId].creationTime || 0);
                    if (this.isSpawner && timeSinceCreation < 500) { // 500ms grace period for spawner's local creation
                        console.log(`[PowerupMgr ${myClientId}] Spawner: Skipping removal of recently created powerup ${localId} during sync.`);
                        continue;
                    }

                    console.log(`[PowerupMgr ${myClientId}] Sync: Removing local powerup ${localId}. Reason: ${powerupData[localId] === null ? 'Explicitly null' : 'Not in server state'}`);
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
                 if(this.activePowerups[id]) { // If invalid data received for existing, remove local? Risky. Log instead.
                     console.warn(`[PowerupMgr ${myClientId}] Sync: Local powerup ${id} exists but received invalid server data.`);
                 }
                continue;
            }

            // Add new powerup if it doesn't exist locally
            if (!this.activePowerups[id]) {
                console.log(`[PowerupMgr ${myClientId}] Sync: Creating new local powerup ${id} of type ${data.type} at (${data.x.toFixed(0)}, ${data.y.toFixed(0)})`);
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
                    this.activePowerups[id] = newPowerup;
                    changed = true;
                } catch (error) {
                     console.error(`[PowerupMgr ${myClientId}] Sync: Error creating local powerup ${id} of type ${data.type}:`, error);
                     continue;
                }
            } else {
                // Update existing powerup's position (type shouldn't normally change)
                const localPowerup = this.activePowerups[id];
                if (localPowerup.x !== data.x || localPowerup.y !== data.y) {
                     localPowerup.x = data.x;
                     localPowerup.y = data.y;
                     changed = true; // Position changed
                     // console.log(`[PowerupMgr ${myClientId}] Sync: Updated position for powerup ${id} to (${data.x.toFixed(0)}, ${data.y.toFixed(0)})`);
                }
                if (localPowerup.type !== data.type) {
                    console.warn(`[PowerupMgr ${myClientId}] Sync: Powerup ${id} changed type from ${localPowerup.type} to ${data.type}. Updating.`);
                    localPowerup.type = data.type;
                    // localPowerup.spriteFrame = getPowerupSpriteFrame(data.type); // Update sprite frame (Assumed getPowerupSpriteFrame is defined elsewhere)
                    changed = true;
                }
            }
        }

        // Log active count after sync for debugging
        if (changed || Math.random() < 0.05) { // Log on change or occasionally
             console.log(`[PowerupMgr ${myClientId}] Active powerups after sync: ${Object.keys(this.activePowerups).length}. Server state had: ${currentServerIds.size}`);
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
                console.log("[PowerupMgr Spawner] Attempted random spawn, but no powerup type selected (check weights).");
                return;
            }

            const padding = POWERUP_SPAWN_CONFIG.RADIUS * 2; // Use radius for padding
            const spawnableHeight = Math.max(0, groundLevelY - padding * 2);
            const x = Math.random() * (gameWidth - padding * 2) + padding;
            const y = Math.random() * spawnableHeight + padding;

            const newId = `powerup-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
            const creationTime = performance.now(); // Record creation time for spawner grace period
            console.log(`[PowerupMgr Spawner ${this.networkManager.getClientId()}] Spawning RAND powerup ${newId} (${type}) at ${x.toFixed(0)},${y.toFixed(0)}`);

             const updatePayload = {};
             updatePayload[newId] = {
                  type: type,
                  x: x,
                  y: y
                  // No need to send creationTime, state holds it
             };

            this.networkManager.updateRoomState({
                activePowerups: updatePayload
            });

            // Spawner also adds locally immediately for responsiveness
            const newPowerup = new Powerup(
                newId, type, x, y, POWERUP_SPAWN_CONFIG.RADIUS
            );
            newPowerup.creationTime = creationTime; // Store creation time locally
            this.activePowerups[newId] = newPowerup;
            console.log(`[PowerupMgr Spawner ${this.networkManager.getClientId()}] Locally added powerup ${newId}.`);
        }
    }

    // Spawns a powerup at a specific location (e.g., from object drop)
    spawnPowerupAt(x, y, type = null) {
        const numActive = Object.keys(this.activePowerups).length;
        if (numActive >= POWERUP_SPAWN_CONFIG.MAX_ACTIVE) {
            console.log("[PowerupMgr] Maximum powerup limit reached, cannot spawn from drop.");
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
            console.log(`[PowerupMgr Non-Spawner] Received spawnPowerupAt request for type ${type}. Ignoring state update.`);
            return `ignored-drop-${type}`; // Placeholder ID, indicates non-spawner ignore
        }

        // If this *is* the designated spawner, add it to room state
        const newId = `powerup-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
        const creationTime = performance.now(); // Record creation time
        console.log(`[PowerupMgr Spawner ${this.networkManager.getClientId()}] Spawning DROP powerup ${newId} (${type}) from drop at ${x.toFixed(0)},${y.toFixed(0)}`);

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
        newPowerup.creationTime = creationTime; // Store creation time locally
        this.activePowerups[newId] = newPowerup;
        console.log(`[PowerupMgr Spawner ${this.networkManager.getClientId()}] Locally added powerup ${newId} from drop.`);

        return newId; // Return the actual ID created
    }
    // Keep old name for compatibility if needed
    spawnPowerup(x, y, type = null) {
        return this.spawnPowerupAt(x, y, type);
    }

    // Called when a local player picks up a powerup (via Collision Manager)
    pickupPowerup(powerupId) {
        if (!this.activePowerups[powerupId]) {
            console.warn(`[PowerupMgr ${this.networkManager.getClientId()}] Attempted to pick up non-existent or already removed powerup ${powerupId}`);
            return null;
        }

        const powerup = this.activePowerups[powerupId];
        console.log(`[PowerupMgr ${this.networkManager.getClientId()}] Local player picked up powerup ${powerup.id} (${powerup.type})`);

        // Trigger pickup effect BEFORE removing
        this.particleSystem?.emitPowerupPickup(powerup.x, powerup.y);

        // Remove locally immediately (visuals disappear)
        delete this.activePowerups[powerupId];

        // --- Send removal update to roomState ---
        // This client claims the pickup by setting the powerup's entry to null in the room state.
        // The sync logic on other clients will see this null and remove their local copy.
        const removalPayload = {};
        removalPayload[powerupId] = null;

        console.log(`[PowerupMgr ${this.networkManager.getClientId()}] Sending removal update (null) for powerup ${powerupId}`);
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
             // Defensive check in case it was removed during sync/pickup within the same frame
             if (this.activePowerups[id]) {
                this.activePowerups[id].update(deltaTime);
             }
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