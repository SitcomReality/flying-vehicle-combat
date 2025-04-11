import { SPRITES } from 'config/sprites.js';

const PLAYER_SPEED = 150; // Pixels per second (horizontal)
const INTERPOLATION_SNAP_THRESHOLD = 0.5; // Pixels - distance at which remote player snaps to server position

// Physics Constants
const GRAVITY = 350; // pixels/sec^2 - Pulls the player down
const THRUST_FORCE = 700; // pixels/sec^2 - Upward force from input
const MAX_VERTICAL_SPEED = 300; // pixels/sec - Terminal velocity / max thrust speed
const VERTICAL_DRAG_FACTOR = 0.5; // Reduces vertical speed over time (higher = more drag)
const MAX_TILT_ANGLE = Math.PI / 9; // Max rotation in radians (~20 degrees)
const TILT_SPEED = 6; // How quickly the sprite tilts

class Player {
    constructor(id, x, y, vehicleType, isLocalPlayer, assets, ctx, renderScale = 1, gameWidth, gameHeight) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.vx = 0; // Velocity x
        this.vy = 0; // Velocity y
        this.ay = 0; // Acceleration y
        this.rotation = 0; // Current rotation in radians
        this.vehicleType = vehicleType;
        this.isLocalPlayer = isLocalPlayer;
        this.assets = assets; // Reference to loaded image assets
        this.ctx = ctx;
        this.renderScale = renderScale;
        this.isMarkedForRemoval = false;
        this.gameWidth = gameWidth;
        this.gameHeight = gameHeight;

        // Track facing direction (horizontal)
        this.facingDirection = -1; // -1 for left, 1 for right (default left based on spritesheet)
        this.isThrusting = false; // Flag for applying upward thrust

        // Interpolation state for remote players
        this.serverX = x;
        this.serverY = y;
        this.serverRotation = 0;
        this.lastServerUpdateTime = 0;
        this.serverFacingDirection = this.facingDirection; // Track server facing direction

        // Get sprite config
        this.spriteConfig = SPRITES.vehicles;
        this.currentVehicle = this.spriteConfig.frames[this.vehicleType];
        if (!this.currentVehicle) {
            console.error(`Invalid vehicleType ${vehicleType} resulted in undefined currentVehicle for player ${id}. Defaulting to 0.`);
            this.vehicleType = 0;
            this.currentVehicle = this.spriteConfig.frames[0];
        }

        // Dimensions based on sprite config (using specified hitbox logic)
        this.width = this.currentVehicle.hitbox?.width ?? this.currentVehicle.width;
        this.height = this.currentVehicle.hitbox?.height ?? this.currentVehicle.height;
        // Center hitbox offset if provided
        this.drawOffsetY = this.currentVehicle.hitbox?.offsetY ?? 0;
        this.drawOffsetX = this.currentVehicle.hitbox?.offsetX ?? 0;

