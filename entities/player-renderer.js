// New file: Handles rendering the player

/**
 * Draws the player sprite onto the canvas context.
 * @param {CanvasRenderingContext2D} ctx - The rendering context.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {object} assets - The loaded image assets (e.g., { vehicles: Image }).
 * @param {number} renderScale - The scale factor to apply to the sprite size.
 */
export function drawPlayer(ctx, playerState, assets, renderScale) {
    if (playerState.isMarkedForRemoval || !playerState.currentVehicle) return;

    if (!assets.vehicles || !assets.vehicles.complete || assets.vehicles.naturalWidth === 0) {
        console.warn(`Missing or unloaded vehicle asset for player ${playerState.id}`);
        // Draw a placeholder if assets aren't ready
        ctx.fillStyle = 'purple';
        const placeholderSize = 32 * renderScale;
        ctx.fillRect(playerState.x, playerState.y, placeholderSize, placeholderSize);
        return;
    }

    const spriteConfig = playerState.currentVehicle;
    const spriteSheet = assets.vehicles;

    const spriteDrawWidth = spriteConfig.width * renderScale;
    const spriteDrawHeight = spriteConfig.height * renderScale;

    // Calculate the visual top-left position where the sprite *frame* should start drawing
    const drawX = Math.round(playerState.x - playerState.drawOffsetX * renderScale);
    const drawY = Math.round(playerState.y - playerState.drawOffsetY * renderScale);

    // Calculate the visual center for rotation and flipping transformations
    const visualCenterX = drawX + spriteDrawWidth / 2;
    const visualCenterY = drawY + spriteDrawHeight / 2;

    ctx.save(); // Save the current context state

    try {
        // Apply transformations: Translate -> Rotate -> Scale (Flip) -> Translate Back
        ctx.translate(visualCenterX, visualCenterY); // Move origin to visual center

        // Apply rotation
        ctx.rotate(playerState.rotation);

        // Apply horizontal flip based on VISUAL facing direction
        if (playerState.visualFacingDirection === 1) {
            ctx.scale(-1, 1); // Flip horizontally
        }

        ctx.translate(-visualCenterX, -visualCenterY); // Move origin back

        // Draw the image sprite
        ctx.drawImage(
            spriteSheet,
            spriteConfig.x, spriteConfig.y, // Source x, y in the spritesheet
            spriteConfig.width, spriteConfig.height, // Source width, height
            drawX, // Destination x (top-left of sprite frame before transform)
            drawY, // Destination y (top-left of sprite frame before transform)
            spriteDrawWidth, // Destination width
            spriteDrawHeight // Destination height
        );
    } catch (e) {
        console.error(`Error during player draw for ${playerState.id}:`, e);
    } finally {
        ctx.restore(); // Restore the context regardless of errors
    }

    // --- Debug Drawing (Optional) ---
    // ctx.strokeStyle = playerState.isLocalPlayer ? 'blue' : 'red';
    // ctx.lineWidth = 1;
    // // Hitbox (anchor point and logical dimensions)
    // ctx.strokeRect(
    //     Math.round(playerState.x), Math.round(playerState.y),
    //     playerState.width * renderScale, playerState.height * renderScale
    // );
    // // Visual sprite bounds
    // ctx.strokeStyle = 'lime';
    // ctx.strokeRect(drawX, drawY, spriteDrawWidth, spriteDrawHeight);
    // // Rotation/Flip center
    // ctx.fillStyle = 'yellow';
    // ctx.fillRect(visualCenterX - 1, visualCenterY - 1, 3, 3);
}