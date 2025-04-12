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
}