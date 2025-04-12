// Manages active space objects in the game world

import { SpaceObject } from './space-object.js';
import { Asteroid } from './space-object-types/asteroid.js';
import { Lander } from './space-object-types/lander.js';
import { Rover } from './space-object-types/rover.js';
// --- Import the damage and destruction handlers ---
import { handleDamage, handleDestruction } from './space-object-damage-handler.js';
// Import the new sync module
import { initializeSpaceObjectsFromRoomState, handleSpaceObjectRoomStateUpdate } from './space-object-sync.js';

// Map types to classes for easy instantiation
const SPACE_OBJECT_CLASSES = {
    'asteroid': Asteroid,
    'lander': Lander,
    'rover': Rover,
};

// Spawn configuration (basic example)
const SPAWN_INTERVAL = 3000; // Check to spawn every 3 seconds
const MAX_ACTIVE_OBJECTS = 15; // Increased max objects
const OBJECT_TYPES_TO_SPAWN = ['asteroid', 'lander', 'rover'];
const SPAWN_CHANCE_PER_INTERVAL = 0.7; // Chance to spawn *if* conditions met

// --- Interpolation Factor ---
const REMOTE_OBJECT_INTERPOLATION_FACTOR = 0.15;

class SpaceObjectManager {
    // --- Removed collectibleManager dependency ---
    constructor(networkManager, assets, gameWidth, gameHeight, groundLevelY, playerManager, powerupManager, particleSystem) {
        this.networkManager = networkManager;
        this.assets = assets;
        this.gameWidth = gameWidth;
        this.gameHeight = gameHeight;
        this.groundLevelY = groundLevelY;
        this.gameBounds = { width: gameWidth, height: gameHeight };
        // --- Removed this.collectibleManager ---
        this.playerManager = playerManager;
        this.powerupManager = powerupManager;
        this.particleSystem = particleSystem; // Store particle system reference

        this.activeObjects = {};
        this.lastSpawnAttemptTime = 0;
        this.isSpawner = false; // Added flag

        // --- Removed collectibleManager check ---
        if (!this.playerManager) {
            console.error("SpaceObjectManager requires a PlayerManager instance for scoring!");
        }
        if (!this.powerupManager) {
            console.error("SpaceObjectManager requires a PowerupManager instance for drops!");
        }
        if (!this.particleSystem) {
            console.warn("SpaceObjectManager initialized without ParticleSystem. Explosions will be missing.");
        }

        // Listen for room state changes to sync objects using the new module
        this.networkManager.onPresenceUpdate(this._handlePresenceUpdate.bind(this)); // Listen to presence to get latest peer list reliably
        // Bind the room state update handler to the function in the sync module
        this.networkManager.onRoomStateUpdate((roomState) => {
            handleSpaceObjectRoomStateUpdate(this.activeObjects, roomState, this.networkManager.getClientId(), this.groundLevelY);
        });
        // Call the initialization function from the sync module
        initializeSpaceObjectsFromRoomState(this.activeObjects, this.networkManager, this.groundLevelY);
        this._determineSpawner(); // Determine spawner initially
    }

    _determineSpawner() {
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        const oldSpawnerStatus = this.isSpawner;
        this.isSpawner = peerIds.length > 0 && this.networkManager.getClientId() === peerIds[0];
        if (this.isSpawner !== oldSpawnerStatus) {
            // --- Enhanced Logging ---
            console.log(`[SpaceObjMgr ${this.networkManager?.getClientId()}] Spawner status changed. I am ${this.isSpawner ? 'NOW' : 'NO LONGER'} the spawner. Peer IDs: [${peerIds.join(', ')}]`);
            // --- End Logging ---
        }
    }

    _handlePresenceUpdate(presence) {
        this._determineSpawner(); // Re-determine spawner role immediately
    }

