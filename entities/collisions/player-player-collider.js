// Handles Player-Player collisions
import { checkAABBCollision } from './aabb-collision.js';
import { PlayerLifecycleState } from '../player-lifecycle.js'; // Needed if filtering by state

/**
 * Checks for collisions between players. Applies damage only TO the local player if involved.
 * @param {Object.<string, Player>} activePlayers - Active player objects (filtered by PlayerManager for ACTIVE state).
 * @param {number} renderScale - The game's render scale.
 * @param {function} calculateDamageFunc - Function to calculate damage based on collision.
 * @param {number} currentTime - The current game time.
 * @param {PlayerManager} playerManager - PlayerManager instance needed for the `takeDamage` method on the Player object.
 */
export function checkPlayerPlayerCollisions(activePlayers, renderScale, calculateDamageFunc, currentTime, playerManager) {
    const playerIds = Object.keys(activePlayers);

    for (let i = 0; i < playerIds.length; i++) {
        const playerA = activePlayers[playerIds[i]];
        // Additional check if playerA is valid and ACTIVE (should be pre-filtered, but good practice)
        if (!playerA || !playerA.state || playerA.isMarkedForRemoval || playerA.state.lifecycleState !== PlayerLifecycleState.ACTIVE) continue;

        const rectA = {
            x: playerA.state.x,
            y: playerA.state.y,
            width: playerA.state.width * renderScale,
            height: playerA.state.height * renderScale,
        };
        // If dimensions are invalid, skip this player
        if (rectA.width <= 0 || rectA.height <= 0) continue;

        for (let j = i + 1; j < playerIds.length; j++) {
            const playerB = activePlayers[playerIds[j]];
             // Additional check if playerB is valid and ACTIVE
            if (!playerB || !playerB.state || playerB.isMarkedForRemoval || playerB.state.lifecycleState !== PlayerLifecycleState.ACTIVE) continue;

            // Client-side authority: Only process collisions involving the local player
            if (!playerA.isLocalPlayer && !playerB.isLocalPlayer) continue;

            const rectB = {
                x: playerB.state.x,
                y: playerB.state.y,
                width: playerB.state.width * renderScale,
                height: playerB.state.height * renderScale,
            };
             // If dimensions are invalid, skip this pair
             if (rectB.width <= 0 || rectB.height <= 0) continue;

            if (checkAABBCollision(rectA, rectB)) {
                // Collision detected!
                // console.log(`Collision detected between ${playerA.id} and ${playerB.id}`); // Logged in detector

                // Calculate potential damage for both players based on the collision
                // calculateDamageFunc handles the cooldown logic internally based on the pair
                const damageToA = calculateDamageFunc('player-player', playerA.state, playerB.state, currentTime); // Pass state object
                const damageToB = calculateDamageFunc('player-player', playerB.state, playerA.state, currentTime); // Pass state object

                // Apply damage ONLY if the target player is the local player and damage > 0
                if (playerA.isLocalPlayer && damageToA > 0) {
                    console.log(`Applying ${damageToA} player-player damage to local player ${playerA.id} from ${playerB.id}`);
                    // Use the player's takeDamage method, which calls the health system
                    playerA.takeDamage(damageToA, currentTime);
                }
                if (playerB.isLocalPlayer && damageToB > 0) {
                    console.log(`Applying ${damageToB} player-player damage to local player ${playerB.id} from ${playerA.id}`);
                     playerB.takeDamage(damageToB, currentTime);
                }

                // TODO: Add knockback/physics response later
            }
        }
    }
}