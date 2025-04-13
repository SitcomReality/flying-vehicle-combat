// New file: Handles particle effects like sparks and smoke

// --- Increased Spectacle Constants ---
const DEFAULT_PARTICLE_LIFESPAN = 0.8; // Increased from 0.5
const SPARK_COLOR = 'rgba(255, 230, 120, 0.9)'; // Brighter yellow/orange
const SMOKE_COLOR_START = 'rgba(220, 220, 220, 0.7)'; // Lighter grey start
const SMOKE_COLOR_END = 'rgba(60, 60, 60, 0)'; // Fades to transparent darker grey
const SPARK_SPEED_BASE = 100; // Base speed magnitude
const SPARK_SPEED_DEVIATION = 120; // Increased variance
const SMOKE_SPEED_BASE = 40;   // Base speed magnitude
const SMOKE_SPEED_DEVIATION = 30; // Increased variance
const SMOKE_SIZE_START = 4; // Larger start
const SMOKE_SIZE_END = 18; // Larger end
const SPARK_EMIT_RATE = 15; // Increased sparks/second (probabilistic)
const SMOKE_EMIT_RATE = 10; // Increased smoke/second (probabilistic)

const CHARGE_PARTICLE_COLOR = 'rgba(180, 200, 255, 0.8)'; // Slightly brighter blue/purple
const CHARGE_PARTICLE_SPEED = 250; // Increased speed towards the target point
const CHARGE_PARTICLE_MIN_SPAWN_RADIUS = 8; // Slightly larger start radius
const CHARGE_PARTICLE_MAX_SPAWN_RADIUS = 80; // Larger max radius
const CHARGE_PARTICLE_LIFESPAN = 0.4; // Slightly longer lifespan
const CHARGE_PARTICLE_EMIT_RATE = 3; // Reduced particles per frame while charging

// --- Fully Charged Effect Constants ---
const FULLY_CHARGED_PARTICLE_COLOR = 'rgba(255, 120, 100, 0.8)'; // Brighter Red/Orange
const FULLY_CHARGED_PARTICLE_COUNT = 3; // Slightly more particles
const FULLY_CHARGED_PARTICLE_SPEED_MIN = 20;
const FULLY_CHARGED_PARTICLE_SPEED_MAX = 60; // Increased range
const FULLY_CHARGED_PARTICLE_LIFESPAN = 0.5; // Longer lifespan
const FULLY_CHARGED_PARTICLE_SIZE = 2.5; // Larger size
const FULLY_CHARGED_PARTICLE_EMIT_RATE = 2; // Reduced emit rate

// --- Explosion Particle Constants ---
const OBJ_EXPLOSION_PARTICLE_COUNT = 100; // Significantly Increased
const PLAYER_EXPLOSION_PARTICLE_COUNT = 250; // Massively Increased
const EXPLOSION_LIFESPAN_MIN = 0.6; // Increased min
const EXPLOSION_LIFESPAN_MAX = 1.8; // Increased max
const EXPLOSION_SPEED_MIN = 60; // Increased min
const EXPLOSION_SPEED_MAX = 400; // Increased max for objects
const PLAYER_EXPLOSION_SPEED_MAX = 700; // Increased max for players
const EXPLOSION_COLORS_OBJ = ['rgba(255, 180, 100, 1.0)', 'rgba(230, 230, 230, 0.9)', 'rgba(150, 150, 150, 0.8)']; // Brighter
const EXPLOSION_COLORS_PLAYER = ['rgba(255, 120, 70, 1.0)', 'rgba(255, 220, 70, 1.0)', 'rgba(255, 255, 255, 1.0)', 'rgba(220, 70, 70, 0.9)']; // More vibrant
const EXPLOSION_GRAVITY = 250; // Increased gravity effect

