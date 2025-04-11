// New file: Handles drawing the dynamic background

const STAR_COUNT = 150;
const TWINKLE_SPEED = 0.5; // How fast stars twinkle
const STAR_COLORS = ['#FFFFFF', '#FFFFE0', '#ADD8E6', '#FFDAB9']; // White, light yellow, light blue, light orange

class BackgroundRenderer {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.stars = [];
        this.generateStars();
        console.log("BackgroundRenderer initialized.");
    }

    generateStars() {
        this.stars = [];
        for (let i = 0; i < STAR_COUNT; i++) {
            const size = Math.random() * 1.5 + 0.5; // Size between 0.5 and 2
            this.stars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: size,
                baseAlpha: 0.5 + Math.random() * 0.5, // Base brightness (0.5 to 1.0)
                alphaOffset: Math.random() * Math.PI * 2, // Random starting point for twinkle
                color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)]
            });
        }
        console.log(`Generated ${this.stars.length} stars.`);
    }

    update(deltaTime) {
        // Update twinkle effect (can be skipped if performance is an issue)
        const now = performance.now() / 1000; // Time in seconds
        this.stars.forEach(star => {
            // Use sine wave for smooth twinkle
            star.currentAlpha = star.baseAlpha * (0.75 + Math.sin(now * TWINKLE_SPEED + star.alphaOffset) * 0.25);
        });
    }

    draw(renderer) {
        const ctx = renderer.getContext();

        // 1. Draw solid dark background
        ctx.fillStyle = '#0a0514'; // Match body background or use a gradient
        ctx.fillRect(0, 0, this.width, this.height);

        // Optional Gradient:
        // const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
        // gradient.addColorStop(0, '#0a0514'); // Darker top
        // gradient.addColorStop(1, '#1a1034'); // Slightly lighter bottom
        // ctx.fillStyle = gradient;
        // ctx.fillRect(0, 0, this.width, this.height);

        // 2. Draw stars
        this.stars.forEach(star => {
            ctx.fillStyle = star.color;
            ctx.globalAlpha = star.currentAlpha; // Apply twinkle alpha
            ctx.fillRect(
                Math.floor(star.x),
                Math.floor(star.y),
                Math.ceil(star.size), // Use ceil to ensure even small stars are visible
                Math.ceil(star.size)
            );
        });
        ctx.globalAlpha = 1.0; // Reset global alpha

        // 3. TODO: Add other astral objects (planets, nebulae etc.)
    }
}

export default BackgroundRenderer;