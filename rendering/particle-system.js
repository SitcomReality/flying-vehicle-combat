// New file: Handles particle effects like sparks and smoke

const DEFAULT_PARTICLE_LIFESPAN = 0.5; // seconds
const SPARK_COLOR = 'rgba(255, 220, 100, 0.8)'; // Bright yellow/orange
const SMOKE_COLOR_START = 'rgba(200, 200, 200, 0.6)'; // Light grey
const SMOKE_COLOR_END = 'rgba(50, 50, 50, 0)'; // Fades to transparent dark grey
const SPARK_SPEED_DEVIATION = 50;
const SMOKE_SPEED_DEVIATION = 10;
const SMOKE_SIZE_START = 3;
const SMOKE_SIZE_END = 10;

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
    }

    update(deltaTime) {
        this.life -= deltaTime;
        if (this.life <= 0) {
            this.isAlive = false;
            return;
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
        ctx.fillRect(this.x - size / 2, this.y - size / 2, size, size);
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

    emit(x, y, count, vxBase, vyBase, vxVariance, vyVariance, lifespan, colorStart, colorEnd, sizeStart, sizeEnd) {
        for (let i = 0; i < count; i++) {
            if (this.particles.length >= this.maxParticles) {
                 // Optional: Remove oldest particle to make space
                 this.particles.shift();
                 // console.warn("Max particles reached, removing oldest.");
            }

            const vx = vxBase + (Math.random() - 0.5) * 2 * vxVariance;
            const vy = vyBase + (Math.random() - 0.5) * 2 * vyVariance;
            const particleLifespan = lifespan * (Math.random() * 0.5 + 0.75); // +/- 25% variation

            this.particles.push(new Particle(
                x, y, vx, vy,
                particleLifespan,
                colorStart, colorEnd,
                sizeStart, sizeEnd
            ));
        }
    }

    // Specific emitters
    emitSparks(x, y, count = 1, baseSpeedX = 0) {
        this.emit(
            x, y, count,
            baseSpeedX - 80, -50, // Base velocity (up and slightly against player movement)
            SPARK_SPEED_DEVIATION, SPARK_SPEED_DEVIATION, // Variance
            DEFAULT_PARTICLE_LIFESPAN * 0.5, // Shorter life for sparks
            SPARK_COLOR, null, // Color (no fade)
            1, 1 // Size (small, constant)
        );
    }

    emitSmoke(x, y, count = 1, baseSpeedX = 0) {
        this.emit(
            x, y, count,
            baseSpeedX - 20, -10, // Base velocity (slowly drift up and slightly against player movement)
            SMOKE_SPEED_DEVIATION, SMOKE_SPEED_DEVIATION, // Variance
            DEFAULT_PARTICLE_LIFESPAN * 1.5, // Longer life for smoke
            SMOKE_COLOR_START, SMOKE_COLOR_END, // Color (fade)
            SMOKE_SIZE_START, SMOKE_SIZE_END // Size (grows)
        );
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