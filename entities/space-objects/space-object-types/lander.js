// New file: Defines the Lander space object type

import { SpaceObject } from '../space-object.js';

const LANDER_HEALTH = 40;
const LANDER_VISUAL_SCALE = 0.3;
const LANDER_HITBOX_SCALE = 0.75;
const LANDER_VELOCITY_X_MIN = -60;
const LANDER_VELOCITY_X_MAX = -30;
const LANDER_VELOCITY_Y = 0; // Doesn't move vertically on its own much
const LANDER_SCORE_VALUE = 15;
const LANDER_BOB_SPEED = 1.5; // How fast it bobs
const LANDER_BOB_RANGE = 5; // How far it bobs

export class Lander extends SpaceObject {
    constructor(id, type, x, y, initialState = {}) {
        // Generate random horizontal velocity
        const initialVx = initialState.vx ?? (Math.random() * (LANDER_VELOCITY_X_MAX - LANDER_VELOCITY_X_MIN) + LANDER_VELOCITY_X_MIN);

        const mergedInitialState = {
            vx: initialVx,
            vy: LANDER_VELOCITY_Y,
            rotationSpeed: 0, // No rotation
            health: LANDER_HEALTH,
            visualScale: LANDER_VISUAL_SCALE,
            hitboxScale: LANDER_HITBOX_SCALE,
            scoreValue: LANDER_SCORE_VALUE,
            ...initialState, // Allow overriding defaults
        };

        super(id, type, x, y, mergedInitialState);

        // Specific state for Lander bobbing
        this.baseY = y; // Store the initial Y to bob around
        this.bobOffset = Math.random() * Math.PI * 2; // Random start for bobbing cycle
    }

    // Override update for specific Lander behavior
    update(deltaTime, gameBounds, groundLevelY) {
        if (this.isMarkedForRemoval) return;

        // Horizontal movement
        this.x += this.vx * deltaTime;

        // Bobbing vertical movement
        this.bobOffset += LANDER_BOB_SPEED * deltaTime;
        if (this.bobOffset > Math.PI * 2) {
            this.bobOffset -= Math.PI * 2;
        }
        this.y = this.baseY + Math.sin(this.bobOffset) * LANDER_BOB_RANGE;

        // Keep base Y updated in case it was modified externally (unlikely but safe)
        // We don't re-base on every frame, only if y differs significantly from expected bob
        if (Math.abs(this.y - (this.baseY + Math.sin(this.bobOffset) * LANDER_BOB_RANGE)) > LANDER_BOB_RANGE * 2) {
            this.baseY = this.y - Math.sin(this.bobOffset) * LANDER_BOB_RANGE;
        }

        // Remove if off-screen left
        if (this.x + this.drawWidth < 0) {
            this.isMarkedForRemoval = true;
        }
    }

     // Override getSyncData if needed for Lander-specific state
     getSyncData() {
         const baseData = super.getSyncData();
         return {
             ...baseData,
             baseY: this.baseY, // Include baseY if needed for sync consistency
             // bobOffset doesn't strictly need sync if movement is deterministic
         };
     }
}
