// New file: Handles player visual animations like flipping direction

import { FLIP_ANIMATION_DURATION } from './player-state.js';

/**
 * Updates the player's facing direction animation state.
 * Determines if a flip is needed, progresses the animation, and updates
 * logical and visual facing directions accordingly.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {number} currentTime - The current game time (performance.now()).
 */
export function updatePlayerAnimation(playerState, currentTime) {
    const state = playerState;
    // Determine if a flip is *needed* based on the target vs current *logical* direction
    const needsFlip = state.targetFacingDirection !== state.facingDirection;

    if (state.flipAnimationStart > 0) { // Currently flipping
        const elapsed = currentTime - state.flipAnimationStart;

        if (elapsed >= FLIP_ANIMATION_DURATION) {
            // Animation finished. Update both logical and visual direction.
            state.facingDirection = state.targetFacingDirection;
            state.visualFacingDirection = state.targetFacingDirection;
            state.flipAnimationStart = 0; // End animation state
            // Check if another flip is needed immediately (e.g., rapid input)
            if (state.targetFacingDirection !== state.facingDirection) {
                 // Start a new flip right away
                 state.flipAnimationStart = currentTime;
                 // Visual direction stays as the *newly updated* facingDirection for this frame
                 // before instantly becoming the *old* direction again for the next frame's animation start.
                 // This prevents a 1-frame flicker.
                 state.visualFacingDirection = state.facingDirection;
            }
        }
        // else: Animation is still in progress.
        // visualFacingDirection remains the OLD direction.
        // logical facingDirection also remains the OLD direction.
        // targetFacingDirection might have changed, but we finish the current flip first.

    } else if (needsFlip) { // Not currently flipping, but need to start one.
        // Start a new flip animation
        state.flipAnimationStart = currentTime;
        // IMPORTANT: Keep visual direction matching the current (soon to be old) logical direction.
        // The logical facingDirection itself is NOT updated yet.
        state.visualFacingDirection = state.facingDirection;

    } else {
        // Not flipping and directions already match. Ensure visual consistency.
        state.visualFacingDirection = state.facingDirection;
        state.flipAnimationStart = 0; // Ensure animation state is reset if somehow stuck
    }
}