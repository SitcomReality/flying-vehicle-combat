// Manages active space objects in the game world

import { SpaceObject } from './space-object.js';
import { Asteroid } from './space-object-types/asteroid.js';
import { Lander } from './space-object-types/lander.js';
import { Rover } from './space-object-types/rover.js';
import { handleObjectDestructionDrop, handleObjectDestructionPowerupDrop } from '../collectibles/drop-system.js';

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
    // Added collectibleManager and playerManager dependencies
    constructor(networkManager, assets, gameWidth, gameHeight, groundLevelY, collectibleManager, playerManager, powerupManager) {
        this.networkManager = networkManager;
        this.assets = assets;
        this.gameWidth = gameWidth;
        this.gameHeight = gameHeight;
        this.groundLevelY = groundLevelY;
        this.gameBounds = { width: gameWidth, height: gameHeight };
        this.collectibleManager = collectibleManager;
        this.playerManager = playerManager;
        this.powerupManager = powerupManager;

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

        // Listen for room state changes to sync objects
        this.networkManager.onPresenceUpdate(this._handlePresenceUpdate.bind(this)); // Listen to presence to get latest peer list reliably
        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate.bind(this));
        this._initializeFromRoomState();
    }

    _initializeFromRoomState() {
        const roomState = this.networkManager.getRoomState();
        if (roomState && roomState.spaceObjects) {
            this._syncObjects(roomState.spaceObjects);
        }
    }

     // Track the current list of peers to determine the spawner
     _handlePresenceUpdate(presence) {
         // The presence update implicitly updates networkManager.peers
         // No specific action needed here other than letting the spawner check work
     }

    _handleRoomStateUpdate(roomState) {
        const objectData = roomState.spaceObjects || {};
        this._syncObjects(objectData);
    }

    // Syncs local objects with server data
    _syncObjects(objectData) {
        const currentIds = Object.keys(this.activeObjects);
        const serverIds = Object.keys(objectData);

        // Remove local objects that are no longer in roomState
        for (const id of currentIds) {
            if (!objectData[id]) {
                 // Make sure it exists locally before deleting
                 if (this.activeObjects[id]) {
                    // console.log(`Removing space object ${id} locally as it's gone from roomState.`);
                    delete this.activeObjects[id];
                 }
            }
        }

        // Add/Update objects based on roomState
        for (const id of serverIds) {
            const data = objectData[id];
            if (!data || !data.type) {
                console.warn(`Invalid data for space object ${id} in roomState. Skipping.`);
                // Also remove locally if invalid data received for existing object
                if(this.activeObjects[id]) delete this.activeObjects[id];
                continue;
            }
            const ObjectClass = SPACE_OBJECT_CLASSES[data.type];
            if (!ObjectClass) {
                console.warn(`Unknown space object type "${data.type}" for ID ${id}. Skipping.`);
                if(this.activeObjects[id]) delete this.activeObjects[id];
                continue;
            }

            if (!this.activeObjects[id]) {
                 // Check if we received health <= 0 data - don't create if already destroyed server-side
                if (data.health !== undefined && data.health <= 0) {
                    // console.log(`Skipping creation of ${id}, already destroyed in roomState.`);
                    continue;
                }
                // console.log(`Creating new local space object instance ${id} of type ${data.type}`);
                this.activeObjects[id] = new ObjectClass(id, data.type, data.x, data.y, data, this.groundLevelY);
            } else {
                // Update existing local object
                const localObj = this.activeObjects[id];
                // If health is 0 or less from server, mark for removal locally too
                 if (data.health !== undefined && data.health <= 0) {
                     if (!localObj.isMarkedForRemoval) {
                         // console.log(`Marking space object ${id} for removal due to roomState health <= 0.`);
                         localObj.isMarkedForRemoval = true; // Mark for removal, will be cleaned up in update loop
                     }
                     continue; // Don't process further updates if marked for removal
                 }

                // Update properties
                localObj.x = data.x;
                localObj.y = data.y;
                localObj.vx = data.vx ?? localObj.vx; // Sync velocity if provided
                localObj.vy = data.vy ?? localObj.vy;
                localObj.rotation = data.rotation ?? localObj.rotation;
                localObj.health = data.health ?? localObj.health;
                localObj.scoreValue = data.scoreValue ?? localObj.scoreValue;

                // Lander specific sync
                if (localObj instanceof Lander && data.baseY !== undefined) {
                    localObj.baseY = data.baseY;
                }
                // Rover specific sync - Y position should be dictated by ground level + height
                if (localObj instanceof Rover) {
                     localObj.y = this.groundLevelY - (localObj.drawHeight / 2); // Ensure rover stays grounded visually
                }
            }
        }
    }

    attemptSpawnObject(currentTime) {
        // --- Spawner Determination ---
        // Only one client should be responsible for spawning to avoid duplicates.
        // Use the client with the lowest sorted ID as the designated spawner.
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort(); // Sort IDs lexicographically

        // Ensure there are peers and the current client is the first one
        if (!peerIds.length || this.networkManager.getClientId() !== peerIds[0]) {
            // console.log("Not the designated spawner."); // Reduce log noise
            return; // Not the designated spawner
        }

        // --- Spawn Conditions ---
        const numActive = Object.keys(this.activeObjects).length;
        if (numActive >= MAX_ACTIVE_OBJECTS) {
            // console.log("Max active objects reached."); // Reduce log noise
            return; // Max limit reached
        }

        if (currentTime - this.lastSpawnAttemptTime > SPAWN_INTERVAL) {
            this.lastSpawnAttemptTime = currentTime;

            // Random chance to spawn within the interval
             if (Math.random() > SPAWN_CHANCE_PER_INTERVAL) {
                  // console.log("Spawn chance failed."); // Reduce log noise
                  return;
             }


            // --- Choose Type and Position ---
            if (OBJECT_TYPES_TO_SPAWN.length === 0) return;
            const type = OBJECT_TYPES_TO_SPAWN[Math.floor(Math.random() * OBJECT_TYPES_TO_SPAWN.length)];

            let spawnX = this.gameWidth + 100; // Spawn off-screen right
            let spawnY;
            const ObjectClass = SPACE_OBJECT_CLASSES[type];
            if (!ObjectClass) {
                 console.error(`Invalid object class for type: ${type}`);
                 return;
            }

            // Determine Y position based on type (Rovers on ground, others airborne)
            if (type === 'rover') {
                // Calculate Y based on visual height to place it on the ground
                const tempInstance = new ObjectClass('temp', type, 0, 0, {}, this.groundLevelY);
                spawnY = this.groundLevelY - (tempInstance.drawHeight / 2); // Center on ground
            } else {
                 // Spawn airborne objects within a vertical range above ground
                const airbornePadding = 50; // Min distance from top/ground
                spawnY = Math.random() * (this.groundLevelY - airbornePadding * 2) + airbornePadding;
            }

            const initialState = {}; // Allow class constructors to set defaults

            // --- Create Instance & Sync Data ---
            const newId = `sobj-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
            const tempInstance = new ObjectClass(newId, type, spawnX, spawnY, initialState, this.groundLevelY);
            const syncData = tempInstance.getSyncData(); // Get initial data for network sync

            // --- Update Room State ---
            console.log(`Spawner ${this.networkManager.getClientId()} attempting to spawn ${type} (${newId})`);
            this.networkManager.updateRoomState({
                spaceObjects: {
                    [newId]: syncData // Add the new object to the room state
                }
            });
        }
    }

    getObject(id) {
        return this.activeObjects[id];
    }

    destroyObject(id, playerDestroyerId = null) {
        const obj = this.getObject(id);
        if (obj) {
             // Add score before removing
            if (playerDestroyerId && obj.scoreValue > 0) {
                const player = this.playerManager?.getPlayer(playerDestroyerId);
                if (player && player.lifecycleState === 'ACTIVE') { // Only score if player is active
                    player.addScore(obj.scoreValue);
                    console.log(`Player ${playerDestroyerId} awarded ${obj.scoreValue} points for destroying ${id}`);
                }
            }

            // Mark for local removal (though we delete immediately after sync request)
            obj.isMarkedForRemoval = true;

             // Trigger drops based on the destroyed object's state
             handleObjectDestructionDrop(obj, playerDestroyerId, this.collectibleManager);
             handleObjectDestructionPowerupDrop(obj, playerDestroyerId, this.powerupManager);

            // Send network update to remove the object from roomState
            this.networkManager.updateRoomState({
                spaceObjects: {
                    [id]: null // Setting to null removes the key
                }
            });
            console.log(`Space object ${id} removal requested via roomState.`);

            // Remove locally immediately AFTER requesting network removal
            delete this.activeObjects[id];

        } else {
             console.warn(`Attempted to destroy non-existent or already removed object: ${id}`);
        }
    }

     // Renamed for clarity - this is called by collision detectors
    handleDamageToObject(id, amount, playerDestroyerId = null) {
        const obj = this.getObject(id);
        if (!obj || obj.isMarkedForRemoval) return false; // Ignore if already gone

        // Apply damage locally first
        const wasDestroyed = obj.takeDamage(amount);

        if (wasDestroyed) {
            // If destroyed, trigger the full destruction logic (score, drops, network removal)
            this.destroyObject(id, playerDestroyerId);
            return true; // Indicate destruction
        } else {
            // If not destroyed, just update its state (health) in the room
            this.networkManager.updateRoomState({
                spaceObjects: {
                    [id]: obj.getSyncData() // Send updated data (including lower health)
                }
            });
            return false; // Indicate survived
        }
    }
    // Keep old name for compatibility if needed, but delegate
    applyDamageToObject(id, amount, playerDestroyerId = null) {
        return this.handleDamageToObject(id, amount, playerDestroyerId);
    }


    getActiveObjects() {
        return Object.values(this.activeObjects).filter(o => !o.isMarkedForRemoval);
    }

    getActiveObjectsMap() {
        const map = {};
        for (const id in this.activeObjects) {
            if (!this.activeObjects[id].isMarkedForRemoval) {
                map[id] = this.activeObjects[id];
            }
        }
        return map;
    }

    update(deltaTime) {
        let needsNetworkUpdate = false;
        const updates = {};

        for (const id in this.activeObjects) {
            const obj = this.activeObjects[id];

             // If object was marked for removal (e.g., by health sync), remove it now
            if (obj.isMarkedForRemoval) {
                 delete this.activeObjects[id];
                 continue;
            }

            obj.update(deltaTime, this.gameBounds, this.groundLevelY);

            // Check if object moved off-screen or other self-removal condition
            if (obj.isMarkedForRemoval) {
                console.log(`Object ${id} marked itself for removal (e.g., off-screen).`);
                updates[id] = null; // Mark for removal in room state
                needsNetworkUpdate = true;
                delete this.activeObjects[id]; // Remove locally
            }
            // Note: We don't sync position updates constantly for objects unless needed
        }

        // If any objects removed themselves, send a single roomState update
        if (needsNetworkUpdate) {
            this.networkManager.updateRoomState({ spaceObjects: updates });
        }

        // Let the designated spawner attempt to spawn new objects
        this.attemptSpawnObject(performance.now());
    }

    draw(ctx) {
        for (const id in this.activeObjects) {
            // Additional check here ensures we don't try drawing removed objects
            if (this.activeObjects[id] && !this.activeObjects[id].isMarkedForRemoval) {
                this.activeObjects[id].draw(ctx, this.assets, 1.0); // Assuming renderScale 1 for space objects
            }
        }
    }
}

export default SpaceObjectManager;