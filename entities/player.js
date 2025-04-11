import { SPRITES } from 'config/sprites.js';

const PLAYER_SPEED = 150; // Pixels per second
const INTERPOLATION_SNAP_THRESHOLD = 0.5; // Pixels - distance at which remote player snaps to server position

class Player {
    constructor(id, x, y, vehicleType, isLocalPlayer, assets, ctx, renderScale = 1) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.vx = 0; // Velocity x
        this.vy = 0; // Velocity y
        this.vehicleType = vehicleType;
        this.isLocalPlayer = isLocalPlayer;
        this.assets = assets; // Reference to loaded image assets
        this.ctx = ctx;
        this.renderScale = renderScale;
        this.isMarkedForRemoval = false;

        // Track facing direction
        this.facingDirection = -1; // -1 for left, 1 for right (default left based on spritesheet)

        // Interpolation state for remote players
        this.serverX = x;
        this.serverY = y;
        this.lastServerUpdateTime = 0;
        // Track server facing direction
        this.serverFacingDirection = this.facingDirection;

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
        let targetVY = 0;

        if (inputState.left) {
            targetVX = -PLAYER_SPEED;
        } else if (inputState.right) {
            targetVX = PLAYER_SPEED;
        }

        if (inputState.up) {
            targetVY = -PLAYER_SPEED;
        } else if (inputState.down) {
            targetVY = PLAYER_SPEED;
        }

        this.vx = targetVX;
        this.vy = targetVY;

        // Update facing direction based on horizontal velocity
        if (this.vx > 0) {
            this.facingDirection = 1; // Right
        } else if (this.vx < 0) {
            this.facingDirection = -1; // Left
        }
        // If vx is 0, keep the current facing direction
    }

    update(deltaTime) {
        // Update position based on velocity (for local player)
        if (this.isLocalPlayer) {
            this.x += this.vx * deltaTime;
            this.y += this.vy * deltaTime;
        }
        // Remote players' positions are updated via interpolation
    }

    // Update state based on data received from the server (for remote players)
    updateFromServer(serverState, timestamp) {
        if (this.isLocalPlayer) return; // Local player is authoritative locally

        // Store the latest known server position and time
        this.serverX = serverState.x;
        this.serverY = serverState.y;
        this.lastServerUpdateTime = timestamp;

        // Update server facing direction
        if (serverState.facingDirection !== undefined) {
            this.serverFacingDirection = serverState.facingDirection;
        }

        // Optionally update other state like vehicle type immediately
        if (serverState.vehicleType !== undefined && serverState.vehicleType !== this.vehicleType) {
            this.setVehicle(serverState.vehicleType);
        }

        // console.log(`Player ${this.id} received server update: ${this.serverX}, ${this.serverY}`);
    }

    // Smoothly move towards the server position (for remote players)
    interpolate(factor) {
        if (this.isLocalPlayer) return;

        // Simple linear interpolation (lerp)
        this.x += (this.serverX - this.x) * factor;
        this.y += (this.serverY - this.y) * factor;

        // Update facing direction based on server data
        // We update facing direction immediately from server data, no need to interpolate usually.
        // However, if serverFacingDirection is different, update local facingDirection.
        if (this.facingDirection !== this.serverFacingDirection) {
            this.facingDirection = this.serverFacingDirection;
        }

        // Snap if very close to avoid endless small adjustments
        if (Math.abs(this.serverX - this.x) < INTERPOLATION_SNAP_THRESHOLD) this.x = this.serverX;
        if (Math.abs(this.serverY - this.y) < INTERPOLATION_SNAP_THRESHOLD) this.y = this.serverY;
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
            // Adjust placeholder size based on render scale
            const placeholderSize = 32 * this.renderScale;
            this.ctx.fillRect(this.x, this.y, placeholderSize, placeholderSize);
            return;
        }

        const drawWidth = this.currentVehicle.width * this.renderScale;
        const drawHeight = this.currentVehicle.height * this.renderScale;
        // Calculate position where top-left of *sprite frame* should be drawn
        const drawX = Math.round(this.x - this.drawOffsetX * this.renderScale);
        const drawY = Math.round(this.y - this.drawOffsetY * this.renderScale);

        // Add sprite flipping logic
        this.ctx.save(); // Save the current context state

        try {
            if (this.facingDirection === 1) { // Facing right
                // Translate to the horizontal center of the *drawn image*, scale, translate back
                const centerX = drawX + drawWidth / 2;
                this.ctx.translate(centerX, 0);
                this.ctx.scale(-1, 1); // Flip horizontally
                this.ctx.translate(-centerX, 0);
            }
            // If facingDirection is -1 (left), no transformation is needed as sprite faces left by default

            // Draw the image
            this.ctx.drawImage(
                this.assets.vehicles, // The spritesheet image
                this.currentVehicle.x, this.currentVehicle.y, // Source x, y in the spritesheet
                this.currentVehicle.width, this.currentVehicle.height, // Source width, height
                drawX, // Destination x (top-left of sprite frame)
                drawY, // Destination y (top-left of sprite frame)
                drawWidth, // Destination width
                drawHeight // Destination height
            );
        } catch (e) {
            console.error("Error during player draw:", e);
        } finally {
            this.ctx.restore(); // Restore the context regardless of facing direction or errors
        }

        // Optional: Draw hitbox for debugging (adjust position based on offsets)
        // this.ctx.strokeStyle = this.isLocalPlayer ? 'blue' : 'red';
        // this.ctx.lineWidth = 1;
        // // Draw the gameplay hitbox rectangle
        // this.ctx.strokeRect(
        //     Math.round(this.x), // Hitbox top-left x
        //     Math.round(this.y), // Hitbox top-left y
        //     this.width * this.renderScale, // Hitbox width
        //     this.height * this.renderScale // Hitbox height
        // );
        // Optional: Draw the visual sprite bounds
        // this.ctx.strokeStyle = 'lime';
        // this.ctx.strokeRect(drawX, drawY, drawWidth, drawHeight);
    }
}

export default Player;