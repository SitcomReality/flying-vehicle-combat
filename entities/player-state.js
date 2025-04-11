import { SPRITES } from 'config/sprites.js';
import { VEHICLE_TYPES, getVehicleConfig } from './vehicles/vehicle-types.js';
import { PlayerLifecycleState } from './player-lifecycle.js';

// --- Constants ---
export const GLOBAL_PHYSICS = {
    GRAVITY: 350,
    MAX_VERTICAL_SPEED: 300,
    VERTICAL_DRAG_FACTOR: 0.5,
    MAX_TILT_ANGLE: Math.PI / 2.5,
    TILT_SPEED: 6,
    AIR_FRICTION_FACTOR: 0.3,
    GROUND_FRICTION_FACTOR: 1.5,
    SPARK_EMIT_RATE: 5,
    SMOKE_EMIT_RATE: 1,
    PROJECTILE_SPEED_SCALE: 3,
    PROJECTILE_GRAVITY_FACTOR: 0.5,
    INVULNERABILITY_DURATION: 1.5, // Default invulnerability from damage
};

export const INTERPOLATION_SNAP_THRESHOLD = 0.5;
export const FLIP_ANIMATION_DURATION = 250;

export class PlayerState {
    constructor(id, x, y, vehicleType, isLocalPlayer) {
        this.id = id;
        this.isLocalPlayer = isLocalPlayer;

        // Core Position & Movement
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.ax = 0;
        this.ay = 0;
        this.rotation = 0;

        // Appearance & Input Status
        this.vehicleType = vehicleType;
        this.facingDirection = -1;
        this.targetFacingDirection = -1;
        this.visualFacingDirection = -1;
        this.flipAnimationStart = 0;
        this.isThrusting = false;
        this.isMovingLeft = false;
        this.isMovingRight = false;
        this.isOnGround = false;
        this.lastGroundDamageTime = 0;

        // Lifecycle State
        this.lifecycleState = PlayerLifecycleState.CONNECTING;

        // Firing Mechanics
        this.isCharging = false;
        this.chargeLevel = 0;
        this.wantsToFire = false;

        // --- Health & Fuel ---
        this.health = 100;
        this.maxHealth = 100;
        this.fuel = 100;
        this.maxFuel = 100;

        // --- Vehicle-specific physics properties ---
        this.fuelRegenRate = 0;
        this.fuelConsumeRate = 0;
        this.thrustForce = 0;
        this.horizontalAcceleration = 0;
        this.maxHorizontalSpeed = 0;
        this.gravity = GLOBAL_PHYSICS.GRAVITY;
        this.verticalDragFactor = GLOBAL_PHYSICS.VERTICAL_DRAG_FACTOR;
        this.airFrictionFactor = GLOBAL_PHYSICS.AIR_FRICTION_FACTOR;
        this.groundFrictionFactor = GLOBAL_PHYSICS.GROUND_FRICTION_FACTOR;

        // --- Vehicle-specific WEAPON properties ---
        this.projectileDamage = 10;
        this.projectileSpeed = 400;
        this.projectileColor = '#FFFF00';
        this.fireRate = 5;
        this.chargeRate = 50;
        this.maxChargeLevel = 100;

        // --- Health System State ---
        this.lastDamageTime = 0;
        this.isInvulnerable = false;

        // --- Powerup State ---
        // Stores active timed powerups: { type: { expiryTime: number, config: object }, ... }
        this.activePowerups = {};

        // Network Synchronization
        this.serverX = x;
        this.serverY = y;
        this.serverRotation = 0;
        this.serverFacingDirection = -1;
        this.serverIsOnGround = false;
        this.serverHealth = 100;
        this.serverFuel = 100;
        this.serverIsInvulnerable = false;
        this.serverLifecycleState = PlayerLifecycleState.CONNECTING;
        this.lastServerUpdateTime = 0;

        // Flags
        this.isMarkedForRemoval = false;

        // Derived properties
        this.width = 0;
        this.height = 0;
        this.drawOffsetX = 0;
        this.drawOffsetY = 0;
        this.currentVehicle = null;

        this.updateVehicleProperties(); // Initialize derived properties and stats

        // Initialize directions consistently
        const initialDirection = -1;
        this.facingDirection = initialDirection;
        this.targetFacingDirection = initialDirection;
        this.visualFacingDirection = initialDirection;
        this.serverFacingDirection = initialDirection;

        // Set initial server state
        this.serverHealth = this.health;
        this.serverFuel = this.fuel;
        this.serverIsInvulnerable = this.isInvulnerable;
        this.serverLifecycleState = this.lifecycleState;
    }

