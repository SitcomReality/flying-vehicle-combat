/**
 * Processes input state and updates the player's intended movement and actions.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {object} inputState - The current state of inputs (e.g., { up, down, left, right, action }).
 * @param {InputManager} inputManager - The input manager instance for checking key states.
 * @param {WeaponSystem | null} weaponSystem - The player's weapon system.
 */
export function handlePlayerInput(playerState, inputState, inputManager, weaponSystem) {
    if (!playerState.isLocalPlayer || !inputManager) return; // Only handle input for the local player with a valid input manager

    // Ignore input if not in ACTIVE state
    if (playerState.lifecycleState !== PlayerLifecycleState.ACTIVE) {
        // Clear movement flags if not active
        playerState.isThrusting = false;
        playerState.isMovingLeft = false;
        playerState.isMovingRight = false;
        if (weaponSystem) {
             weaponSystem.stopCharging(); // Ensure charging stops
             weaponSystem.isCharging = false;
             weaponSystem.wantsToFire = false;
             weaponSystem.isTapFire = false;
        }
        // Ensure player state reflects this
        playerState.isCharging = false;
        playerState.wantsToFire = false;
        return;
    }

    // --- Update Movement Intent Flags ---
    playerState.isThrusting = inputState.up; // Vertical thrust
    playerState.isMovingLeft = inputState.left;
    playerState.isMovingRight = inputState.right;

    // --- Update Weapon System based on action key (' ') ---
    if (weaponSystem) {
        // Use the manager directly for accurate just-pressed/held states
        const actionKeyPressed = inputManager.wasKeyJustPressed(' ');
        const actionKeyHeld = inputManager.isKeyPressed(' '); // Check current held state

        // Logic to handle tap fire vs charge based on key state
        if (actionKeyPressed) {
            weaponSystem.flagTapFire(); // Signal intent to tap fire
        } else if (actionKeyHeld && !weaponSystem.isTapFire) {
            // If holding and not already flagged for tap fire, start/continue charging
            weaponSystem.startCharging();
        } else if (!actionKeyHeld && weaponSystem.isCharging) {
             // If released and was charging, stop charging (triggers fire check)
             weaponSystem.stopCharging();
        } else if (!actionKeyHeld && weaponSystem.isTapFire) {
             // If released after tap fire flag (and maybe couldn't fire due to cooldown), clear flags
             weaponSystem.isTapFire = false;
             weaponSystem.wantsToFire = false; // Cancel fire request
             playerState.wantsToFire = false; // Sync state
        }
         // Ensure player state reflects weapon state (isCharging/wantsToFire updated by weaponSystem methods)
         playerState.isCharging = weaponSystem.isCharging;
         playerState.wantsToFire = weaponSystem.wantsToFire;

    } else {
         console.warn("WeaponSystem not available for input handling.");
    }

    // --- Target Facing Direction based on Input ---
    // Update target direction based purely on the last horizontal input.
    if (inputState.right) {
        playerState.targetFacingDirection = 1; // Right
    } else if (inputState.left) {
        playerState.targetFacingDirection = -1; // Left
    }
    // If neither left nor right is pressed, targetFacingDirection remains unchanged.
}