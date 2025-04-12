// Manages active space objects in the game world

import { SpaceObject } from './space-object.js';
import { Asteroid } from './space-object-types/asteroid.js';
import { Lander } from './space-object-types/lander.js';
import { Rover } from './space-object-types/rover.js';
import { handleObjectDestructionDrop, handleObjectDestructionPowerupDrop } from '../collectibles/drop-system.js';
import { SPRITES } from '../../assets.js';

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
        // Setup subscription - this should call back immediately with the current state
        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate.bind(this));
    }

    // Track the current list of peers to determine the spawner
    _handlePresenceUpdate(presence) {
        // The presence update implicitly updates networkManager.peers
        // No specific action needed here other than letting the spawner check work
    }

    _handleRoomStateUpdate(roomState) {
        // Check if spaceObjects exists in the update
        if (roomState.hasOwnProperty('spaceObjects')) {
            const objectData = roomState.spaceObjects || {};
            // console.log(`[SpaceObjMgr ${this.networkManager.getClientId()}] Received room state update for spaceObjects.`); // Reduce log noise
            this._syncObjects(objectData);
        } else if (!roomState.spaceObjects && Object.keys(this.activeObjects).length > 0) {
            // Handle case where the entire key is removed server-side (e.g., room reset)
            console.log(`[SpaceObjMgr ${this.networkManager.getClientId()}] 'spaceObjects' key missing in roomState update. Clearing local objects.`);
            this.activeObjects = {};
        }
    }

    // Syncs local objects with server data
    _syncObjects(objectData) {
        const currentIds = Object.keys(this.activeObjects);
        const myClientId = this.networkManager.getClientId(); // Cache client ID
        const serverIds = Object.keys(objectData);
        let changed = false;

        // Remove local objects that are no longer in roomState
        for (const id of currentIds) {
            if (!objectData[id]) {
                // Make sure it exists locally before deleting
                if (this.activeObjects[id]) {
                    // console.log(`[SpaceObjMgr ${myClientId}] Removing space object ${id} locally as it's gone from roomState.`);
                    delete this.activeObjects[id];
                    changed = true;
                }
            }
        }

        // Add/Update objects based on roomState
        for (const id of serverIds) {
            const data = objectData[id];
            // Basic validation of incoming data
            if (!data || !data.type || typeof data.x !== 'number' || typeof data.y !== 'number') {
                console.warn(`[SpaceObjMgr ${myClientId}] Invalid data for space object ${id}. Skipping. Data:`, data);
                // Also remove locally if invalid data received for existing object
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
                // Check if we received health <= 0 data - don't create if already destroyed server-side
                if (data.health !== undefined && data.health <= 0) {
                    // console.log(`[SpaceObjMgr ${myClientId}] Skipping creation of ${id}, already destroyed in roomState.`);
                    continue;
                }
                // --- Create new local object ---
                // console.log(`[SpaceObjMgr ${myClientId}] Sync: Attempting to create local object ${id} type ${data.type}`); // Reduce log noise
                try {
                    // Pass the *entire* data object as initialState. The constructor should handle defaults.
                    const newObj = new ObjectClass(id, data.type, data.x, data.y, data, this.groundLevelY);
                    // Ensure constructor succeeded before proceeding
                    if (!newObj || !newObj.id) { // Check if creation actually succeeded
                        console.error(`[SpaceObjMgr ${myClientId}] Sync: FAILED to create local object ${id} - Constructor returned invalid object.`);
                        continue; // Skip adding this invalid object
                    }
                    this.activeObjects[id] = newObj;
                    changed = true;
                    // console.log(`[SpaceObjMgr ${myClientId}] Sync: Successfully created ${id}. Pos:(${this.activeObjects[id].x.toFixed(0)}, ${this.activeObjects[id].y.toFixed(0)}), Vel:(${this.activeObjects[id].vx.toFixed(1)}, ${this.activeObjects[id].vy.toFixed(1)})`); // Reduce log noise
                } catch (error) {
                    console.error(`[SpaceObjMgr ${myClientId}] Sync: Error creating local object ${id} of type ${data.type}:`, error);
                    // Don't add to activeObjects if constructor failed
                    continue;
                }
            } else {
                // --- Update existing local object ---
                const localObj = this.activeObjects[id];
                // Defensive check
                if (!localObj) continue;

                // If health is 0 or less from server, mark for removal locally too
                if (data.health !== undefined && data.health <= 0) {
                    if (!localObj.isMarkedForRemoval) {
                        // console.log(`[SpaceObjMgr ${myClientId}] Marking space object ${id} for removal due to roomState health <= 0.`);
                        localObj.isMarkedForRemoval = true; // Mark for removal, will be cleaned up in update loop
                        changed = true;
                    }
                    continue; // Don't process further updates if marked for removal
                }

                // Update properties - Apply server state authoritatively
                // Check for significant changes before updating to potentially reduce overhead
                // Sync more frequently to prevent visual jumps
                const needsUpdate = (
                    Math.abs(localObj.x - data.x) > 1 ||
                    Math.abs(localObj.y - data.y) > 1 ||
                    localObj.vx !== data.vx ||
                    localObj.vy !== data.vy ||
                    localObj.rotation !== data.rotation ||
                    localObj.health !== data.health ||
                    localObj.scoreValue !== data.scoreValue
                );

                if (needsUpdate) {
                    localObj.x = data.x;
                    localObj.y = data.y;
                    localObj.vx = data.vx ?? localObj.vx; // Sync velocity if provided
                    localObj.vy = data.vy ?? localObj.vy;
                    localObj.rotation = data.rotation ?? localObj.rotation;
                    localObj.health = data.health ?? localObj.health;
                    localObj.scoreValue = data.scoreValue ?? localObj.scoreValue;
                    changed = true; // Mark that something changed

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
        // Optional: Log sync completion only if changes occurred
        // if (changed) {
        //     console.log(`[SpaceObjMgr ${myClientId}] Sync complete. Active objects now: ${Object.keys(this.activeObjects).length}`);
        // }
    }

    attemptSpawnObject(currentTime) {
        // --- Spawner Determination ---
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort(); // Sort IDs lexicographically
        if (!peerIds.length || this.networkManager.getClientId() !== peerIds[0]) {
            return; // Not the designated spawner
        }

        // --- Spawn Conditions ---
        const numActive = Object.keys(this.activeObjects).length;
        if (numActive >= MAX_ACTIVE_OBJECTS) {
            return; // Max limit reached
        }

        if (currentTime - this.lastSpawnAttemptTime > SPAWN_INTERVAL) {
            this.lastSpawnAttemptTime = currentTime;
            if (Math.random() > SPAWN_CHANCE_PER_INTERVAL) {
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

            // Use a default visual scale temporarily for height calculation if needed
            const tempVisualScale = 0.35;
            const tempHitboxScale = 0.8;
            const tempSpriteFrame = SPRITES.space_objects.frames.find(f => f.name === type) || SPRITES.space_objects.frames[0];
            const tempDrawHeight = tempSpriteFrame.height * tempVisualScale;

            if (type === 'rover') {
                spawnY = this.groundLevelY - (tempDrawHeight / 2);
            } else {
                const airbornePadding = 50;
                spawnY = Math.random() * (this.groundLevelY - airbornePadding * 2) + airbornePadding;
            }

            const initialState = {}; // Allow class constructors to set defaults

            // --- Create Instance & Sync Data ---
            const newId = `sobj-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
            // Create a temporary instance *locally first* to get its initial sync data
            const tempInstanceForSync = new ObjectClass(newId, type, spawnX, spawnY, initialState, this.groundLevelY);
            if (!tempInstanceForSync || !tempInstanceForSync.id) {
                console.error(`Failed to create temporary instance for sync for type ${type}`);
                return; // Prevent sending invalid data
            }
            const syncData = tempInstanceForSync.getSyncData(); // Get initial data for network sync

            // --- Update Room State ---
            // console.log(`Spawner ${this.networkManager.getClientId()} attempting to spawn ${type} (${newId}) at (${syncData.x.toFixed(0)}, ${syncData.y.toFixed(0)}) with vx: ${syncData.vx.toFixed(1)}`); // Reduce log noise

            // Use a dynamic key for the update to ensure reactivity
            const updatePayload = {};
            updatePayload[newId] = syncData;

            this.networkManager.updateRoomState({
                spaceObjects: updatePayload // Add the new object to the room state
            });
        }
    }

    getObject(id) {
        return this.activeObjects[id];
    }

    destroyObject(id, playerDestroyerId = null) {
        const obj = this.getObject(id);
        if (obj) {
            if (playerDestroyerId && obj.scoreValue > 0) {
                const player = this.playerManager?.getPlayer(playerDestroyerId);
                if (player && player.lifecycleState === 'ACTIVE') {
                    player.addScore(obj.scoreValue);
                    console.log(`Player ${playerDestroyerId} awarded ${obj.scoreValue} points for destroying ${id}`);
                }
            }
            obj.isMarkedForRemoval = true;
            handleObjectDestructionDrop(obj, playerDestroyerId, this.collectibleManager);
            handleObjectDestructionPowerupDrop(obj, playerDestroyerId, this.powerupManager);

            // Use dynamic key for removal
            const removalPayload = {};
            removalPayload[id] = null;
            this.networkManager.updateRoomState({
                spaceObjects: removalPayload // Setting to null removes the key
            });
            // console.log(`Space object ${id} removal requested via roomState.`); // Reduce log noise
            delete this.activeObjects[id]; // Remove immediately locally after requesting network removal
        }
    }

    handleDamageToObject(id, amount, playerDestroyerId = null) {
        const obj = this.getObject(id);
        if (!obj || obj.isMarkedForRemoval) return false;

        const wasDestroyed = obj.takeDamage(amount);

        if (wasDestroyed) {
            this.destroyObject(id, playerDestroyerId);
            return true;
        } else {
            // Use dynamic key for update
            const updatePayload = {};
            updatePayload[id] = obj.getSyncData();
            this.networkManager.updateRoomState({
                spaceObjects: updatePayload // Send updated data (including lower health)
            });
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
        const updates = {};
        let needsNetworkUpdate = false;

        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        const isSpawner = peerIds.length > 0 && this.networkManager.getClientId() === peerIds[0];

        // Log active count periodically
        // if (Math.random() < 0.01) { // Log occasionally
        //     console.log(`[SpaceObjMgr ${this.networkManager.getClientId()}] Update: Active Objects Count = ${Object.keys(this.activeObjects).length}`);
        // }

        for (const id in this.activeObjects) {
            const obj = this.activeObjects[id];
            // Defensive check if object somehow became null/undefined
            if (!obj) {
                delete this.activeObjects[id];
                continue;
            }

            if (obj.isMarkedForRemoval) {
                delete this.activeObjects[id]; // Ensure removed if marked
                continue;
            }

            obj.update(deltaTime, this.gameBounds, this.groundLevelY);

            if (obj.isMarkedForRemoval) {
                if (isSpawner) {
                    updates[id] = null;
                    needsNetworkUpdate = true;
                    // console.log(`Spawner is removing object ${id} from roomState (off-screen).`);
                }
                delete this.activeObjects[id];
            }
        }

        if (needsNetworkUpdate && isSpawner) {
            // Use a dynamic payload for the update
            const removalPayload = { ...updates };
            this.networkManager.updateRoomState({ spaceObjects: removalPayload }); // Ensure update is a new object
        }
        this.attemptSpawnObject(performance.now());
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