// Manages active space objects in the game world

import { SpaceObject } from './space-object.js';
import { Asteroid } from './space-object-types/asteroid.js';
import { Lander } from './space-object-types/lander.js';
import { Rover } from './space-object-types/rover.js';
import { handleObjectDestructionDrop, handleObjectDestructionPowerupDrop } from '../collectibles/drop-system.js';
// Import particle constants for explosions
import { OBJ_EXPLOSION_PARTICLE_COUNT, EXPLOSION_SPEED_MIN, EXPLOSION_SPEED_MAX, EXPLOSION_COLORS_OBJ } from '../../rendering/particle-system.js';


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

class SpaceObjectManager {
    // Added collectibleManager, playerManager, powerupManager, and particleSystem dependencies
    constructor(networkManager, assets, gameWidth, gameHeight, groundLevelY, collectibleManager, playerManager, powerupManager, particleSystem) {
        this.networkManager = networkManager;
        this.assets = assets;
        this.gameWidth = gameWidth;
        this.gameHeight = gameHeight;
        this.groundLevelY = groundLevelY;
        this.gameBounds = { width: gameWidth, height: gameHeight };
        this.collectibleManager = collectibleManager;
        this.playerManager = playerManager;
        this.powerupManager = powerupManager;
        this.particleSystem = particleSystem; // Store particle system reference

        this.activeObjects = {};
        this.lastSpawnAttemptTime = 0;

        if (!this.collectibleManager) {
            console.error("SpaceObjectManager requires a CollectibleManager instance for drops!");
        }
        if (!this.playerManager) {
            console.error("SpaceObjectManager requires a PlayerManager instance for scoring!");
        }
        if (!this.powerupManager) {
            console.error("SpaceObjectManager requires a PowerupManager instance for drops!");
        }
        if (!this.particleSystem) {
            console.warn("SpaceObjectManager initialized without ParticleSystem. Explosions will be missing.");
        }

        // Listen for room state changes to sync objects
        this.networkManager.onPresenceUpdate(this._handlePresenceUpdate.bind(this)); // Listen to presence to get latest peer list reliably
        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate.bind(this));
        this._initializeFromRoomState(); // Try to initialize immediately, onRoomStateUpdate will overwrite if needed
    }

    _initializeFromRoomState() {
        const roomState = this.networkManager.getRoomState();
        if (roomState && roomState.spaceObjects && Object.keys(roomState.spaceObjects).length > 0) {
            console.log("Attempting immediate initialization of space objects from room state:", JSON.stringify(Object.keys(roomState.spaceObjects)));
            this._syncObjects(roomState.spaceObjects);
        } else {
            console.log("No initial space objects found in room state during immediate check.");
        }
    }

    _handlePresenceUpdate(presence) {
        // The presence update implicitly updates networkManager.peers
        // No specific action needed here other than letting the spawner check work
    }

    _handleRoomStateUpdate(roomState) {
        if (roomState.hasOwnProperty('spaceObjects')) {
            const objectData = roomState.spaceObjects || {};
            this._syncObjects(objectData);
        }
    }

    _syncObjects(objectData) {
        const currentIds = Object.keys(this.activeObjects);
        const myClientId = this.networkManager.getClientId();
        const serverIds = Object.keys(objectData);
        let changed = false;

        // FIXED: Only remove objects that are explicitly set to null, not ones missing from the update
        for (const id of currentIds) {
            if (objectData[id] === null) {  // Only remove if explicitly null
                if (this.activeObjects[id]) {
                    // console.log(`[SpaceObjMgr ${myClientId}] Removing object ${id} due to explicit null`); // Reduce log noise
                    delete this.activeObjects[id];
                    changed = true;
                }
            }
        }

        for (const id of serverIds) {
            const data = objectData[id];
            if (data === null) continue; // Skip null entries

            if (!data || !data.type || typeof data.x !== 'number' || typeof data.y !== 'number') {
                console.warn(`[SpaceObjMgr ${myClientId}] Invalid data for space object ${id}. Skipping. Data:`, data);
                if (this.activeObjects[id]) delete this.activeObjects[id];
                changed = true;
                continue;
            }
            const ObjectClass = SPACE_OBJECT_CLASSES[data.type];
            if (!ObjectClass) {
                console.warn(`[SpaceObjMgr ${myClientId}] Unknown space object type "${data.type}" for ID ${id}. Skipping.`);
                if (this.activeObjects[id]) delete this.activeObjects[id];
                changed = true;
                continue;
            }

            if (!this.activeObjects[id]) {
                if (data.health !== undefined && data.health <= 0) {
                    continue; // Don't recreate already destroyed objects
                }
                try {
                    // console.log(`[SpaceObjMgr ${myClientId}] Creating new object ${id} of type ${data.type} at (${data.x.toFixed(0)}, ${data.y.toFixed(0)})`); // Reduce log noise
                    const newObj = new ObjectClass(id, data.type, data.x, data.y, data, this.groundLevelY);
                    if (!newObj || !newObj.id) {
                        console.error(`[SpaceObjMgr ${myClientId}] FAILED to create object ${id} - Constructor returned invalid object.`);
                        continue;
                    }
                    this.activeObjects[id] = newObj;
                    changed = true;
                } catch (error) {
                    console.error(`[SpaceObjMgr ${myClientId}] Error creating object ${id} of type ${data.type}:`, error);
                    continue;
                }
            } else {
                const localObj = this.activeObjects[id];
                 if (data.health !== undefined && data.health <= 0) {
                    if (!localObj.isMarkedForRemoval) {
                        console.log(`[SpaceObjMgr ${myClientId}] Marking object ${id} for removal based on sync data (health <= 0).`);
                        // Don't trigger full destruction effects here, just mark for cleanup in update loop
                        localObj.isMarkedForRemoval = true;
                        localObj.health = 0; // Ensure health is zero
                        changed = true;
                    }
                    continue; // Skip further updates if marked for removal
                }
                // Only update if state actually differs
                if (localObj.x !== data.x || localObj.y !== data.y || localObj.vx !== data.vx || localObj.vy !== data.vy || localObj.rotation !== data.rotation || localObj.health !== data.health || localObj.scoreValue !== data.scoreValue) {
                    localObj.x = data.x;
                    localObj.y = data.y;
                    localObj.vx = data.vx ?? localObj.vx;
                    localObj.vy = data.vy ?? localObj.vy;
                    localObj.rotation = data.rotation ?? localObj.rotation;
                    localObj.health = data.health ?? localObj.health;
                    localObj.scoreValue = data.scoreValue ?? localObj.scoreValue;
                    changed = true;
                    // Update subtype specific state if needed
                    if (localObj instanceof Lander && data.baseY !== undefined) {
                        localObj.baseY = data.baseY;
                    }
                    if (localObj instanceof Rover) {
                        localObj.y = this.groundLevelY - (localObj.drawHeight / 2); // Keep rover grounded
                    }
                }
            }
        }
    }

    attemptSpawnObject(currentTime) {
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        if (!peerIds.length || this.networkManager.getClientId() !== peerIds[0]) {
            return; // Not the designated spawner
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
            let spawnX = this.gameWidth + 100; // Spawn off-screen right
            let spawnY;
            const ObjectClass = SPACE_OBJECT_CLASSES[type];
            if (!ObjectClass) {
                console.error(`Invalid object class for type: ${type}`);
                return;
            }

            // Use a temporary instance to calculate height for positioning
            const tempInstance = new ObjectClass('temp-calc', type, 0, 0, {}, this.groundLevelY);
            if (type === 'rover') {
                // Position rover centered on the ground line
                spawnY = this.groundLevelY - (tempInstance.drawHeight / 2);
            } else {
                // Spawn airborne objects within vertical bounds
                const airbornePadding = 50;
                spawnY = Math.random() * (this.groundLevelY - airbornePadding * 2) + airbornePadding;
            }

            const initialState = {}; // Start with minimal state, constructor sets defaults
            const newId = `sobj-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;

            // Create the actual instance to get its initial sync data
            const tempInstanceForSync = new ObjectClass(newId, type, spawnX, spawnY, initialState, this.groundLevelY);
            if (!tempInstanceForSync || !tempInstanceForSync.id) {
                console.error(`Failed to create temporary instance for sync for type ${type}`);
                return;
            }
            const syncData = tempInstanceForSync.getSyncData();

            // Add the object to local state immediately
            this.activeObjects[newId] = tempInstanceForSync;

            // Send network update
            const updatePayload = {};
            updatePayload[newId] = syncData;
            this.networkManager.updateRoomState({
                spaceObjects: updatePayload
            });

            // console.log(`Spawner ${this.networkManager.getClientId()} spawned ${type} (${newId})`); // Reduce log noise
        }
    }

    getObject(id) {
        return this.activeObjects[id];
    }

    // --- Refactored Destruction Logic ---
    _handleObjectDestruction(obj, playerDestroyerId) {
        if (!obj || obj.isMarkedForRemoval) return; // Already handled or invalid

        const id = obj.id;
        obj.isMarkedForRemoval = true; // Mark internally first

        // 1. Trigger Explosion Effect
        const posX = obj.x?.toFixed(0);
        const posY = obj.y?.toFixed(0);
        const particleSystemExists = !!this.particleSystem;
        console.log(`[SpaceObjMgr] Destroying ${id}. Pos:(${posX}, ${posY}). ParticleSystem valid: ${particleSystemExists}. Triggering effects...`);

        if (particleSystemExists) {
            try {
                this.particleSystem.emitExplosion(
                    obj.x,
                    obj.y,
                    OBJ_EXPLOSION_PARTICLE_COUNT,
                    EXPLOSION_SPEED_MIN,
                    EXPLOSION_SPEED_MAX,
                    EXPLOSION_COLORS_OBJ
                );
                 console.log(`[SpaceObjMgr] Explosion emitted for ${id}.`);
            } catch (error) {
                 console.error(`[SpaceObjMgr] Error emitting explosion for ${id}:`, error);
            }
        } else {
             console.warn("[SpaceObjMgr] Explosion skipped: ParticleSystem missing.");
        }

        // 2. Award Score
        if (playerDestroyerId && obj.scoreValue > 0 && this.playerManager) {
            const player = this.playerManager.getPlayer(playerDestroyerId);
            if (player && player.lifecycleState === 'ACTIVE') {
                player.addScore(obj.scoreValue);
                // console.log(`Player ${playerDestroyerId} awarded ${obj.scoreValue} points for destroying ${id}`); // Reduce log noise
            }
        }

        // 3. Handle Drops
        if (this.collectibleManager) {
            handleObjectDestructionDrop(obj, playerDestroyerId, this.collectibleManager);
        }
        if (this.powerupManager) {
            handleObjectDestructionPowerupDrop(obj, playerDestroyerId, this.powerupManager);
        }

        // 4. Signal Removal via Network
        const removalPayload = {};
        removalPayload[id] = null; // Signal removal
        this.networkManager.updateRoomState({
            spaceObjects: removalPayload
        });

        // 5. Remove Locally (redundant with update loop cleanup, but safe)
        delete this.activeObjects[id];
    }
    // --- End Refactored Destruction Logic ---


    // Renamed from destroyObject - this is the public method to call externally
    destroyObjectById(id, playerDestroyerId = null) {
         const obj = this.getObject(id);
         this._handleObjectDestruction(obj, playerDestroyerId);
    }

    handleDamageToObject(id, amount, playerDestroyerId = null) {
        const obj = this.getObject(id);
        if (!obj || obj.isMarkedForRemoval) return false;

        const wasDestroyed = obj.takeDamage(amount); // Apply damage internally first

        if (wasDestroyed) {
            // Use the refactored destruction handler
            this._handleObjectDestruction(obj, playerDestroyerId);
            return true;
        } else {
            // Object took damage but wasn't destroyed. Sync its new state if we are the spawner.
             const peers = this.networkManager.getPeers();
             const peerIds = Object.keys(peers).sort();
             if (peerIds.length > 0 && this.networkManager.getClientId() === peerIds[0]) {
                 const updatePayload = {};
                 updatePayload[id] = obj.getSyncData(); // Get current state data
                 this.networkManager.updateRoomState({
                     spaceObjects: updatePayload // Send updated health etc.
                 });
             }
            return false;
        }
    }

    // Keep applyDamageToObject for compatibility with collision system
    applyDamageToObject(id, amount, playerDestroyerId = null) {
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

        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        const isSpawner = peerIds.length > 0 && this.networkManager.getClientId() === peerIds[0];

        for (const id in this.activeObjects) {
            const obj = this.activeObjects[id];
            if (!obj) {
                delete this.activeObjects[id];
                continue; // Skip if object is somehow null
            }

            // If object already marked for removal (e.g., by sync), ensure cleanup and signal removal if spawner
            if (obj.isMarkedForRemoval) {
                if (isSpawner && updates[id] !== null) { // Check if not already marked for removal in this update batch
                    updates[id] = null;
                    needsNetworkUpdate = true;
                }
                delete this.activeObjects[id]; // Remove locally
                continue;
            }

            // --- Physics Update (Spawner Authority) ---
            let changed = false;
            if (isSpawner) {
                const oldX = obj.x;
                const oldY = obj.y;
                const oldVx = obj.vx;
                const oldVy = obj.vy;
                const oldRotation = obj.rotation;

                obj.update(deltaTime, this.gameBounds, this.groundLevelY);

                // Check if update resulted in removal (e.g., off-screen)
                if (obj.isMarkedForRemoval) {
                     if (updates[id] !== null) {
                         updates[id] = null; // Mark for network removal
                         needsNetworkUpdate = true;
                     }
                } else if ( // Check significant state changes
                    obj.x !== oldX ||
                    obj.y !== oldY ||
                    obj.vx !== oldVx ||
                    obj.vy !== oldVy ||
                    obj.rotation !== oldRotation
                    // Health changes are handled by applyDamageToObject/handleDamageToObject
                ) {
                    updates[id] = obj.getSyncData(); // Get updated data
                    needsNetworkUpdate = true;
                    changed = true; // Flag that something changed for this object
                }
            } else {
                // Non-spawners still update visual state locally (e.g., rotation)
                // We don't want non-spawners dictating position or health.
                 const oldRotation = obj.rotation;
                 // Only update non-authoritative state like rotation or bobbing
                 obj.rotation += obj.rotationSpeed * deltaTime;
                 if (obj instanceof Lander) {
                     obj.bobOffset += obj.bobSpeed * deltaTime;
                     if (obj.bobOffset > Math.PI * 2) obj.bobOffset -= Math.PI * 2;
                     obj.y = obj.baseY + Math.sin(obj.bobOffset) * obj.bobRange;
                 }
                 changed = obj.rotation !== oldRotation; // Only visual changes matter here
            }
             // --- End Physics Update ---


            // Final check for removal after update/sync state check
            if (obj.isMarkedForRemoval) {
                 if (isSpawner && updates[id] !== null) {
                     updates[id] = null; // Ensure removal update is sent if spawner
                     needsNetworkUpdate = true;
                 }
                delete this.activeObjects[id]; // Remove from local state
            }
        } // End loop through activeObjects


        // Send network updates only if something changed and we are the spawner
        if (needsNetworkUpdate && isSpawner && Object.keys(updates).length > 0) {
            this.networkManager.updateRoomState({ spaceObjects: updates });
        }

        // Attempt spawning new objects (only spawner does this)
        this.attemptSpawnObject(performance.now());
    }

    draw(ctx) {
        for (const id in this.activeObjects) {
            // Draw objects that exist and are not marked for removal
             if (this.activeObjects[id] && !this.activeObjects[id].isMarkedForRemoval) {
                this.activeObjects[id].draw(ctx, this.assets, 1.0);
             }
        }
    }
}

export default SpaceObjectManager;