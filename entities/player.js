import { PlayerState, FLIP_ANIMATION_DURATION, PLAYER_PHYSICS } from './player-state.js';
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

        // Add reference for firing projectiles (will be set externally)
        this.projectileManager = null;
        this.networkManager = null; // Needed to send fire events

        console.log(`Player ${id} instance created. Local: ${isLocalPlayer}, Vehicle: ${this.state.vehicleType}, Pos: ${this.state.x.toFixed(0)},${this.state.y.toFixed(0)}, Scale: ${renderScale}`);
    }

    // Set references to managers needed for actions
    setManagers(projectileManager, networkManager) {
        this.projectileManager = projectileManager;
        this.networkManager = networkManager;
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
        // Determine if a flip is *needed* based on the target vs current *logical* direction
        const needsFlip = state.targetFacingDirection !== state.facingDirection;

        if (state.flipAnimationStart > 0) { // Currently flipping
            const elapsed = currentTime - state.flipAnimationStart;

            if (elapsed >= FLIP_ANIMATION_DURATION) {
                // Animation finished. Update both logical and visual direction.
                state.facingDirection = state.targetFacingDirection;
                state.visualFacingDirection = state.targetFacingDirection;
                state.flipAnimationStart = 0; // End animation state
                // Check if another flip is needed immediately (e.g., rapid input)
                if (state.targetFacingDirection !== state.facingDirection) {
                     // Start a new flip right away
                     state.flipAnimationStart = currentTime;
                     // Visual direction stays as the *newly updated* facingDirection for this frame
                     // before instantly becoming the *old* direction again for the next frame's animation start.
                     // This prevents a 1-frame flicker.
                     state.visualFacingDirection = state.facingDirection;
                }
            }
            // else: Animation is still in progress.
            // visualFacingDirection remains the OLD direction.
            // logical facingDirection also remains the OLD direction.
            // targetFacingDirection might have changed, but we finish the current flip first.

        } else if (needsFlip) { // Not currently flipping, but need to start one.
            // Start a new flip animation
            state.flipAnimationStart = currentTime;
            // IMPORTANT: Keep visual direction matching the current (soon to be old) logical direction.
            // The logical facingDirection itself is NOT updated yet.
            state.visualFacingDirection = state.facingDirection;

        } else {
            // Not flipping and directions already match. Ensure visual consistency.
            state.visualFacingDirection = state.facingDirection;
            state.flipAnimationStart = 0; // Ensure animation state is reset if somehow stuck
        }
    }

    // --- Update Cycle ---
    update(deltaTime, groundLevelY, particleSystem, currentTime) {
        if (this.state.isMarkedForRemoval) return;

        // Update animations (like the flip) based on current time FIRST
        this.updateAnimation(currentTime);

        // Handle Charging Logic for Local Player
        if (this.state.isLocalPlayer) {
            if (this.state.isCharging) {
                this.state.chargeLevel = Math.min(
                    this.state.chargeLevel + PLAYER_PHYSICS.CHARGE_RATE * deltaTime,
                    PLAYER_PHYSICS.MAX_CHARGE_LEVEL
                );
            }

            // Handle Firing Logic
            if (this.state.wantsToFire && this.projectileManager && this.networkManager) {
                 this.fireProjectile();
                 this.state.wantsToFire = false; // Consume the fire request
                 this.state.chargeLevel = 0; // Reset charge after firing
            } else if (!this.state.isCharging) {
                // Decay charge level if not charging and didn't just fire
                // this.state.chargeLevel = Math.max(0, this.state.chargeLevel - PLAYER_PHYSICS.CHARGE_RATE * deltaTime * 2); // Optional decay
                 this.state.chargeLevel = 0; // Or just reset if not charging
            }
        }

        // --- Physics and Interpolation ---
        if (this.state.isLocalPlayer) {
            // Local player calculates physics based on input
            updatePlayerPhysics(this.state, deltaTime, this.gameBounds, this.renderScale, groundLevelY, particleSystem);
        } else {
            // Remote players interpolate towards server state
            interpolatePlayerState(this.state, REMOTE_PLAYER_INTERPOLATION_FACTOR);
            // Apply ground effects visually based on server state for remote players
            if (this.state.serverIsOnGround && particleSystem) {
                 const spriteDrawWidth = this.state.currentVehicle.width * this.renderScale;
                 const contactX = (this.state.x - this.state.drawOffsetX * this.renderScale + spriteDrawWidth / 2)
                                + (this.state.visualFacingDirection === 1 ? -spriteDrawWidth * 0.3 : spriteDrawWidth * 0.3); // Use visualFacingDirection
                 const contactY = groundLevelY - 2;
                 const baseSparkVX = -80; // Base effect velocity
                 const baseSmokeVX = -30;
                 particleSystem.emitSparks(contactX, contactY, 1, baseSparkVX);
                 particleSystem.emitSmoke(contactX, contactY, 1, baseSmokeVX);
            }
        }
    }

    // --- Firing Logic ---
    fireProjectile() {
        const state = this.state;
        if (!this.projectileManager || !this.networkManager || state.chargeLevel <= 0) {
            // console.log("Cannot fire: No manager, network, or charge.");
            return;
        }

        // Calculate projectile initial state
        const noseOffsetFactor = 0.5; // How far from the center the projectile starts (0=center, 0.5=edge)
        const spriteDrawWidth = state.currentVehicle.width * this.renderScale;
        const startX = this.getVisualCenter().x + (state.visualFacingDirection * spriteDrawWidth * noseOffsetFactor);
        const startY = this.getVisualCenter().y; // Start from vertical center

        const chargeRatio = state.chargeLevel / PLAYER_PHYSICS.MAX_CHARGE_LEVEL;
        const speed = PLAYER_PHYSICS.PROJECTILE_BASE_SPEED + (PLAYER_PHYSICS.PROJECTILE_SPEED_SCALE * state.chargeLevel);

        // Base velocity based on direction and speed
        let vx = state.visualFacingDirection * speed;
        let vy = 0;

        // Optional: Add slight angle based on ship tilt? (Keep simple for now)
        // if (Math.abs(state.rotation) > 0.05) {
        //    const angle = state.rotation + (state.visualFacingDirection === 1 ? 0 : Math.PI); // Adjust angle based on facing
        //    vx = Math.cos(angle) * speed;
        //    vy = Math.sin(angle) * speed;
        // }

        // Add player's current velocity to the projectile (inherited velocity) - Optional but adds realism
        vx += state.vx * 0.5; // Inherit half of player's velocity
        vy += state.vy * 0.5;

        // Create projectile locally AND get data to broadcast
        const projectileData = this.projectileManager.createAndGetData(
            state.id,
            startX, startY,
            vx, vy,
            '#FFD700' // Gold color for projectile
        );

        // Broadcast the fire event to other clients
        this.networkManager.sendEvent({
            type: 'fireProjectile',
            projectile: projectileData,
            echo: false // Don't send back to self
        });

        // console.log(`Player ${state.id} fired projectile ${projectileData.id} with charge ${state.chargeLevel.toFixed(0)}`);
    }

    // --- Rendering ---
    draw() {
        if (this.state.isMarkedForRemoval) return;
        // drawPlayer uses visualFacingDirection implicitly via playerState for the scale transform
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