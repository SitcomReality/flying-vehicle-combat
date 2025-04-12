# Untitled Game Implementation Plan

## Potential Game Names

*   Crayon Combat Cruisers
*   Scribble Space Race
*   Pastel Planet Punks
*   Ionosphere Impact
*   Vector Velocity Vanguard
*   Doodle Drive Derby

## Overview

This document outlines the step-by-step process for implementing new features in our game. Our approach focuses on modularity, breaking each system into discrete components to maintain clean architecture and facilitate future extensions.

## Implementation Strategy

We'll implement features incrementally, adding tests as we go. Each system will be composed of small, focused modules with clear responsibilities. This approach will allow us to:

1.  Add features progressively without breaking existing functionality.
2.  Maintain clean separation of concerns.
3.  Easily extend the system with new vehicles, powerups, weapons, etc.
4.  Simplify debugging and maintenance.

## Current Focus: User Interface and Persistence

### Scoring System

*   The scoring system is handled by `Player.state.score` and `Player.addScore`.
*   `ui/scoreboard.js` has been created to display current player scores (names and scores).
    *   It is positioned to the left side of the canvas (moves below on smaller screens via CSS).
    *   It updates dynamically based on `PlayerManager` data.

### Persistence

1.  **Create `networking/score-persistence.js`**
    *   Function to save a new score record using `WebsimSocket` (e.g., `saveScore(username, score)`).
    *   Function to retrieve the top N high scores using `WebsimSocket` (e.g., `getHighScores(limit)`).
2.  **Create `ui/leaderboard.js`**
    *   Display all-time high scores persisted via `WebsimSocket`.
    *   Position to the right side of the canvas on wide screens, or beneath it on smaller devices.
    *   Fetch data using `score-persistence.js`.
    *   Update when new high score records are set (using `subscribe`?).
3.  **Integrate Persistence**
    *   Call `saveScore` when a local player's game ends (likely in `PlayerLifecycleManager.handlePlayerDeath` or similar).
    *   Call `getHighScores` when the leaderboard UI needs to be populated or updated.

## Future Features

### Weapons System

1.  **Create `entities/weapons/weapon-system.js`**
    *   Base class or module for weapon logic.
    *   Handle charging, firing logic (integrating with `PlayerActions`).
    *   Manage cooldowns, ammo (if applicable).
2.  **Create `entities/weapons/weapon-types/`**
    *   Implement specific weapon types (e.g., `standard-blaster.js`, `charge-beam.js`).
    *   Define unique stats and behaviors per weapon.
3.  **Create `entities/weapons/projectile-types/`**
    *   Define different projectile behaviors (e.g., `standard-bullet.js`, `homing-missile.js`, `laser-beam.js`).
    *   Implement physics and collision interactions for each type.
4.  **Update `core/projectile-manager.js`**
    *   Enhance to support different projectile types and their specific update/draw logic.

### Game Flow and State Management

1.  **Create `core/game-state-manager.js`**
    *   Manage overall game states (e.g., `MainMenu`, `Playing`, `Paused`, `GameOver`).
    *   Coordinate system interactions based on the current state.
    *   Handle transitions between states.
2.  **Refactor `game.js`**
    *   Move state-specific logic from `game.js` into `game-state-manager.js`.
    *   Keep `game.js` focused on initialization and the main game loop delegation.

### Visual Effects and Audio

1.  **Enhance `rendering/particle-system.js`**
    *   Add distinct particle effects for powerup pickups and activations.
    *   Implement explosion effects for vehicle destruction.
    *   Create visual effects for collecting different types of collectibles.
2.  **Create `audio/sound-manager.js`**
    *   Implement a system to load and play sound effects.
    *   Trigger sounds for key events: firing, hits, explosions, powerups, collectibles, thrust, UI interactions.
    *   Add background music handling (optional looping track).

### Testing and Balancing

1.  Create test scenarios or debug modes to test specific systems in isolation.
2.  Balance vehicle stats (health, fuel, speed, damage).
3.  Adjust powerup effectiveness, duration, and spawn rates.
4.  Fine-tune collectible values and drop rates.
5.  Balance space object health, speed, and spawn frequency.