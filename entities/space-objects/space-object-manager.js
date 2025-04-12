// Manages active space objects in the game world

import { SpaceObject } from './space-object.js';
import { Asteroid } from './space-object-types/asteroid.js';
import { Lander } from './space-object-types/lander.js';
import { Rover } from './space-object-types/rover.js';
import { handleObjectDestructionDrop, handleObjectDestructionPowerupDrop } from '../collectibles/drop-system.js';
import { createObjectExplosionEffect } from './space-object-explosion-handler.js';

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
                    continue;
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
                        localObj.isMarkedForRemoval = true;
                        changed = true;
                    }
                    continue;
                }
                if (localObj.x !== data.x || localObj.y !== data.y || localObj.vx !== data.vx || localObj.vy !== data.vy || localObj.rotation !== data.rotation || localObj.health !== data.health) {
                    localObj.x = data.x;
                    localObj.y = data.y;
                    localObj.vx = data.vx ?? localObj.vx;
                    localObj.vy = data.vy ?? localObj.vy;
                    localObj.rotation = data.rotation ?? localObj.rotation;
                    localObj.health = data.health ?? localObj.health;
                    localObj.scoreValue = data.scoreValue ?? localObj.scoreValue;
                    changed = true;
                    if (localObj instanceof Lander && data.baseY !== undefined) {
                        localObj.baseY = data.baseY;
                    }
                    if (localObj instanceof Rover) {
                        localObj.y = this.groundLevelY - (localObj.drawHeight / 2);
                    }
                }
            }
        }
        // ADDED: Log active count after sync for debugging
        // if (changed || Math.random() < 0.01) { // Log on change or occasionally
        //     console.log(`[SpaceObjMgr ${myClientId}] Active objects after sync: ${Object.keys(this.activeObjects).length}`);
        // }
    }

    attemptSpawnObject(currentTime) {
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        if (!peerIds.length || this.networkManager.getClientId() !== peerIds[0]) {
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

            const tempInstance = new ObjectClass('temp-calc', type, 0, 0, {}, this.groundLevelY);
            if (type === 'rover') {
                spawnY = this.groundLevelY - (tempInstance.drawHeight / 2);
            } else {
                const airbornePadding = 50;
                spawnY = Math.random() * (this.groundLevelY - airbornePadding * 2) + airbornePadding;
            }

            const initialState = {};
            const newId = `sobj-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
            const tempInstanceForSync = new ObjectClass(newId, type, spawnX, spawnY, initialState, this.groundLevelY);
            if (!tempInstanceForSync || !tempInstanceForSync.id) {
                console.error(`Failed to create temporary instance for sync for type ${type}`);
                return;
            }
            const syncData = tempInstanceForSync.getSyncData();

            // console.log(`Spawner ${this.networkManager.getClientId()} attempting to spawn ${type} (${newId}) at (${syncData.x.toFixed(0)}, ${syncData.y.toFixed(0)}) with vx: ${syncData.vx.toFixed(1)}`); // Reduce log noise

            const updatePayload = {};
            updatePayload[newId] = syncData;

            this.networkManager.updateRoomState({
                spaceObjects: updatePayload
            });

            // ADDED: Add the object to local state immediately rather than waiting for the update
            // This ensures the object exists locally before the next frame's update
            this.activeObjects[newId] = tempInstanceForSync;
        }
    }

    getObject(id) {
        return this.activeObjects[id];
    }

    destroyObject(id, playerDestroyerId = null) {
        const obj = this.getObject(id);
        if (obj && !obj.isMarkedForRemoval) { // Check if not already being removed
            // console.log(`[SpaceObjMgr] Destroying object ${id}.`); // Reduce log noise

            // --- EXPLOSION HANDLING MOVED TO SEPARATE MODULE ---
            // Call the explosion handler with the object and particle system
            if (this.particleSystem) {
                createObjectExplosionEffect(obj, this.particleSystem);
            } else {
                console.warn("[SpaceObjMgr] ParticleSystem is missing, cannot create explosion effect");
            }
            // --- END EXPLOSION HANDLING ---

            if (playerDestroyerId && obj.scoreValue > 0) {
                const player = this.playerManager?.getPlayer(playerDestroyerId);
                if (player && player.lifecycleState === 'ACTIVE') {
                    player.addScore(obj.scoreValue);
                    // console.log(`Player ${playerDestroyerId} awarded ${obj.scoreValue} points for destroying ${id}`); // Reduce log noise
                }
            }
            obj.isMarkedForRemoval = true; // Mark for removal first
            handleObjectDestructionDrop(obj, playerDestroyerId, this.collectibleManager);
            handleObjectDestructionPowerupDrop(obj, playerDestroyerId, this.powerupManager);

            const removalPayload = {};
            removalPayload[id] = null; // Signal removal
            this.networkManager.updateRoomState({
                spaceObjects: removalPayload
            });

            delete this.activeObjects[id]; // Remove locally after marking and signalling
        } else if (obj && obj.isMarkedForRemoval) {
            // console.log(`[SpaceObjMgr] Object ${id} already marked for removal. Skipping destroy logic.`);
        } else {
            console.log(`[SpaceObjMgr] Could not find object ${id} to destroy.`);
        }
    }

    handleDamageToObject(id, amount, playerDestroyerId = null) {
        const obj = this.getObject(id);
        if (!obj || obj.isMarkedForRemoval) return false;

        const wasDestroyed = obj.takeDamage(amount); // Apply damage internally first

        if (wasDestroyed) {
            this.destroyObject(id, playerDestroyerId); // Handles explosion, drops, sync
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
        // FIXED: Only send network updates for objects that actually changed position or state
        const updates = {};
        let needsNetworkUpdate = false;

        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        const isSpawner = peerIds.length > 0 && this.networkManager.getClientId() === peerIds[0];

        // Count active objects before processing for debug purposes
        // const activeCount = Object.values(this.activeObjects).filter(o => !o.isMarkedForRemoval).length;
        // if (Math.random() < 0.01) { // Occasional log
        //     console.log(`[SpaceObjMgr] Active objects before update: ${activeCount}`);
        // }

        for (const id in this.activeObjects) {
            const obj = this.activeObjects[id];
            if (!obj) {
                delete this.activeObjects[id];
                continue;
            }

            if (obj.isMarkedForRemoval) {
                // Only the spawner should notify about object removal
                if (isSpawner) {
                     if (updates[id] !== null) { // Avoid redundant null updates
                        updates[id] = null;
                        needsNetworkUpdate = true;
                    }
                }
                delete this.activeObjects[id]; // Remove from local state
                continue;
            }

            // Only the spawner updates the physics and determines if network update needed
            if (isSpawner) {
                const oldX = obj.x;
                const oldY = obj.y;
                const oldVx = obj.vx;
                const oldVy = obj.vy;
                const oldRotation = obj.rotation;
                const oldHealth = obj.health;

                obj.update(deltaTime, this.gameBounds, this.groundLevelY);

                // Only send updates for objects that actually changed
                if (obj.isMarkedForRemoval) { // If update marked it for removal
                     if (updates[id] !== null) {
                         updates[id] = null;
                         needsNetworkUpdate = true;
                     }
                     // Object will be deleted below
                } else if ( // Check for significant changes
                    obj.x !== oldX ||
                    obj.y !== oldY ||
                    obj.vx !== oldVx ||
                    obj.vy !== oldVy ||
                    obj.rotation !== oldRotation ||
                    obj.health !== oldHealth
                ) {
                    updates[id] = obj.getSyncData(); // Get updated data
                    needsNetworkUpdate = true;
                }
            } else {
                // Non-spawners still need to update locally for smooth visuals (e.g. rotation)
                obj.update(deltaTime, this.gameBounds, this.groundLevelY);
            }

            // Handle final removal after update (if it became marked during update)
            if (obj.isMarkedForRemoval) {
                 if (isSpawner && updates[id] !== null) {
                     updates[id] = null; // Ensure removal update is sent
                     needsNetworkUpdate = true;
                 }
                delete this.activeObjects[id]; // Remove from local state
            }
        }

        // Send network updates only if something changed and we are the spawner
        if (needsNetworkUpdate && isSpawner && Object.keys(updates).length > 0) {
             // console.log(`[SpaceObjMgr ${this.networkManager.getClientId()}] Sending updates: ${JSON.stringify(updates)}`); // Reduce log noise
            this.networkManager.updateRoomState({ spaceObjects: updates });
        }

        // Attempt spawning new objects
        this.attemptSpawnObject(performance.now());

        // Count active objects after processing for debug purposes
        // const newActiveCount = Object.values(this.activeObjects).filter(o => !o.isMarkedForRemoval).length;
        // if (Math.random() < 0.01) { // Occasional log
        //     console.log(`[SpaceObjMgr] Active objects after update: ${newActiveCount}`);
        // }
    }

    draw(ctx) {
        for (const id in this.activeObjects) {
            if (this.activeObjects[id] && !this.activeObjects[id].isMarkedForRemoval) {
                this.activeObjects[id].draw(ctx, this.assets, 1.0);
            }
        }
    }
}

export default SpaceObjectManager;