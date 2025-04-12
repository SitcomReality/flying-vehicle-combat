// New file: Handles network synchronization logic for SpaceObjectManager

import { SpaceObject } from './space-object.js';
import { Asteroid } from './space-object-types/asteroid.js';
import { Lander } from './space-object-types/lander.js';
import { Rover } from './space-object-types/rover.js';
// Import snap threshold constant
import { INTERPOLATION_SNAP_THRESHOLD_SQ } from './space-object.js';

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
    const now = performance.now(); // Get timestamp for updates

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
                // Initialize server state immediately on creation
                newObj.serverX = data.x;
                newObj.serverY = data.y;
                newObj.serverRotation = data.rotation ?? 0;
                newObj.serverHealth = data.health ?? newObj.health;
                newObj.lastServerUpdateTime = now;
                activeObjects[id] = newObj;
                changed = true;
            } catch (error) {
                console.error(`[SpaceObjSync ${myClientId}] Error creating object ${id} of type ${data.type}:`, error);
                continue;
            }
        } else {
            // Update existing object
            const localObj = activeObjects[id];
            // Update server state variables used for interpolation
            localObj.serverX = data.x;
            localObj.serverY = data.y;
            localObj.serverRotation = data.rotation ?? localObj.serverRotation;
            localObj.serverHealth = data.health ?? localObj.serverHealth; // Use server health
            localObj.scoreValue = data.scoreValue ?? localObj.scoreValue; // Sync score value
            localObj.lastServerUpdateTime = now;

            // Sync velocities if needed for interpolation (currently commented out in object)
            // localObj.serverVx = data.vx ?? localObj.serverVx;
            // localObj.serverVy = data.vy ?? localObj.serverVy;

            // Check if health <= 0 from server, mark for removal locally (visuals will fade/stop)
            // The object will be fully deleted when the server sends 'null'
            if (localObj.serverHealth <= 0 && !localObj.isMarkedForRemoval) {
                localObj.isMarkedForRemoval = true; // Mark visually dead based on server health
                changed = true;
            } else if (localObj.serverHealth > 0 && localObj.isMarkedForRemoval && objectData[id] !== null) {
                // Un-mark if server says it's alive again (and hasn't been explicitly removed via null)
                 console.log(`[SpaceObjSync ${myClientId}] Un-marking ${id} for removal as server data shows it alive.`);
                 localObj.isMarkedForRemoval = false;
                 changed = true;
            }

             // --- Snap Check ---
             const dx = localObj.serverX - localObj.x;
             const dy = localObj.serverY - localObj.y;
             const distSq = dx*dx + dy*dy;
             if (distSq > INTERPOLATION_SNAP_THRESHOLD_SQ) {
                 // console.log(`Snapping object ${id} due to large distance.`);
                 localObj.x = localObj.serverX;
                 localObj.y = localObj.serverY;
                 localObj.rotation = localObj.serverRotation;
                 localObj.health = localObj.serverHealth; // Snap health too
             }
             // --- End Snap Check ---

            // Handle subtype-specific properties (example)
            if (localObj instanceof Lander && data.baseY !== undefined && localObj.baseY !== data.baseY) {
                localObj.baseY = data.baseY;
                changed = true;
            }
            // Ensure rover stays grounded (already handled in Rover.update based on groundLevelY,
            // but sync might place it slightly off, let interpolation handle it)
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