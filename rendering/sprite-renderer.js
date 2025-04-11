// This file might contain more complex sprite rendering logic later,
// like animations or batching. For now, the core logic can live
// within the Player/Entity classes or the main Renderer as a helper.

// Example function (can be integrated elsewhere):
function drawSpriteFrame(ctx, spriteSheet, frame, destX, destY, scale = 1) {
    if (!spriteSheet || !frame) {
        console.warn("Missing spritesheet or frame data for drawing.");
        return;
    }

    ctx.drawImage(
        spriteSheet,
        frame.x, frame.y, frame.width, frame.height, // Source rect
        Math.round(destX), Math.round(destY), // Destination position
        frame.width * scale, frame.height * scale // Destination size
    );
}

// We can centralize sprite drawing logic here if needed.
// For now, keeping it simple.
export { drawSpriteFrame };


