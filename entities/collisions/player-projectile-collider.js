// Handles Player-Projectile collisions
import { checkAABBCollision } from './aabb-collision.js';
import { PlayerLifecycleState } from '../player-lifecycle.js'; // Needed if filtering by state
import { ProjectileRemovalReason } from '../projectile.js'; // Import removal reasons

/**
 * Checks for collisions between projectiles and players.
 * Applies damage ONLY TO the local player if hit. Marks projectile for removal.
 * Triggers projectile impact effect.
 * @param {Object.<string, Player>} activePlayers - Active player objects (filtered by PlayerManager for ACTIVE state).
 * @param {Object.<string, Projectile>} activeProjectiles - Active projectile objects.
 * @param {number} renderScale - The game's render scale.
 * @param {function} calculateDamageFunc - Function to calculate damage based on collision.
 * @param {number} currentTime - The current game time.
 * @param {PlayerManager} playerManager - PlayerManager instance needed for the `takeDamage` method on the Player object.
 * @param {ParticleSystem | null} particleSystem - Reference to the particle system for effects.
 */
export function checkPlayerProjectileCollisions(activePlayers, activeProjectiles, renderScale, calculateDamageFunc, currentTime, playerManager, particleSystem) {
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
             // Basic check if player is valid and ACTIVE
            if (!player || !player.state || player.isMarkedForRemoval || player.state.lifecycleState !== PlayerLifecycleState.ACTIVE) continue;

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
                // console.log(`Collision detected between projectile ${projId} (owner: ${projectile.ownerId}) and local player ${playerId}`);

                // Calculate damage using the damage calculator
                const damage = calculateDamageFunc('player-projectile', player.state, projectile, currentTime); // Pass player state

                // Apply damage directly to the local player if damage > 0
                if (damage > 0) {
                    // console.log(`Applying ${damage} projectile damage to local player ${playerId}`);
                    player.takeDamage(damage, currentTime); // Use player's method
                }

                // Emit projectile impact effect locally
                particleSystem?.emitProjectileImpact(projectile.x, projectile.y, projectile.vx, projectile.vy, projectile.color);

                // Mark the projectile for removal *after* processing its hit, specifying the reason
                projectile.markForRemoval(ProjectileRemovalReason.HIT_PLAYER);

                // Since only the local player can be hit authoritatively on this client,
                // we can break the inner loop once a projectile hits the local player.
                break;
            }
        }
    }
}