// Import GLOBAL_PHYSICS from player-state which now aliases BASE_PLAYER_PHYSICS from the config
import { GLOBAL_PHYSICS } from '../player-state.js';
import { PlayerLifecycleState } from '../player-lifecycle.js';
import { PowerupType } from '../powerups/powerup-types.js';

/**
 * Applies damage to the player, triggers invulnerability, and checks for death.
 * @param {PlayerState} playerState - The player's state.
 * @param {number} damageAmount - The amount of damage to apply.
 * @param {number} currentTime - The current game time (performance.now()).
 * @param {PlayerManager | null} playerManager - Reference to the player manager containing the lifecycle manager.
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
        // If it's the local player, notify the PlayerLifecycleManager via PlayerManager
        // Check if playerManager and its lifecycle manager exist
        if (playerState.isLocalPlayer && playerManager && playerManager.playerLifecycleManager) {
            // Call the lifecycle manager's death handler VIA the player manager
            playerManager.playerLifecycleManager.handlePlayerDeath(playerState.id);
        } else if (playerState.isLocalPlayer) {
            console.error(`Cannot handle player death for ${playerState.id}. playerManager or playerLifecycleManager is missing.`);
        }
        // For remote players, their death state transition will come via presence update.
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
        // Use INVULNERABILITY_DURATION from imported global physics config
        const invulnerableTimeElapsed = currentTime - playerState.lastDamageTime;
        if (invulnerableTimeElapsed > GLOBAL_PHYSICS.INVULNERABILITY_DURATION * 1000) {
             // Check if an INVULNERABILITY powerup is active before turning it off
             if (!playerState.activePowerups[PowerupType.INVULNERABILITY]) {
                 playerState.isInvulnerable = false;
             } else {
                 // If powerup is active, keep invulnerable, but reset lastDamageTime
                 // so the damage timer doesn't clash with the powerup timer check.
                 playerState.lastDamageTime = 0;
             }
        }
    }
}