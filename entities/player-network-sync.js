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
        // Example check:
        // const localDx = Math.abs(state.x - (serverData.x ?? state.x));
        // const localDy = Math.abs(state.y - (serverData.y ?? state.y));
        // if (localDx > 100 || localDy > 100) { // Threshold for logging discrepancy
        //     console.warn(`Local player ${state.id} state differs significantly from server: Local(${state.x.toFixed(0)}, ${state.y.toFixed(0)}), Server(${serverData.x?.toFixed(0)}, ${serverData.y?.toFixed(0)})`);
        // }
        return;
    }

    // Store the server's authoritative state for interpolation/reconciliation
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
    state.score = state.serverScore; // Directly update score

    // If lifecycle state changes, handle transition immediately
    if (state.lifecycleState !== state.serverLifecycleState) {
         console.log(`Remote player ${state.id} state changed: ${state.lifecycleState} -> ${state.serverLifecycleState}`);
         state.lifecycleState = state.serverLifecycleState;
          // Reset visual state for DEAD/SELECTING transitions if needed
          if (state.lifecycleState === PlayerLifecycleState.DEAD || state.lifecycleState === PlayerLifecycleState.SELECTING) {
              // Reset visual/movement aspects that might be stuck
              state.rotation = 0;
              state.isThrusting = false;
              state.vx = 0; // Stop movement visually
              state.vy = 0;
              state.ax = 0;
              state.ay = 0;
              // etc.
          }
    }


    state.lastServerUpdateTime = timestamp;

    // Snap position if server state is very different (e.g., after respawn or major lag)
    const dx = state.serverX - state.x;
    const dy = state.serverY - state.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > INTERPOLATION_SNAP_THRESHOLD * INTERPOLATION_SNAP_THRESHOLD) {
        console.log(`Snapping remote player ${state.id} due to distance ${Math.sqrt(distSq)}`);
        state.x = state.serverX;
        state.y = state.serverY;
        state.rotation = state.serverRotation; // Snap rotation too
        state.vx = 0; // Reset velocity on snap
        state.vy = 0;
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

    // Interpolate position towards server state
    state.x += (state.serverX - state.x) * factor;
    state.y += (state.serverY - state.y) * factor;

    // Interpolate rotation towards server state (handle wrap-around)
    const deltaRotation = state.serverRotation - state.rotation;
    const wrappedDelta = (deltaRotation + Math.PI * 3) % (Math.PI * 2) - Math.PI; // Correct wrap-around calculation
    state.rotation += wrappedDelta * factor;

    // Interpolate health/fuel for smoother bar visuals (optional, low factor)
    const barFactor = factor * 0.5; // Use a slower factor for bars
    state.health += (state.serverHealth - state.health) * barFactor;
    state.fuel += (state.serverFuel - state.fuel) * barFactor;

    // Ensure interpolated values don't exceed max or go below zero
    state.health = Math.max(0, Math.min(state.health, state.maxHealth));
    state.fuel = Math.max(0, Math.min(state.fuel, state.maxFuel));

    // OnGround and Invulnerable state are usually snapped immediately or derived
    // Do not interpolate these boolean states - use the authoritative server value directly.
    state.isOnGround = state.serverIsOnGround;
    state.isInvulnerable = state.serverIsInvulnerable;

    // Update visual facing direction smoothly (handled by updatePlayerAnimation now)
    // State synchronization ensures facingDirection matches serverFacingDirection eventually.
    // Animation handles the visual transition.
}