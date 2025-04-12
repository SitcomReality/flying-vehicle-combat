/**
 * Checks for collision between two axis-aligned bounding boxes (AABB).
 * Assumes x, y are top-left corners defined by the entity's state or hitbox method.
 * @param {object} rect1 - { x, y, width, height }
 * @param {object} rect2 - { x, y, width, height }
 * @returns {boolean} - True if the rectangles collide, false otherwise.
 */
export function checkAABBCollision(rect1, rect2) {
    // Check if either rectangle is invalid (e.g., zero width/height)
    if (!rect1 || !rect2 || rect1.width <= 0 || rect1.height <= 0 || rect2.width <= 0 || rect2.height <= 0) {
        return false;
    }
    return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
    );
}