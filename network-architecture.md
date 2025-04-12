# Network Architecture for Multiplayer Synchronization

## 1. Core Architecture Principles

### 1.1 Single Source of Truth
Every game element must have exactly ONE authoritative source (client) that owns its state.

### 1.2 Consistent Spawner Designation
- First connected client always becomes the "spawner" for environment objects
- Each client is authoritative for their own player and the projectiles they fire
- Spawner client manages space objects and powerups lifecycle

### 1.3 Full State Synchronization
- All game state changes must be reflected in either:
  - Room state (for environment objects: space objects, powerups)
  - Presence (for player-specific data)
  - Events (for real-time, transient actions like firing projectiles)

## 2. Component Authority Map

| Game Element       | Authority              | Sync Mechanism    | Notes                                |
|--------------------|------------------------|-------------------|--------------------------------------|
| Player Movement    | Player's client        | Presence          | Already working correctly            |
| Space Objects      | Spawner client only    | Room State        | Needs deterministic spawning         |
| Powerups           | Spawner client only    | Room State        | Needs consistent lifecycle           |
| Projectiles        | Firing player's client | Events + Local    | Need proper broadcast and receiving  |
| Collisions         | Target object's owner  | Authority-specific| Damage request pattern               |

## 3. Synchronization Flow

### 3.1 Initial Client Connection
1. Client connects and determines if it's the spawner (first client)
2. Client receives complete room state including all existing objects
3. Client initializes local representations of all objects based on room state

### 3.2 Space Object Lifecycle
1. **Creation**: ONLY spawner can create space objects
   - Generate deterministic ID, type, position, velocity
   - Add to roomState.spaceObjects
   - All other clients receive update and create local instances
   
2. **Updates**: ONLY spawner updates space object properties
   - Position, velocity, health updated by spawner
   - Changes sent via roomState.spaceObjects
   - Non-spawner clients receive updates and interpolate

3. **Destruction**: ONLY spawner destroys space objects
   - Spawner marks object for destruction (null in roomState)
   - All clients remove the object when they receive update

### 3.3 Powerup Lifecycle
1. **Creation**: ONLY spawner creates powerups
   - Generate deterministic ID, type, position
   - Add to roomState.activePowerups
   - All clients receive update and create local instances

2. **Collection**: Any client can collect, but must notify spawner
   - Client detects local collision
   - Client requests spawner to remove powerup
   - Spawner updates roomState
   - All clients remove the powerup

### 3.4 Projectile Handling
1. **Firing**: Client fires projectile locally
   - Generate unique ID including owner ID
   - Create locally AND broadcast via event (not roomState)
   - All clients receive event and create identical projectile

2. **Updates**: Each client updates projectiles locally
   - Physics calculated independently on each client
   - No synchronization of position updates
   - Deterministic physics ensure consistency

3. **Destruction**: Client that detects collision destroys locally
   - No need to synchronize destruction (short lifecycle)
   - Deterministic physics should ensure similar collision timing

## 4. Implementation Roadmap

### 4.1 Space Object System Refactor
- Modify SpaceObjectManager to enforce spawner-only creation/updates
- Ensure deterministic spawn logic (fixed seed, same order)
- Improve interpolation for non-spawner clients
- Fix object type consistency in spawning

### 4.2 Powerup System Refactor
- Align with space object pattern (spawner authority)
- Fix collection synchronization
- Implement proper state transfer for late-joining clients

### 4.3 Projectile System Refactor
- Change from roomState to event-based broadcasting
- Ensure all projectile parameters are included in events
- Fix projectile lifecycle to ensure visibility on all clients

### 4.4 Collision Management Refactor
- Client authority for damage assessment
- Network requests for damage application
- Consistent particle effects

## 5. Technical Implementation Details

### 5.1 Deterministic Object Creation
```javascript
// Use timestamp + fixed seed in spawner
_getWeightedRandomType(timestamp) {
    // Use timestamp to seed a simple deterministic random function
    const seed = (timestamp * 12345) % 99999;
    const rand = ((seed * 181) % 359) / 359; // Deterministic value 0-1
    
    // Use consistent weights and thresholds
    if (rand < 0.6) return 'asteroid';
    if (rand < 0.85) return 'lander';
    return 'rover';
}
```