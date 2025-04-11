// Calculates damage based on collision types

const BASE_DAMAGE = {
    'player-player': 15,
    'player-projectile': 10, // Base damage, projectile might override this
    'player-spaceobject': 10, // Base damage from player/object collision (applies to both)
    'projectile-spaceobject': 0, // Damage comes from projectile's value
};

// Cooldown durations in milliseconds
const COLLISION_COOLDOWN = {
    'player-player': 500,
    'player-spaceobject': 300, // Cooldown for player taking damage from *any* object collision
}

// Store last collision time between specific pairs or types
const lastCollisionTimes = {}; // Examples: { "playerA-playerB": timestamp, "playerA-spaceobject": timestamp }

/**
 * Calculates the damage amount for a collision.
 * Incorporates basic cooldown logic for player-player and player-object collisions.
 * Note: Ground damage is handled separately in player-physics.
 * @param {string} type - Collision type ('player-player', 'player-projectile', 'player-spaceobject', 'projectile-spaceobject').
 * @param {Player | SpaceObject} targetEntity - The entity taking the damage.
 * @param {Player | Projectile | SpaceObject} sourceEntity - The entity causing the damage.
 * @param {number} currentTime - Current game time (performance.now()).
 * @returns {number} - The calculated damage amount (0 if on cooldown).
 */
export function calculateCollisionDamage(type, targetEntity, sourceEntity, currentTime) {
    let damage = BASE_DAMAGE[type] || 0;
    const cooldownDuration = COLLISION_COOLDOWN[type] || 0;
    let collisionKey = null;

    // Ensure entities are valid before proceeding
    if (!targetEntity || !sourceEntity) return 0;

    if (type === 'player-player') {
        // Create a sorted key for player-player pairs to ensure cooldown works regardless of order
        collisionKey = [targetEntity.id, sourceEntity.id].sort().join('-');
    } else if (type === 'player-projectile') {
        // Projectiles have their own damage, potentially overriding base
        // Ensure sourceEntity is a projectile and has a damage property
        damage = sourceEntity?.damage ?? BASE_DAMAGE['player-projectile'];
        // Projectiles don't have cooldowns handled here, they are destroyed on impact
        return damage;
    } else if (type === 'player-spaceobject') {
        // For player-object collisions, we need to consider the cooldown for the player
        collisionKey = `player-${targetEntity.id}`;
    } else if (type === 'projectile-spaceobject') {
        // Projectiles have their own damage, potentially overriding base
        // Ensure sourceEntity is a projectile and has a damage property
        damage = sourceEntity?.damage ?? 0;
        // Projectiles don't have cooldowns handled here, they are destroyed on impact
        return damage;
    } else {
        // Unknown or unhandled collision type for damage calculation
        console.warn(`Unhandled damage calculation type: ${type}`);
        return 0;
    }

    // Check cooldown for player-player collision
    if (collisionKey && cooldownDuration > 0) {
        const lastTime = lastCollisionTimes[collisionKey] || 0;
        if (currentTime - lastTime < cooldownDuration) {
            // console.log(`Collision on cooldown for ${collisionKey}`);
            return 0; // On cooldown
        }
        lastCollisionTimes[collisionKey] = currentTime; // Update last collision time
        // console.log(`Collision damage applied for ${collisionKey}. Updating cooldown.`);
    }

    // Apply modifiers later (e.g., velocity, armor)
    // ...

    return damage;
}