    updateVehicleProperties() {
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

        this.width = this.currentVehicle.hitbox?.width ?? this.currentVehicle.width;
        this.height = this.currentVehicle.hitbox?.height ?? this.currentVehicle.height;
        this.drawOffsetX = this.currentVehicle.hitbox?.offsetX ?? 0;
        this.drawOffsetY = this.currentVehicle.hitbox?.offsetY ?? 0;

        const vehicleStats = getVehicleConfig(this.vehicleType);

        this.maxHealth = vehicleStats.maxHealth;
        this.maxFuel = vehicleStats.maxFuel;
        this.fuelRegenRate = vehicleStats.fuelRegenRate;
        this.fuelConsumeRate = vehicleStats.fuelConsumeRate;
        this.thrustForce = vehicleStats.thrustForce;
        this.horizontalAcceleration = vehicleStats.horizontalAcceleration;
        this.maxHorizontalSpeed = vehicleStats.maxHorizontalSpeed;
        this.gravity = vehicleStats.GRAVITY ?? GLOBAL_PHYSICS.GRAVITY;
        this.verticalDragFactor = vehicleStats.VERTICAL_DRAG_FACTOR ?? GLOBAL_PHYSICS.VERTICAL_DRAG_FACTOR;
        this.airFrictionFactor = vehicleStats.AIR_FRICTION_FACTOR ?? GLOBAL_PHYSICS.AIR_FRICTION_FACTOR;
        this.groundFrictionFactor = vehicleStats.GROUND_FRICTION_FACTOR ?? GLOBAL_PHYSICS.GROUND_FRICTION_FACTOR;

        this.projectileDamage = vehicleStats.projectileDamage;
        this.projectileSpeed = vehicleStats.projectileSpeed;
        this.projectileColor = vehicleStats.projectileColor;
        this.fireRate = vehicleStats.fireRate;
        this.chargeRate = vehicleStats.chargeRate;
        this.maxChargeLevel = vehicleStats.maxChargeLevel;

        if (this.health > this.maxHealth || this.health <= 0 || isNaN(this.health)) {
             this.health = this.maxHealth;
        }
        if (this.fuel > this.maxFuel || this.fuel < 0 || isNaN(this.fuel)) {
             this.fuel = this.maxFuel;
        }
         this.health = Math.min(this.health, this.maxHealth);
         this.fuel = Math.min(this.fuel, this.maxFuel);
    }

    setVehicle(vehicleTypeIndex) {
        if (vehicleTypeIndex >= 0 && vehicleTypeIndex < SPRITES.vehicles.frames.length) {
            const oldType = this.vehicleType;
            if (oldType !== vehicleTypeIndex) {
                 this.vehicleType = vehicleTypeIndex;
                 this.updateVehicleProperties();
                 this.health = this.maxHealth;
                 this.fuel = this.maxFuel;
                 console.log(`Player ${this.id} vehicle state changed from type ${oldType} to ${this.vehicleType}. Health/Fuel reset.`);
                 this.serverHealth = this.health;
                 this.serverFuel = this.fuel;
                 this.chargeLevel = 0;
                 this.activePowerups = {}; // Clear active powerups on vehicle change
            }
        } else {
            console.warn(`Invalid vehicleTypeIndex: ${vehicleTypeIndex} for player ${this.id}`);
        }
    }

    getPresenceData() {
        // Note: activePowerups are NOT synced via presence, only via roomState for the powerups themselves
        return {
            x: this.x,
            y: this.y,
            vehicleType: this.vehicleType,
            facingDirection: this.facingDirection,
            rotation: this.rotation,
            isOnGround: this.isOnGround,
            health: this.health,
            fuel: this.fuel,
            isInvulnerable: this.isInvulnerable,
            lifecycleState: this.lifecycleState,
        };
    }

    resetForSpawn(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.ax = 0;
        this.ay = 0;
        this.rotation = 0;
        this.facingDirection = -1;
        this.targetFacingDirection = -1;
        this.visualFacingDirection = -1;
        this.flipAnimationStart = 0;
        this.isThrusting = false;
        this.isMovingLeft = false;
        this.isMovingRight = false;
        this.isOnGround = false; // Assume spawning in air or reset ground state
        this.isCharging = false;
        this.chargeLevel = 0;
        this.wantsToFire = false;

        // Reset health and fuel to max based on current vehicle type
        this.health = this.maxHealth;
        this.fuel = this.maxFuel;

        // Reset invulnerability state
        this.lastDamageTime = 0;
        this.isInvulnerable = false;
        this.lastGroundDamageTime = 0; // Reset ground damage timer

        // Reset server state for interpolation
        this.serverX = x;
        this.serverY = y;
        this.serverRotation = 0;
        this.serverFacingDirection = -1;
        this.serverIsOnGround = false;
        this.serverHealth = this.health;
        this.serverFuel = this.fuel;
        this.serverIsInvulnerable = this.isInvulnerable;
        this.serverLifecycleState = PlayerLifecycleState.ACTIVE; // Assume server state matches
        this.lastServerUpdateTime = 0;

        this.isMarkedForRemoval = false;
        this.lifecycleState = PlayerLifecycleState.ACTIVE; // Set state to active
    }
}