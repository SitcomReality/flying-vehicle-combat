class Renderer {
    constructor(canvas, width, height) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = width;
        this.height = height;

        this.canvas.width = this.width;
        this.canvas.height = this.height;

        // Improve performance on some browsers
        this.ctx.imageSmoothingEnabled = false;

        console.log(`Renderer initialized with size ${width}x${height}`);
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        // Optional: Fill with a background color or image
        // this.ctx.fillStyle = '#e0f0ff'; // Light blue background example
        // this.ctx.fillRect(0, 0, this.width, this.height);
    }

    getContext() {
        return this.ctx;
    }

    // Helper for drawing text (useful for debug/names)
    drawText(text, x, y, color = '#000000', font = '12px Arial', align = 'left', baseline = 'top') {
        this.ctx.fillStyle = color;
        this.ctx.font = font;
        this.ctx.textAlign = align;
        this.ctx.textBaseline = baseline;
        this.ctx.fillText(text, x, y);
    }

     // Helper for drawing sprites (using sprite-renderer logic)
     drawSprite(spriteSheet, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) {
        if (!spriteSheet || !spriteSheet.complete || spriteSheet.naturalWidth === 0) {
            // console.warn("Attempted to draw with invalid spritesheet");
            // Draw a placeholder if the image isn't ready
            this.ctx.fillStyle = 'red';
            this.ctx.fillRect(dx, dy, dWidth, dHeight);
            return;
        }
        this.ctx.drawImage(
            spriteSheet,
            sx, sy, sWidth, sHeight, // Source rectangle
            Math.round(dx), Math.round(dy), dWidth, dHeight // Destination rectangle
        );
    }
}

export default Renderer;