// --- Pickup Particle Constants ---
const PICKUP_PARTICLE_COUNT = 30; // Increased count
const PICKUP_LIFESPAN = 0.6; // Increased lifespan
const PICKUP_SPEED = 120; // Increased speed
const PICKUP_SIZE = 3; // Increased size
const COLLECTIBLE_COLORS = {
    COIN: 'rgba(255, 225, 50, 1.0)',   // Brighter Gold
    GEM_GREEN: 'rgba(50, 255, 150, 1.0)', // Brighter Green
    GEM_RED: 'rgba(255, 80, 50, 1.0)',    // Brighter Red
    GEM_BLUE: 'rgba(50, 160, 255, 1.0)'  // Brighter Blue
};
const POWERUP_PICKUP_COLOR = 'rgba(180, 80, 255, 1.0)'; // Brighter Violet

// --- Projectile Impact Constants ---
const IMPACT_PARTICLE_COUNT = 25;
const IMPACT_SPEED_MIN = 50;
const IMPACT_SPEED_MAX = 180;
const IMPACT_LIFESPAN = 0.4;
const IMPACT_SIZE_START = 3;
const IMPACT_SIZE_END = 0.5;
const IMPACT_GRAVITY = 150; // Slight gravity on impact fragments
const IMPACT_REFLECTION_FACTOR = 0.1; // How much to push away from source velocity

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
        // Fallback for simple colors or errors (e.g., 'red')
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        ctx.fillStyle = colorString || 'white';
        const colorData = ctx.fillStyle; // This forces browser to parse it
        if (colorData.startsWith('#')) { // Simple hex fallback
             const hex = colorData.substring(1);
             const bigint = parseInt(hex, 16);
             return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255, a: 1 };
        }
        // Check if it's rgba again after browser parsing
        const rgbaParts = colorData.match(/[\d.]+/g);
        if (rgbaParts && rgbaParts.length === 4) {
             return { r: parseFloat(rgbaParts[0]), g: parseFloat(rgbaParts[1]), b: parseFloat(rgbaParts[2]), a: parseFloat(rgbaParts[3]) };
        }

        // If still not parsable, default to white
        console.warn(`Could not parse color string: ${colorString}. Defaulting to white.`);
        return { r: 255, g: 255, b: 255, a: 1 };
    }
}

class ParticleSystem {
    constructor(maxParticles = 3000) { // Increased max particles further
        this.particles = [];
        this.maxParticles = maxParticles;
        // Pre-parse colors if needed for performance, though likely negligible here
    }

    _addParticle(particle) {
        if (this.particles.length >= this.maxParticles) {
            // Find the oldest particle to remove (could optimize this)
             let oldestIndex = 0;
             for(let i=1; i < this.particles.length; ++i) {
                 if (this.particles[i].life < this.particles[oldestIndex].life) {
                     oldestIndex = i;
                 }
             }
             this.particles.splice(oldestIndex, 1);
        }
        this.particles.push(particle);
    }

    // Generic emitter used by specific types below
    _emitInternal(x, y, count, vxBase, vyBase, vxVariance, vyVariance, lifespan, colorStart, colorEnd, sizeStart, sizeEnd, gravity = 0) {
         for (let i = 0; i < count; i++) {
             // Prevent adding more if max is reached during emission loop
             if (this.particles.length >= this.maxParticles) break;

             const vx = vxBase + (Math.random() - 0.5) * 2 * vxVariance;
             const vy = vyBase + (Math.random() - 0.5) * 2 * vyVariance;
             const particleLifespan = lifespan * (Math.random() * 0.5 + 0.75); // +/- 25% variation

             const particle = new Particle(
                 x, y, vx, vy,
                 particleLifespan,
                 colorStart, colorEnd,
                 sizeStart, sizeEnd
             );
             particle.gravity = gravity; // Apply gravity if specified
             this._addParticle(particle);
         }
    }

