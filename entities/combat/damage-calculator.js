// New file: Calculates damage based on collision types

const BASE_DAMAGE = {
    'player-player': 15,
    'player-projectile': 10, // Base damage, projectile might override this
    'ground': 5,
};

// Cooldown durations in milliseconds
const COLLISION_COOLDOWN = {
    'player-player': 500,
    'ground': 500, // Already defined in physics as interval
}

// Store last collision time between specific pairs or types
const lastCollisionTimes = {}; // Example: { "playerA-playerB": timestamp, "playerA-ground": timestamp }

/**
 * Calculates the damage amount for a collision.
 * Incorporates basic cooldown logic.
 * @param {string} type - Collision type ('player-player', 'player-projectile', 'ground').
 * @param {Player} targetEntity - The entity taking the damage.
 * @param {Player | Projectile | null} sourceEntity - The entity causing the damage (or null for ground).
 * @param {number} currentTime - Current game time (performance.now()).
 * @returns {number} - The calculated damage amount (0 if on cooldown).
 */
export function calculateCollisionDamage(type, targetEntity, sourceEntity, currentTime) {
    let damage = BASE_DAMAGE[type] || 0;
    const cooldownDuration = COLLISION_COOLDOWN[type] || 0;
    let collisionKey = null;

    if (type === 'player-player' && sourceEntity) {
        // Create a sorted key for player-player pairs
        collisionKey = [targetEntity.id, sourceEntity.id].sort().join('-');
    } else if (type === 'ground') {
        // Ground damage cooldown is handled in player-physics using lastGroundDamageTime
        // We just return the base damage here.
        return BASE_DAMAGE['ground'];
    } else if (type === 'player-projectile') {
        // Projectiles have their own damage, potentially overriding base
        damage = sourceEntity?.damage || BASE_DAMAGE['player-projectile'];
        // Projectiles don't have cooldowns, they are destroyed on impact
         return damage;
    }

    // Check cooldown for player-player collision
    if (collisionKey && cooldownDuration > 0) {
        const lastTime = lastCollisionTimes[collisionKey] || 0;
        if (currentTime - lastTime < cooldownDuration) {
            return 0; // On cooldown
        }
        lastCollisionTimes[collisionKey] = currentTime; // Update last collision time
    }

    // Apply modifiers later (e.g., velocity, armor)
    // ...

    return damage;
}