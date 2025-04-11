// New file: Manages all active projectiles

import Projectile from '../entities/projectile.js';

class ProjectileManager {
    constructor() {
        this.projectiles = {}; // Store projectiles by ID
        this.nextProjectileId = 0; // Simple local ID generation for client-side effects
    }

    // Creates a projectile locally (e.g., from network event)
    createProjectile(id, ownerId, x, y, vx, vy, color) {
        if (this.projectiles[id]) {
            console.warn(`Projectile with ID ${id} already exists.`);
            return;
        }
        const projectile = new Projectile(id, ownerId, x, y, vx, vy, color);
        this.projectiles[id] = projectile;
        // console.log(`Projectile ${id} created by ${ownerId}`);
    }

    // Creates a projectile and returns its data (for local firing before network broadcast)
    createAndGetData(ownerId, x, y, vx, vy, color) {
         const id = `${ownerId}-${this.nextProjectileId++}`; // Generate a unique-enough ID locally
         this.createProjectile(id, ownerId, x, y, vx, vy, color);
         return { id, ownerId, x, y, vx, vy, color };
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
        return Object.values(this.projectiles);
    }
}

export default ProjectileManager;