import { GLOBAL_PHYSICS } from '../player-state.js';
import { getPowerupMultiplier } from '../powerups/powerup-effects.js';
import { PowerupType } from '../powerups/powerup-types.js';
import { PlayerLifecycleState } from '../player-lifecycle.js';

// Configuration
const CHARGE_PARTICLE_EMIT_RATE = 3; // Particles per frame while charging

/**
 * Manages the charging and firing logic for a player's weapon.
 * Reads weapon stats from the provided PlayerState.
 */
class WeaponSystem {
    constructor(playerState, projectileManager, networkManager, getVisualNosePosFunc) {
        if (!playerState || !projectileManager || !networkManager || !getVisualNosePosFunc) {
            throw new Error("WeaponSystem requires playerState, projectileManager, networkManager, and getVisualNosePosFunc");
        }
        this.state = playerState; // Reference to the player's state object
        this.projectileManager = projectileManager;
        this.networkManager = networkManager;
        this.getVisualNosePosition = getVisualNosePosFunc; // Function to get nose position

        // Internal state managed here, but often reflects PlayerState properties
        this.isCharging = false;
        this.chargeLevel = 0;
        this.wantsToFire = false;
    }

    /**
     * Starts the weapon charging process.
     */
    startCharging() {
        // Can only charge if ACTIVE
        if (this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
            this.isCharging = true;
            this.state.isCharging = true; // Update player state directly
        }
    }

    /**
     * Stops the weapon charging process and flags that a shot should be fired.
     */
    stopCharging() {
        if (this.isCharging) {
            this.isCharging = false;
            this.state.isCharging = false; // Update player state
            // Only flag to fire if actually charged somewhat
            if (this.chargeLevel > 0) {
                 this.wantsToFire = true;
                 this.state.wantsToFire = true; // Update player state
            }
        }
    }

    /**
     * Updates the charge level and handles charging effects.
     * @param {number} deltaTime - Time elapsed since last frame.
     * @param {ParticleSystem | null} particleSystem - The particle system for effects.
     * @param {function} getVisualCenterFunc - Function to get the visual center ({x, y}).
     */
    update(deltaTime, particleSystem, getVisualCenterFunc) {
        // Update internal state from player state (in case modified externally, though unlikely)
        this.isCharging = this.state.isCharging;
        this.chargeLevel = this.state.chargeLevel;

        if (this.isCharging) {
            this.chargeLevel = Math.min(
                this.chargeLevel + this.state.chargeRate * deltaTime, // Use vehicle's chargeRate from state
                this.state.maxChargeLevel // Use vehicle's maxChargeLevel from state
            );

            // Emit charging particles if system available
            if (particleSystem && getVisualCenterFunc) {
                const nosePos = this.getVisualNosePosition();
                const centerPos = getVisualCenterFunc(); // Assumes visual center is needed
                particleSystem.emitChargeParticles(
                    centerPos.x, centerPos.y,
                    CHARGE_PARTICLE_EMIT_RATE,
                    nosePos.x, nosePos.y
                );
            }

        } else if (!this.wantsToFire) { // Only reset/decay if not about to fire
            this.chargeLevel = 0;
        }

        // Sync back internal state changes to player state
        this.state.chargeLevel = this.chargeLevel;
    }

    /**
     * Attempts to fire a projectile if the wantsToFire flag is set.
     */
    attemptFire() {
        if (!this.wantsToFire || this.chargeLevel <= 0 || this.state.lifecycleState !== PlayerLifecycleState.ACTIVE) {
            this.wantsToFire = false; // Clear flag if conditions not met
            this.state.wantsToFire = false;
            return;
        }

        // Apply powerup multipliers
        const damageMultiplier = getPowerupMultiplier(this.state, PowerupType.DAMAGE_BOOST);

        // Calculate projectile initial state
        const nosePos = this.getVisualNosePosition();
        const startX = nosePos.x;
        const startY = nosePos.y;

        // Use vehicle's maxChargeLevel for ratio
        const chargeRatio = this.chargeLevel / this.state.maxChargeLevel;
        // Use vehicle's projectileSpeed as base, scale with charge level using global scale factor
        const speed = this.state.projectileSpeed + (GLOBAL_PHYSICS.PROJECTILE_SPEED_SCALE * this.chargeLevel);

        // Calculate firing angle based on sprite rotation and visual direction
        let angle;
        if (this.state.visualFacingDirection === 1) { // Facing Right (sprite is flipped)
            angle = this.state.rotation;
        } else { // Facing Left (sprite is not flipped)
             angle = Math.PI + this.state.rotation;
        }

        // Calculate base velocity vector based on angle and speed
        let vx = Math.cos(angle) * speed;
        let vy = Math.sin(angle) * speed;

        // Add player's current velocity to the projectile (inherited velocity)
        vx += this.state.vx * 0.5;
        vy += this.state.vy * 0.5;

        // Calculate final damage including powerup multiplier
        const finalDamage = Math.round(this.state.projectileDamage * damageMultiplier);

        // Create projectile locally AND get data to broadcast
        // Use vehicle's projectileColor and modified damage from state
        const projectileData = this.projectileManager.createAndGetData(
            this.state.id,
            startX, startY,
            vx, vy,
            this.state.projectileColor,
            finalDamage // Pass final damage value
        );

        // Broadcast the fire event to other clients
        this.networkManager.sendEvent({
            type: 'fireProjectile',
            projectile: projectileData, // Includes final damage
            echo: false // Don't send back to self
        });

        // Reset charge and fire flag immediately
        this.chargeLevel = 0;
        this.wantsToFire = false;

        // Sync back to player state
        this.state.chargeLevel = this.chargeLevel;
        this.state.wantsToFire = this.wantsToFire;
    }
}

export default WeaponSystem;