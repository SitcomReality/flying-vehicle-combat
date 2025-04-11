// New file: Defines the Projectile class

import { GLOBAL_PHYSICS } from './player-state.js'; // Use global constants for projectile physics

const PROJECTILE_RADIUS = 4;
const PROJECTILE_LIFESPAN = 3; // seconds

class Projectile {
    // Added damage parameter to constructor
    constructor(id, ownerId, x, y, vx, vy, color = 'yellow', damage = 10) {
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
        this.damage = damage; // Store damage value
    }

    update(deltaTime, groundLevelY) {
        if (this.isMarkedForRemoval) return;

        // Check lifespan
        if (performance.now() - this.creationTime > this.lifespan) {
            this.isMarkedForRemoval = true;
            return;
        }

        // Apply gravity (scaled)
        this.vy += GLOBAL_PHYSICS.GRAVITY * GLOBAL_PHYSICS.PROJECTILE_GRAVITY_FACTOR * deltaTime;

        // Update position
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // Check ground collision
        if (this.y + this.radius >= groundLevelY) {
            this.isMarkedForRemoval = true; // Remove on hitting ground
            // Optional: Create a small impact effect here later
        }

        // Check screen bounds (simple removal for now)
        // TODO: Use game bounds instead of window innerWidth if possible
        const gameWidth = 800; // Assuming fixed width for now
        if (this.x < -this.radius || this.x > gameWidth + this.radius || this.y < -this.radius) {
             this.isMarkedForRemoval = true;
        }

        // Collision detection moved to CollisionDetector
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