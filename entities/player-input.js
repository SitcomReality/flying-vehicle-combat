// New file: Handles processing player input and updating player state

/**
 * Processes the raw input state and updates the player's state accordingly.
 * Handles movement, thrusting, facing direction, and firing intent.
 * @param {PlayerState} state - The player's state object.
 * @param {object} inputState - The current input state from InputManager ({ up, down, left, right, action }).
 * @param {InputManager} inputManager - The input manager instance (needed for wasKeyJustPressed).
 * @param {WeaponSystem} weaponSystem - The player's weapon system instance.
 */
export function handlePlayerInput(state, inputState, inputManager, weaponSystem) {
    if (!state || !inputState || !inputManager || !weaponSystem || state.isMarkedForRemoval) {
        // Don't process input if dependencies missing or player inactive
        return;
    }

    // --- Movement ---
    state.isThrusting = inputState.up;
    state.isMovingLeft = inputState.left;
    state.isMovingRight = inputState.right;

    // --- Facing Direction ---
    if (inputState.left && !inputState.right) {
        state.targetFacingDirection = -1; // Target Left
    } else if (inputState.right && !inputState.left) {
        state.targetFacingDirection = 1; // Target Right
    }
    // If neither or both are pressed, keep the current target direction

    // --- Firing ---
    // Use wasKeyJustPressed for tap firing
    if (inputManager.wasKeyJustPressed(' ')) {
        weaponSystem.flagTapFire(); // Signal a tap fire attempt
    }
    // Use isKeyPressed for charging
    else if (inputManager.isKeyPressed(' ')) {
        weaponSystem.startCharging();
    }
    // Check if the key was released (no longer pressed)
    else if (!inputManager.isKeyPressed(' ') && state.isCharging) {
        weaponSystem.stopCharging();
    }
}