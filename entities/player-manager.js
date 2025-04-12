// New file: Manages all player instances

import Player from './player.js';
import { PlayerLifecycleState } from './player-lifecycle.js';

class PlayerManager {
    constructor(assets, ctx, renderScale, gameWidth, gameHeight) {
        this.assets = assets;
        this.ctx = ctx;
        this.renderScale = renderScale;
        this.gameWidth = gameWidth;
        this.gameHeight = gameHeight;

        this.players = {}; // { clientId: Player }
        this.localPlayerId = null;

        // Managers needed by Player instances (set via setManagers)
        this.projectileManager = null;
        this.networkManager = null;
        // this.playerLifecycleManager = null; // Not passed down directly anymore
        this.particleSystem = null;
        this.powerupManager = null;
        this.inputManager = null; // Player might need this ref too
    }

    // Setter for required managers to pass down to Player instances
    // Fixed: Removed invalid comment and unused playerLifecycleManager parameter from signature
    setManagers(projectileManager, networkManager, particleSystem, powerupManager, inputManager) {
        this.projectileManager = projectileManager;
        this.networkManager = networkManager;
        // this.playerLifecycleManager = playerLifecycleManager; // No longer set here
        this.particleSystem = particleSystem;
        this.powerupManager = powerupManager;
        this.inputManager = inputManager; // Store input manager
    }

    setLocalPlayerId(id) {
        this.localPlayerId = id;
    }

    createPlayer(id, initialState, isLocalPlayer) {
        if (this.players[id]) {
            console.warn(`Player with ID ${id} already exists. Ignoring creation request.`);
            // Optionally update existing player's state if needed?
            return this.players[id];
        }

        const x = initialState.x ?? this.gameWidth / 2;
        const y = initialState.y ?? this.gameHeight / 2;
        const vehicleType = initialState.vehicleType ?? 0;

        const player = new Player(
            id, x, y, vehicleType, isLocalPlayer,
            this.assets, this.ctx, this.renderScale, this.gameWidth, this.gameHeight
        );

        // Update player state from initial data more thoroughly
        if (initialState.facingDirection !== undefined) player.state.facingDirection = initialState.facingDirection;
        if (initialState.rotation !== undefined) player.state.rotation = initialState.rotation;
        if (initialState.lifecycleState !== undefined) player.state.lifecycleState = initialState.lifecycleState;
        if (initialState.health !== undefined) player.state.health = initialState.health;
        if (initialState.fuel !== undefined) player.state.fuel = initialState.fuel;
        if (initialState.score !== undefined) player.state.score = initialState.score;
        if (initialState.isInvulnerable !== undefined) player.state.isInvulnerable = initialState.isInvulnerable;
        if (initialState.activePowerups !== undefined) player.state.activePowerups = initialState.activePowerups;
        // Make sure vehicle properties are updated based on the type
        player.state.updateVehicleProperties();


        // Pass necessary manager references to the player instance
        // Note: PlayerManager now passes itself (this) as the 3rd argument
        player.setManagers(
            this.projectileManager,
            this.networkManager,
            this, // Pass PlayerManager itself
            this.particleSystem,
            this.powerupManager,
            this.inputManager // Pass input manager
        );

        this.players[id] = player;
        console.log(`Player ${id} (Local: ${isLocalPlayer}) created and added to manager.`);
        return player;
    }

    removePlayer(id) {
        if (this.players[id]) {
            console.log(`Removing player ${id} from manager.`);
            // Mark for removal for graceful cleanup if needed elsewhere
            this.players[id].isMarkedForRemoval = true;
            // Optionally, perform other cleanup related to the player
            // TODO: Cancel ongoing effects, clean up references?
            delete this.players[id];
        } else {
            console.warn(`Attempted to remove non-existent player ${id}.`);
        }
    }

    getPlayer(id) {
        return this.players[id];
    }

    getLocalPlayer() {
        if (!this.localPlayerId) return null;
        return this.players[this.localPlayerId];
    }

    getAllPlayers() {
        return this.players;
    }

     getAllActivePlayers() {
        const active = {};
        for (const id in this.players) {
            const player = this.players[id];
            // Fixed typo: Use player.state.lifecycleState
            if (player && player.state && !player.isMarkedForRemoval && player.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
                active[id] = player;
            }
        }
        return active;
    }

    getAllPlayerIds() {
        return Object.keys(this.players);
    }

    // Update player lifecycle manager reference (used by player.takeDamage->applyDamage->handlePlayerDeath)
    setPlayerLifecycleManager(manager) {
        this.playerLifecycleManager = manager;
    }


    updatePlayers(deltaTime, groundLevelY, particleSystem, currentTime) {
        for (const id in this.players) {
            const player = this.players[id];
            if (player && !player.isMarkedForRemoval) {
                // Pass the PlayerManager itself for context (e.g., for damage handling needing lifecycle manager)
                player.update(deltaTime, groundLevelY, particleSystem, currentTime, this);
            } else if (player && player.isMarkedForRemoval) {
                // If a player is marked, ensure they are removed from the manager
                console.log(`Cleaning up marked player ${id} during update.`);
                this.removePlayer(id);
            }
        }
    }

    // Pass renderer instance to drawPlayers
    drawPlayers(renderer) {
        for (const id in this.players) {
            const player = this.players[id];
            // Ensure player is valid and drawable
            // Fixed typo: Use player.state.lifecycleState
            if (player && !player.isMarkedForRemoval &&
                player.state.lifecycleState !== PlayerLifecycleState.CONNECTING &&
                player.state.lifecycleState !== PlayerLifecycleState.SELECTING)
            {
                player.draw();
            }
        }
    }
}

export default PlayerManager;