// New file: Handles network synchronization logic for SpaceObjectManager

import { SpaceObject } from './space-object.js';
import { Asteroid } from './space-object-types/asteroid.js';
import { Lander } from './space-object-types/lander.js';
import { Rover } from './space-object-types/rover.js';

// Map types to classes for easy instantiation (kept local to this module)
const SPACE_OBJECT_CLASSES = {
    'asteroid': Asteroid,
    'lander': Lander,
    'rover': Rover,
};

/**
 * Initializes the space object state from the initial room state.
 * @param {object} activeObjects - The activeObjects map from SpaceObjectManager.
 * @param {NetworkManager} networkManager - The network manager instance.
 * @param {number} groundLevelY - The ground level Y coordinate.
 */
export function initializeSpaceObjectsFromRoomState(activeObjects, networkManager, groundLevelY) {
    const roomState = networkManager.getRoomState();
    if (roomState && roomState.spaceObjects && Object.keys(roomState.spaceObjects).length > 0) {
        console.log("Attempting immediate initialization of space objects from room state:", JSON.stringify(Object.keys(roomState.spaceObjects)));
        syncSpaceObjects(activeObjects, roomState.spaceObjects, networkManager.getClientId(), groundLevelY);
    } else {
        console.log("No initial space objects found in room state during immediate check.");
    }
}

/**
 * Handles incoming room state updates specifically for space objects.
 * @param {object} activeObjects - The activeObjects map from SpaceObjectManager.
 * @param {object} roomState - The updated room state object.
 * @param {string} myClientId - The local client's ID.
 * @param {number} groundLevelY - The ground level Y coordinate.
 */
export function handleSpaceObjectRoomStateUpdate(activeObjects, roomState, myClientId, groundLevelY) {
    if (roomState.hasOwnProperty('spaceObjects')) {
        const objectData = roomState.spaceObjects || {};
        syncSpaceObjects(activeObjects, objectData, myClientId, groundLevelY);
    }
}


/**
 * Synchronizes the local activeObjects map with the data received from the network.
 * Creates, updates, or removes local SpaceObject instances based on the network data.
 * @param {object} activeObjects - The activeObjects map from SpaceObjectManager.
 * @param {object} objectData - The spaceObjects data from the room state.
 * @param {string} myClientId - The local client's ID.
 * @param {number} groundLevelY - The ground level Y coordinate.
 */
export function syncSpaceObjects(activeObjects, objectData, myClientId, groundLevelY) {
    const currentIds = Object.keys(activeObjects);
    const serverIds = Object.keys(objectData);
    let changed = false;

    // Remove objects explicitly marked as null in the network data
    for (const id of currentIds) {
        if (objectData[id] === null) {
            if (activeObjects[id]) {
                // console.log(`[SpaceObjSync ${myClientId}] Removing object ${id} due to explicit null`);
                delete activeObjects[id];
                changed = true;
            }
        }
    }

    // Add or update objects based on network data
    for (const id of serverIds) {
        const data = objectData[id];
        if (data === null) continue; // Skip null entries (already handled removal)

        // Basic validation of network data
        if (!data || !data.type || typeof data.x !== 'number' || typeof data.y !== 'number') {
            console.warn(`[SpaceObjSync ${myClientId}] Invalid data for space object ${id}. Skipping. Data:`, data);
            if (activeObjects[id]) delete activeObjects[id]; // Remove potentially broken local instance
            changed = true;
            continue;
        }
        const ObjectClass = SPACE_OBJECT_CLASSES[data.type];
        if (!ObjectClass) {
            console.warn(`[SpaceObjSync ${myClientId}] Unknown space object type "${data.type}" for ID ${id}. Skipping.`);
            if (activeObjects[id]) delete activeObjects[id];
            changed = true;
            continue;
        }

        if (!activeObjects[id]) {
            // Create new object if it doesn't exist locally
            // Don't create if it's already marked as destroyed in the network data
            if (data.health !== undefined && data.health <= 0) {
                continue;
            }
            try {
                // console.log(`[SpaceObjSync ${myClientId}] Creating new object ${id} of type ${data.type} at (${data.x.toFixed(0)}, ${data.y.toFixed(0)})`);
                const newObj = new ObjectClass(id, data.type, data.x, data.y, data, groundLevelY);
                if (!newObj || !newObj.id) {
                    console.error(`[SpaceObjSync ${myClientId}] FAILED to create object ${id} - Constructor returned invalid object.`);
                    continue;
                }
                activeObjects[id] = newObj;
                changed = true;
            } catch (error) {
                console.error(`[SpaceObjSync ${myClientId}] Error creating object ${id} of type ${data.type}:`, error);
                continue;
            }
        } else {
            // Update existing object
            const localObj = activeObjects[id];
            // If network data shows health <= 0, mark for removal locally (but don't delete yet, wait for explicit null)
            if (data.health !== undefined && data.health <= 0) {
                if (!localObj.isMarkedForRemoval) {
                    localObj.isMarkedForRemoval = true;
                    changed = true;
                }
                continue; // Don't apply further state updates if marked for removal
            }
            // Check if relevant properties have changed
            if (localObj.x !== data.x || localObj.y !== data.y || localObj.vx !== data.vx || localObj.vy !== data.vy || localObj.rotation !== data.rotation || localObj.health !== data.health || localObj.scoreValue !== data.scoreValue) {
                localObj.x = data.x;
                localObj.y = data.y;
                localObj.vx = data.vx ?? localObj.vx;
                localObj.vy = data.vy ?? localObj.vy;
                localObj.rotation = data.rotation ?? localObj.rotation;
                localObj.health = data.health ?? localObj.health;
                localObj.scoreValue = data.scoreValue ?? localObj.scoreValue;
                changed = true;
                // Handle subtype-specific properties
                if (localObj instanceof Lander && data.baseY !== undefined && localObj.baseY !== data.baseY) {
                    localObj.baseY = data.baseY;
                }
                if (localObj instanceof Rover) {
                     // Ensure rover stays grounded visually based on sync data (spawner dictates position)
                    localObj.y = groundLevelY - (localObj.drawHeight / 2);
                }
            }
             // Reset removal flag if object is no longer marked as dead on server
             // (e.g., race condition where server revived it before client got null)
             if (localObj.isMarkedForRemoval && (data.health === undefined || data.health > 0)) {
                  console.log(`[SpaceObjSync ${myClientId}] Un-marking ${id} for removal as server data shows it alive.`);
                  localObj.isMarkedForRemoval = false;
                  changed = true;
             }
        }
    }
    // Log active count after sync for debugging
    // if (changed || Math.random() < 0.01) { // Log on change or occasionally
    //     console.log(`[SpaceObjSync ${myClientId}] Active objects after sync: ${Object.keys(activeObjects).length}`);
    // }
}

// --- Code removed from space-object-manager.js and adapted for this module ---
// _handleRoomStateUpdate -> handleSpaceObjectRoomStateUpdate
// _syncObjects -> syncSpaceObjects
// _initializeFromRoomState -> initializeSpaceObjectsFromRoomState