import { GLOBAL_PHYSICS } from './player-state.js'; // Import only GLOBAL constants
import { consumeFuel } from './vehicles/fuel-system.js'; // Import fuel consumption logic
// Import applyDamage to apply ground damage
import { applyDamage } from './vehicles/health-system.js';
// Import powerup helpers
import { getPowerupMultiplier } from './powerups/powerup-effects.js';
import { PowerupType } from './powerups/powerup-types.js';

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
 * @param {PlayerManager | null} playerManager - Reference to player manager for applyDamage.
 */
export function updatePlayerPhysics(playerState, deltaTime, gameBounds, renderScale, groundLevelY, particleSystem, currentTime, playerManager) {
    // Physics calculations are only authoritative for the local player
    // Also check lifecycleState is ACTIVE here as a final guard
    if (!playerState.isLocalPlayer || playerState.lifecycleState !== 'ACTIVE') {
        // console.log(`Skipping physics for ${playerState.id}: isLocal=${playerState.isLocalPlayer}, state=${playerState.lifecycleState}`);
        return;
    }
    // console.log(`Updating physics for LOCAL player ${playerState.id}. State: Thrust=${playerState.isThrusting}, Left=${playerState.isMovingLeft}, Right=${playerState.isMovingRight}`);


    const wasOnGround = playerState.isOnGround; // Store previous ground state

    // --- Apply Powerup Modifiers ---
    const speedMultiplier = getPowerupMultiplier(playerState, PowerupType.SPEED_BOOST);
    // Note: We might need more multipliers later (e.g., thrust power, friction)

    const currentThrustForce = playerState.thrustForce * speedMultiplier; // Modified thrust
    const currentHorizontalAcceleration = playerState.horizontalAcceleration * speedMultiplier; // Modified accel
    const currentMaxHorizontalSpeed = playerState.maxHorizontalSpeed * speedMultiplier; // Modified max speed

    // --- Vertical Movement ---
    // console.log(` Vertical Input: Thrusting=${playerState.isThrusting}, OnGround=${playerState.isOnGround}, Current VY=${playerState.vy.toFixed(1)}`);
    if (!playerState.isOnGround || playerState.isThrusting) {
        playerState.ay = playerState.gravity; // Start with gravity
        // Apply thrust only if there's fuel
        if (playerState.isThrusting) {
            // console.log(`  Attempting thrust. Fuel: ${playerState.fuel.toFixed(1)}, ConsumeRate: ${playerState.fuelConsumeRate}`);
            // Consume Fuel via the Fuel System
            if (consumeFuel(playerState, playerState.fuelConsumeRate * deltaTime)) {
                // console.log(`   Applying thrust force: ${currentThrustForce}. Ay before: ${playerState.ay.toFixed(1)}`);
                playerState.ay -= currentThrustForce; // Apply thrust *against* gravity
                // console.log(`   Ay after thrust: ${playerState.ay.toFixed(1)}`);
            } else {
                // Optional: visual/audio cue for out of fuel?
                // console.log(`   Thrust failed: Out of fuel.`);
                playerState.isThrusting = false; // Force thrust off if out of fuel (prevents holding key)
            }
        } else {
            // console.log(`  Not thrusting.`);
        }
        if (!playerState.isOnGround) {
            // Use verticalDragFactor from playerState
            const dragForce = -playerState.vy * playerState.verticalDragFactor;
            // console.log(`  Applying vertical drag: ${dragForce.toFixed(1)}. Ay before: ${playerState.ay.toFixed(1)}`);
            playerState.ay += dragForce;
            // console.log(`  Ay after drag: ${playerState.ay.toFixed(1)}`);
        } else {
            // console.log(`  On ground, no vertical drag applied.`);
        }
        playerState.vy += playerState.ay * deltaTime;
        playerState.vy = Math.max(-GLOBAL_PHYSICS.MAX_VERTICAL_SPEED, Math.min(GLOBAL_PHYSICS.MAX_VERTICAL_SPEED, playerState.vy)); // Global cap remains for now
    } else { // On ground and NOT thrusting
        // console.log(`  On ground and not thrusting. Setting ay=0, vy=0.`);
        playerState.ay = 0; // No vertical acceleration
        playerState.vy = 0; // Stop vertical velocity instantly
    }
    // console.log(` -> Vertical Result: AY=${playerState.ay.toFixed(1)}, VY=${playerState.vy.toFixed(1)}`);


    // --- Horizontal Movement (with Inertia) ---
    // console.log(` Horizontal Input: Left=${playerState.isMovingLeft}, Right=${playerState.isMovingRight}, Current VX=${playerState.vx.toFixed(1)}`);
    // 1. Apply Horizontal Acceleration based on Input
    playerState.ax = 0;
    if (playerState.isMovingLeft) {
        playerState.ax -= currentHorizontalAcceleration; // Use modified acceleration
    }
    if (playerState.isMovingRight) {
        playerState.ax += currentHorizontalAcceleration; // Use modified acceleration
    }
    // console.log(`  Input Ax=${playerState.ax.toFixed(1)}`);

    // 2. Apply Friction/Drag opposing current velocity
    let frictionFactor = 0;
    if (playerState.isOnGround) {
        frictionFactor = playerState.groundFrictionFactor; // Use value from playerState
    } else {
        frictionFactor = playerState.airFrictionFactor; // Use value from playerState
    }
    const frictionForce = -playerState.vx * frictionFactor;
    // console.log(`  Friction: Force=${frictionForce.toFixed(1)}, Factor=${frictionFactor}`);
    playerState.ax += frictionForce;
    // console.log(`  Final Ax=${playerState.ax.toFixed(1)}`);


    // 3. Update Horizontal Velocity
    playerState.vx += playerState.ax * deltaTime;

    // 4. Clamp Horizontal Velocity
    playerState.vx = Math.max(-currentMaxHorizontalSpeed, Math.min(currentMaxHorizontalSpeed, playerState.vx)); // Use modified max speed

    // 5. Stop completely if velocity and acceleration are very low
    if (!playerState.isMovingLeft && !playerState.isMovingRight && Math.abs(playerState.vx) < 1 && Math.abs(playerState.ax) < 1) {
        // console.log(`  Applying low velocity stop. VX was ${playerState.vx.toFixed(1)}`);
        playerState.vx = 0;
        playerState.ax = 0;
    }
    // console.log(` -> Horizontal Result: AX=${playerState.ax.toFixed(1)}, VX=${playerState.vx.toFixed(1)}`);


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
            // console.log(`  Ground collision detected. Penetration: ${penetration.toFixed(1)}`);
            playerState.y -= penetration; // Correct position based on hitbox bottom
            if (!wasOnGround && playerState.vy >= 0) {
                justLanded = true;
                // TODO: Add single impact ground collision damage check here? (e.g., based on vy)
                // console.log(`   Just landed.`);
            }
            if (playerState.vy > 0) {
                playerState.vy = 0;
                // console.log(`   Stopped positive vertical velocity.`);
            }
            playerState.isOnGround = true;
            if (!playerState.isThrusting) {
                playerState.ay = 0;
            }

            // --- Apply recurring ground damage ---
            // Ensure playerManager is provided before calling applyDamage
            if (playerManager && currentTime - playerState.lastGroundDamageTime > GROUND_DAMAGE_INTERVAL) {
                // Use the imported applyDamage function from health system
                // Pass playerManager for death handling
                applyDamage(playerState, GROUND_DAMAGE_AMOUNT, currentTime, playerManager);
                playerState.lastGroundDamageTime = currentTime; // Update time AFTER applying damage
                // console.log(`   Applied ground damage. Next check after ${currentTime + GROUND_DAMAGE_INTERVAL}`);
            }

        } else {
            // console.log(`  Below ground level, but penetration too small (${penetration.toFixed(1)}). Not setting isOnGround.`);
            playerState.isOnGround = false;
        }
    } else {
        // console.log(`  Above ground level.`);
        playerState.isOnGround = false;
    }

    if (justLanded) {
        playerState.ay = 0;
        // Optionally reset ground damage timer on landing? Or let it continue?
        // Resetting means first damage tick is delayed after landing.
        // playerState.lastGroundDamageTime = currentTime;
    }

    // --- Clamping Position (X and Top Y) ---
    const minX = 0;
    const maxX = gameBounds.width - playerWidth; // Clamp based on hitbox width

    if (playerState.x < minX) {
        playerState.x = minX;
        if (playerState.vx < 0) playerState.vx = 0;
        // TODO: Add boundary collision damage/effect?
    } else if (playerState.x > maxX) {
        playerState.x = maxX;
        if (playerState.vx > 0) playerState.vx = 0;
        // TODO: Add boundary collision damage/effect?
    }

    const minY = 0;
    if (playerState.y < minY) { // Check hitbox top Y
        playerState.y = minY;
        if (playerState.vy < 0) playerState.vy = 0;
        playerState.isOnGround = false;
        // TODO: Add boundary collision damage/effect?
    }

    // --- Particle Effects on Ground ---
    if (playerState.isOnGround && particleSystem) {
        // Calculate effect position based on hitbox center and visual direction
        const contactX = (playerState.x + playerWidth / 2)
            + (playerState.visualFacingDirection === 1 ? -playerWidth * 0.3 : playerWidth * 0.3);
        const contactY = groundLevelY - 2; // Slightly above ground line
        const baseSparkVX = -80 + playerState.vx * 0.5;
        const baseSmokeVX = -30 + playerState.vx * 0.3;
        // Use GLOBAL_PHYSICS for particle emit rates for now
        particleSystem.emitSparks(contactX, contactY, GLOBAL_PHYSICS.SPARK_EMIT_RATE, baseSparkVX);
        particleSystem.emitSmoke(contactX, contactY, GLOBAL_PHYSICS.SMOKE_EMIT_RATE, baseSmokeVX);
    }

    // --- Rotation Calculation ---
    let targetRotation = 0;
    if (!playerState.isOnGround) {
        const normalizedVy = Math.max(-1, Math.min(1, playerState.vy / GLOBAL_PHYSICS.MAX_VERTICAL_SPEED));
        targetRotation = -normalizedVy * GLOBAL_PHYSICS.MAX_TILT_ANGLE; // Use GLOBAL constants
        // Rotation direction depends on VISUAL facing direction
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