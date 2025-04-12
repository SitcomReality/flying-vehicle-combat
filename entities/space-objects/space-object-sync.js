// Space object synchronization logic module

import { SpaceObject } from './space-object.js';
import { Asteroid } from './space-object-types/asteroid.js';
import { Lander } from './space-object-types/lander.js';
import { Rover } from './space-object-types/rover.js';
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
        console.log("Initializing space objects from initial room state:", Object.keys(roomState.spaceObjects).length, "objects found");
        syncSpaceObjects(activeObjects, roomState.spaceObjects, networkManager.getClientId(), groundLevelY);
    } else {
        console.log("No initial space objects found in room state.");
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
        if (Object.keys(objectData).length > 0) {
            console.log(`[SpaceObjSync] Received update with ${Object.keys(objectData).length} space objects`);
        }
        syncSpaceObjects(activeObjects, objectData, myClientId, groundLevelY);
    }
}

/**
 * FIX: Improved synchronization with better error handling and logging
 * Synchronizes the local activeObjects map with the data received from the network.
 * Creates, updates, or removes local SpaceObject instances based on the network data.
 * @param {object} activeObjects - The activeObjects map from SpaceObjectManager.
 * @param {object} objectData - The spaceObjects data from the room state.
 * @param {string} myClientId - The local client's ID.
 * @param {number} groundLevelY - The ground level Y coordinate.
 */
export function syncSpaceObjects(activeObjects, objectData, myClientId, groundLevelY) {
    if (!objectData) return;
    
    const currentIds = new Set(Object.keys(activeObjects));
    const serverIds = new Set(Object.keys(objectData).filter(id => objectData[id] !== null));
    let changed = false;
    const now = performance.now();

    // Step 1: Remove objects explicitly marked as null in the network data
    for (const id of Object.keys(objectData)) {
        if (objectData[id] === null && activeObjects[id]) {
            console.log(`[SpaceObjSync] Removing object ${id} due to explicit null`);
            delete activeObjects[id];
            changed = true;
            currentIds.delete(id);
        }
    }

    // Step 2: Add or update objects based on network data
    for (const id of serverIds) {
        const data = objectData[id];
        // Skip null entries (already handled)
        if (!data) continue;

        // Basic validation
        if (!data.type || typeof data.x !== 'number' || typeof data.y !== 'number' || 
            typeof data.vx !== 'number' || typeof data.vy !== 'number') {
            console.warn(`[SpaceObjSync] Invalid data for space object ${id}. Skipping.`);
            continue;
        }

        const ObjectClass = SPACE_OBJECT_CLASSES[data.type];
        if (!ObjectClass) {
            console.warn(`[SpaceObjSync] Unknown space object type "${data.type}" for ID ${id}. Skipping.`);
            continue;
        }

        if (!activeObjects[id]) {
            // Create new object if it doesn't exist locally
            try {
                console.log(`[SpaceObjSync] Creating new object ${id} of type ${data.type}`);
                
                // Create with proper initialization
                const newObj = new ObjectClass(id, data.type, data.x, data.y, data, groundLevelY);
                
                // Initialize server state and fix any inconsistencies
                newObj.serverX = data.x;
                newObj.serverY = data.y;
                newObj.serverVx = data.vx;
                newObj.serverVy = data.vy;
                newObj.serverRotation = data.rotation ?? 0;
                newObj.serverHealth = data.health ?? newObj.health;
                newObj.lastServerUpdateTime = now;
                
                // Add to active objects
                activeObjects[id] = newObj;
                currentIds.add(id);
                changed = true;
            } catch (error) {
                console.error(`[SpaceObjSync] Error creating object ${id}:`, error);
            }
        } else {
            // Update existing object
            const localObj = activeObjects[id];
            
            // Update server state variables used for interpolation
            localObj.serverX = data.x;
            localObj.serverY = data.y;
            localObj.serverVx = data.vx;
            localObj.serverVy = data.vy;
            localObj.serverRotation = data.rotation ?? localObj.serverRotation;
            localObj.serverHealth = data.health ?? localObj.serverHealth;
            localObj.scoreValue = data.scoreValue ?? localObj.scoreValue;
            localObj.lastServerUpdateTime = now;

            // Check health status
            if (localObj.serverHealth <= 0 && !localObj.isMarkedForRemoval) {
                console.log(`[SpaceObjSync] Marking object ${id} for removal based on server health`);
                localObj.isMarkedForRemoval = true;
                changed = true;
            } else if (localObj.serverHealth > 0 && localObj.isMarkedForRemoval) {
                console.log(`[SpaceObjSync] Un-marking ${id} - server shows it alive`);
                localObj.isMarkedForRemoval = false;
                changed = true;
            }

            // Handle type-specific properties
            if (localObj instanceof Lander && data.baseY !== undefined && localObj.baseY !== data.baseY) {
                localObj.baseY = data.baseY;
                changed = true;
            }
        }
    }
    
    // Step 3: Remove local objects not in server data (for cleanup)
    for (const id of currentIds) {
        if (!serverIds.has(id)) {
            console.log(`[SpaceObjSync] Removing local object ${id} - not in server data`);
            delete activeObjects[id];
            changed = true;
        }
    }

    // Log sync completion
    if (changed || Math.random() < 0.1) {
        console.log(`[SpaceObjSync] After sync: ${Object.keys(activeObjects).length} active objects`);
    }
}