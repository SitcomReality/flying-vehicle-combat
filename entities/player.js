import { PlayerState } from './player-state.js';
import { handlePlayerInput } from './player-input.js';
import { updatePlayerPhysics } from './player-physics.js';
import { drawPlayer } from './player-renderer.js';
import { updatePlayerFromServer, interpolatePlayerState } from './player-network-sync.js';
import { updatePlayerAnimation } from './player-animation.js'; 
import { updatePlayerCharging, handlePlayerFiring } from './player-actions.js'; 
import { getVisualCenter, getVisualNosePosition } from './player-visuals.js'; 

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

    // --- Network Synchronization ---
    updateFromServer(serverStateData, timestamp) {
        updatePlayerFromServer(this.state, serverStateData, timestamp);
    }

    // --- Input Handling ---
    handleInput(inputState) {
        handlePlayerInput(this.state, inputState);
    }

    // --- Update Cycle ---
    update(deltaTime, groundLevelY, particleSystem, currentTime) {
        if (this.state.isMarkedForRemoval) return;

        // 1. Update animations (like the flip) based on current time FIRST
        updatePlayerAnimation(this.state, currentTime);

        // 2. Handle Local Player Actions (Charging & Firing)
        if (this.state.isLocalPlayer) {
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
            updatePlayerPhysics(this.state, deltaTime, this.gameBounds, this.renderScale, groundLevelY, particleSystem);
        } else {
            interpolatePlayerState(this.state, REMOTE_PLAYER_INTERPOLATION_FACTOR);

            if (this.state.serverIsOnGround && particleSystem) {
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
        if (this.state.isMarkedForRemoval) return;
        drawPlayer(this.ctx, this.state, this.assets, this.renderScale);
    }

    // --- State Modification ---
    setVehicle(vehicleTypeIndex) {
        this.state.setVehicle(vehicleTypeIndex);
    }

    getPresenceData() {
        return this.state.getPresenceData();
    }
}

export default Player;