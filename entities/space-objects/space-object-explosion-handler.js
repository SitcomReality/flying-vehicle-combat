// New file: Handles explosion effects for space objects to reduce code in SpaceObjectManager

import { 
    OBJ_EXPLOSION_PARTICLE_COUNT, 
    EXPLOSION_SPEED_MIN, 
    EXPLOSION_SPEED_MAX, 
    EXPLOSION_COLORS_OBJ 
} from '../../rendering/particle-system.js';

/**
 * Handles creating explosion effects when space objects are destroyed
 */
export function createObjectExplosionEffect(obj, particleSystem) {
    if (!obj || !particleSystem) {
        console.warn("[SpaceObjExplosion] Cannot create explosion: Missing object or particle system");
        return false;
    }

    console.log(`[SpaceObjExplosion] Creating explosion for object at (${obj.x.toFixed(0)}, ${obj.y.toFixed(0)})`);
    
    try {
        // Create the explosion effect at the object's position
        particleSystem.emitExplosion(
            obj.x,
            obj.y,
            OBJ_EXPLOSION_PARTICLE_COUNT, // Use object-specific count
            EXPLOSION_SPEED_MIN, // Use standard min speed
            EXPLOSION_SPEED_MAX, // Use object-specific max speed
            EXPLOSION_COLORS_OBJ // Use object-specific colors
        );
        return true;
    } catch (error) {
        console.error('[SpaceObjExplosion] Error creating explosion effect:', error);
        return false;
    }
}
