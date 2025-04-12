// New file: Handles particle effects like sparks and smoke

const DEFAULT_PARTICLE_LIFESPAN = 0.5; // seconds
const SPARK_COLOR = 'rgba(255, 220, 100, 0.8)'; // Bright yellow/orange
const SMOKE_COLOR_START = 'rgba(200, 200, 200, 0.6)'; // Light grey
const SMOKE_COLOR_END = 'rgba(50, 50, 50, 0)'; // Fades to transparent dark grey
const SPARK_SPEED_DEVIATION = 50;
const SMOKE_SPEED_DEVIATION = 10;
const SMOKE_SIZE_START = 3;
const SMOKE_SIZE_END = 10;
const CHARGE_PARTICLE_COLOR = 'rgba(150, 180, 255, 0.7)'; // Light blue/purple
const CHARGE_PARTICLE_SPEED = 150; // Speed towards the target point
const CHARGE_PARTICLE_SPAWN_RADIUS = 50; // How far from the center particles spawn
const CHARGE_PARTICLE_LIFESPAN = 0.3; // Short lifespan

// --- New Particle Constants ---
const EXPLOSION_PARTICLE_COUNT = 50;
const EXPLOSION_LIFESPAN_MIN = 0.5;
const EXPLOSION_LIFESPAN_MAX = 1.5;
const EXPLOSION_SPEED_MIN = 50;
const EXPLOSION_SPEED_MAX = 300;
const EXPLOSION_COLORS = ['rgba(255, 100, 50, 0.9)', 'rgba(255, 200, 50, 0.9)', 'rgba(200, 200, 200, 0.8)'];

const PICKUP_PARTICLE_COUNT = 15;
const PICKUP_LIFESPAN = 0.4;
const PICKUP_SPEED = 80;
const PICKUP_SIZE = 2;
const COLLECTIBLE_COLORS = {
    COIN: 'rgba(255, 215, 0, 0.9)',   // Gold
    GEM_GREEN: 'rgba(0, 255, 127, 0.9)', // Spring Green
    GEM_RED: 'rgba(255, 69, 0, 0.9)',    // OrangeRed
    GEM_BLUE: 'rgba(30, 144, 255, 0.9)'  // DodgerBlue
};
const POWERUP_PICKUP_COLOR = 'rgba(138, 43, 226, 0.9)'; // BlueViolet

class Particle {
    constructor(x, y, vx, vy, lifespan, colorStart, colorEnd = null, sizeStart = 2, sizeEnd = 2) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.lifespan = lifespan;
        this.life = lifespan;
        this.colorStart = colorStart;
        this.colorEnd = colorEnd || colorStart; // If no end color, it stays the start color
        this.sizeStart = sizeStart;
        this.sizeEnd = sizeEnd;
        this.isAlive = true;
        this.gravity = 0; // Optional gravity effect
    }

    update(deltaTime) {
        this.life -= deltaTime;
        if (this.life <= 0) {
            this.isAlive = false;
            return;
        }

        // Apply gravity if set
        if (this.gravity !== 0) {
            this.vy += this.gravity * deltaTime;
        }

        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
    }

    draw(ctx) {
        if (!this.isAlive) return;

        const lifeRatio = Math.max(0, this.life / this.lifespan); // 1 down to 0
        const inverseLifeRatio = 1 - lifeRatio; // 0 up to 1

        // Interpolate color
        const start = this.parseColor(this.colorStart);
        const end = this.parseColor(this.colorEnd);
        const r = Math.round(start.r + (end.r - start.r) * inverseLifeRatio);
        const g = Math.round(start.g + (end.g - start.g) * inverseLifeRatio);
        const b = Math.round(start.b + (end.b - start.b) * inverseLifeRatio);
        const a = start.a + (end.a - start.a) * inverseLifeRatio;

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;

        // Interpolate size
        const size = this.sizeStart + (this.sizeEnd - this.sizeStart) * inverseLifeRatio;

        // Simple square particle for performance
        ctx.fillRect(Math.round(this.x - size / 2), Math.round(this.y - size / 2), Math.round(size), Math.round(size));
    }

    // Helper to parse rgba strings
    parseColor(colorString) {
        const parts = colorString.match(/[\d.]+/g);
        if (parts && parts.length === 4) {
            return { r: parseFloat(parts[0]), g: parseFloat(parts[1]), b: parseFloat(parts[2]), a: parseFloat(parts[3]) };
        }
        // Fallback for simple colors or errors
        return { r: 255, g: 255, b: 255, a: 1 };
    }
}

export class ParticleSystem {
    constructor(maxParticles = 500) {
        this.particles = [];
        this.maxParticles = maxParticles;
    }

    _addParticle(particle) {
        if (this.particles.length >= this.maxParticles) {
            this.particles.shift(); // Remove the oldest particle
        }
        this.particles.push(particle);
    }

