// New file: Manages collision detection and response logic

import { checkPlayerCollisions, checkProjectileCollisions, checkPowerupCollisions } from './collision-detector.js';
import { calculateCollisionDamage } from './damage-calculator.js';
import { PlayerLifecycleState } from '../player-lifecycle.js'; // Needed for filtering players

class CollisionManager {
    constructor(playerManager, projectileManager, powerupManager, particleSystem, renderScale) {
        this.playerManager = playerManager;
        this.projectileManager = projectileManager;
        this.powerupManager = powerupManager;
        this.particleSystem = particleSystem;
        this.renderScale = renderScale;

        if (!this.playerManager || !this.projectileManager || !this.powerupManager || !this.particleSystem) {
            console.error("CollisionManager is missing required manager references!");
        }
    }

    /**
     * Checks for all relevant collisions in the game.
     * @param {number} currentTime - The current game time (performance.now()).
     */
    checkAllCollisions(currentTime) {
        // Ensure managers are available before proceeding
        if (!this.playerManager || !this.projectileManager || !this.particleSystem || !this.powerupManager) {
            console.warn("Collision detection skipped: One or more managers are missing in CollisionManager.");
            return;
        }

        // Get active entities for collision checks
        const activePlayers = this.playerManager.getAllActivePlayers(); // Gets only players in ACTIVE state
        const localPlayer = this.playerManager.getLocalPlayer();
        const activeProjectilesObject = this.projectileManager.getProjectiles();
        const activePowerupsArray = this.powerupManager.getActivePowerups();

        // --- Check Player-Player Collisions ---
        checkPlayerCollisions(
            activePlayers,
            this.renderScale,
            calculateCollisionDamage, // Pass the damage calculation function
            currentTime,
            this.playerManager // Pass PlayerManager for damage application/death handling
        );

        // --- Check Projectile-Player Collisions ---
        checkProjectileCollisions(
            activePlayers,
            activeProjectilesObject,
            this.renderScale,
            calculateCollisionDamage,
            currentTime,
            this.playerManager,
            this.particleSystem // Pass particle system for collision effects
        );

        // --- Check Player-Powerup Collisions ---
        // Only the local player can authoritatively pick up powerups
        if (localPlayer && localPlayer.lifecycleState === PlayerLifecycleState.ACTIVE) {
            checkPowerupCollisions(
                localPlayer,
                activePowerupsArray,
                this.renderScale,
                currentTime,
                this.powerupManager // Pass powerup manager for pickup logic
            );
        }

        // --- Future Collision Checks ---
        // TODO: Check Player-SpaceObject collisions
        // TODO: Check Projectile-SpaceObject collisions
    }
}

export default CollisionManager;