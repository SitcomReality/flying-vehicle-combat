// Import GLOBAL_PHYSICS from player-state which now aliases BASE_PLAYER_PHYSICS from the config
import { GLOBAL_PHYSICS } from '../player-state.js';
import { PowerupType, getPowerupConfig } from './powerup-types.js';

/**
 * Applies the effect of a picked-up powerup to the player's state.
 * @param {PlayerState} playerState - The player's state object.
 * @param {Powerup} powerup - The powerup object that was picked up.
 * @param {number} currentTime - The current game time (performance.now()).
 */
export function applyPowerupEffect(playerState, powerup, currentTime) {
    const config = getPowerupConfig(powerup.type);
    if (!config) return;

    console.log(`Applying effect of ${powerup.type} to player ${playerState.id}`);

    // Handle instant effects
    if (config.duration === 0) {
        switch (powerup.type) {
            case PowerupType.HEALTH_PACK:
                playerState.health = Math.min(playerState.health + config.value, playerState.maxHealth);
                console.log(`  Health restored. New health: ${playerState.health}`);
                break;
            case PowerupType.FUEL_PACK:
                playerState.fuel = Math.min(playerState.fuel + config.value, playerState.maxFuel);
                console.log(`  Fuel restored. New fuel: ${playerState.fuel}`);
                break;
        }
    }
    // Handle timed effects
    else if (config.duration > 0) {
        const expiryTime = currentTime + config.duration;

        // Store the active effect - replacing existing ones of the same type
        playerState.activePowerups[powerup.type] = {
            expiryTime: expiryTime,
            config: config, // Store config for easy access to multiplier/value
        };
        console.log(`  Effect active until ${expiryTime.toFixed(0)}`);

        // Apply immediate state changes for timed effects if needed
        if (powerup.type === PowerupType.INVULNERABILITY) {
             // Make invulnerable immediately, using the powerup's duration
             playerState.isInvulnerable = true;
             // Set lastDamageTime to ensure the effect lasts the full duration
             // Use a negative duration offset to ensure it doesn't conflict with damage invuln
             // Use INVULNERABILITY_DURATION from imported global physics config
             playerState.lastDamageTime = currentTime - (GLOBAL_PHYSICS.INVULNERABILITY_DURATION * 1000) - config.duration;
             console.log(`  Player ${playerState.id} is INVULNERABLE via powerup.`);
        }
    }
}

/**
 * Updates active powerup effects, checking for expiry.
 * @param {PlayerState} playerState - The player's state object.
 * @param {number} currentTime - The current game time (performance.now()).
 */
export function updatePowerupEffects(playerState, currentTime) {
    let hadInvulnerabilityPowerup = false;
    const activeTypes = Object.keys(playerState.activePowerups);

    for (const type of activeTypes) {
        const effect = playerState.activePowerups[type];
        if (!effect) continue; // Should not happen, but safety check

        if (type === PowerupType.INVULNERABILITY) {
             hadInvulnerabilityPowerup = true;
             // Re-assert invulnerability while the powerup is active
             playerState.isInvulnerable = true;
        }


        if (currentTime >= effect.expiryTime) {
            console.log(`Powerup effect ${type} expired for player ${playerState.id}`);
            // Remove expired effect
            delete playerState.activePowerups[type];

             // Specific logic for when INVULNERABILITY powerup expires
             if (type === PowerupType.INVULNERABILITY) {
                  // Only turn off invulnerability if NO OTHER invulnerability powerup is active
                  // AND the player isn't currently invulnerable from taking damage.
                  const remainingInvulnPowerup = Object.keys(playerState.activePowerups)
                                                    .some(t => t === PowerupType.INVULNERABILITY);
                  // Use INVULNERABILITY_DURATION from imported global physics config
                  const damageInvulnActive = currentTime - playerState.lastDamageTime < GLOBAL_PHYSICS.INVULNERABILITY_DURATION * 1000;

                  if (!remainingInvulnPowerup && !damageInvulnActive) {
                       playerState.isInvulnerable = false;
                       console.log(`  Player ${playerState.id} is no longer invulnerable (powerup expired).`);
                  } else {
                       console.log(`  Invulnerability remains active due to ${remainingInvulnPowerup ? 'another powerup' : 'damage cooldown'}.`);
                  }
             }

        }
    }

     // If no invulnerability powerup was active this frame, check damage invulnerability
     if (!hadInvulnerabilityPowerup) {
          // Use INVULNERABILITY_DURATION from imported global physics config
          const damageInvulnActive = currentTime - playerState.lastDamageTime < GLOBAL_PHYSICS.INVULNERABILITY_DURATION * 1000;
          if (!damageInvulnActive) {
              playerState.isInvulnerable = false; // Ensure it's off if no source is active
          } else {
              playerState.isInvulnerable = true; // Ensure it's on if damage cooldown is active
          }
     }
}

/**
 * Gets the current multiplier for a given stat based on active powerups.
 * @param {PlayerState} playerState - The player's state object.
 * @param {PowerupType} effectType - The type of effect to check (e.g., SPEED_BOOST).
 * @returns {number} - The combined multiplier (1 if no relevant powerup is active).
 */
export function getPowerupMultiplier(playerState, effectType) {
    let multiplier = 1.0;
    if (playerState.activePowerups[effectType]) {
        multiplier = playerState.activePowerups[effectType].config.multiplier || 1.0;
    }
    // Handle potential stacking later if needed
    return multiplier;
}