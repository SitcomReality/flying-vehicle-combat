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
                boundGetVisualNosePos
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
        if (this.inputManager && this.weaponSystem) {
            handlePlayerInput(this.state, inputState, this.inputManager, this.weaponSystem);
        } else {
            console.warn(`Skipping handleInput for player ${this.id}: missing InputManager or WeaponSystem.`);
        }
    }

    update(deltaTime, groundLevelY, particleSystem, currentTime, playerManager) {
        if (this.state.isMarkedForRemoval || this.state.lifecycleState === PlayerLifecycleState.CONNECTING) {
            updateHealth(this.state, deltaTime, currentTime);
            updatePowerupEffects(this.state, currentTime);
            return;
        }

        updateHealth(this.state, deltaTime, currentTime);
        updatePowerupEffects(this.state, currentTime);

        if (this.state.lifecycleState === PlayerLifecycleState.DEAD || this.state.lifecycleState === PlayerLifecycleState.SELECTING) {
            return; 
        }

        if (this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
             updatePlayerAnimation(this.state, currentTime);
        }

        if (this.state.isLocalPlayer) {
            if (this.state.lifecycleState === PlayerLifecycleState.ACTIVE && this.inputManager) {
                 const currentInputState = this.inputManager.getInputState(); 
                 this.handleInput(currentInputState);
            }

             if (this.state.lifecycleState === PlayerLifecycleState.ACTIVE && this.weaponSystem) {
                const boundGetVisualCenter = () => getVisualCenter(this.state, this.renderScale);
                this.weaponSystem.update(deltaTime, particleSystem, boundGetVisualCenter);
                this.weaponSystem.attemptFire(currentTime);
            }

             if (this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
                updatePlayerPhysics(this.state, deltaTime, this.gameBounds, this.renderScale, groundLevelY, particleSystem, currentTime, playerManager);
                updateFuel(this.state, deltaTime);
             }
        } else { 
            interpolatePlayerState(this.state, REMOTE_PLAYER_INTERPOLATION_FACTOR);

            if (this.state.serverIsOnGround && particleSystem && this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
                const visualCenter = getVisualCenter(this.state, this.renderScale);
                if (this.state.currentVehicle) {
                    const spriteDrawWidth = this.state.currentVehicle.width * this.renderScale;
                    const contactX = visualCenter.x + (this.state.visualFacingDirection === 1 ? -spriteDrawWidth * 0.3 : spriteDrawWidth * 0.3);
                    const contactY = groundLevelY - 2;
                    if (Math.random() < 0.3) particleSystem.emitSparks(contactX, contactY, 1, -80);
                    if (Math.random() < 0.2) particleSystem.emitSmoke(contactX, contactY, 1, -30);
                }
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
         if (this.state.lifecycleState === newState) {
              return false; 
         }

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

    resetStateForSpawn(x, y) {
        this.state.resetForSpawn(x, y);
        console.log(`Player ${this.id} state reset for spawn at (${x.toFixed(0)}, ${y.toFixed(0)}). State: ${this.state.lifecycleState}`);
        if (this.weaponSystem) {
            this.weaponSystem.chargeLevel = 0;
            this.weaponSystem.isCharging = false;
            this.weaponSystem.wantsToFire = false;
            this.weaponSystem.isTapFire = false;
        }
        this.transitionToState(PlayerLifecycleState.ACTIVE);
    }

    takeDamage(amount, currentTime) {
        if (this.playerManager) {
             applyDamage(this.state, amount, currentTime, this.playerManager);
        } else {
             console.error(`Cannot apply damage to player ${this.id}: PlayerManager reference is missing.`);
             applyDamage(this.state, amount, currentTime, null);
        }
    }

    addScore(amount) {
        if (amount > 0 && this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
            this.state.score += amount;
            if (this.state.isLocalPlayer) {
            }
        }
    }
}

export default Player;