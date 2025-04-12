// New file: Handles collectible drops when objects are destroyed

import { getRandomCollectibleType } from './collectibles/collectible-types.js';
import { POWERUP_SPAWN_CONFIG, getRandomPowerupType } from './powerups/powerup-types.js';

/**
 * Handles the potential drop of a collectible when a space object is destroyed.
 * (Note: This functionality was previously in this file but seems to have been moved
 *  to entities/collectibles/drop-system.js in a previous refactor. The powerup drop logic remains.)
 * @param {SpaceObject} destroyedObject - The space object that was destroyed.
 * @param {string | null} playerDestroyerId - The ID of the player who destroyed the object, if any.
 * @param {CollectibleManager} collectibleManager - The manager to spawn collectibles.
 */
// export function handleObjectDestructionCollectibleDrop(destroyedObject, playerDestroyerId, collectibleManager) {
//     // ... implementation for collectible drops if needed here ...
//     // Currently, this logic seems to reside in entities/collectibles/drop-system.js
// }

/**
 * Handles the potential drop of a powerup when a space object is destroyed.
 * Now guarantees a drop, uses weighted randomness, and randomizes spawn location.
 * @param {SpaceObject} destroyedObject - The space object that was destroyed.
 * @param {string | null} playerDestroyerId - The ID of the player who destroyed the object.
 * @param {PowerupManager} powerupManager - The manager to spawn powerups.
 * @param {number} gameWidth - The width of the game area.
 * @param {number} gameHeight - The height of the game area.
 * @param {number} groundLevelY - The Y coordinate of the ground.
 */
export function handleObjectDestructionPowerupDrop(destroyedObject, playerDestroyerId, powerupManager, gameWidth, gameHeight, groundLevelY) {
    if (!powerupManager) {
        console.error("DropSystem: PowerupManager is required for powerup drops!");
        return;
    }

    // 1. Guaranteed drop - remove the random chance check.

    // 2. Get weighted random powerup type
    const chosenType = getRandomPowerupType();
    if (!chosenType) {
        console.warn("Could not determine weighted powerup type for drop.");
        return; // Don't spawn if type selection fails
    }

    console.log(`Object ${destroyedObject.id} destroyed. Dropping powerup: ${chosenType}.`);

    // 3. Calculate random spawn location within radius
    const dropRadius = POWERUP_SPAWN_CONFIG.DROP_SPAWN_RADIUS;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * dropRadius;
    const offsetX = Math.cos(angle) * radius;
    const offsetY = Math.sin(angle) * radius;

    let spawnX = destroyedObject.x + offsetX;
    let spawnY = destroyedObject.y + offsetY;

    // 4. Boundary Checks
    const padding = powerupManager.renderScale * POWERUP_SPAWN_CONFIG.RADIUS; // Use powerup radius as padding

    // Ensure spawn position is within game bounds and above ground
    spawnX = Math.max(padding, Math.min(gameWidth - padding, spawnX));
    // Prevent spawning below ground or too close to the top edge
    spawnY = Math.max(padding, Math.min(groundLevelY - padding, spawnY));

    console.log(`Calculated drop location: (${spawnX.toFixed(0)}, ${spawnY.toFixed(0)})`);

    // 5. Spawn the powerup using the PowerupManager
    powerupManager.spawnPowerupAt(spawnX, spawnY, chosenType);
}