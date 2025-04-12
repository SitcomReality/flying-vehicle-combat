import { GLOBAL_PHYSICS } from './player-state.js'; 
import { consumeFuel } from './vehicles/fuel-system.js'; 
import { applyDamage } from './vehicles/health-system.js';
import { getPowerupMultiplier } from './powerups/powerup-effects.js';
import { PowerupType } from './powerups/powerup-types.js';
import { PlayerLifecycleState } from './player-lifecycle.js';

const GROUND_DAMAGE_INTERVAL = 500; 
const GROUND_DAMAGE_AMOUNT = 5; 

/**
 * Updates the player's physics state (position, velocity, rotation) based on forces and time.
 * Uses playerState for vehicle-specific physics values.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {number} deltaTime - The time elapsed since the last update in seconds.
 * @param {object} gameBounds - The boundaries of the game world (e.g., { width, height }).
 * @param {number} renderScale - The scale factor applied during rendering.
 * @param {number} groundLevelY - The Y coordinate of the ground surface.
 * @param {ParticleSystem | null} particleSystem - The particle system instance to emit effects.
 * @param {number} currentTime - The current game time (performance.now()).
 * @param {PlayerManager | null} playerManager - Reference to player manager for applyDamage's death handling.
 */
export function updatePlayerPhysics(playerState, deltaTime, gameBounds, renderScale, groundLevelY, particleSystem, currentTime, playerManager) {
    if (!playerState.isLocalPlayer || playerState.lifecycleState !== PlayerLifecycleState.ACTIVE) {
        return;
    }

    const wasOnGround = playerState.isOnGround;

    // Apply powerup multipliers
    const speedMultiplier = getPowerupMultiplier(playerState, PowerupType.SPEED_BOOST);

    // Use vehicle-specific values from playerState
    const currentThrustForce = playerState.thrustForce * speedMultiplier;
    const currentHorizontalAcceleration = playerState.horizontalAcceleration * speedMultiplier;
    const currentMaxHorizontalSpeed = playerState.maxHorizontalSpeed * speedMultiplier;

    // --- Vertical Physics ---
    // Always apply gravity first
    playerState.ay = playerState.gravity;

    // Apply thrust if active and has fuel
    if (playerState.isThrusting) {
        if (consumeFuel(playerState, playerState.fuelConsumeRate * deltaTime)) {
            playerState.ay -= currentThrustForce; // Subtract thrust force from gravity
        } else {
            playerState.isThrusting = false; // Stop thrusting if out of fuel
        }
    }

    // Apply vertical drag if airborne
    if (!playerState.isOnGround) {
        const dragForce = -playerState.vy * playerState.verticalDragFactor;
        playerState.ay += dragForce;
    }

    // Update vertical velocity
    playerState.vy += playerState.ay * deltaTime;
    // Clamp vertical velocity using GLOBAL_PHYSICS constant (can be overridden per vehicle if needed later)
    playerState.vy = Math.max(-GLOBAL_PHYSICS.MAX_VERTICAL_SPEED, Math.min(GLOBAL_PHYSICS.MAX_VERTICAL_SPEED, playerState.vy));

    // If on ground and not thrusting, zero out vertical velocity and acceleration
    if (playerState.isOnGround && !playerState.isThrusting) {
        playerState.vy = 0;
        playerState.ay = 0;
    }

    // --- Horizontal Physics ---
    playerState.ax = 0; // Reset horizontal acceleration
    if (playerState.isMovingLeft) {
        playerState.ax -= currentHorizontalAcceleration;
    }
    if (playerState.isMovingRight) {
        playerState.ax += currentHorizontalAcceleration;
    }

    // Apply friction (air or ground)
    let frictionFactor = playerState.isOnGround ? playerState.groundFrictionFactor : playerState.airFrictionFactor;
    const frictionForce = -playerState.vx * frictionFactor;
    playerState.ax += frictionForce;

    // Update horizontal velocity
    playerState.vx += playerState.ax * deltaTime;
    // Clamp horizontal velocity
    playerState.vx = Math.max(-currentMaxHorizontalSpeed, Math.min(currentMaxHorizontalSpeed, playerState.vx));

    // Stop drift at low speeds if no input
    if (!playerState.isMovingLeft && !playerState.isMovingRight && Math.abs(playerState.vx) < 1 && Math.abs(playerState.ax) < 1) {
        playerState.vx = 0;
        playerState.ax = 0;
    }

    // --- Update Position ---
    playerState.x += playerState.vx * deltaTime;
    playerState.y += playerState.vy * deltaTime;

    // --- Ground Collision & Boundary Checks ---
    if (!playerState.currentVehicle) {
        console.error("Player state missing currentVehicle during physics update!");
        return;
    }
    const playerWidth = playerState.width * renderScale;
    const playerHeight = playerState.height * renderScale;
    const playerBottomY = playerState.y + playerHeight;

    let justLanded = false;
    if (playerBottomY >= groundLevelY) {
        const penetration = playerBottomY - groundLevelY;
        if (penetration >= -0.1) { // Small tolerance for floating point issues
            playerState.y -= penetration; // Correct position
            if (!wasOnGround && playerState.vy >= 0) { // Detect landing moment
                justLanded = true;
            }
            if (playerState.vy > 0) { // Stop downward movement on ground contact
                playerState.vy = 0;
            }
            playerState.isOnGround = true;

            // Apply ground damage periodically
            if (playerManager && currentTime - playerState.lastGroundDamageTime > GROUND_DAMAGE_INTERVAL) {
                 // Pass playerManager for death handling context
                applyDamage(playerState, GROUND_DAMAGE_AMOUNT, currentTime, playerManager);
                playerState.lastGroundDamageTime = currentTime;
            }

        } else {
            playerState.isOnGround = false; // Below ground but not penetrating enough? Keep airborne.
        }
    } else {
        playerState.isOnGround = false; // Above ground
    }

    // Reset vertical acceleration on landing frame
    if (justLanded) {
        playerState.ay = 0;
    }

    // Screen boundary checks
    const minX = 0;
    const maxX = gameBounds.width - playerWidth;
    if (playerState.x < minX) {
        playerState.x = minX;
        if (playerState.vx < 0) playerState.vx = 0;
    } else if (playerState.x > maxX) {
        playerState.x = maxX;
        if (playerState.vx > 0) playerState.vx = 0;
    }

    const minY = 0; // Top boundary
    if (playerState.y < minY) {
        playerState.y = minY;
        if (playerState.vy < 0) playerState.vy = 0;
        playerState.isOnGround = false; // Ensure not grounded if hitting ceiling
    }

    // --- Particle Effects ---
    if (playerState.isOnGround && particleSystem) {
        // Calculate contact point based on center + offset based on direction
        const visualCenterX = playerState.x + (playerWidth / 2) - (playerState.drawOffsetX * renderScale); // Approx visual center X
        const contactX = visualCenterX + (playerState.visualFacingDirection === 1 ? -playerWidth * 0.3 : playerWidth * 0.3);
        const contactY = groundLevelY - 2; // Slightly above ground line
        const baseSparkVX = -80 + playerState.vx * 0.5; // Sparks move against player motion
        const baseSmokeVX = -30 + playerState.vx * 0.3; // Smoke moves slower against player motion

        // Emit particles using GLOBAL_PHYSICS rates (can be overridden per vehicle later)
        if (Math.random() < GLOBAL_PHYSICS.SPARK_EMIT_RATE * deltaTime) { // Probability based on rate and deltaTime
             particleSystem.emitSparks(contactX, contactY, 1, baseSparkVX);
        }
         if (Math.random() < GLOBAL_PHYSICS.SMOKE_EMIT_RATE * deltaTime) {
             particleSystem.emitSmoke(contactX, contactY, 1, baseSmokeVX);
         }
    }

    // --- Rotation / Tilt ---
    let targetRotation = 0;
    if (!playerState.isOnGround) {
        // Calculate normalized vertical velocity (-1 to 1)
        const normalizedVy = Math.max(-1, Math.min(1, playerState.vy / GLOBAL_PHYSICS.MAX_VERTICAL_SPEED)); // Use global max speed for normalization consistency
        // Calculate target tilt based on vertical velocity and vehicle's maxTiltAngle
        targetRotation = -normalizedVy * playerState.maxTiltAngle; // Use vehicle's maxTiltAngle
        // Invert tilt if facing right (sprite is flipped)
        if (playerState.visualFacingDirection === 1) {
            targetRotation *= -1;
        }
    }
    // Smoothly interpolate towards the target rotation using vehicle's tiltSpeed
    const rotationStep = (targetRotation - playerState.rotation) * playerState.tiltSpeed * deltaTime; // Use vehicle's tiltSpeed
    playerState.rotation += rotationStep;
    // Snap rotation to 0 if on ground and rotation is very small
    if (playerState.isOnGround && Math.abs(playerState.rotation) < 0.01) {
        playerState.rotation = 0;
    }
}