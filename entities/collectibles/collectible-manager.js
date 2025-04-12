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

        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate.bind(this));
        this._initializeFromRoomState(); // Try to initialize immediately
    }

    _initializeFromRoomState() {
        const roomState = this.networkManager.getRoomState();
        if (roomState && roomState.activeCollectibles) {
             console.log("Initializing collectibles from initial room state:", JSON.stringify(Object.keys(roomState.activeCollectibles)));
            this._syncCollectibles(roomState.activeCollectibles);
        } else {
            console.log("No initial collectibles found in room state.");
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

         // FIXED: Only remove collectibles that are explicitly null, not those missing from update
         for (const id of currentIds) {
             if (collectibleData[id] === null) {
                 if (this.activeCollectibles[id]) {
                    console.log(`[CollMgr ${myClientId}] Removing collectible ${id} due to explicit null`);
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
                     console.log(`[CollMgr ${myClientId}] Sync: Creating new collectible ${id} type ${data.type} at (${data.x}, ${data.y})`);
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
                 // Update existing (mostly position)
                 const localCollectible = this.activeCollectibles[id];
                 if (localCollectible.x !== data.x || localCollectible.y !== data.y) {
                    localCollectible.x = data.x;
                    localCollectible.y = data.y;
                    changed = true;
                 }
             }
         }

        // ADDED: Log active count after sync for debugging
        if (changed || Math.random() < 0.01) { // Log on change or occasionally
            console.log(`[CollMgr ${myClientId}] Active collectibles after sync: ${Object.keys(this.activeCollectibles).length}`);
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

        console.log(`Attempting to spawn collectible ${newId} (${type}) at ${x.toFixed(0)},${y.toFixed(0)}`);

        // Use dynamic key for update
        const updatePayload = {};
        updatePayload[newId] = {
             type: type,
             x: x,
             y: y,
             creationTime: creationTime,
        };

        this.networkManager.updateRoomState({
            activeCollectibles: updatePayload
        });

        return newId;
    }

    // Called when a local player picks up a collectible (via collision manager)
    pickupCollectible(collectibleId) {
        if (!this.activeCollectibles[collectibleId]) {
            // console.warn(`Attempted to pick up non-existent collectible ${collectibleId}`);
            return null;
        }

        const collectible = this.activeCollectibles[collectibleId];
        console.log(`Local player picked up collectible ${collectible.id} (${collectible.type}), Value: ${collectible.value}`);
        this.particleSystem?.emitCollectiblePickup(collectible.x, collectible.y, collectible.type);
        delete this.activeCollectibles[collectibleId];

        // Use dynamic key for removal
        const removalPayload = {};
        removalPayload[collectibleId] = null;
        this.networkManager.updateRoomState({
            activeCollectibles: removalPayload // Set to null to remove
        });
        return collectible;
    }

    getActiveCollectibles() {
        return Object.values(this.activeCollectibles).filter(c => c && !c.isMarkedForRemoval);
    }

    update(deltaTime) {
        let needsRoomStateUpdate = false;
        const updatesForNetwork = {}; // Track IDs to remove via network

        // Log active count periodically
        if (Math.random() < 0.01) { // Log occasionally
            // console.log(`[CollMgr ${this.networkManager.getClientId()}] Update: Active Collectibles Count = ${Object.keys(this.activeCollectibles).length}`);
        }

        for (const id in this.activeCollectibles) {
            const collectible = this.activeCollectibles[id];
             // Defensive check
             if (!collectible) {
                 delete this.activeCollectibles[id];
                 continue;
             }

            collectible.update(deltaTime);

            if (collectible.isMarkedForRemoval) {
                // console.log(`[CollMgr] Collectible ${id} marked for removal (lifespan).`);
                // Mark for network removal
                updatesForNetwork[id] = null;
                needsRoomStateUpdate = true;
                // Remove locally
                delete this.activeCollectibles[id];
            }
        }

        if (needsRoomStateUpdate) {
            // Send a single roomState update to remove expired items
            // console.log(`[CollMgr] Sending removal update for expired collectibles:`, Object.keys(updatesForNetwork));
            this.networkManager.updateRoomState({ activeCollectibles: updatesForNetwork });
        }
    }

    draw(ctx) {
        for (const id in this.activeCollectibles) {
             if (this.activeCollectibles[id] && !this.activeCollectibles[id].isMarkedForRemoval) {
                this.activeCollectibles[id].draw(ctx, this.assets, this.renderScale);
             }
        }
    }
}

export default CollectibleManager;