import Player from './player.js';
import { SPRITES } from 'config/sprites.js';
import { PlayerLifecycleState } from './player-lifecycle.js'; // Import states
import { getVehicleConfig } from './vehicles/vehicle-types.js'; // Import vehicle config getter
// Import collision detection and damage calculation
import { checkPlayerCollisions, checkProjectileCollisions } from './combat/collision-detector.js';
import { calculateCollisionDamage } from './combat/damage-calculator.js';

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
        this.vehicleSelector = null; // Reference to the UI selector
        this.particleSystem = null; // Add reference for effects
    }

    setManagers(projectileManager, networkManager, vehicleSelector, particleSystem) {
        this.projectileManager = projectileManager;
        this.networkManager = networkManager;
        this.vehicleSelector = vehicleSelector; // Store reference
        this.particleSystem = particleSystem; // Store reference

        // Pass managers to already existing players
        for (const id in this.players) {
            // Ensure all required managers are passed to the Player instance
            this.players[id].setManagers(projectileManager, networkManager, this, particleSystem); // Pass self (PlayerManager) and particleSystem
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
        if (this.players[clientId] && !this.players[clientId].isMarkedForRemoval) {
            console.warn(`Attempted to create player ${clientId} but they already exist and are not marked for removal.`);
            if (this.players[clientId].isLocalPlayer !== isLocal) {
                console.warn(`Correcting isLocal status for existing player ${clientId}.`);
                this.players[clientId].state.isLocalPlayer = isLocal;
            }
            return this.players[clientId];
        }

        let initialLifecycleState = PlayerLifecycleState.CONNECTING;
        if (isLocal) {
            initialLifecycleState = initialState?.lifecycleState ?? PlayerLifecycleState.SELECTING;
        } else {
            initialLifecycleState = initialState?.lifecycleState ?? PlayerLifecycleState.ACTIVE;
        }

        const safeInitialState = {
            x: initialState?.x ?? this.gameWidth / 2,
            y: initialState?.y ?? this.gameHeight / 2,
            vehicleType: initialState?.vehicleType ?? 0,
            facingDirection: initialState?.facingDirection ?? -1,
            rotation: initialState?.rotation ?? 0,
            lifecycleState: initialLifecycleState,
            health: getVehicleConfig(initialState?.vehicleType ?? 0).maxHealth,
            fuel: getVehicleConfig(initialState?.vehicleType ?? 0).maxFuel,
            // Add ground damage timer initialization
            lastGroundDamageTime: 0,
        };

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

        // Set managers immediately after creating player
        if (this.projectileManager && this.networkManager && this.particleSystem) {
            player.setManagers(this.projectileManager, this.networkManager, this, this.particleSystem);
        }

        player.state.lifecycleState = safeInitialState.lifecycleState;
        player.state.facingDirection = safeInitialState.facingDirection;
        player.state.rotation = safeInitialState.rotation;
        player.state.health = safeInitialState.health;
        player.state.fuel = safeInitialState.fuel;
        player.state.lastGroundDamageTime = safeInitialState.lastGroundDamageTime; // Initialize timer


        if (!isLocal) {
            player.updateFromServer(safeInitialState, performance.now());
            player.state.x = player.state.serverX;
            player.state.y = player.state.serverY;
            player.state.rotation = player.state.serverRotation;
            player.state.facingDirection = player.state.serverFacingDirection;
            player.state.visualFacingDirection = player.state.serverFacingDirection;
            player.state.lifecycleState = player.state.serverLifecycleState ?? PlayerLifecycleState.ACTIVE;
        } else {
            player.state.serverX = player.state.x;
            player.state.serverY = player.state.y;
            player.state.serverRotation = player.state.rotation;
            player.state.serverFacingDirection = player.state.facingDirection;
            player.state.serverHealth = player.state.health;
            player.state.serverFuel = player.state.fuel;
            player.state.serverLastGroundDamageTime = player.state.lastGroundDamageTime; // Sync timer state
        }

        this.players[clientId] = player;

        if (isLocal && player.state.lifecycleState === PlayerLifecycleState.SELECTING) {
            console.log(`Local player ${clientId} entering SELECTING state. Showing selector.`);
            this.vehicleSelector?.show();
        } else if (isLocal) {
            console.log(`Local player ${clientId} created in state ${player.state.lifecycleState}.`);
        }

        console.log(`Player ${clientId} (Local: ${isLocal}) created successfully. State: ${player.state.lifecycleState}, Pos: ${player.state.x.toFixed(0)},${player.state.y.toFixed(0)} Vehicle: ${player.state.vehicleType}`);
        return player;
    }

    removePlayer(clientId) {
        if (!this.players[clientId]) return;

        this.players[clientId].isMarkedForRemoval = true;
        console.log(`Player marked for removal: ${clientId}`);

        // Consider adding a small delay before actual deletion if needed for effects
        delete this.players[clientId];
        console.log(`Player removed from players object: ${clientId}`);
    }

    updatePlayers(deltaTime, groundLevelY, particleSystem, currentTime) {
        for (const id in this.players) {
            const player = this.players[id];
            if (player && player.state && !player.isMarkedForRemoval) {
                // Pass playerManager to player update for use in physics/damage calls
                player.update(deltaTime, groundLevelY, particleSystem, currentTime, this);
            }
        }
    }

    handleCollisions(currentTime) {
        if (!this.projectileManager || !this.particleSystem) return;

        const activePlayers = this.getAllActivePlayers(); // Get only active players

        const activeProjectiles = this.projectileManager.getProjectiles().reduce((acc, proj) => {
            if (!proj.isMarkedForRemoval) {
                acc[proj.id] = proj;
            }
            return acc;
        }, {});

        // Pass playerManager to collision checkers so they can call player.takeDamage
        checkPlayerCollisions(
            activePlayers,
            this.renderScale,
            calculateCollisionDamage,
            currentTime,
            this // Pass self (PlayerManager)
        );

        checkProjectileCollisions(
            activePlayers,
            activeProjectiles,
            this.renderScale,
            calculateCollisionDamage,
            currentTime,
            this, // Pass self (PlayerManager)
            this.particleSystem // Pass particle system for effects
        );
    }

    drawPlayers(renderer) {
        const sortedPlayerIds = Object.keys(this.players).sort((a, b) => {
            if (a === this.localPlayerId) return 1;
            if (b === this.localPlayerId) return -1;
            const playerA = this.players[a];
            const playerB = this.players[b];
            if (playerA?.state && playerB?.state) {
                return playerA.state.y - playerB.state.y;
            }
            return 0;
        });

        for (const id of sortedPlayerIds) {
            const player = this.players[id];
            if (player && !player.isMarkedForRemoval &&
                player.state.lifecycleState !== PlayerLifecycleState.CONNECTING) // Don't draw connecting players
                // Allow drawing SELECTING/DEAD states for potential visual feedback
            {
                player.draw();
            }
        }
    }

    triggerLocalPlayerRespawn() {
        const localPlayer = this.getLocalPlayer();
        if (localPlayer && localPlayer.transitionToState(PlayerLifecycleState.SELECTING)) {
            console.log(`Player ${localPlayer.id} transitioning to SELECTING for respawn.`);
            this.vehicleSelector?.show();
            // Presence update handled within transitionToState
        } else {
            console.warn(`Could not trigger respawn for player ${this.localPlayerId}. Player null or transition failed.`);
        }
    }

    confirmLocalPlayerVehicleSelection(selectedVehicleType) {
        const localPlayer = this.getLocalPlayer();
        if (!localPlayer || localPlayer.state.lifecycleState !== PlayerLifecycleState.SELECTING) {
            console.warn("Attempted to confirm vehicle selection, but player is not in SELECTING state.");
            return;
        }

        console.log(`Local player ${localPlayer.id} selected vehicle type: ${selectedVehicleType}`);
        localPlayer.setVehicle(selectedVehicleType);

    }
}

export default PlayerManager;