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
const CHARGE_PARTICLE_MIN_SPAWN_RADIUS = 5; // Minimum radius when charge starts
const CHARGE_PARTICLE_MAX_SPAWN_RADIUS = 60; // Max radius when fully charged
const CHARGE_PARTICLE_LIFESPAN = 0.3; // Short lifespan
const CHARGE_PARTICLE_EMIT_RATE = 3; // Particles per frame while charging

// --- Fully Charged Effect Constants ---
const FULLY_CHARGED_PARTICLE_COLOR = 'rgba(255, 100, 80, 0.6)'; // Red/Orange, slightly transparent
const FULLY_CHARGED_PARTICLE_COUNT = 2; // Fewer particles than charging
const FULLY_CHARGED_PARTICLE_SPEED_MIN = 10;
const FULLY_CHARGED_PARTICLE_SPEED_MAX = 40;
const FULLY_CHARGED_PARTICLE_LIFESPAN = 0.4;
const FULLY_CHARGED_PARTICLE_SIZE = 1.5;
const FULLY_CHARGED_PARTICLE_EMIT_RATE = 2; // Emit rate while fully charged

// --- Explosion Particle Constants ---
const OBJ_EXPLOSION_PARTICLE_COUNT = 40; // Increased slightly
const PLAYER_EXPLOSION_PARTICLE_COUNT = 100; // Increased significantly for player
const EXPLOSION_LIFESPAN_MIN = 0.4;
const EXPLOSION_LIFESPAN_MAX = 1.2;
const EXPLOSION_SPEED_MIN = 40;
const EXPLOSION_SPEED_MAX = 250;
const PLAYER_EXPLOSION_SPEED_MAX = 450; // Increased significantly for player
const EXPLOSION_COLORS_OBJ = ['rgba(255, 160, 80, 0.9)', 'rgba(200, 200, 200, 0.8)', 'rgba(100, 100, 100, 0.7)']; // Orange/grey
const EXPLOSION_COLORS_PLAYER = ['rgba(255, 100, 50, 0.9)', 'rgba(255, 200, 50, 0.9)', 'rgba(255, 255, 255, 0.8)', 'rgba(200, 50, 50, 0.8)']; // More vibrant orange/red/white
const EXPLOSION_GRAVITY = 150; // Gravity effect on explosion particles

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
    constructor(maxParticles = 1500) { // Increased max particles for bigger explosions
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
    _emitInternal(x, y, count, vxBase, vyBase, vxVariance, vyVariance, lifespan, colorStart, colorEnd, sizeStart, sizeEnd) {
         for (let i = 0; i < count; i++) {
             // Prevent adding more if max is reached during emission loop
             if (this.particles.length >= this.maxParticles) break;

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
                 1, 1 // Size (small)
             ));
         }
    }

    // New emitter for fully charged sustain effect
    emitFullyChargedSustain(emitX, emitY, count = FULLY_CHARGED_PARTICLE_COUNT) {
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
            const size = Math.random() * 3 + 1; // Size 1 to 4

            const particle = new Particle(x, y, vx, vy, lifespan, color, null, size, size * 0.5);
            particle.gravity = EXPLOSION_GRAVITY; // Add some gravity to explosion particles
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
    SPARK_SPEED_DEVIATION,
    SMOKE_SPEED_DEVIATION,
    SMOKE_SIZE_START,
    SMOKE_SIZE_END
};