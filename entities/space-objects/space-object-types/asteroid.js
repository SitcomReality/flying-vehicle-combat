// New file: Defines the Asteroid space object type}

import { SpaceObject } from '../space-object.js';

const ASTEROID_ROTATION_SPEED_MIN = 0.2; // radians/sec
const ASTEROID_ROTATION_SPEED_MAX = 1.5;
const ASTEROID_HEALTH = 30;
const ASTEROID_VISUAL_SCALE = 0.35;
const ASTEROID_HITBOX_SCALE = 0.8; // Larger hitbox relative to visual size
const ASTEROID_VELOCITY_X_MIN = -100;
const ASTEROID_VELOCITY_X_MAX = -40;
const ASTEROID_VELOCITY_Y_MIN = -20;
const ASTEROID_VELOCITY_Y_MAX = 20;
const ASTEROID_SCORE_VALUE = 10; // Points for destroying an asteroid

export class Asteroid extends SpaceObject {
    constructor(id, type, x, y, initialState = {}) {
        // Generate random velocity and rotation within defined ranges
        const initialVx = initialState.vx ?? (Math.random() * (ASTEROID_VELOCITY_X_MAX - ASTEROID_VELOCITY_X_MIN) + ASTEROID_VELOCITY_X_MIN);
        const initialVy = initialState.vy ?? (Math.random() * (ASTEROID_VELOCITY_Y_MAX - ASTEROID_VELOCITY_Y_MIN) + ASTEROID_VELOCITY_Y_MIN);
        const initialRotationSpeed = initialState.rotationSpeed ?? (Math.random() * (ASTEROID_ROTATION_SPEED_MAX - ASTEROID_ROTATION_SPEED_MIN) + ASTEROID_ROTATION_SPEED_MIN);

        // Merge asteroid-specific defaults with any provided initial state
        const mergedInitialState = {
            vx: initialVx,
            vy: initialVy,
            rotationSpeed: initialRotationSpeed,
            health: ASTEROID_HEALTH,
            visualScale: ASTEROID_VISUAL_SCALE,
            hitboxScale: ASTEROID_HITBOX_SCALE,
            scoreValue: ASTEROID_SCORE_VALUE, // Pass score value
            ...initialState, // Allow overriding defaults
        };

        super(id, type, x, y, mergedInitialState);
    }
}