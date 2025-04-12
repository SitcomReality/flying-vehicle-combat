// New file: Represents an active powerup instance in the game world

import { getPowerupSpriteFrame } from './powerup-types.js';

class Powerup {
    // Added creationTime and lifespan parameters
    constructor(id, type, x, y, radius, creationTime = performance.now(), lifespan = 10000) { // Default 10 second lifespan
        this.id = id;         // Unique identifier (e.g., "powerup-123")
        this.type = type;       // PowerupType enum value
        this.x = x;           // Position x
        this.y = y;           // Position y
        this.radius = radius;   // Collision radius
        this.spriteFrame = getPowerupSpriteFrame(type); // Get sprite data
        this.isMarkedForRemoval = false; // Flag for cleanup
        this.bobOffset = Math.random() * Math.PI * 2; // Random start for bobbing
        this.bobSpeed = 2.5;    // Speed of bobbing
        this.bobRange = 4;    // Max distance to bob up/down

        // --- Added Lifespan Properties ---
        this.creationTime = creationTime; // Timestamp when created (synced from spawner)
        this.lifespan = lifespan;         // Duration in milliseconds before expiry
        // --- End Added ---
    }

    update(deltaTime) {
        // Simple bobbing effect
        this.bobOffset += this.bobSpeed * deltaTime;
        // Wrap bobOffset to prevent large numbers
        if (this.bobOffset > Math.PI * 2) {
            this.bobOffset -= Math.PI * 2;
        }

        // Check lifespan (handled by manager now, but keep local check for immediate marking)
        if (this.isExpired(performance.now())) {
            this.isMarkedForRemoval = true;
        }
    }

     // Helper to check if the powerup's lifespan has expired
     isExpired(currentTime) {
         // Only expire if lifespan is greater than 0 (0 means permanent or instant)
         return this.lifespan > 0 && (currentTime - this.creationTime > this.lifespan);
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
        // Apply bobbing offset to Y position
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