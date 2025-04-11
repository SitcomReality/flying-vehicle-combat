// New file: Handles network synchronization for remote players

import { INTERPOLATION_SNAP_THRESHOLD } from './player.js';

/**
 * Updates the player's server state based on received presence data.
 * @param {Player} player - The player object.
 * @param {object} serverState - The presence data received from the server.
 * @param {number} timestamp - The time the update was received (e.g., performance.now()).
 */
export function updatePlayerFromServer(player, serverState, timestamp) {
    if (player.isLocalPlayer) return; // Local player is authoritative locally

    // Store the latest known server position, rotation, and time
    player.serverX = serverState.x;
    player.serverY = serverState.y;
    player.serverRotation = serverState.rotation ?? player.rotation; // Use current if missing
    player.lastServerUpdateTime = timestamp;

    // Update server facing direction if provided
    if (serverState.facingDirection !== undefined) {
        player.serverFacingDirection = serverState.facingDirection;
    }

    // Update vehicle type immediately if it differs
    if (serverState.vehicleType !== undefined && serverState.vehicleType !== player.vehicleType) {
        player.setVehicle(serverState.vehicleType);
    }

    // Note: We don't directly set x, y, rotation here. Interpolation handles the smoothing.
}

/**
 * Smoothly interpolates the player's visual state towards the last known server state.
 * @param {Player} player - The player object.
 * @param {number} factor - The interpolation factor (e.g., 0.1 for 10% move towards target each frame).
 */
export function interpolatePlayerState(player, factor) {
    if (player.isLocalPlayer) return;

    // Lerp position towards server position
    player.x += (player.serverX - player.x) * factor;
    player.y += (player.serverY - player.y) * factor;

    // Lerp rotation towards server rotation
    // Simple lerp is usually sufficient for frequent updates. Consider slerp for angles if needed.
    player.rotation += (player.serverRotation - player.rotation) * factor;

    // Update visual facing direction based on the *server's* facing direction
    // This avoids the sprite flipping back and forth during interpolation if the server
    // state indicates a different direction than the current interpolated velocity might suggest.
    if (player.facingDirection !== player.serverFacingDirection) {
        player.facingDirection = player.serverFacingDirection;
    }

    // Snap to server position if very close to avoid jitter
    if (Math.abs(player.serverX - player.x) < INTERPOLATION_SNAP_THRESHOLD) {
        player.x = player.serverX;
    }
    if (Math.abs(player.serverY - player.y) < INTERPOLATION_SNAP_THRESHOLD) {
        player.y = player.serverY;
    }
    // No snap for rotation is usually needed as lerp handles it smoothly
}