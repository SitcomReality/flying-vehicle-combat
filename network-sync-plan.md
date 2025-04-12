# Multiplayer Synchronization Improvement Plan

## 1. Goal

To improve the network synchronization for the Crayon Racer game, ensuring a consistent and smooth experience for all players, even with varying network latency. This plan focuses on synchronizing space objects, powerups, and projectiles effectively.

## 2. Core Principles

*   **Simulated Server Authority ("Spawner"):** Since there's no dedicated server, we'll designate one client as the authoritative source ("Spawner") for shared game elements like space objects and powerups. This client will manage these elements within the shared `roomState`. The Spawner will typically be the client that joined the room first (determined by sorted client IDs).
*   **Client-Side Prediction:** The local player's actions (movement, firing) should feel immediate. The client updates its local player state directly and broadcasts updates via `presence`.
*   **State Synchronization (`roomState` & `presence`):**
    *   `roomState`: Used for shared world elements managed by the Spawner (e.g., `spaceObjects`, `activePowerups`, `activeCollectibles`). Updates signify creation, state changes (position, health), or removal (`null` value).
    *   `presence`: Used for individual player states owned by each client (position, velocity, health, fuel, score, current vehicle, lifecycle state).
*   **Event Broadcasting (`sendEvent`):** Use for transient, one-off events that don't require persistent state tracking (e.g., firing a projectile, triggering explosion particle effects). Other clients react to these events.
*   **Interpolation:** Smoothly animate remote entities (players, potentially objects) between their last known network state and the newly received state to mask latency and jitter.

## 3. Step-by-Step Implementation Plan

### Step 1: Solidify Spawner Authority Role

*   **Objective:** Ensure only one client (the Spawner) is responsible for creating and updating shared world entities in `roomState`.
*   **Tasks:**
    1.  **Spawner Determination:** In `SpaceObjectManager` and `PowerupManager`, consistently determine the Spawner client (e.g., `Object.keys(networkManager.getPeers()).sort()[0] === networkManager.getClientId()`).
    2.  **Refactor Spawning:** Modify `SpaceObjectManager.attemptSpawnObject` and `PowerupManager.attemptRandomSpawn` (and potentially `spawnPowerupAt` originating from object drops) so they *only* execute the `networkManager.updateRoomState` call if the current client *is* the Spawner.
    3.  **Refactor State Updates:** Modify the `update` methods in `SpaceObjectManager` so that physics calculations and state changes that should be synced (position, velocity, health, rotation) are *only* calculated by the Spawner. Non-spawners should primarily rely on received `roomState` updates for these entities.
    4.  **Client-Side Updates:** Non-Spawner clients should *only* read from `roomState` (via the `_handleRoomStateUpdate` -> `_sync...` methods) to create, update the state of, or remove their *local representations* of space objects and powerups. They should not run independent spawning or authoritative state update logic for these shared entities.
*   **Files Involved:** `entities/space-objects/space-object-manager.js`, `entities/powerups/powerup-manager.js`, `entities/collectibles/collectible-manager.js`.

### Step 2: Reliable `roomState` Sync for Space Objects

*   **Objective:** Ensure all clients have a consistent view of space objects based on the Spawner's `roomState` updates.
*   **Tasks:**
    1.  **Spawner Updates:** Verify the Spawner client in `SpaceObjectManager.update` reliably sends updates via `updateRoomState({ spaceObjects: { ... } })` whenever a managed object's state changes significantly (position, health, rotation, removal). Removal should be signaled by setting the object's ID to `null`.
    2.  **Client Sync Logic:** Review `space-object-sync.js` (`handleSpaceObjectRoomStateUpdate`, `syncSpaceObjects`). Ensure clients correctly:
        *   Create new `SpaceObject` instances when new IDs appear in the `roomState.spaceObjects` data.
        *   Update the state (x, y, vx, vy, rotation, health) of existing local objects based *only* on the received data.
        *   Delete local object instances when their corresponding ID is `null` in the update.
    3.  **Interpolation:** Implement position and rotation interpolation for remote space objects within the non-Spawner client's `SpaceObjectManager.update` or `SpaceObject.update` method (only run interpolation if `!isSpawner`). This will visually smooth movement between network updates.
*   **Files Involved:** `entities/space-objects/space-object-manager.js`, `entities/space-objects/space-object-sync.js`, `entities/space-objects/space-object.js`.

### Step 3: Reliable `roomState` Sync for Powerups & Collectibles

