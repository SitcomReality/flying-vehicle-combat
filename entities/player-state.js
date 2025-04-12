import { SPRITES } from 'config/sprites.js';
import { getVehicleConfig } from './vehicles/vehicle-types.js';
import { PlayerLifecycleState } from './player-lifecycle.js';
import { BASE_PLAYER_PHYSICS } from 'config/vehicle-config.js';

// --- Constants ---
export const GLOBAL_PHYSICS = BASE_PLAYER_PHYSICS;

// Increase snap threshold slightly - player needs to be quite far off before snapping
export const INTERPOLATION_SNAP_THRESHOLD = 150; // pixels (was 0.5, then 100)
export const FLIP_ANIMATION_DURATION = 250; // ms

export class PlayerState {
    constructor(id, x, y, vehicleType, isLocalPlayer) {
        this.id = id;
        this.isLocalPlayer = isLocalPlayer;

        // Core Position & Movement (Local/Visual State)
        this.x = x; // Visual X position (interpolated for remotes)
        this.y = y; // Visual Y position (interpolated for remotes)
        this.vx = 0; // Current velocity X (local player only for physics)
        this.vy = 0; // Current velocity Y (local player only for physics)
        this.ax = 0; // Current acceleration X (local player only)
        this.ay = 0; // Current acceleration Y (local player only)
        this.rotation = 0; // Visual rotation (interpolated for remotes)

        // Appearance & Input Status
        this.vehicleType = vehicleType;
        this.facingDirection = -1; // Logical facing direction (-1 left, 1 right)
        this.targetFacingDirection = -1; // Target direction based on input
        this.visualFacingDirection = -1; // Current visual direction (during flip animation)
        this.flipAnimationStart = 0; // Timestamp when flip started
        this.isThrusting = false;
        this.isMovingLeft = false;
        this.isMovingRight = false;
        this.isOnGround = false; // Updated by physics (local) or server state (remote)
        this.lastGroundDamageTime = 0;

        // Lifecycle State
        this.lifecycleState = PlayerLifecycleState.CONNECTING;

        // Firing Mechanics
        this.isCharging = false;
        this.chargeLevel = 0;
        this.wantsToFire = false;

        // --- Health & Fuel ---
        this.health = 100; // Visual health (interpolated for remotes)
        this.maxHealth = 100;
        this.fuel = 100; // Visual fuel (interpolated for remotes)
        this.maxFuel = 100;

        // --- Scoring ---
        this.score = 0; // Authoritative score (synced directly)

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
        this.maxTiltAngle = BASE_PLAYER_PHYSICS.MAX_TILT_ANGLE;
        this.tiltSpeed = BASE_PLAYER_PHYSICS.TILT_SPEED;

        // --- Vehicle-specific WEAPON properties ---
        this.projectileDamage = 10;
        this.projectileSpeed = 400;
        this.projectileColor = '#FFFF00';
        this.fireRate = 5;
        this.chargeRate = 50;
        this.maxChargeLevel = 100;

        // --- Health System State ---
        this.lastDamageTime = 0;
        this.isInvulnerable = false; // Updated by health system (local) or server state (remote)

        // --- Powerup State ---
        this.activePowerups = {};

        // --- Network Synchronization State (for remote players) ---
        this.serverX = x; // Last known authoritative X from server
        this.serverY = y; // Last known authoritative Y from server
        this.serverRotation = 0; // Last known authoritative rotation
        this.serverFacingDirection = -1; // Last known authoritative facing direction
        this.serverIsOnGround = false; // Last known authoritative ground state
        this.serverHealth = 100; // Last known authoritative health
        this.serverFuel = 100; // Last known authoritative fuel
        this.serverIsInvulnerable = false; // Last known authoritative invulnerability
        this.serverLifecycleState = PlayerLifecycleState.CONNECTING; // Last known authoritative state
        this.serverScore = 0; // Last known authoritative score
        this.lastServerUpdateTime = 0; // Timestamp of last server update

        // Flags
        this.isMarkedForRemoval = false;

        // Derived properties
        this.width = 0;
        this.height = 0;
        this.drawOffsetX = 0;
        this.drawOffsetY = 0;
        this.currentVehicle = null; // Cached sprite frame data

        // Initial setup
        this.updateVehicleProperties();

        const initialDirection = -1;
        this.facingDirection = initialDirection;
        this.targetFacingDirection = initialDirection;
        this.visualFacingDirection = initialDirection;
        this.serverFacingDirection = initialDirection;

        // Initialize server state to match initial local state
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

        // Use specific hitbox dimensions if defined, otherwise fall back to frame dimensions
        this.width = this.currentVehicle.hitbox?.width ?? this.currentVehicle.width;
        this.height = this.currentVehicle.hitbox?.height ?? this.currentVehicle.height;
        // Use specific draw offsets if defined, otherwise assume centered based on hitbox/frame diff
        const frameWidth = this.currentVehicle.width;
        const frameHeight = this.currentVehicle.height;
        this.drawOffsetX = this.currentVehicle.hitbox?.offsetX ?? (frameWidth - this.width) / 2;
        this.drawOffsetY = this.currentVehicle.hitbox?.offsetY ?? (frameHeight - this.height) / 2;

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

        // Clamp VISUAL health/fuel after potentially changing max values
        // Don't reset health/fuel here automatically, let setVehicle handle resets.
        this.health = Math.min(this.health, this.maxHealth);
        this.fuel = Math.min(this.fuel, this.maxFuel);
    }

