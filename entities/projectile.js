// Import GLOBAL_PHYSICS from player-state which now aliases BASE_PLAYER_PHYSICS from the config
import { GLOBAL_PHYSICS } from './player-state.js';
// Import BASE_PLAYER_PHYSICS directly from the config file to get specific constants like drag
import { BASE_PLAYER_PHYSICS } from '../config/vehicle-config.js';

const PROJECTILE_RADIUS = 4;
const PROJECTILE_LIFESPAN = 3; // seconds

// DEBUG: Counter for logging frequency control
let logCounter = 0;
const LOG_FREQUENCY = 60; // Log every N updates per projectile

class Projectile {
    // Added damage and gravityFactor parameters to constructor
    constructor(id, ownerId, x, y, vx, vy, color = 'yellow', damage = 10, gravityFactor = GLOBAL_PHYSICS.PROJECTILE_GRAVITY_FACTOR) {
        this.id = id;
        this.ownerId = ownerId;
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.radius = PROJECTILE_RADIUS;
        this.creationTime = performance.now();
        this.lifespan = PROJECTILE_LIFESPAN * 1000; // milliseconds
        this.isMarkedForRemoval = false;
        this.damage = damage;
        this.gravityFactor = gravityFactor;
        // --- isLocal flag is now set by ProjectileManager *after* instantiation ---
        this.isLocal = false; // Default to false

        // DEBUG: Initial state log - REMOVED from constructor, manager logs this now
        this.logCounter = 0;
    }

    update(deltaTime, groundLevelY) {
        if (this.isMarkedForRemoval) return; // Check at start

        const now = performance.now();
        let reasonForRemoval = null; // Track reason for logging

        // Check lifespan
        if (now - this.creationTime > this.lifespan) {
            this.isMarkedForRemoval = true;
            reasonForRemoval = 'lifespan';
        }

        // --- Vertical Physics ---
        // Apply gravity using the stored gravityFactor for this projectile
        const gravityForce = GLOBAL_PHYSICS.GRAVITY * this.gravityFactor * deltaTime;
        this.vy += gravityForce;

        // Apply vertical drag to limit terminal velocity
        const dragForce = -this.vy * BASE_PLAYER_PHYSICS.PROJECTILE_VERTICAL_DRAG_FACTOR * deltaTime;
        this.vy += dragForce;

        // --- Update Position ---
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // DEBUG: Log projectile state periodically (less frequent)
        // this.logCounter++;
        // if (this.logCounter % (LOG_FREQUENCY * 5) === 0) {
        //     console.log(`[Projectile ${this.id} Local:${this.isLocal}] Update. Pos: (${this.x.toFixed(1)}, ${this.y.toFixed(1)}), Vel: (${this.vx.toFixed(1)}, ${this.vy.toFixed(1)})`);
        // }


        // Check ground collision
        if (!this.isMarkedForRemoval && this.y + this.radius >= groundLevelY) {
            this.isMarkedForRemoval = true;
            reasonForRemoval = 'ground';
        }

        // Check screen bounds (simple removal for now)
        const gameWidth = 800;
        if (!this.isMarkedForRemoval && (this.x < -this.radius || this.x > gameWidth + this.radius || this.y < -this.radius)) {
             this.isMarkedForRemoval = true;
             reasonForRemoval = 'bounds';
        }

        // --- Updated Logging for Removal ---
        // Log ONLY when a projectile is marked for removal
        // Use the actual isLocal flag
        if (this.isMarkedForRemoval && reasonForRemoval) {
            const timeAlive = (now - this.creationTime) / 1000;
            const localityString = this.isLocal ? 'LOCAL' : 'REMOTE'; // Use correct flag
            console.log(`[Projectile ${this.id} ${localityString}] Marked for removal. Reason: ${reasonForRemoval}. Time alive: ${timeAlive.toFixed(2)}s. Pos: (${this.x.toFixed(1)}, ${this.y.toFixed(1)})`);
        }
        // --- End Logging ---

    }

    draw(ctx) {
        // --- Logging moved to ProjectileManager.draw ---

        if (this.isMarkedForRemoval) return;

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

export default Projectile;