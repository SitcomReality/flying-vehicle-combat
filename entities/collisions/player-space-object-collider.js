// Handles Player-SpaceObject collisions
import { checkAABBCollision } from './aabb-collision.js';
import { PlayerLifecycleState } from '../player-lifecycle.js'; // Import lifecycle states

// Added constant for knockback strength
const PLAYER_KNOCKBACK_STRENGTH = 150; // Adjust as needed

/**
 * Checks for collisions between players and space objects.
 * Applies damage TO the local player if involved, and TO the space object.
 * Applies knockback TO the local player.
 * @param {Object.<string, Player>} activePlayers - Active player objects (filtered for ACTIVE state).
 * @param {Object.<string, SpaceObject>} activeSpaceObjects - Active space objects map {id: object}.
 * @param {number} renderScale - The game's render scale (for player hitbox).
 * @param {function} calculateDamageFunc - Function to calculate damage.
 * @param {number} currentTime - The current game time.
 * @param {PlayerManager} playerManager - PlayerManager for player damage application.
 * @param {SpaceObjectManager} spaceObjectManager - SpaceObjectManager for object damage application.
 */
export function checkPlayerSpaceObjectCollisions(activePlayers, activeSpaceObjects, renderScale, calculateDamageFunc, currentTime, playerManager, spaceObjectManager) {
    const playerIds = Object.keys(activePlayers);
    const spaceObjectIds = Object.keys(activeSpaceObjects);

    for (const playerId of playerIds) {
        const player = activePlayers[playerId];
        // Player should already be filtered for ACTIVE, but double check
        if (!player || !player.state || player.isMarkedForRemoval || player.state.lifecycleState !== PlayerLifecycleState.ACTIVE) continue;

        const playerRect = {
            x: player.state.x,
            y: player.state.y,
            width: player.state.width * renderScale,
            height: player.state.height * renderScale,
        };
        if (playerRect.width <= 0 || playerRect.height <= 0) continue;

        for (const objectId of spaceObjectIds) {
            const spaceObject = activeSpaceObjects[objectId];
            if (!spaceObject || spaceObject.isMarkedForRemoval || spaceObject._destructionInProgress) continue; // Check destruction flag

            const objectRect = spaceObject.getHitbox(); // Use the object's hitbox calculation
            if (!objectRect || objectRect.width <= 0 || objectRect.height <= 0) continue;

            if (checkAABBCollision(playerRect, objectRect)) {
                 // Collision detected!
                 // console.log(`Collision detected between player ${playerId} and space object ${objectId}`);

                // Calculate damage
                const damageToObject = calculateDamageFunc('player-spaceobject', spaceObject, player.state, currentTime);
                const damageToPlayer = calculateDamageFunc('player-spaceobject', player.state, spaceObject, currentTime);

                // Apply damage to the space object (handled by manager)
                if (damageToObject > 0) {
                    // console.log(`Applying ${damageToObject} collision damage to space object ${objectId} from player ${playerId}`);
                    // Pass player reference to know who caused the potential drop and add score
                    spaceObjectManager.applyDamageToObject(objectId, damageToObject, playerId);
                }

                // Apply damage ONLY to the LOCAL player
                if (player.isLocalPlayer && damageToPlayer > 0) {
                    // console.log(`Applying ${damageToPlayer} collision damage to local player ${playerId} from space object ${objectId}`);
                    player.takeDamage(damageToPlayer, currentTime);

                    // --- Apply Knockback to Local Player ---
                    const playerCenterX = playerRect.x + playerRect.width / 2;
                    const playerCenterY = playerRect.y + playerRect.height / 2;
                    const objectCenterX = objectRect.x + objectRect.width / 2;
                    const objectCenterY = objectRect.y + objectRect.height / 2;

                    const dx = playerCenterX - objectCenterX;
                    const dy = playerCenterY - objectCenterY;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist > 0.1) { // Avoid division by zero if centers overlap exactly
                         const nx = dx / dist; // Normalized collision vector x
                         const ny = dy / dist; // Normalized collision vector y

                         // Apply impulse directly to player velocity
                         player.state.vx += nx * PLAYER_KNOCKBACK_STRENGTH;
                         player.state.vy += ny * PLAYER_KNOCKBACK_STRENGTH;
                         console.log(`Applied knockback (${(nx * PLAYER_KNOCKBACK_STRENGTH).toFixed(1)}, ${(ny * PLAYER_KNOCKBACK_STRENGTH).toFixed(1)}) to player ${playerId}`);

                         // Optional: Clamp velocity immediately after knockback?
                         // player.state.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, player.state.vx));
                         // player.state.vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, player.state.vy));
                    }
                    // --- End Knockback ---
                }

                 // Object might be destroyed, continue checking collisions with other objects
            }
        }
    }
}