import { GLOBAL_PHYSICS } from './player-state.js';
import { BASE_PLAYER_PHYSICS } from '../config/vehicle-config.js';

const PROJECTILE_RADIUS = 4;
const PROJECTILE_LIFESPAN = 3; // seconds

// Define the reasons for removal
export const ProjectileRemovalReason = {
    HIT_PLAYER: 'hit_player',
    HIT_OBJECT: 'hit_object',
    GROUND: 'ground',
    BOUNDS: 'bounds',
    LIFESPAN: 'lifespan',
};

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
        this.removalReason = null; // Store the reason for removal
        this.damage = damage;
        this.gravityFactor = gravityFactor;
        this.isLocal = false; // Added flag, set by ProjectileManager

        // DEBUG: Initial state log
        // console.log(`[Projectile ${this.id}] CREATED by ${ownerId}. Pos: (${x.toFixed(1)}, ${y.toFixed(1)}), Vel: (${vx.toFixed(1)}, ${vy.toFixed(1)}), Dmg: ${damage}, GravFactor: ${gravityFactor.toFixed(3)}`);
        this.logCounter = 0;
    }

    /**
     * Marks the projectile for removal and optionally sets the reason.
     * @param {string | null} reason - The reason for removal (e.g., ProjectileRemovalReason.HIT_PLAYER).
     */
    markForRemoval(reason = null) {
        if (!this.isMarkedForRemoval) { // Only mark once
            this.isMarkedForRemoval = true;
            this.removalReason = reason;
            // Log removal details
            // if (!this.isLocal && reason) { // Log for remote projectiles with a reason
            //      const timeAlive = (performance.now() - this.creationTime) / 1000;
            //      console.log(`[Projectile ${this.id} REMOTE] Marked for removal. Reason: ${reason}. Time alive: ${timeAlive.toFixed(2)}s. Pos: (${this.x.toFixed(1)}, ${this.y.toFixed(1)})`);
            // }
        }
    }

    update(deltaTime, groundLevelY) {
        if (this.isMarkedForRemoval) return; // Check at start

        const now = performance.now();

        // Check lifespan first, mark if expired
        if (now - this.creationTime > this.lifespan) {
            this.markForRemoval(ProjectileRemovalReason.LIFESPAN);
            return; // Stop update if expired
        }

        // --- Vertical Physics ---
        const gravityForce = GLOBAL_PHYSICS.GRAVITY * this.gravityFactor * deltaTime;
        this.vy += gravityForce;

        const dragForce = -this.vy * BASE_PLAYER_PHYSICS.PROJECTILE_VERTICAL_DRAG_FACTOR * deltaTime;
        this.vy += dragForce;

        // --- Update Position ---
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // Check ground collision, mark if hit
        if (this.y + this.radius >= groundLevelY) {
             this.y = groundLevelY - this.radius; // Adjust position slightly above ground
            this.markForRemoval(ProjectileRemovalReason.GROUND);
            return; // Stop update if hit ground
        }

        // Check screen bounds (simple removal for now), mark if outside
        const gameWidth = 800; // TODO: Get this from config/game state
        if (this.x < -this.radius || this.x > gameWidth + this.radius || this.y < -this.radius) {
             this.markForRemoval(ProjectileRemovalReason.BOUNDS);
             return; // Stop update if out of bounds
        }
    }

    draw(ctx) {
        if (this.isMarkedForRemoval) return;

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

export default Projectile;