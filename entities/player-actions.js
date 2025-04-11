// New file: Handles player actions like charging and firing projectiles

import { PLAYER_PHYSICS } from './player-state.js';

// Configuration
const CHARGE_PARTICLE_EMIT_RATE = 3; // Particles per frame while charging

/**
 * Updates the player's charging state and emits particles.
 * Only runs for the local player.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {number} deltaTime - Time elapsed since last frame.
 * @param {ParticleSystem | null} particleSystem - The particle system for effects.
 * @param {function} getVisualCenterFunc - Function to get the visual center ({x, y}).
 * @param {function} getVisualNosePositionFunc - Function to get the visual nose position ({x, y}).
 */
export function updatePlayerCharging(playerState, deltaTime, particleSystem, getVisualCenterFunc, getVisualNosePositionFunc) {
    if (!playerState.isLocalPlayer) return;

    if (playerState.isCharging) {
        playerState.chargeLevel = Math.min(
            playerState.chargeLevel + PLAYER_PHYSICS.CHARGE_RATE * deltaTime,
            PLAYER_PHYSICS.MAX_CHARGE_LEVEL
        );

        // Emit charging particles if system available
        if (particleSystem && getVisualCenterFunc && getVisualNosePositionFunc) {
            const nosePos = getVisualNosePositionFunc(playerState); // Pass state directly
            const centerPos = getVisualCenterFunc(playerState); // Pass state directly
            particleSystem.emitChargeParticles(
                centerPos.x, centerPos.y, // Spawn around center
                CHARGE_PARTICLE_EMIT_RATE,
                nosePos.x, nosePos.y // Target is the nose
            );
        }

    } else if (!playerState.wantsToFire) { // Only reset/decay if not about to fire
        // Decay charge level if not charging and didn't just fire (optional)
        // playerState.chargeLevel = Math.max(0, playerState.chargeLevel - PLAYER_PHYSICS.CHARGE_RATE * deltaTime * 2);
        // Or just reset if not charging
         playerState.chargeLevel = 0;
    }
}


/**
 * Creates and fires a projectile based on the player's state.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {ProjectileManager} projectileManager - Manager to create projectiles.
 * @param {NetworkManager} networkManager - Manager to send network events.
 * @param {function} getVisualNosePositionFunc - Function to get the visual nose position ({x, y}).
 */
export function fireProjectile(playerState, projectileManager, networkManager, getVisualNosePositionFunc) {
    const state = playerState;
    if (!projectileManager || !networkManager || state.chargeLevel <= 0 || !getVisualNosePositionFunc) {
        // console.log("Cannot fire: Missing dependencies or charge.");
        return;
    }

    // Calculate projectile initial state
    const nosePos = getVisualNosePositionFunc(state); // Pass state directly
    const startX = nosePos.x;
    const startY = nosePos.y;

    const chargeRatio = state.chargeLevel / PLAYER_PHYSICS.MAX_CHARGE_LEVEL;
    const speed = PLAYER_PHYSICS.PROJECTILE_BASE_SPEED + (PLAYER_PHYSICS.PROJECTILE_SPEED_SCALE * state.chargeLevel);

    // Calculate firing angle based on sprite rotation and visual direction
    let angle;
    if (state.visualFacingDirection === 1) { // Facing Right (sprite is flipped)
        angle = state.rotation;
    } else { // Facing Left (sprite is not flipped)
         angle = Math.PI + state.rotation;
    }

    // Calculate base velocity vector based on angle and speed
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;

    // Add player's current velocity to the projectile (inherited velocity)
    vx += state.vx * 0.5; // Inherit half of player's velocity
    vy += state.vy * 0.5;

    // Create projectile locally AND get data to broadcast
    const projectileData = projectileManager.createAndGetData(
        state.id,
        startX, startY,
        vx, vy,
        '#FFD700' // Gold color for projectile
    );

    // Broadcast the fire event to other clients
    networkManager.sendEvent({
        type: 'fireProjectile',
        projectile: projectileData,
        echo: false // Don't send back to self
    });

     // console.log(`Player ${state.id} fired projectile ${projectileData.id} with charge ${state.chargeLevel.toFixed(0)}`);

    // Reset charge immediately after firing calculation uses it
    state.chargeLevel = 0;
}

/**
 * Checks if the local player wants to fire and triggers the firing mechanism.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {ProjectileManager} projectileManager - Manager to create projectiles.
 * @param {NetworkManager} networkManager - Manager to send network events.
 * @param {function} getVisualNosePositionFunc - Function to get the visual nose position ({x, y}).
 */
export function handlePlayerFiring(playerState, projectileManager, networkManager, getVisualNosePositionFunc) {
     if (!playerState.isLocalPlayer) return;

     if (playerState.wantsToFire) {
         fireProjectile(playerState, projectileManager, networkManager, getVisualNosePositionFunc);
         playerState.wantsToFire = false; // Consume the fire request
         // Charge level is reset within fireProjectile *after* it's used for calculation
     }
}