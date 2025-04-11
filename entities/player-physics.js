import { GLOBAL_PHYSICS } from './player-state.js'; // Import only GLOBAL constants
import { consumeFuel } from './vehicles/fuel-system.js'; // Import fuel consumption logic

/**
 * Updates the player's physics state (position, velocity, rotation) based on forces and time.
 * Uses playerState for vehicle-specific physics values.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {number} deltaTime - The time elapsed since the last update in seconds.
 * @param {object} gameBounds - The boundaries of the game world (e.g., { width, height }).
 * @param {number} renderScale - The scale factor applied during rendering.
 * @param {number} groundLevelY - The Y coordinate of the ground surface.
 * @param {ParticleSystem | null} particleSystem - The particle system instance to emit effects.
 */
export function updatePlayerPhysics(playerState, deltaTime, gameBounds, renderScale, groundLevelY, particleSystem) {
    // Physics calculations are only authoritative for the local player
    if (!playerState.isLocalPlayer || playerState.lifecycleState !== 'ACTIVE') return;

    const wasOnGround = playerState.isOnGround; // Store previous ground state

    // --- Fuel Regeneration is handled in player.js using fuel-system.js ---

    // --- Vertical Movement ---
    if (!playerState.isOnGround || playerState.isThrusting) {
        playerState.ay = playerState.gravity; // Use gravity from playerState
        // Apply thrust only if there's fuel
        if (playerState.isThrusting) {
            // Consume Fuel via the Fuel System
            // consumeFuel returns true if fuel was available and consumed
            if(consumeFuel(playerState, playerState.fuelConsumeRate * deltaTime)) {
                 playerState.ay -= playerState.thrustForce; // Use thrustForce from playerState
            } else {
                // Optional: visual/audio cue for out of fuel?
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
    } else {
        playerState.ay = 0;
        playerState.vy = 0;
    }

    // --- Horizontal Movement (with Inertia) ---
    // 1. Apply Horizontal Acceleration based on Input
    playerState.ax = 0;
    if (playerState.isMovingLeft) {
        playerState.ax -= playerState.horizontalAcceleration; // Use value from playerState
    }
    if (playerState.isMovingRight) {
        playerState.ax += playerState.horizontalAcceleration; // Use value from playerState
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
    playerState.vx = Math.max(-playerState.maxHorizontalSpeed, Math.min(playerState.maxHorizontalSpeed, playerState.vx)); // Use value from playerState

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
    const spriteDrawWidth = playerState.currentVehicle.width * renderScale;
    const spriteDrawHeight = playerState.currentVehicle.height * renderScale;
    let currentEffectiveDrawY = playerState.y - playerState.drawOffsetY * renderScale;
    let currentEffectiveBottomY = currentEffectiveDrawY + spriteDrawHeight;

    let justLanded = false;
    if (currentEffectiveBottomY >= groundLevelY) {
        const penetration = currentEffectiveBottomY - groundLevelY;
        if (penetration >= 0) {
            playerState.y -= penetration;
            if (!wasOnGround && playerState.vy >= 0) {
                justLanded = true;
                 // TODO: Add ground collision damage check here (Phase 2.2)
            }
            if (playerState.vy > 0) {
                playerState.vy = 0;
            }
            playerState.isOnGround = true;
            if (!playerState.isThrusting) {
                playerState.ay = 0;
            }
             // TODO: Add recurring ground damage check here if player stays on ground (Phase 2.2)
            currentEffectiveDrawY = playerState.y - playerState.drawOffsetY * renderScale;
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
    const effectiveDrawX = playerState.x - playerState.drawOffsetX * renderScale;
    const maxX = gameBounds.width - spriteDrawWidth;

    if (effectiveDrawX < minX) {
        playerState.x = minX + playerState.drawOffsetX * renderScale;
        if (playerState.vx < 0) playerState.vx = 0;
         // TODO: Add boundary collision damage/effect?
    } else if (effectiveDrawX > maxX) {
        playerState.x = maxX + playerState.drawOffsetX * renderScale;
        if (playerState.vx > 0) playerState.vx = 0;
         // TODO: Add boundary collision damage/effect?
    }

    const minY = 0;
    if (currentEffectiveDrawY < minY) {
        playerState.y = minY + playerState.drawOffsetY * renderScale;
        if (playerState.vy < 0) playerState.vy = 0;
        playerState.isOnGround = false;
         // TODO: Add boundary collision damage/effect?
    }

    // --- Particle Effects on Ground ---
    if (playerState.isOnGround && particleSystem) {
        const contactX = (playerState.x - playerState.drawOffsetX * renderScale + spriteDrawWidth / 2)
                       + (playerState.visualFacingDirection === 1 ? -spriteDrawWidth * 0.3 : spriteDrawWidth * 0.3);
        const contactY = groundLevelY - 2;
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
        if (playerState.facingDirection === 1) {
            targetRotation *= -1;
        }
    }
    const rotationStep = (targetRotation - playerState.rotation) * GLOBAL_PHYSICS.TILT_SPEED * deltaTime; // Use GLOBAL constant
    playerState.rotation += rotationStep;
    if (playerState.isOnGround && Math.abs(playerState.rotation) < 0.01) {
        playerState.rotation = 0;
    }
}