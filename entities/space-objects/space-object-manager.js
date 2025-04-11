// New file: Manages active space objects in the game world

import { SpaceObject } from './space-object.js';
import { Asteroid } from './space-object-types/asteroid.js'; // Import specific types
// Import Lander and Rover later when created
// import { Lander } from './space-object-types/lander.js';
// import { Rover } from './space-object-types/rover.js';

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
const COLLECTIBLE_DROP_CHANCE = 0.6; // 60% chance to drop something

class SpaceObjectManager {
    // Added collectibleManager dependency
    constructor(networkManager, assets, gameWidth, gameHeight, groundLevelY, collectibleManager) {
        this.networkManager = networkManager;
        this.assets = assets;
        this.gameWidth = gameWidth;
        this.gameHeight = gameHeight;
        this.groundLevelY = groundLevelY;
        this.gameBounds = { width: gameWidth, height: gameHeight };
        this.collectibleManager = collectibleManager; // Store reference

        this.activeObjects = {}; // Stores local SpaceObject instances { id: SpaceObject }
        this.lastSpawnAttemptTime = 0;

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
                console.log(`Removing space object ${id} locally.`);
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
                // Create new local instance
                console.log(`Creating new local space object instance ${id} of type ${data.type}`);
                this.activeObjects[id] = new ObjectClass(id, data.type, data.x, data.y, data); // Pass all data as initial state
            } else {
                // Update existing local instance (simple position/health update for now)
                const localObj = this.activeObjects[id];
                 // Avoid excessive updates, maybe interpolate later?
                 // For now, snap position and update health.
                localObj.x = data.x;
                localObj.y = data.y;
                localObj.rotation = data.rotation ?? localObj.rotation;
                localObj.health = data.health ?? localObj.health;
                // Update other state if needed
            }
        }
    }

    // Spawning logic (simplified, needs leader election or similar for multiplayer safety)
    // For now, any client might try to spawn. Last write wins via roomState.
    attemptSpawnObject(currentTime) {
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
            const spawnY = Math.random() * (this.groundLevelY - 50) + 25; // Avoid edges and ground

            // Create initial state for the new object (can be customized by type later)
            const initialState = {
                 // Example: customize initial velocity or rotation based on type
                 // vx: type === 'asteroid' ? -75 : -50,
            };

            const newId = `sobj-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
            console.log(`Attempting to spawn space object ${newId} (${type}) at ${spawnX.toFixed(0)},${spawnY.toFixed(0)}`);

             // Get the initial sync data for the object type
            const ObjectClass = SPACE_OBJECT_CLASSES[type];
             if (!ObjectClass) return; // Should not happen if type is from OBJECT_TYPES_TO_SPAWN
             // Create a temporary instance just to get its initial sync data
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

    // Destroys an object locally and notifies the network
    destroyObject(id) {
        const obj = this.activeObjects[id];
        if (obj) {
            obj.isMarkedForRemoval = true; // Mark for local cleanup
            delete this.activeObjects[id]; // Remove immediately from local active list

            // Trigger removal from roomState
            this.networkManager.updateRoomState({
                spaceObjects: {
                    [id]: null // Set to null to remove
                }
            });
            console.log(`Space object ${id} destroyed and removed from roomState.`);

            // TODO: Trigger collectible drop based on obj.type?
        }
    }

    // Called when an object takes damage (e.g., from a projectile)
    applyDamageToObject(id, amount) {
        const obj = this.getObject(id);
        if (obj && obj.takeDamage(amount)) { // takeDamage returns true if destroyed
            this.destroyObject(id); // Destroy and notify network
            return true; // Indicate destruction
        }
        // If damaged but not destroyed, update roomState with new health
        else if (obj) {
            this.networkManager.updateRoomState({
                spaceObjects: {
                    [id]: obj.getSyncData() // Send updated state
                }
            });
        }
        return false; // Indicate not destroyed (or object not found)
    }

    getActiveObjects() {
        // Return objects suitable for collision detection/drawing
        return Object.values(this.activeObjects).filter(o => !o.isMarkedForRemoval);
    }

    getActiveObjectsMap() {
        // Return objects as a map { id: object }
        const map = {};
        for(const id in this.activeObjects) {
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