import { PlayerState } from './player-state.js';
import { updatePlayerPhysics } from './player-physics.js';
import { drawPlayer } from './player-renderer.js';
import { updatePlayerFromServer, interpolatePlayerState } from './player-network-sync.js';
import { updatePlayerAnimation } from './player-animation.js';
import { handlePlayerInput } from './player-input.js'; 
import { getVisualCenter, getVisualNosePosition } from './player-visuals.js';
import WeaponSystem from './weapons/weapon-system.js';
import { PlayerLifecycleState } from './player-lifecycle.js';
import { updateFuel } from './vehicles/fuel-system.js';
import { updateHealth, applyDamage } from './vehicles/health-system.js';
import { updatePowerupEffects } from './powerups/powerup-effects.js';

const REMOTE_PLAYER_INTERPOLATION_FACTOR = 0.15;

class Player {
    constructor(id, x, y, vehicleType, isLocalPlayer, assets, ctx, renderScale, gameWidth, gameHeight) {
        this.state = new PlayerState(id, x, y, vehicleType, isLocalPlayer);

        this.assets = assets;
        this.ctx = ctx;
        this.renderScale = renderScale;
        this.gameBounds = { width: gameWidth, height: gameHeight };

        this.projectileManager = null;
        this.networkManager = null;
        this.playerManager = null;
        this.particleSystem = null;
        this.powerupManager = null;
        this.inputManager = null; 

        this.weaponSystem = null;
    }

    setManagers(projectileManager, networkManager, playerManager, particleSystem, powerupManager, inputManager) {
        this.projectileManager = projectileManager;
        this.networkManager = networkManager;
        this.playerManager = playerManager;
        this.particleSystem = particleSystem;
        this.powerupManager = powerupManager;
        this.inputManager = inputManager; 

        if (this.state.isLocalPlayer && !this.weaponSystem && this.inputManager) {
            const boundGetVisualNosePos = () => getVisualNosePosition(this.state, this.renderScale);
            this.weaponSystem = new WeaponSystem(
                this.state,
                this.projectileManager,
                this.networkManager,
                boundGetVisualNosePos,
                this.inputManager 
            );
            console.log(`WeaponSystem initialized for local player ${this.id}`);
        } else if (this.state.isLocalPlayer && !this.inputManager) {
             console.error("Cannot initialize WeaponSystem: InputManager not provided.");
        }
    }

    get id() { return this.state.id; }
    get x() { return this.state.x; }
    get y() { return this.state.y; }
    get isLocalPlayer() { return this.state.isLocalPlayer; }
    get isMarkedForRemoval() { return this.state.isMarkedForRemoval; }
    set isMarkedForRemoval(value) { this.state.isMarkedForRemoval = value; }
    get lifecycleState() { return this.state.lifecycleState; }

    updateFromServer(serverStateData, timestamp) {
        updatePlayerFromServer(this.state, serverStateData, timestamp);
    }

    handleInput(inputState) {
        handlePlayerInput(this.state, inputState, this.inputManager, this.weaponSystem);
    }

    update(deltaTime, groundLevelY, particleSystem, currentTime, playerManager) { 
        if (this.state.isMarkedForRemoval || this.state.lifecycleState === PlayerLifecycleState.CONNECTING) {
            updateHealth(this.state, deltaTime, currentTime); 
            return;
        }

        updateHealth(this.state, deltaTime, currentTime); 
        updatePowerupEffects(this.state, currentTime); 

        if (this.state.lifecycleState === PlayerLifecycleState.DEAD || this.state.lifecycleState === PlayerLifecycleState.SELECTING) {
            return;
        }

        updatePlayerAnimation(this.state, currentTime);

        if (this.state.isLocalPlayer && this.weaponSystem && this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
            const boundGetVisualCenter = () => getVisualCenter(this.state, this.renderScale);
            this.weaponSystem.update(deltaTime, particleSystem, boundGetVisualCenter); 
            this.weaponSystem.attemptFire(currentTime); 
        }

        if (this.isLocalPlayer) {
             if (this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
                updatePlayerPhysics(this.state, deltaTime, this.gameBounds, this.renderScale, groundLevelY, particleSystem, currentTime, playerManager); 
                updateFuel(this.state, deltaTime);
             }
        } else {
            interpolatePlayerState(this.state, REMOTE_PLAYER_INTERPOLATION_FACTOR);
            if (this.state.serverIsOnGround && particleSystem && this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
                 const spriteDrawWidth = this.state.currentVehicle ? this.state.currentVehicle.width * this.renderScale : 0;
                 const spriteDrawOffsetX = this.state.currentVehicle ? this.state.drawOffsetX * this.renderScale : 0;
                 const contactX = (this.state.x - spriteDrawOffsetX + spriteDrawWidth / 2)
                                + (this.state.visualFacingDirection === 1 ? -spriteDrawWidth * 0.3 : spriteDrawWidth * 0.3);
                 const contactY = groundLevelY - 2;
                 particleSystem.emitSparks(contactX, contactY, 1, -80);
                 particleSystem.emitSmoke(contactX, contactY, 1, -30);
            }
        }
    }

