// Handles Player-Collectible collisions
import { checkAABBCollision } from './aabb-collision.js';
import { PlayerLifecycleState } from '../player-lifecycle.js'; // Import lifecycle states

/**
 * Checks for collisions between the local player and collectibles.
 * Triggers pickup logic if a collision occurs.
 * @param {Player} localPlayer - The local player instance.
 * @param {Array<Collectible>} activeCollectibles - Array of active Collectible instances.
 * @param {number} renderScale - The game's render scale.
 * @param {number} currentTime - The current game time.
 * @param {CollectibleManager} collectibleManager - CollectibleManager instance for pickup logic.
 */
export function checkPlayerCollectibleCollisions(localPlayer, activeCollectibles, renderScale, currentTime, collectibleManager) {
    if (!localPlayer || !localPlayer.state || localPlayer.isMarkedForRemoval || localPlayer.state.lifecycleState !== PlayerLifecycleState.ACTIVE) {
        return; // Only check for active local player
    }

    const playerRect = {
        x: localPlayer.state.x,
        y: localPlayer.state.y,
        width: localPlayer.state.width * renderScale,
        height: localPlayer.state.height * renderScale,
    };
    // If dimensions are invalid, skip check
    if (playerRect.width <= 0 || playerRect.height <= 0) return;

    for (const collectible of activeCollectibles) {
        if (!collectible || collectible.isMarkedForRemoval) continue;

        // Use collectible's radius for collision check
        const collectibleRect = {
            x: collectible.x - collectible.radius,
            y: collectible.y - collectible.radius,
            width: collectible.radius * 2,
            height: collectible.radius * 2,
        };
        // If dimensions are invalid, skip check
        if (collectibleRect.width <= 0 || collectibleRect.height <= 0) continue;

        if (checkAABBCollision(playerRect, collectibleRect)) {
            console.log(`Collision detected between local player ${localPlayer.id} and collectible ${collectible.id}`);

            // Tell the collectible manager that the local player picked this up
            const pickedUpCollectible = collectibleManager.pickupCollectible(collectible.id);

            // If pickup was successful, add score to the player
            if (pickedUpCollectible) {
                localPlayer.addScore(pickedUpCollectible.value);
                // TODO: Play pickup sound effect here
            }
            // Allow picking up multiple collectibles per frame if overlapping
        }
    }
}
