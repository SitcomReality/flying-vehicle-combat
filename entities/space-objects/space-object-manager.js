// Manages active space objects in the game world

import { SpaceObject } from './space-object.js';
import { Asteroid } from './space-object-types/asteroid.js'; 
// Import Lander and Rover later when created
// import { Lander } from './space-object-types/lander.js';
// import { Rover } from './space-object-types/rover.js';
// Import the new drop system handler
import { handleObjectDestructionDrop } from '../collectibles/drop-system.js';

// Map types to classes for easy instantiation
const SPACE_OBJECT_CLASSES = {
    'asteroid': Asteroid,
    // 'lander': Lander,
    // 'rover': Rover,
};

// Spawn configuration (basic example)
const SPAWN_INTERVAL = 5000; // Try to spawn every 5 seconds
const MAX_ACTIVE_OBJECTS = 8;
const OBJECT_TYPES_TO_SPAWN = ['asteroid']; // Only spawn asteroids for now
// Removed collectible drop chance - now handled in drop-system.js

class SpaceObjectManager {
    // Added collectibleManager and playerManager dependencies
    constructor(networkManager, assets, gameWidth, gameHeight, groundLevelY, collectibleManager, playerManager) {
        this.networkManager = networkManager;
        this.assets = assets;
        this.gameWidth = gameWidth;
        this.gameHeight = gameHeight;
        this.groundLevelY = groundLevelY;
        this.gameBounds = { width: gameWidth, height: gameHeight };
        this.collectibleManager = collectibleManager; // Store reference
        this.playerManager = playerManager; // Store reference for scoring

        this.activeObjects = {}; // Stores local SpaceObject instances { id: SpaceObject }
        this.lastSpawnAttemptTime = 0;

        if (!this.collectibleManager) {
            console.error("SpaceObjectManager requires a CollectibleManager instance for drops!");
        }
         if (!this.playerManager) {
             console.error("SpaceObjectManager requires a PlayerManager instance for scoring!");
         }

        // Listen for room state changes to sync objects
        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate.bind(this));
        this._initializeFromRoomState(); // Initial sync
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
                // console.log(`Removing space object ${id} locally.`); // Reduced logging
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
                // Create new object instance
                // console.log(`Creating a new space object instance ${id} of ${data.type}`); // Reduced logging
                this.activeObjects[id] = new ObjectClass(id, data.type, data.x, data.y, data); // Pass all data as initial state
            } else {
                // Update existing local instance (simple position/health/score update for now)
                const localObj = this.activeObjects[id];
                 // Avoid excessive updates, maybe interpolate later?
                 // For now, snap position and update state.
                localObj.x = data.x; 
                localObj.y = data.y;
                localObj.rotation = data.rotation ?? localObj.rotation;
                localObj.health = data.health ?? localObj.health;
                localObj.scoreValue = data.scoreValue ?? localObj.scoreValue; // Sync score value
                // Update other state if needed
            }
        }
    } 

    // Spawning logic (simplified, needs leader election or similar for multiplayer safety)
    // For now, any client might try to spawn. Last write wins via roomState.
    attemptSpawnObject(currentTime) {
        // Simple check: only let the "first" player spawn (naïve leader election)
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        // Corrected leader election logic
        if (!peerIds.length || this.networkManager.getClientId() !== peerIds[0]) {
            return; // Only the "leader" spawns
        }

        const numActive = Object.keys(this.activeObjects).length;
        if (numActive >= MAX_ACTIVE_OBJECTS) {
            return; // Max limit reached
        }

        if (currentTime - this.lastSpawnAttemptTime > SPAWN_INTERVAL) {
            this.lastSpawnAttemptTime = currentTime;

            // Choose a random type from the allowed list
             if (OBJECT_TYPES_TO_SPAWN.length === 0) return;
            const type = OBJECT_TYPES_TO_SPAWN[Math.floor(Math.random() * OBJECT_TYPES_TO_SPAWN.length)];

            // Choose spawn position (off-screen right, random Y)
            const spawnX = this.gameWidth + 100; // Start off-screen
            const spawnY = Math.random() * (this.groundLevelY - 50) + 25; // Avoid edges ground

            // Create initial state for the new object (can be customized by type later)
            const initialState = {
                 // Example: customize initial velocity or rotation based on type
                 // vx: type === 'asteroid' ? -75 : -50,
            };

            const newId = `sobj-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
            // console.log(`Attempting to spawn space object ${newId} (${type}) at ${spawnX.toFixed(0)},${spawnY.toFixed(0)}`); // Reduced logging

             // Get the initial sync data for the object type
            const ObjectClass = SPACE_OBJECT_CLASSES[type];
             if (!ObjectClass) return; // Should not happen if type is from OBJECT_TYPES_TO_SPAWN
             // Create a temporary instance just get its initial sync data
             const tempInstance = new ObjectClass(newId, type, spawnX, spawnY, initialState);
             const syncData = tempInstance.getSyncData();

            // Update room state to add the new object
            this.networkManager.updateRoomState({
                spaceObjects: {
                    [newId]: syncData // Send the full initial state
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
            obj.isMarkedForRemoval = true; // Mark for local cleanup

            // --- Call Drop System ---
            handleObjectDestructionDrop(obj, playerDestroyerId, this.collectibleManager);
            // --- End Drop System Call ---

            delete this.activeObjects[id]; // Remove immediately from local active list

            // Trigger removal from roomState
            this.networkManager.updateRoomState({
                spaceObjects: {
                    [id]: null // Set to null to remove
                }
            });
            console.log(`Space object ${id} destroyed removed from roomState.`);
        }
    }

    applyDamageToObject(id, amount, playerDestroyerId = null) {
        const obj = this.getObject(id);
        if (obj && obj.takeDamage(amount)) { // takeDamage returns true if destroyed
            this.destroyObject(id, playerDestroyerId); // Call destroyObject here
            return true; // Indicate destruction
        } else if (obj) { 
             // Damaged but not destroyed, update roomState with new health
            this.networkManager.updateRoomState({
                spaceObjects: {
                    [id]: obj.getSyncData() // Send updated state
                }
            });
        }
        return false; // Indicate not destroyed (or object not found)
    }

    getActiveObjects() {
        // Return suitable for collision detection/drawing
        return Object.values(this.activeObjects).filter(o => !o.isMarkedForRemoval);
    }

    getActiveObjectsMap() { 
        // Return objects as a map { id: object }
        const map = {};
        for (const id in this.activeObjects) {
            if (!this.activeObjects[id].isMarkedForRemoval) {
                map[id] = this.activeObjects[id];
            }
        }
        return map;
    }

    update(deltaTime) {
        // Update local object logic (movement, animation, etc.)
        for (const id in this.activeObjects) {
            const obj = this.activeObjects[id];
            obj.update(deltaTime, this.gameBounds, this.groundLevelY);
            if (obj.isMarkedForRemoval) {
                // Object removed itself (e.g., went off-screen)
                // We need to notify the network unless it was already removed via sync
                const roomState = this.networkManager.getRoomState();
                if (roomState?.spaceObjects?.[id]) {
                    console.log(`Object ${id} marked itself for removal. Notifying network.`);
                    this.networkManager.updateRoomState({
                        spaceObjects: {
                            [id]: null
                        }
                    });
                    // No drop if object removes itself (e.g, off-screen)
                }
                delete this.activeObjects[id];
            }
        }

        // Attempt to spawn new objects (basic implementation)
        this.attemptSpawnObject(performance.now());
    }

    draw(ctx) {
        for (const id in this.activeObjects) { 
            this.activeObjects[id].draw(ctx, this.assets, 1.0); // Pass scale 1.0 for now
        }
    }
}

export default SpaceObjectManager;