// New file: Defines the core state of a player

import { SPRITES } from 'config/sprites.js';

// Physics Constants (keep central for reference)
export const PLAYER_PHYSICS = {
    GRAVITY: 350, // pixels/sec^2
    THRUST_FORCE: 700, // pixels/sec^2
    MAX_VERTICAL_SPEED: 300, // pixels/sec
    VERTICAL_DRAG_FACTOR: 0.5, // Higher = more drag
    MAX_TILT_ANGLE: Math.PI / 2.5, // ~72 degrees - Increased from PI / 9
    TILT_SPEED: 6, // How quickly the sprite tilts
    PLAYER_SPEED: 150, // Pixels per second (horizontal)
    GROUND_FRICTION: 0.8, // Multiplier applied to vx when on ground
    SPARK_EMIT_RATE: 5, // Sparks per physics frame when scraping
    SMOKE_EMIT_RATE: 1, // Smoke puffs per physics frame when scraping
};

export const INTERPOLATION_SNAP_THRESHOLD = 0.5; // Pixels

export class PlayerState {
    constructor(id, x, y, vehicleType, isLocalPlayer) {
        this.id = id;
        this.isLocalPlayer = isLocalPlayer;

        // Core Position & Movement
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.ay = 0;
        this.rotation = 0; // Radians

        // Appearance & Input Status
        this.vehicleType = vehicleType;
        this.facingDirection = -1; // -1 left, 1 right
        this.isThrusting = false;
        this.isOnGround = false; // New flag for ground contact

        // Network Synchronization (for remote players)
        this.serverX = x;
        this.serverY = y;
        this.serverRotation = 0;
        this.serverFacingDirection = -1;
        this.serverIsOnGround = false; // Sync ground state
        this.lastServerUpdateTime = 0;

        // Flags
        this.isMarkedForRemoval = false;

        // Derived properties (calculated based on vehicleType)
        this.width = 0;
        this.height = 0;
        this.drawOffsetX = 0;
        this.drawOffsetY = 0;
        this.currentVehicle = null; // Reference to the sprite frame config

        this.updateVehicleProperties(); // Initialize derived properties
    }

    updateVehicleProperties() {
        const spriteConfig = SPRITES.vehicles;
        if (this.vehicleType < 0 || this.vehicleType >= spriteConfig.frames.length) {
             console.error(`Invalid vehicleType ${this.vehicleType} for player ${this.id}. Defaulting to 0.`);
             this.vehicleType = 0;
        }
        this.currentVehicle = spriteConfig.frames[this.vehicleType];
        if (!this.currentVehicle) {
             console.error(`Could not find frame data for vehicle type ${this.vehicleType}. Reverting to 0.`);
             this.vehicleType = 0;
             this.currentVehicle = spriteConfig.frames[0];
        }

        this.width = this.currentVehicle.hitbox?.width ?? this.currentVehicle.width;
        this.height = this.currentVehicle.hitbox?.height ?? this.currentVehicle.height;
        this.drawOffsetX = this.currentVehicle.hitbox?.offsetX ?? 0;
        this.drawOffsetY = this.currentVehicle.hitbox?.offsetY ?? 0;
    }

    setVehicle(vehicleTypeIndex) {
        if (vehicleTypeIndex >= 0 && vehicleTypeIndex < SPRITES.vehicles.frames.length) {
            this.vehicleType = vehicleTypeIndex;
            this.updateVehicleProperties();
            console.log(`Player ${this.id} vehicle state changed to type ${this.vehicleType}`);
        } else {
            console.warn(`Invalid vehicleTypeIndex: ${vehicleTypeIndex} for player ${this.id}`);
        }
    }

    getPresenceData() {
        return {
            x: this.x,
            y: this.y,
            vehicleType: this.vehicleType,
            facingDirection: this.facingDirection,
            rotation: this.rotation,
            isOnGround: this.isOnGround,
            // Optionally include velocity if needed for prediction/effects
            // vx: this.vx,
            // vy: this.vy,
        };
    }
}