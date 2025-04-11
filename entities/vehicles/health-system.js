// New file: Handles health, damage, invulnerability, and death

import { GLOBAL_PHYSICS } from '../player-state.js'; // For INVULNERABILITY_DURATION
import { PlayerLifecycleState } from '../player-lifecycle.js';

/**
 * Applies damage to the player, triggers invulnerability, and checks for death.
 * @param {PlayerState} playerState - The player's state.
 * @param {number} damageAmount - The amount of damage to apply.
 * @param {number} currentTime - The current game time (performance.now()).
 * @param {PlayerManager | null} playerManager - Reference to the player manager to handle death.
 */
export function applyDamage(playerState, damageAmount, currentTime, playerManager) {
    // Cannot take damage if already dead, selecting, or invulnerable
    if (playerState.isInvulnerable ||
        playerState.lifecycleState === PlayerLifecycleState.DEAD ||
        playerState.lifecycleState === PlayerLifecycleState.SELECTING) {
        return;
    }

    playerState.health = Math.max(0, playerState.health - damageAmount);
    playerState.lastDamageTime = currentTime;
    playerState.isInvulnerable = true;

    console.log(`Player ${playerState.id} took ${damageAmount} damage. Health: ${playerState.health}`);

    // Check for death
    if (playerState.health <= 0) {
        console.log(`Player ${playerState.id} has died.`);
        // If it's the local player, notify the PlayerManager to handle the death process
        if (playerState.isLocalPlayer && playerManager) {
            playerManager.handlePlayerDeath(playerState.id);
        }
        // For remote players, their death state transition will come via presence update.
        // We might visually mark them as dead locally, but the official state change
        // should wait for network confirmation or be handled directly in player-manager/network-handler.
        // For now, local player death is handled via playerManager.
    }
}

/**
 * Updates the player's health-related state, primarily the invulnerability timer.
 * @param {PlayerState} playerState - The player's state.
 * @param {number} deltaTime - Time elapsed since last frame.
 * @param {number} currentTime - The current game time (performance.now()).
 */
export function updateHealth(playerState, deltaTime, currentTime) {
    // Update invulnerability timer
    if (playerState.isInvulnerable) {
        const invulnerableTimeElapsed = currentTime - playerState.lastDamageTime;
        if (invulnerableTimeElapsed > GLOBAL_PHYSICS.INVULNERABILITY_DURATION * 1000) {
            playerState.isInvulnerable = false;
        }
    }
}