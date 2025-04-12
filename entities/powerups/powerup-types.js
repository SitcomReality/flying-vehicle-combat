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
    [PowerupType.HEALTH_PACK]: {
        duration: 0, // Instant effect
        value: 50,   // Amount of health restored
        spriteIndex: POWERUP_SPRITE_MAP[PowerupType.HEALTH_PACK],
        name: 'Health Pack',
    },
    [PowerupType.FUEL_PACK]: {
        duration: 0, // Instant effect
        value: 75,   // Amount of fuel restored
        spriteIndex: POWERUP_SPRITE_MAP[PowerupType.FUEL_PACK],
        name: 'Fuel Pack',
    },
    [PowerupType.SPEED_BOOST]: {
        duration: 8000, // 8 seconds
        multiplier: 1.4, // 40% speed increase
        spriteIndex: POWERUP_SPRITE_MAP[PowerupType.SPEED_BOOST],
        name: 'Speed Boost',
    },
    [PowerupType.DAMAGE_BOOST]: {
        duration: 10000, // 10 seconds
        multiplier: 1.5, // 50% damage increase
        spriteIndex: POWERUP_SPRITE_MAP[PowerupType.DAMAGE_BOOST],
        name: 'Damage Boost',
    },
    // Added RAPID_FIRE config
    [PowerupType.RAPID_FIRE]: {
        duration: 7000, // 7 seconds
        multiplier: 1.8, // 80% faster fire rate
        spriteIndex: POWERUP_SPRITE_MAP[PowerupType.RAPID_FIRE],
        name: 'Rapid Fire',
    },
    [PowerupType.INVULNERABILITY]: {
        duration: 5000, // 5 seconds
        spriteIndex: POWERUP_SPRITE_MAP[PowerupType.INVULNERABILITY],
        name: 'Invincibility Shield',
    },
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

export const POWERUP_SPAWN_CONFIG = {
    INTERVAL: 10000, // Try to spawn a new powerup every 10 seconds
    MAX_ACTIVE: 5,    // Maximum number of powerups active at once
    RADIUS: 20,       // Visual/collision radius of a powerup
};