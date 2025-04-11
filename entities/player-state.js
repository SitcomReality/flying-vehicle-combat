import { SPRITES } from 'config/sprites.js';
import { VEHICLE_TYPES, getVehicleConfig } from './vehicles/vehicle-types.js'; // Import new vehicle types

// --- Constants that likely remain global or part of base physics ---
// These could potentially move into VEHICLE_TYPES' BASE_PLAYER_PHYSICS if needed,
// but keeping them separate might be okay for now.
export const GLOBAL_PHYSICS = {
    GRAVITY: 350, // pixels/sec^2
    MAX_VERTICAL_SPEED: 300, // pixels/sec
    VERTICAL_DRAG_FACTOR: 0.5,
    MAX_TILT_ANGLE: Math.PI / 2.5,
    TILT_SPEED: 6,
    AIR_FRICTION_FACTOR: 0.3,
    GROUND_FRICTION_FACTOR: 1.5,
    SPARK_EMIT_RATE: 5,
    SMOKE_EMIT_RATE: 1,
    MAX_CHARGE_LEVEL: 100,
    CHARGE_RATE: 50,
    PROJECTILE_BASE_SPEED: 400,
    PROJECTILE_SPEED_SCALE: 3,
    PROJECTILE_GRAVITY_FACTOR: 0.5,
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
        this.vehicleType = vehicleType; // Will be validated in updateVehicleProperties
        this.facingDirection = -1;
        this.targetFacingDirection = -1;
        this.visualFacingDirection = -1;
        this.flipAnimationStart = 0;
        this.isThrusting = false;
        this.isMovingLeft = false;
        this.isMovingRight = false;
        this.isOnGround = false;

        // Firing Mechanics
        this.isCharging = false;
        this.chargeLevel = 0;
        this.wantsToFire = false;

        // --- NEW Stats ---
        this.health = 100; // Default, will be set by updateVehicleProperties
        this.maxHealth = 100;
        this.fuel = 100;     // Default, will be set by updateVehicleProperties
        this.maxFuel = 100;
        // Vehicle-specific physics properties (set by updateVehicleProperties)
        this.fuelRegenRate = 0;
        this.fuelConsumeRate = 0;
        this.thrustForce = 0;
        this.horizontalAcceleration = 0;
        this.maxHorizontalSpeed = 0;
        // Reference other potential physics overrides if needed
        this.gravity = GLOBAL_PHYSICS.GRAVITY;
        this.verticalDragFactor = GLOBAL_PHYSICS.VERTICAL_DRAG_FACTOR;
        this.airFrictionFactor = GLOBAL_PHYSICS.AIR_FRICTION_FACTOR;
        this.groundFrictionFactor = GLOBAL_PHYSICS.GROUND_FRICTION_FACTOR;
        // --- End NEW Stats ---

        // Network Synchronization
        this.serverX = x;
        this.serverY = y;
        this.serverRotation = 0;
        this.serverFacingDirection = -1;
        this.serverIsOnGround = false;
        this.serverHealth = 100; // Track server health/fuel
        this.serverFuel = 100;
        this.lastServerUpdateTime = 0;

        // Flags
        this.isMarkedForRemoval = false;

        // Derived properties (calculated based on vehicleType)
        this.width = 0;
        this.height = 0;
        this.drawOffsetX = 0;
        this.drawOffsetY = 0;
        this.currentVehicle = null; // Reference to the sprite frame config

        this.updateVehicleProperties(); // Initialize derived properties and stats

        // Initialize directions consistently
        const initialDirection = -1;
        this.facingDirection = initialDirection;
        this.targetFacingDirection = initialDirection;
        this.visualFacingDirection = initialDirection;
        this.serverFacingDirection = initialDirection;
    }

    updateVehicleProperties() {
        // 1. Get Sprite Config
        const spriteConfig = SPRITES.vehicles;
        if (this.vehicleType < 0 || this.vehicleType >= spriteConfig.frames.length) {
            console.warn(`Invalid vehicleType ${this.vehicleType} for player ${this.id}. Defaulting to 0.`);
            this.vehicleType = 0;
        }
        this.currentVehicle = spriteConfig.frames[this.vehicleType];
        if (!this.currentVehicle) {
            console.error(`Could not find frame data for vehicle type ${this.vehicleType}. Reverting to 0.`);
            this.vehicleType = 0;
            this.currentVehicle = spriteConfig.frames[0];
        }

        // 2. Set Sprite Dimensions/Offsets
        this.width = this.currentVehicle.hitbox?.width ?? this.currentVehicle.width;
        this.height = this.currentVehicle.hitbox?.height ?? this.currentVehicle.height;
        this.drawOffsetX = this.currentVehicle.hitbox?.offsetX ?? 0;
        this.drawOffsetY = this.currentVehicle.hitbox?.offsetY ?? 0;

        // 3. Get Vehicle Stats Config
        const vehicleStats = getVehicleConfig(this.vehicleType);

        // 4. Set Stats from Config
        this.maxHealth = vehicleStats.maxHealth;
        this.maxFuel = vehicleStats.maxFuel;
        this.fuelRegenRate = vehicleStats.fuelRegenRate;
        this.fuelConsumeRate = vehicleStats.fuelConsumeRate;
        this.thrustForce = vehicleStats.thrustForce;
        this.horizontalAcceleration = vehicleStats.horizontalAcceleration;
        this.maxHorizontalSpeed = vehicleStats.maxHorizontalSpeed;
        this.gravity = vehicleStats.GRAVITY ?? GLOBAL_PHYSICS.GRAVITY; // Allow overrides
        this.verticalDragFactor = vehicleStats.VERTICAL_DRAG_FACTOR ?? GLOBAL_PHYSICS.VERTICAL_DRAG_FACTOR;
        this.airFrictionFactor = vehicleStats.AIR_FRICTION_FACTOR ?? GLOBAL_PHYSICS.AIR_FRICTION_FACTOR;
        this.groundFrictionFactor = vehicleStats.GROUND_FRICTION_FACTOR ?? GLOBAL_PHYSICS.GROUND_FRICTION_FACTOR;

        // 5. Initialize current health/fuel (or reset if called mid-game)
        // Only fully reset if health/fuel somehow became invalid. Otherwise, keep current values.
        if (this.health > this.maxHealth || this.health <= 0) {
             this.health = this.maxHealth;
        }
        if (this.fuel > this.maxFuel || this.fuel < 0) {
             this.fuel = this.maxFuel;
        }
         // Ensure fuel doesn't exceed new max if switching to a lower capacity vehicle
         this.fuel = Math.min(this.fuel, this.maxFuel);
         // Optionally fully heal/refuel on vehicle change - requires game design decision
         // this.health = this.maxHealth;
         // this.fuel = this.maxFuel;
    }

    setVehicle(vehicleTypeIndex) {
        if (vehicleTypeIndex >= 0 && vehicleTypeIndex < SPRITES.vehicles.frames.length) {
            const oldType = this.vehicleType;
            if (oldType !== vehicleTypeIndex) {
                 this.vehicleType = vehicleTypeIndex;
                 this.updateVehicleProperties(); // This will update stats and dimensions
                 console.log(`Player ${this.id} vehicle state changed from type ${oldType} to ${this.vehicleType}`);
                 // Potentially trigger visual effect for vehicle change here
            }
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
            health: this.health, // Sync current health
            fuel: this.fuel,     // Sync current fuel
            // maxHealth/maxFuel might be needed if they change dynamically later
            // maxHealth: this.maxHealth,
            // maxFuel: this.maxFuel,
        };
    }
}