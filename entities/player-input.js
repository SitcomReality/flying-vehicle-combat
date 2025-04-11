/**
 * Processes input state and updates the player's intended movement and actions.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {object} inputState - The current state of inputs (e.g., { up, down, left, right, action }).
 */
export function handlePlayerInput(playerState, inputState) {
    if (!playerState.isLocalPlayer) return; // Only handle input for the local player

    // --- Update Movement Intent Flags ---
    playerState.isThrusting = inputState.up; // Vertical thrust
    playerState.isMovingLeft = inputState.left;
    playerState.isMovingRight = inputState.right;

    // --- Update Charging State ---
    const wasCharging = playerState.isCharging;
    playerState.isCharging = inputState.action; // 'action' corresponds to space bar

    // If the player *was* charging but isn't anymore (released space)
    if (wasCharging && !playerState.isCharging) {
        playerState.wantsToFire = true; // Set the flag to fire on the next update
    } else {
        // Ensure the flag is clear if still charging or wasn't charging
        playerState.wantsToFire = false;
    }

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