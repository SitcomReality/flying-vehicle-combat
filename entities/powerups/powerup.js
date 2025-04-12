// New file: Represents an active powerup instance in the game world

import { getPowerupSpriteFrame } from './powerup-types.js';

class Powerup {
    constructor(id, type, x, y, radius) {
        this.id = id;         // Unique identifier (e.g., "powerup-123")
        this.type = type;       // PowerupType enum value
        this.x = x;           // Position x
        this.y = y;           // Position y
        this.radius = radius;   // Collision radius
        this.spriteFrame = getPowerupSpriteFrame(type); // Get sprite data
        this.isMarkedForRemoval = false; // Flag for cleanup
        this.bobOffset = Math.random() * Math.PI * 2; // Random start offset for bobbing
        this.bobSpeed = 2;    // Speed of bobbing
        this.bobRange = 3;    // Max distance to bob up/down
        this.creationTime = performance.now(); // Timestamp for spawner sync checks
    }

    update(deltaTime) {
        // Simple bobbing effect using internal offset and speed
        this.bobOffset += this.bobSpeed * deltaTime;
        // Keep offset within reasonable bounds to prevent large numbers
        if (this.bobOffset > Math.PI * 4) { // Allow a bit more than 2PI before reset
             this.bobOffset -= Math.PI * 2;
        }
    }

    draw(ctx, assets, renderScale) {
        if (this.isMarkedForRemoval || !this.spriteFrame || !assets.powerups) return;

        const spriteSheet = assets.powerups;
        const frame = this.spriteFrame;

        // Scale the powerup visually (adjust as needed)
        const visualScale = renderScale * 1.5; // Make powerups slightly larger than player scale implies
        const drawWidth = frame.width * visualScale;
        const drawHeight = frame.height * visualScale;
        const drawX = Math.round(this.x - drawWidth / 2);
        // Apply bobbing offset to Y position using Math.sin
        const currentBob = Math.sin(this.bobOffset) * this.bobRange;
        const drawY = Math.round(this.y - drawHeight / 2 + currentBob);

        try {
            ctx.drawImage(
                spriteSheet,
                frame.x, frame.y, frame.width, frame.height, // Source
                drawX, drawY, drawWidth, drawHeight           // Destination
            );
        } catch (e) {
            console.error(`Error drawing powerup ${this.id}:`, e);
        }

        // --- Debug Drawing (Optional) ---
        // ctx.strokeStyle = 'magenta';
        // ctx.lineWidth = 1;
        // ctx.beginPath();
        // ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        // ctx.stroke();
    }
}

export default Powerup;