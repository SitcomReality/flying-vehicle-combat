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
        if (!projectile || projectile.isMarkedForRemoval) continue;

        const projRect = {
            x: projectile.x - projectile.radius,
            y: projectile.y - projectile.radius,
            width: projectile.radius * 2,
            height: projectile.radius * 2,
        };
        if (projRect.width <= 0 || projRect.height <= 0) continue;

        for (const objectId of spaceObjectIds) {
             const spaceObject = activeSpaceObjects[objectId];
             if (!spaceObject || spaceObject.isMarkedForRemoval) continue;

             const objectRect = spaceObject.getHitbox();
             if (!objectRect || objectRect.width <= 0 || objectRect.height <= 0) continue;

             if (checkAABBCollision(projRect, objectRect)) {
                 // Collision detected!
                 console.log(`Collision detected between projectile ${projId} (owner: ${projectile.ownerId}) and space object ${objectId}`);

                 // Calculate damage to the space object
                 const damage = calculateDamageFunc('projectile-spaceobject', spaceObject, projectile, currentTime);

                 // Apply damage to the space object via the manager
                 if (damage > 0) {
                     console.log(`Applying ${damage} projectile damage to space object ${objectId}`);
                     // Pass projectile owner ID to know who caused the potential drop and add score
                     const destroyed = spaceObjectManager.applyDamageToObject(objectId, damage, projectile.ownerId);
                     // applyDamageToObject returns true if destroyed
                 }

                 // Emit impact effect
                 particleSystem?.emitSparks(projectile.x, projectile.y, 10, projectile.vx * 0.05, projectile.vy * 0.05);

                 // Mark the projectile for removal
                 projectile.isMarkedForRemoval = true;

                 // A projectile hits only one thing
                 break;
             }
        }
    }
}