    draw() {
        if (this.state.isMarkedForRemoval ||
            this.lifecycleState === PlayerLifecycleState.CONNECTING ||
            this.state.lifecycleState === PlayerLifecycleState.SELECTING) {
            return;
        }

        const isVisuallyInvulnerable = this.state.isInvulnerable && Math.floor(performance.now() / 150) % 2 === 0;
        if (isVisuallyInvulnerable) {
            this.ctx.globalAlpha = 0.6;
        }

        drawPlayer(this.ctx, this.state, this.assets, this.renderScale);

        if (isVisuallyInvulnerable) {
            this.ctx.globalAlpha = 1.0; 
        }
    }

    setVehicle(vehicleTypeIndex) {
        this.state.setVehicle(vehicleTypeIndex);
         if (this.weaponSystem) {
             this.weaponSystem.chargeLevel = 0;
             this.weaponSystem.isCharging = false;
             this.weaponSystem.wantsToFire = false;
             this.weaponSystem.isTapFire = false;
         }
    }

    getPresenceData() {
        return this.state.getPresenceData();
    }

    transitionToState(newState) {
         if (this.state.lifecycleState !== newState) {
             console.log(`Player ${this.id} transitioning state: ${this.state.lifecycleState} -> ${newState}`);
             const oldState = this.state.lifecycleState;
             this.state.lifecycleState = newState;

             if (newState === PlayerLifecycleState.DEAD) {
                 this.state.vx = 0; this.state.vy = 0; this.state.ax = 0; this.state.ay = 0;
                 this.state.isThrusting = false; this.state.isMovingLeft = false; this.state.isMovingRight = false;
                 this.state.isCharging = false; this.state.wantsToFire = false; this.state.isOnGround = false;
                 this.state.health = 0;
                 this.state.activePowerups = {};
                 if (this.weaponSystem) {
                     this.weaponSystem.chargeLevel = 0; this.weaponSystem.isCharging = false; this.weaponSystem.wantsToFire = false; this.weaponSystem.isTapFire = false;
                 }
             }

             if (this.state.isLocalPlayer && this.networkManager) {
                this.networkManager.updatePresence(this.getPresenceData());
                console.log(`Local player ${this.id} presence updated due to state change: ${oldState} -> ${newState}`);
             }
             return true; 
         }
         return false; 
    }

    resetStateForSpawn(x, y) {
        this.state.resetForSpawn(x, y);
        console.log(`Player ${this.id} state reset for spawn at (${x.toFixed(0)}, ${y.toFixed(0)}). State: ${this.state.lifecycleState}`);
        if (this.weaponSystem) {
            this.weaponSystem.chargeLevel = 0;
            this.weaponSystem.isCharging = false;
            this.weaponSystem.wantsToFire = false;
            this.weaponSystem.isTapFire = false;
        }
    }

    takeDamage(amount, currentTime) {
        applyDamage(this.state, amount, currentTime, this.playerManager);
    }

    addScore(amount) {
        if (amount > 0 && this.lifecycleState === PlayerLifecycleState.ACTIVE) {
            this.state.score += amount;
            console.log(`Player ${this.id} scored ${amount} points. Total score: ${this.state.score}`);
        }
    }
}

export default Player;