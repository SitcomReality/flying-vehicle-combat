import { GLOBAL_PHYSICS } from './player-state.js';
import { BASE_PLAYER_PHYSICS } from '../config/vehicle-config.js';

const PROJECTILE_RADIUS = 4;
const PROJECTILE_LIFESPAN = 3; // seconds

// Visual enhancement constants
const GLOW_INTENSITY_BASE = 0.6;
const TRAIL_MAX_LENGTH = 20; // Max trail points to keep
const TRAIL_FADE_FACTOR = 0.85; // How much alpha decreases per trail segment

// Define the reasons for removal
export const ProjectileRemovalReason = {
    HIT_PLAYER: 'hit_player',
    HIT_OBJECT: 'hit_object',
    GROUND: 'ground',
    BOUNDS: 'bounds',
    LIFESPAN: 'lifespan',
};

class Projectile {
    constructor(id, ownerId, x, y, vx, vy, color = 'yellow', damage = 10, gravityFactor = GLOBAL_PHYSICS.PROJECTILE_GRAVITY_FACTOR) {
        this.id = id;
        this.ownerId = ownerId;
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.radius = PROJECTILE_RADIUS;
        this.creationTime = performance.now();
        this.lifespan = PROJECTILE_LIFESPAN * 1000; // milliseconds
        this.isMarkedForRemoval = false;
        this.removalReason = null;
        this.damage = damage;
        this.gravityFactor = gravityFactor;
        this.isLocal = false;

        // --- Visual Enhancement State ---
        this.trail = []; // Array of {x, y} positions for trail effect
        this.lastTrailUpdateTime = 0;
        this.trailUpdateInterval = 16; // Update trail every ~16ms (60fps)

        this.logCounter = 0;
    }

    markForRemoval(reason = null) {
        if (!this.isMarkedForRemoval) {
            this.isMarkedForRemoval = true;
            this.removalReason = reason;
        }
    }

    update(deltaTime, groundLevelY) {
        if (this.isMarkedForRemoval) return;

        const now = performance.now();

        // Check lifespan first
        if (now - this.creationTime > this.lifespan) {
            this.markForRemoval(ProjectileRemovalReason.LIFESPAN);
            return;
        }

        // --- Update Trail ---
        if (now - this.lastTrailUpdateTime > this.trailUpdateInterval) {
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > TRAIL_MAX_LENGTH) {
                this.trail.shift(); // Remove oldest trail point
            }
            this.lastTrailUpdateTime = now;
        }

        // --- Vertical Physics ---
        const gravityForce = GLOBAL_PHYSICS.GRAVITY * this.gravityFactor * deltaTime;
        this.vy += gravityForce;

        const dragForce = -this.vy * BASE_PLAYER_PHYSICS.PROJECTILE_VERTICAL_DRAG_FACTOR * deltaTime;
        this.vy += dragForce;

        // --- Update Position ---
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // Check ground collision
        if (this.y + this.radius >= groundLevelY) {
            this.y = groundLevelY - this.radius;
            this.markForRemoval(ProjectileRemovalReason.GROUND);
            return;
        }

        // Check screen bounds
        const gameWidth = 800;
        if (this.x < -this.radius || this.x > gameWidth + this.radius || this.y < -this.radius) {
            this.markForRemoval(ProjectileRemovalReason.BOUNDS);
            return;
        }
    }

    draw(ctx) {
        if (this.isMarkedForRemoval) return;

        // --- Draw Trail ---
        if (this.trail.length > 1) {
            for (let i = 0; i < this.trail.length; i++) {
                const point = this.trail[i];
                const trailAlpha = (i / this.trail.length) * 0.4; // Fade from 0 to 0.4 along trail
                const trailRadius = this.radius * (i / this.trail.length); // Shrink along trail

                ctx.fillStyle = `rgba(255, 255, 255, ${trailAlpha})`;
                ctx.beginPath();
                ctx.arc(point.x, point.y, trailRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // --- Calculate Glow Intensity based on Damage ---
        // Higher damage projectiles have more intense glow
        const damageRatio = Math.min(1, (this.damage - 10) / 30); // Normalize damage (10-40) to 0-1
        const glowIntensity = GLOW_INTENSITY_BASE + damageRatio * 0.5; // 0.6 to 1.1

        // --- Draw Glow Halo ---
        const glowRadius = this.radius * (1.5 + damageRatio * 0.5); // Glow scales with damage
        ctx.fillStyle = `rgba(255, 200, 100, ${glowIntensity * 0.3})`; // Warm glow
        ctx.beginPath();
        ctx.arc(this.x, this.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Secondary glow ring for extra effect
        const secondaryGlowRadius = glowRadius * 1.4;
        ctx.fillStyle = `rgba(255, 180, 80, ${glowIntensity * 0.15})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, secondaryGlowRadius, 0, Math.PI * 2);
        ctx.fill();

        // --- Draw Core Projectile ---
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // --- Draw Inner Highlight ---
        // Create a subtle inner glow/shine for visual interest
        const highlightGradient = ctx.createRadialGradient(
            this.x - this.radius * 0.3, this.y - this.radius * 0.3, 0,
            this.x, this.y, this.radius
        );
        highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = highlightGradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // --- Add Pulsing Glow for High-Damage Projectiles ---
        if (damageRatio > 0.5) { // If damage is significant
            const pulseAmount = Math.sin(performance.now() * 0.003) * 0.2; // Pulse over time
            ctx.strokeStyle = `rgba(255, 120, 60, ${(damageRatio + pulseAmount) * 0.6})`;
            ctx.lineWidth = 1 + damageRatio;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 2, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

export default Projectile;