import { GLOBAL_PHYSICS } from '../player-state.js';
import { getPowerupMultiplier } from '../powerups/powerup-effects.js';
import { PowerupType } from '../powerups/powerup-types.js';
import { PlayerLifecycleState } from '../player-lifecycle.js';
// Import constants from ParticleSystem
import {
    CHARGE_PARTICLE_EMIT_RATE,
    FULLY_CHARGED_PARTICLE_EMIT_RATE // Add constant for fully charged emission
} from '../../rendering/particle-system.js';

const TAP_FIRE_CHARGE_THRESHOLD = 5; // Minimal charge level considered a tap fire (for wantsToFire logic)

/**
 * Manages the charging and firing logic for a player's weapon.
 * Reads weapon stats from the provided PlayerState.
 */
class WeaponSystem {
    constructor(playerState, projectileManager, networkManager, getVisualNosePositionFunc) {
        if (!playerState || !projectileManager || !networkManager || !getVisualNosePositionFunc) {
            throw new Error("WeaponSystem requires playerState, projectileManager, networkManager, and getVisualNosePositionFunc");
        }
        this.state = playerState; // Reference to the player's state object
        this.projectileManager = projectileManager;
        this.networkManager = networkManager;
        this.getVisualNosePositionFunc = getVisualNosePositionFunc; // Store the passed-in function

        // Internal state managed here, but often reflects PlayerState properties
        this.isCharging = false;
        this.chargeLevel = 0;
        this.wantsToFire = false;
        this.isTapFire = false; // Not used for triggering anymore, but helps determine shot type
        this.lastFireTime = 0; // New property for fire rate cooldown
    }

    /**
     * Starts the weapon charging process.
     */
    startCharging() {
        // Can only charge if ACTIVE
        if (this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
            // Only start charging if not already charging
            if (!this.isCharging) {
                this.isCharging = true;
                this.isTapFire = false; // Charging cancels tap fire intent (still relevant for damage/speed calcs if released early)
                this.wantsToFire = false; // Charging cancels fire intent
                this.chargeLevel = 0; // Reset
                // Sync to state
                this.state.isCharging = true;
                this.state.wantsToFire = false;
                this.state.chargeLevel = 0;
            }
        }
    }

    /**
     * Stops the weapon charging process and flags that a shot should be fired.
     * This is now the primary way to initiate a shot (via key release).
     */
    stopCharging() {
        if (this.isCharging) {
            this.isCharging = false;
            // Set wantsToFire flag if charge is above minimum threshold (prevents accidental firing on immediate release)
            this.wantsToFire = this.chargeLevel > TAP_FIRE_CHARGE_THRESHOLD;
            // Determine if it was effectively a tap fire based on final charge level
            this.isTapFire = this.chargeLevel <= TAP_FIRE_CHARGE_THRESHOLD;
            // Sync to state
            this.state.isCharging = false;
            this.state.wantsToFire = this.wantsToFire;
            // Note: isTapFire flag isn't strictly needed in state, but keeping internal flag consistent.

            // DEBUG: Log when charging stops and the resulting intent
            console.log(`[WeaponSystem ${this.state.id}] stopCharging. Final Charge: ${this.chargeLevel.toFixed(1)}. WantsToFire: ${this.wantsToFire}. IsTapFire: ${this.isTapFire}`);
        }
    }

    /**
     * Updates the charge level and handles charging effects.
     * @param {number} deltaTime - Time elapsed since last frame.
     * @param {ParticleSystem | null} particleSystem - The particle system for effects.
     * @param {function} getVisualCenterFunc - Function to get the visual center ({x, y}).
     */
    update(deltaTime, particleSystem, getVisualCenterFunc) {
        // Update internal state from player state (reflects input handling)
        this.isCharging = this.state.isCharging;
        this.chargeLevel = this.state.chargeLevel;
        this.wantsToFire = this.state.wantsToFire; // Reflects input decisions

        if (this.isCharging) {
            // Apply rapid fire multiplier to charge rate as well? (Optional synergy)
            const rapidFireMultiplier = getPowerupMultiplier(this.state, PowerupType.RAPID_FIRE);
            const effectiveChargeRate = this.state.chargeRate * rapidFireMultiplier; // Faster charge with rapid fire

            const wasFullyCharged = this.chargeLevel >= this.state.maxChargeLevel;

            this.chargeLevel = Math.min(
                this.chargeLevel + effectiveChargeRate * deltaTime, // Use effective rate
                this.state.maxChargeLevel // Use vehicle's maxChargeLevel from state
            );

            const isFullyCharged = this.chargeLevel >= this.state.maxChargeLevel;

            // Emit charging particles if system available
            if (particleSystem && getVisualCenterFunc) {
                const nosePos = this.getVisualNosePositionFunc(this.state);
                const centerPos = getVisualCenterFunc(); // Assumes visual center is needed
                const chargeRatio = this.state.maxChargeLevel > 0 ? Math.min(1, this.chargeLevel / this.state.maxChargeLevel) : 0;

                if (!isFullyCharged) {
                    // Emit "drawing in" particles while charging below max
                    particleSystem.emitChargeParticles(
                        centerPos.x, centerPos.y,
                        CHARGE_PARTICLE_EMIT_RATE,
                        nosePos.x, nosePos.y,
                        chargeRatio // Pass charge ratio
                    );
                } else {
                    // Emit "fully charged sustain" particles once max charge is reached and held
                    particleSystem.emitFullyChargedSustain(
                        nosePos.x, nosePos.y,
                        FULLY_CHARGED_PARTICLE_EMIT_RATE // Use a different rate maybe?
                    );
                }
            }

        } else if (!this.wantsToFire) { // Reset/decay only if not actively trying to fire
            if (this.chargeLevel > 0) {
                // Reset charge if charging stops AND we don't want to fire (e.g. key released but charge was minimal)
                this.chargeLevel = 0;
            }
        }


        // Sync back internal state changes to player state
        this.state.chargeLevel = this.chargeLevel;
        // isCharging and wantsToFire are primarily set by input/stopCharging/attemptFire
    }

