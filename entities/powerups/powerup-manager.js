// New file: Manages active powerups in the game world

import Powerup from './powerup.js';
import { PowerupType, POWERUP_SPAWN_CONFIG, getRandomPowerupType, getPowerupSpriteFrame } from './powerup-types.js';

class PowerupManager {
    constructor(networkManager, assets, renderScale, particleSystem) {
        this.networkManager = networkManager;
        this.assets = assets; // Loaded sprite sheets
        this.renderScale = renderScale;
        this.particleSystem = particleSystem; // Store particle system reference
        this.activePowerups = {}; // Stores local Powerup instances { id: Powerup }
        this.lastSpawnAttemptTime = 0;
        this.isSpawner = false; // Flag to indicate if this client is the designated spawner
        this.pendingRemovals = new Set(); // FIX: Track pending removals to prevent double-processing

        // Bind handlers *before* potentially calling them in _initializeFromRoomState
        this._handlePresenceUpdate = this._handlePresenceUpdate.bind(this);
        this._handleRoomStateUpdate = this._handleRoomStateUpdate.bind(this);

        // Subscribe to network events
        this.networkManager.onPresenceUpdate(this._handlePresenceUpdate);
        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate);

        this._determineSpawner(); // Determine spawner initially
        this._initializeFromRoomState(); // Try to initialize immediately
    }

    _determineSpawner() {
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        const oldSpawnerStatus = this.isSpawner;
        this.isSpawner = peerIds.length > 0 && this.networkManager.getClientId() === peerIds[0];
        if (this.isSpawner !== oldSpawnerStatus) {
            console.log(`[PowerupMgr ${this.networkManager?.getClientId()}] Spawner status changed. I am ${this.isSpawner ? 'NOW' : 'NO LONGER'} the spawner.`);
        }
    }

    _handlePresenceUpdate(presence) {
        this._determineSpawner(); // Re-determine spawner role immediately
    }

    // FIX: Improved room state handling with better error management
    _handleRoomStateUpdate(roomState) {
        if (roomState.hasOwnProperty('activePowerups')) {
            const powerupData = roomState.activePowerups || {};
            if (Object.keys(powerupData).length > 0) {
                console.log(`[PowerupMgr] Received room state update with ${Object.keys(powerupData).length} powerups.`);
            }
            this._syncPowerups(powerupData);
        }
    }

    _initializeFromRoomState() {
        const roomState = this.networkManager.getRoomState();
        if (roomState && roomState.activePowerups) {
            console.log(`[PowerupMgr] Initializing from room state with ${Object.keys(roomState.activePowerups).length} powerups.`);
            this._syncPowerups(roomState.activePowerups);
        }
    }

    // FIX: Completely rewritten sync logic for better reliability
    _syncPowerups(powerupData) {
        if (!powerupData) return;
        
        const myClientId = this.networkManager.getClientId();
        const localIds = new Set(Object.keys(this.activePowerups));
        const serverIds = new Set(Object.keys(powerupData).filter(id => powerupData[id] !== null));
        const now = performance.now();
        
        // Step 1: Remove powerups that are null in server data
        for (const id of Object.keys(powerupData)) {
            if (powerupData[id] === null) {
                // If we have this locally, remove it
                if (this.activePowerups[id] && !this.pendingRemovals.has(id)) {
                    console.log(`[PowerupMgr] Removing powerup ${id} due to server null`);
                    delete this.activePowerups[id];
                    this.pendingRemovals.add(id); // Track that we've processed this removal
                }
            }
        }
        
        // Step 2: Remove local powerups not in server data (except very recent locally created ones)
        for (const localId of localIds) {
            if (!serverIds.has(localId) && !this.pendingRemovals.has(localId)) {
                const timeSinceCreation = now - (this.activePowerups[localId]?.creationTime || 0);
                
                // If this is a very recent local spawn by the spawner, give it time to sync
                if (this.isSpawner && timeSinceCreation < 1000) {
                    console.log(`[PowerupMgr] Keeping recent local spawn: ${localId}`);
                    continue;
                }
                
                console.log(`[PowerupMgr] Removing local powerup ${localId} not in server data`);
                delete this.activePowerups[localId];
            }
        }
        
        // Step 3: Add or update powerups from server data
        for (const id of serverIds) {
            const data = powerupData[id];
            if (!data) continue; // Skip null/undefined
            
            if (!data.type || typeof data.x !== 'number' || typeof data.y !== 'number') {
                console.warn(`[PowerupMgr] Invalid powerup data for ID ${id}:`, data);
                continue;
            }
            
            if (!this.activePowerups[id]) {
                // Create new powerup
                try {
                    console.log(`[PowerupMgr] Creating new powerup: ${id} of type ${data.type}`);
                    const newPowerup = new Powerup(
                        id,
                        data.type,
                        data.x,
                        data.y,
                        POWERUP_SPAWN_CONFIG.RADIUS
                    );
                    
                    // Initialize interpolation state
                    newPowerup.serverX = data.x;
                    newPowerup.serverY = data.y;
                    newPowerup.lastServerUpdateTime = now;
                    this.activePowerups[id] = newPowerup;
                    
                    // Remove from pending removals if it was there (recreation case)
                    this.pendingRemovals.delete(id);
                } catch (error) {
                    console.error(`[PowerupMgr] Error creating powerup ${id}:`, error);
                }
            } else {
                // Update existing powerup
                const powerup = this.activePowerups[id];
                
                // Update server state for interpolation
                powerup.serverX = data.x;
                powerup.serverY = data.y;
                powerup.lastServerUpdateTime = now;
                
                // If type changed, update it (shouldn't happen but handle it)
                if (powerup.type !== data.type) {
                    console.warn(`[PowerupMgr] Powerup ${id} changed type from ${powerup.type} to ${data.type}`);
                    powerup.type = data.type;
                    // Update sprite if needed
                    powerup.spriteFrame = getPowerupSpriteFrame(data.type);
                }
            }
        }
        
        // Log sync completion occasionally
        if (Math.random() < 0.1) {
            console.log(`[PowerupMgr] After sync: ${Object.keys(this.activePowerups).length} active powerups`);
        }
    }

    // FIX: More robust random spawn
    attemptRandomSpawn(currentTime, gameWidth, gameHeight, groundLevelY) {
        // Only spawner creates powerups
        if (!this.isSpawner) return;
        
        const numActive = Object.keys(this.activePowerups).length;
        if (numActive >= POWERUP_SPAWN_CONFIG.MAX_ACTIVE) {
            return;
        }

        if (currentTime - this.lastSpawnAttemptTime > POWERUP_SPAWN_CONFIG.INTERVAL) {
            this.lastSpawnAttemptTime = currentTime;
            
            if (Math.random() > POWERUP_SPAWN_CONFIG.SPAWN_CHANCE_PER_INTERVAL) {
                return;
            }
            
            // Get powerup type
            const type = getRandomPowerupType();
            if (!type) return;
            
            // Calculate spawn position
            const padding = POWERUP_SPAWN_CONFIG.RADIUS * 2;
            const spawnableHeight = Math.max(0, groundLevelY - padding * 2);
            const x = Math.random() * (gameWidth - padding * 2) + padding;
            const y = Math.random() * spawnableHeight + padding;
            
            // Create unique ID
            const newId = `powerup-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
            
            console.log(`[PowerupMgr] SPAWNER creating random powerup ${type} (${newId}) at (${x.toFixed(0)},${y.toFixed(0)})`);
            
            // Create network update
            const updatePayload = {};
            updatePayload[newId] = {
                type: type,
                x: x,
                y: y
            };
            
            // Update room state (will trigger _syncPowerups on all clients)
            this.networkManager.updateRoomState({
                activePowerups: updatePayload
            });
            
            // Create local instance
            const newPowerup = new Powerup(
                newId, type, x, y, POWERUP_SPAWN_CONFIG.RADIUS
            );
            
            newPowerup.creationTime = currentTime;
            newPowerup.serverX = x;
            newPowerup.serverY = y;
            newPowerup.lastServerUpdateTime = currentTime;
            this.activePowerups[newId] = newPowerup;
        }
    }

    // FIX: Improved pickup handling
    pickupPowerup(powerupId) {
        if (!this.activePowerups[powerupId] || this.pendingRemovals.has(powerupId)) {
            return null;
        }
        
        const powerup = this.activePowerups[powerupId];
        
        console.log(`[PowerupMgr] Player picked up powerup ${powerupId} (${powerup.type})`);
        
        // Create visual effect locally
        this.particleSystem?.emitPowerupPickup(powerup.x, powerup.y);
        
        // Track that we're removing this to prevent double-processing
        this.pendingRemovals.add(powerupId);
        
        // Remove locally immediately
        delete this.activePowerups[powerupId];
        
        // Send removal update to all clients
        const removalPayload = {};
        removalPayload[powerupId] = null;
        this.networkManager.updateRoomState({
            activePowerups: removalPayload
        });
        
        return powerup; // Return the powerup info for effects
    }

    // FIX: Make spawnPowerupAt and spawnPowerup use consistent logic
    spawnPowerupAt(x, y, type = null) {
        // Only spawner should create powerups
        if (!this.isSpawner) {
            console.log(`[PowerupMgr] Non-spawner attempted to spawn powerup, ignoring.`);
            return null;
        }
        
        const numActive = Object.keys(this.activePowerups).length;
        if (numActive >= POWERUP_SPAWN_CONFIG.MAX_ACTIVE) {
            console.log(`[PowerupMgr] Max powerups reached (${numActive}), skipping spawn.`);
            return null;
        }
        
        if (!type) {
            type = getRandomPowerupType();
        }
        
        // Create unique ID
        const newId = `powerup-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
        
        console.log(`[PowerupMgr] SPAWNER creating powerup ${type} (${newId}) at (${x.toFixed(0)},${y.toFixed(0)})`);
        
        // Create network update
        const updatePayload = {};
        updatePayload[newId] = {
            type: type,
            x: x,
            y: y
        };
        
        // Update room state
        this.networkManager.updateRoomState({
            activePowerups: updatePayload
        });
        
        // Create local instance
        const newPowerup = new Powerup(
            newId, type, x, y, POWERUP_SPAWN_CONFIG.RADIUS
        );
        
        const now = performance.now();
        newPowerup.creationTime = now;
        newPowerup.serverX = x;
        newPowerup.serverY = y;
        newPowerup.lastServerUpdateTime = now;
        this.activePowerups[newId] = newPowerup;
        
        return newId;
    }
    
    // Alias for compatibility
    spawnPowerup(x, y, type = null) {
        return this.spawnPowerupAt(x, y, type);
    }

    getActivePowerups() {
        // Return powerups suitable for collision detection/drawing
        return Object.values(this.activePowerups).filter(p => p && !p.isMarkedForRemoval);
    }

    update(deltaTime, gameWidth, gameHeight, groundLevelY) {
        const currentTime = performance.now(); // Get current time for spawning logic

        for (const id in this.activePowerups) {
            const powerup = this.activePowerups[id];
            if (!powerup) continue; // Was removed mid-iteration

            // --- Apply Interpolation for non-spawners ---
            if (!this.isSpawner) {
                powerup.interpolateState();
            } else {
                // Spawner updates its own server state representation
                powerup.serverX = powerup.x;
                powerup.serverY = powerup.y;
                powerup.lastServerUpdateTime = currentTime;
                // Spawner doesn't need to send position updates unless powerups move dynamically
            }

            powerup.update(deltaTime); // Apply bobbing effect

            // NOTE: Lifespan/removal logic is handled by sync from spawner now
        }

        // Only spawner attempts random spawns
        if (this.isSpawner) {
            this.attemptRandomSpawn(currentTime, gameWidth, gameHeight, groundLevelY);
        }
    }

    draw(ctx) {
        for (const id in this.activePowerups) {
            if (this.activePowerups[id]) { // Check it still exists locally
                this.activePowerups[id].draw(ctx, this.assets, this.renderScale);
            }
        }
    }
}

export default PowerupManager;