    // Generic emitter used by specific types below
    _emitInternal(x, y, count, vxBase, vyBase, vxVariance, vyVariance, lifespan, colorStart, colorEnd, sizeStart, sizeEnd) {
         for (let i = 0; i < count; i++) {

             const vx = vxBase + (Math.random() - 0.5) * 2 * vxVariance;
             const vy = vyBase + (Math.random() - 0.5) * 2 * vyVariance;
             const particleLifespan = lifespan * (Math.random() * 0.5 + 0.75); // +/- 25% variation

             this._addParticle(new Particle(
                 x, y, vx, vy,
                 particleLifespan,
                 colorStart, colorEnd,
                 sizeStart, sizeEnd
             ));
         }
    }

    // Specific emitters
    emitSparks(x, y, count = 1, baseSpeedX = 0) {
        this._emitInternal(
            x, y, count,
            baseSpeedX - 80, -50, // Base velocity (up and slightly against player movement)
            SPARK_SPEED_DEVIATION, SPARK_SPEED_DEVIATION, // Variance
            DEFAULT_PARTICLE_LIFESPAN * 0.5, // Shorter life for sparks
            SPARK_COLOR, null, // Color (no fade)
            1, 1 // Size (small, constant)
        );
    }

    emitSmoke(x, y, count = 1, baseSpeedX = 0) {
        this._emitInternal(
            x, y, count,
            baseSpeedX - 20, -10, // Base velocity (slowly drift up and slightly against player movement)
            SMOKE_SPEED_DEVIATION, SMOKE_SPEED_DEVIATION, // Variance
            DEFAULT_PARTICLE_LIFESPAN * 1.5, // Longer life for smoke
            SMOKE_COLOR_START, SMOKE_COLOR_END, // Color (fade)
            SMOKE_SIZE_START, SMOKE_SIZE_END // Size (grows)
        );
    }

    // New emitter for charging effect
    emitChargeParticles(spawnCenterX, spawnCenterY, count, targetX, targetY) {
         for (let i = 0; i < count; i++) {

             // Spawn at a random angle and distance around the spawn center
             const angle = Math.random() * Math.PI * 2;
             const radius = Math.random() * CHARGE_PARTICLE_SPAWN_RADIUS;
             const spawnX = spawnCenterX + Math.cos(angle) * radius;
             const spawnY = spawnCenterY + Math.sin(angle) * radius;

             // Calculate velocity vector towards the target point
             const dx = targetX - spawnX;
             const dy = targetY - spawnY;
             const dist = Math.sqrt(dx * dx + dy * dy);
             let vx = 0;
             let vy = 0;
             if (dist > 0) {
                 vx = (dx / dist) * CHARGE_PARTICLE_SPEED;
                 vy = (dy / dist) * CHARGE_PARTICLE_SPEED;
             }

             // Add particle
             this._addParticle(new Particle(
                 spawnX, spawnY, vx, vy,
                 CHARGE_PARTICLE_LIFESPAN,
                 CHARGE_PARTICLE_COLOR, null, // Color (no fade)
                 1, 1 // Size (small)
             ));
         }
    }

    // --- New Emitters ---

    emitExplosion(x, y, count = EXPLOSION_PARTICLE_COUNT) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * (EXPLOSION_SPEED_MAX - EXPLOSION_SPEED_MIN) + EXPLOSION_SPEED_MIN;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const lifespan = Math.random() * (EXPLOSION_LIFESPAN_MAX - EXPLOSION_LIFESPAN_MIN) + EXPLOSION_LIFESPAN_MIN;
            const color = EXPLOSION_COLORS[Math.floor(Math.random() * EXPLOSION_COLORS.length)];
            const size = Math.random() * 3 + 1; // Size 1 to 4

            const particle = new Particle(x, y, vx, vy, lifespan, color, null, size, size * 0.5);
            particle.gravity = 150; // Add some gravity to explosion particles
            this._addParticle(particle);
        }
    }

    _emitPickupEffect(x, y, color) {
        for (let i = 0; i < PICKUP_PARTICLE_COUNT; i++) {
            const angle = Math.random() * Math.PI * 2;
            const vx = Math.cos(angle) * PICKUP_SPEED * (Math.random() * 0.5 + 0.75);
            const vy = Math.sin(angle) * PICKUP_SPEED * (Math.random() * 0.5 + 0.75);
            // Fading color
            const colorEnd = color.replace(/[\d.]+\)$/g, '0)'); // Fade to transparent

            this._addParticle(new Particle(
                x, y, vx, vy,
                PICKUP_LIFESPAN * (Math.random() * 0.4 + 0.8), // Vary lifespan slightly
                color, colorEnd,
                PICKUP_SIZE, PICKUP_SIZE * 0.5 // Shrink slightly
            ));
        }
    }

    emitCollectiblePickup(x, y, collectibleType) {
        const color = COLLECTIBLE_COLORS[collectibleType] || COLLECTIBLE_COLORS.COIN; // Fallback to coin color
        this._emitPickupEffect(x, y, color);
    }

    emitPowerupPickup(x, y) {
        this._emitPickupEffect(x, y, POWERUP_PICKUP_COLOR);
    }

    // --- End New Emitters ---


    update(deltaTime) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(deltaTime);
            if (!this.particles[i].isAlive) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        // Could consider optimizations like sorting by color/texture later
        this.particles.forEach(p => p.draw(ctx));
    }
}