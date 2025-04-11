import { SPRITES } from 'config/sprites.js';

// Physics Constants (keep central for reference)
export const PLAYER_PHYSICS = {
    GRAVITY: 350, // pixels/sec^2
    THRUST_FORCE: 700, // pixels/sec^2
    MAX_VERTICAL_SPEED: 300, // pixels/sec
    VERTICAL_DRAG_FACTOR: 0.5, // Higher = more drag when airborne
    MAX_TILT_ANGLE: Math.PI / 2.5, // ~72 degrees - Increased from PI / 9
    TILT_SPEED: 6, // How quickly the sprite tilts

    // Horizontal Movement (NEW/Updated)
    HORIZONTAL_ACCELERATION: 800, // pixels/sec^2
    MAX_HORIZONTAL_SPEED: 250, // pixels/sec
    AIR_FRICTION_FACTOR: 0.3, // Factor for horizontal drag when airborne (lower = less drag)
    GROUND_FRICTION_FACTOR: 1.5, // Factor for horizontal friction when grounded (higher = more friction)

    SPARK_EMIT_RATE: 5, // Sparks per physics frame when scraping
    SMOKE_EMIT_RATE: 1, // Smoke puffs per physics frame when scraping
    MAX_CHARGE_LEVEL: 100, // Max charge value
    CHARGE_RATE: 50, // Units per second
    PROJECTILE_BASE_SPEED: 400, // Minimum projectile speed
    PROJECTILE_SPEED_SCALE: 3, // Multiplier for charge level -> added speed
    PROJECTILE_GRAVITY_FACTOR: 0.5, // How much gravity affects projectiles (0=none, 1=same as player)
};

export const INTERPOLATION_SNAP_THRESHOLD = 0.5; // Pixels
export const FLIP_ANIMATION_DURATION = 250; // Milliseconds for the direction flip visual delay

export class PlayerState {
    constructor(id, x, y, vehicleType, isLocalPlayer) {
        this.id = id;
        this.isLocalPlayer = isLocalPlayer;

        // Core Position & Movement
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.ax = 0; // Horizontal acceleration
        this.ay = 0; // Vertical acceleration
        this.rotation = 0; // Radians

        // Appearance & Input Status
        this.vehicleType = vehicleType;
        this.facingDirection = -1; // Actual logical direction (-1 left, 1 right)
        this.targetFacingDirection = -1; // The direction the player intends to face based on input/velocity
        this.visualFacingDirection = -1; // The direction currently rendered (changes after animation delay)
        this.flipAnimationStart = 0; // Timestamp when the current flip animation started, 0 if not flipping
        this.isThrusting = false; // Vertical thrust (up key)
        this.isMovingLeft = false; // Horizontal thrust (left key)
        this.isMovingRight = false; // Horizontal thrust (right key)
        this.isOnGround = false;

        // Firing Mechanics
        this.isCharging = false;
        this.chargeLevel = 0; // Current charge amount (0 to MAX_CHARGE_LEVEL)
        this.wantsToFire = false; // Flag set when charge key is released

        // Network Synchronization (for remote players)
        this.serverX = x;
        this.serverY = y;
        this.serverRotation = 0;
        this.serverFacingDirection = -1; // Last known server *logical* direction
        this.serverIsOnGround = false;
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

        // Initialize directions consistently
        const initialDirection = -1; // Default starting direction
        this.facingDirection = initialDirection;
        this.targetFacingDirection = initialDirection;
        this.visualFacingDirection = initialDirection;
        this.serverFacingDirection = initialDirection;
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
            facingDirection: this.facingDirection, // Send the actual logical direction
            rotation: this.rotation,
            isOnGround: this.isOnGround,
            // Note: Firing state is transient, handled by events, not presence
        };
    }
}