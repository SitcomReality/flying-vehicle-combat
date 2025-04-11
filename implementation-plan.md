# Crayon Racer Implementation Plan

This document outlines the step-by-step process for implementing new features in our game. Our approach focuses on modularity, breaking each system into discrete components to maintain clean architecture and facilitate future extensions.

## Implementation Strategy

We'll implement features incrementally, adding tests as we go. Each system will be composed of small, focused modules with clear responsibilities. This approach will allow us to:

1. Add features progressively without breaking existing functionality
2. Maintain clean separation of concerns
3. Easily extend the system with new vehicles, powerups, weapons, etc.
4. Simplify debugging and maintenance

## Phase 1: Core Systems Refactoring

### 1.1 Vehicle System Refactoring

1. Create `entities/vehicles/vehicle-types.js`
   - Define base stats for the three vehicle types
   - Include properties: health, speed, acceleration, fuel capacity, etc.

2. Create `entities/vehicles/vehicle-factory.js`
   - Factory function to create vehicles based on type
   - Instantiate with correct sprite and properties

3. Update `player-state.js`
   - Add health, fuel properties
   - Add vehicle type identification

4. Create `entities/vehicles/vehicle-stats.js`
   - Contains calculation helpers for modified stats (with powerups)

### 1.2 Player Lifecycle System

1. Create `entities/player-lifecycle.js`
   - Implement state machine: spectating, selecting, active, dead
   - Handle transitions between states

2. Create `ui/vehicle-selector.js`
   - UI component for choosing vehicle
   - Display vehicle stats comparison

3. Update `player-manager.js`
   - Add methods to handle player state changes
   - Add player respawn/vehicle change

## Phase 2: Game Mechanics

### 2.1 Health and Fuel Systems

1. Create `entities/vehicles/health-system.js`
   - Damage taking logic (with cooldowns)
   - Death handling

2. Create `entities/vehicles/fuel-system.js`
   - Fuel consumption mechanics
   - Regeneration logic
   - Thrust limitation based on fuel

3. Create `ui/status-bars.js`
   - Render health and fuel bars
   - Position beneath vehicles

### 2.2 Combat System Enhancement

1. Create `entities/combat/collision-detector.js`
   - Implement hitbox-based collision detection
   - Vehicle-to-vehicle collision
   - Vehicle-to-projectile collision
   - Vehicle-to-ground collision with damage cooldown

2. Create `entities/combat/damage-calculator.js`
   - Calculate damage based on collision types
   - Apply vehicle-specific modifiers

3. Update `player-physics.js`
   - Add ground collision check with 500ms cooldown
   - Trigger damage on collision

## Phase 3: Weapons and Powerups

### 3.1 Weapons System

1. Create `entities/weapons/weapon-system.js`
   - Base class for weapons
   - Handle charging, firing, cooldown

2. Create `entities/weapons/weapon-types/`
   - Individual weapon implementation files
   - Default weapon in `standard-blaster.js`

3. Create `entities/weapons/projectile-types/`
   - Different projectile behaviors
   - Implement physics for each type

4. Update `core/projectile-manager.js`
   - Support different projectile types

### 3.2 Powerup System

1. Create `entities/powerups/powerup-system.js`
   - Core powerup management
   - Activation/deactivation
   - Duration tracking

2. Create `entities/powerups/powerup-types/`
   - Individual powerup implementation files
   - One file per powerup type

3. Create `entities/powerups/powerup-effects.js`
   - Apply/remove effects to player state
   - Handle stacking/conflicts

4. Create `entities/powerups/powerup-factory.js`
   - Generate powerups with appropriate properties
   - Balance drop rates

## Phase 4: Game Objects and Collectibles

### 4.1 Space Objects System

1. Create `entities/space-objects/space-object.js`
   - Base class for all space objects

2. Create `entities/space-objects/space-object-types/`
   - Implementation for each object type:
     - `alien-lander.js` - Wobbling movement
     - `asteroid.js` - Tumbling physics
     - `rover.js` - Ground movement

3. Create `entities/space-objects/space-object-spawner.js`
   - Spawn objects from right side
   - Control spawn rates and patterns

4. Create `entities/space-objects/space-object-manager.js`
   - Track and update all space objects
   - Handle destruction and drops

### 4.2 Collectibles System

1. Create `entities/collectibles/collectible.js`
   - Base class for collectibles

2. Create `entities/collectibles/collectible-types/`
   - Implement different collectibles:
     - `coin.js` (1 point)
     - `gems.js` (multiple values)

3. Create `entities/collectibles/collectible-manager.js`
   - Track active collectibles
   - Handle collection and scoring

4. Create `entities/collectibles/drop-system.js`
   - Generate drops when objects are destroyed
   - Control probabilities for different items

## Phase 5: User Interface and Persistence

### 5.1 Scoring System

1. Create `core/score-system.js`
   - Track player scores
   - Handle score events

2. Create `ui/scoreboard.js`
   - Display current player scores
   - Responsive layout for different screen sizes

3. Create `ui/leaderboard.js`
   - Display all-time high scores
   - Update when new records are set

### 5.2 Persistence

1. Create `networking/score-persistence.js`
   - Save scores to server
   - Retrieve high scores

2. Update `network-manager.js`
   - Add methods for score data
   - Implement persistence API calls

3. Create `ui/high-score-display.js`
   - Format and show high scores
   - Handle transitions and updates

## Phase 6: Integration and Polish

### 6.1 Game Flow Integration

1. Update `game.js`
   - Integrate all new systems
   - Handle game state transitions

2. Create `core/game-state-manager.js`
   - Handle overall game state
   - Coordinate system interactions

### 6.2 Visual Effects and Audio

1. Enhance `rendering/particle-system.js`
   - Add effects for powerups
   - Add effects for vehicle destruction
   - Add effects for collectibles

2. Create `audio/sound-manager.js`
   - Play appropriate sounds for events
   - Background music handling

### 6.3 Testing and Balancing

1. Create test scenarios for each system
2. Balance vehicle stats
3. Balance powerup effectiveness and duration
4. Fine-tune spawn rates and difficulties

## Implementation Order Recommendation

To maintain a functional game throughout development:

1. Start with Vehicle System Refactoring
2. Implement Health and Fuel Systems
3. Enhance the Combat System
4. Add Space Objects System
5. Implement Collectibles System
6. Add Weapons and Powerups
7. Develop UI components and scoring
8. Implement persistence
9. Polish and balance

This approach will allow incremental testing and ensure core gameplay remains functional while new features are added.