    // Specific emitters using probabilistic emission based on rate
    // Count parameter is now ignored, emission based on rate * deltaTime
    emitSparks(x, y, count = 0, baseSpeedX = 0) {
        const emitCount = Math.floor(SPARK_EMIT_RATE * (1/60) + Math.random()); // Probabilistic count based on rate (assuming ~60fps)
        if (emitCount <= 0) return;

        this._emitInternal(
            x, y, emitCount, // Use calculated emit count
            baseSpeedX, -SPARK_SPEED_BASE, // Base velocity (up and against player movement)
            SPARK_SPEED_DEVIATION, SPARK_SPEED_DEVIATION, // Variance
            DEFAULT_PARTICLE_LIFESPAN * 0.7, // Slightly shorter life for sparks?
            SPARK_COLOR, null, // Color (no fade)
            1.5, 0.5, // Size (starts slightly larger, shrinks)
            EXPLOSION_GRAVITY * 0.5 // Add some gravity to sparks
        );
    }

    emitSmoke(x, y, count = 0, baseSpeedX = 0) {
        const emitCount = Math.floor(SMOKE_EMIT_RATE * (1/60) + Math.random()); // Probabilistic count
        if (emitCount <= 0) return;

        this._emitInternal(
            x, y, emitCount, // Use calculated emit count
            baseSpeedX, -SMOKE_SPEED_BASE, // Base velocity (slowly drift up and against player movement)
            SMOKE_SPEED_DEVIATION, SMOKE_SPEED_DEVIATION, // Variance
            DEFAULT_PARTICLE_LIFESPAN * 2.0, // Longer life for smoke
            SMOKE_COLOR_START, SMOKE_COLOR_END, // Color (fade)
            SMOKE_SIZE_START, SMOKE_SIZE_END, // Size (grows)
            0 // No gravity for smoke
        );
    }

