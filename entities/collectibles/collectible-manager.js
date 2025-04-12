// New file: Manages active collectible items in the game world

import Collectible from './collectible.js';
import { getCollectibleConfig, getRandomCollectibleType } from './collectible-types.js';

class CollectibleManager {
    constructor(networkManager, assets, renderScale, particleSystem) {
        this.networkManager = networkManager;
        this.assets = assets;
        this.renderScale = renderScale;
        this.particleSystem = particleSystem; // Store particle system reference
        this.activeCollectibles = {}; // Stores local Collectible instances { id: Collectible }
        this.isSpawner = false; // Flag to indicate if this client is the designated spawner

        this.networkManager.onPresenceUpdate(this._handlePresenceUpdate.bind(this));
        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate.bind(this));
        this._determineSpawner(); // Determine spawner initially
        this._initializeFromRoomState(); // Try to initialize immediately
    }

     _determineSpawner() {
        const peers = this.networkManager.getPeers();
        const peerIds = Object.keys(peers).sort();
        const oldSpawnerStatus = this.isSpawner;
        this.isSpawner = peerIds.length > 0 && this.networkManager.getClientId() === peerIds[0];
        if (this.isSpawner !== oldSpawnerStatus) {
            // console.log(`[CollectibleMgr] Spawner status changed to: ${this.isSpawner}`);
        }
    }

    _handlePresenceUpdate(presence) {
        // Re-determine spawner role on presence changes
        this._determineSpawner();
    }

    _initializeFromRoomState() {
        const roomState = this.networkManager.getRoomState();
        if (roomState && roomState.activeCollectibles) {
             // console.log("Initializing collectibles from initial room state:", JSON.stringify(Object.keys(roomState.activeCollectibles)));
            this._syncCollectibles(roomState.activeCollectibles);
        } else {
            // console.log("No initial collectibles found in room state.");
        }
    }

    _handleRoomStateUpdate(roomState) {
        // Check specifically for the 'activeCollectibles' property
        if (roomState.hasOwnProperty('activeCollectibles')) {
            const collectibleData = roomState.activeCollectibles || {};
            // console.log(`[CollMgr ${this.networkManager.getClientId()}] Received room state update for collectibles.`);
            this._syncCollectibles(collectibleData);
        }
    }

     _syncCollectibles(collectibleData) {
         const currentIds = Object.keys(this.activeCollectibles);
         const myClientId = this.networkManager.getClientId();
         const serverIds = Object.keys(collectibleData);
         let changed = false;

         // Remove collectibles explicitly marked as null in the network data
         for (const id of currentIds) {
             if (collectibleData[id] === null) {
                 if (this.activeCollectibles[id]) {
                    // console.log(`[CollMgr ${myClientId}] Removing collectible ${id} due to explicit null`);
                    delete this.activeCollectibles[id];
                    changed = true;
                 }
             }
         }

         // Add/Update collectibles based on roomState
         for (const id of serverIds) {
             const data = collectibleData[id];
             // Skip null entries
             if (data === null) continue;

             // Basic validation
             if (!data || !data.type || typeof data.x !== 'number' || typeof data.y !== 'number') {
                 console.warn(`[CollMgr ${myClientId}] Invalid data for collectible ${id}. Skipping. Data:`, data);
                 if(this.activeCollectibles[id]) delete this.activeCollectibles[id];
                 changed = true;
                 continue;
             }

             if (!this.activeCollectibles[id]) {
                 // Create new local instance
                 const config = getCollectibleConfig(data.type);
                 if (config) {
                     // console.log(`[CollMgr ${myClientId}] Sync: Creating new collectible ${id} type ${data.type} at (${data.x}, ${data.y})`);
                     try {
                        const newCollectible = new Collectible(
                            id, data.type, data.x, data.y, config.value
                        );
                        if (!newCollectible || !newCollectible.id) {
                            console.error(`[CollMgr ${myClientId}] Sync: FAILED to create local collectible ${id} - Constructor returned invalid object.`);
                            continue;
                        }
                         this.activeCollectibles[id] = newCollectible;
                         if (data.creationTime) {
                             this.activeCollectibles[id].creationTime = data.creationTime;
                         }
                         changed = true;
                     } catch (error) {
                         console.error(`[CollMgr ${myClientId}] Sync: Error creating local collectible ${id} of type ${data.type}:`, error);
                         continue;
                     }
                 } else {
                     console.warn(`[CollMgr ${myClientId}] Unknown collectible type "${data.type}" for ID ${id}. Skipping.`);
                     if(this.activeCollectibles[id]) delete this.activeCollectibles[id]; // Clean up if it somehow existed before
                     changed = true;
                 }
             } else {
                 // Update existing (mostly position, but also lifespan sync)
                 const localCollectible = this.activeCollectibles[id];
                 if (localCollectible.x !== data.x || localCollectible.y !== data.y) {
                    localCollectible.x = data.x;
                    localCollectible.y = data.y;
                    changed = true;
                 }
                 // Sync creation time to keep lifespans consistent
                 if (data.creationTime && localCollectible.creationTime !== data.creationTime) {
                    localCollectible.creationTime = data.creationTime;
                    changed = true;
                 }
             }
         }

        // ADDED: Log active count after sync for debugging
        if (changed || Math.random() < 0.01) { // Log on change or occasionally
            // console.log(`[CollMgr ${myClientId}] Active collectibles after sync: ${Object.keys(this.activeCollectibles).length}`);
        }
     }

    // --- Spawning (Called by Drop System or manually for testing) ---
    spawnCollectible(x, y, type = null, velocity = { vx: 0, vy: 0 }) {
        if (!type) {
            type = getRandomCollectibleType(); // Get a random type based on weights
        }
        const config = getCollectibleConfig(type);
        if (!config) return; // Invalid type

        const newId = `collectible-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
        const creationTime = performance.now();

        // Only the spawner should update the room state
        if (!this.isSpawner) {
             // console.log(`[CollMgr] Non-spawner received spawnCollectible request. Ignoring state update.`);
             return `dropped-collectible-${type}`; // Placeholder ID
        }

        // console.log(`Spawner ${this.networkManager.getClientId()} attempting to spawn collectible ${newId} (${type}) at ${x.toFixed(0)},${y.toFixed(0)}`);

        // Use dynamic key for update
        const updatePayload = {};
        updatePayload[newId] = {
             type: type,
             x: x,
             y: y,
             creationTime: creationTime, // Include creation time for lifespan sync
        };

        this.networkManager.updateRoomState({
            activeCollectibles: updatePayload
        });

        // Spawner adds locally immediately
        const configLocal = getCollectibleConfig(type);
        if (configLocal) {
            const newCollectible = new Collectible(
                newId, type, x, y, configLocal.value
            );
            newCollectible.creationTime = creationTime; // Sync creation time
            this.activeCollectibles[newId] = newCollectible;
            // console.log(`[CollMgr ${this.networkManager.getClientId()}] Locally added collectible ${newId} after spawning.`);
        } else {
            console.error(`[CollMgr] Failed to create local collectible instance for ${newId} - config not found for type ${type}.`);
        }
        return newId;
    }

    // Called when a local player picks up a collectible (via collision manager)
    pickupCollectible(collectibleId) {
        if (!this.activeCollectibles[collectibleId]) {
            // console.warn(`[CollMgr] Attempted to pick up non-existent collectible ${collectibleId}`);
            return null;
        }

        const collectible = this.activeCollectibles[collectibleId];
        // console.log(`[CollMgr ${this.networkManager.getClientId()}] Local player picked up collectible ${collectible.id} (${collectible.type}), Value: ${collectible.value}`);

        // Trigger particle effect locally
        this.particleSystem?.emitCollectiblePickup(collectible.x, collectible.y, collectible.type);

        // Remove locally immediately
        delete this.activeCollectibles[collectibleId];

        // Use dynamic key for removal
        const removalPayload = {};
        removalPayload[collectibleId] = null;

        // Send removal update to roomState
        // console.log(`[CollMgr ${this.networkManager.getClientId()}] Sending removal update for collectible ${collectibleId}`);
        this.networkManager.updateRoomState({
            activeCollectibles: removalPayload // Set to null to remove
        });

        return collectible; // Return details for scoring
    }

    getActiveCollectibles() {
        return Object.values(this.activeCollectibles).filter(c => c && !c.isMarkedForRemoval);
    }

    update(deltaTime) {
        let needsRoomStateUpdate = false;
        const updatesForNetwork = {}; // Track IDs to remove via network

        // Log active count periodically
        // if (Math.random() < 0.01) { // Log occasionally
        //     console.log(`[CollMgr ${this.networkManager.getClientId()}] Update: Active Collectibles Count = ${Object.keys(this.activeCollectibles).length}`);
        // }

        for (const id in this.activeCollectibles) {
            const collectible = this.activeCollectibles[id];
             // Defensive check
             if (!collectible) {
                 delete this.activeCollectibles[id];
                 continue;
             }

            collectible.update(deltaTime);

            if (collectible.isMarkedForRemoval) {
                // Only the spawner is responsible for removing expired items from roomState
                if (this.isSpawner) {
                    // console.log(`[CollMgr Spawner] Collectible ${id} marked for removal (lifespan). Queueing network removal.`);
                    updatesForNetwork[id] = null;
                    needsRoomStateUpdate = true;
                }
                // Remove locally regardless of spawner status
                delete this.activeCollectibles[id];
            }
        }

        // Spawner sends a single roomState update to remove expired items
        if (needsRoomStateUpdate && this.isSpawner && Object.keys(updatesForNetwork).length > 0) {
            // console.log(`[CollMgr Spawner] Sending removal update for expired collectibles:`, Object.keys(updatesForNetwork));
            this.networkManager.updateRoomState({ activeCollectibles: updatesForNetwork });
        }
    }

    draw(ctx) {
        for (const id in this.activeCollectibles) {
             if (this.activeCollectibles[id]) { // Check it still exists locally
                this.activeCollectibles[id].draw(ctx, this.assets, this.renderScale);
             }
        }
    }
}

export default CollectibleManager;