// New file: Manages active powerups in the game world

import Powerup from './powerup.js';
import { PowerupType, POWERUP_SPAWN_CONFIG, getRandomPowerupType, getPowerupSpriteFrame } from './powerup-types.js';

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
        this._handleMessage = this._handleMessage.bind(this); // Bind message handler

        // Subscribe to network events
        this.networkManager.onPresenceUpdate(this._handlePresenceUpdate);
        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate);
        this.networkManager.onMessage(this._handleMessage); // Listen for custom messages

        this._determineSpawner(); // Determine spawner initially
        this._initializeFromRoomState(); // Try to initialize immediately
    }

    _determineSpawner() {
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        const oldSpawnerStatus = this.isSpawner;
        this.isSpawner = peerIds.length > 0 && this.networkManager.getClientId() === peerIds[0];
        if (this.isSpawner !== oldSpawnerStatus) {
            console.log(`[PowerupMgr ${this.networkManager?.getClientId()}] Spawner status changed. I am ${this.isSpawner ? 'NOW' : 'NO LONGER'} the spawner.`);
        }
    }

    _handlePresenceUpdate(presence) {
        this._determineSpawner(); // Re-determine spawner role immediately
    }

    _handleRoomStateUpdate(roomState) {
        if (roomState.hasOwnProperty('activePowerups')) {
            const powerupData = roomState.activePowerups || {};
            // Only log if there's actual data to avoid console spam
            // if (Object.keys(powerupData).length > 0 || Object.values(powerupData).some(v => v === null)) {
            //     console.log(`[PowerupMgr ${this.networkManager.getClientId()}] Received room state update with ${Object.keys(powerupData).length} active powerup entries.`);
            // }
            this._syncPowerups(powerupData);
        }
    }

    // Handle incoming custom messages (like pickup requests)
    _handleMessage(event) {
        const data = event; // Data is the whole event object
        if (data.type === 'requestPowerupPickup' && this.isSpawner) {
            const { powerupId, clientId } = data; // clientId is the player requesting pickup
             console.log(`[PowerupMgr Spawner] Received pickup request for ${powerupId} from ${clientId}`);
             this._handlePickupRequest(powerupId, clientId);
        }
    }

    // --- Spawner Only ---
    // Handles a pickup request received via network event
    _handlePickupRequest(powerupId, requestingClientId) {
        if (!this.isSpawner) return; // Should already be checked, but safety first

        const powerup = this.activePowerups[powerupId];

        // Check if the powerup still exists locally (and presumably in roomState)
        if (powerup) {
             console.log(`[PowerupMgr Spawner] Granting pickup request for ${powerupId} from ${requestingClientId}.`);
            // Perform the removal logic (removes locally, updates roomState)
            this._performPickup(powerupId);
            // Note: The requesting client applies the effect locally based on collision.
            // No confirmation needed back, removal happens via roomState sync.
        } else {
            console.log(`[PowerupMgr Spawner] Denying pickup request for ${powerupId} from ${requestingClientId} - powerup already gone.`);
        }
    }

    _initializeFromRoomState() {
        const roomState = this.networkManager.getRoomState();
        if (roomState && roomState.activePowerups) {
            console.log(`[PowerupMgr] Initializing from room state with ${Object.keys(roomState.activePowerups).length} powerups.`);
            this._syncPowerups(roomState.activePowerups);
        }
    }

    // --- Sync Logic (Handles Room State Updates) ---
    _syncPowerups(powerupData) {
        if (!powerupData) return;

        const myClientId = this.networkManager.getClientId();
        const currentIds = new Set(Object.keys(this.activePowerups));
        const serverIds = new Set(Object.keys(powerupData).filter(id => powerupData[id] !== null));
        const now = performance.now();
        let changed = false;

        // Step 1: Remove local powerups that are explicitly null in server data
        for (const id of Object.keys(powerupData)) {
            if (powerupData[id] === null && this.activePowerups[id]) {
                console.log(`[PowerupMgr ${myClientId}] Removing powerup ${id} due to server null`);
                delete this.activePowerups[id];
                currentIds.delete(id); // Update current local IDs
                changed = true;
            }
        }

        // Step 2: Remove local powerups that are no longer in the server data (weren't explicitly nulled, but gone)
        for (const localId of currentIds) {
             if (!serverIds.has(localId)) {
                 // Check if it's a *very* recent local spawn by the spawner (give network time)
                 const timeSinceCreation = now - (this.activePowerups[localId]?.creationTime || 0);
                 if (this.isSpawner && timeSinceCreation < 500) { // Short grace period (500ms)
                     // console.log(`[PowerupMgr ${myClientId}] Keeping recent local spawn ${localId} for a moment...`);
                     continue;
                 }

                 console.log(`[PowerupMgr ${myClientId}] Removing local powerup ${localId} - not in server data.`);
                 delete this.activePowerups[localId];
                 changed = true;
             }
        }


        // Step 3: Add or update powerups from server data
        for (const id of serverIds) {
            const data = powerupData[id];
            if (!data) continue; // Should not happen due to filter, but safe check

            if (!data.type || typeof data.x !== 'number' || typeof data.y !== 'number') {
                console.warn(`[PowerupMgr ${myClientId}] Invalid powerup data for ID ${id}:`, data);
                continue;
            }

            if (!this.activePowerups[id]) {
                // Create new powerup
                try {
                    // console.log(`[PowerupMgr ${myClientId}] Creating new powerup: ${id} of type ${data.type}`);
                    const newPowerup = new Powerup(
                        id, data.type, data.x, data.y, POWERUP_SPAWN_CONFIG.RADIUS
                    );

                    // Initialize interpolation state correctly
                    newPowerup.serverX = data.x;
                    newPowerup.serverY = data.y;
                    newPowerup.lastServerUpdateTime = data.creationTime || now; // Use server creation time if available
                    newPowerup.creationTime = data.creationTime || now; // Use server creation time if available

                    this.activePowerups[id] = newPowerup;
                    changed = true;

                } catch (error) {
                    console.error(`[PowerupMgr ${myClientId}] Error creating powerup ${id}:`, error);
                }
            } else {
                // Update existing powerup
                const powerup = this.activePowerups[id];

                // Update server state for interpolation
                if (powerup.serverX !== data.x || powerup.serverY !== data.y) {
                    powerup.serverX = data.x;
                    powerup.serverY = data.y;
                    powerup.lastServerUpdateTime = now;
                    changed = true; // Position change detected
                }


                // If type somehow changed (unlikely for powerups)
                if (powerup.type !== data.type) {
                    console.warn(`[PowerupMgr ${myClientId}] Powerup ${id} changed type from ${powerup.type} to ${data.type}`);
                    powerup.type = data.type;
                    powerup.spriteFrame = getPowerupSpriteFrame(data.type);
                    changed = true;
                }
            }
        }

        // Log sync completion occasionally
        if (changed && Math.random() < 0.1) { // Log only if changed and randomly
            // console.log(`[PowerupMgr ${myClientId}] After sync: ${Object.keys(this.activePowerups).length} active powerups`);
        }
    }


    // --- Spawning Logic (Spawner Only) ---
    attemptRandomSpawn(currentTime, gameWidth, gameHeight, groundLevelY) {
        if (!this.isSpawner) return; // Only spawner executes this

        const numActive = Object.keys(this.activePowerups).length;
        if (numActive >= POWERUP_SPAWN_CONFIG.MAX_ACTIVE) return;

        if (currentTime - this.lastSpawnAttemptTime > POWERUP_SPAWN_CONFIG.INTERVAL) {
            this.lastSpawnAttemptTime = currentTime;
            if (Math.random() > POWERUP_SPAWN_CONFIG.SPAWN_CHANCE_PER_INTERVAL) return;

            const type = getRandomPowerupType();
            if (!type) return;

            const padding = POWERUP_SPAWN_CONFIG.RADIUS * 2;
            const spawnableHeight = Math.max(0, groundLevelY - padding * 2);
            const x = Math.random() * (gameWidth - padding * 2) + padding;
            const y = Math.random() * spawnableHeight + padding;

            this._spawnPowerupInternal(type, x, y, currentTime);
        }
    }

    spawnPowerupAt(x, y, type = null) {
         // Called by drop system - only spawner should actually spawn
        if (!this.isSpawner) {
             console.log(`[PowerupMgr ${this.networkManager.getClientId()}] Non-spawner received spawn request. Ignoring.`);
            return null;
        }

        const numActive = Object.keys(this.activePowerups).length;
        if (numActive >= POWERUP_SPAWN_CONFIG.MAX_ACTIVE) {
            console.log(`[PowerupMgr Spawner] Max powerups reached (${numActive}), skipping spawn.`);
            return null;
        }

        if (!type) {
            type = getRandomPowerupType();
            if (!type) return null; // Failed to get type
        }

        return this._spawnPowerupInternal(type, x, y, performance.now());
    }

    // Internal helper for spawning (only called by spawner)
    _spawnPowerupInternal(type, x, y, creationTime) {
        const newId = `powerup-${creationTime}-${Math.floor(Math.random() * 1000000)}`;
        console.log(`[PowerupMgr Spawner] Creating powerup ${type} (${newId}) at (${x.toFixed(0)},${y.toFixed(0)})`);

        // Create local instance first
        const newPowerup = new Powerup(
            newId, type, x, y, POWERUP_SPAWN_CONFIG.RADIUS
        );
        newPowerup.creationTime = creationTime; // Store creation time
        newPowerup.serverX = x; // Initialize server state
        newPowerup.serverY = y;
        newPowerup.lastServerUpdateTime = creationTime;
        this.activePowerups[newId] = newPowerup;


        // Update room state
        const updatePayload = {};
        updatePayload[newId] = {
            type: type,
            x: x,
            y: y,
            creationTime: creationTime // Sync creation time
        };
        this.networkManager.updateRoomState({
            activePowerups: updatePayload
        });

        return newId; // Return the ID
    }


    // --- Pickup Logic ---

    /**
     * Initiates the pickup process for a powerup when the local player collides with it.
     * If the local player is the spawner, it removes directly.
     * If not, it sends a request to the spawner.
     * @param {string} powerupId - The ID of the powerup to pick up.
     * @param {string} localPlayerId - The ID of the local player attempting the pickup.
     * @returns {Powerup | null} - The powerup object if pickup is initiated locally, null otherwise.
     */
    initiatePickup(powerupId, localPlayerId) {
         if (!this.activePowerups[powerupId]) {
             console.warn(`[PowerupMgr ${localPlayerId}] Initiate pickup failed - powerup ${powerupId} not found locally.`);
             return null;
         }

         const powerup = this.activePowerups[powerupId];
         console.log(`[PowerupMgr ${localPlayerId}] Initiating pickup for ${powerupId} (${powerup.type})`);

         // Create local visual effect immediately
         this.particleSystem?.emitPowerupPickup(powerup.x, powerup.y);

         if (this.isSpawner) {
              console.log(`   -> Spawner handling pickup directly.`);
             this._performPickup(powerupId);
             return powerup; // Return details immediately for effect application
         } else {
              console.log(`   -> Non-spawner sending pickup request.`);
             this.networkManager.sendEvent({
                 type: 'requestPowerupPickup',
                 powerupId: powerupId,
                 clientId: localPlayerId // Send who is requesting
             });
             // Non-spawner doesn't remove immediately, waits for roomState update.
             // Return powerup details so effect can still be applied locally optimistically.
             return powerup;
         }
    }

    /**
     * --- Spawner Only ---
     * Performs the actual removal of the powerup locally and updates room state.
     * Called directly by the spawner, or via _handlePickupRequest.
     * @param {string} powerupId - The ID of the powerup to remove.
     */
     _performPickup(powerupId) {
         if (!this.isSpawner) {
             console.error(`[PowerupMgr] _performPickup called by non-spawner! This should not happen.`);
             return;
         }
         if (!this.activePowerups[powerupId]) {
             console.warn(`[PowerupMgr Spawner] _performPickup called for non-existent powerup ${powerupId}.`);
             return;
         }

         console.log(`[PowerupMgr Spawner] Performing pickup/removal for ${powerupId}.`);

         // Remove locally
         delete this.activePowerups[powerupId];

         // Update room state to remove it for everyone else
         const removalPayload = {};
         removalPayload[powerupId] = null;
         this.networkManager.updateRoomState({
             activePowerups: removalPayload
         });
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
            }
            // Spawner's position is the authority, no interpolation needed. Server state updated on spawn.

            powerup.update(deltaTime); // Apply bobbing effect

            // Lifespan is not handled here; removal comes purely from roomState sync (null entries)
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