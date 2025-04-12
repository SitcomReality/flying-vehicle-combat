// Handles Player-Powerup collisions
import { checkAABBCollision } from './aabb-collision.js';
import { PlayerLifecycleState } from '../player-lifecycle.js'; // Import lifecycle states
import { applyPowerupEffect } from '../powerups/powerup-effects.js'; // Import powerup effects

/**
 * Checks for collisions between the local player and powerups.
 * Triggers pickup logic if a collision occurs.
 * @param {Player} localPlayer - The local player instance.
 * @param {Array<Powerup>} activePowerups - Array of active Powerup instances.
 * @param {number} renderScale - The game's render scale.
 * @param {number} currentTime - The current game time.
 * @param {PowerupManager} powerupManager - PowerupManager instance for pickup initiation.
 */
export function checkPlayerPowerupCollisions(localPlayer, activePowerups, renderScale, currentTime, powerupManager) {
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

    // Iterate backwards is generally safer if modifying the array, though not strictly needed here
    for (let i = activePowerups.length - 1; i >= 0; i--) {
        const powerup = activePowerups[i];
        // Check if powerup still exists locally (might have been removed by sync just before collision check)
        if (!powerup || powerup.isMarkedForRemoval || !powerupManager.activePowerups[powerup.id]) continue;

        const powerupRect = {
            x: powerup.x - powerup.radius,
            y: powerup.y - powerup.radius,
            width: powerup.radius * 2,
            height: powerup.radius * 2,
        };
         // If dimensions are invalid, skip check
         if (powerupRect.width <= 0 || powerupRect.height <= 0) continue;

        if (checkAABBCollision(playerRect, powerupRect)) {
            // console.log(`Collision detected between local player ${localPlayer.id} and powerup ${powerup.id}`);

            // Initiate the pickup process via the manager
            // This handles spawner vs non-spawner logic internally
            const pickupInitiatedPowerup = powerupManager.initiatePickup(powerup.id, localPlayer.id);

            // Apply effect locally *immediately* if pickup was initiated
            // This gives instant feedback, removal sync follows via roomState
            if (pickupInitiatedPowerup) {
                 applyPowerupEffect(localPlayer.state, pickupInitiatedPowerup, currentTime);
                 // Stop checking for other powerups this frame
                 break;
            } else {
                 // Pickup initiation failed (e.g., already picked up by someone else just before)
                 // console.log(`[Collision] Pickup initiation failed for powerup ${powerup.id}.`);
            }
        }
    }
}