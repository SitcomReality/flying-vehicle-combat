// New file: Base class for collectible items

import { getCollectibleSpriteFrame } from './collectible-types.js';

class Collectible {
    constructor(id, type, x, y, value) {
        this.id = id;         // Unique identifier (e.g., "collectible-123")
        this.type = type;       // CollectibleType enum value
        this.x = x;           // Position x
        this.y = y;           // Position y
        this.value = value;     // Score value
        this.spriteFrame = getCollectibleSpriteFrame(type); // Get sprite data
        this.isMarkedForRemoval = false; // Flag for cleanup
        this.bobOffset = Math.random() * Math.PI * 2; // Random start offset for bobbing
        this.bobSpeed = 2.5;    // Speed of bobbing
        this.bobRange = 4;    // Max distance to bob up/down
        this.radius = 15;     // Collision radius (adjust as needed)
        this.creationTime = performance.now();
        this.lifespan = 15000; // 15 seconds before disappearing
    }

    update(deltaTime) {
        // Simple bobbing effect
        this.bobOffset += this.bobSpeed * deltaTime;
        // Wrap bobOffset to prevent large numbers
        if (this.bobOffset > Math.PI * 2) {
            this.bobOffset -= Math.PI * 2;
        }

        // Check lifespan
        if (performance.now() - this.creationTime > this.lifespan) {
            this.isMarkedForRemoval = true; // Mark for removal if lifetime expires
        }
    }

    draw(ctx, assets, renderScale) {
        if (this.isMarkedForRemoval || !this.spriteFrame || !assets.collectibles) return;

        const spriteSheet = assets.collectibles;
        const frame = this.spriteFrame;

        // Scale the collectible visually (adjust as needed)
        const visualScale = renderScale * 1.2; // Slightly larger
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
            console.error(`Error drawing collectible ${this.id}:`, e);
        }

        // --- Debug Drawing (Optional) ---
        // ctx.strokeStyle = 'yellow';
        // ctx.lineWidth = 1;
        // ctx.beginPath();
        // ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        // ctx.stroke();
    }
}

export default Collectible;