import { PlayerState } from './player-state.js';
import { handlePlayerInput } from './player-input.js';
import { updatePlayerPhysics } from './player-physics.js';
import { drawPlayer } from './player-renderer.js';
import { updatePlayerFromServer, interpolatePlayerState } from './player-network-sync.js';
import { updatePlayerAnimation } from './player-animation.js'; 
import { updatePlayerCharging, handlePlayerFiring } from './player-actions.js'; 
import { getVisualCenter, getVisualNosePosition } from './player-visuals.js'; 
import { PlayerLifecycleState } from './player-lifecycle.js'; // Import lifecycle states

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

        console.log(`Player ${id} instance created. Local: ${isLocalPlayer}, Vehicle: ${this.state.vehicleType}, Pos: ${this.state.x.toFixed(0)},${this.state.y.toFixed(0)}, Scale: ${this.renderScale}`);
    }

    // Set references to managers needed for actions
    setManagers(projectileManager, networkManager) {
        this.projectileManager = projectileManager;
        this.networkManager = networkManager;
    }

    // --- Getters to access state properties easily ---
    get id() { return this.state.id; }
    get x() { return this.state.x; }
    get y() { return this.state.y; }
    get isLocalPlayer() { return this.state.isLocalPlayer; }
    get isMarkedForRemoval() { return this.state.isMarkedForRemoval; }
    set isMarkedForRemoval(value) { this.state.isMarkedForRemoval = value; }
    get lifecycleState() { return this.state.lifecycleState; }

    // --- Network Synchronization ---
    updateFromServer(serverStateData, timestamp) {
        updatePlayerFromServer(this.state, serverStateData, timestamp);

        // Handle lifecycle state sync for remote players
        if (!this.state.isLocalPlayer && serverStateData.lifecycleState !== undefined && serverStateData.lifecycleState !== this.state.lifecycleState) {
            console.log(`Remote player ${this.id} lifecycle state changed: ${this.state.lifecycleState} -> ${serverStateData.lifecycleState}`);
            this.state.lifecycleState = serverStateData.lifecycleState;
             // If remote player becomes inactive, stop interpolating? Maybe not necessary yet.
             // If they become active, ensure interpolation targets are updated.
        }
    }

    // --- Input Handling ---
    handleInput(inputState) {
        // Ignore input if not in ACTIVE state
        if (this.state.lifecycleState !== PlayerLifecycleState.ACTIVE) {
            // Clear movement flags if not active
            this.state.isThrusting = false;
            this.state.isMovingLeft = false;
            this.state.isMovingRight = false;
            this.state.isCharging = false;
            this.state.wantsToFire = false;
            return;
        }
        handlePlayerInput(this.state, inputState);
    }

    // --- Update Cycle ---
    update(deltaTime, groundLevelY, particleSystem, currentTime) {
        // Skip updates if marked for removal or in a non-updatable state
        if (this.state.isMarkedForRemoval || this.state.lifecycleState === PlayerLifecycleState.DEAD || this.state.lifecycleState === PlayerLifecycleState.SELECTING || this.state.lifecycleState === PlayerLifecycleState.CONNECTING) {
            return;
        }

        // 1. Update animations (like the flip) based on current time FIRST
        // (Allow animation even if not ACTIVE, e.g., for spawn-in effect later)
        updatePlayerAnimation(this.state, currentTime);

        // 2. Handle Local Player Actions (Charging & Firing) - Only if ACTIVE
        if (this.state.isLocalPlayer && this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
            const boundGetVisualCenter = () => getVisualCenter(this.state, this.renderScale);
            const boundGetVisualNosePosition = () => getVisualNosePosition(this.state, this.renderScale);
            updatePlayerCharging(
                this.state,
                deltaTime,
                particleSystem,
                boundGetVisualCenter, 
                boundGetVisualNosePosition 
            );
            handlePlayerFiring(
                this.state,
                this.projectileManager,
                this.networkManager,
                boundGetVisualNosePosition 
            );
        }

        // 3. Physics and Interpolation
        if (this.state.isLocalPlayer) {
             // Only apply physics if ACTIVE
             if (this.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
                updatePlayerPhysics(this.state, deltaTime, this.gameBounds, this.renderScale, groundLevelY, particleSystem);
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

    // --- Rendering ---
    draw() {
        // Only draw if not marked for removal and not in a completely hidden state
        if (this.state.isMarkedForRemoval || this.state.lifecycleState === PlayerLifecycleState.CONNECTING) return;

        // Optionally hide player visually during selection or death if needed
        // if (this.state.lifecycleState === PlayerLifecycleState.SELECTING || this.state.lifecycleState === PlayerLifecycleState.DEAD) {
        //     // Maybe draw a placeholder or nothing?
        //     return;
        // }

        drawPlayer(this.ctx, this.state, this.assets, this.renderScale);
    }

    // --- State Modification ---
    setVehicle(vehicleTypeIndex) {
        this.state.setVehicle(vehicleTypeIndex);
    }

    getPresenceData() {
        return this.state.getPresenceData();
    }

    // --- Lifecycle Methods ---
    transitionToState(newState) {
         if (this.state.lifecycleState !== newState) {
             console.log(`Player ${this.id} transitioning state: ${this.state.lifecycleState} -> ${newState}`);
             this.state.lifecycleState = newState;
             // Add any side effects needed on state transition here
             if (newState === PlayerLifecycleState.DEAD) {
                 // Stop movement, maybe trigger explosion effect
                 this.state.vx = 0;
                 this.state.vy = 0;
                 this.state.ax = 0;
                 this.state.ay = 0;
                 // Maybe set isMarkedForRemoval later after death animation?
             } else if (newState === PlayerLifecycleState.SELECTING) {
                 // Ensure player is visually static or hidden
             } else if (newState === PlayerLifecycleState.ACTIVE) {
                 // Ensure physics/input are enabled
             }
             return true; // Transition occurred
         }
         return false; // No transition needed
    }

     // Resets the player state for spawning
    resetStateForSpawn(x, y) {
        this.state.resetForSpawn(x, y); // Calls the reset logic in PlayerState
        console.log(`Player ${this.id} state reset for spawn at (${x.toFixed(0)}, ${y.toFixed(0)}). State: ${this.state.lifecycleState}`);
    }
}

export default Player;