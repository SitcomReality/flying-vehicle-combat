/** 
 * Helper utilities for calculating firing angles and nose position usage.
 */

/**
 * Computes firing angle based on player visual facing direction and rotation.
 * @param {object} state - Player state (expects visualFacingDirection and rotation).
 * @returns {number} angle in radians
 */
export function computeFiringAngle(state) {
    if (!state) return 0;
    if (state.visualFacingDirection === 1) { // Facing Right (sprite is flipped)
        return state.rotation;
    } else { // Facing Left (sprite is not flipped)
        return Math.PI + state.rotation;
    }
}