// New file: Renders health and fuel bars for players

import { getVisualCenter } from '../entities/player-visuals.js'; // Use helper for positioning

const BAR_WIDTH = 50;
const BAR_HEIGHT = 5;
const BAR_Y_OFFSET = 5; // Offset below the sprite's bottom edge
const HEALTH_COLOR = 'rgb(200, 50, 50)'; // Red
const HEALTH_BG_COLOR = 'rgba(100, 25, 25, 0.7)'; // Darker red background
const FUEL_COLOR = 'rgb(50, 150, 200)'; // Blue
const FUEL_BG_COLOR = 'rgba(25, 75, 100, 0.7)'; // Darker blue background

class StatusBarRenderer {
    constructor(ctx, playerManager, renderScale) {
        this.ctx = ctx;
        this.playerManager = playerManager;
        this.renderScale = renderScale;
    }

    draw() {
        const players = this.playerManager.getAllPlayers();
        this.ctx.save();
        this.ctx.font = '8px "Comic Sans MS", "Chalkduster", cursive'; // Smaller font for bars
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        for (const id in players) {
            const player = players[id];

            // Only draw bars for active players
            if (player && player.state && !player.isMarkedForRemoval &&
                player.state.lifecycleState === 'ACTIVE')
            {
                this._drawPlayerBars(player);
            }
        }
        this.ctx.restore();
    }

    _drawPlayerBars(player) {
        const state = player.state;
        if (!state.currentVehicle) return; // Need vehicle info for dimensions

        // Use getVisualCenter to find the bottom center of the sprite frame
        const spriteVisuals = getVisualCenter(state, this.renderScale);
        const spriteHeight = state.currentVehicle.height * this.renderScale;
        const spriteBottomY = spriteVisuals.topY + spriteHeight; // Calculate bottom based on topY and height

        const centerX = spriteVisuals.x;
        const startY = spriteBottomY + BAR_Y_OFFSET;

        // --- Draw Health Bar ---
        const healthRatio = state.health / state.maxHealth;
        const healthBarY = startY;
        // Background
        this.ctx.fillStyle = HEALTH_BG_COLOR;
        this.ctx.fillRect(centerX - BAR_WIDTH / 2, healthBarY, BAR_WIDTH, BAR_HEIGHT);
        // Foreground
        this.ctx.fillStyle = HEALTH_COLOR;
        this.ctx.fillRect(centerX - BAR_WIDTH / 2, healthBarY, BAR_WIDTH * healthRatio, BAR_HEIGHT);
        // Optional: Draw border
        // this.ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        // this.ctx.strokeRect(centerX - BAR_WIDTH / 2, healthBarY, BAR_WIDTH, BAR_HEIGHT);


        // --- Draw Fuel Bar ---
        const fuelRatio = state.fuel / state.maxFuel;
        const fuelBarY = healthBarY + BAR_HEIGHT + 1; // Place below health bar with 1px gap
        // Background
        this.ctx.fillStyle = FUEL_BG_COLOR;
        this.ctx.fillRect(centerX - BAR_WIDTH / 2, fuelBarY, BAR_WIDTH, BAR_HEIGHT);
        // Foreground
        this.ctx.fillStyle = FUEL_COLOR;
        this.ctx.fillRect(centerX - BAR_WIDTH / 2, fuelBarY, BAR_WIDTH * fuelRatio, BAR_HEIGHT);
        // Optional: Draw border
        // this.ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        // this.ctx.strokeRect(centerX - BAR_WIDTH / 2, fuelBarY, BAR_WIDTH, BAR_HEIGHT);

    }
}

export default StatusBarRenderer;