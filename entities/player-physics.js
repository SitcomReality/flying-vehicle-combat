// New file: Handles player physics simulation

import { PLAYER_PHYSICS } from './player-state.js';

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

    // --- Vertical Movement ---
    if (!playerState.isOnGround) {
        // 1. Calculate Vertical Acceleration (only when airborne)
        playerState.ay = PLAYER_PHYSICS.GRAVITY; // Start with gravity
        if (playerState.isThrusting) {
            playerState.ay -= PLAYER_PHYSICS.THRUST_FORCE; // Apply upward thrust
        }
        // Apply vertical drag (acts against current velocity)
        const dragForce = -playerState.vy * PLAYER_PHYSICS.VERTICAL_DRAG_FACTOR;
        playerState.ay += dragForce; // Add drag acceleration (mass assumed 1)

        // 2. Update Vertical Velocity
        playerState.vy += playerState.ay * deltaTime;
        // Clamp vertical speed (airborne)
        playerState.vy = Math.max(-PLAYER_PHYSICS.MAX_VERTICAL_SPEED, Math.min(PLAYER_PHYSICS.MAX_VERTICAL_SPEED, playerState.vy));
    } else {
        // On ground: Reset vertical acceleration and velocity unless thrusting
        playerState.ay = 0;
        if (playerState.isThrusting) {
            // Allow jumping off the ground
            playerState.vy = -PLAYER_PHYSICS.THRUST_FORCE * 0.5 * deltaTime; // Initial small jump impulse
            playerState.isOnGround = false; // Now airborne
        } else {
            playerState.vy = 0; // Stick to ground
        }
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
    playerState.y += playerState.vy * deltaTime;

    // --- Clamping Position & Ground Check ---
    const spriteDrawWidth = playerState.currentVehicle.width * renderScale;
    const spriteDrawHeight = playerState.currentVehicle.height * renderScale;

    // Calculate the effective visual top-left and bottom corners
    // Note: This doesn't account for rotation yet, but is a simplification for ground check
    const effectiveDrawX = playerState.x - playerState.drawOffsetX * renderScale;
    const effectiveDrawY = playerState.y - playerState.drawOffsetY * renderScale;
    const effectiveBottomY = effectiveDrawY + spriteDrawHeight;

    // Define the boundaries for the *visual* sprite
    const minX = 0;
    const maxX = gameBounds.width - spriteDrawWidth;
    const minY = 0;
    const maxY = groundLevelY - spriteDrawHeight; // Top of the visual sprite sits on ground

    // Clamp X
    if (effectiveDrawX < minX) {
        playerState.x = minX + playerState.drawOffsetX * renderScale;
        if (playerState.vx < 0) playerState.vx = 0;
    } else if (effectiveDrawX > maxX) {
        playerState.x = maxX + playerState.drawOffsetX * renderScale;
        if (playerState.vx > 0) playerState.vx = 0;
    }

    // Check for ground contact *before* clamping Y
    const prevOnGround = playerState.isOnGround;
    playerState.isOnGround = effectiveBottomY >= groundLevelY && playerState.vy >= 0;

    // Clamp Y
    if (effectiveDrawY < minY) {
        playerState.y = minY + playerState.drawOffsetY * renderScale;
        if (playerState.vy < 0) playerState.vy = 0;
    } else if (effectiveBottomY >= groundLevelY) {
        playerState.y = groundLevelY - spriteDrawHeight + playerState.drawOffsetY * renderScale; // Place bottom of sprite on ground
        // Only zero velocity if newly landed or still on ground without thrust
        if (playerState.isOnGround && !playerState.isThrusting) {
            playerState.vy = 0;
        }
    }

    // --- Particle Effects on Ground ---
    if (playerState.isOnGround && Math.abs(playerState.vx) > 5 && particleSystem) { // Only emit when moving horizontally on ground
        // Estimate contact point (bottom center, slightly adjusted for direction)
        const contactX = playerState.x + (playerState.facingDirection === 1 ? -spriteDrawWidth / 4 : spriteDrawWidth / 4) * renderScale; // Adjust based on facing
        const contactY = groundLevelY - 2; // Slightly above ground line

        particleSystem.emitSparks(contactX, contactY, PLAYER_PHYSICS.SPARK_EMIT_RATE, playerState.vx * 0.5);
        particleSystem.emitSmoke(contactX, contactY, PLAYER_PHYSICS.SMOKE_EMIT_RATE, playerState.vx * 0.3);
    }

    // --- Rotation Calculation ---
    let targetRotation = 0;
    if (!playerState.isOnGround) {
        // Airborne rotation based on vertical velocity
        const normalizedVy = Math.max(-1, Math.min(1, playerState.vy / PLAYER_PHYSICS.MAX_VERTICAL_SPEED));
        targetRotation = -normalizedVy * PLAYER_PHYSICS.MAX_TILT_ANGLE;
        if (playerState.facingDirection === 1) {
            targetRotation *= -1;
        }
    } // On ground, targetRotation remains 0 (level)

    // Smoothly Interpolate Rotation
    playerState.rotation += (targetRotation - playerState.rotation) * PLAYER_PHYSICS.TILT_SPEED * deltaTime;
}