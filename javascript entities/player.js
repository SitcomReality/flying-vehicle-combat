import { PlayerState } from './player-state.js';
import { updatePlayerPhysics } from './player-physics.js';
import { drawPlayer } from './player-renderer.js';
import { updatePlayerFromServer, interpolatePlayerState } from './player-network-sync.js';
import { updatePlayerAnimation } from './player-animation.js';
import WeaponSystem from './weapons/weapon-system.js';
import { getVisualCenter, getVisualNosePosition } from './player-visuals.js';
import { PlayerLifecycleState } from './player-lifecycle.js';
import { updateFuel } from './vehicles/fuel-system.js';
import { updateHealth, applyDamage } from './vehicles/health-system.js';
import { updatePowerupEffects } from './powerups/powerup-effects.js';

// Configuration Constants
const REMOTE_PLAYER_INTERPOLATION_FACTOR = 0.15;

class Player {
    constructor(id, x, y, vehicleType, isLocalPlayer, assets, ctx, renderScale, gameWidth, gameHeight) {
        this.state = new PlayerState(id, x, y, vehicleType, isLocalPlayer);

        // Keep references needed by subsystems
        this.assets = assets;
        this.ctx = ctx;
        this.renderScale = renderScale;
        this.gameBounds = { width: gameWidth, height: gameHeight };

        // References to managers (will be set externally)
        this.projectileManager = null;
        this.networkManager = null;
        this.playerManager = null;
        this.particleSystem = null;
        this.powerupManager = null;
        this.inputManager = null; // Added reference storage

        // Weapon System (instantiated once managers are set)
        this.weaponSystem = null;
    }

