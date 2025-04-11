// New file: Handles fuel consumption and regeneration logic

/**
 * Updates the player's fuel level based on regeneration rate.
 * @param {PlayerState} playerState - The player's state.
 * @param {number} deltaTime - Time elapsed since last frame.
 */
export function updateFuel(playerState, deltaTime) {
    // Regenerate fuel only when not thrusting and not full
    if (!playerState.isThrusting && playerState.fuel < playerState.maxFuel) {
        playerState.fuel = Math.min(
            playerState.fuel + playerState.fuelRegenRate * deltaTime,
            playerState.maxFuel
        );
    }
     // Clamp fuel just in case (shouldn't be necessary)
    playerState.fuel = Math.max(0, playerState.fuel);
}

/**
 * Consumes fuel from the player's state.
 * @param {PlayerState} playerState - The player's state.
 * @param {number} amount - The amount of fuel to consume.
 * @returns {boolean} - True if fuel was consumed, false otherwise.
 */
export function consumeFuel(playerState, amount) {
    if (playerState.fuel > 0) {
        playerState.fuel = Math.max(0, playerState.fuel - amount);
        return true;
    }
    return false;
}