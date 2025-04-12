import Player from './player.js';
import { SPRITES } from 'config/sprites.js';
import { PlayerLifecycleState } from './player-lifecycle.js'; // Import states
import { getVehicleConfig } from './vehicles/vehicle-types.js'; // Import vehicle config getter

class PlayerManager {
    constructor(assets, ctx, renderScale, gameWidth, gameHeight) {
        this.assets = assets;
        this.ctx = ctx;
        this.renderScale = renderScale;
        this.gameWidth = gameWidth;
        this.gameHeight = gameHeight;
        this.players = {}; // { clientId: Player instance }
        this.localPlayerId = null;

        // References to other managers needed by players (set externally)
        this.projectileManager = null;
        this.networkManager = null;
        this.particleSystem = null;
        this.powerupManager = null;
        this.playerLifecycleManager = null;
        this.inputManager = null; // Add reference storage for Player
    }

    // Pass inputManager here
    setManagers(projectileManager, networkManager, playerLifecycleManager, particleSystem, powerupManager, inputManager) {
        this.projectileManager = projectileManager;
        this.networkManager = networkManager;
        this.playerLifecycleManager = playerLifecycleManager;
        this.particleSystem = particleSystem;
        this.powerupManager = powerupManager;
        this.inputManager = inputManager; // Store reference

        // Pass managers (including inputManager) to already existing players
        for (const id in this.players) {
            this.players[id].setManagers(projectileManager, networkManager, this, particleSystem, powerupManager, inputManager);
        }
    }

    setLocalPlayerId(id) {
        this.localPlayerId = id;
    }

    getLocalPlayer() {
        return this.players[this.localPlayerId];
    }

    getPlayer(id) {
        return this.players[id];
    }

    getAllPlayers() {
        return this.players;
    }

    getAllActivePlayers() {
        const activePlayers = {};
        for (const id in this.players) {
            const p = this.players[id];
            if (p && !p.isMarkedForRemoval && p.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
                activePlayers[id] = p;
            }
        }
        return activePlayers;
    }

    getAllPlayerIds() {
        return Object.keys(this.players);
    }

