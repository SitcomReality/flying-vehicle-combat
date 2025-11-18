import { computeFiringAngle } from './aiming.js';
import { GLOBAL_PHYSICS } from '../player-state.js';
import { getPowerupMultiplier } from '../powerups/powerup-effects.js';
import { PowerupType } from '../powerups/powerup-types.js';

/**
 * Handles projectile creation, fire-rate checks and network broadcasting.
 * Exposes attemptFire(...) which returns true when a shot was fired.
 */

/**
 * attemptFire - tries to fire a projectile based on the provided contexts.
 * @param {object} params - { chargingManager, playerState, projectileManager, networkManager, currentTime, getVisualNosePositionFunc }
 * @returns {boolean} true if fired, false otherwise
 */
export function attemptFire(params) {
    const {
        chargingManager,
        playerState,
        projectileManager,
        networkManager,
        currentTime,
        getVisualNosePositionFunc
    } = params;

    if (!chargingManager || !playerState || !projectileManager || !networkManager) return false;

    if (!chargingManager.wantsToFire || playerState.lifecycleState !== 'ACTIVE') {
        if (chargingManager.wantsToFire) {
            chargingManager.clearIntent();
        }
        return false;
    }

    // Fire rate check
    const rapidFireMultiplier = getPowerupMultiplier(playerState, PowerupType.RAPID_FIRE);
    const effectiveFireRate = (playerState.fireRate || 1) * rapidFireMultiplier;
    const fireCooldown = 1000 / effectiveFireRate;

    if (currentTime - (chargingManager.lastFireTime || 0) < fireCooldown) {
        chargingManager.clearIntent();
        return false;
    }

    // Apply damage multiplier
    const damageMultiplier = getPowerupMultiplier(playerState, PowerupType.DAMAGE_BOOST);

    // Prepare projectile parameters
    const nosePos = getVisualNosePositionFunc(playerState);
    const startX = nosePos.x;
    const startY = nosePos.y;

    const currentCharge = chargingManager.chargeLevel || 0;
    const maxCharge = playerState.maxChargeLevel || 1;
    const chargeRatio = (maxCharge > 0) ? Math.max(0, Math.min(1, currentCharge / maxCharge)) : 0;

    let speed;
    let projectileDamage = playerState.projectileDamage || 10;

    if (chargingManager.isTapFire) {
        speed = playerState.projectileSpeed || 400;
    } else {
        speed = (playerState.projectileSpeed || 400) + (GLOBAL_PHYSICS.PROJECTILE_SPEED_SCALE || 0) * currentCharge;
        projectileDamage = projectileDamage * (1 + chargeRatio * 0.5);
    }

    const gravityFactor = (GLOBAL_PHYSICS.PROJECTILE_GRAVITY_FACTOR || 1) * (1 - chargeRatio);

    const angle = computeFiringAngle(playerState);
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;

    vx += (playerState.vx || 0) * 0.3;
    vy += (playerState.vy || 0) * 0.3;

    const finalDamage = Math.round((projectileDamage || 0) * damageMultiplier);

    // Create projectile locally and get data
    const projectileData = projectileManager.createAndGetData(
        playerState.id,
        startX, startY,
        vx, vy,
        playerState.projectileColor || 'yellow',
        finalDamage,
        gravityFactor
    );

    networkManager.sendEvent({
        type: 'fireProjectile',
        projectile: projectileData,
        clientId: playerState.id,
        username: networkManager.getPeer(playerState.id)?.username || 'Unknown',
        echo: false
    });

    chargingManager.lastFireTime = currentTime;
    chargingManager.chargeLevel = 0;
    chargingManager.wantsToFire = false;
    chargingManager.isCharging = false;
    chargingManager.isTapFire = false;
    chargingManager.state.chargeLevel = 0;
    chargingManager.state.wantsToFire = false;
    chargingManager.state.isCharging = false;

    return true;
}