        console.log(`Player ${id} created. Local: ${isLocalPlayer}, Vehicle: ${vehicleType}, Pos: ${x.toFixed(0)},${y.toFixed(0)}, Size: ${this.width}x${this.height}, Scale: ${renderScale}`);
    }

    handleInput(inputState) {
        if (!this.isLocalPlayer) return;

        let targetVX = 0;
        // Horizontal movement
        if (inputState.left) {
            targetVX = -PLAYER_SPEED;
        } else if (inputState.right) {
            targetVX = PLAYER_SPEED;
        }
        this.vx = targetVX;

        // Vertical thrust
        this.isThrusting = inputState.up;
        // Note: 'down' input currently does nothing against gravity

        // Update facing direction based on horizontal velocity
        if (this.vx > 0) {
            this.facingDirection = 1; // Right
        } else if (this.vx < 0) {
            this.facingDirection = -1; // Left
        }
        // If vx is 0, keep the current facing direction
    }

    update(deltaTime) {
        // --- Physics Update (Local Player Authoritative) ---
        if (this.isLocalPlayer) {
            // 1. Calculate Acceleration
            this.ay = GRAVITY; // Start with gravity
            if (this.isThrusting) {
                this.ay -= THRUST_FORCE; // Apply upward thrust
            }
            // Apply vertical drag (acts against current velocity)
            // Force = -velocity * drag_coefficient
            const dragForce = -this.vy * VERTICAL_DRAG_FACTOR;
            this.ay += dragForce; // Add drag acceleration (mass assumed 1)

            // 2. Update Velocity
            this.vy += this.ay * deltaTime;
            // Clamp vertical speed
            this.vy = Math.max(-MAX_VERTICAL_SPEED, Math.min(MAX_VERTICAL_SPEED, this.vy));

             // Reset thrust flag after applying forces
            // this.isThrusting = false; // Keep based on input state

            // 3. Update Position
            this.x += this.vx * deltaTime;
            this.y += this.vy * deltaTime;

            // 4. Clamping Position (Boundary Checks)
            const spriteDrawWidth = this.currentVehicle.width * this.renderScale;
            const spriteDrawHeight = this.currentVehicle.height * this.renderScale;
            const effectiveLeftBound = this.drawOffsetX * this.renderScale;
            const effectiveRightBound = this.gameWidth - (spriteDrawWidth - this.drawOffsetX * this.renderScale);
            const effectiveTopBound = this.drawOffsetY * this.renderScale;
            const effectiveBottomBound = this.gameHeight - (spriteDrawHeight - this.drawOffsetY * this.renderScale);

            // Clamp X
            if (this.x < effectiveLeftBound) {
                this.x = effectiveLeftBound;
                if (this.vx < 0) this.vx = 0;
            } else if (this.x > effectiveRightBound) {
                this.x = effectiveRightBound;
                if (this.vx > 0) this.vx = 0;
            }
            // Clamp Y and stop velocity if hitting boundary
            if (this.y < effectiveTopBound) {
                this.y = effectiveTopBound;
                if (this.vy < 0) this.vy = 0; // Stop upward movement at ceiling
            } else if (this.y > effectiveBottomBound) {
                this.y = effectiveBottomBound;
                if (this.vy > 0) this.vy = 0; // Stop downward movement at floor
            }

            // 5. Calculate Target Rotation based on Vertical Velocity
            // Normalize vy to [-1, 1] range based on MAX_VERTICAL_SPEED
            const normalizedVy = Math.max(-1, Math.min(1, this.vy / MAX_VERTICAL_SPEED));
            // Target rotation is proportional to normalizedVy, up to MAX_TILT_ANGLE
            // Negative vy (moving up) means positive (nose up) rotation
            const targetRotation = -normalizedVy * MAX_TILT_ANGLE;

            // 6. Smoothly Interpolate Rotation
            // Lerp rotation towards the target rotation
            this.rotation += (targetRotation - this.rotation) * TILT_SPEED * deltaTime;

        } else {
            // Remote players are updated via interpolation towards server state
             // Basic update (mainly for non-physics related things if any)
             // No local physics calculations for remote players
        }
    }

    // Update state based on data received from the server (for remote players)
    updateFromServer(serverState, timestamp) {
        if (this.isLocalPlayer) return; // Local player is authoritative locally

        // Store the latest known server position and time
        this.serverX = serverState.x;
        this.serverY = serverState.y;
        this.serverRotation = serverState.rotation ?? 0; // Get rotation from server
        this.lastServerUpdateTime = timestamp;

        // Update server facing direction
        if (serverState.facingDirection !== undefined) {
            this.serverFacingDirection = serverState.facingDirection;
        }

        // Optionally update other state like vehicle type immediately
        if (serverState.vehicleType !== undefined && serverState.vehicleType !== this.vehicleType) {
            this.setVehicle(serverState.vehicleType);
        }
    }

    // Smoothly move towards the server position (for remote players)
    interpolate(factor) {
        if (this.isLocalPlayer) return;

        // Simple linear interpolation (lerp) for position
        this.x += (this.serverX - this.x) * factor;
        this.y += (this.serverY - this.y) * factor;

        // Interpolate rotation
        // Use angular interpolation (lerp angle) if needed for large differences,
        // but simple lerp is often fine for small, frequent updates.
         this.rotation += (this.serverRotation - this.rotation) * factor;


        // Update facing direction based on server data
        if (this.facingDirection !== this.serverFacingDirection) {
            this.facingDirection = this.serverFacingDirection;
        }

        // Snap if very close to avoid endless small adjustments
        if (Math.abs(this.serverX - this.x) < INTERPOLATION_SNAP_THRESHOLD) this.x = this.serverX;
        if (Math.abs(this.serverY - this.y) < INTERPOLATION_SNAP_THRESHOLD) this.y = this.serverY;
        // No snap for rotation usually needed, lerp handles it.
    }

    setVehicle(vehicleTypeIndex) {
        if (vehicleTypeIndex >= 0 && vehicleTypeIndex < this.spriteConfig.frames.length) {
            this.vehicleType = vehicleTypeIndex;
            this.currentVehicle = this.spriteConfig.frames[this.vehicleType];

            if (!this.currentVehicle) {
                console.error(`Failed to set vehicle: Invalid vehicle data for index ${vehicleTypeIndex}. Reverting to 0.`);
                this.vehicleType = 0;
                this.currentVehicle = this.spriteConfig.frames[0];
            }

            // Update dimensions based on the new vehicle's sprite config
            this.width = this.currentVehicle.hitbox?.width ?? this.currentVehicle.width;
            this.height = this.currentVehicle.hitbox?.height ?? this.currentVehicle.height;
            this.drawOffsetY = this.currentVehicle.hitbox?.offsetY ?? 0;
            this.drawOffsetX = this.currentVehicle.hitbox?.offsetX ?? 0;

            console.log(`Player ${this.id} changed vehicle to type ${this.vehicleType}`);
        } else {
            console.warn(`Invalid vehicleTypeIndex: ${vehicleTypeIndex} for player ${this.id}`);
        }
    }

    draw() {
        if (this.isMarkedForRemoval) return; // Don't draw if marked for removal

        if (!this.assets.vehicles || !this.currentVehicle) {
            console.warn(`Missing assets or currentVehicle for player ${this.id}`);
            // Draw a placeholder if assets aren't ready
            this.ctx.fillStyle = 'purple';
            const placeholderSize = 32 * this.renderScale;
            this.ctx.fillRect(this.x, this.y, placeholderSize, placeholderSize);
            return;
        }

        const spriteDrawWidth = this.currentVehicle.width * this.renderScale;
        const spriteDrawHeight = this.currentVehicle.height * this.renderScale;
        // Calculate position where top-left of *sprite frame* should be drawn
        const drawX = Math.round(this.x - this.drawOffsetX * this.renderScale);
        const drawY = Math.round(this.y - this.drawOffsetY * this.renderScale);

        // Calculate the visual center for rotation and flipping
        const visualCenterX = drawX + spriteDrawWidth / 2;
        const visualCenterY = drawY + spriteDrawHeight / 2;

        this.ctx.save(); // Save the current context state

        try {
            // Apply transformations in correct order: Translate -> Rotate -> Scale -> Translate Back
            this.ctx.translate(visualCenterX, visualCenterY); // Move origin to visual center

            // Apply rotation based on vertical movement
            this.ctx.rotate(this.rotation);

            // Apply horizontal flip if facing right
            if (this.facingDirection === 1) {
                this.ctx.scale(-1, 1); // Flip horizontally
            }

            this.ctx.translate(-visualCenterX, -visualCenterY); // Move origin back

            // Draw the image relative to the original top-left (drawX, drawY)
            // but transformed by the matrix operations above.
            this.ctx.drawImage(
                this.assets.vehicles, // The spritesheet image
                this.currentVehicle.x, this.currentVehicle.y, // Source x, y in the spritesheet
                this.currentVehicle.width, this.currentVehicle.height, // Source width, height
                drawX, // Destination x (top-left of sprite frame before transform)
                drawY, // Destination y (top-left of sprite frame before transform)
                spriteDrawWidth, // Destination width
                spriteDrawHeight // Destination height
            );
        } catch (e) {
            console.error("Error during player draw:", e);
        } finally {
            this.ctx.restore(); // Restore the context regardless of errors
        }

        // Optional: Draw hitbox for debugging
        // this.ctx.strokeStyle = this.isLocalPlayer ? 'blue' : 'red';
        // this.ctx.lineWidth = 1;
        // this.ctx.strokeRect(
        //     Math.round(this.x), Math.round(this.y),
        //     this.width * this.renderScale, this.height * this.renderScale
        // );
         // Optional: Draw visual sprite bounds
         // this.ctx.strokeStyle = 'lime';
         // this.ctx.strokeRect(drawX, drawY, spriteDrawWidth, spriteDrawHeight);
         // Optional: Draw rotation center
         // this.ctx.fillStyle = 'yellow';
         // this.ctx.fillRect(visualCenterX - 1, visualCenterY - 1, 3, 3);
    }
}

export default Player;