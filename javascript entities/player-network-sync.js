import { INTERPOLATION_SNAP_THRESHOLD } from './player-state.js';
import { PlayerLifecycleState } from './player-lifecycle.js'; // Import lifecycle states

/**
 * Updates the player's server state based on received presence data.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {object} serverState - The presence data received from the server.
 * @param {number} timestamp - The time the update was received (e.g., performance.now()).
 */
export function updatePlayerFromServer(playerState, serverState, timestamp) {
    if (playerState.isLocalPlayer) return; // Local player is authoritative locally

    // Store the latest known server position, rotation, and time
    playerState.serverX = serverState.x ?? playerState.serverX; // Use previous if missing
    playerState.serverY = serverState.y ?? playerState.serverY;
    playerState.serverRotation = serverState.rotation ?? playerState.serverRotation;
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

    // Update health, fuel, and invulnerability state from server data
    if (serverState.health !== undefined) {
        playerState.serverHealth = serverState.health;
        playerState.health = serverState.health; // Directly set visual health for remote
    }
    if (serverState.fuel !== undefined) {
        playerState.serverFuel = serverState.fuel;
        playerState.fuel = serverState.fuel; // Directly set visual fuel for remote
    }
    if (serverState.isInvulnerable !== undefined) {
        playerState.serverIsInvulnerable = serverState.isInvulnerable;
        playerState.isInvulnerable = serverState.isInvulnerable; // Directly set visual invulnerability
    }

     // Update score if provided
     if (serverState.score !== undefined) {
          playerState.serverScore = serverState.score;
          playerState.score = serverState.score; // Directly set visual score for remote
     }

    // Update lifecycle state if provided and different
    // Also update serverLifecycleState tracker
    if (serverState.lifecycleState !== undefined) {
        playerState.serverLifecycleState = serverState.lifecycleState;
        if (serverState.lifecycleState !== playerState.lifecycleState) {
            console.log(`Remote player ${playerState.id} lifecycle state changed via presence: ${playerState.lifecycleState} -> ${serverState.lifecycleState}`);
            playerState.lifecycleState = serverState.lifecycleState;
            // Handle state change side effects (e.g., reset interpolation if DEAD)
            if (serverState.lifecycleState === PlayerLifecycleState.DEAD) {
                 playerState.x = playerState.serverX; // Snap position on death
                 playerState.y = playerState.serverY;
            }
        }
    }
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

    // Snap to server position if very close to avoid jitter
    if (Math.abs(playerState.serverX - playerState.x) < INTERPOLATION_SNAP_THRESHOLD) {
        playerState.x = playerState.serverX;
    }
    if (Math.abs(playerState.serverY - playerState.y) < INTERPOLATION_SNAP_THRESHOLD) {
        playerState.y = playerState.serverY;
    }
    // No snap for rotation is usually needed as lerp handles it smoothly
}