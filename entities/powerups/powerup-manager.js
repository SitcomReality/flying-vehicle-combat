// New file: Manages active powerups in the game world

import Powerup from './powerup.js';
import { PowerupType, POWERUP_SPAWN_CONFIG, getRandomPowerupType, getPowerupConfig } from './powerup-types.js';

class PowerupManager {
    constructor(networkManager, assets, renderScale, particleSystem) {
        this.networkManager = networkManager;
        this.assets = assets; 
        this.renderScale = renderScale;
        this.particleSystem = particleSystem; 
        this.activePowerups = {}; 
        this.lastSpawnAttemptTime = 0;
        this.isSpawner = false; 

        this.networkManager.onPresenceUpdate(this._handlePresenceUpdate.bind(this));
        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate.bind(this));
        this._determineSpawner(); 
        this._initializeFromRoomState(); 
    }

    _determineSpawner() {
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        const oldSpawnerStatus = this.isSpawner;
        this.isSpawner = peerIds.length > 0 && this.networkManager.getClientId() === peerIds[0];
        if (this.isSpawner !== oldSpawnerStatus) {
        }
    }

    _initializeFromRoomState() {
        const roomState = this.networkManager.getRoomState();
        if (roomState && roomState.activePowerups && Object.keys(roomState.activePowerups).length > 0) {
            this._syncPowerups(roomState.activePowerups);
        } else {
        }
    }

    _handlePresenceUpdate(presence) {
        this._determineSpawner();
    }

    _handleRoomStateUpdate(roomState) {
        if (roomState.hasOwnProperty('activePowerups')) {
            const powerupData = roomState.activePowerups || {};
            this._syncPowerups(powerupData);
        }
    }

    _syncPowerups(powerupData) {
        const currentIds = Object.keys(this.activePowerups);
        const myClientId = this.networkManager.getClientId(); 
        const serverIds = Object.keys(powerupData);
        let changed = false;
        const now = performance.now();

        for (const id of currentIds) {
            if (powerupData[id] === null) {
                if (this.activePowerups[id]) { 
                    delete this.activePowerups[id];
                    changed = true;
                }
            }
        }

        for (const id of serverIds) {
            const data = powerupData[id];
            if (data === null) continue;

            if (!data || !data.type || typeof data.x !== 'number' || typeof data.y !== 'number') {
                console.warn(`Invalid network data for powerup ${id}. Skipping. Data:`, data);
                if(this.activePowerups[id]) delete this.activePowerups[id]; 
                changed = true;
                continue;
            }

            const config = getPowerupConfig(data.type); 
            if (!config) {
                console.warn(`Unknown powerup type "${data.type}" for ID ${id}. Skipping.`);
                if(this.activePowerups[id]) delete this.activePowerups[id];
                changed = true;
                continue;
             }

            if (!this.activePowerups[id]) {
                try {
                    const newPowerup = new Powerup(
                        id,
                        data.type,
                        data.x,
                        data.y,
                        POWERUP_SPAWN_CONFIG.RADIUS, 
                        data.creationTime || now, 
                        config.lifespan || POWERUP_SPAWN_CONFIG.DEFAULT_LIFESPAN 
                    );
                    if (!newPowerup || !newPowerup.id) {
                         console.error(`FAILED to create local powerup ${id} - Constructor returned invalid object.`);
                         continue;
                    }
                    this.activePowerups[id] = newPowerup;
                    changed = true;
                } catch (error) {
                     console.error(`Error creating local powerup ${id} of type ${data.type}:`, error);
                     continue;
                }
            } else {
                 const localPowerup = this.activePowerups[id];
                 let updated = false;
                 if (localPowerup.x !== data.x || localPowerup.y !== data.y) {
                     localPowerup.x = data.x;
                     localPowerup.y = data.y;
                     updated = true;
                 }
                 if (data.creationTime && localPowerup.creationTime !== data.creationTime) {
                    localPowerup.creationTime = data.creationTime;
                    updated = true;
                 }
                 if (localPowerup.type !== data.type) {
                      console.warn(`Powerup ${id} type changed from ${localPowerup.type} to ${data.type}. Updating type.`);
                      localPowerup.type = data.type;
                      localPowerup.spriteFrame = getPowerupSpriteFrame(data.type); 
                      localPowerup.lifespan = getPowerupConfig(data.type)?.lifespan || POWERUP_SPAWN_CONFIG.DEFAULT_LIFESPAN;
                      updated = true;
                 }
                 if(updated) changed = true;
            }
        }

        if (changed || Math.random() < 0.01) { 
        }
    }

    attemptRandomSpawn(currentTime, gameWidth, gameHeight, groundLevelY) {
        if (!this.isSpawner) return;

        const numActive = Object.keys(this.activePowerups).length;
        if (numActive >= POWERUP_SPAWN_CONFIG.MAX_ACTIVE) return;

        if (currentTime - this.lastSpawnAttemptTime > POWERUP_SPAWN_CONFIG.INTERVAL) {
            this.lastSpawnAttemptTime = currentTime;

            if (Math.random() > POWERUP_SPAWN_CONFIG.SPAWN_CHANCE_PER_INTERVAL) return;

            const type = getRandomPowerupType();
            if (!type) return;

            const padding = POWERUP_SPAWN_CONFIG.RADIUS * 2; 
            const spawnableHeight = Math.max(0, groundLevelY - padding * 2);
            const x = Math.random() * (gameWidth - padding * 2) + padding;
            const y = Math.random() * spawnableHeight + padding;

            this._spawnPowerupInternal(x, y, type, currentTime); 
        }
    }

    spawnPowerupAt(x, y, type = null) {
        const numActive = Object.keys(this.activePowerups).length;
        if (numActive >= POWERUP_SPAWN_CONFIG.MAX_ACTIVE) {
            console.log("Maximum powerup limit reached, cannot spawn from drop.");
            return null;
        }

        if (!this.isSpawner) {
            return null; 
        }

        if (!type) {
            type = getRandomPowerupType(); 
        }
        if (!type) {
            console.warn("Could not determine powerup type to spawn from drop.");
            return null; 
        }

        return this._spawnPowerupInternal(x, y, type, performance.now()); 
    }

    spawnPowerup(x, y, type = null) {
        return this.spawnPowerupAt(x, y, type);
    }

    _spawnPowerupInternal(x, y, type, creationTime) {
         const config = getPowerupConfig(type);
         if (!config) {
             console.error(`Invalid config for type ${type} during spawn.`);
             return null;
         }

        const newId = `powerup-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
        const networkData = {
            type: type,
            x: x,
            y: y,
            creationTime: creationTime 
        };
        const updatePayload = { [newId]: networkData };

        this.networkManager.updateRoomState({
            activePowerups: updatePayload
        });

        try {
            const newPowerup = new Powerup(
                newId, type, x, y,
                POWERUP_SPAWN_CONFIG.RADIUS,
                creationTime, 
                config.lifespan || POWERUP_SPAWN_CONFIG.DEFAULT_LIFESPAN
            );
            if (!newPowerup || !newPowerup.id) throw new Error("Constructor failed");
            this.activePowerups[newId] = newPowerup;
            return newId; 
        } catch (error) {
             console.error(`Failed to create local powerup instance ${newId}:`, error);
             this.networkManager.updateRoomState({ activePowerups: { [newId]: null } });
             return null;
        }
    }

    pickupPowerup(powerupId) {
        if (!this.activePowerups[powerupId]) {
            return null;
        }

        const powerup = this.activePowerups[powerupId];
        console.log(`Local player picking up powerup ${powerup.id} (${powerup.type})`);

        this.particleSystem?.emitPowerupPickup(powerup.x, powerup.y);

        delete this.activePowerups[powerupId];

        const removalPayload = { [powerupId]: null }; 

        this.networkManager.updateRoomState({
            activePowerups: removalPayload
        });

        return powerup; 
    }

    getActivePowerups() {
        return Object.values(this.activePowerups).filter(p => p && !p.isMarkedForRemoval);
    }

    update(deltaTime, gameWidth, gameHeight, groundLevelY) {
        const currentTime = performance.now();
        let needsRoomStateUpdate = false;
        const expiredUpdatesForNetwork = {};

        for (const id in this.activePowerups) {
            const powerup = this.activePowerups[id];
            if (!powerup) continue; 

            powerup.update(deltaTime);

            if (powerup.isExpired(currentTime)) {
                powerup.isMarkedForRemoval = true; 

                if (this.isSpawner) {
                    expiredUpdatesForNetwork[id] = null;
                    needsRoomStateUpdate = true;
                } else {
                }

                if (this.isSpawner) {
                    delete this.activePowerups[id];
                }
            }
        }

        if (needsRoomStateUpdate && this.isSpawner && Object.keys(expiredUpdatesForNetwork).length > 0) {
            this.networkManager.updateRoomState({ activePowerups: expiredUpdatesForNetwork });
        }

        if (this.isSpawner) {
            this.attemptRandomSpawn(currentTime, gameWidth, gameHeight, groundLevelY);
        }
    }

    draw(ctx) {
        for (const id in this.activePowerups) {
            if (this.activePowerups[id] && !this.activePowerups[id].isMarkedForRemoval) {
                this.activePowerups[id].draw(ctx, this.assets, this.renderScale);
             }
        }
    }
}

export default PowerupManager;