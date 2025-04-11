import { PlayerState, FLIP_ANIMATION_DURATION } from './player-state.js';
import { handlePlayerInput } from './player-input.js';
import { updatePlayerPhysics } from './player-physics.js';
import { drawPlayer } from './player-renderer.js';
import { updatePlayerFromServer, interpolatePlayerState } from './player-network-sync.js';

// Configuration Constants (can be moved to a config file)
const REMOTE_PLAYER_INTERPOLATION_FACTOR = 0.15; // Smoothing factor for remote players

class Player {
    constructor(id, x, y, vehicleType, isLocalPlayer, assets, ctx, renderScale, gameWidth, gameHeight) {
        this.state = new PlayerState(id, x, y, vehicleType, isLocalPlayer);

        // Keep references needed by subsystems
        this.assets = assets;
        this.ctx = ctx;
        this.renderScale = renderScale;
        this.gameBounds = { width: gameWidth, height: gameHeight };

        console.log(`Player ${id} instance created. Local: ${isLocalPlayer}, Vehicle: ${this.state.vehicleType}, Pos: ${this.state.x.toFixed(0)},${this.state.y.toFixed(0)}, Scale: ${renderScale}`);
    }

    // --- Getters to access state properties easily (optional) ---
    get id() { return this.state.id; }
    get x() { return this.state.x; }
    get y() { return this.state.y; }
    get vx() { return this.state.vx; }
    get vy() { return this.state.vy; }
    get rotation() { return this.state.rotation; }
    get vehicleType() { return this.state.vehicleType; }
    get isLocalPlayer() { return this.state.isLocalPlayer; }
    get isMarkedForRemoval() { return this.state.isMarkedForRemoval; }
    set isMarkedForRemoval(value) { this.state.isMarkedForRemoval = value; }
    get facingDirection() { return this.state.facingDirection; }
    get isThrusting() { return this.state.isThrusting; }

    // --- Network Synchronization ---
    updateFromServer(serverStateData, timestamp) {
        updatePlayerFromServer(this.state, serverStateData, timestamp);
    }

    // --- Input Handling ---
    handleInput(inputState) {
        handlePlayerInput(this.state, inputState);
    }

    // --- Animation Update ---
    updateAnimation(currentTime) {
        const state = this.state;

        // --- Flip Animation Logic ---
        if (state.flipAnimationStart > 0) { // Currently flipping
            const elapsed = currentTime - state.flipAnimationStart;

            if (state.targetFacingDirection === state.facingDirection) {
                 // Rapid reversal: Target flipped back to original before animation finished. Cancel the flip.
                 state.flipAnimationStart = 0;
                 // Visual direction remains the same as the actual direction.
                 state.visualFacingDirection = state.facingDirection;

            } else if (elapsed >= FLIP_ANIMATION_DURATION) {
                // Animation finished
                state.facingDirection = state.targetFacingDirection; // Update actual direction
                state.visualFacingDirection = state.targetFacingDirection; // Update visual direction
                state.flipAnimationStart = 0; // End animation
            }
             // Else: Animation still in progress. visualFacingDirection remains the old direction.

        } else { // Not currently flipping
            if (state.targetFacingDirection !== state.facingDirection) {
                // Start a new flip animation
                state.flipAnimationStart = currentTime;
                // Keep visual direction as the current actual direction until animation completes
                state.visualFacingDirection = state.facingDirection;
            } else {
                 // Ensure visual direction matches actual direction if not flipping
                 state.visualFacingDirection = state.facingDirection;
            }
        }
    }

    // --- Update Cycle ---
    update(deltaTime, groundLevelY, particleSystem, currentTime) { 
        if (this.state.isMarkedForRemoval) return;

        // Update animations (like the flip) based on current time FIRST
        // This uses the targetFacingDirection potentially set by input or network update
        this.updateAnimation(currentTime);

        if (this.state.isLocalPlayer) {
            // Local player calculates physics based on input
            // Note: updatePlayerPhysics no longer changes facingDirection directly
            updatePlayerPhysics(this.state, deltaTime, this.gameBounds, this.renderScale, groundLevelY, particleSystem);
        } else {
            // Remote players interpolate towards server state
            interpolatePlayerState(this.state, REMOTE_PLAYER_INTERPOLATION_FACTOR);
            // Apply ground effects visually based on server state for remote players
            if (this.state.serverIsOnGround && particleSystem) {
                 const spriteDrawWidth = this.state.currentVehicle.width * this.renderScale;
                 const contactX = (this.state.x - this.state.drawOffsetX * this.renderScale + spriteDrawWidth / 2)
                                + (this.state.visualFacingDirection === 1 ? -spriteDrawWidth * 0.3 : spriteDrawWidth * 0.3);
                 const contactY = groundLevelY - 2;
                 const baseSparkVX = -80; // Base effect velocity
                 const baseSmokeVX = -30;
                 particleSystem.emitSparks(contactX, contactY, 1, baseSparkVX); // Less frequent for remote? Maybe adjust rate later.
                 particleSystem.emitSmoke(contactX, contactY, 1, baseSmokeVX);
            }
        }
    }

    // --- Rendering ---
    draw() {
        if (this.state.isMarkedForRemoval) return;
        // drawPlayer now uses visualFacingDirection implicitly via playerState
        drawPlayer(this.ctx, this.state, this.assets, this.renderScale);
    }

    // --- State Modification ---
    setVehicle(vehicleTypeIndex) {
        this.state.setVehicle(vehicleTypeIndex);
    }

    // Provide easy access to presence data structure
    getPresenceData() {
        return this.state.getPresenceData();
    }

    // Helper to get visual bounds/center for drawing names etc.
    getVisualCenter() {
         const spriteConfig = this.state.currentVehicle;
         if (!spriteConfig) return { x: this.state.x, y: this.state.y }; // Fallback

         const spriteDrawWidth = spriteConfig.width * this.renderScale;
         const spriteDrawHeight = spriteConfig.height * this.renderScale;
         const drawX = Math.round(this.state.x - this.state.drawOffsetX * this.renderScale);
         const drawY = Math.round(this.state.y - this.state.drawOffsetY * this.renderScale);
         return {
             x: drawX + spriteDrawWidth / 2,
             y: drawY + spriteDrawHeight / 2,
             topY: drawY // Provide top Y for positioning things above
         };
    }
}

export default Player;