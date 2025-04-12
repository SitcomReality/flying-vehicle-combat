import { SPRITES } from 'config/sprites.js';
import { getVehicleConfig } from './vehicles/vehicle-types.js';
import { PlayerLifecycleState } from './player-lifecycle.js';
import { BASE_PLAYER_PHYSICS } from 'config/vehicle-config.js';

// --- Constants ---
export const GLOBAL_PHYSICS = BASE_PLAYER_PHYSICS; 

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

        // --- Scoring ---
        this.score = 0;

        // --- Vehicle-specific physics properties ---
        // Initialize with base physics values from the config
        this.fuelRegenRate = 0;
        this.fuelConsumeRate = 0;
        this.thrustForce = 0;
        this.horizontalAcceleration = 0;
        this.maxHorizontalSpeed = 0;
        this.gravity = BASE_PLAYER_PHYSICS.GRAVITY; 
        this.verticalDragFactor = BASE_PLAYER_PHYSICS.VERTICAL_DRAG_FACTOR;
        this.airFrictionFactor = BASE_PLAYER_PHYSICS.AIR_FRICTION_FACTOR;
        this.groundFrictionFactor = BASE_PLAYER_PHYSICS.GROUND_FRICTION_FACTOR;
        // --- ADDED TILT PROPERTIES ---
        this.maxTiltAngle = BASE_PLAYER_PHYSICS.MAX_TILT_ANGLE;
        this.tiltSpeed = BASE_PLAYER_PHYSICS.TILT_SPEED;
        // --- END ADDED ---


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
        this.serverScore = 0;
        this.lastServerUpdateTime = 0;

        // Flags
        this.isMarkedForRemoval = false;

        // Derived properties
        this.width = 0;
        this.height = 0;
        this.drawOffsetX = 0;
        this.drawOffsetY = 0;
        this.currentVehicle = null;

        this.updateVehicleProperties();

        const initialDirection = -1;
        this.facingDirection = initialDirection;
        this.targetFacingDirection = initialDirection;
        this.visualFacingDirection = initialDirection;
        this.serverFacingDirection = initialDirection;

        this.serverHealth = this.health;
        this.serverFuel = this.fuel;
        this.serverIsInvulnerable = this.isInvulnerable;
        this.serverLifecycleState = this.lifecycleState;
        this.serverScore = this.score;
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

        // Core Stats
        this.maxHealth = vehicleStats.maxHealth;
        this.maxFuel = vehicleStats.maxFuel;
        this.fuelRegenRate = vehicleStats.fuelRegenRate;
        this.fuelConsumeRate = vehicleStats.fuelConsumeRate;

        // Movement Stats
        this.thrustForce = vehicleStats.thrustForce;
        this.horizontalAcceleration = vehicleStats.horizontalAcceleration;
        this.maxHorizontalSpeed = vehicleStats.maxHorizontalSpeed;

        // Physics Stats (Ensure all relevant stats are loaded)
        this.gravity = vehicleStats.GRAVITY ?? BASE_PLAYER_PHYSICS.GRAVITY;
        this.verticalDragFactor = vehicleStats.VERTICAL_DRAG_FACTOR ?? BASE_PLAYER_PHYSICS.VERTICAL_DRAG_FACTOR;
        this.airFrictionFactor = vehicleStats.AIR_FRICTION_FACTOR ?? BASE_PLAYER_PHYSICS.AIR_FRICTION_FACTOR;
        this.groundFrictionFactor = vehicleStats.GROUND_FRICTION_FACTOR ?? BASE_PLAYER_PHYSICS.GROUND_FRICTION_FACTOR;
        this.maxTiltAngle = vehicleStats.MAX_TILT_ANGLE ?? BASE_PLAYER_PHYSICS.MAX_TILT_ANGLE; // Load MAX_TILT_ANGLE
        this.tiltSpeed = vehicleStats.TILT_SPEED ?? BASE_PLAYER_PHYSICS.TILT_SPEED; // Load TILT_SPEED

        // Weapon Stats
        this.projectileDamage = vehicleStats.projectileDamage;
        this.projectileSpeed = vehicleStats.projectileSpeed;
        this.projectileColor = vehicleStats.projectileColor;
        this.fireRate = vehicleStats.fireRate;
        this.chargeRate = vehicleStats.chargeRate;
        this.maxChargeLevel = vehicleStats.maxChargeLevel;

        // Clamp health/fuel after potentially changing max values
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
                 this.health = this.maxHealth; // Reset health on vehicle change
                 this.fuel = this.maxFuel; // Reset fuel on vehicle change
                 console.log(`Player ${this.id} vehicle state changed from type ${oldType} to ${this.vehicleType}. Health/Fuel reset.`);
                 // Update server-side representations immediately
                 this.serverHealth = this.health;
                 this.serverFuel = this.fuel;
                 this.chargeLevel = 0; // Reset weapon charge
                 this.activePowerups = {}; // Clear active powerups
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
            health: Math.round(this.health), // Send rounded health
            fuel: Math.round(this.fuel), // Send rounded fuel
            isInvulnerable: this.isInvulnerable,
            lifecycleState: this.lifecycleState,
            score: this.score,
            // Removed redundant vx, vy - these are derived or handled by interpolation
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
        this.isOnGround = false;
        this.isCharging = false;
        this.chargeLevel = 0;
        this.wantsToFire = false;

        // Reset health/fuel to current vehicle's max
        this.updateVehicleProperties(); // Ensure max values are correct first
        this.health = this.maxHealth;
        this.fuel = this.maxFuel;

        // Reset timers/flags
        this.lastDamageTime = 0;
        this.isInvulnerable = false;
        this.lastGroundDamageTime = 0;
        this.activePowerups = {}; // Clear powerups on spawn

        // Reset score? (Decide based on game rules - currently NOT resetting score on respawn)
        // this.score = 0;

        // Reset server state representations
        this.serverX = x;
        this.serverY = y;
        this.serverRotation = 0;
        this.serverFacingDirection = -1;
        this.serverIsOnGround = false;
        this.serverHealth = this.health;
        this.serverFuel = this.fuel;
        this.serverIsInvulnerable = this.isInvulnerable;
        this.serverLifecycleState = PlayerLifecycleState.ACTIVE; // Set to active on spawn
        this.serverScore = this.score; // Reflect current score
        this.lastServerUpdateTime = 0;

        // Ensure flags are correct
        this.isMarkedForRemoval = false;
        this.lifecycleState = PlayerLifecycleState.ACTIVE; // Set to active on spawn
    }
}