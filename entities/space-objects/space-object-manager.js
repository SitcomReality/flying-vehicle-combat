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
const SPAWN_INTERVAL = 4000;
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
                this.activeObjects[id] = new ObjectClass(id, data.type, data.x, data.y, data, this.groundLevelY);
            } else {
                const localObj = this.activeObjects[id];
                localObj.x = data.x;
                localObj.y = data.y;
                localObj.rotation = data.rotation ?? localObj.rotation;
                localObj.health = data.health ?? localObj.health;
                localObj.scoreValue = data.scoreValue ?? localObj.scoreValue;

                if (localObj instanceof Lander && data.baseY !== undefined) {
                    localObj.baseY = data.baseY;
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

            if (OBJECT_TYPES_TO_SPAWN.length === 0) return;
            const type = OBJECT_TYPES_TO_SPAWN[Math.floor(Math.random() * OBJECT_TYPES_TO_SPAWN.length)];

            let spawnX = this.gameWidth + 100;
            let spawnY;
            if (type === 'rover') {
                const ObjectClass = SPACE_OBJECT_CLASSES[type];
                if (!ObjectClass) return;
                const tempInstance = new ObjectClass('temp', type, 0, 0, {}, this.groundLevelY);
                spawnY = this.groundLevelY - (tempInstance.drawHeight / 2);
            } else {
                spawnY = Math.random() * (this.groundLevelY - 100) + 50;
            }

            const initialState = {};

            const newId = `sobj-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;

            const ObjectClass = SPACE_OBJECT_CLASSES[type];
            if (!ObjectClass) return;
            const tempInstance = new ObjectClass(newId, type, spawnX, spawnY, initialState, this.groundLevelY);
            const syncData = tempInstance.getSyncData();

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
            if (playerDestroyerId && obj.scoreValue > 0) {
                const player = this.playerManager?.getPlayer(playerDestroyerId);
                if (player) {
                    player.addScore(obj.scoreValue);
                }
            }

            obj.isMarkedForRemoval = true;

            handleObjectDestructionDrop(obj, playerDestroyerId, this.collectibleManager);
            handleObjectDestructionPowerupDrop(obj, playerDestroyerId, this.powerupManager);

            delete this.activeObjects[id];

            this.networkManager.updateRoomState({
                spaceObjects: {
                    [id]: null
                }
            });
            console.log(`Space object ${id} destroyed removed from roomState.`);
        }
    }

    applyDamageToObject(id, amount, playerDestroyerId = null) {
        const obj = this.getObject(id);
        if (obj && obj.takeDamage(amount)) {
            this.destroyObject(id, playerDestroyerId);
            return true;
        } else if (obj) {
            this.networkManager.updateRoomState({
                spaceObjects: {
                    [id]: obj.getSyncData()
                }
            });
        }
        return false;
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
        for (const id in this.activeObjects) {
            const obj = this.activeObjects[id];
            obj.update(deltaTime, this.gameBounds, this.groundLevelY);
            if (obj.isMarkedForRemoval) {
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

        this.attemptSpawnObject(performance.now());
    }

    draw(ctx) {
        for (const id in this.activeObjects) {
            this.activeObjects[id].draw(ctx, this.assets, 1.0);
        }
    }
}

export default SpaceObjectManager;