    /**
     * Attempts to fire a projectile if the wantsToFire flag is set.
     * Calculates gravity factor based on charge level.
     */
    attemptFire(currentTime) { // Pass current time
        if (!this.wantsToFire || this.state.lifecycleState !== PlayerLifecycleState.ACTIVE) {
            // Clear flags if conditions not met (e.g., player died while wanting to fire)
            if (this.wantsToFire) { // Only clear if it was set
                this.wantsToFire = false;
                this.state.wantsToFire = false;
                this.isTapFire = false; // Reset this internal flag too
            }
            return;
        }

        // --- Fire Rate Check ---
        const rapidFireMultiplier = getPowerupMultiplier(this.state, PowerupType.RAPID_FIRE);
        const effectiveFireRate = this.state.fireRate * rapidFireMultiplier;
        const fireCooldown = 1000 / effectiveFireRate; // ms per shot

        if (currentTime - this.lastFireTime < fireCooldown) {
            // Still on cooldown. Since fire is on release, we just cancel the shot intent.
            this.wantsToFire = false;
            this.state.wantsToFire = false;
            this.isTapFire = false;
            return; // Exit if on cooldown
        }
        // --- End Fire Rate Check ---


        // Apply powerup multipliers
        const damageMultiplier = getPowerupMultiplier(this.state, PowerupType.DAMAGE_BOOST);

        // Calculate projectile initial state
        // Use the imported function here
        const nosePos = this.getVisualNosePositionFunc(this.state);
        const startX = nosePos.x;
        const startY = nosePos.y;

        let speed;
        let chargeRatio = 0;
        let projectileDamage = this.state.projectileDamage; // Base damage

        // Check the charge level at the moment of firing
        const currentCharge = this.chargeLevel;
        const maxCharge = this.state.maxChargeLevel;
        // Ensure maxCharge is not zero to avoid division by zero
        if (maxCharge > 0) {
             chargeRatio = Math.max(0, Math.min(1, currentCharge / maxCharge)); // Clamp ratio 0-1
        } else {
             chargeRatio = 0; // Default to 0 if maxCharge is invalid
             console.warn(`[WeaponSystem ${this.state.id}] Max charge level is 0 or invalid. Cannot calculate charge ratio.`);
        }


        // Determine shot type for potential scaling (use internal isTapFire flag set during stopCharging)
        if (this.isTapFire) {
            // Tap Fire: Use base speed, base damage
            speed = this.state.projectileSpeed;
        } else {
            // Charged Shot: Scale speed and damage by charge level
            // Use vehicle's projectileSpeed as base, scale with charge level using global scale factor
            speed = this.state.projectileSpeed + (GLOBAL_PHYSICS.PROJECTILE_SPEED_SCALE * currentCharge);
            // Charged shots might deal slightly more base damage? Or just scale purely?
            // Let's scale damage slightly with charge too for impact (e.g., 1x to 1.5x base)
            projectileDamage = this.state.projectileDamage * (1 + chargeRatio * 0.5);
        }

        // --- Calculate Gravity Factor based on Charge Ratio ---
        // Inverse relationship: Full charge = 0 gravity factor, No charge = full gravity factor
        // Use the base PROJECTILE_GRAVITY_FACTOR from the global physics config
        const gravityFactor = GLOBAL_PHYSICS.PROJECTILE_GRAVITY_FACTOR * (1 - chargeRatio);
        // --- End Gravity Factor Calculation ---

        // DEBUG: Log calculated values before firing
        console.log(`[WeaponSystem ${this.state.id}] Attempting Fire. Charge: ${currentCharge.toFixed(1)}/${maxCharge}, Ratio: ${chargeRatio.toFixed(3)}, Speed: ${speed.toFixed(1)}, Damage: ${projectileDamage.toFixed(1)}, GravityFactor: ${gravityFactor.toFixed(3)}`);


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
        // Reduce inheritance factor slightly
        vx += this.state.vx * 0.3;
        vy += this.state.vy * 0.3;


        // Calculate final damage including powerup multiplier
        const finalDamage = Math.round(projectileDamage * damageMultiplier);

        // Create projectile locally AND get data to broadcast
        // Pass the calculated gravityFactor
        const projectileData = this.projectileManager.createAndGetData(
            this.state.id,
            startX, startY,
            vx, vy,
            this.state.projectileColor,
            finalDamage, // Pass final damage value
            gravityFactor // Pass gravity factor
        );

        // Broadcast the fire event to other clients
        this.networkManager.sendEvent({
            type: 'fireProjectile',
            projectile: projectileData, // Includes final damage AND gravityFactor
            echo: false // Don't send back to self
        });

        // Reset state AFTER firing
        this.lastFireTime = currentTime; // Update last fire time
        this.chargeLevel = 0; // Reset charge level AFTER using it for calculations
        this.wantsToFire = false; // Reset fire intent flag
        this.isCharging = false; // Ensure charging stops after firing
        this.isTapFire = false; // Reset tap fire flag

        // Sync back to player state
        this.state.chargeLevel = this.chargeLevel;
        this.state.wantsToFire = this.wantsToFire;
        this.state.isCharging = this.isCharging;
    }
}

export default WeaponSystem;