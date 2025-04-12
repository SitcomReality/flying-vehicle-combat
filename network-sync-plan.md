# Multiplayer Synchronization Improvement Plan

## 1. Goal

To improve the network synchronization for the Crayon Racer game, ensuring a consistent and smooth experience for all players, even with varying network latency. This plan focuses on synchronizing space objects, powerups, collectibles, and projectiles effectively.

## 2. Core Principles (Established)

*   **Spawner Authority:** One client (first joined) acts as the authority for shared game elements (`roomState`).
*   **Client-Side Prediction:** Local actions are immediate, updates broadcast via `presence`.
*   **State Synchronization:** `roomState` for shared elements (objects, powerups, collectibles), `presence` for player states.
*   **Event Broadcasting:** For transient effects (e.g., projectile firing).
*   **Interpolation:** Smooth remote entity movement.

## 3. Implementation Progress

### Step 1: Solidify Spawner Authority Role (✅ Complete)

*   **Summary:** The first client to join (`Spawner`) is now responsible for creating and managing the state (position, health, destruction) of Space Objects, Powerups, and Collectibles within the shared `roomState`. Non-spawner clients rely on `roomState` updates for these entities and do not modify them directly.
*   **Files Affected:** `entities/space-objects/space-object-manager.js`, `entities/powerups/powerup-manager.js`, `entities/collectibles/collectible-manager.js`.

### Step 2: Reliable `roomState` Sync for Space Objects (✅ Complete)

*   **Summary:** Space Objects are consistently created, updated (position, health, rotation), and removed across clients based on the Spawner's `roomState` updates. Non-spawner clients interpolate the movement of remote objects for smoothness.
*   **Files Affected:** `entities/space-objects/space-object-manager.js`, `entities/space-objects/space-object-sync.js`, `entities/space-objects/space-object.js`.

### Step 3: Reliable `roomState` Sync for Powerups & Collectibles (✅ Complete)

*   **Summary:** Powerups and Collectibles are created by the Spawner and synced via `roomState`. Pickups are handled authoritatively by the client performing the pickup; they remove the item locally and send a `roomState` update (`null` value) to notify other clients of the removal.
*   **Files Affected:** `entities/powerups/powerup-manager.js`, `entities/collectibles/collectible-manager.js`, `entities/collisions/player-powerup-collider.js`, `entities/collisions/player-collectible-collider.js`.

### Step 4: Projectile Synchronization and Collision (✅ Complete)

*   **Summary:**
    *   Projectiles are created locally upon firing and an event (`fireProjectile`) including all necessary data (`owner`, `pos`, `vel`, `damage`, `color`, `gravityFactor`) is broadcast.
    *   Remote clients create a local simulation of the projectile based on the event data, ensuring consistent physics using the provided `gravityFactor`.
    *   Projectile-Space Object collisions are handled client-side:
        *   The client detecting the collision removes its local projectile simulation.
        *   The client triggers local visual effects (sparks).
        *   The client calls `spaceObjectManager.applyDamageToObject(objectId, damage, projectile.ownerId)`.
    *   `SpaceObjectManager` delegates damage handling to `SpaceObjectDamageHandler`:
        *   The *Spawner* applies damage authoritatively. If the object is destroyed, the Spawner updates `roomState` to remove the object (`null`), awards score (if destroyed by damage), and triggers drops (if destroyed by damage). If damaged but not destroyed, the Spawner updates the object's health in `roomState`.
        *   *Non-spawners* do not modify the object's health or `roomState`. They rely on the Spawner's updates. Local effects (sparks) are triggered for immediate feedback.
    *   Projectile-Player collisions remain locally authoritative (damage is only applied to the local player when their client detects the hit).
*   **Files Affected:** `entities/weapons/weapon-system.js`, `core/projectile-manager.js`, `entities/projectile.js`, `networking/network-event-handler.js`, `entities/collisions/projectile-space-object-collider.js`, `entities/space-objects/space-object-manager.js`, `entities/space-objects/space-object-damage-handler.js`.

---

## 4. Next Step

### Step 5: Review Player Synchronization (⏳ Current Step)

*   **Objective:** Verify existing player synchronization mechanisms (`presence`) are robust and smooth. Ensure player state transitions (selection, active, death) are handled consistently across clients.
*   **Tasks:**
    1.  **Presence Data Completeness:** Review `PlayerState.getPresenceData()` to ensure all critical state information (position, velocity, rotation, facing direction, health, fuel, score, invulnerability status, lifecycle state) is included for accurate remote representation. Remove any redundant or unnecessary data (e.g., maybe velocity isn't needed if interpolation is good).
    2.  **Presence Update Frequency:** Ensure `NetworkEventHandler.updateLocalPlayerPresence` is called regularly (e.g., based on `PRESENCE_UPDATE_THROTTLE`) but not excessively.
    3.  **Remote Player Interpolation:** Examine `PlayerNetworkSync.interpolatePlayerState`. Ensure it smoothly interpolates visual properties (position, rotation) towards the latest `server` state received via presence. Confirm it doesn't interpolate the local player. Snap position/rotation if the difference is too large (e.g., after respawn).
    4.  **Lifecycle State Sync:** Double-check how `PlayerLifecycleState` changes are handled in `NetworkEventHandler._handlePresenceUpdate`. Ensure remote players correctly reflect `SELECTING`, `ACTIVE`, and `DEAD` states based on received presence, and that local visual elements (like the vehicle selector) react appropriately. Ensure dead players are visually hidden or represented correctly.
    5.  **State Reset on Death/Respawn:** Verify that when a player dies (`PlayerLifecycleManager.handlePlayerDeath`) and respawns (`PlayerLifecycleManager.confirmLocalPlayerVehicleSelection` -> `Player.resetStateForSpawn`), their relevant state (position, velocity, health, fuel, score, active powerups) is reset correctly and synced via presence.
    6.  **Initial State Sync:** Confirm that when a new player joins (`NetworkEventHandler._handlePresenceUpdate` creating a new `Player`), their initial state (including lifecycle state) is correctly set based on the first presence data received.
*   **Files Involved:** `entities/player-state.js`, `entities/player.js`, `entities/player-network-sync.js`, `networking/network-event-handler.js`, `entities/player-lifecycle-manager.js`, `entities/player-manager.js`, `ui/vehicle-selector.js`.

---

## 5. Future Steps

*   **Optimize Network Traffic:** Analyze the frequency and size of presence and room state updates. Implement delta compression or other techniques if needed.
*   **Lag Compensation:** Implement more advanced lag compensation techniques for projectile hits if simple client-side authority proves insufficient.
*   **Input Buffer:** Consider implementing an input buffer on the client to send batches of inputs instead of just the latest state, potentially allowing for server-side reconciliation if needed later.
*   **Server Authority (Major Refactor):** If client-side authority leads to inconsistencies, consider migrating authoritative game logic (collisions, state changes) to a dedicated server or a more robust spawner model. (Low priority for now).

## 6. Testing and Iteration

*   Thoroughly test each step with multiple clients connected.
*   Use browser developer tools to simulate network latency and packet loss.
*   Pay close attention to object/powerup appearance/disappearance, projectile hits, score consistency, and player state consistency across different clients.
*   Iterate on the implementation based on testing feedback.

