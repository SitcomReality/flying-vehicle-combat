// Import GLOBAL_PHYSICS from player-state which now aliases BASE_PLAYER_PHYSICS from the config
import { GLOBAL_PHYSICS } from './player-state.js';

const PROJECTILE_RADIUS = 4;
const PROJECTILE_LIFESPAN = 3; // seconds

// DEBUG: Counter for logging frequency control
let logCounter = 0;
const LOG_FREQUENCY = 120; // Log every N updates per projectile

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

        // DEBUG: Initial state log
        // console.log(`[Projectile ${this.id}] CREATED by ${ownerId}. Pos: (${x.toFixed(1)}, ${y.toFixed(1)}), Vel: (${vx.toFixed(1)}, ${vy.toFixed(1)}), Dmg: ${damage}, GravFactor: ${gravityFactor.toFixed(3)}`);
        this.logCounter = Math.floor(Math.random() * LOG_FREQUENCY); // Randomize start log counter
    }

    update(deltaTime, groundLevelY) {
        if (this.isMarkedForRemoval) return;

        // Check lifespan
        if (performance.now() - this.creationTime > this.lifespan) {
            this.isMarkedForRemoval = true;
            return;
        }

        // 1. Apply gravity using the stored gravityFactor for this projectile
        const gravityForce = GLOBAL_PHYSICS.GRAVITY * this.gravityFactor * deltaTime;
        this.vy += gravityForce;

        // 2. Apply vertical drag to limit terminal velocity
        const dragForceY = -this.vy * GLOBAL_PHYSICS.PROJECTILE_VERTICAL_DRAG_FACTOR;
        this.vy += dragForceY * deltaTime;

        // Update position
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // DEBUG: Log projectile state periodically
        this.logCounter++;
        if (this.logCounter % LOG_FREQUENCY === 0) {
             console.log(`[Projectile ${this.id}] Update. Pos: (${this.x.toFixed(1)}, ${this.y.toFixed(1)}), Vel: (${this.vx.toFixed(1)}, ${this.vy.toFixed(1)}), AppliedGrav: ${gravityForce.toFixed(3)}, AppliedDrag: ${(dragForceY * deltaTime).toFixed(3)} (GravFactor: ${this.gravityFactor.toFixed(3)})`);
        }


        // Check ground collision
        if (this.y + this.radius >= groundLevelY) {
            this.isMarkedForRemoval = true; 
            // console.log(`[Projectile ${this.id}] Removed due to ground collision at Y=${this.y.toFixed(1)}`);
             // TODO: Add ground impact particle effect?
        }

        // Check screen bounds (simple removal for now)
        const gameWidth = 800; // Assuming standard game width
        if (this.x < -this.radius || this.x > gameWidth + this.radius || this.y < -this.radius) {
             this.isMarkedForRemoval = true;
             // console.log(`[Projectile ${this.id}] Removed due to leaving bounds at (${this.x.toFixed(1)}, ${this.y.toFixed(1)})`);
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