    attemptSpawnObject(currentTime) {
        // --- Added logging for spawn attempt ---
        const now = performance.now();
        if (now - this.lastSpawnAttemptTime > SPAWN_INTERVAL) {
            if (!this.isSpawner) {
                // Log only occasionally to prevent spam
                if (Math.random() < 0.05) {
                     console.log(`[SpaceObjMgr ${this.networkManager?.getClientId()}] Not the spawner. Skipping spawn check.`);
                }
                this.lastSpawnAttemptTime = now; // Still update time to avoid immediate re-check if spawner changes
                return;
            }
            // If isSpawner, continue with logic...
             console.log(`[SpaceObjMgr ${this.networkManager?.getClientId()}] SPAWNER checking spawn conditions.`); // Log spawner check
        // --- End Logging ---

            const numActive = Object.values(this.activeObjects).filter(o => o && !o.isMarkedForRemoval).length;
            if (numActive >= MAX_ACTIVE_OBJECTS) {
                 console.log(`[SpaceObjMgr ${this.networkManager?.getClientId()}] SPAWNER: Max objects reached (${numActive}). Skipping spawn.`); // Log max reached
                this.lastSpawnAttemptTime = now; // Update time even if max reached
                return;
            }

             // If we passed the interval check and are the spawner...
            this.lastSpawnAttemptTime = now;
            if (Math.random() > SPAWN_CHANCE_PER_INTERVAL) {
                 console.log(`[SpaceObjMgr ${this.networkManager?.getClientId()}] SPAWNER: Spawn chance failed.`); // Log chance fail
                return;
            }

            const type = OBJECT_TYPES_TO_SPAWN[Math.floor(Math.random() * OBJECT_TYPES_TO_SPAWN.length)];
            let spawnX = this.gameWidth + 100;
            let spawnY;
            const ObjectClass = SPACE_OBJECT_CLASSES[type];
            if (!ObjectClass) {
                console.error(`Invalid object class for type: ${type}`);
                return;
            }

            // Use groundLevelY for Rover positioning
            const tempInstance = new ObjectClass('temp-calc', type, 0, 0, {}, this.groundLevelY);
            if (type === 'rover') {
                // Rover constructor now handles placement on ground level
                spawnY = this.groundLevelY; // Pass ground level, constructor will adjust
            } else {
                const airbornePadding = 50;
                spawnY = Math.random() * (this.groundLevelY - airbornePadding * 2) + airbornePadding;
            }

            const initialState = {};
            const newId = `sobj-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
            // Pass groundLevelY to constructor here too
            const tempInstanceForSync = new ObjectClass(newId, type, spawnX, spawnY, initialState, this.groundLevelY);
            if (!tempInstanceForSync || !tempInstanceForSync.id) {
                console.error(`Failed to create temporary instance for sync for type ${type}`);
                return;
            }
            // Initialize server state immediately for local object
            tempInstanceForSync.serverX = tempInstanceForSync.x;
            tempInstanceForSync.serverY = tempInstanceForSync.y;
            tempInstanceForSync.serverRotation = tempInstanceForSync.rotation;
            tempInstanceForSync.serverHealth = tempInstanceForSync.health;
            tempInstanceForSync.lastServerUpdateTime = performance.now();

            // --- Log the specific spawn ---
            console.log(`[SpaceObjMgr ${this.networkManager?.getClientId()}] SPAWNER is spawning ${type} (${newId})`);
            // --- End Log ---

            const syncData = tempInstanceForSync.getSyncData();
            const updatePayload = {};
            updatePayload[newId] = syncData;

            this.networkManager.updateRoomState({ spaceObjects: updatePayload });
            this.activeObjects[newId] = tempInstanceForSync;
        }
    }

    getObject(id) {
        return this.activeObjects[id];
    }

    /**
     * Applies damage to a space object. This method now delegates the core logic
     * to the handleDamage function in space-object-damage-handler.js.
     * @param {string} id - The ID of the space object to damage.
     * @param {number} amount - The amount of damage to apply.
     * @param {string | null} playerDestroyerId - The ID of the player causing the damage (optional).
     * @returns {boolean} - True if the damage resulted in the object being destroyed, false otherwise.
     */
    applyDamageToObject(id, amount, playerDestroyerId = null) {
        // Create the context object needed by the handler functions
        const managerContext = {
            activeObjects: this.activeObjects,
            networkManager: this.networkManager,
            isSpawner: this.isSpawner,
            playerManager: this.playerManager,
            powerupManager: this.powerupManager,
            particleSystem: this.particleSystem,
            gameWidth: this.gameWidth,
            gameHeight: this.gameHeight,
            groundLevelY: this.groundLevelY,
            // Pass the method that should be called for destruction
            // Bind 'this' to ensure it runs in the context of the manager instance
            destroyObject: this._destroyObjectInternal.bind(this)
        };
        // Call the external handler function
        return handleDamage(id, amount, playerDestroyerId, managerContext);
    }

    /**
     * Internal method to handle the actual destruction logic.
     * This is passed to the damage handler as the `destroyObject` callback.
     * @param {string} id - The ID of the object to destroy.
     * @param {string | null} playerDestroyerId - ID of the player who dealt the final blow, if any.
     * @param {string} reason - Why the object is being destroyed ('damage', 'offscreen', 'cleanup', etc.).
     * @param {object} managerContext - The context object passed from applyDamageToObject or update loop.
     */
    _destroyObjectInternal(id, playerDestroyerId, reason, managerContext) {
        // Call the external handler function, passing the already created context
        handleDestruction(id, playerDestroyerId, reason, managerContext);
    }

    getActiveObjects() {
        return Object.values(this.activeObjects).filter(o => o && !o.isMarkedForRemoval);
    }

    getActiveObjectsMap() {
        const map = {};
        for (const id in this.activeObjects) {
            if (this.activeObjects[id] && !this.activeObjects[id].isMarkedForRemoval) {
                map[id] = this.activeObjects[id];
            }
        }
        return map;
    }

    update(deltaTime) {
        const updates = {};
        let needsNetworkUpdate = false;
        const now = performance.now();
        const objectIds = Object.keys(this.activeObjects);
        const managerContext = {
             activeObjects: this.activeObjects,
             networkManager: this.networkManager,
             isSpawner: this.isSpawner,
             playerManager: this.playerManager,
             powerupManager: this.powerupManager,
             particleSystem: this.particleSystem,
             gameWidth: this.gameWidth,
             gameHeight: this.gameHeight,
             groundLevelY: this.groundLevelY,
             // Pass the internal destruction method
             destroyObject: this._destroyObjectInternal.bind(this)
         };

        for (const id of objectIds) {
            const obj = this.activeObjects[id];
            if (!obj) continue; // Object might have been removed mid-iteration by destroyObject

            // Skip update if destruction started
            if (obj._destructionInProgress) {
                continue;
            }

            // Handle objects marked for removal (e.g., off-screen) before update
            if (obj.isMarkedForRemoval) {
                if (!obj._destructionInProgress) {
                    // console.log(`[SpaceObjMgr Update] Object ${id} found marked for removal (pre-update). Triggering destroy...`);
                     // Use the context object when calling the internal destruction method
                    this._destroyObjectInternal(id, null, 'cleanup', managerContext);
                }
                continue; // Move to the next object
            }

            // --- Spawner-side Physics & State Update ---
            if (this.isSpawner) {
                const oldX = obj.x; const oldY = obj.y; const oldVx = obj.vx;
                const oldVy = obj.vy; const oldRotation = obj.rotation; const oldHealth = obj.health;

                obj.update(deltaTime, this.gameBounds, this.groundLevelY);
                obj.serverHealth = obj.health; // Spawner health IS server health
                obj.serverX = obj.x; obj.serverY = obj.y; obj.serverRotation = obj.rotation; // Spawner pos IS server pos
                obj.lastServerUpdateTime = now;

                // Check again if update marked it for removal
                if (obj.isMarkedForRemoval && !obj._destructionInProgress) {
                    // console.log(`[SpaceObjMgr Update] Object ${id} marked for removal during spawner update. Triggering destroy...`);
                    this._destroyObjectInternal(id, null, 'offscreen', managerContext);
                }
                // Check for significant state changes *if* it wasn't destroyed
                else if (this.activeObjects[id]) { // Check object still exists locally
                    // --- Enhanced Change Detection ---
                    // Use a small threshold for floating point comparisons
                    const posChanged = Math.abs(obj.x - oldX) > 0.1 || Math.abs(obj.y - oldY) > 0.1;
                    const velChanged = Math.abs(obj.vx - oldVx) > 0.1 || Math.abs(obj.vy - oldVy) > 0.1;
                    const rotChanged = Math.abs(obj.rotation - oldRotation) > 0.01;
                    const healthChanged = Math.abs(obj.health - oldHealth) > 0.1;

                    if (posChanged || velChanged || rotChanged || healthChanged) {
                    // --- End Enhanced Change Detection ---
                        updates[id] = obj.getSyncData();
                        needsNetworkUpdate = true;
                    }
                }
            }
            // --- Non-Spawner Update ---
            else {
                // Interpolate first, then predict next local frame
                if (this.activeObjects[id] && !obj.isMarkedForRemoval && !obj._destructionInProgress) {
                    // --- CALL INTERPOLATION ---
                    obj.interpolateState(REMOTE_OBJECT_INTERPOLATION_FACTOR);
                    // --- END INTERPOLATION ---

                    obj.update(deltaTime, this.gameBounds, this.groundLevelY);
                    // If *local* update caused removal condition (e.g., off-screen)
                    if (obj.isMarkedForRemoval && !obj._destructionInProgress) {
                        // Don't trigger destroy, let the spawner handle it via network state (null)
                        // Just remove locally to stop rendering/processing
                        // console.log(`[SpaceObjMgr] Non-spawner removed object ${id} locally due to offscreen.`);
                        delete this.activeObjects[id];
                    }
                }
            }
        } // End loop over objectIds

        // Send network updates only if something changed and we are the spawner
        // Throttle updates slightly? Maybe not necessary yet.
        if (needsNetworkUpdate && this.isSpawner && Object.keys(updates).length > 0) {
            // console.log(`[SpaceObjMgr] Spawner sending updates for ${Object.keys(updates).length} objects.`); // Debug log
            this.networkManager.updateRoomState({ spaceObjects: updates });
        }

        // Attempt spawning new objects (only spawner does this)
        // Pass `now` instead of `performance.now()` to use consistent time
        this.attemptSpawnObject(now);
    }

    draw(ctx) {
        for (const id in this.activeObjects) {
            // Ensure object exists and isn't undergoing destruction visually
            if (this.activeObjects[id] && !this.activeObjects[id].isMarkedForRemoval && !this.activeObjects[id]._destructionInProgress) {
                this.activeObjects[id].draw(ctx, this.assets, 1.0);
            }
        }
    }
}

export default SpaceObjectManager;