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
// Removed fixed SPAWN_INTERVAL
const MIN_SPAWN_INTERVAL = 2000; // Minimum time between spawn attempts (ms)
const MAX_SPAWN_INTERVAL = 5000; // Maximum time between spawn attempts (ms)
const MAX_ACTIVE_OBJECTS = 10;
const OBJECT_TYPES_TO_SPAWN = ['asteroid', 'lander', 'rover'];

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
        // Initialize nextSpawnTime instead of lastSpawnAttemptTime
        this.nextSpawnTime = performance.now() + Math.random() * (MAX_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL) + MIN_SPAWN_INTERVAL;


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
        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate.bind(this));
        this._initializeFromRoomState();
    }

    _initializeFromRoomState() {
        const roomState = this.networkManager.getRoomState();
        if (roomState && roomState.spaceObjects) {
            this._syncObjects(roomState.spaceObjects);
        }
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
                delete this.activeObjects[id];
            }
        }

        // Add/Update objects based on roomState
        for (const id of serverIds) {
            const data = objectData[id];
            if (!data || !data.type) {
                console.warn(`Invalid data for space object ${id} in roomState. Skipping.`);
                continue;
            }
            const ObjectClass = SPACE_OBJECT_CLASSES[data.type];
            if (!ObjectClass) {
                console.warn(`Unknown space object type "${data.type}" for ID ${id}. Skipping.`);
                continue;
            }

            if (!this.activeObjects[id]) {
                // Added groundLevelY to constructor call
                this.activeObjects[id] = new ObjectClass(id, data.type, data.x, data.y, data, this.groundLevelY);
            } else {
                // Update existing state from synced data
                const localObj = this.activeObjects[id];
                localObj.x = data.x;
                localObj.y = data.y;
                localObj.rotation = data.rotation ?? localObj.rotation;
                localObj.health = data.health ?? localObj.health;
                localObj.scoreValue = data.scoreValue ?? localObj.scoreValue;

                // Update subtype specific properties if needed
                if (localObj instanceof Lander && data.baseY !== undefined) {
                    localObj.baseY = data.baseY;
                }
                // Ensure groundLevelY is consistent for Rovers
                if (localObj instanceof Rover) {
                    localObj.y = this.groundLevelY - (localObj.drawHeight / 2);
                }
            }
        }
    }


    attemptSpawnObject(currentTime) {
        // Only the "first" client attempts to spawn to avoid duplicates
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        // Ensure there are peers and this client is the first one alphabetically by ID
        if (!peerIds.length || this.networkManager.getClientId() !== peerIds[0]) {
            return; // Not the designated spawner
        }

        const numActive = Object.keys(this.activeObjects).length;
        if (numActive >= MAX_ACTIVE_OBJECTS) {
            // If max objects reached, still schedule next attempt
            this.nextSpawnTime = currentTime + Math.random() * (MAX_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL) + MIN_SPAWN_INTERVAL;
            return;
        }

        // Check if it's time to attempt a spawn
        if (currentTime >= this.nextSpawnTime) {
             // Schedule the *next* attempt time immediately after deciding to spawn
            this.nextSpawnTime = currentTime + Math.random() * (MAX_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL) + MIN_SPAWN_INTERVAL;


            if (OBJECT_TYPES_TO_SPAWN.length === 0) return; // No types defined to spawn

            // Select a random type to spawn
            const type = OBJECT_TYPES_TO_SPAWN[Math.floor(Math.random() * OBJECT_TYPES_TO_SPAWN.length)];

            // Determine spawn position
            let spawnX = this.gameWidth + 100; // Spawn off-screen right
            let spawnY;

            const ObjectClass = SPACE_OBJECT_CLASSES[type];
            if (!ObjectClass) {
                 console.error(`Invalid space object type selected for spawn: ${type}`);
                 return; // Should not happen if OBJECT_TYPES_TO_SPAWN is valid
            }

            // Handle specific spawn Y for rovers (on ground)
            if (type === 'rover') {
                 // Create a temporary instance to get its visual height for positioning
                 // Pass dummy initial state, but correct groundLevelY
                const tempInstance = new ObjectClass('temp-rover', type, 0, 0, {}, this.groundLevelY);
                // Position its center slightly above the ground
                spawnY = this.groundLevelY - (tempInstance.drawHeight / 2);
            } else {
                // Random Y for asteroids and landers (within a range above ground)
                const topSpawnMargin = 50;
                const bottomSpawnMargin = 100; // Ensure they don't spawn right on the ground line
                spawnY = Math.random() * (this.groundLevelY - topSpawnMargin - bottomSpawnMargin) + topSpawnMargin;
            }

            // Generate a unique ID
            const newId = `sobj-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;

            // Create a temporary instance to get its default sync data
            // Pass correct groundLevelY for accurate initialization
            const tempInstance = new ObjectClass(newId, type, spawnX, spawnY, {}, this.groundLevelY);
            const syncData = tempInstance.getSyncData();

            console.log(`Client ${this.networkManager.getClientId()} attempting to spawn ${type} (${newId})`);

            // Send update to room state
            this.networkManager.updateRoomState({
                spaceObjects: {
                    [newId]: syncData
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
            // Add score to the player who destroyed it
            if (playerDestroyerId && obj.scoreValue > 0) {
                const player = this.playerManager?.getPlayer(playerDestroyerId);
                if (player) {
                    player.addScore(obj.scoreValue);
                }
            }

            // Trigger item/powerup drops
            handleObjectDestructionDrop(obj, playerDestroyerId, this.collectibleManager);
            handleObjectDestructionPowerupDrop(obj, playerDestroyerId, this.powerupManager);

            // Mark for local removal and remove from active list
            obj.isMarkedForRemoval = true;
            delete this.activeObjects[id];

            // Update room state to remove the object
            this.networkManager.updateRoomState({
                spaceObjects: {
                    [id]: null // Setting to null removes the key
                }
            });
            console.log(`Space object ${id} destroyed removed from roomState.`);
        }
    }

    applyDamageToObject(id, amount, playerDestroyerId = null) {
        const obj = this.getObject(id);
        if (obj) {
            const wasDestroyed = obj.takeDamage(amount);
            if (wasDestroyed) {
                // Destruction logic (scoring, drops) is handled in destroyObject
                this.destroyObject(id, playerDestroyerId);
                return true; // Indicate destruction
            } else {
                // Update room state with new health if not destroyed
                this.networkManager.updateRoomState({
                    spaceObjects: {
                        [id]: obj.getSyncData() // Send updated state (including health)
                    }
                });
            }
        }
        return false; // Indicate survival (or object didn't exist)
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
        let needsRoomStateUpdate = false;
        const updatePayload = {};

        for (const id in this.activeObjects) {
            const obj = this.activeObjects[id];
            obj.update(deltaTime, this.gameBounds, this.groundLevelY);

            // Check if object removed itself (e.g., went off-screen)
            if (obj.isMarkedForRemoval) {
                // Check if it's still in the *synced* state before requesting removal
                const currentRoomState = this.networkManager.getRoomState();
                 if (currentRoomState?.spaceObjects?.[id]) {
                    updatePayload[id] = null; // Mark for removal in room state
                    needsRoomStateUpdate = true;
                    console.log(`Object ${id} marked itself for removal. Notifying network.`);
                 }
                 // Remove locally regardless
                 delete this.activeObjects[id];
            }
        }

        // Send batched removal update if needed
        if (needsRoomStateUpdate) {
             this.networkManager.updateRoomState({ spaceObjects: updatePayload });
        }


        // Only the designated client attempts to spawn new objects
        this.attemptSpawnObject(performance.now());
    }


    draw(ctx) {
        for (const id in this.activeObjects) {
            // Ensure assets are loaded before drawing
             if (this.assets.space_objects) {
                 this.activeObjects[id].draw(ctx, this.assets, 1.0); // Assuming renderScale=1 for space objects base draw
             }
        }
    }
}

export default SpaceObjectManager;