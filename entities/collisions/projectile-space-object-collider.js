// Handles Projectile-SpaceObject collisions
import { checkAABBCollision } from './aabb-collision.js';

/**
 * Checks for collisions between projectiles and space objects.
 * Applies damage to the space object and removes the projectile.
 * @param {Object.<string, Projectile>} activeProjectiles - Active projectile objects map {id: object}.
 * @param {Object.<string, SpaceObject>} activeSpaceObjects - Active space objects map {id: object}.
 * @param {number} renderScale - Not directly used here, but kept for consistency.
 * @param {function} calculateDamageFunc - Function to calculate damage.
 * @param {number} currentTime - The current game time.
 * @param {SpaceObjectManager} spaceObjectManager - Manager to apply damage to objects.
 * @param {ParticleSystem | null} particleSystem - For collision effects.
 */
export function checkProjectileSpaceObjectCollisions(activeProjectiles, activeSpaceObjects, renderScale, calculateDamageFunc, currentTime, spaceObjectManager, particleSystem) {
    const projectileIds = Object.keys(activeProjectiles);
    const spaceObjectIds = Object.keys(activeSpaceObjects);

    for (const projId of projectileIds) {
        const projectile = activeProjectiles[projId];
        // Skip if projectile is already gone or marked
        if (!projectile || projectile.isMarkedForRemoval) continue;

        const projRect = {
            x: projectile.x - projectile.radius,
            y: projectile.y - projectile.radius,
            width: projectile.radius * 2,
            height: projectile.radius * 2,
        };
        // Skip if projectile hitbox is invalid
        if (projRect.width <= 0 || projRect.height <= 0) continue;

        for (const objectId of spaceObjectIds) {
             const spaceObject = activeSpaceObjects[objectId];
             // Skip if object is already gone, marked, or in destruction process
             if (!spaceObject || spaceObject.isMarkedForRemoval || spaceObject._destructionInProgress) continue;

             const objectRect = spaceObject.getHitbox();
             // Skip if object hitbox is invalid
             if (!objectRect || objectRect.width <= 0 || objectRect.height <= 0) continue;

             // --- Check for AABB Collision ---
             if (checkAABBCollision(projRect, objectRect)) {
                 console.log(`Collision detected between projectile ${projId} (owner: ${projectile.ownerId}) and space object ${objectId}`);

                 // Calculate damage the projectile deals to the space object
                 const damage = calculateDamageFunc('projectile-spaceobject', spaceObject, projectile, currentTime);

                 // Apply damage to the space object via the manager
                 // This now delegates to the damage handler, respecting spawner authority
                 if (damage > 0) {
                     console.log(`Applying ${damage} projectile damage to space object ${objectId}`);
                     // Pass projectile owner ID to know who caused the potential drop and add score
                     // The manager's method will now use the damage handler internally.
                     spaceObjectManager.applyDamageToObject(objectId, damage, projectile.ownerId);
                     // applyDamageToObject handles the logic for spawner vs non-spawner
                 }

                 // Emit impact particle effect locally
                 if (particleSystem) {
                    particleSystem.emitSparks(projectile.x, projectile.y, 10, projectile.vx * 0.05, projectile.vy * 0.05);
                 }

                 // Mark the projectile for removal locally. It has hit something.
                 projectile.isMarkedForRemoval = true;

                 // A projectile can only hit one target per frame/check.
                 // Break the inner loop to move to the next projectile.
                 break;
             }
        }
    }
}