    setManagers(projectileManager, networkManager, playerManager, particleSystem, powerupManager, inputManager) { // Added inputManager
        this.projectileManager = projectileManager;
        this.networkManager = networkManager;
        this.playerManager = playerManager;
        this.particleSystem = particleSystem;
        this.powerupManager = powerupManager;
        this.inputManager = inputManager; // Store reference

        // Instantiate WeaponSystem now that managers are available
        if (this.state.isLocalPlayer && !this.weaponSystem) {
            const boundGetVisualNosePos = () => getVisualNosePosition(this.state, this.renderScale);
            this.weaponSystem = new WeaponSystem(
                this.state,
                this.projectileManager,
                this.networkManager,
                boundGetVisualNosePos
            );
            console.log(`WeaponSystem initialized for local player ${this.id}`);
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

        // Handle lifecycle state sync for remote players
        if (!this.state.isLocalPlayer && serverStateData.lifecycleState !== undefined && serverStateData.lifecycleState !== this.state.lifecycleState) {
            console.log(`Remote player ${this.id} state changed: ${this.state.lifecycleState} -> ${serverStateData.lifecycleState}`);
            this.state.lifecycleState = serverStateData.lifecycleState;
             // If remote player becomes inactive, stop interpolating? MaybeData not necessary yet.
             // If they become active, ensure interpolation targets are updated.
        }

        // Sync health/fuel/invulnerability/score from server for remote players
        if (!this.isLocalPlayer) {
             if (serverStateData.health !== undefined) this.state.health = serverStateData.health;
             if (serverStateData.fuel !== undefined) this.state.fuel = serverStateData.fuel;
             if (serverStateData.isInvulnerable !== undefined) this.state.isInvulnerable = serverStateData.isInvulnerable;
             if (serverStateData.score !== undefined) this.state.score = serverStateData.score;
        }
    }

    handleInput(inputState) {
        // Check inputManager is now set and this is the local player
        if (!this.isLocalPlayer || !this.inputManager) {
            // console.log(`handleInput skipped for player ${this.id}: isLocal=${this.isLocalPlayer}, inputManager=${!!this.inputManager}`);
            return;
        }
        // console.log(`handleInput for local player ${this.id}. Input State:`, inputState, `Manager defined: ${!!this.inputManager}`);

        // Ignore input if not in ACTIVE state
        if (this.state.lifecycleState !== PlayerLifecycleState.ACTIVE) {
             // console.log(`handleInput skipped for local player ${this.id} due to state: ${this.state.lifecycleState}`);
            // Clear movement flags if not active
            this.state.isThrusting = false;
            this.state.isMovingLeft = false;
            this.state.isMovingRight = false;
            if (this.weaponSystem) {
                 this.weaponSystem.stopCharging(); // Ensure charging stops
                 this.weaponSystem.isCharging = false;
                 this.weaponSystem.wantsToFire = false;
                 this.weaponSystem.isTapFire = false;
            }
             // Ensure player state reflects this
             this.state.isCharging = false;
             this.state.wantsToFire = false;
            return;
        }

        // Update Movement Intent Flags using the passed snapshot
        this.state.isThrusting = inputState.up;
        this.state.isMovingLeft = inputState.left;
        this.state.isMovingRight = inputState.right;
         // Log movement flags
        // console.log(`  -> Movement Flags: Thrust=${this.state.isThrusting}, Left=${this.state.isMovingLeft}, Right=${this.state.isMovingRight}`);

        // Update Weapon System based on action key (' ') using the InputManager
        if (this.weaponSystem) {
            // Use the manager directly for accurate just-pressed/held states
            const actionKeyPressed = this.inputManager.wasKeyJustPressed(' ');
            const actionKeyHeld = this.inputManager.isKeyPressed(' '); // Check current held state

            // Log weapon input checks
            // console.log(`  -> Weapon Input: KeyPressed=${actionKeyPressed}, KeyHeld=${actionKeyHeld}, WeaponCharging=${this.weaponSystem.isCharging}, WeaponTapFire=${this.weaponSystem.isTapFire}`);


            if (actionKeyPressed) {
                 // console.log(`   --> Action Key Just Pressed: Flagging Tap Fire`);
                this.weaponSystem.flagTapFire(); // Signal intent to tap fire
            } else if (actionKeyHeld && !this.weaponSystem.isTapFire) {
                // If holding and not already flagged for tap fire, start/continue charging
                 // console.log(`   --> Action Key Held: Starting/Continuing Charge`);
                this.weaponSystem.startCharging();
            } else if (!actionKeyHeld && this.weaponSystem.isCharging) {
                 // If released and was charging, stop charging (will trigger charged shot if charged enough)
                 // console.log(`   --> Action Key Released (was charging): Stopping Charge`);
                 this.weaponSystem.stopCharging();
            } else if (!actionKeyHeld && this.weaponSystem.isTapFire) {
                 // If released and was flagged for tap fire (but maybe cooldown prevented it), clear flags
                 // console.log(`   --> Action Key Released (was tap fire): Clearing Tap Fire Flag`);
                 this.weaponSystem.isTapFire = false;
                 this.weaponSystem.wantsToFire = false;
                 this.state.wantsToFire = false;
            }
             // Ensure player state reflects weapon state
             this.state.isCharging = this.weaponSystem.isCharging;
             this.state.wantsToFire = this.weaponSystem.wantsToFire;
             // Log weapon state AFTER logic
            // console.log(`  -> Weapon State AFTER Input: Charging=${this.state.isCharging}, WantsFire=${this.state.wantsToFire}`);

        } else {
             console.warn(`WeaponSystem not available for input handling on player ${this.id}.`);
        }


        // Update Target Facing Direction based purely on last horizontal input
        if (inputState.right) {
            this.state.targetFacingDirection = 1; // Right
        } else if (inputState.left) {
            this.state.targetFacingDirection = -1; // Left
        }
        // If neither left nor right is pressed, targetFacingDirection remains unchanged.
        // console.log(`  -> Target Facing Direction: ${this.state.targetFacingDirection}`);
    }

    update(deltaTime, groundLevelY, particleSystem, currentTime, playerManager) { // Pass playerManager explicitly
        // Skip updates if marked for removal or in a completely non-interactive state
        if (this.state.isMarkedForRemoval || this.state.lifecycleState === PlayerLifecycleState.CONNECTING) {
             // Still update health invulnerability timer even connecting (edge case?)
            updateHealth(this.state, deltaTime, currentTime); // Call updateHealth from health-system
            return;
        }

        // 1. Update timed effects (invulnerability, powerups) FIRST
        // (Needs to happen even if DEAD/SELECTING to handle expiry)
        updateHealth(this.state, deltaTime, currentTime); // Handles damage invulnerability timer
        updatePowerupEffects(this.state, currentTime); // Handles powerup effect timers

        // Exit early if DEAD or SELECTING (after effect updates)
        if (this.state.lifecycleState === PlayerLifecycleState.DEAD || this.state.lifecycleState === PlayerLifecycleState.SELECTING) {
            // console.log(`Player ${this.id} update skipped due to state: ${this.state.lifecycleState}`); // Optional debug log
            return;
        }

        // 2. Update animations (like the flip) based on current time
        updatePlayerAnimation(this.state, currentTime);

        // 3. Handle Local Player Actions (Weapon System Update & Firing) - Only if ACTIVE and local
        if (this.state.isLocalPlayer && this.weaponSystem && this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
            const boundGetVisualCenter = () => getVisualCenter(this.state, this.renderScale);
            // Update weapon charge level and particles
            this.weaponSystem.update(deltaTime, particleSystem, boundGetVisualCenter);
            // Attempt to fire if flagged (passes current time for cooldown check)
            this.weaponSystem.attemptFire(currentTime);
        }

        // 4. Physics, Fuel and Interpolation
        if (this.isLocalPlayer) {
             // Only apply physics if ACTIVE
             if (this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
                 // console.log(`Updating physics for local player ${this.id}. State: Thrust=${this.state.isThrusting}, Left=${this.state.isMovingLeft}, Right=${this.state.isMovingRight}`);
                updatePlayerPhysics(this.state, deltaTime, this.gameBounds, this.renderScale, groundLevelY, particleSystem, currentTime, playerManager); // Pass playerManager
                // Update fuel state (regen only) using fuel-system
                updateFuel(this.state, deltaTime);
                 // console.log(`  -> Physics Result: Pos=(${this.state.x.toFixed(1)}, ${this.state.y.toFixed(1)}), Vel=(${this.state.vx.toFixed(1)}, ${this.state.vy.toFixed(1)}), Fuel=${this.state.fuel.toFixed(1)}`);
             } else {
                  // console.log(`Skipping physics update for local player ${this.id} due to state: ${this.state.lifecycleState}`);
             }
        } else {
            interpolatePlayerState(this.state, REMOTE_PLAYER_INTERPOLATION_FACTOR);
            // Check server state for ground effects even if local state is interpolating
            if (this.state.serverIsOnGround && particleSystem && this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
                 const spriteDrawWidth = this.state.currentVehicle ? this.state.currentVehicle.width * this.renderScale : 0;
                 const spriteDrawOffsetX = this.state.currentVehicle ? this.state.drawOffsetX * this.renderScale : 0;
                 const contactX = (this.state.x - spriteDrawOffsetX + spriteDrawWidth / 2)
                                + (this.state.visualFacingDirection === 1 ? -spriteDrawWidth * 0.3 : spriteDrawWidth * 0.3);
                 const contactY = groundLevelY - 2;
                 const baseSparkVX = -80;
                 const baseSmokeVX = -30;
                 particleSystem.emitSparks(contactX, contactY, 1, baseSparkVX);
                 particleSystem.emitSmoke(contactX, contactY, 1, baseSmokeVX);
            }
        }
    }

    draw() {
        // Only draw if not marked for removal and not in a completely hidden state
        if (this.state.isMarkedForRemoval ||
            this.lifecycleState === PlayerLifecycleState.CONNECTING ||
            this.state.lifecycleState === PlayerLifecycleState.SELECTING) { // Also hide during SELECTING
            return;
        }

        // Optionally hide player visually during death if needed (e.g., show explosion instead)
        // if (this.lifecycleState === PlayerLifecycleState.DEAD) {
        //     return;
        // }

        // Add visual indicator for invulnerability
        const isVisuallyInvulnerable = this.state.isInvulnerable && Math.floor(performance.now() / 150) % 2 === 0; // Blink effect
        if (isVisuallyInvulnerable) {
            this.ctx.globalAlpha = 0.6;
        }

        drawPlayer(this.ctx, this.state, this.assets, this.renderScale);

        if (isVisuallyInvulnerable) {
            this.ctx.globalAlpha = 1.0; // Reset alpha
        }
    }

    setVehicle(vehicleTypeIndex) {
        this.state.setVehicle(vehicleTypeIndex);
         // Re-initialize weapon system if needed (e.g., if weapon depends on vehicle)
         // For now, assume WeaponSystem reads stats dynamically from playerState
         // If weapon system needs re-creation based on vehicle:
         // if (this.state.isLocalPlayer && this.projectileManager && this.networkManager) {
         //     const boundGetVisualNosePos = () => getVisualNosePosition(this.state, this.renderScale);
         //     this.weaponSystem = new WeaponSystem(...) // Potentially pass vehicle-specific config
         // }
    }

    getPresenceData() {
        return this.state.getPresenceData();
    }

    transitionToState(newState) {
         if (this.state.lifecycleState !== newState) {
             console.log(`Player ${this.id} transitioning state: ${this.state.lifecycleState} -> ${newState}`);
             const oldState = this.state.lifecycleState;
             this.state.lifecycleState = newState;
             // Add any side effects needed on state transition here
             if (newState === PlayerLifecycleState.DEAD) {
                 // Stop movement, clear flags
                 this.state.vx = 0;
                 this.state.vy = 0;
                 this.state.ax = 0;
                 this.state.ay = 0;
                 this.state.isThrusting = false;
                 this.state.isMovingLeft = false;
                 this.state.isMovingRight = false;
                 this.state.isCharging = false;
                 this.state.wantsToFire = false;
                 this.state.isOnGround = false; // Assume blown into air briefly
                 // Ensure health is 0 on transition to DEAD
                 this.state.health = 0;
                 // Clear active powerups on death
                 this.state.activePowerups = {};
                 // Reset weapon system state
                 if (this.weaponSystem) {
                     this.weaponSystem.chargeLevel = 0;
                     this.weaponSystem.isCharging = false;
                     this.weaponSystem.wantsToFire = false;
                 }
             } else if (newState === PlayerLifecycleState.SELECTING) {
                 // Ensure player is visually static or hidden
             } else if (newState === PlayerLifecycleState.ACTIVE) {
                 // Ensure physics/input are enabled
                 // Make player invulnerable for a short period on spawn?
                 // For now, handled by damage invulnerability only.
             }

             // If local player, immediately sync presence on state change
             if (this.state.isLocalPlayer) {
                this.networkManager?.updatePresence(this.getPresenceData());
                console.log(`Local player ${this.id} presence updated due to state change: ${oldState} -> ${newState}`);
             }
             return true; // Transition occurred
         }
         return false; // No transition needed
    }

    resetStateForSpawn(x, y) {
        this.state.resetForSpawn(x, y); // Calls the reset logic in PlayerState
        console.log(`Player ${this.id} state reset for spawn at (${x.toFixed(0)}, ${y.toFixed(0)}). State: ${this.state.lifecycleState}`);
         // Reset weapon system state on spawn
         if (this.weaponSystem) {
             this.weaponSystem.chargeLevel = 0;
             this.weaponSystem.isCharging = false;
             this.weaponSystem.wantsToFire = false;
         }
    }

    takeDamage(amount, currentTime) {
        // Pass call to the health system, providing the player manager reference
        applyDamage(this.state, amount, currentTime, this.playerManager);
    }

    addScore(amount) {
        if (amount > 0 && this.lifecycleState === PlayerLifecycleState.ACTIVE) {
            this.state.score += amount;
            console.log(`Player ${this.id} scored ${amount} points. Total score: ${this.state.score}`);
            // Presence will happen automatically due to state change being included
            // If local player, ensure presence is updated soon
            if (this.isLocalPlayer) {
                // No immediate sync needed here, regular presence updates will cover it
                // this.networkManager?.updatePresence(this.getPresenceData());
            }
        }
    }
}

export default Player;