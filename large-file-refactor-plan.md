# Large File Refactoring Plan

This plan outlines the steps to refactor large player-related files into smaller, more modular components and consolidate duplicate files. The goal is to improve maintainability and clarity by ensuring each module has a single, well-defined responsibility. Each step modifies only one of the original large files at a time.

**Target Files for Refactoring:**

*   `entities/player-manager.js`
*   `entities/player-physics.js`
*   `entities/player.js`
*   ~~`player-manager.js` (Duplicate)~~
*   ~~`player-physics.js` (Duplicate)~~

**Refactoring Steps:**

1.  **[X] Delete `player-manager.js` (Root):**
    *   **Action:** Delete the `player-manager.js` file located in the root directory.
    *   **Reasoning:** This file appears unused, as imports point to `entities/player-manager.js`. This removes redundancy.

2.  **[X] Delete `player-physics.js` (Root):**
    *   **Action:** Delete the `player-physics.js` file located in the root directory.
    *   **Reasoning:** This file appears unused, as imports point to `entities/player-physics.js`. This removes redundancy.

3.  **[X] Refactor `entities/player-manager.js` - Extract Collision Logic:**
    *   **Action:**
        *   Create a new file `entities/combat/collision-manager.js`.
        *   Move the `handleCollisions` method logic from `entities/player-manager.js` into a method within `CollisionManager`.
        *   The `CollisionManager` will need references to `PlayerManager`, `ProjectileManager`, `PowerupManager`, `ParticleSystem`, `renderScale`, `calculateCollisionDamage`, and the collision checking functions.
        *   Update `game.js` to instantiate `CollisionManager` and call its collision handling method in the `update` loop instead of `playerManager.handleCollisions`.
        *   Remove the `handleCollisions` method from `entities/player-manager.js`.
    *   **Goal:** Isolate collision detection logic into its own manager.

4.  **[X] Refactor `entities/player-manager.js` - Extract Lifecycle Logic:**
    *   **Action:**
        *   Create a new file `entities/player-lifecycle-manager.js`.
        *   Move the lifecycle-specific methods (`triggerLocalPlayerRespawn`, `confirmLocalPlayerVehicleSelection`, `killLocalPlayer`, `handlePlayerDeath`) from `entities/player-manager.js` to `PlayerLifecycleManager`.
        *   `PlayerLifecycleManager` will need references to `PlayerManager`, `NetworkManager`, `VehicleSelector`, `gameWidth`, `gameHeight`, `renderScale`, `SPRITES`, `getVehicleConfig`.
        *   Update `game.js` to instantiate `PlayerLifecycleManager` and pass it to `PlayerManager`. Update the `VehicleSelector` callback and debug key check in `game.js` to use `PlayerLifecycleManager`.
        *   Update `PlayerManager` to store the `PlayerLifecycleManager` reference.
        *   Update `entities/vehicles/health-system.js` to call `playerManager.playerLifecycleManager.handlePlayerDeath`.
        *   Remove these specific lifecycle methods from `entities/player-manager.js`. `PlayerManager` will still manage player creation/removal and updates.
    *   **Goal:** Centralize player state transition management (respawn, death, selection).

5.  **Refactor `entities/player.js` - Simplify Update & Interactions:**
    *   **Action:**
        *   Review the `Player.update` method. Ensure it primarily acts as an orchestrator, calling functions from imported modules (`player-physics`, `player-animation`, `player-actions`, `health-system`, `fuel-system`, `powerup-effects`).
        *   Ensure `Player.takeDamage` correctly calls `applyDamage` from `entities/vehicles/health-system.js`.
        *   Ensure `Player.transitionToState` handles only the state change and immediate side-effects, possibly coordinating with `PlayerLifecycleManager` if complex transitions are needed later.
        *   Minimize complex calculations or state manipulations directly within `player.js`.
    *   **Goal:** Make `Player.js` a thinner class focused on coordinating its various systems based on its state.

6.  **Review `entities/player-physics.js`:**
    *   **Action:**
        *   Verify that `updatePlayerPhysics` remains focused solely on calculating velocity, acceleration, position, and rotation based on the player's current state and input intent (flags like `isThrusting`, `isMovingLeft`, etc.).
        *   Confirm that interactions with other systems (like consuming fuel or taking ground damage) are done by calling the appropriate functions imported from `fuel-system.js` and `health-system.js`.
        *   Ensure powerup effects are applied by using multipliers obtained via `getPowerupMultiplier`.
    *   **Goal:** Confirm `player-physics.js` adheres to its single responsibility of physics calculations.

**Post-Refactor State:**

*   No duplicate files in the root directory.
*   `entities/player-manager.js` focuses on managing the collection of `Player` instances (creation, removal, lookup, basic update loop trigger).
*   `entities/player.js` acts as an orchestrator for an individual player's state and systems.
*   `entities/player-physics.js` handles physics calculations.
*   `entities/combat/collision-manager.js` handles all collision detection logic.
*   `entities/player-lifecycle-manager.js` handles player state transitions like death, respawn, and vehicle selection confirmation.
*   Other specialized modules (`player-input`, `player-renderer`, `player-actions`, `health-system`, etc.) continue their specific roles.