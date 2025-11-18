// Orchestrator for weapon behaviour; delegates to smaller modules.

import { computeFiringAngle } from './aiming.js'; // kept for potential internal use
import ChargingManager from './charging.js';
import { attemptFire } from './firing.js';

/**
 * WeaponSystem now acts as a thin facade delegating charging, updating and firing
 * to the smaller modules while preserving the original public API expected by Player.
 */
class WeaponSystem {
    constructor(playerState, projectileManager, networkManager, getVisualNosePositionFunc) {
        if (!playerState || !projectileManager || !networkManager || !getVisualNosePositionFunc) {
            throw new Error("WeaponSystem requires playerState, projectileManager, networkManager, and getVisualNosePositionFunc");
        }
        this.state = playerState;
        this.projectileManager = projectileManager;
        this.networkManager = networkManager;
        this.getVisualNosePositionFunc = getVisualNosePositionFunc;

        // Charging manager will handle charge/particle interfacing
        this.chargingManager = new ChargingManager(
            this.state,
            null, // particleSystem will be set later via setParticleSystem if needed
            this.getVisualNosePositionFunc,
            () => ({ x: 0, y: 0 }) // placeholder getVisualCenter; caller may pass a different one via update
        );

        // Fire tracking
        this.lastFireTime = 0;
    }

    // Allow injecting particle system / visual center getter if needed
    setParticleSystem(particleSystem, getVisualCenterFunc) {
        this.chargingManager.particleSystem = particleSystem;
        if (getVisualCenterFunc) {
            this.chargingManager.getVisualCenterFunc = getVisualCenterFunc;
        }
    }

    startCharging() {
        this.chargingManager.startCharging();
    }

    stopCharging() {
        this.chargingManager.stopCharging();
    }

    update(deltaTime, particleSystem, getVisualCenterFunc) {
        // Ensure particle system and visual center getter are available to charging manager
        if (particleSystem) this.chargingManager.particleSystem = particleSystem;
        if (getVisualCenterFunc) this.chargingManager.getVisualCenterFunc = getVisualCenterFunc;

        this.chargingManager.update(deltaTime);
        // mirror back a couple of relevant state flags to ensure compatibility
        this.state.chargeLevel = this.chargingManager.chargeLevel;
        this.state.isCharging = this.chargingManager.isCharging;
        this.state.wantsToFire = this.chargingManager.wantsToFire;
    }

    attemptFire(currentTime) {
        const fired = attemptFire({
            chargingManager: this.chargingManager,
            playerState: this.state,
            projectileManager: this.projectileManager,
            networkManager: this.networkManager,
            currentTime: currentTime,
            getVisualNosePositionFunc: this.getVisualNosePositionFunc
        });
        if (fired) {
            this.lastFireTime = currentTime;
        }
        return fired;
    }
}

export default WeaponSystem;