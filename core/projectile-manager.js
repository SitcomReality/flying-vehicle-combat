// New file: Manages all active projectiles

import Projectile from '../entities/projectile.js';

class ProjectileManager {
    constructor() {
        this.projectiles = {}; // Store projectiles by ID
        this.nextProjectileId = 0; // Simple local ID generation for client-side effects
        // Fetch and store the local client ID once
        this.localClientId = window.websim?.socket?.clientId || null;
        if (!this.localClientId) {
            console.warn("[ProjectileMgr] Could not determine local client ID during construction!");
        }
    }

    // Creates a projectile locally (e.g., from network event or local fire)
    // Accepts damage and gravityFactor parameters
    createProjectile(id, ownerId, x, y, vx, vy, color, damage = 10, gravityFactor = 0.5) {
        // Use the stored local client ID
        const localClientId = this.localClientId;
        if (!localClientId) {
            console.error(`[ProjectileMgr] Cannot create projectile - local client ID is unknown.`);
            return; // Cannot determine locality
        }

        // Check if this projectile ID already exists in the local manager
        if (this.projectiles[id]) {
            console.warn(`[ProjectileMgr ${localClientId}] Attempted to create projectile with duplicate ID ${id}. Skipping creation.`);
            return; // Prevent duplicates
        }

        // --- Correctly determine if this projectile belongs to the local player ---
        const isLocal = ownerId === localClientId;
        const localityString = isLocal ? 'LOCAL' : 'REMOTE'; // Determine string based on flag

        // --- Log with corrected locality string ---
        console.log(`[ProjectileMgr ${localClientId}] Creating ${localityString} projectile ${id} (Owner: ${ownerId}) Pos: (${x.toFixed(1)},${y.toFixed(1)}), Vel: (${vx.toFixed(1)},${vy.toFixed(1)}), Dmg: ${damage}, Grav: ${gravityFactor.toFixed(2)}`);

        try {
            const projectile = new Projectile(id, ownerId, x, y, vx, vy, color, damage, gravityFactor); // Pass gravityFactor
            // --- Set the isLocal flag correctly ---
            projectile.isLocal = isLocal;
            this.projectiles[id] = projectile;
             // --- Add log CONFIRMING storage ---
             console.log(`[ProjectileMgr ${localClientId}] Successfully CREATED and STORED ${localityString} projectile ${id}. Active count: ${Object.keys(this.projectiles).length}`);

        } catch (error) {
             console.error(`[ProjectileMgr ${localClientId}] Error during projectile instance creation or storage for ID ${id}:`, error);
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
        const localClientId = this.localClientId || 'UnknownClient';
        for (const id in this.projectiles) {
            const projectile = this.projectiles[id];
             // Add null/undefined check before accessing properties
            if (!projectile) {
                 // console.warn(`[ProjectileMgr ${localClientId}] Found invalid entry in projectiles map with ID ${id}. Cleaning up.`);
                 delete this.projectiles[id]; // Clean up invalid entries
                 continue;
            }

            projectile.update(deltaTime, groundLevelY);

            if (projectile.isMarkedForRemoval) {
                // Log removal *before* deleting
                // console.log(`[ProjectileMgr ${localClientId}] Removing projectile ${id} (Owner: ${projectile.ownerId}, Local: ${projectile.isLocal})`);
                delete this.projectiles[id];
            }
        }
    }

    draw(ctx) {
        const localClientId = this.localClientId || 'UnknownClient';
        for (const id in this.projectiles) {
             // Add null/undefined check before drawing
             const projectile = this.projectiles[id];
             if (projectile) {
                 // --- Added Logging ---
                 // Occasionally log drawing attempt for remote projectiles
                 if (!projectile.isLocal && Math.random() < 0.01) { // Check the actual projectile.isLocal flag
                     console.log(`[ProjectileMgr ${localClientId}] DRAW: Attempting to draw REMOTE projectile ${id}. Pos: (${projectile.x.toFixed(1)}, ${projectile.y.toFixed(1)}), Marked for removal: ${projectile.isMarkedForRemoval}`);
                 }
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