*   **Objective:** Ensure consistent state for powerups and collectibles (creation, existence, removal on pickup).
*   **Tasks:**
    1.  **Spawner Creation:** Ensure the Spawner client adds new powerups/collectibles (random spawns and drops) to the appropriate `roomState` key (`activePowerups` / `activeCollectibles`).
    2.  **Pickup Logic (Client-Side Authority):**
        *   When a *local* player collides with a powerup/collectible (`PlayerPowerupCollider`, `PlayerCollectibleCollider`), the *local client* should:
            *   Immediately trigger local effects (apply powerup, add score).
            *   Immediately remove the item visually (e.g., `delete this.activePowerups[id]`).
            *   Trigger a particle effect.
            *   Send an `updateRoomState` call setting the picked-up item's ID to `null` under the relevant key (e.g., `activePowerups: { [powerupId]: null }`).
    3.  **Client Sync Logic:** Review `PowerupManager._syncPowerups` and `CollectibleManager._syncCollectibles`. Ensure clients correctly create items based on `roomState` data and remove items when their ID is set to `null`. Non-spawner clients should *not* create items in `roomState`.
*   **Files Involved:** `entities/powerups/powerup-manager.js`, `entities/collectibles/collectible-manager.js`, `entities/collisions/player-powerup-collider.js`, `entities/collisions/player-collectible-collider.js`.

### Step 4: Projectile Synchronization and Collision

*   **Objective:** Ensure projectiles are visible across clients and their collisions with shared objects are handled consistently.
*   **Tasks:**
    1.  **Firing Event:** Maintain the current system: Local player fires -> creates local projectile -> sends `fireProjectile` event -> other clients receive event and create local projectile simulation. Ensure all necessary data (owner, position, velocity, damage, color, *gravityFactor*) is included in the event payload.
    2.  **Consistent Simulation:** Verify that the `Projectile.update` logic uses the `gravityFactor` received in the event and applies physics consistently across all clients.
    3.  **Collision Handling (Client Authority for Simplicity):**
        *   When a client's projectile simulation collides with a *space object* (`ProjectileSpaceObjectCollider`):
            *   The client *immediately* removes its local projectile simulation.
            *   The client triggers local visual effects (particle sparks).
            *   The client calls `spaceObjectManager.applyDamageToObject(objectId, damage, projectile.ownerId)`.
        *   Modify `SpaceObjectManager.applyDamageToObject`:
            *   It should calculate if the damage destroys the object.
            *   If the current client *is the Spawner*, it should update the object's health (or set it to `null` if destroyed) in `roomState`. It also handles awarding score to the `projectile.ownerId` and triggering drops if destroyed *by damage*.
            *   If the current client is *not* the Spawner, it should *not* modify `roomState` directly. It relies on the Spawner's `roomState` update to eventually reflect the health change or removal.
        *   Projectile-Player collisions remain locally authoritative (only the client being hit processes the damage).
*   **Files Involved:** `entities/weapons/weapon-system.js`, `core/projectile-manager.js`, `entities/projectile.js`, `networking/network-event-handler.js`, `entities/collisions/projectile-space-object-collider.js`, `entities/space-objects/space-object-manager.js`.

### Step 5: Review Player Synchronization

*   **Objective:** Verify existing player sync mechanisms are robust.
*   **Tasks:**
    1.  **Presence Data:** Ensure `PlayerState.getPresenceData` includes all necessary state (position, rotation, health, fuel, score, vehicleType, isInvulnerable, lifecycleState).
    2.  **Updates:** Confirm `NetworkEventHandler.updateLocalPlayerPresence` is called regularly to broadcast the local player's state.
    3.  **Lifecycle Sync:** Double-check that transitions between `PlayerLifecycleState` (CONNECTING, SELECTING, ACTIVE, DEAD) are correctly reflected in presence updates and handled appropriately by remote clients (`PlayerNetworkSync.updatePlayerFromServer`). Ensure remote players visually disappear or change state correctly upon receiving DEAD/SELECTING states.
    4.  **Interpolation:** Confirm `PlayerNetworkSync.interpolatePlayerState` is correctly smoothing remote player movement and potentially other visual states like health/fuel bars.
*   **Files Involved:** `entities/player-state.js`, `entities/player.js`, `entities/player-network-sync.js`, `networking/network-event-handler.js`, `entities/player-lifecycle-manager.js`.

## 4. Testing and Iteration

*   Thoroughly test each step with multiple clients connected.
*   Use browser developer tools to simulate network latency and packet loss to identify issues under adverse conditions.
*   Pay close attention to object/powerup appearance/disappearance, projectile hits, and score consistency across different clients.
*   Iterate on the implementation based on testing feedback, refining interpolation factors, authority logic, and collision handling as needed.


