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

// Define interpolation factor here for easy tuning
const REMOTE_PLAYER_INTERPOLATION_FACTOR = 0.15; // Adjust this value (0.1 - 0.3 is common)

class Player {
    constructor(id, x, y, vehicleType, isLocalPlayer, assets, ctx, renderScale, gameWidth, gameHeight) {
        this.state = new PlayerState(id, x, y, vehicleType, isLocalPlayer);

        this.assets = assets;
        this.ctx = ctx;
        this.renderScale = renderScale;
        this.gameBounds = { width: gameWidth, height: gameHeight };

        this.projectileManager = null;
        this.networkManager = null;
        this.playerManager = null; // Reference to PlayerManager, needed for death handling context
        this.particleSystem = null;
        this.powerupManager = null;
        this.inputManager = null;

        this.weaponSystem = null;
    }

    setManagers(projectileManager, networkManager, playerManager, particleSystem, powerupManager, inputManager) {
        this.projectileManager = projectileManager;
        this.networkManager = networkManager;
        this.playerManager = playerManager; // Store the PlayerManager reference
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
            // console.warn(`Skipping handleInput for player ${this.id}: missing InputManager or WeaponSystem.`);
        }
    }

    update(deltaTime, groundLevelY, particleSystem, currentTime, playerManager) {
        // --- Early Exit Checks ---
        if (this.state.isMarkedForRemoval || this.state.lifecycleState === PlayerLifecycleState.CONNECTING) {
            // Even if connecting, update health timers etc. to ensure invulnerability ends correctly
            updateHealth(this.state, deltaTime, currentTime);
            updatePowerupEffects(this.state, currentTime);
            return;
        }

        // --- Update Health, Powerups, Animation (Always run if not connecting/removed) ---
        updateHealth(this.state, deltaTime, currentTime);
        updatePowerupEffects(this.state, currentTime);

        // Don't update animation if dead/selecting, just apply health/powerup logic
        if (this.state.lifecycleState === PlayerLifecycleState.DEAD || this.state.lifecycleState === PlayerLifecycleState.SELECTING) {
            return;
        }

        // Update animation state if active
        updatePlayerAnimation(this.state, currentTime);


        // --- Local Player Logic ---
        if (this.state.isLocalPlayer) {
            // Handle Input
            if (this.inputManager) {
                 const currentInputState = this.inputManager.getInputState();
                 this.handleInput(currentInputState);
            }

            // Update Weapon System (charging, etc.)
            if (this.weaponSystem) {
                const boundGetVisualCenter = () => getVisualCenter(this.state, this.renderScale);
                this.weaponSystem.update(deltaTime, particleSystem, boundGetVisualCenter);
                // Attempt to fire if wantsToFire flag is set
                this.weaponSystem.attemptFire(currentTime);
            }

            // Update Physics and Fuel
            updatePlayerPhysics(this.state, deltaTime, this.gameBounds, this.renderScale, groundLevelY, particleSystem, currentTime, playerManager);
            updateFuel(this.state, deltaTime);

        }
        // --- Remote Player Logic ---
        else {
            // Interpolate towards server state for smooth visuals
            interpolatePlayerState(this.state, REMOTE_PLAYER_INTERPOLATION_FACTOR);

            // Apply particle effects based on interpolated state (e.g., ground sparks)
            if (this.state.isOnGround && particleSystem && this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
                const visualCenter = getVisualCenter(this.state, this.renderScale);
                if (this.state.currentVehicle) {
                    const spriteDrawWidth = this.state.currentVehicle.width * this.renderScale;
                    // Use visual direction for effect placement
                    const contactX = visualCenter.x + (this.state.visualFacingDirection === 1 ? -spriteDrawWidth * 0.3 : spriteDrawWidth * 0.3);
                    const contactY = groundLevelY - 2;
                    // Reduce particle emission probability slightly for remotes if needed
                    if (Math.random() < 0.2) particleSystem.emitSparks(contactX, contactY, 1, -80);
                    if (Math.random() < 0.1) particleSystem.emitSmoke(contactX, contactY, 1, -30);
                }
            }
            // Remote players don't run full physics simulation; they just interpolate.
        }
    }

    draw() {
        if (this.state.isMarkedForRemoval ||
            this.lifecycleState === PlayerLifecycleState.CONNECTING ||
            this.state.lifecycleState === PlayerLifecycleState.SELECTING ||
            this.state.lifecycleState === PlayerLifecycleState.DEAD) {
            return;
        }

        // Flash when invulnerable (works for both local and remote based on state)
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
             // Reset weapon system state on vehicle change
             this.weaponSystem.chargeLevel = 0;
             this.weaponSystem.isCharging = false;
             this.weaponSystem.wantsToFire = false;
             this.weaponSystem.isTapFire = false;
             this.weaponSystem.lastFireTime = 0; // Reset fire cooldown
         }
    }

    getPresenceData() {
        return this.state.getPresenceData();
    }

    transitionToState(newState) {
         if (this.state.lifecycleState === newState) {
              return false; // No change
         }

         console.log(`Player ${this.id} transitioning state: ${this.state.lifecycleState} -> ${newState}`);
         const oldState = this.state.lifecycleState;
         this.state.lifecycleState = newState;

         // Reset physics/input states when going to non-active states
         if (newState === PlayerLifecycleState.DEAD || newState === PlayerLifecycleState.SELECTING || newState === PlayerLifecycleState.CONNECTING) {
             this.state.vx = 0; this.state.vy = 0; this.state.ax = 0; this.state.ay = 0;
             this.state.rotation = 0; // Reset rotation visually
             this.state.isThrusting = false; this.state.isMovingLeft = false; this.state.isMovingRight = false;
             this.state.isCharging = false; this.state.wantsToFire = false; this.state.isOnGround = false;
             this.state.activePowerups = {}; // Clear powerups

             if (this.weaponSystem) {
                 this.weaponSystem.chargeLevel = 0; this.weaponSystem.isCharging = false; this.weaponSystem.wantsToFire = false; this.weaponSystem.isTapFire = false; this.weaponSystem.lastFireTime = 0;
             }
             if (newState === PlayerLifecycleState.DEAD) {
                 this.state.health = 0; // Ensure health is zero visually
             }
         }

         // Send presence update if it's the local player and network is available
         if (this.state.isLocalPlayer && this.networkManager) {
            this.networkManager.updatePresence(this.getPresenceData());
            console.log(`Local player ${this.id} presence updated due to state change: ${oldState} -> ${newState}`);
         }
         return true; // Transition successful
    }

    resetStateForSpawn(x, y) {
        // Resets internal state values (health, fuel, score, position, velocity, etc.)
        this.state.resetForSpawn(x, y);
        console.log(`Player ${this.id} state reset for spawn at (${x.toFixed(0)}, ${y.toFixed(0)}). State: ${this.state.lifecycleState}`);
        // Reset weapon system internal state
        if (this.weaponSystem) {
            this.weaponSystem.chargeLevel = 0;
            this.weaponSystem.isCharging = false;
            this.weaponSystem.wantsToFire = false;
            this.weaponSystem.isTapFire = false;
            this.weaponSystem.lastFireTime = 0;
        }
        // Transition to ACTIVE state (this also sends presence update)
        this.transitionToState(PlayerLifecycleState.ACTIVE);
    }

    takeDamage(amount, currentTime) {
        // Apply damage via the health system, passing the playerManager for death handling context
        if (this.playerManager) { // Check if playerManager reference exists
             applyDamage(this.state, amount, currentTime, this.playerManager);
        } else {
             console.error(`Cannot apply damage to player ${this.id}: PlayerManager reference is missing.`);
             // Fallback: Apply damage directly without death handling context
             applyDamage(this.state, amount, currentTime, null);
        }
    }

    addScore(amount) {
        if (amount > 0 && this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
            this.state.score += amount;
            // Score sync happens via regular presence updates
        }
    }
}

export default Player;