import { SPRITES } from 'config/sprites.js';

const PLAYER_SPEED = 150; // Pixels per second

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

        // Interpolation state for remote players
        this.serverX = x;
        this.serverY = y;
        this.lastServerUpdateTime = 0;

        // Get sprite config
        this.spriteConfig = SPRITES.vehicles;
        this.currentVehicle = this.spriteConfig.frames[this.vehicleType];

        // Dimensions based on sprite config (using specified hitbox logic)
        this.width = this.currentVehicle.hitbox?.width ?? this.currentVehicle.width;
        this.height = this.currentVehicle.hitbox?.height ?? this.currentVehicle.height;
        // Center hitbox offset if provided
        this.drawOffsetY = this.currentVehicle.hitbox?.offsetY ?? 0;
        this.drawOffsetX = this.currentVehicle.hitbox?.offsetX ?? 0;


        console.log(`Player ${id} created. Local: ${isLocalPlayer}, Vehicle: ${vehicleType}, Size: ${this.width}x${this.height}`);
    }

    handleInput(inputState) {
        if (!this.isLocalPlayer) return;

        this.vx = 0;
        this.vy = 0;

        if (inputState.left) {
            this.vx = -PLAYER_SPEED;
        } else if (inputState.right) {
            this.vx = PLAYER_SPEED;
        }

        if (inputState.up) {
            this.vy = -PLAYER_SPEED;
        } else if (inputState.down) {
            this.vy = PLAYER_SPEED;
        }
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

         // Snap if very close to avoid endless small adjustments
        if (Math.abs(this.serverX - this.x) < 0.1) this.x = this.serverX;
        if (Math.abs(this.serverY - this.y) < 0.1) this.y = this.serverY;
    }

    setVehicle(vehicleTypeIndex) {
        if (vehicleTypeIndex >= 0 && vehicleTypeIndex < this.spriteConfig.frames.length) {
            this.vehicleType = vehicleTypeIndex;
            this.currentVehicle = this.spriteConfig.frames[this.vehicleType];

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
            this.ctx.fillRect(this.x, this.y, 32 * this.renderScale, 32 * this.renderScale); // Example placeholder size
            return;
        }

        // Use the centralized drawSprite method from the renderer if available,
        // or draw directly on the context. Assuming direct context drawing here.
        this.ctx.drawImage(
            this.assets.vehicles, // The spritesheet image
            this.currentVehicle.x, this.currentVehicle.y, // Source x, y in the spritesheet
            this.currentVehicle.width, this.currentVehicle.height, // Source width, height
            Math.round(this.x - this.drawOffsetX * this.renderScale), // Destination x (accounting for hitbox offset)
            Math.round(this.y - this.drawOffsetY * this.renderScale), // Destination y (accounting for hitbox offset)
            this.currentVehicle.width * this.renderScale, // Destination width
            this.currentVehicle.height * this.renderScale // Destination height
        );

        // Optional: Draw hitbox for debugging
        // this.ctx.strokeStyle = 'red';
        // this.ctx.lineWidth = 1;
        // this.ctx.strokeRect(
        //     Math.round(this.x),
        //     Math.round(this.y),
        //     this.width * this.renderScale,
        //     this.height * this.renderScale
        // );
    }
}

export default Player;