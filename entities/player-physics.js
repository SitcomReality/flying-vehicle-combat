import { PLAYER_PHYSICS } from './player-state.js'; // Import the physics constants

/**
 * Updates the player's physics state (position, velocity, rotation) based on forces and time.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {number} deltaTime - The time elapsed since the last update in seconds.
 * @param {object} gameBounds - The boundaries of the game world (e.g., { width, height }).
 * @param {number} renderScale - The scale factor applied during rendering.
 * @param {number} groundLevelY - The Y coordinate of the ground surface.
 * @param {ParticleSystem | null} particleSystem - The particle system instance to emit effects.
 */
export function updatePlayerPhysics(playerState, deltaTime, gameBounds, renderScale, groundLevelY, particleSystem) {
    // Physics calculations are only authoritative for the local player
    if (!playerState.isLocalPlayer) return;

    const wasOnGround = playerState.isOnGround; // Store previous ground state

    // --- Vertical Movement ---
    // (Same as before)
    if (!playerState.isOnGround || playerState.isThrusting) {
        playerState.ay = PLAYER_PHYSICS.GRAVITY;
        if (playerState.isThrusting) {
            playerState.ay -= PLAYER_PHYSICS.THRUST_FORCE;
        }
        if (!playerState.isOnGround) {
            const dragForce = -playerState.vy * PLAYER_PHYSICS.VERTICAL_DRAG_FACTOR;
            playerState.ay += dragForce;
        }
        playerState.vy += playerState.ay * deltaTime;
        playerState.vy = Math.max(-PLAYER_PHYSICS.MAX_VERTICAL_SPEED, Math.min(PLAYER_PHYSICS.MAX_VERTICAL_SPEED, playerState.vy));
    } else {
        playerState.ay = 0;
        playerState.vy = 0;
    }

    // --- Horizontal Movement (with Inertia) ---
    // 1. Apply Horizontal Acceleration based on Input
    playerState.ax = 0;
    if (playerState.isMovingLeft) {
        playerState.ax -= PLAYER_PHYSICS.HORIZONTAL_ACCELERATION;
    }
    if (playerState.isMovingRight) {
        playerState.ax += PLAYER_PHYSICS.HORIZONTAL_ACCELERATION;
    }

    // 2. Apply Friction/Drag opposing current velocity
    let frictionFactor = 0;
    if (playerState.isOnGround) {
        // Higher friction on the ground
        frictionFactor = PLAYER_PHYSICS.GROUND_FRICTION_FACTOR;
    } else {
        // Lower friction (air drag) when airborne
        frictionFactor = PLAYER_PHYSICS.AIR_FRICTION_FACTOR;
    }
    // Apply friction force proportional to velocity and friction factor
    const frictionForce = -playerState.vx * frictionFactor;
    playerState.ax += frictionForce; // Add friction acceleration (mass assumed 1)

    // 3. Update Horizontal Velocity
    playerState.vx += playerState.ax * deltaTime;

    // 4. Clamp Horizontal Velocity
    playerState.vx = Math.max(-PLAYER_PHYSICS.MAX_HORIZONTAL_SPEED, Math.min(PLAYER_PHYSICS.MAX_HORIZONTAL_SPEED, playerState.vx));

    // 5. Stop completely if velocity and acceleration are very low (prevents micro-drifting)
     if (!playerState.isMovingLeft && !playerState.isMovingRight && Math.abs(playerState.vx) < 1 && Math.abs(playerState.ax) < 1) {
         playerState.vx = 0;
         playerState.ax = 0;
     }


    // --- Update Position ---
    playerState.x += playerState.vx * deltaTime;
    playerState.y += playerState.vy * deltaTime; // Tentative new position

    // --- Clamping Position & Ground Check ---
    // (Same logic as before, carefully check calculations)
    const spriteDrawWidth = playerState.currentVehicle.width * renderScale;
    const spriteDrawHeight = playerState.currentVehicle.height * renderScale;
    let currentEffectiveDrawY = playerState.y - playerState.drawOffsetY * renderScale;
    let currentEffectiveBottomY = currentEffectiveDrawY + spriteDrawHeight;

    let justLanded = false;
    if (currentEffectiveBottomY >= groundLevelY) {
        const penetration = currentEffectiveBottomY - groundLevelY;
        if (penetration >= 0) {
            playerState.y -= penetration; // Correct position
            if (!wasOnGround && playerState.vy >= 0) {
                justLanded = true;
            }
            if (playerState.vy > 0) {
                playerState.vy = 0;
            }
            playerState.isOnGround = true;
            if (!playerState.isThrusting) { // Only zero ay if not thrusting vertically
                 playerState.ay = 0;
            }
            currentEffectiveDrawY = playerState.y - playerState.drawOffsetY * renderScale; // Recalc after correction
        } else {
             playerState.isOnGround = false; // Should not happen, but safety check
        }
    } else {
        playerState.isOnGround = false;
    }

    if (justLanded) {
        playerState.ay = 0; // Ensure no bounce impulse on landing
    }

    // --- Clamping Position (X and Top Y) ---
    // (Same logic as before)
    const minX = 0;
    const effectiveDrawX = playerState.x - playerState.drawOffsetX * renderScale;
    const maxX = gameBounds.width - spriteDrawWidth;

    if (effectiveDrawX < minX) {
        playerState.x = minX + playerState.drawOffsetX * renderScale;
        if (playerState.vx < 0) playerState.vx = 0; // Stop velocity at boundary
    } else if (effectiveDrawX > maxX) {
        playerState.x = maxX + playerState.drawOffsetX * renderScale;
        if (playerState.vx > 0) playerState.vx = 0; // Stop velocity at boundary
    }

    const minY = 0;
    if (currentEffectiveDrawY < minY) {
        playerState.y = minY + playerState.drawOffsetY * renderScale;
        if (playerState.vy < 0) playerState.vy = 0;
        playerState.isOnGround = false;
    }

    // --- Particle Effects on Ground ---
    // (Same logic as before, using visualFacingDirection)
    if (playerState.isOnGround && particleSystem) {
        const spriteDrawWidth = playerState.currentVehicle.width * renderScale;
        const contactX = (playerState.x - playerState.drawOffsetX * renderScale + spriteDrawWidth / 2)
                       + (playerState.visualFacingDirection === 1 ? -spriteDrawWidth * 0.3 : spriteDrawWidth * 0.3);
        const contactY = groundLevelY - 2;
        const baseSparkVX = -80 + playerState.vx * 0.5; // Sparks slightly affected by player velocity
        const baseSmokeVX = -30 + playerState.vx * 0.3; // Smoke slightly affected by player velocity
        particleSystem.emitSparks(contactX, contactY, PLAYER_PHYSICS.SPARK_EMIT_RATE, baseSparkVX);
        particleSystem.emitSmoke(contactX, contactY, PLAYER_PHYSICS.SMOKE_EMIT_RATE, baseSmokeVX);
    }

    // --- Rotation Calculation ---
    // (Same logic as before, based on vy and LOGICAL facing direction)
    let targetRotation = 0;
    if (!playerState.isOnGround) {
        const normalizedVy = Math.max(-1, Math.min(1, playerState.vy / PLAYER_PHYSICS.MAX_VERTICAL_SPEED));
        targetRotation = -normalizedVy * PLAYER_PHYSICS.MAX_TILT_ANGLE;
        // Invert rotation target based on the LOGICAL facing direction.
        if (playerState.facingDirection === 1) {
            targetRotation *= -1;
        }
    }
    const rotationStep = (targetRotation - playerState.rotation) * PLAYER_PHYSICS.TILT_SPEED * deltaTime;
    playerState.rotation += rotationStep;
    if (playerState.isOnGround && Math.abs(playerState.rotation) < 0.01) {
        playerState.rotation = 0;
    }
}