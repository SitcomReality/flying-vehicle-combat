import { INTERPOLATION_SNAP_THRESHOLD } from './player-state.js';

/**
 * Updates the player's server state based on received presence data.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {object} serverState - The presence data received from the server.
 * @param {number} timestamp - The time the update was received (e.g., performance.now()).
 */
export function updatePlayerFromServer(playerState, serverState, timestamp) {
    if (playerState.isLocalPlayer) return; // Local player is authoritative locally

    // Store the latest known server position, rotation, and time
    playerState.serverX = serverState.x;
    playerState.serverY = serverState.y;
    playerState.serverRotation = serverState.rotation ?? playerState.rotation; // Use current if missing
    playerState.lastServerUpdateTime = timestamp;

    // Update server ground state if provided
    if (serverState.isOnGround !== undefined) {
        playerState.serverIsOnGround = serverState.isOnGround;
    }

    // Update server facing direction if provided - Set the TARGET direction
    if (serverState.facingDirection !== undefined) {
        playerState.serverFacingDirection = serverState.facingDirection; // Store the server's logical direction
        playerState.targetFacingDirection = serverState.facingDirection; // Aim the remote player towards this direction

        // If the remote player is not currently in a flip animation locally,
        // snap both the logical and visual direction immediately to match the server.
        // This prevents visual lag for remote players' turns.
        if (playerState.flipAnimationStart === 0) {
            playerState.facingDirection = serverState.facingDirection;
            playerState.visualFacingDirection = serverState.facingDirection;
        }
    }

    // Update vehicle type immediately if it differs
    if (serverState.vehicleType !== undefined && serverState.vehicleType !== playerState.vehicleType) {
        playerState.setVehicle(serverState.vehicleType);
    }

    // Note: We don't directly set x, y, rotation here. Interpolation handles the smoothing.
}

/**
 * Smoothly interpolates the player's visual state towards the last known server state.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {number} factor - The interpolation factor (e.g., 0.1 for 10% move towards target each frame).
 */
export function interpolatePlayerState(playerState, factor) {
    if (playerState.isLocalPlayer) return;

    // Lerp position towards server position
    playerState.x += (playerState.serverX - playerState.x) * factor;
    playerState.y += (playerState.serverY - playerState.y) * factor;

    // Lerp rotation towards server rotation
    playerState.rotation += (playerState.serverRotation - playerState.rotation) * factor;

    // *** Visual facing direction is now handled by the animation update logic ***
    // We don't directly sync visual direction here anymore. The animation system
    // reads the targetFacingDirection (updated from server) and handles the visual flip timing.

    // Snap to server position if very close to avoid jitter
    if (Math.abs(playerState.serverX - playerState.x) < INTERPOLATION_SNAP_THRESHOLD) {
        playerState.x = playerState.serverX;
    }
    if (Math.abs(playerState.serverY - playerState.y) < INTERPOLATION_SNAP_THRESHOLD) {
        playerState.y = playerState.serverY;
    }
    // No snap for rotation is usually needed as lerp handles it smoothly
}