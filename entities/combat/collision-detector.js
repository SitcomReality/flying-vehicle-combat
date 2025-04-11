// New file: Handles collision detection between game entities

/**
 * Checks for collision between two axis-aligned bounding boxes (AABB).
 * Assumes x, y are top-left corners.
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
 * Checks for collisions between players.
 * @param {Object.<string, Player>} players - All player objects.
 * @param {number} renderScale - The game's render scale.
 * @param {function} calculateDamageFunc - Function to calculate damage based on collision.
 * @param {number} currentTime - The current game time.
 */
export function checkPlayerCollisions(players, renderScale, calculateDamageFunc, currentTime) {
    const playerIds = Object.keys(players);

    for (let i = 0; i < playerIds.length; i++) {
        const playerA = players[playerIds[i]];
        if (!playerA || !playerA.state || playerA.isMarkedForRemoval || playerA.state.lifecycleState !== 'ACTIVE') continue;

        const rectA = {
            x: playerA.state.x,
            y: playerA.state.y,
            width: playerA.state.width * renderScale,
            height: playerA.state.height * renderScale,
        };

        for (let j = i + 1; j < playerIds.length; j++) {
            const playerB = players[playerIds[j]];
            if (!playerB || !playerB.state || playerB.isMarkedForRemoval || playerB.state.lifecycleState !== 'ACTIVE') continue;

             // Only check collisions between local player and others for now to simplify authority
             // or require both players to be local (which isn't possible)
             // For a full authoritative server, this logic would be server-side.
             // For client-side prediction, we might only trigger damage *locally* if the local player is involved.
             if (!playerA.isLocalPlayer && !playerB.isLocalPlayer) continue;

            const rectB = {
                x: playerB.state.x,
                y: playerB.state.y,
                width: playerB.state.width * renderScale,
                height: playerB.state.height * renderScale,
            };

            if (checkAABBCollision(rectA, rectB)) {
                // Collision detected between playerA and playerB
                 if(playerA.isLocalPlayer) {
                    const damageToA = calculateDamageFunc('player-player', playerA, playerB);
                    playerA.takeDamage(damageToA, currentTime);
                    const damageToB = calculateDamageFunc('player-player', playerB, playerA);
                    // Request damage update for remote player B
                    // TODO: This should ideally be a request, not direct damage call.
                    // For now, we only damage the local player involved.
                    // playerB.takeDamage(damageToB, currentTime); // Need to request this for B
                 } else if (playerB.isLocalPlayer) {
                    const damageToA = calculateDamageFunc('player-player', playerA, playerB);
                    // Request damage update for remote player A
                    // playerA.takeDamage(damageToA, currentTime); // Need to request this for A
                    const damageToB = calculateDamageFunc('player-player', playerB, playerA);
                    playerB.takeDamage(damageToB, currentTime);
                 }
                // Add cooldown? Apply forces? For now, just damage.
                console.log(`Collision detected between ${playerA.id} and ${playerB.id}`);
            }
        }
    }
}

/**
 * Checks for collisions between projectiles and players.
 * @param {Object.<string, Player>} players - All player objects.
 * @param {Object.<string, Projectile>} projectiles - All projectile objects.
 * @param {number} renderScale - The game's render scale.
 * @param {function} calculateDamageFunc - Function to calculate damage based on collision.
 * @param {number} currentTime - The current game time.
 * @param {string | null} localPlayerId - The ID of the local player.
 */
export function checkProjectileCollisions(players, projectiles, renderScale, calculateDamageFunc, currentTime, localPlayerId) {
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
            if (!player || !player.state || player.isMarkedForRemoval || player.state.lifecycleState !== 'ACTIVE') continue;

            // Prevent projectile from hitting its owner
            if (projectile.ownerId === playerId) continue;

            // Only check collisions involving the local player or projectiles owned by the local player
            // This simplifies authority for now. A server would handle all checks.
            if (playerId !== localPlayerId && projectile.ownerId !== localPlayerId) continue;

            const playerRect = {
                x: player.state.x,
                y: player.state.y,
                width: player.state.width * renderScale,
                height: player.state.height * renderScale,
            };

            if (checkAABBCollision(playerRect, projRect)) {
                // Collision detected between projectile and player
                console.log(`Collision detected between projectile ${projId} (owner: ${projectile.ownerId}) and player ${playerId}`);

                // If the hit player is the local player, apply damage directly
                 if (player.isLocalPlayer) {
                    const damage = calculateDamageFunc('player-projectile', player, projectile);
                    player.takeDamage(damage, currentTime);
                 } else {
                    // If the projectile owner is the local player hitting a remote player,
                    // we would need to send a damage request event to the server/other client.
                    // For now, we skip applying damage to remote players on the client side.
                    console.log(`Local player's projectile ${projId} hit remote player ${playerId}. Damage request needed.`);
                 }

                // Remove the projectile after hit
                projectile.isMarkedForRemoval = true;
                // Add particle effect for impact?

                // Break inner loop once projectile hits someone
                break;
            }
        }
    }
}
