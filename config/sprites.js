// New file to define sprite sheet configurations

const SPRITES = {
    vehicles: {
        sheet: '/iono_vehicle_spritesheet.png',
        frameWidth: 256,
        frameHeight: 256,
        hitboxHeight: 128, // Effective height for gameplay
        frames: [
            // Vehicle 1
            { x: 0, y: 0, width: 256, height: 256, hitbox: { width: 256, height: 128, offsetX: 0, offsetY: (256 - 128) / 2 } },
            // Vehicle 2
            { x: 256, y: 0, width: 256, height: 256, hitbox: { width: 256, height: 128, offsetX: 0, offsetY: (256 - 128) / 2 } },
            // Vehicle 3
            { x: 512, y: 0, width: 256, height: 256, hitbox: { width: 256, height: 128, offsetX: 0, offsetY: (256 - 128) / 2 } }
        ]
    },
    collectibles: {
        sheet: '/iono_collectibles_spritesheet.png',
        frameWidth: 128,
        frameHeight: 128,
        frames: [
            // Row 1
            { name: 'green_diamond', x: 0, y: 0, width: 128, height: 128 }, // Green Diamond
            { name: 'gold_coin', x: 128, y: 0, width: 128, height: 128 }, // Gold Coin
            // Row 2
            { name: 'red_gem', x: 0, y: 128, width: 128, height: 128 },   // Red Gem
            { name: 'blue_gem', x: 128, y: 128, width: 128, height: 128 }  // Blue Gem
        ]
    },
    powerups: {
        sheet: '/iono_powerups_spritesheet.png',
        frameWidth: 128,
        frameHeight: 192,
        frames: [
            // Row 1
            { name: 'rocket', x: 0, y: 0, width: 128, height: 192 },
            { name: 'lightning', x: 128, y: 0, width: 128, height: 192 },
            { name: 'up_arrow', x: 256, y: 0, width: 128, height: 192 },
            { name: 'plus', x: 384, y: 0, width: 128, height: 192 },
            // Row 2
            { name: 's_symbol', x: 0, y: 192, width: 128, height: 192 },
            { name: 'dots', x: 128, y: 192, width: 128, height: 192 },
            { name: 'wave', x: 256, y: 192, width: 128, height: 192 },
            { name: 'star', x: 384, y: 192, width: 128, height: 192 }
        ]
    },
    // Added new spritesheet config
    space_objects: {
        sheet: '/iono_spaceobjects_spritesheet.png',
        frameWidth: 256,
        frameHeight: 256,
        frames: [
            // Frame 1: Asteroid/Moon Rock (Image: Asteroid)
            { name: 'asteroid', x: 0, y: 0, width: 256, height: 256 },
            // Frame 2: Rover/Lunar Module (Image: Wheeled Rover) <- Should be named 'rover'
            { name: 'rover', x: 256, y: 0, width: 256, height: 256 },
            // Frame 3: Small Spacecraft/Legged Vehicle (Image: Legged Lander) <- Should be named 'lander'
            { name: 'lander', x: 512, y: 0, width: 256, height: 256 },
        ]
    }
};

// Make SPRITES available for import
export { SPRITES };