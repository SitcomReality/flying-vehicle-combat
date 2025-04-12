// New file: Defines base statistics for different vehicle types

/* eslint-disable no-unused-vars */
// Reference existing physics constants (will be overridden by vehicle types)
const BASE_PLAYER_PHYSICS = {
    GRAVITY: 350, // pixels/sec^2
    MAX_VERTICAL_SPEED: 300, // pixels/sec
    VERTICAL_DRAG_FACTOR: 0.5, // Higher = more drag when airborne
    MAX_TILT_ANGLE: Math.PI / 2.5, // ~72 degrees
    TILT_SPEED: 6, // How quickly the sprite tilts
    AIR_FRICTION_FACTOR: 0.3, // Factor for horizontal drag when airborne (lower = less drag)
    GROUND_FRICTION_FACTOR: 1.5, // Factor for horizontal friction when grounded (higher = more friction)
    SPARK_EMIT_RATE: 5,
    SMOKE_EMIT_RATE: 1,
    MAX_CHARGE_LEVEL: 100,
    CHARGE_RATE: 50,
    PROJECTILE_BASE_SPEED: 400,
    PROJECTILE_SPEED_SCALE: 3,
    PROJECTILE_GRAVITY_FACTOR: 0.5,
};
/* eslint-enable no-unused-vars */

// Define specific stats for each vehicle
export const VEHICLE_TYPES = {
    0: { // Standard / Jack-of-all-trades (Blue/Green Ship)
        name: "Standard Issue",
        // Core Stats
        maxHealth: 100,
        maxFuel: 100,
        fuelRegenRate: 25, // units per second
        fuelConsumeRate: 30, // units per second of thrust
        // Movement - balanced
        thrustForce: 700, // pixels/sec^2
        horizontalAcceleration: 800, // pixels/sec^2
        maxHorizontalSpeed: 250, // pixels/sec
        // Weapon Stats - balanced
        projectileDamage: 12,
        projectileSpeed: 450, // Base speed for this weapon type
        projectileColor: '#FFFF00', // Yellow
        fireRate: 5, // shots per second (for potential future auto-fire)
        chargeRate: 60, // charge units per second
        maxChargeLevel: 100,
        // Inherit other physics constants or define if different
        ...BASE_PLAYER_PHYSICS, // Use base for gravity, tilt, drag etc. unless specified
        CHARGE_RATE: 60, // Override base charge rate
        MAX_CHARGE_LEVEL: 100, // Override base max charge
        PROJECTILE_BASE_SPEED: 450, // Override base projectile speed
    },
    1: { // Tanky / Heavy (Red Ship)
        name: "Heavy Hauler",
        // Core Stats
        maxHealth: 150, // More health
        maxFuel: 120,    // MOST fuel (swapped from 80)
        fuelRegenRate: 20,
        fuelConsumeRate: 35, // Consumes more fuel
        // Movement - slower, less agile
        thrustForce: 650,
        horizontalAcceleration: 600,
        maxHorizontalSpeed: 200,
        // Weapon Stats - higher damage, slower charge/speed
        projectileDamage: 18,
        projectileSpeed: 380,
        projectileColor: '#FF8C00', // Dark Orange
        fireRate: 3,
        chargeRate: 40,
        maxChargeLevel: 120, // Higher max charge potential
        // Inherit other physics constants
        ...BASE_PLAYER_PHYSICS,
        GROUND_FRICTION_FACTOR: 1.8, // Higher ground friction
        CHARGE_RATE: 40,
        MAX_CHARGE_LEVEL: 120,
        PROJECTILE_BASE_SPEED: 380,
    },
    2: { // Speedy / Light (Green/Yellow Ship)
        name: "Interceptor",
        // Core Stats
        maxHealth: 75,  // Less health
        maxFuel: 80,   // LEAST fuel (swapped from 120)
        fuelRegenRate: 35, // Faster regen
        fuelConsumeRate: 25, // Consumes less fuel
        // Movement - faster, more agile
        thrustForce: 750,
        horizontalAcceleration: 1000,
        maxHorizontalSpeed: 300,
        // Weapon Stats - lower damage, faster charge/speed
        projectileDamage: 9,
        projectileSpeed: 520,
        projectileColor: '#00FF00', // Bright Green
        fireRate: 7,
        chargeRate: 70,
        maxChargeLevel: 90, // Lower max charge
        // Inherit other physics constants
        ...BASE_PLAYER_PHYSICS,
        AIR_FRICTION_FACTOR: 0.25, // Less air drag
        TILT_SPEED: 7, // Tilts slightly faster
        CHARGE_RATE: 70,
        MAX_CHARGE_LEVEL: 90,
        PROJECTILE_BASE_SPEED: 520,
    }
};

// Helper to get vehicle type config safely
export function getVehicleConfig(typeIndex) {
    const config = VEHICLE_TYPES[typeIndex];
    if (!config) {
        console.warn(`Invalid vehicle type index ${typeIndex}, defaulting to 0.`);
        return VEHICLE_TYPES[0];
    }
    return config;
}