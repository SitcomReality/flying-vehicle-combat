// New file: Defines the types and properties of powerups

import { SPRITES } from '../../config/sprites.js'; // Access sprite indices

export const PowerupType = {
    HEALTH_PACK: 'HEALTH_PACK',
    FUEL_PACK: 'FUEL_PACK',
    SPEED_BOOST: 'SPEED_BOOST',
    DAMAGE_BOOST: 'DAMAGE_BOOST',
    RAPID_FIRE: 'RAPID_FIRE', // Added Rapid Fire
    INVULNERABILITY: 'INVULNERABILITY',
};

// Map PowerupType to sprite frame index from iono_powerups_spritesheet.png
const POWERUP_SPRITE_MAP = {
    [PowerupType.HEALTH_PACK]: 3, // plus sign
    [PowerupType.FUEL_PACK]: 1, // lightning bolt (repurposed for fuel)
    [PowerupType.SPEED_BOOST]: 2, // up arrow
    [PowerupType.DAMAGE_BOOST]: 0, // rocket (repurposed for damage)
    [PowerupType.RAPID_FIRE]: 5, // dots
    [PowerupType.INVULNERABILITY]: 7, // star
};

export const POWERUP_CONFIG = {
    // --- Adjust Drop Weights for new requirement ---
    [PowerupType.HEALTH_PACK]: {
        duration: 0, // Instant effect
        value: 50,   // Amount of health restored
        spriteIndex: POWERUP_SPRITE_MAP[PowerupType.HEALTH_PACK],
        name: 'Health Pack',
        dropWeight: 1, // Rarest drop
    },
    [PowerupType.FUEL_PACK]: {
        duration: 0, // Instant effect
        value: 150,   // Amount of fuel restored
        spriteIndex: POWERUP_SPRITE_MAP[PowerupType.FUEL_PACK],
        name: 'Fuel Pack',
        dropWeight: 15, // Most common drop
    },
    [PowerupType.SPEED_BOOST]: {
        duration: 8000, // 8 seconds
        multiplier: 1.4, // 40% speed increase
        spriteIndex: POWERUP_SPRITE_MAP[PowerupType.SPEED_BOOST],
        name: 'Speed Boost',
        dropWeight: 5, // Medium drop rate
    },
    [PowerupType.DAMAGE_BOOST]: {
        duration: 10000, // 10 seconds
        multiplier: 2.5, // 50% damage increase
        spriteIndex: POWERUP_SPRITE_MAP[PowerupType.DAMAGE_BOOST],
        name: 'Damage Boost',
        dropWeight: 4, // Medium drop rate
    },
    [PowerupType.RAPID_FIRE]: {
        duration: 7000, // 7 seconds
        multiplier: 1.8, // 80% faster fire rate
        spriteIndex: POWERUP_SPRITE_MAP[PowerupType.RAPID_FIRE],
        name: 'Rapid Fire',
        dropWeight: 4, // Medium drop rate
    },
    [PowerupType.INVULNERABILITY]: {
        duration: 5000, // 5 seconds
        spriteIndex: POWERUP_SPRITE_MAP[PowerupType.INVULNERABILITY],
        name: 'Invincibility Shield',
        dropWeight: 2, // Rare drop, but more common than health
    },
    // --- End Drop Weight Adjustment ---
};

export function getPowerupConfig(type) {
    return POWERUP_CONFIG[type];
}

export function getPowerupSpriteFrame(type) {
     const config = getPowerupConfig(type);
     const spriteIndex = config?.spriteIndex;
     if (spriteIndex !== undefined && spriteIndex >= 0 && spriteIndex < SPRITES.powerups.frames.length) {
         return SPRITES.powerups.frames[spriteIndex];
     }
     console.warn(`Could not find sprite frame for powerup type: ${type}`);
     return null; // Return null if no valid sprite found
}

// Function to get a random powerup type based on weights
export function getRandomPowerupType() {
    const weights = {};
    let totalWeight = 0;
    for (const type in POWERUP_CONFIG) {
        // Use the adjusted dropWeight values
        if (POWERUP_CONFIG[type].dropWeight !== undefined) {
            weights[type] = POWERUP_CONFIG[type].dropWeight;
            totalWeight += weights[type];
        }
    }

    if (totalWeight === 0) return null; // No powerups have weights

    let random = Math.random() * totalWeight;
    for (const type in weights) {
        if (random < weights[type]) {
            return type;
        }
        random -= weights[type];
    }
    // Fallback (should be rare with adjusted weights)
    return PowerupType.FUEL_PACK;
}

export const POWERUP_SPAWN_CONFIG = {
    INTERVAL: 20000, // Try to spawn a new powerup every 20 seconds (reduced from 60s)
    MAX_ACTIVE: 5,    // Reduced max active powerups (from 10)
    RADIUS: 20,       // Visual/collision radius of a powerup
    OBJECT_DROP_CHANCE: 1.0, // *** Guaranteed drop (was 0.15) - This constant is no longer used by drop system, but set to 1 for clarity ***
    SPAWN_CHANCE_PER_INTERVAL: 0.5, // Chance to spawn if conditions met
    // --- New constant for drop radius ---
    DROP_SPAWN_RADIUS: 80, // pixels
};