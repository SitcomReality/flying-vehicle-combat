import { GLOBAL_PHYSICS } from '../player-state.js';
import { getPowerupMultiplier } from '../powerups/powerup-effects.js';
import { PowerupType } from '../powerups/powerup-types.js';
import { PlayerLifecycleState } from '../player-lifecycle.js';
import { getVisualNosePosition } from '../player-visuals.js';

// Configuration
const CHARGE_PARTICLE_EMIT_RATE = 3; // Particles per frame while charging
const TAP_FIRE_CHARGE_THRESHOLD = 5; // Minimal charge level considered a tap fire

/**
 * Manages the charging and firing logic for a player's weapon.
 * Reads weapon stats from the provided PlayerState.
 */
class WeaponSystem {
    constructor(playerState, projectileManager, networkManager, renderScale) {
        if (!playerState || !projectileManager || !networkManager || renderScale === undefined) {
            throw new Error("WeaponSystem requires playerState, projectileManager, networkManager, and renderScale");
        }
        this.state = playerState; // Reference to the player's state object
        this.projectileManager = projectileManager;
        this.networkManager = networkManager;
        this.renderScale = renderScale; // Store render scale needed for visuals

        // Internal state managed here, but often reflects PlayerState properties
        this.isCharging = false;
        this.chargeLevel = 0;
        this.wantsToFire = false;
        this.isTapFire = false; // New flag for tap-fire logic
        this.lastFireTime = 0; // New property for fire rate cooldown
    }

    // --- New Method: Flags that a tap-fire should occur ---
    flagTapFire() {
        // Can only tap fire if ACTIVE and not currently charging
        if (this.state.lifecycleState === PlayerLifecycleState.ACTIVE && !this.isCharging) {
            this.isTapFire = true;
            this.wantsToFire = true;
            this.state.wantsToFire = true; // Sync to state
        }
    }
    // --- End New Method ---


    /**
     * Starts the weapon charging process.
     */
    startCharging() {
        // Can only charge if ACTIVE
        if (this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
            // Only start charging if not already charging
            if (!this.isCharging) {
                this.isCharging = true;
                this.isTapFire = false; // Charging cancels tap fire intent
                this.wantsToFire = false; // Charging cancels fire intent
                this.chargeLevel = 0; // Reset charge when starting
                // Sync to state
                this.state.isCharging = true;
                this.state.wantsToFire = false;
                this.state.chargeLevel = 0;
            }
        }
    }

    /**
     * Stops the weapon charging process and flags that a shot should be fired.
     */
    stopCharging() {
        if (this.isCharging) {
            this.isCharging = false;
            // Only flag to fire if actually charged somewhat (prevents firing on release if charge never started)
            this.wantsToFire = this.chargeLevel > TAP_FIRE_CHARGE_THRESHOLD;
            this.isTapFire = false; // Releasing is never a tap fire
            // Sync to state
            this.state.isCharging = false;
            this.state.wantsToFire = this.wantsToFire;
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

            this.chargeLevel = Math.min(
                this.chargeLevel + effectiveChargeRate * deltaTime, // Use effective rate
                this.state.maxChargeLevel // Use vehicle's maxChargeLevel from state
            );

            // Emit charging particles if system available
            if (particleSystem && getVisualCenterFunc) {
                 // Use the imported function here
                const nosePos = getVisualNosePosition(this.state, this.renderScale);
                const centerPos = getVisualCenterFunc(); // Assumes visual center is needed
                particleSystem.emitChargeParticles(
                    centerPos.x, centerPos.y,
                    CHARGE_PARTICLE_EMIT_RATE,
                    nosePos.x, nosePos.y
                );
            }

        } else if (!this.wantsToFire) { // Reset/decay only if not actively trying to fire
             if (this.chargeLevel > 0) {
                // Optional: Decay charge slowly if not firing? For now, just reset.
                this.chargeLevel = 0;
             }
        }


        // Sync back internal state changes to player state
        this.state.chargeLevel = this.chargeLevel;
        // isCharging and wantsToFire are primarily set by input/attemptFire
    }

    /**
     * Attempts to fire a projectile if the wantsToFire flag is set.
     */
    attemptFire(currentTime) { // Pass current time
        if (!this.wantsToFire || this.state.lifecycleState !== PlayerLifecycleState.ACTIVE) {
            // Clear flags if conditions not met (e.g., player died while wanting to fire)
            this.wantsToFire = false;
            this.state.wantsToFire = false;
            this.isTapFire = false;
            return;
        }

        // --- Fire Rate Check ---
        const rapidFireMultiplier = getPowerupMultiplier(this.state, PowerupType.RAPID_FIRE);
        const effectiveFireRate = this.state.fireRate * rapidFireMultiplier;
        const fireCooldown = 1000 / effectiveFireRate; // ms per shot

        if (currentTime - this.lastFireTime < fireCooldown) {
            // Still on cooldown, clear tap fire flag if it was set
            if (this.isTapFire) {
                 this.isTapFire = false;
                 this.wantsToFire = false; // Cancel the tap fire request
                 this.state.wantsToFire = false;
            }
            // Don't clear wantsToFire if it's a charged shot release, just wait
            return; // Exit if on cooldown
        }
        // --- End Fire Rate Check ---


        // Apply powerup multipliers
        const damageMultiplier = getPowerupMultiplier(this.state, PowerupType.DAMAGE_BOOST);

        // Calculate projectile initial state
        // Use the imported function here
        const nosePos = getVisualNosePosition(this.state, this.renderScale);
        const startX = nosePos.x;
        const startY = nosePos.y;

        let speed;
        let chargeRatio = 0;
        let projectileDamage = this.state.projectileDamage; // Base damage

        // Determine if tap fire or charged shot based on flag and charge level
        const isActualTap = this.isTapFire || (!this.isCharging && this.chargeLevel <= TAP_FIRE_CHARGE_THRESHOLD);

        if (isActualTap) {
            // Tap Fire: Use base speed, base damage
            speed = this.state.projectileSpeed;
            // console.log(`Player ${this.state.id} Tap Firing`);
        } else {
            // Charged Shot: Scale speed and damage by charge level
            // Use vehicle's maxChargeLevel for ratio
            chargeRatio = this.chargeLevel / this.state.maxChargeLevel;
            // Use vehicle's projectileSpeed as base, scale with charge level using global scale factor
            speed = this.state.projectileSpeed + (GLOBAL_PHYSICS.PROJECTILE_SPEED_SCALE * this.chargeLevel);
            // Charged shots might deal slightly more base damage? Or just scale purely?
            // Let's scale damage slightly with charge too for impact (e.g., 1x to 1.5x base)
            projectileDamage = this.state.projectileDamage * (1 + chargeRatio * 0.5);
            // console.log(`Player ${this.state.id} Charged Firing (Ratio: ${chargeRatio.toFixed(2)})`);
        }


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

        // Reset state AFTER firing
        this.lastFireTime = currentTime; // Update last fire time
        this.chargeLevel = 0;
        this.wantsToFire = false;
        this.isCharging = false; // Ensure charging stops after firing
        this.isTapFire = false; // Reset tap fire flag

        // Sync back to player state
        this.state.chargeLevel = this.chargeLevel;
        this.state.wantsToFire = this.wantsToFire;
        this.state.isCharging = this.isCharging;
    }
}

export default WeaponSystem;