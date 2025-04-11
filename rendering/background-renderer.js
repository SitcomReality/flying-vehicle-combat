// New file: Handles rendering the dynamic background

class BackgroundRenderer {
    constructor(ctx, width, height, numStars = 200) {
        this.ctx = ctx;
        this.width = width;
        this.height = height;
        this.stars = [];
        this.numStars = numStars;

        this.generateStars();
    }

    generateStars() {
        this.stars = [];
        for (let i = 0; i < this.numStars; i++) {
            this.stars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: Math.random() * 1.5 + 0.5, // Star size between 0.5 and 2
                speed: Math.random() * 0.5 + 0.1, // Star speed between 0.1 and 0.6 px/frame
                opacity: Math.random() * 0.5 + 0.5, // Opacity between 0.5 and 1.0
                color: `rgba(255, 255, ${Math.floor(Math.random() * 55) + 200}, ${Math.random() * 0.5 + 0.5})` // Mostly white/yellowish
            });
        }
         // Add a few larger, slower "planets" or nebulae (optional)
        for (let i = 0; i < 5; i++) {
            this.stars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: Math.random() * 5 + 3, // Larger size
                speed: Math.random() * 0.1 + 0.05, // Slower speed
                opacity: Math.random() * 0.2 + 0.1, // Fainter
                 // Colors: blues, purples, faint reds
                color: `rgba(${Math.floor(Math.random() * 50 + 100)}, ${Math.floor(Math.random() * 50 + 100)}, ${Math.floor(Math.random() * 100 + 155)}, ${Math.random() * 0.2 + 0.1})`
            });
        }
    }

    update(deltaTime) {
        // Adjust speed based on deltaTime, assuming 60fps baseline for speed values
        const speedMultiplier = deltaTime * 60;
        this.stars.forEach(star => {
            star.x -= star.speed * speedMultiplier; // Move stars from right to left

            // Wrap stars around the screen
            if (star.x < -star.size) {
                star.x = this.width + star.size;
                star.y = Math.random() * this.height; // Re-randomize Y for variety
            }
        });
    }

    draw() {
        // Clear canvas with a dark space color (or leave transparent if layered)
        // this.ctx.fillStyle = '#0a0a1a'; // Very dark blue/purple
        // this.ctx.fillRect(0, 0, this.width, this.height);

        this.stars.forEach(star => {
            this.ctx.fillStyle = star.color;
            this.ctx.globalAlpha = star.opacity; // Use individual star opacity

            // Draw circle for stars
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            this.ctx.fill();

            // Simple glow effect (optional, can impact performance)
            // this.ctx.shadowBlur = star.size * 2;
            // this.ctx.shadowColor = star.color;
            // this.ctx.fill(); // Fill again with shadow enabled
            // this.ctx.shadowBlur = 0; // Reset shadow

        });
         this.ctx.globalAlpha = 1.0; // Reset global alpha
    }
}

export default BackgroundRenderer;