import { PLAYER_PHYSICS } from './player-state.js';

/**
 * Processes input state and updates the player's intended movement and actions.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {object} inputState - The current state of inputs (e.g., { up, down, left, right }).
 */
export function handlePlayerInput(playerState, inputState) {
    if (!playerState.isLocalPlayer) return; // Only handle input for the local player

    // --- Update Movement Intent Flags ---
    playerState.isThrusting = inputState.up; // Vertical thrust
    playerState.isMovingLeft = inputState.left;
    playerState.isMovingRight = inputState.right;

    // Note: 'down' input currently does nothing against gravity directly here.
    // Physics engine handles gravity.

    // --- Target Facing Direction based on Input ---
    // The target direction is now set based *purely* on the last horizontal input.
    // This prevents the animation from triggering if the player stops pressing keys
    // but is still sliding due to inertia.
    if (inputState.right) {
        playerState.targetFacingDirection = 1; // Right
    } else if (inputState.left) {
        playerState.targetFacingDirection = -1; // Left
    }
    // If neither left nor right is pressed, targetFacingDirection remains unchanged.
}