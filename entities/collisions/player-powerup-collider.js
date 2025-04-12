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
 * @param {PowerupManager} powerupManager - PowerupManager instance for pickup removal.
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

    for (const powerup of activePowerups) {
        if (!powerup || powerup.isMarkedForRemoval) continue;

        const powerupRect = {
            x: powerup.x - powerup.radius,
            y: powerup.y - powerup.radius,
            width: powerup.radius * 2,
            height: powerup.radius * 2,
        };
         // If dimensions are invalid, skip check
         if (powerupRect.width <= 0 || powerupRect.height <= 0) continue;

        if (checkAABBCollision(playerRect, powerupRect)) {
            console.log(`Collision detected between local player ${localPlayer.id} and powerup ${powerup.id}`);

            // Tell the powerup manager that the local player picked this up
            // The manager handles removing it from the game state and returning its info
            const pickedUpPowerup = powerupManager.pickupPowerup(powerup.id);

            // If pickup was successful, apply the effect to the player
            if (pickedUpPowerup) {
                 applyPowerupEffect(localPlayer.state, pickedUpPowerup, currentTime);
                 // TODO: Play pickup sound effect here
            }
            // A player can only pick up one powerup per collision check loop frame
            // (prevents multi-pickup from overlapping powerups instantly)
            break;
        }
    }
}