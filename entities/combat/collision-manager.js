// Manages collision detection and response logic by calling specific collider functions

import { checkPlayerPlayerCollisions } from '../collisions/player-player-collider.js';
import { checkPlayerProjectileCollisions } from '../collisions/player-projectile-collider.js';
import { checkPlayerPowerupCollisions } from '../collisions/player-powerup-collider.js';
import { checkPlayerCollectibleCollisions } from '../collisions/player-collectible-collider.js';
import { checkPlayerSpaceObjectCollisions } from '../collisions/player-space-object-collider.js';
import { checkProjectileSpaceObjectCollisions } from '../collisions/projectile-space-object-collider.js';

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
     * Checks for all relevant collisions in the game using the new collider functions.
     * @param {number} currentTime - The current game time (performance.now()).
     */
    checkAllCollisions(currentTime) {
        if (!this.playerManager || !this.projectileManager || !this.particleSystem || !this.powerupManager || !this.spaceObjectManager || !this.collectibleManager) {
            console.warn("Collision detection skipped: One or more managers are missing in CollisionManager.");
            return;
        }

        // Get only ACTIVE players for collision checks
        const activePlayers = this.playerManager.getAllActivePlayers();
        const localPlayer = this.playerManager.getLocalPlayer();
        const activeProjectilesMap = this.projectileManager.getProjectiles(); // Get as map {id: projectile}
        const activePowerupsArray = this.powerupManager.getActivePowerups(); // Get as array
        const activeSpaceObjectsMap = this.spaceObjectManager.getActiveObjectsMap(); // Get as map {id: object}
        const activeCollectiblesArray = this.collectibleManager.getActiveCollectibles(); // Get as array

        // ** Call NEW collision functions **
        checkPlayerPlayerCollisions(
            activePlayers, // Pass only active players
            this.renderScale,
            calculateCollisionDamage,
            currentTime,
            this.playerManager
        );

        checkPlayerProjectileCollisions(
            activePlayers, // Pass only active players
            activeProjectilesMap,
            this.renderScale,
            calculateCollisionDamage,
            currentTime,
            this.playerManager,
            this.particleSystem
        );

        // Pickup checks only need the local player if they are active
        if (localPlayer && localPlayer.lifecycleState === PlayerLifecycleState.ACTIVE) {
            checkPlayerPowerupCollisions(
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
            activePlayers, // Pass only active players
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