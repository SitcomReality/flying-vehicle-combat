// New file: Manages active collectible items in the game world

import Collectible from './collectible.js';
import { getCollectibleConfig, getRandomCollectibleType } from './collectible-types.js';

class CollectibleManager {
    // Added particleSystem as a dependency
    constructor(networkManager, assets, renderScale, particleSystem) {
        this.networkManager = networkManager;
        this.assets = assets;
        this.renderScale = renderScale;
        this.particleSystem = particleSystem; // Store particle system reference
        this.activeCollectibles = {}; // Stores local Collectible instances { id: Collectible }

        // Listen for room state changes to sync collectibles
        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate.bind(this));
        this._initializeFromRoomState(); // Initial sync
    }

    _initializeFromRoomState() {
        const roomState = this.networkManager.getRoomState();
        if (roomState && roomState.activeCollectibles) {
            this._syncCollectibles(roomState.activeCollectibles);
        }
    }

    _handleRoomStateUpdate(roomState) {
        const collectibleData = roomState.activeCollectibles || {};
        this._syncCollectibles(collectibleData);
    }

    _syncCollectibles(collectibleData) {
        const currentIds = Object.keys(this.activeCollectibles);
        const myClientId = this.networkManager.getClientId(); // Cache client ID
        const serverIds = Object.keys(collectibleData);

        // Remove local collectibles that are no longer in roomState
        for (const id of currentIds) {
            if (!collectibleData[id]) {
                delete this.activeCollectibles[id];
            }
        }

        // Add/Update collectibles based on roomState
        for (const id of serverIds) {
            const data = collectibleData[id];
            if (!this.activeCollectibles[id]) {
                if (!data || !data.type) { // Check for invalid data before proceeding
                    console.warn(`[CollectibleManager ${myClientId}] Invalid data for collectible ${id}. Skipping.`);
                    continue;
                }
                // Create new local instance
                const config = getCollectibleConfig(data.type);
                if (config) {
                    console.log(`[CollectibleManager ${myClientId}] Sync: Creating new local collectible ${id} type ${data.type}`); // Log creation attempt
                    this.activeCollectibles[id] = new Collectible(
                        id, data.type, data.x, data.y, config.value
                    );
                    // Set creation time if provided by server (for consistent lifespan)
                    if (data.creationTime) {
                        this.activeCollectibles[id].creationTime = data.creationTime;
                    }
                } else {
                    console.warn(`Unknown collectible type "${data.type}" for ID ${id}. Skipping.`);
                }
                if (!this.activeCollectibles[id]?.id) {
                    console.error(`[CollectibleManager ${myClientId}] Sync: FAILED to create local collectible ${id}`);
                }
            } else {
                // Update existing (position might change slightly if physics added later)
                const localCollectible = this.activeCollectibles[id];
                localCollectible.x = data.x;
                localCollectible.y = data.y;
            }
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

        // Update room state to add the new collectible
        // Include creationTime for consistent lifespan across clients
        this.networkManager.updateRoomState({
            activeCollectibles: {
                [newId]: {
                    type: type,
                    x: x,
                    y: y,
                    creationTime: creationTime,
                    // Add velocity later if needed for physics-based drops
                    // vx: velocity.vx,
                    // vy: velocity.vy,
                }
            }
        });

        // Return the ID in case the spawner needs it
        return newId;
    }

    // Called when a local player picks up a collectible (via collision manager)
    pickupCollectible(collectibleId) {
        if (!this.activeCollectibles[collectibleId]) {
            console.warn(`Attempted to pick up non-existent collectible ${collectibleId}`);
            return null;
        }

        const collectible = this.activeCollectibles[collectibleId];
        console.log(`Local player picked up collectible ${collectible.id} (${collectible.type}), Value: ${collectible.value}`);

        // Trigger pickup effect at the collectible's position BEFORE removing it
        this.particleSystem?.emitCollectiblePickup(collectible.x, collectible.y, collectible.type);

        // Mark for local removal immediately
        delete this.activeCollectibles[collectibleId];

        // Trigger removal from roomState
        this.networkManager.updateRoomState({
            activeCollectibles: { // Ensure update is a new object for reactivity
                [collectibleId]: null // Set to null to remove
            }
        });

        // TODO: Play pickup sound effect here

        return collectible; // Return the picked-up collectible details (esp. value)
    }

    getActiveCollectibles() {
        // Return collectibles suitable for collision detection/drawing
        return Object.values(this.activeCollectibles).filter(c => !c.isMarkedForRemoval);
    }

    update(deltaTime) {
        let needsRoomStateUpdate = false;
        const expiredIdsToRemove = []; // Track IDs to remove via network
        // Log active count periodically
        if (Math.random() < 0.01) {
            console.log(`[CollectibleManager ${this.networkManager.getClientId()}] Update: Active Collectibles Count = ${Object.keys(this.activeCollectibles).length}`);
        }
        for (const id in this.activeCollectibles) {
            const collectible = this.activeCollectibles[id];
            collectible.update(deltaTime);

            // Check if collectible marked itself for removal (e.g., lifespan expired)
            if (collectible.isMarkedForRemoval) {
                const currentRoomState = this.networkManager.getRoomState();
                if (currentRoomState?.activeCollectibles?.[id]) {
                    needsRoomStateUpdate = true;
                    expiredIdsToRemove.push(id); // Add to list for network removal
                    // Remove directly from local cache
                    delete this.activeCollectibles[id];
                } else {
                    // Already gone from roomState, just remove locally
                    delete this.activeCollectibles[id];
                }
            }
        }

        // If any collectibles expired, send a single roomState update to remove them
        if (needsRoomStateUpdate) {
            for (const idToRemove of expiredIdsToRemove) {
                const removalUpdate = {};
                removalUpdate[idToRemove] = null; // Mark for removal
                console.log(`[CollectibleManager] Sending removal update for expired collectibles:`, expiredIdsToRemove);
                this.networkManager.updateRoomState({ activeCollectibles: { ...removalUpdate } });
            }
        }
    }

    draw(ctx) {
        for (const id in this.activeCollectibles) {
            this.activeCollectibles[id].draw(ctx, this.assets, this.renderScale);
        }
    }
}

export default CollectibleManager;