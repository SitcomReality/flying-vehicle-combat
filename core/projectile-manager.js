import Projectile, { ProjectileRemovalReason } from '../entities/projectile.js';

class ProjectileManager {
    constructor() {
        this.projectiles = {}; // Store projectiles by ID
        this.nextProjectileId = 0; // Simple local ID generation for client-side effects
        this.particleSystem = null; // Added reference to particle system
    }

    // Method to set the particle system after instantiation
    setParticleSystem(particleSystem) {
        this.particleSystem = particleSystem;
    }

    // Creates a projectile locally (e.g., from network event or local fire)
    // Accepts damage and gravityFactor parameters
    createProjectile(id, ownerId, x, y, vx, vy, color, damage = 10, gravityFactor = 0.5) {
        const localClientId = window.websim?.socket?.clientId || 'UnknownClient'; // Safer way to get ID

        // --- Refined Logging ---
        // console.log(`[ProjectileMgr ${localClientId}] Enter createProjectile for ID ${id} (Owner: ${ownerId})`);

        // Check if this projectile ID already exists in the local manager
        if (this.projectiles[id]) {
            // console.warn(`[ProjectileMgr ${localClientId}] Attempted to create projectile with duplicate ID ${id}. Skipping creation.`);
            return; // Prevent duplicates
        }

        // Determine if this creation is for the local player's own shot or a remote player's shot
        const isLocal = ownerId === localClientId;
        // Set the flag *before* logging
        let projectile = null;

        try {
            projectile = new Projectile(id, ownerId, x, y, vx, vy, color, damage, gravityFactor); // Pass gravityFactor
            if (projectile) {
                projectile.isLocal = isLocal; // Set the flag here
                this.projectiles[id] = projectile;
                // console.log(`[ProjectileMgr ${localClientId}] Successfully CREATED ${isLocal ? 'LOCAL' : 'REMOTE'} projectile ${id}. Pos: (${x.toFixed(1)},${y.toFixed(1)}), Vel: (${vx.toFixed(1)},${vy.toFixed(1)}), Dmg: ${damage}, Grav: ${gravityFactor.toFixed(2)}`);
            } else {
                 console.error(`[ProjectileMgr ${localClientId}] FAILED to create projectile instance for ID ${id} - Constructor returned null/undefined.`);
            }
        } catch (error) {
             console.error(`[ProjectileMgr ${localClientId}] XXX Error creating projectile instance for ID ${id}:`, error);
             // Ensure potential partial creation is cleaned up if error occurs
             if (this.projectiles[id]) delete this.projectiles[id];
        }

        // console.log(`[ProjectileMgr ${localClientId}] Exit createProjectile for ID ${id}`);
        // --- End Refined Logging ---
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
                // --- Trigger explosion effect based on removal reason ---
                // Only trigger effect if it hit something tangible (player, object, ground)
                // NOT if it simply went out of bounds or timed out.
                if (this.particleSystem &&
                    (projectile.removalReason === ProjectileRemovalReason.HIT_PLAYER ||
                     projectile.removalReason === ProjectileRemovalReason.HIT_OBJECT ||
                     projectile.removalReason === ProjectileRemovalReason.GROUND))
                {
                    // Use emitProjectileImpact which creates a small burst effect
                    this.particleSystem.emitProjectileImpact(projectile.x, projectile.y, projectile.vx, projectile.vy, projectile.color);
                }
                // --- End Trigger effect ---

                // Log removal *before* deleting
                // console.log(`[ProjectileMgr] Removing projectile ${id} (Owner: ${projectile.ownerId}, Local: ${projectile.isLocal}, Reason: ${projectile.removalReason})`);
                delete this.projectiles[id];
            }
        }
    }

    draw(ctx) {
        const localClientId = window.websim?.socket?.clientId || 'UnknownClient';
        for (const id in this.projectiles) {
             // Add null/undefined check before drawing
             const projectile = this.projectiles[id];
             if (projectile) {
                 // --- Added Logging ---
                 // Occasionally log drawing attempt for remote projectiles
                 // if (!projectile.isLocal && Math.random() < 0.01) {
                 //     // console.log(`[ProjectileMgr ${localClientId}] Attempting to draw REMOTE projectile ${id}. Marked for removal: ${projectile.isMarkedForRemoval}`);
                 // }
                 // --- End Logging ---
                projectile.draw(ctx);
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