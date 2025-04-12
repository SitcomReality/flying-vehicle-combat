import { GLOBAL_PHYSICS } from './player-state.js'; // Import only GLOBAL constants
import { consumeFuel } from './vehicles/fuel-system.js'; // Import fuel consumption logic
// Import applyDamage to apply ground damage
import { applyDamage } from './vehicles/health-system.js';
// Import powerup helpers
import { getPowerupMultiplier } from './powerups/powerup-effects.js';
import { PowerupType } from './powerups/powerup-types.js';
import { PlayerLifecycleState } from './player-lifecycle.js';

// --- Add constants for ground damage ---
const GROUND_DAMAGE_INTERVAL = 500; // ms between ground damage ticks
const GROUND_DAMAGE_AMOUNT = 5; // Damage per tick

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
    // Physics calculations are only authoritative for the local player
    // Use strict equality check
    if (!playerState.isLocalPlayer || playerState.lifecycleState !== PlayerLifecycleState.ACTIVE) {
        return;
    }

    const wasOnGround = playerState.isOnGround; // Store previous ground state

    // --- Apply Powerup Modifiers ---
    const speedMultiplier = getPowerupMultiplier(playerState, PowerupType.SPEED_BOOST);
    // Note: We might need more multipliers later (e.g., thrust power, friction)

    const currentThrustForce = playerState.thrustForce * speedMultiplier; // Modified thrust
    const currentHorizontalAcceleration = playerState.horizontalAcceleration * speedMultiplier; // Modified accel
    const currentMaxHorizontalSpeed = playerState.maxHorizontalSpeed * speedMultiplier; // Modified max speed

    // --- Vertical Movement ---
    if (!playerState.isOnGround || playerState.isThrusting) {
        playerState.ay = playerState.gravity; // Start with gravity
        // Apply thrust only if there's fuel
        if (playerState.isThrusting) {
            // Consume Fuel via the Fuel System
            if (consumeFuel(playerState, playerState.fuelConsumeRate * deltaTime)) {
                playerState.ay -= currentThrustForce; // Apply thrust *against* gravity
            } else {
                playerState.isThrusting = false; // Force thrust off if out of fuel (prevents holding key)
            }
        }
        if (!playerState.isOnGround) {
            // Use verticalDragFactor from playerState
            const dragForce = -playerState.vy * playerState.verticalDragFactor;
            playerState.ay += dragForce;
        }
        playerState.vy += playerState.ay * deltaTime;
        playerState.vy = Math.max(-GLOBAL_PHYSICS.MAX_VERTICAL_SPEED, Math.min(GLOBAL_PHYSICS.MAX_VERTICAL_SPEED, playerState.vy)); // Global cap remains for now
    } else { // On ground and NOT thrusting
        playerState.ay = 0; // No vertical acceleration
        playerState.vy = 0; // Stop vertical velocity instantly
    }

    // --- Horizontal Movement (with Inertia) ---
    // 1. Apply Horizontal Acceleration based on Input
    playerState.ax = 0;
    if (playerState.isMovingLeft) {
        playerState.ax -= currentHorizontalAcceleration; // Use modified acceleration
    }
    if (playerState.isMovingRight) {
        playerState.ax += currentHorizontalAcceleration; // Use modified acceleration
    }

    // 2. Apply Friction/Drag opposing current velocity
    let frictionFactor = 0;
    if (playerState.isOnGround) {
        frictionFactor = playerState.groundFrictionFactor; // Use value from playerState
    } else {
        frictionFactor = playerState.airFrictionFactor; // Use value from playerState
    }
    const frictionForce = -playerState.vx * frictionFactor;
    playerState.ax += frictionForce;

    // 3. Update Horizontal Velocity
    playerState.vx += playerState.ax * deltaTime;

    // 4. Clamp Horizontal Velocity
    playerState.vx = Math.max(-currentMaxHorizontalSpeed, Math.min(currentMaxHorizontalSpeed, playerState.vx)); // Use modified max speed

    // 5. Stop completely if velocity and acceleration are very low
    if (!playerState.isMovingLeft && !playerState.isMovingRight && Math.abs(playerState.vx) < 1 && Math.abs(playerState.ax) < 1) {
        playerState.vx = 0;
        playerState.ax = 0;
    }

    // --- Update Position ---
    playerState.x += playerState.vx * deltaTime;
    playerState.y += playerState.vy * deltaTime;

    // --- Clamping Position & Ground Check ---
    // Ensure currentVehicle is valid before accessing width/height
    if (!playerState.currentVehicle) {
        console.error("Player state missing currentVehicle during physics update!");
        return; // Cannot proceed without vehicle dimensions
    }
    const playerWidth = playerState.width * renderScale;
    const playerHeight = playerState.height * renderScale;
    // Use playerState x, y which represent the top-left of the hitbox
    const playerBottomY = playerState.y + playerHeight;

    let justLanded = false;
    if (playerBottomY >= groundLevelY) {
        const penetration = playerBottomY - groundLevelY;
        // Check if penetration is significant enough (prevents tiny floating point issues sticking player)
        if (penetration >= -0.1) { // Allow slight overlap
            playerState.y -= penetration; // Correct position based on hitbox bottom
            if (!wasOnGround && playerState.vy >= 0) {
                justLanded = true;
            }
            if (playerState.vy > 0) {
                playerState.vy = 0;
            }
            playerState.isOnGround = true;
            if (!playerState.isThrusting) {
                playerState.ay = 0;
            }

            // --- Apply recurring ground damage ---
            if (playerManager && currentTime - playerState.lastGroundDamageTime > GROUND_DAMAGE_INTERVAL) {
                applyDamage(playerState, GROUND_DAMAGE_AMOUNT, currentTime, playerManager);
                playerState.lastGroundDamageTime = currentTime; // Update time AFTER applying damage
            }

        } else {
            playerState.isOnGround = false;
        }
    } else {
        playerState.isOnGround = false;
    }

    if (justLanded) {
        playerState.ay = 0;
    }

    // --- Clamping Position (X and Top Y) ---
    const minX = 0;
    const maxX = gameBounds.width - playerWidth; // Clamp based on hitbox width

    if (playerState.x < minX) {
        playerState.x = minX;
        if (playerState.vx < 0) playerState.vx = 0;
    } else if (playerState.x > maxX) {
        playerState.x = maxX;
        if (playerState.vx > 0) playerState.vx = 0;
    }

    const minY = 0;
    if (playerState.y < minY) { // Check hitbox top Y
        playerState.y = minY;
        if (playerState.vy < 0) playerState.vy = 0;
        playerState.isOnGround = false;
    }

    // --- Particle Effects on Ground ---
    if (playerState.isOnGround && particleSystem) {
        const contactX = (playerState.x + playerWidth / 2)
            + (playerState.visualFacingDirection === 1 ? -playerWidth * 0.3 : playerWidth * 0.3);
        const contactY = groundLevelY - 2; // Slightly above ground line
        const baseSparkVX = -80 + playerState.vx * 0.5;
        const baseSmokeVX = -30 + playerState.vx * 0.3;
        particleSystem.emitSparks(contactX, contactY, GLOBAL_PHYSICS.SPARK_EMIT_RATE, baseSparkVX);
        particleSystem.emitSmoke(contactX, contactY, GLOBAL_PHYSICS.SMOKE_EMIT_RATE, baseSmokeVX);
    }

    // --- Rotation Calculation ---
    let targetRotation = 0;
    if (!playerState.isOnGround) {
        const normalizedVy = Math.max(-1, Math.min(1, playerState.vy / GLOBAL_PHYSICS.MAX_VERTICAL_SPEED));
        targetRotation = -normalizedVy * GLOBAL_PHYSICS.MAX_TILT_ANGLE; // Use GLOBAL constants
        if (playerState.visualFacingDirection === 1) {
            targetRotation *= -1;
        }
    }
    const rotationStep = (targetRotation - playerState.rotation) * GLOBAL_PHYSICS.TILT_SPEED * deltaTime; // Use GLOBAL constant
    playerState.rotation += rotationStep;
    if (playerState.isOnGround && Math.abs(playerState.rotation) < 0.01) {
        playerState.rotation = 0;
    }
}