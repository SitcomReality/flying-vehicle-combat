// New file: Handles player physics simulation

import { PLAYER_PHYSICS } from './player-state.js';

/**
 * Updates the player's physics state (position, velocity, rotation) based on forces and time.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {number} deltaTime - The time elapsed since the last update in seconds.
 * @param {object} gameBounds - The boundaries of the game world (e.g., { width, height }).
 * @param {number} renderScale - The scale factor applied during rendering.
 */
export function updatePlayerPhysics(playerState, deltaTime, gameBounds, renderScale) {
    // Physics calculations are only authoritative for the local player
    if (!playerState.isLocalPlayer) return;

    // 1. Calculate Vertical Acceleration
    playerState.ay = PLAYER_PHYSICS.GRAVITY; // Start with gravity
    if (playerState.isThrusting) {
        playerState.ay -= PLAYER_PHYSICS.THRUST_FORCE; // Apply upward thrust
    }
    // Apply vertical drag (acts against current velocity)
    const dragForce = -playerState.vy * PLAYER_PHYSICS.VERTICAL_DRAG_FACTOR;
    playerState.ay += dragForce; // Add drag acceleration (mass assumed 1)

    // 2. Update Velocity
    playerState.vy += playerState.ay * deltaTime;
    // Clamp vertical speed
    playerState.vy = Math.max(-PLAYER_PHYSICS.MAX_VERTICAL_SPEED, Math.min(PLAYER_PHYSICS.MAX_VERTICAL_SPEED, playerState.vy));

    // Note: Horizontal velocity (vx) is set directly by input for now

    // 3. Update Position based on velocity
    playerState.x += playerState.vx * deltaTime;
    playerState.y += playerState.vy * deltaTime;

    // 4. Clamping Position (Boundary Checks) based on *visual* bounds
    const spriteDrawWidth = playerState.currentVehicle.width * renderScale;
    const spriteDrawHeight = playerState.currentVehicle.height * renderScale;

    // Calculate the effective visual top-left corner position based on hitbox offsets
    const effectiveDrawX = playerState.x - playerState.drawOffsetX * renderScale;
    const effectiveDrawY = playerState.y - playerState.drawOffsetY * renderScale;

    // Define the boundaries for the *visual* sprite
    const minX = 0;
    const maxX = gameBounds.width - spriteDrawWidth;
    const minY = 0;
    const maxY = gameBounds.height - spriteDrawHeight;

    // Clamp X based on visual position
    if (effectiveDrawX < minX) {
        playerState.x = minX + playerState.drawOffsetX * renderScale; // Adjust player 'anchor' x
        if (playerState.vx < 0) playerState.vx = 0; // Stop horizontal velocity
    } else if (effectiveDrawX > maxX) {
        playerState.x = maxX + playerState.drawOffsetX * renderScale; // Adjust player 'anchor' x
        if (playerState.vx > 0) playerState.vx = 0; // Stop horizontal velocity
    }

    // Clamp Y based on visual position and stop vertical velocity
    if (effectiveDrawY < minY) {
        playerState.y = minY + playerState.drawOffsetY * renderScale; // Adjust player 'anchor' y
        if (playerState.vy < 0) playerState.vy = 0; // Stop upward movement at ceiling
    } else if (effectiveDrawY > maxY) {
        playerState.y = maxY + playerState.drawOffsetY * renderScale; // Adjust player 'anchor' y
        if (playerState.vy > 0) playerState.vy = 0; // Stop downward movement at floor
    }

    // 5. Calculate Target Rotation based on Vertical Velocity and Facing Direction
    const normalizedVy = Math.max(-1, Math.min(1, playerState.vy / PLAYER_PHYSICS.MAX_VERTICAL_SPEED));
    // Base rotation: negative vy (up) -> positive rotation (nose up)
    let targetRotation = -normalizedVy * PLAYER_PHYSICS.MAX_TILT_ANGLE;

    // Invert rotation if facing right, so the *nose* still points relatively up/down
    if (playerState.facingDirection === 1) {
        targetRotation *= -1;
    }

    // 6. Smoothly Interpolate Rotation
    playerState.rotation += (targetRotation - playerState.rotation) * PLAYER_PHYSICS.TILT_SPEED * deltaTime;
}