    setVehicle(vehicleTypeIndex) {
        if (vehicleTypeIndex >= 0 && vehicleTypeIndex < SPRITES.vehicles.frames.length) {
            const oldType = this.vehicleType;
            if (oldType !== vehicleTypeIndex) {
                 this.vehicleType = vehicleTypeIndex;
                 this.updateVehicleProperties(); // Update maxHealth/maxFuel etc. first
                 // --- Reset Health/Fuel/State on Vehicle Change ---
                 this.health = this.maxHealth;
                 this.fuel = this.maxFuel;
                 this.chargeLevel = 0;
                 this.activePowerups = {};
                 this.isInvulnerable = false; // Reset invulnerability
                 this.lastDamageTime = 0;
                 console.log(`Player ${this.id} vehicle state changed from type ${oldType} to ${this.vehicleType}. Health/Fuel/Charge/Powerups reset.`);
                 // --- End Reset ---

                 // Update server-side representations immediately if local player
                 if (this.isLocalPlayer) {
                     this.serverHealth = this.health;
                     this.serverFuel = this.fuel;
                     this.serverScore = this.score; // Score persists through vehicle change
                     // Other server state reflects local state after reset
                 }
            }
        } else {
            console.warn(`Invalid vehicleTypeIndex: ${vehicleTypeIndex} for player ${this.id}`);
        }
    }

    getPresenceData() {
        // Send the authoritative state for the local player
        return {
            x: this.x,
            y: this.y,
            vehicleType: this.vehicleType,
            facingDirection: this.facingDirection, // Send logical direction
            rotation: this.rotation,
            isOnGround: this.isOnGround,
            health: Math.round(this.health), // Send current authoritative health
            fuel: Math.round(this.fuel), // Send current authoritative fuel
            isInvulnerable: this.isInvulnerable,
            lifecycleState: this.lifecycleState,
            score: this.score,
            // vx/vy are not synced, derived locally or interpolated on remotes
        };
    }

    resetForSpawn(x, y) {
        // Reset Core Position & Movement
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.ax = 0;
        this.ay = 0;
        this.rotation = 0;

        // Reset Appearance & Input Status
        // Keep current vehicleType
        this.facingDirection = -1;
        this.targetFacingDirection = -1;
        this.visualFacingDirection = -1;
        this.flipAnimationStart = 0;
        this.isThrusting = false;
        this.isMovingLeft = false;
        this.isMovingRight = false;
        this.isOnGround = false;
        this.lastGroundDamageTime = 0;

        // Reset Lifecycle State (will be set to ACTIVE by Player)
        this.lifecycleState = PlayerLifecycleState.ACTIVE; // Prepare for transition

        // Reset Firing Mechanics
        this.isCharging = false;
        this.chargeLevel = 0;
        this.wantsToFire = false;

        // Reset Health/Fuel to current vehicle's max
        // updateVehicleProperties called first to ensure max values are correct
        this.updateVehicleProperties();
        this.health = this.maxHealth;
        this.fuel = this.maxFuel;

        // --- RESET SCORE ON SPAWN ---
        this.score = 0;
        // --- END RESET SCORE ---

        // Reset Timers/Flags
        this.lastDamageTime = 0;
        this.isInvulnerable = false; // Start vulnerable
        this.activePowerups = {}; // Clear powerups

        // Reset Network Synchronization State
        this.serverX = x;
        this.serverY = y;
        this.serverRotation = 0;
        this.serverFacingDirection = -1;
        this.serverIsOnGround = false;
        this.serverHealth = this.health;
        this.serverFuel = this.fuel;
        this.serverIsInvulnerable = this.isInvulnerable;
        this.serverLifecycleState = PlayerLifecycleState.ACTIVE; // Set to active on spawn
        this.serverScore = this.score; 
        this.lastServerUpdateTime = 0;

        // Ensure flags are correct
        this.isMarkedForRemoval = false;
        this.lifecycleState = PlayerLifecycleState.ACTIVE; // Set to active on spawn
    }
}