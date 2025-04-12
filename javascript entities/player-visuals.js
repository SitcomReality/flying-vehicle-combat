// New file: Contains helper functions for calculating visual properties of the player

/**
 * Calculates the visual center and drawing position of the player sprite frame.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {number} renderScale - The rendering scale factor.
 * @returns {{centerX: number, centerY: number, drawX: number, drawY: number, spriteDrawWidth: number, spriteDrawHeight: number}}
 */
export function getSpriteVisuals(playerState, renderScale) {
    const spriteConfig = playerState.currentVehicle;
    if (!spriteConfig) {
        // Fallback if vehicle data isn't loaded/set yet
        return {
            centerX: playerState.x,
            centerY: playerState.y,
            drawX: playerState.x,
            drawY: playerState.y,
            spriteDrawWidth: 0,
            spriteDrawHeight: 0
        };
    }

    const spriteDrawWidth = spriteConfig.width * renderScale;
    const spriteDrawHeight = spriteConfig.height * renderScale;
    // Calculate the top-left corner for drawing the sprite frame
    const drawX = Math.round(playerState.x - playerState.drawOffsetX * renderScale);
    const drawY = Math.round(playerState.y - playerState.drawOffsetY * renderScale);
    // Calculate the center based on the drawing position and dimensions
    const centerX = drawX + spriteDrawWidth / 2;
    const centerY = drawY + spriteDrawHeight / 2;

    return { centerX, centerY, drawX, drawY, spriteDrawWidth, spriteDrawHeight };
}

/**
 * Calculates the visual center and top Y coordinate of the sprite frame.
 * Useful for positioning UI elements like names or status bars.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {number} renderScale - The rendering scale factor.
 * @returns {{x: number, y: number, topY: number}} Visual center x/y and top y coordinate.
 */
export function getVisualCenter(playerState, renderScale) {
    const { centerX, centerY, drawY } = getSpriteVisuals(playerState, renderScale);
    return {
        x: centerX, // The calculated horizontal center of the sprite frame
        y: centerY, // The calculated vertical center of the sprite frame
        topY: drawY // The top Y coordinate where the sprite frame begins drawing
    };
}

/**
 * Calculates the visual position of the vehicle's nose, considering rotation and facing direction.
 * @param {PlayerState} playerState - The state object of the player.
 * @param {number} renderScale - The rendering scale factor.
 * @returns {{x: number, y: number}} The calculated nose position.
 */
export function getVisualNosePosition(playerState, renderScale) {
    const visuals = getSpriteVisuals(playerState, renderScale);
    if (!playerState.currentVehicle) return { x: visuals.centerX, y: visuals.centerY }; // Fallback

    const noseOffsetFactor = 0.45; // How far from the center the nose is (0=center, 0.5=edge)

    // Vector from center to unrotated nose position, aligned with the visual facing direction
    const noseVecX = playerState.visualFacingDirection * visuals.spriteDrawWidth * noseOffsetFactor;
    const noseVecY = 0; // Assume nose is horizontally aligned with center before rotation

    // Rotate this vector by playerState.rotation
    const cosR = Math.cos(playerState.rotation);
    const sinR = Math.sin(playerState.rotation);

    // Calculate the rotated offset from the center point
    const finalOffsetX = (noseVecX * cosR - noseVecY * sinR);
    const finalOffsetY = (noseVecX * sinR + noseVecY * cosR);

    // The final nose position is the visual center plus the rotated offset.
    const finalNoseX = visuals.centerX + finalOffsetX;
    const finalNoseY = visuals.centerY + finalOffsetY;

    return { x: finalNoseX, y: finalNoseY };
}