// New file: Contains helper functions related to player visual calculations

/**
 * Calculates the visual center of the player sprite's bounding box.
 * Accounts for draw offsets defined in the sprite configuration.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {number} renderScale - The global render scale factor.
 * @returns {{x: number, y: number, topY: number}} Object containing visual center x, y and visual top y. Returns {0, 0, 0} if state or vehicle invalid.
 */
export function getVisualCenter(playerState, renderScale) {
    if (!playerState || !playerState.currentVehicle) {
        console.warn("getVisualCenter called with invalid state or vehicle.");
        return { x: 0, y: 0, topY: 0 }; // Return zero coords on error
    }

    const spriteConfig = playerState.currentVehicle;
    const spriteDrawWidth = spriteConfig.width * renderScale;
    const spriteDrawHeight = spriteConfig.height * renderScale;

    // Calculate the visual top-left based on state position and DRAW offset
    const drawX = playerState.x - playerState.drawOffsetX * renderScale;
    const drawY = playerState.y - playerState.drawOffsetY * renderScale;

    // Calculate visual center
    const visualCenterX = drawX + spriteDrawWidth / 2;
    const visualCenterY = drawY + spriteDrawHeight / 2;

    return { x: Math.round(visualCenterX), y: Math.round(visualCenterY), topY: Math.round(drawY) };
}

/**
 * Calculates the approximate position of the player vehicle's "nose" or firing point.
 * Accounts for sprite rotation and facing direction.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {number} renderScale - The global render scale factor.
 * @returns {{x: number, y: number}} Coordinates of the nose position. Returns {0, 0} if state or vehicle invalid.
 */
export function getVisualNosePosition(playerState, renderScale) {
    if (!playerState || !playerState.currentVehicle) {
         console.warn("getVisualNosePosition called with invalid state or vehicle.");
        return { x: 0, y: 0 }; // Return zero coords on error
    }

    const visualCenter = getVisualCenter(playerState, renderScale);
    const spriteConfig = playerState.currentVehicle;
    const spriteDrawWidth = spriteConfig.width * renderScale;

    // Distance from visual center to nose (approx. half the sprite width)
    const noseOffset = spriteDrawWidth / 2;

    // Calculate angle based on rotation and VISUAL facing direction
    let angle;
    if (playerState.visualFacingDirection === 1) { // Facing Right (flipped sprite)
        angle = playerState.rotation;
    } else { // Facing Left (normal sprite)
        angle = Math.PI + playerState.rotation; // Add 180 degrees (PI radians)
    }

    // Calculate nose position relative to visual center
    const noseX = visualCenter.x + Math.cos(angle) * noseOffset;
    const noseY = visualCenter.y + Math.sin(angle) * noseOffset;

    return { x: Math.round(noseX), y: Math.round(noseY) };
}