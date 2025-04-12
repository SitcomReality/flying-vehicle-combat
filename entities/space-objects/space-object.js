// New file: Base class for space objects like asteroids, landers, rovers.

import { SPRITES } from '../../config/sprites.js';

// Default properties (can be overridden by subtypes)
const DEFAULT_HEALTH = 50;
const DEFAULT_SIZE_SCALE = 0.3; // Visual scale relative to sprite frame size
const DEFAULT_HITBOX_SCALE = 0.7; // Hitbox scale relative to visual size
const DEFAULT_SCORE_VALUE = 5; // Default points awarded on destruction

export class SpaceObject {
    constructor(id, type, x, y, initialState = {}) {
        this.id = id;
        this.type = type; // e.g., 'asteroid', 'lander', 'rover'
        this.x = x;
        this.y = y;
        this.vx = initialState.vx ?? -50; // Default horizontal drift left
        this.vy = initialState.vy ?? 0;
        this.rotation = initialState.rotation ?? 0;
        this.rotationSpeed = initialState.rotationSpeed ?? 0; // Radians per second
        this.health = initialState.health ?? DEFAULT_HEALTH;
        this.maxHealth = this.health; // Store initial health as max
        this.creationTime = performance.now();
        this.isMarkedForRemoval = false;
        this.scoreValue = initialState.scoreValue ?? DEFAULT_SCORE_VALUE; // Points awarded
        // *** Added flag to track if first update ran ***
        this._firstUpdateRan = false;

        // Get sprite frame based on type
        this.spriteFrame = this._getSpriteFrame(type);
        if (!this.spriteFrame) {
            console.error(`Could not find sprite frame for space object type: ${type}. Marking for removal.`);
            this.isMarkedForRemoval = true;
            return;
        }

        // Visual properties
        this.visualScale = initialState.visualScale ?? DEFAULT_SIZE_SCALE;
        this.drawWidth = this.spriteFrame.width * this.visualScale;
        this.drawHeight = this.spriteFrame.height * this.visualScale;
        this.drawOffsetX = this.drawWidth / 2; // Center anchor point
        this.drawOffsetY = this.drawHeight / 2;

        // Collision properties
        this.hitboxScale = initialState.hitboxScale ?? DEFAULT_HITBOX_SCALE;
        this.hitboxWidth = this.drawWidth * this.hitboxScale;
        this.hitboxHeight = this.drawHeight * this.hitboxScale;
        this.hitboxOffsetX = this.hitboxWidth / 2;
        this.hitboxOffsetY = this.hitboxHeight / 2;
    }

    _getSpriteFrame(type) {
        const frame = SPRITES.space_objects.frames.find(f => f.name === type);
        return frame;
    }

    // Base update method (can be overridden by subtypes)
    update(deltaTime, gameBounds, groundLevelY) {
        // *** Log initial position on first update ***
        if (!this._firstUpdateRan) {
            console.log(`SpaceObject ${this.id} (${this.type}) first update. Initial pos: (${this.x.toFixed(0)}, ${this.y.toFixed(0)})`);
            this._firstUpdateRan = true;
        }
        if (this.isMarkedForRemoval) return;

        // Basic movement
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.rotation += this.rotationSpeed * deltaTime;

        // Remove if off-screen left
        if (this.x + this.drawWidth < 0) {
            // *** Added log for off-screen removal ***
            console.log(`SpaceObject ${this.id} (${this.type}) removed off-screen left at x=${this.x.toFixed(0)}`);
            this.isMarkedForRemoval = true;
        }
        // *** Added log for off-screen right (should not happen with current vx) ***
        else if (this.x - this.drawWidth > gameBounds.width) {
            console.log(`SpaceObject ${this.id} (${this.type}) removed off-screen right at x=${this.x.toFixed(0)}`);
            this.isMarkedForRemoval = true;
        }
        // *** Added log for off-screen top/bottom ***
        else if (this.y + this.drawHeight < 0 || this.y - this.drawHeight > gameBounds.height) {
            console.log(`SpaceObject ${this.id} (${this.type}) removed off-screen vertically at y=${this.y.toFixed(0)}`);
            this.isMarkedForRemoval = true;
        }
    }

    // Base draw method
    draw(ctx, assets, renderScale) { // renderScale might not be needed if using internal visualScale
        if (this.isMarkedForRemoval || !this.spriteFrame || !assets.space_objects) return;

        const spriteSheet = assets.space_objects;
        const frame = this.spriteFrame;

        const drawX = Math.round(this.x - this.drawOffsetX);
        const drawY = Math.round(this.y - this.drawOffsetY);

        ctx.save();
        try {
            // Center-based rotation
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.translate(-this.x, -this.y);

            ctx.drawImage(
                spriteSheet,
                frame.x, frame.y, frame.width, frame.height, // Source
                drawX, drawY, this.drawWidth, this.drawHeight // Destination
            );
        } catch (e) {
            console.error(`Error drawing space object ${this.id}:`, e);
        } finally {
            ctx.restore();
        }

        // --- Debug Drawing (Optional) ---
        // ctx.strokeStyle = 'cyan';
        // ctx.lineWidth = 1;
        // // Visual bounds
        // ctx.strokeRect(drawX, drawY, this.drawWidth, this.drawHeight);
        // // Hitbox bounds (centered)
        // const hitboxDrawX = Math.round(this.x - this.hitboxOffsetX);
        // const hitboxDrawY = Math.round(this.y - this.hitboxOffsetY);
        // ctx.strokeStyle = 'lime';
        // ctx.strokeRect(hitboxDrawX, hitboxDrawY, this.hitboxWidth, this.hitboxHeight);
        // // Center point
        // ctx.fillStyle = 'red';
        // ctx.fillRect(this.x - 1, this.y - 1, 3, 3);
    }

    // Base method for taking damage
    takeDamage(amount) {
        if (this.isMarkedForRemoval) return false;

        this.health -= amount;
        // console.log(`Space object ${this.id} took ${amount} damage. Health: ${this.health}`); // Reduced logging noise
        if (this.health <= 0) {
            this.isMarkedForRemoval = true;
            console.log(`Space object ${this.id} destroyed.`);
            // TODO: Trigger drop system? Create explosion effect?
            return true; // Was destroyed
        }
        return false; // Took damage but survived
    }

    getHitbox() {
        return {
            x: this.x - this.hitboxOffsetX,
            y: this.y - this.hitboxOffsetY,
            width: this.hitboxWidth,
            height: this.hitboxHeight,
        };
    }

    // Data for roomState synchronization
    getSyncData() {
        return {
            type: this.type,
            x: this.x,
            y: this.y,
            vx: this.vx,
            vy: this.vy,
            rotation: this.rotation,
            rotationSpeed: this.rotationSpeed,
            health: this.health,
            scoreValue: this.scoreValue, // Include score value in sync data
            // Include any other state needed for subtypes
        };
    }
}