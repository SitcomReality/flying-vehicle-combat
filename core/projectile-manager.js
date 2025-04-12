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
        // Get local client ID for logging context
        const localClientId = window.websim?.socket?.clientId || 'UnknownClient'; // Safer way to get ID

        // Check if this projectile ID already exists in the local manager
        if (this.projectiles[id]) {
            console.warn(`[ProjectileMgr ${localClientId}] Attempted to create projectile with duplicate ID ${id}. Skipping creation.`);
            return; // Prevent duplicates
        }

        // Determine if this creation is for the local player's own shot or a remote player's shot
        const isLocal = ownerId === localClientId;
        console.log(`[ProjectileMgr ${localClientId}] Creating ${isLocal ? 'LOCAL' : 'REMOTE'} projectile ${id} (Owner: ${ownerId}) Pos: (${x.toFixed(1)},${y.toFixed(1)}), Vel: (${vx.toFixed(1)},${vy.toFixed(1)}), Dmg: ${damage}, Grav: ${gravityFactor.toFixed(2)}`);

        try {
            const projectile = new Projectile(id, ownerId, x, y, vx, vy, color, damage, gravityFactor); // Pass gravityFactor
            this.projectiles[id] = projectile;
        } catch (error) {
             console.error(`[ProjectileMgr ${localClientId}] Error creating projectile instance for ID ${id}:`, error);
        }
    }

    // Creates a projectile locally AND returns its data for broadcasting via event
    // Accepts damage and gravityFactor, includes them in returned data
    createAndGetData(ownerId, x, y, vx, vy, color, damage, gravityFactor) {
         // Generate a unique ID including owner and a local counter
         const id = `${ownerId}-${Date.now()}-${this.nextProjectileId++}`;
         // Create the projectile locally first
         // This call will log whether it's local or remote based on ownerId
         this.createProjectile(id, ownerId, x, y, vx, vy, color, damage, gravityFactor);
         // Return all necessary data for the event payload
         return { id, ownerId, x, y, vx, vy, color, damage, gravityFactor };
    }

    update(deltaTime, groundLevelY) {
        for (const id in this.projectiles) {
            const projectile = this.projectiles[id];
             // Add null/undefined check before accessing properties
            if (!projectile) {
                 delete this.projectiles[id]; // Clean up invalid entries
                 continue;
            }

            projectile.update(deltaTime, groundLevelY);

            if (projectile.isMarkedForRemoval) {
                delete this.projectiles[id];
                // console.log(`Projectile ${id} removed.`);
            }
        }
    }

    draw(ctx) {
        for (const id in this.projectiles) {
             // Add null/undefined check before drawing
             if (this.projectiles[id]) {
                this.projectiles[id].draw(ctx);
             }
        }
    }

    getProjectiles() {
        // Return only active projectiles as an object keyed by ID for collision checker
        const activeProjectiles = {};
        for (const id in this.projectiles) {
            if (this.projectiles[id] && !this.projectiles[id].isMarkedForRemoval) { // Add null check
                activeProjectiles[id] = this.projectiles[id];
            }
        }
        return activeProjectiles;
    }
}

export default ProjectileManager;