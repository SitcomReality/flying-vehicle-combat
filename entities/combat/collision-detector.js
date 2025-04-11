// Handles collision detection between game entities

/**
 * Checks for collision between two axis-aligned bounding boxes (AABB).
 * Assumes x, y are top-left corners defined by the player's state.
 * @param {object} rect1 - { x, y, width, height }
 * @param {object} rect2 - { x, y, width, height }
 * @returns {boolean} - True if the rectangles collide, false otherwise.
 */
function checkAABBCollision(rect1, rect2) {
    return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
    );
}

/**
 * Checks for collisions between players. Applies damage only TO the local player if involved.
 * @param {Object.<string, Player>} players - All active player objects.
 * @param {number} renderScale - The game's render scale.
 * @param {function} calculateDamageFunc - Function to calculate damage based on collision.
 * @param {number} currentTime - The current game time.
 * @param {PlayerManager} playerManager - PlayerManager instance for death handling via takeDamage.
 */
export function checkPlayerCollisions(players, renderScale, calculateDamageFunc, currentTime, playerManager) {
    const playerIds = Object.keys(players);

    for (let i = 0; i < playerIds.length; i++) {
        const playerA = players[playerIds[i]];
        // Ensure playerA is valid and active before checking
        if (!playerA || !playerA.state || playerA.isMarkedForRemoval || playerA.state.lifecycleState !== 'ACTIVE') continue;

        const rectA = {
            x: playerA.state.x,
            y: playerA.state.y,
            width: playerA.state.width * renderScale,
            height: playerA.state.height * renderScale,
        };

        for (let j = i + 1; j < playerIds.length; j++) {
            const playerB = players[playerIds[j]];
             // Ensure playerB is valid and active before checking
            if (!playerB || !playerB.state || playerB.isMarkedForRemoval || playerB.state.lifecycleState !== 'ACTIVE') continue;

            // Client-side authority: Only process collisions involving the local player
            if (!playerA.isLocalPlayer && !playerB.isLocalPlayer) continue;

            const rectB = {
                x: playerB.state.x,
                y: playerB.state.y,
                width: playerB.state.width * renderScale,
                height: playerB.state.height * renderScale,
            };

            if (checkAABBCollision(rectA, rectB)) {
                // Collision detected!
                console.log(`Collision detected between ${playerA.id} and ${playerB.id}`);

                // Calculate potential damage for both players
                // Note: calculateDamageFunc handles the cooldown based on the player pair
                const damageToA = calculateDamageFunc('player-player', playerA, playerB, currentTime);
                const damageToB = calculateDamageFunc('player-player', playerB, playerA, currentTime);

                // Apply damage ONLY if the target player is the local player
                if (playerA.isLocalPlayer && damageToA > 0) {
                    console.log(`Applying ${damageToA} player-player damage to local player ${playerA.id} from ${playerB.id}`);
                    playerA.takeDamage(damageToA, currentTime); // Uses player's internal method which calls health-system
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
 * @param {Object.<string, Player>} players - All active player objects.
 * @param {Object.<string, Projectile>} projectiles - All active projectile objects.
 * @param {number} renderScale - The game's render scale.
 * @param {function} calculateDamageFunc - Function to calculate damage based on collision.
 * @param {number} currentTime - The current game time.
 * @param {PlayerManager} playerManager - PlayerManager instance for death handling via takeDamage.
 * @param {ParticleSystem | null} particleSystem - Reference to the particle system for effects.
 */
export function checkProjectileCollisions(players, projectiles, renderScale, calculateDamageFunc, currentTime, playerManager, particleSystem) {
    const playerIds = Object.keys(players);
    const projectileIds = Object.keys(projectiles);

    for (const projId of projectileIds) {
        const projectile = projectiles[projId];
        if (!projectile || projectile.isMarkedForRemoval) continue;

        const projRect = {
            x: projectile.x - projectile.radius,
            y: projectile.y - projectile.radius,
            width: projectile.radius * 2,
            height: projectile.radius * 2,
        };

        for (const playerId of playerIds) {
            const player = players[playerId];
             // Ensure player is valid and active before checking
            if (!player || !player.state || player.isMarkedForRemoval || player.state.lifecycleState !== 'ACTIVE') continue;

            // Prevent projectile from hitting its owner immediately after firing (add small grace period later if needed)
            if (projectile.ownerId === playerId) continue;

            // Client-side authority: Only process collisions hitting the local player
            if (!player.isLocalPlayer) continue;

            const playerRect = {
                x: player.state.x,
                y: player.state.y,
                width: player.state.width * renderScale,
                height: player.state.height * renderScale,
            };

            if (checkAABBCollision(playerRect, projRect)) {
                // Collision detected between projectile and local player
                console.log(`Collision detected between projectile ${projId} (owner: ${projectile.ownerId}) and local player ${playerId}`);

                // Apply damage directly to the local player
                const damage = calculateDamageFunc('player-projectile', player, projectile, currentTime);
                if (damage > 0) {
                    console.log(`Applying ${damage} projectile damage to local player ${playerId}`);
                    player.takeDamage(damage, currentTime);
                }

                // Emit impact effect
                // TODO: Define a specific impact effect
                particleSystem?.emitSparks(projectile.x, projectile.y, 10); // Example spark burst

                // Mark the projectile for removal after hit
                projectile.isMarkedForRemoval = true;

                // Break inner loop once projectile hits the local player
                break;
            }
        }
    }
}