// New file: Defines collectible types and their properties

import { SPRITES } from '../../config/sprites.js';

export const CollectibleType = {
    COIN: 'COIN',
    GEM_GREEN: 'GEM_GREEN',
    GEM_RED: 'GEM_RED',
    GEM_BLUE: 'GEM_BLUE',
};

const COLLECTIBLE_SPRITE_MAP = {
    [CollectibleType.GEM_GREEN]: 0, // Green Diamond
    [CollectibleType.COIN]: 1,      // Gold Coin
    [CollectibleType.GEM_RED]: 2,   // Red Gem
    [CollectibleType.GEM_BLUE]: 3,  // Blue Gem
};

export const COLLECTIBLE_CONFIG = {
    [CollectibleType.COIN]: {
        value: 1,
        spriteIndex: COLLECTIBLE_SPRITE_MAP[CollectibleType.COIN],
        name: 'Coin',
    },
    [CollectibleType.GEM_GREEN]: {
        value: 5,
        spriteIndex: COLLECTIBLE_SPRITE_MAP[CollectibleType.GEM_GREEN],
        name: 'Green Gem',
    },
    [CollectibleType.GEM_RED]: {
        value: 10,
        spriteIndex: COLLECTIBLE_SPRITE_MAP[CollectibleType.GEM_RED],
        name: 'Red Gem',
    },
    [CollectibleType.GEM_BLUE]: {
        value: 20,
        spriteIndex: COLLECTIBLE_SPRITE_MAP[CollectibleType.GEM_BLUE],
        name: 'Blue Gem',
    },
};

export function getCollectibleConfig(type) {
    return COLLECTIBLE_CONFIG[type];
}

export function getCollectibleSpriteFrame(type) {
    const config = getCollectibleConfig(type);
    const spriteIndex = config?.spriteIndex;
    if (spriteIndex !== undefined && spriteIndex >= 0 && spriteIndex < SPRITES.collectibles.frames.length) {
        return SPRITES.collectibles.frames[spriteIndex];
    }
    console.warn(`Could not find sprite frame for collectible type: ${type}`);
    return null;
}

export function getRandomCollectibleType(weights = { COIN: 10, GEM_GREEN: 5, GEM_RED: 2, GEM_BLUE: 1 }) {
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;

    for (const type in weights) {
        if (random < weights[type]) {
            return type; // Return the CollectibleType string
        }
        random -= weights[type];
    }
    // Fallback in case of rounding errors
    return CollectibleType.COIN;
}