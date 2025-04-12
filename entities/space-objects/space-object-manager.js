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
            const newKeys = Object.keys(objectData);
            this._syncObjects(objectData);
        } else {
            this._syncObjects({}); // Sync with empty data to clear local state
        }
    }

    _syncObjects(objectData) {
        const currentIds = Object.keys(this.activeObjects);
        const myClientId = this.networkManager.getClientId();
        const serverIds = Object.keys(objectData);
        let changed = false;

        for (const id of currentIds) {
            if (!objectData[id]) {
                if (this.activeObjects[id]) {
                    delete this.activeObjects[id];
                    changed = true;
                }
            }
        }

        for (const id of serverIds) {
            const data = objectData[id];
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
                    const newObj = new ObjectClass(id, data.type, data.x, data.y, data, this.groundLevelY);
                    if (!newObj || !newObj.id) {
                        console.error(`[SpaceObjMgr ${myClientId}] Sync: FAILED to create local object ${id} - Constructor returned invalid object.`);
                        continue;
                    }
                    this.activeObjects[id] = newObj;
                    changed = true;
                } catch (error) {
                    console.error(`[SpaceObjMgr ${myClientId}] Sync: Error creating local object ${id} of type ${data.type}:`, error);
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
    }

    attemptSpawnObject(currentTime) {
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        if (!peerIds.length || this.networkManager.getClientId() !== peerIds[0]) {
            return;
        }

        const numActive = Object.keys(this.activeObjects).length;
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

            console.log(`Spawner ${this.networkManager.getClientId()} attempting to spawn ${type} (${newId}) at (${syncData.x.toFixed(0)}, ${syncData.y.toFixed(0)}) with vx: ${syncData.vx.toFixed(1)}`);

            const updatePayload = {};
            updatePayload[newId] = syncData;

            this.networkManager.updateRoomState({
                spaceObjects: updatePayload
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

            const removalPayload = {};
            removalPayload[id] = null;
            this.networkManager.updateRoomState({
                spaceObjects: removalPayload
            });
            delete this.activeObjects[id];
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
            const updatePayload = {};
            updatePayload[id] = obj.getSyncData();
            this.networkManager.updateRoomState({
                spaceObjects: updatePayload
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

        for (const id in this.activeObjects) {
            const obj = this.activeObjects[id];
            if (!obj) {
                delete this.activeObjects[id];
                continue;
            }

            if (obj.isMarkedForRemoval) {
                delete this.activeObjects[id];
                continue;
            }

            if (isSpawner) {
                obj.update(deltaTime, this.gameBounds, this.groundLevelY);

                if (obj.isMarkedForRemoval) {
                    updates[id] = null;
                    needsNetworkUpdate = true;
                } else {
                    updates[id] = obj.getSyncData();
                    needsNetworkUpdate = true;
                }
            }

            if (obj.isMarkedForRemoval) {
                delete this.activeObjects[id];
            }
        }

        if (needsNetworkUpdate && isSpawner) {
            const updatePayload = { ...updates };
            this.networkManager.updateRoomState({ spaceObjects: updatePayload });
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