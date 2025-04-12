# Multiplayer Synchronization Improvement Plan

## 1. Goal

To achieve reliable and smooth network synchronization for the Vehicle Combat Game, ensuring a consistent experience for all players regarding player movement, object states, powerups, collectibles, and projectiles, even with network latency.

## 2. Core Principles

*   **Spawner Authority:** The first client to join (`Spawner`) manages shared `roomState` (Space Objects, Powerups, Collectibles).
*   **Client Authority:** Players manage their own `presence` (position, stats, actions). Projectile firing originates from the client. Collisions resulting in local effects (damage to self, pickup) are handled by the client detecting them.
*   **State Synchronization:** `roomState` syncs shared elements; `presence` syncs player states.
*   **Event Broadcasting:** Transient events like `fireProjectile` are broadcast.
*   **Interpolation:** Smooths visual movement of remote entities.

## 3. Implementation Summary (Completed Steps)

*   **Step 1: Spawner Authority:** Established the first client as the Spawner for `roomState` entities. (✅)
*   **Step 2: Space Object Sync:** Spawner creates/updates objects in `roomState`. Non-spawners create/interpolate based on `roomState`. (✅ - *But movement sync needs debugging*)
*   **Step 3: Powerup & Collectible Sync:** Spawner creates in `roomState`. Client pickup triggers local removal + `roomState` update (`null`). (✅ - *But reliability needs debugging*)
*   **Step 4: Projectile Sync & Collision:** Firing broadcasts an event. Remote clients simulate projectiles. Collisions trigger local effects; damage to objects relies on Spawner confirmation via `roomState`; damage to local players is immediate. (✅ - *But visibility needs debugging*)
*   **Step 5: Player Sync:** Player position, stats, and lifecycle states are synced via `presence` and interpolated. (✅)

---

## 4. Current Step & Remaining Issues

### Step 6: Troubleshooting & Refinement (⏳ Current Step)

*   **Objective:** Diagnose and fix the remaining synchronization inconsistencies: static objects for late joiners, unreliable powerup/collectible visibility, and invisible projectiles on remote clients. Refine visual smoothness.
*   **Identified Issues & Debugging Tasks:**
    1.  **Object Movement Sync Issue:** Clients joining an existing room see objects in their initial positions, but these objects remain static.
        *   **Debug Focus:**
            *   `entities/space-objects/space-object-sync.js`: Verify `syncSpaceObjects` correctly updates the position (`x`, `y`), velocity (`vx`, `vy`), rotation, and health of *existing* local object instances based on incoming `objectData`, not just creating new ones. Ensure `serverX/Y/Vx/Vy/Rotation/Health` properties are updated.
            *   `entities/space-objects/space-object.js`: Confirm `interpolateState` is correctly called for non-spawner objects within `SpaceObjectManager.update` and uses the updated `serverX/Y/Vx/Vy...` values effectively. Check the `INTERPOLATION_FACTOR` and snap threshold.
            *   `entities/space-objects/space-object-manager.js`: Ensure the Spawner's `update` loop consistently detects changes (position, velocity, rotation, health) and sends `roomState` updates. Verify `getSyncData` includes `vx` and `vy`.
    2.  **Powerup/Collectible Sync Issue:** Powerups and collectibles sometimes don't appear/disappear consistently across clients.
        *   **Debug Focus:**
            *   `entities/powerups/powerup-manager.js`: Review `_syncPowerups`. Add logging to track received `powerupData`, creation/deletion of local instances, and final `activePowerups` state after sync. Verify the Spawner correctly calls `updateRoomState` upon creation (`spawnPowerupAt`) and expiration (`update`). Verify clients correctly call `updateRoomState` with `null` upon pickup (`pickupPowerup`).
            *   `entities/collectibles/collectible-manager.js`: Review `_syncCollectibles`. Add similar logging as for powerups. Verify Spawner `updateRoomState` calls (spawn/expiration) and client `updateRoomState` calls (pickup). Check lifespan logic in `update`.
            *   `Networking/NetworkManager.js`: Add temporary logging within `_handleRoomStateUpdate` to see the *exact* `roomState` data being received just before it's passed to the managers.
    3.  **Projectile Visibility Issue:** Projectiles fired by one player are often not visible to others.
        *   **Debug Focus:**
            *   `entities/weapons/weapon-system.js`: Confirm `networkManager.sendEvent` is called with the correct `fireProjectile` event data (including all necessary projectile state: `id`, `ownerId`, `x`, `y`, `vx`, `vy`, `color`, `damage`, `gravityFactor`). Ensure `echo: false` is intended (prevents sender receiving own event).
            *   `networking/network-event-handler.js`: Add logging inside `_handleMessage` for the `fireProjectile` case *before* calling `projectileManager.createProjectile`. Log the received `data.projectile` content to ensure it's complete and correct.
            *   `core/projectile-manager.js`: Add logging inside `createProjectile` when called for a *remote* projectile (i.e., one received via network event) to confirm it's being added to the `this.projectiles` map.
            *   `entities/projectile.js`: Check the `update` and `draw` methods. Is there any condition preventing drawing or causing immediate removal on remote clients (e.g., incorrect bounds check, lifespan issue)?
    4.  **General Refinement:**
        *   Review interpolation factors (`REMOTE_OBJECT_INTERPOLATION_FACTOR`, `REMOTE_PLAYER_INTERPOLATION_FACTOR`) for smoothness vs. responsiveness.
        *   Analyze network traffic for overly frequent or large updates.
        *   Profile CPU usage for bottlenecks (collision detection, particles).
        *   Clean up redundant console logs once issues are resolved.

---

## 5. Future Steps

*   **Advanced Lag Compensation:** Implement server-side reconciliation or other techniques for projectile hits if client-side authority proves insufficient for accuracy.
*   **Input Buffer:** Batch client inputs for potential server-side processing (lower priority).
*   **Dedicated Server/Authoritative Spawner:** Migrate more game logic authority if the distributed model remains problematic (major refactor).

