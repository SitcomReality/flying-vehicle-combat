// Handles Player-SpaceObject collisions
import { checkAABBCollision } from './aabb-collision.js';
import { PlayerLifecycleState } from '../player-lifecycle.js'; // Import lifecycle states

/**
 * Checks for collisions between players and space objects.
 * Applies damage TO the local player if involved, and TO the space object.
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
            if (!spaceObject || spaceObject.isMarkedForRemoval) continue;

            const objectRect = spaceObject.getHitbox(); // Use the object's hitbox calculation
            if (!objectRect || objectRect.width <= 0 || objectRect.height <= 0) continue;

            if (checkAABBCollision(playerRect, objectRect)) {
                 // Collision detected!
                // console.log(`Collision detected between player ${playerId} and space object ${objectId}`); // Logged in detector

                // Calculate damage
                // Pass state objects for damage calculation context if needed
                const damageToObject = calculateDamageFunc('player-spaceobject', spaceObject, player.state, currentTime);
                const damageToPlayer = calculateDamageFunc('player-spaceobject', player.state, spaceObject, currentTime);

                // Apply damage to the space object (handled by manager)
                if (damageToObject > 0) {
                    console.log(`Applying ${damageToObject} collision damage to space object ${objectId} from player ${playerId}`);
                    // Pass player reference to know who caused the potential drop and add score
                    spaceObjectManager.applyDamageToObject(objectId, damageToObject, playerId);
                }

                // Apply damage ONLY to the LOCAL player
                if (player.isLocalPlayer && damageToPlayer > 0) {
                    console.log(`Applying ${damageToPlayer} collision damage to local player ${playerId} from space object ${objectId}`);
                    player.takeDamage(damageToPlayer, currentTime);
                }

                 // Apply physics response (e.g., knockback)? - Future enhancement
                 // Since an object might be destroyed, we continue checking other objects
                 // If player is destroyed, their state change will handle future collisions
            }
        }
    }
}