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

    // --- Facing direction is no longer updated here based on vx ---
    // It's handled by the input handler setting targetFacingDirection,
    // and the animation update logic finalizing facingDirection.

    const wasOnGround = playerState.isOnGround; // Store previous ground state

    // --- Vertical Movement ---
    // Apply forces only when airborne OR when thrusting on the ground (for liftoff)
    if (!playerState.isOnGround || playerState.isThrusting) {
        // 1. Calculate Vertical Acceleration
        playerState.ay = PLAYER_PHYSICS.GRAVITY; // Start with gravity
        if (playerState.isThrusting) {
            playerState.ay -= PLAYER_PHYSICS.THRUST_FORCE; // Apply upward thrust
        }

        // Apply vertical drag (only when airborne - prevents damping gravity when starting thrust on ground)
        if (!playerState.isOnGround) {
            const dragForce = -playerState.vy * PLAYER_PHYSICS.VERTICAL_DRAG_FACTOR;
            playerState.ay += dragForce; // Add drag acceleration (mass assumed 1)
        }

        // 2. Update Vertical Velocity
        playerState.vy += playerState.ay * deltaTime;

        // Clamp vertical speed (airborne or taking off)
        playerState.vy = Math.max(-PLAYER_PHYSICS.MAX_VERTICAL_SPEED, Math.min(PLAYER_PHYSICS.MAX_VERTICAL_SPEED, playerState.vy));

    } else {
        // On ground and not thrusting: ensure zero vertical velocity/acceleration
        playerState.ay = 0;
        playerState.vy = 0;
    }

    // --- Horizontal Movement ---
    // Apply friction if on ground and not actively moving horizontally
    if (playerState.isOnGround && playerState.vx !== 0) {
        // Apply friction opposing motion
        playerState.vx *= (1 - PLAYER_PHYSICS.GROUND_FRICTION * deltaTime);
        // Stop completely if velocity is very low
        if (Math.abs(playerState.vx) < 1) {
            playerState.vx = 0;
        }
    }
    // Note: vx is primarily set by input handler

    // --- Update Position ---
    playerState.x += playerState.vx * deltaTime;
    playerState.y += playerState.vy * deltaTime; // Tentative new position

    // --- Clamping Position & Ground Check ---
    // Use visual frame dimensions for collision with boundaries/ground
    const spriteDrawWidth = playerState.currentVehicle.width * renderScale;
    const spriteDrawHeight = playerState.currentVehicle.height * renderScale;

    // Recalculate visual Y based on potentially updated playerState.y
    let currentEffectiveDrawY = playerState.y - playerState.drawOffsetY * renderScale;
    let currentEffectiveBottomY = currentEffectiveDrawY + spriteDrawHeight;

    // Ground Collision & Correction
    let justLanded = false;
    if (currentEffectiveBottomY >= groundLevelY) {
        const penetration = currentEffectiveBottomY - groundLevelY;
        // Correct position only if penetrating or exactly on the ground
        if (penetration >= 0) {
            playerState.y -= penetration; // Correct position

            // Check if we were previously airborne and moving down
            if (!wasOnGround && playerState.vy >= 0) { // Use vy>=0 to catch resting state too
                justLanded = true;
            }

            // Stop downward/penetrating velocity immediately
            if (playerState.vy > 0) {
                playerState.vy = 0;
            }
            playerState.isOnGround = true;

            // Reset vertical acceleration only when grounded and not thrusting (prevent cancelling takeoff)
            if (!playerState.isThrusting) {
                 playerState.ay = 0;
            }

            // Recalculate effective Y after correction for ceiling check
            currentEffectiveDrawY = playerState.y - playerState.drawOffsetY * renderScale;
        } else {
            // This case (currentEffectiveBottomY >= groundLevelY but penetration < 0) shouldn't happen with floats
            // If it did, it means slightly above ground. Assume airborne.
            playerState.isOnGround = false;
        }

    } else {
        // Clearly above ground
        playerState.isOnGround = false;
    }

    // If we just landed, ensure acceleration is zeroed regardless of thrust
    // This prevents an immediate "bounce" impulse if thrust was held during landing.
    if (justLanded) {
        playerState.ay = 0;
        // playerState.vy = 0; // Velocity already zeroed if vy > 0
    }

    // --- Clamping Position (X and Top Y) ---
    const minX = 0;
    // Clamp X based on *visual* sprite bounds
    const effectiveDrawX = playerState.x - playerState.drawOffsetX * renderScale;
    const maxX = gameBounds.width - spriteDrawWidth;

    if (effectiveDrawX < minX) {
        playerState.x = minX + playerState.drawOffsetX * renderScale;
        if (playerState.vx < 0) playerState.vx = 0;
    } else if (effectiveDrawX > maxX) {
        playerState.x = maxX + playerState.drawOffsetX * renderScale;
        if (playerState.vx > 0) playerState.vx = 0;
    }

    // Clamp Y (Ceiling) - Use the potentially ground-corrected position
    const minY = 0;
    if (currentEffectiveDrawY < minY) {
        playerState.y = minY + playerState.drawOffsetY * renderScale;
        if (playerState.vy < 0) playerState.vy = 0; // Stop upward velocity at ceiling
        playerState.isOnGround = false; // Definitely not on ground if hitting ceiling
    }

    // --- Particle Effects on Ground ---
    if (playerState.isOnGround && particleSystem) {
        const spriteDrawWidth = playerState.currentVehicle.width * renderScale;
        // Use VISUAL facing direction for effect positioning
        const contactX = (playerState.x - playerState.drawOffsetX * renderScale + spriteDrawWidth / 2)
                       + (playerState.visualFacingDirection === 1 ? -spriteDrawWidth * 0.3 : spriteDrawWidth * 0.3);
        const contactY = groundLevelY - 2;

        const baseSparkVX = -80 + playerState.vx * 0.5;
        const baseSmokeVX = -30 + playerState.vx * 0.3;

        // Use constants for emit rate
        particleSystem.emitSparks(contactX, contactY, PLAYER_PHYSICS.SPARK_EMIT_RATE, baseSparkVX);
        particleSystem.emitSmoke(contactX, contactY, PLAYER_PHYSICS.SMOKE_EMIT_RATE, baseSmokeVX);
    }

    // --- Rotation Calculation ---
    let targetRotation = 0;
    if (!playerState.isOnGround) {
        const normalizedVy = Math.max(-1, Math.min(1, playerState.vy / PLAYER_PHYSICS.MAX_VERTICAL_SPEED));
        targetRotation = -normalizedVy * PLAYER_PHYSICS.MAX_TILT_ANGLE;

        // Invert rotation target based on the LOGICAL facing direction
        // The renderer will handle the visual flip separately using visualFacingDirection.
        if (playerState.facingDirection === 1) {
            targetRotation *= -1;
        }
    }

    // Smoothly Interpolate Rotation
    // Avoid division by zero if deltaTime is extremely small
    const rotationStep = (targetRotation - playerState.rotation) * PLAYER_PHYSICS.TILT_SPEED * deltaTime;
    playerState.rotation += rotationStep;

    // Small threshold to snap rotation to 0 when on ground and close
    if (playerState.isOnGround && Math.abs(playerState.rotation) < 0.01) {
        playerState.rotation = 0;
    }
}