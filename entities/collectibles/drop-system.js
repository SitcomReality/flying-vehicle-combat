// New file: Handles collectible drops when objects are destroyed

import { getRandomCollectibleType } from './collectible-types.js';
import { POWERUP_SPAWN_CONFIG, getRandomPowerupType } from '../powerups/powerup-types.js';

// Configuration for drops
const BASE_DROP_CHANCE = 0.6; // Base chance for *any* collectible drop
// Add weights for different object types later if needed
// const DROP_CHANCES_BY_TYPE = { 'asteroid': 0.6, 'lander': 0.8, ... };

/**
 * Handles the potential drop of a collectible when a space object is destroyed.
 * @param {SpaceObject} destroyedObject - The space object that was destroyed.
 * @param {string | null} playerDestroyerId - The ID of the player who destroyed the object, if any.
 * @param {CollectibleManager} collectibleManager - The manager to spawn collectibles.
 */
export function handleObjectDestructionDrop(destroyedObject, playerDestroyerId, collectibleManager) {
    if (!collectibleManager) {
        console.error("DropSystem: CollectibleManager is required for drops!");
        return;
    }

    // Determine drop chance based on object type (using base chance for now)
    const dropChance = BASE_DROP_CHANCE; // TODO: Use DROP_CHANCES_BY_TYPE if implemented

    if (Math.random() < dropChance) {
        const dropType = getRandomCollectibleType(); // Get a random collectible type
        console.log(`Object ${destroyedObject.id} destroyed by ${playerDestroyerId || 'environment'}. Dropping ${dropType}.`);

        // Spawn collectible at the object's last position
        collectibleManager.spawnCollectible(destroyedObject.x, destroyedObject.y, dropType);
    } else {
        console.log(`Object ${destroyedObject.id} destroyed by ${playerDestroyerId || 'environment'}. No drop.`);
    }
}

/**
 * Handles the potential drop of a powerup when a space object is destroyed.
 * @param {SpaceObject} destroyedObject - The space object that was destroyed.
 * @param {string | null} playerDestroyerId - The ID of the player who destroyed the object.
 * @param {PowerupManager} powerupManager - The manager to spawn powerups.
 */
export function handleObjectDestructionPowerupDrop(destroyedObject, playerDestroyerId, powerupManager) {
    if (!powerupManager) {
        console.error("DropSystem: PowerupManager is required for powerup drops!");
        return;
    }

    if (Math.random() < POWERUP_SPAWN_CONFIG.OBJECT_DROP_CHANCE) {
        // PowerupManager's spawn method handles type selection and limits
        console.log(`Object ${destroyedObject.id} destroyed. Attempting powerup drop.`);
        powerupManager.spawnPowerup(destroyedObject.x, destroyedObject.y);
    } else {
        // console.log(`Object ${destroyedObject.id} destroyed. No powerup drop.`); // Optional logging
    }
}