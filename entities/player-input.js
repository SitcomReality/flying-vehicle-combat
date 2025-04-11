// New file: Handles player input logic

import { PLAYER_PHYSICS } from './player-state.js';

/**
 * Processes input state and updates the player's intended movement and actions.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {object} inputState - The current state of inputs (e.g., { up, down, left, right }).
 */
export function handlePlayerInput(playerState, inputState) {
    if (!playerState.isLocalPlayer) return; // Only handle input for the local player

    let targetVX = 0;
    // Horizontal movement
    if (inputState.left) {
        targetVX = -PLAYER_PHYSICS.PLAYER_SPEED;
    } else if (inputState.right) {
        targetVX = PLAYER_PHYSICS.PLAYER_SPEED;
    }
    playerState.vx = targetVX;

    // Vertical thrust
    playerState.isThrusting = inputState.up;
    // Note: 'down' input currently does nothing against gravity directly in input handling

    // Update facing direction based on horizontal velocity intent
    if (playerState.vx > 0) {
        playerState.facingDirection = 1; // Right
    } else if (playerState.vx < 0) {
        playerState.facingDirection = -1; // Left
    }
    // If vx is 0, keep the current facing direction
}