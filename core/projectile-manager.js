// New file: Manages all active projectiles

import Projectile from '../entities/projectile.js';

class ProjectileManager {
    constructor() {
        this.projectiles = {}; // Store projectiles by ID
        this.nextProjectileId = 0; // Simple local ID generation for client-side effects
    }

    // Creates a projectile locally (e.g., from network event)
    // Updated to accept damage parameter
    createProjectile(id, ownerId, x, y, vx, vy, color, damage = 10) {
        if (this.projectiles[id]) {
            console.warn(`Projectile with ID ${id} already exists.`);
            return;
        }
        const projectile = new Projectile(id, ownerId, x, y, vx, vy, color, damage);
        this.projectiles[id] = projectile;
        // console.log(`Projectile ${id} created by ${ownerId} with damage ${damage}`);
    }

    // Creates a projectile and returns its data (for local firing before network broadcast)
    // Updated to accept damage parameter and include it in returned data
    createAndGetData(ownerId, x, y, vx, vy, color, damage) {
         const id = `${ownerId}-${this.nextProjectileId++}`; // Generate a unique-enough ID locally
         this.createProjectile(id, ownerId, x, y, vx, vy, color, damage);
         // Include damage in the data to broadcast
         return { id, ownerId, x, y, vx, vy, color, damage };
    }

    update(deltaTime, groundLevelY) {
        for (const id in this.projectiles) {
            const projectile = this.projectiles[id];
            projectile.update(deltaTime, groundLevelY);

            if (projectile.isMarkedForRemoval) {
                delete this.projectiles[id];
                // console.log(`Projectile ${id} removed.`);
            }
        }
    }

    draw(ctx) {
        for (const id in this.projectiles) {
            this.projectiles[id].draw(ctx);
        }
    }

    getProjectiles() {
        // Return only active projectiles as an object keyed by ID for collision checker
        const activeProjectiles = {};
        for (const id in this.projectiles) {
            if (!this.projectiles[id].isMarkedForRemoval) {
                activeProjectiles[id] = this.projectiles[id];
            }
        }
        return activeProjectiles;
    }
}

export default ProjectileManager;