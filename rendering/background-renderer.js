// New file: Handles rendering the dynamic background

class BackgroundRenderer {
    constructor(ctx, width, height, numStars = 200) {
        this.ctx = ctx;
        this.width = width;
        this.height = height;
        this.stars = [];
        this.numStars = numStars;

        // Ground properties
        this.groundHeight = 30; // Height of the ground visual
        this.groundY = this.height - this.groundHeight;
        this.groundColor = '#4a423a'; // Dusty brown/grey color
        this.groundLineColor = '#6b5f53'; // Slightly lighter line for texture

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
                star.y = Math.random() * (this.height - this.groundHeight); // Ensure stars don't spawn below ground level visually
            }
        });
    }

    draw() {
        // Draw Stars
        this.stars.forEach(star => {
            // Only draw stars above the ground visually
            if (star.y < this.groundY) {
                this.ctx.fillStyle = star.color;
                this.ctx.globalAlpha = star.opacity; // Use individual star opacity

                // Draw circle for stars
                this.ctx.beginPath();
                this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
        this.ctx.globalAlpha = 1.0; // Reset global alpha

        // Draw Ground
        this.ctx.fillStyle = this.groundColor;
        this.ctx.fillRect(0, this.groundY, this.width, this.groundHeight);

        // Add a subtle top line for definition
        this.ctx.strokeStyle = this.groundLineColor;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.groundY + 1); // Offset slightly down
        this.ctx.lineTo(this.width, this.groundY + 1);
        this.ctx.stroke();
    }

    getGroundLevel() {
        return this.groundY;
    }
}

export default BackgroundRenderer;