    // Updated emitter for charging effect
    emitChargeParticles(spawnCenterX, spawnCenterY, count, targetX, targetY, chargeRatio) {
         // Calculate current spawn radius based on charge ratio
         const currentSpawnRadius = CHARGE_PARTICLE_MIN_SPAWN_RADIUS + chargeRatio * (CHARGE_PARTICLE_MAX_SPAWN_RADIUS - CHARGE_PARTICLE_MIN_SPAWN_RADIUS);

         for (let i = 0; i < count; i++) {
            if (this.particles.length >= this.maxParticles) break;

             // Spawn at a random angle and distance around the spawn center using current radius
             const angle = Math.random() * Math.PI * 2;
             const radius = Math.random() * currentSpawnRadius; // Use calculated radius
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
                 1.5, 1.5 // Size (slightly larger)
             ));
         }
    }

    // New emitter for fully charged sustain effect
    emitFullyChargedSustain(emitX, emitY, count = FULLY_CHARGED_PARTICLE_EMIT_RATE) { // Count uses rate
        for (let i = 0; i < count; i++) {
            if (this.particles.length >= this.maxParticles) break;

            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * (FULLY_CHARGED_PARTICLE_SPEED_MAX - FULLY_CHARGED_PARTICLE_SPEED_MIN) + FULLY_CHARGED_PARTICLE_SPEED_MIN;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const lifespan = FULLY_CHARGED_PARTICLE_LIFESPAN * (Math.random() * 0.4 + 0.8); // +/- 20% variation
            const colorEnd = FULLY_CHARGED_PARTICLE_COLOR.replace(/[\d.]+\)$/g, '0)'); // Fade to transparent

            this._addParticle(new Particle(
                emitX, emitY, vx, vy,
                lifespan,
                FULLY_CHARGED_PARTICLE_COLOR, colorEnd, // Color (fade)
                FULLY_CHARGED_PARTICLE_SIZE, FULLY_CHARGED_PARTICLE_SIZE * 0.5 // Size (shrinks)
            ));
        }
    }

    // --- Updated Explosion Emitter ---

    /**
     * Emits an explosion effect.
     * @param {number} x - Center X coordinate.
     * @param {number} y - Center Y coordinate.
     * @param {number} count - Number of particles.
     * @param {number} speedMin - Minimum particle speed.
     * @param {number} speedMax - Maximum particle speed.
     * @param {Array<string>} colors - Array of possible color strings (rgba).
     */
    emitExplosion(x, y, count = OBJ_EXPLOSION_PARTICLE_COUNT, speedMin = EXPLOSION_SPEED_MIN, speedMax = EXPLOSION_SPEED_MAX, colors = EXPLOSION_COLORS_OBJ) {
        // console.log(`Emitting explosion at ${x.toFixed(0)}, ${y.toFixed(0)} with ${count} particles.`); // Debug log
        for (let i = 0; i < count; i++) {
             if (this.particles.length >= this.maxParticles) break;

            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * (speedMax - speedMin) + speedMin;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const lifespan = Math.random() * (EXPLOSION_LIFESPAN_MAX - EXPLOSION_LIFESPAN_MIN) + EXPLOSION_LIFESPAN_MIN;
            const color = colors[Math.floor(Math.random() * colors.length)];
             // Ensure alpha doesn't go below a minimum to keep particles visible longer
             const colorEnd = color.replace(/[\d.]+\)$/g, `${Math.random() * 0.2 + 0.1})`); // Fade to low alpha
            const size = Math.random() * 4 + 2; // Size 2 to 6

            const particle = new Particle(x, y, vx, vy, lifespan, color, colorEnd, size, size * 0.3); // Shrink more drastically
            particle.gravity = EXPLOSION_GRAVITY; // Add gravity to explosion particles
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

// --- Export Constants ---
export {
    ParticleSystem,
    // Explosion Constants
    OBJ_EXPLOSION_PARTICLE_COUNT,
    PLAYER_EXPLOSION_PARTICLE_COUNT,
    EXPLOSION_LIFESPAN_MIN,
    EXPLOSION_LIFESPAN_MAX,
    EXPLOSION_SPEED_MIN,
    EXPLOSION_SPEED_MAX,
    PLAYER_EXPLOSION_SPEED_MAX,
    EXPLOSION_COLORS_OBJ,
    EXPLOSION_COLORS_PLAYER,
    EXPLOSION_GRAVITY,
    // Pickup Constants (if needed elsewhere)
    PICKUP_PARTICLE_COUNT,
    PICKUP_LIFESPAN,
    PICKUP_SPEED,
    PICKUP_SIZE,
    COLLECTIBLE_COLORS,
    POWERUP_PICKUP_COLOR,
    // Charging Constants (if needed elsewhere)
    CHARGE_PARTICLE_COLOR,
    CHARGE_PARTICLE_SPEED,
    CHARGE_PARTICLE_MIN_SPAWN_RADIUS,
    CHARGE_PARTICLE_MAX_SPAWN_RADIUS,
    CHARGE_PARTICLE_LIFESPAN,
    CHARGE_PARTICLE_EMIT_RATE,
    // Fully Charged Constants
    FULLY_CHARGED_PARTICLE_COLOR,
    FULLY_CHARGED_PARTICLE_COUNT,
    FULLY_CHARGED_PARTICLE_SPEED_MIN,
    FULLY_CHARGED_PARTICLE_SPEED_MAX,
    FULLY_CHARGED_PARTICLE_LIFESPAN,
    FULLY_CHARGED_PARTICLE_SIZE,
    FULLY_CHARGED_PARTICLE_EMIT_RATE,
    // Spark/Smoke Constants (if needed elsewhere)
    SPARK_COLOR,
    SMOKE_COLOR_START,
    SMOKE_COLOR_END,
    SPARK_SPEED_BASE,
    SPARK_SPEED_DEVIATION,
    SMOKE_SPEED_BASE,
    SMOKE_SPEED_DEVIATION,
    SMOKE_SIZE_START,
    SMOKE_SIZE_END,
    SPARK_EMIT_RATE,
    SMOKE_EMIT_RATE,
    DEFAULT_PARTICLE_LIFESPAN
};