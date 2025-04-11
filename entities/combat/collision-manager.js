// New file: Manages collision detection and response logic

import { checkPlayerCollisions, checkProjectileCollisions, checkPowerupCollisions, checkPlayerCollectibleCollisions, checkPlayerSpaceObjectCollisions, checkProjectileSpaceObjectCollisions } from './collision-detector.js'; 
import { calculateCollisionDamage } from './damage-calculator.js';
import { PlayerLifecycleState } from '../player-lifecycle.js'; 

class CollisionManager {
    constructor(playerManager, projectileManager, powerupManager, spaceObjectManager, collectibleManager, particleSystem, renderScale) {
        this.playerManager = playerManager;
        this.projectileManager = projectileManager;
        this.powerupManager = powerupManager;
        this.spaceObjectManager = spaceObjectManager; 
        this.collectibleManager = collectibleManager; 
        this.particleSystem = particleSystem;
        this.renderScale = renderScale;

        if (!this.playerManager || !this.projectileManager || !this.powerupManager || !this.particleSystem || !this.spaceObjectManager || !this.collectibleManager) {
            console.error("CollisionManager is missing required manager references!");
        }
    }

    /**
     * Checks for all relevant collisions in the game.
     * @param {number} currentTime - The current game time (performance.now()).
     */
    checkAllCollisions(currentTime) {
        if (!this.playerManager || !this.projectileManager || !this.particleSystem || !this.powerupManager || !this.spaceObjectManager || !this.collectibleManager) {
            console.warn("Collision detection skipped: One or more managers are missing in CollisionManager.");
            return;
        }

        const activePlayers = this.playerManager.getAllActivePlayers(); 
        const localPlayer = this.playerManager.getLocalPlayer();
        const activeProjectilesMap = this.projectileManager.getProjectiles(); 
        const activePowerupsArray = this.powerupManager.getActivePowerups();
        const activeSpaceObjectsMap = this.spaceObjectManager.getActiveObjectsMap(); 
        const activeCollectiblesArray = this.collectibleManager.getActiveCollectibles(); 

        checkPlayerCollisions(
            activePlayers,
            this.renderScale,
            calculateCollisionDamage, 
            currentTime,
            this.playerManager 
        );

        checkProjectileCollisions(
            activePlayers,
            activeProjectilesMap,
            this.renderScale,
            calculateCollisionDamage,
            currentTime,
            this.playerManager,
            this.particleSystem 
        );

        if (localPlayer && localPlayer.lifecycleState === PlayerLifecycleState.ACTIVE) {
            checkPowerupCollisions(
                localPlayer,
                activePowerupsArray,
                this.renderScale,
                currentTime,
                this.powerupManager 
            );

            checkPlayerCollectibleCollisions(
                localPlayer,
                activeCollectiblesArray,
                this.renderScale,
                currentTime,
                this.collectibleManager 
            );
        }

        checkPlayerSpaceObjectCollisions(
            activePlayers,
            activeSpaceObjectsMap,
            this.renderScale,
            calculateCollisionDamage,
            currentTime,
            this.playerManager,
            this.spaceObjectManager 
        );

        checkProjectileSpaceObjectCollisions(
            activeProjectilesMap,
            activeSpaceObjectsMap,
            this.renderScale,
            calculateCollisionDamage,
            currentTime,
            this.spaceObjectManager, 
            this.particleSystem 
        );
    }
}

export default CollisionManager;