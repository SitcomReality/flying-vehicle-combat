// Manages active space objects in the game world

import { SpaceObject } from './space-object.js';
import { Asteroid } from './space-object-types/asteroid.js';
import { Lander } from './space-object-types/lander.js';
import { Rover } from './space-object-types/rover.js';
// --- Updated Powerup Drop Import ---
import { handleObjectDestructionPowerupDrop } from '../drop-system.js'; // Corrected path
import { createObjectExplosionEffect } from './space-object-explosion-handler.js';
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
            console.log(`[SpaceObjMgr] Spawner status changed to: ${this.isSpawner}`);
        }
    }

    _handlePresenceUpdate(presence) {
        // Re-determine spawner role on presence changes
        this._determineSpawner();
    }

    attemptSpawnObject(currentTime) {
        // Use the isSpawner flag directly
        if (!this.isSpawner) {
            return;
        }

        const numActive = Object.values(this.activeObjects).filter(o => o && !o.isMarkedForRemoval).length;
        if (numActive >= MAX_ACTIVE_OBJECTS) {
            return;
        }

        if (currentTime - this.lastSpawnAttemptTime > SPAWN_INTERVAL) {
            this.lastSpawnAttemptTime = currentTime;
            if (Math.random() > SPAWN_CHANCE_PER_INTERVAL) {
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

            const syncData = tempInstanceForSync.getSyncData();

            // console.log(`Spawner ${this.networkManager.getClientId()} attempting to spawn ${type} (${newId}) at (${syncData.x.toFixed(0)}, ${syncData.y.toFixed(0)}) with vx: ${syncData.vx.toFixed(1)}`); // Reduce log noise

            const updatePayload = {};
            updatePayload[newId] = syncData;

            this.networkManager.updateRoomState({
                spaceObjects: updatePayload
            });

            // Add the object to local state immediately for responsiveness
            this.activeObjects[newId] = tempInstanceForSync;
        }
    }

    getObject(id) {
        return this.activeObjects[id];
    }

    /**
     * Destroys a space object, handles drops, particles, and removal.
     * Only the spawner sends the network removal message.
     * @param {string} id - The ID of the object to destroy.
     * @param {string | null} playerDestroyerId - ID of the player who dealt the final blow, if any.
     * @param {string} reason - Why the object is being destroyed ('damage', 'offscreen', 'cleanup', etc.).
     */
    destroyObject(id, playerDestroyerId = null, reason = 'unknown') {
        const obj = this.getObject(id);
        if (obj && !obj._destructionInProgress) {
            obj._destructionInProgress = true; // Mark destruction start

            console.log(`[SpaceObjMgr] Destroying object ${id}. Player: ${playerDestroyerId || 'None'}. Reason: ${reason}`);

            // --- EXPLOSION HANDLING (Only if destroyed by damage) ---
            if (reason === 'damage' && this.particleSystem) {
                createObjectExplosionEffect(obj, this.particleSystem);
            } else if (reason === 'damage') {
                console.warn("[SpaceObjMgr] ParticleSystem is missing, cannot create explosion effect for object", id);
            }
            // --- END EXPLOSION HANDLING ---

            // Score awarding only happens if destroyed by a player via damage
            if (reason === 'damage' && playerDestroyerId && obj.scoreValue > 0) {
                const player = this.playerManager?.getPlayer(playerDestroyerId);
                if (player && player.lifecycleState === 'ACTIVE') {
                    player.addScore(obj.scoreValue);
                    console.log(`Player ${playerDestroyerId} awarded ${obj.scoreValue} points for destroying ${id}`);
                }
            }

            // --- Drop Handling (Only if destroyed by damage) ---
            if (reason === 'damage') {
                handleObjectDestructionPowerupDrop(
                    obj,
                    playerDestroyerId,
                    this.powerupManager,
                    this.gameWidth,
                    this.gameHeight,
                    this.groundLevelY
                );
            }

            // Network removal request (ideally only by spawner, but always sending is simpler for now)
            const removalPayload = {};
            removalPayload[id] = null; // Signal removal
            this.networkManager.updateRoomState({
                spaceObjects: removalPayload
            });

            // Mark for removal locally *after* handling drops/explosions
            obj.isMarkedForRemoval = true;

            // Remove locally immediately after signalling removal
            delete this.activeObjects[id];

        } else if (obj && obj._destructionInProgress) {
            // console.log(`[SpaceObjMgr] Destruction for object ${id} already in progress. Skipping.`);
        } else {
            // console.log(`[SpaceObjMgr] Could not find object ${id} to destroy or already removed.`);
        }
    }

    handleDamageToObject(id, amount, playerDestroyerId = null) {
        const obj = this.getObject(id);
        if (!obj || obj.isMarkedForRemoval || obj._destructionInProgress) return false; // Check destruction flag

        const wasDestroyed = obj.takeDamage(amount);

        if (wasDestroyed) {
            // --- Pass 'damage' reason ---
            this.destroyObject(id, playerDestroyerId, 'damage');
            return true;
        } else {
             // Object took damage but wasn't destroyed. Sync its new state if we are the spawner.
             if (this.isSpawner) {
                 const updatePayload = {};
                 updatePayload[id] = obj.getSyncData(); // Get current state data
                 this.networkManager.updateRoomState({
                     spaceObjects: updatePayload // Send updated health etc.
                 });
             }
            return false;
        }
    }

    applyDamageToObject(id, amount, playerDestroyerId = null) {
        // Ensure applyDamageToObject is the one called by colliders
        return this.handleDamageToObject(id, amount, playerDestroyerId);
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

        const objectIds = Object.keys(this.activeObjects);

        for (const id of objectIds) {
            const obj = this.activeObjects[id];
            if (!obj) continue; // Object might have been removed mid-iteration by destroyObject

            // Handle objects marked for removal (e.g., off-screen, lifespan)
            if (obj.isMarkedForRemoval && !obj._destructionInProgress) {
                // console.log(`[SpaceObjMgr Update] Object ${id} found marked for removal. Triggering destroy...`);
                // --- Pass 'offscreen' reason ---
                this.destroyObject(id, null, 'offscreen'); // Trigger full destruction logic
                continue; // Move to the next object
            }

            // Skip further processing if destruction started or object removed
            if (obj._destructionInProgress) {
                continue;
            }

            // --- Spawner-side Physics & State Update ---
            if (this.isSpawner) {
                const oldX = obj.x; const oldY = obj.y; const oldVx = obj.vx;
                const oldVy = obj.vy; const oldRotation = obj.rotation; const oldHealth = obj.health;

                obj.update(deltaTime, this.gameBounds, this.groundLevelY);

                // Check again if update marked it for removal
                if (obj.isMarkedForRemoval && !obj._destructionInProgress) {
                    // console.log(`[SpaceObjMgr Update] Object ${id} marked for removal during spawner update. Triggering destroy...`);
                    // --- Pass 'offscreen' reason ---
                    this.destroyObject(id, null, 'offscreen');
                }
                // Check for significant state changes *if* it wasn't destroyed
                else if (this.activeObjects[id]) { // Check object still exists locally
                    if (obj.x !== oldX || obj.y !== oldY || obj.vx !== oldVx || obj.vy !== oldVy || obj.rotation !== oldRotation || obj.health !== oldHealth) {
                        updates[id] = obj.getSyncData();
                        needsNetworkUpdate = true;
                    }
                }
            }
            // --- Non-Spawner Update ---
            else {
                // Non-spawners update locally for smooth visuals only if the object exists
                // This includes checking local removal conditions like going off-screen
                if (this.activeObjects[id] && !obj.isMarkedForRemoval && !obj._destructionInProgress) {
                    obj.update(deltaTime, this.gameBounds, this.groundLevelY);
                    // If *local* update caused removal condition (e.g., off-screen)
                    if (obj.isMarkedForRemoval && !obj._destructionInProgress) {
                         // Don't trigger destroy, let the spawner handle it via network state (null)
                         // Just remove locally to stop rendering/processing
                         delete this.activeObjects[id];
                    }
                }
            }
        } // End loop over objectIds

        // Send network updates only if something changed and we are the spawner
        if (needsNetworkUpdate && this.isSpawner && Object.keys(updates).length > 0) {
            this.networkManager.updateRoomState({ spaceObjects: updates });
        }

        // Attempt spawning new objects (only spawner does this)
        this.attemptSpawnObject(performance.now());
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