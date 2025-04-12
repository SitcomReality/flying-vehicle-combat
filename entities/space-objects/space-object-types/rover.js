// New file: Defines the Rover space object type

import { SpaceObject } from '../space-object.js';

const ROVER_HEALTH = 60; // Tougher than lander
const ROVER_VISUAL_SCALE = 0.35;
const ROVER_HITBOX_SCALE = 0.8;
const ROVER_VELOCITY_X_MIN = -80;
const ROVER_VELOCITY_X_MAX = -40;
const ROVER_VELOCITY_Y = 0; // Stays on ground
const ROVER_SCORE_VALUE = 20;

export class Rover extends SpaceObject {
    constructor(id, type, x, y, initialState = {}, groundLevelY) {
        // Generate random horizontal velocity
        const initialVx = initialState.vx ?? (Math.random() * (ROVER_VELOCITY_X_MAX - ROVER_VELOCITY_X_MIN) + ROVER_VELOCITY_X_MIN);

        const mergedInitialState = {
            vx: initialVx,
            vy: ROVER_VELOCITY_Y,
            rotationSpeed: 0, // No rotation
            health: ROVER_HEALTH,
            visualScale: ROVER_VISUAL_SCALE,
            hitboxScale: ROVER_HITBOX_SCALE,
            scoreValue: ROVER_SCORE_VALUE,
            ...initialState, // Allow overriding defaults
        };

        super(id, type, x, y, mergedInitialState);

        // Ensure Rover starts on the ground
        // Adjust Y based on its calculated draw height and the ground level
        this.y = groundLevelY - (this.drawHeight / 2); // Place center on ground
    }

    // Override update for specific Rover behavior
    update(deltaTime, gameBounds, groundLevelY) {
        if (this.isMarkedForRemoval) return;

        // Horizontal movement
        this.x += this.vx * deltaTime;

        // Ensure Rover stays on the ground (adjust Y based on visual height)
        this.y = groundLevelY - (this.drawHeight / 2);

        // Remove if off-screen left
        if (this.x + this.drawWidth < 0) {
            this.isMarkedForRemoval = true;
        }
    }

     // Override getSyncData if needed for Rover-specific state
     getSyncData() {
         const baseData = super.getSyncData();
         // Rovers don't have much unique dynamic state other than position/health yet
         return baseData;
     }
}