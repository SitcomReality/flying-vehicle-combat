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

### Step 1: Solidify Spawner Authority Role (✅ Largely Complete)

*   **Summary:** The first client to join (`Spawner`) is now responsible for creating and managing the state (position, health, destruction) of Space Objects, Powerups, and Collectibles within the shared `roomState`. Non-spawner clients rely on `roomState` updates for these entities and do not modify them directly.
*   **Files Affected:** `entities/space-objects/space-object-manager.js`, `entities/powerups/powerup-manager.js`, `entities/collectibles/collectible-manager.js`.

### Step 2: Reliable `roomState` Sync for Space Objects (✅ Complete)

*   **Summary:** Space Objects are consistently created, updated (position, health, rotation), and removed across clients based on the Spawner's `roomState` updates. Non-spawner clients interpolate the movement of remote objects for smoothness.
*   **Files Affected:** `entities/space-objects/space-object-manager.js`, `entities/space-objects/space-object-sync.js`, `entities/space-objects/space-object.js`.

### Step 3: Reliable `roomState` Sync for Powerups & Collectibles (✅ Complete)

*   **Summary:** Powerups and Collectibles are created by the Spawner and synced via `roomState`. Pickups are handled authoritatively by the client performing the pickup; they remove the item locally and send a `roomState` update (`null` value) to notify other clients of the removal.
*   **Files Affected:** `entities/powerups/powerup-manager.js`, `entities/collectibles/collectible-manager.js`, `entities/collisions/player-powerup-collider.js`, `entities/collisions/player-collectible-collider.js`.

---

## 4. Next Step

### Step 4: Projectile Synchronization and Collision (⏳ Current Step)

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
*   **Files Involved:** `entities/weapons/weapon-system.js`, `core/projectile-manager.js`, `entities/projectile.js`, `networking/network-event-handler.js`, `entities/collisions/projectile-space-object-collider.js`, `entities/space-objects/space-object-manager.js`, `entities/space-objects/space-object-damage-handler.js`.

---

## 5. Future Steps

### Step 5: Review Player Synchronization (Held - Seems OK for now)

*   **Objective:** Verify existing player sync mechanisms are robust.
*   **Tasks:**
    1.  **Presence Data:** Ensure `PlayerState.getPresenceData` includes all necessary state.
    2.  **Updates:** Confirm `NetworkEventHandler.updateLocalPlayerPresence` is called regularly.
    3.  **Lifecycle Sync:** Double-check that transitions between `PlayerLifecycleState` are correctly reflected and handled.
    4.  **Interpolation:** Confirm `PlayerNetworkSync.interpolatePlayerState` is correctly smoothing remote players.
*   **Files Involved:** `entities/player-state.js`, `entities/player.js`, `entities/player-network-sync.js`, `networking/network-event-handler.js`, `entities/player-lifecycle-manager.js`.

## 6. Testing and Iteration

*   Thoroughly test each step with multiple clients connected.
*   Use browser developer tools to simulate network latency and packet loss.
*   Pay close attention to object/powerup appearance/disappearance, projectile hits, and score consistency across different clients.
*   Iterate on the implementation based on testing feedback.

