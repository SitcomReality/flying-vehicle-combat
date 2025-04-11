// Calculates damage based on collision types

const BASE_DAMAGE = {
    'player-player': 15,
    'player-projectile': 10, // Base damage, projectile might override this
    // Ground damage amount is defined in player-physics.js
};

// Cooldown durations in milliseconds
const COLLISION_COOLDOWN = {
    'player-player': 500,
    // Ground damage cooldown is handled separately in player-physics.js
}

// Store last collision time between specific pairs or types
const lastCollisionTimes = {}; // Example: { "playerA-playerB": timestamp }

/**
 * Calculates the damage amount for a collision.
 * Incorporates basic cooldown logic for player-player collisions.
 * Note: Ground damage is handled separately in player-physics.
 * @param {string} type - Collision type ('player-player', 'player-projectile').
 * @param {Player} targetEntity - The entity taking the damage.
 * @param {Player | Projectile} sourceEntity - The entity causing the damage.
 * @param {number} currentTime - Current game time (performance.now()).
 * @returns {number} - The calculated damage amount (0 if on cooldown).
 */
export function calculateCollisionDamage(type, targetEntity, sourceEntity, currentTime) {
    let damage = BASE_DAMAGE[type] || 0;
    const cooldownDuration = COLLISION_COOLDOWN[type] || 0;
    let collisionKey = null;

    if (type === 'player-player') {
        // Create a sorted key for player-player pairs to ensure cooldown works regardless of order
        collisionKey = [targetEntity.id, sourceEntity.id].sort().join('-');
    } else if (type === 'player-projectile') {
        // Projectiles have their own damage, potentially overriding base
        damage = sourceEntity?.damage || BASE_DAMAGE['player-projectile'];
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
            // console.log(`Player-player collision on cooldown for ${collisionKey}`);
            return 0; // On cooldown
        }
        lastCollisionTimes[collisionKey] = currentTime; // Update last collision time
        // console.log(`Player-player collision damage applied for ${collisionKey}. Updating cooldown.`);
    }

    // Apply modifiers later (e.g., velocity, armor)
    // ...

    return damage;
}