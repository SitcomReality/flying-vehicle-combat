// Handles collision detection between game entities
import { PlayerLifecycleState } from '../player-lifecycle.js'; // Import lifecycle states

/**
 * Checks for collision between two axis-aligned bounding boxes (AABB).
 * Assumes x, y are top-left corners defined by the player's state.
 * @param {object} rect1 - { x, y, width, height }
 * @param {object} rect2 - { x, y, width, height }
 * @returns {boolean} - True if the rectangles collide, false otherwise.
 */
function checkAABBCollision(rect1, rect2) {
    // Check if either rectangle is invalid (e.g., zero width/height)
    if (rect1.width <= 0 || rect1.height <= 0 || rect2.width <= 0 || rect2.height <= 0) {
        return false;
    }
    return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
    );
}

/**
 * Checks for collisions between players. Applies damage only TO the local player if involved.
 * @param {Object.<string, Player>} activePlayers - Active player objects (filtered by PlayerManager).
 * @param {number} renderScale - The game's render scale.
 * @param {function} calculateDamageFunc - Function to calculate damage based on collision.
 * @param {number} currentTime - The current game time.
 * @param {PlayerManager} playerManager - PlayerManager instance needed for the `takeDamage` method on the Player object.
 */
export function checkPlayerCollisions(activePlayers, renderScale, calculateDamageFunc, currentTime, playerManager) {
    const playerIds = Object.keys(activePlayers);

    for (let i = 0; i < playerIds.length; i++) {
        const playerA = activePlayers[playerIds[i]];
        // Basic check if playerA is valid (already filtered for ACTIVE, but good practice)
        if (!playerA || !playerA.state || playerA.isMarkedForRemoval) continue;

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
             // Basic check if playerB is valid
            if (!playerB || !playerB.state || playerB.isMarkedForRemoval) continue;

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
                // console.log(`Collision detected between ${playerA.id} and ${playerB.id}`);

                // Calculate potential damage for both players based on the collision
                // calculateDamageFunc handles the cooldown logic internally based on the pair
                const damageToA = calculateDamageFunc('player-player', playerA, playerB, currentTime);
                const damageToB = calculateDamageFunc('player-player', playerB, playerA, currentTime);

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

/**
 * Checks for collisions between projectiles and players.
 * Applies damage ONLY TO the local player if hit.
 * @param {Object.<string, Player>} activePlayers - Active player objects.
 * @param {Object.<string, Projectile>} activeProjectiles - Active projectile objects.
 * @param {number} renderScale - The game's render scale.
 * @param {function} calculateDamageFunc - Function to calculate damage based on collision.
 * @param {number} currentTime - The current game time.
 * @param {PlayerManager} playerManager - PlayerManager instance needed for the `takeDamage` method on the Player object.
 * @param {ParticleSystem | null} particleSystem - Reference to the particle system for effects.
 */
export function checkProjectileCollisions(activePlayers, activeProjectiles, renderScale, calculateDamageFunc, currentTime, playerManager, particleSystem) {
    const playerIds = Object.keys(activePlayers);
    const projectileIds = Object.keys(activeProjectiles);

    for (const projId of projectileIds) {
        const projectile = activeProjectiles[projId];
        // Projectile already handled or removed?
        if (!projectile || projectile.isMarkedForRemoval) continue;

        const projRect = {
            x: projectile.x - projectile.radius,
            y: projectile.y - projectile.radius,
            width: projectile.radius * 2,
            height: projectile.radius * 2,
        };
         // If dimensions are invalid, skip this projectile
         if (projRect.width <= 0 || projRect.height <= 0) continue;

        for (const playerId of playerIds) {
            const player = activePlayers[playerId];
             // Basic check if player is valid
            if (!player || !player.state || player.isMarkedForRemoval) continue;

            // Prevent projectile from hitting its owner
            if (projectile.ownerId === playerId) continue;

            // Client-side authority: Only process collisions hitting the *local* player
            if (!player.isLocalPlayer) continue;

            const playerRect = {
                x: player.state.x,
                y: player.state.y,
                width: player.state.width * renderScale,
                height: player.state.height * renderScale,
            };
            // If dimensions are invalid, skip this player
             if (playerRect.width <= 0 || playerRect.height <= 0) continue;

            if (checkAABBCollision(playerRect, projRect)) {
                // Collision detected between projectile and local player
                console.log(`Collision detected between projectile ${projId} (owner: ${projectile.ownerId}) and local player ${playerId}`);

                // Calculate damage using the damage calculator
                const damage = calculateDamageFunc('player-projectile', player, projectile, currentTime);

                // Apply damage directly to the local player if damage > 0
                if (damage > 0) {
                    console.log(`Applying ${damage} projectile damage to local player ${playerId}`);
                    player.takeDamage(damage, currentTime); // Use player's method
                }

                // Emit impact effect at the projectile's position
                particleSystem?.emitSparks(projectile.x, projectile.y, 15, projectile.vx * 0.1, projectile.vy * 0.1); // More prominent spark burst

                // Mark the projectile for removal *after* processing its hit
                projectile.isMarkedForRemoval = true;

                // Since only the local player can be hit authoritatively on this client,
                // we can break the inner loop once a projectile hits the local player.
                break;
            }
        }
    }
}