    createPlayer(clientId, initialState, isLocal = false) {
        // Guard against existing, non-removed players
        if (this.players[clientId] && !this.players[clientId].isMarkedForRemoval) {
            console.warn(`Attempted to create player ${clientId} but they already exist and are not marked for removal.`);
             // If somehow the isLocal status is wrong, correct it.
            if (this.players[clientId].isLocalPlayer !== isLocal) {
                 console.warn(`Correcting isLocal status for existing player ${clientId}.`);
                 this.players[clientId].state.isLocalPlayer = isLocal;
            }
            return this.players[clientId];
        }

        // Determine initial lifecycle state
        let initialLifecycleState = PlayerLifecycleState.CONNECTING; // Default for remote
        if (isLocal) {
            initialLifecycleState = initialState?.lifecycleState ?? PlayerLifecycleState.SELECTING; // Default local to SELECTING unless specified
        } else {
             initialLifecycleState = initialState?.lifecycleState ?? PlayerLifecycleState.ACTIVE; // Default remote to ACTIVE if state missing initially
        }

        // Ensure initialState has defaults if properties are missing
        const safeInitialState = {
            x: initialState?.x ?? this.gameWidth / 2,
            y: initialState?.y ?? this.gameHeight / 2,
            vehicleType: initialState?.vehicleType ?? 0,
            facingDirection: initialState?.facingDirection ?? -1,
            rotation: initialState?.rotation ?? 0,
            lifecycleState: initialLifecycleState,
            health: getVehicleConfig(initialState?.vehicleType ?? 0).maxHealth,
            fuel: getVehicleConfig(initialState?.vehicleType ?? 0).maxFuel,
            score: initialState?.score ?? 0, // Include initial score
            isInvulnerable: initialState?.isInvulnerable ?? false,
            // Initialize ground damage timer
            lastGroundDamageTime: 0,
             // Initialize active powerups state
            activePowerups: {},
        };

        // Validate vehicleType before creating PlayerState
        if (safeInitialState.vehicleType < 0 || safeInitialState.vehicleType >= SPRITES.vehicles.frames.length) {
            console.warn(`Invalid initial vehicleType ${safeInitialState.vehicleType} for player ${clientId}. Defaulting to 0.`);
            safeInitialState.vehicleType = 0;
        }

        console.log(`Creating player ${clientId} (Local: ${isLocal}) with initial state:`, safeInitialState);

        const player = new Player(
            clientId,
            safeInitialState.x,
            safeInitialState.y,
            safeInitialState.vehicleType,
            isLocal,
            this.assets,
            this.ctx,
            this.renderScale,
            this.gameWidth,
            this.gameHeight
        );

        // Pass managers if they've been set already (including inputManager)
        if (this.projectileManager && this.networkManager && this.particleSystem && this.powerupManager && this.inputManager) {
            player.setManagers(this.projectileManager, this.networkManager, this, this.particleSystem, this.powerupManager, this.inputManager);
        }

        // Set initial state AFTER player and managers are linked
        player.state.lifecycleState = safeInitialState.lifecycleState;
        player.state.facingDirection = safeInitialState.facingDirection;
        player.state.rotation = safeInitialState.rotation;
        player.state.health = safeInitialState.health;
        player.state.fuel = safeInitialState.fuel;
        player.state.lastGroundDamageTime = safeInitialState.lastGroundDamageTime;
        player.state.activePowerups = safeInitialState.activePowerups;
        player.state.score = safeInitialState.score;
        player.state.isInvulnerable = safeInitialState.isInvulnerable;


        // For remote players, immediately set their server state and snap visual state
        if (!isLocal) {
            // Pass the full initial state object to ensure all properties are synced
            player.updateFromServer(safeInitialState, performance.now()); // Set server target
            player.state.x = player.state.serverX; // Snap visual position
            player.state.y = player.state.serverY;
            player.state.rotation = player.state.serverRotation; // Snap visual rotation
            player.state.facingDirection = player.state.serverFacingDirection; // Snap visual direction
            player.state.visualFacingDirection = player.state.serverFacingDirection; // Snap visual facing
            player.state.lifecycleState = player.state.serverLifecycleState ?? PlayerLifecycleState.ACTIVE; // Sync lifecycle or assume active
            player.state.health = player.state.serverHealth; // Snap health
            player.state.fuel = player.state.serverFuel; // Snap fuel
            player.state.score = player.state.serverScore; // Snap score
            player.state.isInvulnerable = player.state.serverIsInvulnerable; // Snap invuln

        } else {
             // Set server state for local player as well to prevent initial interpolation jump
             player.state.serverX = player.state.x;
             player.state.serverY = player.state.y;
             player.state.serverRotation = player.state.rotation;
             player.state.serverFacingDirection = player.state.facingDirection;
             player.state.serverHealth = player.state.health;
             player.state.serverFuel = player.state.fuel;
             player.state.serverScore = player.state.score;
             player.state.serverIsInvulnerable = player.state.isInvulnerable;
             player.state.serverLifecycleState = player.state.lifecycleState; // Ensure server state reflects local initial
        }

        this.players[clientId] = player;

        // Show vehicle selector if local player starts in SELECTING state
        if (isLocal && player.state.lifecycleState === PlayerLifecycleState.SELECTING) {
            console.log(`Local player ${clientId} entering SELECTING state. Showing selector.`);
             this.playerLifecycleManager?.vehicleSelector?.show();
        } else if (isLocal) {
             console.log(`Local player ${clientId} created in state ${player.state.lifecycleState}.`);
        }

        console.log(`Player ${clientId} (Local: ${isLocal}) created successfully. State: ${player.state.lifecycleState}, Pos: ${player.state.x.toFixed(0)},${player.state.y.toFixed(0)} Vehicle: ${player.state.vehicleType}`);
        return player;
    }

    removePlayer(clientId) {
        if (!this.players[clientId]) return;

        // Mark for removal first
        this.players[clientId].isMarkedForRemoval = true;
        console.log(`Player marked for removal: ${clientId}`);

        // Clean up the actual object reference
        delete this.players[clientId];
        console.log(`Player removed from players object: ${clientId}`);
    }

    updatePlayers(deltaTime, groundLevelY, particleSystem, currentTime) {
        for (const id in this.players) {
             const player = this.players[id];
             // Only update if player exists and is not marked for removal
             if (player && player.state && !player.isMarkedForRemoval) {
                 // Pass playerManager to player update for use in physics/damage calls
                 // Ensure 'this' (PlayerManager) is passed here
                 // Pass current time for powerup effect updates
                 player.update(deltaTime, groundLevelY, particleSystem, currentTime, this);
             }
        }
    }

    drawPlayers(renderer) {
        const sortedPlayerIds = Object.keys(this.players).sort((a, b) => {
            if (a === this.localPlayerId) return 1;
            if (b === this.localPlayerId) return -1;
             const playerA = this.players[a];
             const playerB = this.players[b];
             if (playerA?.state && playerB?.state) {
                 return playerA.state.y - playerB.state.y; // Sort by Y for pseudo-depth
             }
            return 0;
        });

        for (const id of sortedPlayerIds) {
            const player = this.players[id];
            // Only draw if player exists, not marked for removal, and maybe filter by state?
            // Hide if CONNECTING or SELECTING
            if (player && !player.isMarkedForRemoval &&
                player.state.lifecycleState !== PlayerLifecycleState.CONNECTING &&
                player.state.lifecycleState !== PlayerLifecycleState.SELECTING)
            {
                player.draw(); // Player draw method uses the context stored during creation
            }
        }
    }
}

export default PlayerManager;