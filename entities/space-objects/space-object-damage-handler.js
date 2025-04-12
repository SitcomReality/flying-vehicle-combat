// New file: Handles damage application and destruction logic for Space Objects

import { createObjectExplosionEffect } from './space-object-explosion-handler.js';
import { handleObjectDestructionPowerupDrop } from '../drop-system.js';
import { PlayerLifecycleState } from '../player-lifecycle.js';

/**
 * Handles applying damage to a space object and initiating destruction if necessary.
 * Differentiates behavior based on whether the current client is the spawner.
 * @param {string} id - The ID of the space object taking damage.
 * @param {number} amount - The amount of damage to apply.
 * @param {string | null} playerDestroyerId - ID of the player who caused the damage.
 * @param {object} managerContext - An object containing necessary manager references and state:
 *   { activeObjects, networkManager, isSpawner, playerManager, powerupManager, particleSystem, gameWidth, gameHeight, groundLevelY, destroyObject }
 * @returns {boolean} - True if the damage resulted in the object being destroyed, false otherwise.
 */
export function handleDamage(id, amount, playerDestroyerId, managerContext) {
    const { activeObjects, networkManager, isSpawner, playerManager, powerupManager, particleSystem, destroyObject } = managerContext;

    const obj = activeObjects[id];
    // Object not found, already marked, or destruction already started? Bail out.
    if (!obj || obj.isMarkedForRemoval || obj._destructionInProgress) {
        return false;
    }

    // --- Damage Application & Destruction Check (Spawner Authority) ---
    let wasDestroyed = false;
    if (isSpawner) {
        // Spawner applies damage directly to the object's state
        // The takeDamage method returns true if health dropped to 0 or below
        wasDestroyed = obj.takeDamage(amount);

        if (wasDestroyed) {
            // Trigger the full destruction sequence (drops, effects, network removal)
            // Pass the full context to the destruction handler
            destroyObject(id, playerDestroyerId, 'damage', managerContext);
            return true; // Signal that the object was destroyed
        } else {
            // Object took damage but wasn't destroyed.
            // Spawner needs to sync the object's updated state (including new health).
            const updatePayload = {};
            updatePayload[id] = obj.getSyncData(); // Get current data with updated health
            networkManager.updateRoomState({
                spaceObjects: updatePayload // Send the update
            });
            return false; // Signal that the object survived
        }
    } else {
        // --- Non-Spawner Behavior ---
        // Non-spawners do NOT modify the object's health state directly.
        // They rely on the spawner's `roomState` updates to reflect health changes.
        console.log(`[SpaceObjDmgHandler] Non-spawner detected damage to ${id}. Waiting for spawner update.`);

        // Optionally, trigger a local-only visual effect for immediate feedback.
        if (particleSystem) {
            particleSystem.emitSparks(obj.x, obj.y, 5); // Example: Small spark effect
        }

        // Assume the object was NOT destroyed until confirmed by the network update.
        return false;
    }
}


/**
 * Handles the destruction logic for a space object, including drops, effects, and network removal.
 * Should be called *after* damage application confirms destruction, or for other reasons like going off-screen.
 * @param {string} id - The ID of the object to destroy.
 * @param {string | null} playerDestroyerId - ID of the player who dealt the final blow (if applicable).
 * @param {string} reason - Why the object is being destroyed ('damage', 'offscreen', 'cleanup').
 * @param {object} managerContext - Context object { activeObjects, networkManager, isSpawner, playerManager, powerupManager, particleSystem, gameWidth, gameHeight, groundLevelY }
 */
export function handleDestruction(id, playerDestroyerId, reason, managerContext) {
     const { activeObjects, networkManager, isSpawner, playerManager, powerupManager, particleSystem, gameWidth, gameHeight, groundLevelY } = managerContext;

    const obj = activeObjects[id];
    // Check if object exists and isn't already undergoing destruction
    if (obj && !obj._destructionInProgress) {
        obj._destructionInProgress = true; // Prevent duplicate destruction calls

        console.log(`[SpaceObjDestructionHandler] Destroying object ${id}. Player: ${playerDestroyerId || 'None'}. Reason: ${reason}`);

        // --- Trigger Effects (Explosion, Score, Drops) only if destroyed by 'damage' ---
        if (reason === 'damage') {
            // Explosion Effect
            if (particleSystem) {
                createObjectExplosionEffect(obj, particleSystem);
            } else {
                console.warn("[SpaceObjDestructionHandler] ParticleSystem is missing, cannot create explosion effect for object", id);
            }

            // Score Awarding (to the player who destroyed it)
            if (playerDestroyerId && obj.scoreValue > 0 && playerManager) {
                const player = playerManager.getPlayer(playerDestroyerId);
                // Ensure player exists and is in a state to receive score
                if (player && player.state && player.lifecycleState === PlayerLifecycleState.ACTIVE) {
                    player.addScore(obj.scoreValue);
                    console.log(`Player ${playerDestroyerId} awarded ${obj.scoreValue} points for destroying ${id}`);
                }
            }

            // Powerup Drops
            if (powerupManager) {
                handleObjectDestructionPowerupDrop(
                    obj,
                    playerDestroyerId,
                    powerupManager,
                    gameWidth,
                    gameHeight,
                    groundLevelY
                );
            }
            // Collectible Drops (handled by a separate system if re-enabled)
            // handleObjectDestructionCollectibleDrop(...)
        }
        // --- End Damage-Specific Effects ---


        // --- Network Removal Signal (Only by Spawner) ---
        // Regardless of the reason for destruction, the spawner signals removal.
        if (isSpawner) {
            const removalPayload = {};
            removalPayload[id] = null; // Use null to signify removal in roomState
            networkManager.updateRoomState({
                spaceObjects: removalPayload
            });
            console.log(`[SpaceObjDestructionHandler] Spawner ${networkManager.getClientId()} sent removal signal for object ${id}`);
        } else {
             // Non-spawners log that they detected destruction locally, but removal comes from network
             // console.log(`[SpaceObjDestructionHandler] Non-spawner ${networkManager.getClientId()} detected destruction for object ${id}, removal will come from network.`);
        }

        // Mark for removal visually (stops drawing/updates locally)
        // This happens AFTER potential effects have used the object's final position.
        obj.isMarkedForRemoval = true;

        // Remove the object instance from the local activeObjects map immediately.
        // This stops further processing (like update loops trying to access it).
        delete activeObjects[id];

    } else if (obj && obj._destructionInProgress) {
        // Object destruction was already initiated, do nothing.
        // console.log(`[SpaceObjDestructionHandler] Destruction for object ${id} already in progress. Skipping.`);
    } else {
        // Object not found (might have already been removed by another process or network update).
        // console.log(`[SpaceObjDestructionHandler] Could not find object ${id} to destroy or already removed.`);
    }
}
