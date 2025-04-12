// New file: Manages all active projectiles

import Projectile from '../entities/projectile.js';

class ProjectileManager {
    constructor() {
        this.projectiles = {}; // Store projectiles by ID
        this.nextProjectileId = 0; // Simple local ID generation for client-side effects
    }

    // Creates a projectile locally (e.g., from network event or local fire)
    // Accepts damage and gravityFactor parameters
    createProjectile(id, ownerId, x, y, vx, vy, color, damage = 10, gravityFactor = 0.5) {
        if (this.projectiles[id]) {
            // console.warn(`[ProjectileMgr] Projectile with ID ${id} already exists. Ignoring creation.`);
            return; // Prevent duplicates, crucial with event-based system
        }
        // --- Added logging on creation ---
        // console.log(`[ProjectileMgr] Creating projectile ${id} (Owner: ${ownerId}) Pos: (${x.toFixed(1)},${y.toFixed(1)}), Vel: (${vx.toFixed(1)},${vy.toFixed(1)}), Dmg: ${damage}, Grav: ${gravityFactor.toFixed(2)}`);
        // --- End logging ---
        const projectile = new Projectile(id, ownerId, x, y, vx, vy, color, damage, gravityFactor); // Pass gravityFactor
        this.projectiles[id] = projectile;
    }

    // Creates a projectile locally AND returns its data for broadcasting via event
    // Accepts damage and gravityFactor, includes them in returned data
    createAndGetData(ownerId, x, y, vx, vy, color, damage, gravityFactor) {
         // Generate a unique ID including owner and a local counter
         const id = `${ownerId}-${Date.now()}-${this.nextProjectileId++}`;
         // Create the projectile locally first
         this.createProjectile(id, ownerId, x, y, vx, vy, color, damage, gravityFactor);
         // Return all necessary data for the event payload
         return { id, ownerId, x, y, vx, vy, color, damage, gravityFactor };
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