// New file: Handles network synchronization logic for player state

import { INTERPOLATION_SNAP_THRESHOLD } from './player-state.js';
import { PlayerLifecycleState } from './player-lifecycle.js';

/**
 * Updates the player's server state based on received presence data.
 * @param {PlayerState} state - The player's state object.
 * @param {object} serverData - The presence data received from the server for this player.
 * @param {number} timestamp - The time the update was received (performance.now()).
 */
export function updatePlayerFromServer(state, serverData, timestamp) {
    // Only update server state for remote players based on presence
    // Local player's state is the source of truth, but we can compare if needed
    if (state.isLocalPlayer) {
        // Optional: Log discrepancy if server state differs significantly from local state?
        // This might indicate cheating or major desync.
        return;
    }

    // Store the server's state for interpolation/reconciliation
    state.serverX = serverData.x ?? state.serverX;
    state.serverY = serverData.y ?? state.serverY;
    state.serverRotation = serverData.rotation ?? state.serverRotation;
    state.serverFacingDirection = serverData.facingDirection ?? state.serverFacingDirection;
    state.serverIsOnGround = serverData.isOnGround ?? state.serverIsOnGround;
    state.serverHealth = serverData.health ?? state.serverHealth;
    state.serverFuel = serverData.fuel ?? state.serverFuel;
    state.serverIsInvulnerable = serverData.isInvulnerable ?? state.serverIsInvulnerable;
    state.serverLifecycleState = serverData.lifecycleState ?? state.serverLifecycleState;
    state.serverScore = serverData.score ?? state.serverScore; // Sync score

    // --- Vehicle Type Sync ---
    const newVehicleType = serverData.vehicleType ?? state.vehicleType;
    if (state.vehicleType !== newVehicleType) {
         console.log(`[Sync] Remote player ${state.id} vehicle changed from ${state.vehicleType} to ${newVehicleType}`);
         state.vehicleType = newVehicleType;
         state.updateVehicleProperties(); // CRITICAL: Update properties after type change
    }
    // --- End Vehicle Type Sync ---

    // Immediately sync non-interpolated state for remote players
    // state.vehicleType = serverData.vehicleType ?? state.vehicleType; // Handled above now
    state.score = state.serverScore; // Directly update score

    // If lifecycle state changes, handle transition immediately
    if (state.lifecycleState !== state.serverLifecycleState) {
         // Remote players shouldn't call transitionToState directly as it sends presence
         // Just update the state value. Visuals/logic should react to this change.
         console.log(`Remote player ${state.id} state changed: ${state.lifecycleState} -> ${state.serverLifecycleState}`);
         state.lifecycleState = state.serverLifecycleState;
          // Reset visual state for DEAD/SELECTING transitions if needed
          if (state.lifecycleState === PlayerLifecycleState.DEAD || state.lifecycleState === PlayerLifecycleState.SELECTING) {
              // Reset visual/movement aspects that might be stuck
              state.rotation = 0;
              state.isThrusting = false;
              // etc.
          }
    }


    state.lastServerUpdateTime = timestamp;

    // Snap position if server state is very different (e.g., after respawn or major lag)
    const dx = state.serverX - state.x;
    const dy = state.serverY - state.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > INTERPOLATION_SNAP_THRESHOLD * INTERPOLATION_SNAP_THRESHOLD) {
        // console.log(`Snapping remote player ${state.id} due to distance ${Math.sqrt(distSq)}`);
        state.x = state.serverX;
        state.y = state.serverY;
        state.rotation = state.serverRotation; // Snap rotation too
    }
     // Snap facing direction immediately if different
    if (state.facingDirection !== state.serverFacingDirection) {
         state.facingDirection = state.serverFacingDirection;
         state.targetFacingDirection = state.serverFacingDirection;
         state.visualFacingDirection = state.serverFacingDirection; // Snap visual immediately for remotes
         state.flipAnimationStart = 0; // Reset animation
    }
}

/**
 * Interpolates the player's visual state towards the last known server state.
 * Should only be called for remote players.
 * @param {PlayerState} state - The player's state object.
 * @param {number} factor - The interpolation factor (0 to 1, typically a small value like 0.1).
 */
export function interpolatePlayerState(state, factor) {
    if (state.isLocalPlayer || state.lifecycleState === PlayerLifecycleState.CONNECTING) {
        return; // Don't interpolate local player or connecting players
    }

    // Interpolate position
    state.x += (state.serverX - state.x) * factor;
    state.y += (state.serverY - state.y) * factor;

    // Interpolate rotation (handle wrap-around carefully if needed, simple lerp for now)
    state.rotation += (state.serverRotation - state.rotation) * factor;

    // Interpolate health/fuel for smoother bar visuals (optional)
    state.health += (state.serverHealth - state.health) * factor * 0.5; // Slower interp for bars
    state.fuel += (state.serverFuel - state.fuel) * factor * 0.5;

    // Ensure interpolated values don't exceed max
    state.health = Math.min(state.health, state.maxHealth);
    state.fuel = Math.min(state.fuel, state.maxFuel);

     // Update visual facing direction smoothly (handled by updatePlayerAnimation now)
     // state.visualFacingDirection = state.serverFacingDirection; // Snap visual direction for now

    // OnGround and Invulnerable state are usually snapped immediately or derived
    state.isOnGround = state.serverIsOnGround;
    state.isInvulnerable = state.serverIsInvulnerable;
}