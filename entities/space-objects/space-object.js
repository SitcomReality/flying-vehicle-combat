// New file: Base class for space objects like asteroids, landers, rovers.

import { SPRITES } from '../../config/sprites.js';

// Default properties (can be overridden by subtypes)
const DEFAULT_HEALTH = 50;
const DEFAULT_SIZE_SCALE = 0.3; // Visual scale relative to sprite frame size
const DEFAULT_HITBOX_SCALE = 0.7; // Hitbox scale relative to visual size
const DEFAULT_SCORE_VALUE = 5; // Default points awarded on destruction
const INTERPOLATION_FACTOR = 0.15; // How quickly remote objects visually catch up
const INTERPOLATION_SNAP_THRESHOLD_SQ = 150 * 150; // Squared distance threshold to snap position instantly

export class SpaceObject {
    constructor(id, type, x, y, initialState = {}) {
        this.id = id;
        this.type = type; // e.g., 'asteroid', 'lander', 'rover'

        // --- Authoritative State (synced from Spawner) ---
        this.x = x;
        this.y = y;
        this.vx = initialState.vx ?? -50; // Default horizontal drift left
        this.vy = initialState.vy ?? 0;
        this.rotation = initialState.rotation ?? 0;
        this.health = initialState.health ?? DEFAULT_HEALTH;
        this.scoreValue = initialState.scoreValue ?? DEFAULT_SCORE_VALUE; // Points awarded

        // --- Local State (mostly for non-spawner clients) ---
        this.rotationSpeed = initialState.rotationSpeed ?? 0; // Radians per second (local visual only unless synced)
        this.creationTime = performance.now();
        this.isMarkedForRemoval = false;
        this._destructionInProgress = false; // Add flag to prevent duplicate destroy calls
        this.maxHealth = this.health; // Store initial health as max

        // --- Network Interpolation State (for non-spawner clients) ---
        this.serverX = x;
        this.serverY = y;
        this.serverRotation = this.rotation;
        this.serverVx = this.vx; // Sync velocity for smoother interpolation? Maybe later.
        this.serverVy = this.vy;
        this.serverHealth = this.health; // Keep track of server health separately for visuals
        this.lastServerUpdateTime = 0;

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

    // Interpolates visual state towards server state (for non-spawners)
    interpolateState(factor = INTERPOLATION_FACTOR) {
        const dx = this.serverX - this.x;
        const dy = this.serverY - this.y;
        const distSq = dx*dx + dy*dy;

        // Snap if too far apart
        if (distSq > INTERPOLATION_SNAP_THRESHOLD_SQ) {
            this.x = this.serverX;
            this.y = this.serverY;
            this.rotation = this.serverRotation; // Snap rotation too
        } else {
            // Interpolate position and rotation
            this.x += dx * factor;
            this.y += dy * factor;
            // Interpolate rotation (simple lerp, handle wrap-around if needed)
            this.rotation += (this.serverRotation - this.rotation) * factor;
        }
        // Optionally interpolate velocity for smoother visual updates between packets?
        // this.vx += (this.serverVx - this.vx) * factor * 0.5; // Slower velocity interp
        // this.vy += (this.serverVy - this.vy) * factor * 0.5;

        // Interpolate health for smoother visuals (less jumpy than snapping)
        this.health += (this.serverHealth - this.health) * factor * 0.5; // Slow interp
        this.health = Math.max(0, Math.min(this.health, this.maxHealth)); // Clamp interpolated health

    }

    // Base update method: Calculates physics based on CURRENT state (x, y, vx, vy)
    // Spawner calls this to calculate authoritative state.
    // Non-spawners call this AFTER interpolateState to predict next visual frame.
    update(deltaTime, gameBounds, groundLevelY) {
        // Check removal flags at the start
        if (this.isMarkedForRemoval || this._destructionInProgress) return;

        // Basic physics update based on current velocity
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.rotation += this.rotationSpeed * deltaTime; // Update rotation based on local speed

        // Remove if off-screen left (applies to both spawner and non-spawner)
        const removalBuffer = 50;
        if (this.x + this.drawWidth + removalBuffer < 0) {
            // Don't log removal here, let the manager handle it based on who owns it
            this.isMarkedForRemoval = true;
        }
    }

    // Base draw method
    draw(ctx, assets, renderScale) { // renderScale might not be needed if using internal visualScale
        // Use interpolated health for drawing, but authoritative health for logic
        const displayHealth = this.health; // Use interpolated health for drawing

        if (this.isMarkedForRemoval || !this.spriteFrame || !assets.space_objects || this._destructionInProgress || displayHealth <= 0) return;

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

            // --- Health Bar (Optional, drawn before sprite) ---
            // const barWidth = this.drawWidth * 0.8;
            // const barHeight = 4;
            // const barX = drawX + (this.drawWidth - barWidth) / 2;
            // const barY = drawY - barHeight - 3; // Above sprite
            // const healthRatio = Math.max(0, displayHealth / this.maxHealth);
            // ctx.fillStyle = 'rgba(100, 100, 100, 0.7)';
            // ctx.fillRect(barX, barY, barWidth, barHeight);
            // ctx.fillStyle = 'rgba(200, 50, 50, 0.9)';
            // ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
            // --- End Health Bar ---


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
    }

    // Base method for taking damage - updates authoritative health
    takeDamage(amount) {
        if (this.isMarkedForRemoval || this._destructionInProgress || this.health <= 0) return false;

        // Use authoritative health for damage calculation
        const authoritativeHealth = this.serverHealth; // Or just this.health if spawner
        const newHealth = authoritativeHealth - amount;

        this.health = Math.max(0, newHealth); // Update local visual health immediately
        this.serverHealth = this.health; // Keep serverHealth in sync for spawner

        // console.log(`Space object ${this.id} took ${amount} damage. Health: ${this.health}`);
        if (this.health <= 0) {
            // console.log(`Space object ${this.id} health <= 0. Marking for destruction.`);
            this.isMarkedForRemoval = true; // Mark it, the manager will handle full destruction
            return true; // Was destroyed (health depleted)
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

    getSyncData() {
        // Send authoritative state
        return {
            type: this.type,
            x: this.x,
            y: this.y,
            vx: this.vx,
            vy: this.vy,
            rotation: this.rotation,
            // rotationSpeed: this.rotationSpeed, // Sync rotation speed if needed for consistency
            health: this.health,
            scoreValue: this.scoreValue, // Include score value in sync data
            // Include any other state needed for subtypes (like lander's baseY?)
        };
    }
}