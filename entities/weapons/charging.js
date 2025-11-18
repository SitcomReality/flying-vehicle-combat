import { getPowerupMultiplier } from '../powerups/powerup-effects.js';
import { PowerupType } from '../powerups/powerup-types.js';
import {
    CHARGE_PARTICLE_EMIT_RATE,
    FULLY_CHARGED_PARTICLE_EMIT_RATE
} from '../../rendering/particle-system.js';

/**
 * ChargingManager encapsulates charge start/stop/update behavior.
 */
export default class ChargingManager {
    constructor(playerState, particleSystem, getVisualNosePositionFunc, getVisualCenterFunc) {
        this.state = playerState;
        this.particleSystem = particleSystem;
        this.getVisualNosePositionFunc = getVisualNosePositionFunc;
        this.getVisualCenterFunc = getVisualCenterFunc;

        this.isCharging = false;
        this.chargeLevel = 0;
        this.wantsToFire = false;
        this.isTapFire = false;
    }

    startCharging() {
        if (this.state.lifecycleState === 'ACTIVE' && !this.isCharging) {
            this.isCharging = true;
            this.isTapFire = false;
            this.wantsToFire = false;
            this.chargeLevel = 0;
            this.state.isCharging = true;
            this.state.wantsToFire = false;
            this.state.chargeLevel = 0;
        }
    }

    stopCharging() {
        if (!this.isCharging) return;
        this.isCharging = false;
        this.wantsToFire = this.chargeLevel > 5; // TAP_FIRE_CHARGE_THRESHOLD moved inline
        this.isTapFire = this.chargeLevel <= 5;
        this.state.isCharging = false;
        this.state.wantsToFire = this.wantsToFire;
        // leave chargeLevel in state for read by firing logic
    }

    update(deltaTime) {
        // Reflect current state
        this.isCharging = this.state.isCharging;
        this.chargeLevel = this.state.chargeLevel;
        this.wantsToFire = this.state.wantsToFire;

        if (this.isCharging) {
            const rapidFireMultiplier = getPowerupMultiplier(this.state, PowerupType.RAPID_FIRE);
            const effectiveChargeRate = (this.state.chargeRate || 0) * rapidFireMultiplier;
            const wasFullyCharged = this.chargeLevel >= (this.state.maxChargeLevel || 0);

            this.chargeLevel = Math.min(
                this.chargeLevel + effectiveChargeRate * deltaTime,
                this.state.maxChargeLevel || 0
            );

            const isFullyCharged = this.chargeLevel >= (this.state.maxChargeLevel || 0);

            if (this.particleSystem && (this.getVisualNosePositionFunc && this.getVisualCenterFunc)) {
                const nosePos = this.getVisualNosePositionFunc(this.state);
                const centerPos = this.getVisualCenterFunc();
                const chargeRatio = (this.state.maxChargeLevel > 0) ? Math.min(1, this.chargeLevel / this.state.maxChargeLevel) : 0;

                if (!isFullyCharged) {
                    this.particleSystem.emitChargeParticles(
                        centerPos.x, centerPos.y,
                        CHARGE_PARTICLE_EMIT_RATE,
                        nosePos.x, nosePos.y,
                        chargeRatio
                    );
                } else {
                    this.particleSystem.emitFullyChargedSustain(
                        nosePos.x, nosePos.y,
                        FULLY_CHARGED_PARTICLE_EMIT_RATE
                    );
                }
            }
        } else if (!this.wantsToFire) {
            if (this.chargeLevel > 0) {
                this.chargeLevel = 0;
            }
        }

        // Sync back
        this.state.chargeLevel = this.chargeLevel;
    }

    clearIntent() {
        this.wantsToFire = false;
        this.state.wantsToFire = false;
        this.isTapFire = false;
    }
}