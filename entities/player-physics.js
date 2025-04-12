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

    const speedMultiplier = getPowerupMultiplier(playerState, PowerupType.SPEED_BOOST);

    const currentThrustForce = playerState.thrustForce * speedMultiplier; 
    const currentHorizontalAcceleration = playerState.horizontalAcceleration * speedMultiplier; 
    const currentMaxHorizontalSpeed = playerState.maxHorizontalSpeed * speedMultiplier; 

    if (!playerState.isOnGround || playerState.isThrusting) {
        playerState.ay = playerState.gravity; 
        if (playerState.isThrusting) {
            if (consumeFuel(playerState, playerState.fuelConsumeRate * deltaTime)) {
                playerState.ay -= currentThrustForce; 
            } else {
                playerState.isThrusting = false; 
            }
        }
        if (!playerState.isOnGround) {
            const dragForce = -playerState.vy * playerState.verticalDragFactor;
            playerState.ay += dragForce;
        }
        playerState.vy += playerState.ay * deltaTime;
        playerState.vy = Math.max(-GLOBAL_PHYSICS.MAX_VERTICAL_SPEED, Math.min(GLOBAL_PHYSICS.MAX_VERTICAL_SPEED, playerState.vy));
    } else { 
        playerState.ay = 0; 
        playerState.vy = 0; 
    }

    playerState.ax = 0;
    if (playerState.isMovingLeft) {
        playerState.ax -= currentHorizontalAcceleration; 
    }
    if (playerState.isMovingRight) {
        playerState.ax += currentHorizontalAcceleration; 
    }

    let frictionFactor = 0;
    if (playerState.isOnGround) {
        frictionFactor = playerState.groundFrictionFactor; 
    } else {
        frictionFactor = playerState.airFrictionFactor; 
    }
    const frictionForce = -playerState.vx * frictionFactor;
    playerState.ax += frictionForce;

    playerState.vx += playerState.ax * deltaTime;

    playerState.vx = Math.max(-currentMaxHorizontalSpeed, Math.min(currentMaxHorizontalSpeed, playerState.vx)); 

    if (!playerState.isMovingLeft && !playerState.isMovingRight && Math.abs(playerState.vx) < 1 && Math.abs(playerState.ax) < 1) {
        playerState.vx = 0;
        playerState.ax = 0;
    }

    playerState.x += playerState.vx * deltaTime;
    playerState.y += playerState.vy * deltaTime;

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
        if (penetration >= -0.1) { 
            playerState.y -= penetration; 
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

            if (playerManager && currentTime - playerState.lastGroundDamageTime > GROUND_DAMAGE_INTERVAL) {
                applyDamage(playerState, GROUND_DAMAGE_AMOUNT, currentTime, playerManager);
                playerState.lastGroundDamageTime = currentTime; 
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

    const minX = 0;
    const maxX = gameBounds.width - playerWidth; 

    if (playerState.x < minX) {
        playerState.x = minX;
        if (playerState.vx < 0) playerState.vx = 0;
    } else if (playerState.x > maxX) {
        playerState.x = maxX;
        if (playerState.vx > 0) playerState.vx = 0;
    }

    const minY = 0;
    if (playerState.y < minY) { 
        playerState.y = minY;
        if (playerState.vy < 0) playerState.vy = 0;
        playerState.isOnGround = false;
    }

    if (playerState.isOnGround && particleSystem) {
        const contactX = (playerState.x + playerWidth / 2)
            + (playerState.visualFacingDirection === 1 ? -playerWidth * 0.3 : playerWidth * 0.3);
        const contactY = groundLevelY - 2; 
        const baseSparkVX = -80 + playerState.vx * 0.5;
        const baseSmokeVX = -30 + playerState.vx * 0.3;
        particleSystem.emitSparks(contactX, contactY, GLOBAL_PHYSICS.SPARK_EMIT_RATE, baseSparkVX);
        particleSystem.emitSmoke(contactX, contactY, GLOBAL_PHYSICS.SMOKE_EMIT_RATE, baseSmokeVX);
    }

    let targetRotation = 0;
    if (!playerState.isOnGround) {
        const normalizedVy = Math.max(-1, Math.min(1, playerState.vy / GLOBAL_PHYSICS.MAX_VERTICAL_SPEED));
        targetRotation = -normalizedVy * GLOBAL_PHYSICS.MAX_TILT_ANGLE; 
        if (playerState.visualFacingDirection === 1) {
            targetRotation *= -1;
        }
    }
    const rotationStep = (targetRotation - playerState.rotation) * GLOBAL_PHYSICS.TILT_SPEED * deltaTime; 
    playerState.rotation += rotationStep;
    if (playerState.isOnGround && Math.abs(playerState.rotation) < 0.01) {
        playerState.rotation = 0;
    }
}