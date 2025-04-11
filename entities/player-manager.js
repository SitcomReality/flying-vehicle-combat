// New file: Manages player instances in the game

import Player from './player.js';
import { SPRITES } from 'config/sprites.js';
import { PlayerLifecycleState } from './player-lifecycle.js'; // Import states

class PlayerManager {
    constructor(assets, ctx, renderScale, gameWidth, gameHeight) {
        this.players = {}; // { clientId: Player instance }
        this.localPlayerId = null;

        // Dependencies needed for player creation
        this.assets = assets;
        this.ctx = ctx;
        this.renderScale = renderScale;
        this.gameWidth = gameWidth;
        this.gameHeight = gameHeight;

        // References to other managers needed by players (set externally)
        this.projectileManager = null;
        this.networkManager = null;
        this.vehicleSelector = null; // Reference to the UI selector
    }

    setManagers(projectileManager, networkManager, vehicleSelector) {
        this.projectileManager = projectileManager;
        this.networkManager = networkManager;
        this.vehicleSelector = vehicleSelector; // Store reference

        // Pass managers to already existing players
        for (const id in this.players) {
            this.players[id].setManagers(projectileManager, networkManager);
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

    getAllPlayerIds() {
        return Object.keys(this.players);
    }

    // Replaces the original createPlayer function
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

        // Ensure initialState has defaults if properties are missing
        const safeInitialState = {
            x: initialState?.x ?? this.gameWidth / 2,
            y: initialState?.y ?? this.gameHeight / 2,
            vehicleType: initialState?.vehicleType ?? 0,
            facingDirection: initialState?.facingDirection ?? -1,
            rotation: initialState?.rotation ?? 0,
            lifecycleState: initialState?.lifecycleState ?? (isLocal ? PlayerLifecycleState.SELECTING : PlayerLifecycleState.CONNECTING), // Start local player in selection
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

        // Pass managers if they've been set already
        if (this.projectileManager && this.networkManager) {
            player.setManagers(this.projectileManager, this.networkManager);
        }

        // Set initial lifecycle state explicitly
        player.state.lifecycleState = safeInitialState.lifecycleState;

        // Set visual state directly after creation
        player.state.facingDirection = safeInitialState.facingDirection;
        player.state.rotation = safeInitialState.rotation;

        // For remote players, immediately set their server state and snap visual state
        if (!isLocal) {
            player.updateFromServer(safeInitialState, performance.now()); // Set server target
            player.state.x = player.state.serverX; // Snap visual position
            player.state.y = player.state.serverY;
            player.state.rotation = player.state.serverRotation; // Snap visual rotation
            player.state.facingDirection = player.state.serverFacingDirection; // Snap visual direction
            player.state.lifecycleState = player.state.serverLifecycleState ?? PlayerLifecycleState.ACTIVE; // Sync lifecycle or assume active
        }

        this.players[clientId] = player;

        // If the local player was just created and is in SELECTING state, show the selector
        if (isLocal && player.state.lifecycleState === PlayerLifecycleState.SELECTING) {
            this.vehicleSelector?.show();
        }

        console.log(`Player ${clientId} (Local: ${isLocal}) created successfully. State: ${player.state.lifecycleState}, Pos: ${player.state.x.toFixed(0)},${player.state.y.toFixed(0)} Vehicle: ${player.state.vehicleType}`);
        return player;
    }

    // Replaces the original removePlayer function
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
                 player.update(deltaTime, groundLevelY, particleSystem, currentTime);
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
            if (player && !player.isMarkedForRemoval && player.state.lifecycleState !== PlayerLifecycleState.CONNECTING) {
                player.draw(); // Player draw method uses the context stored during creation
            }
        }
    }

    // --- Player Lifecycle Management ---

    // Called when the local player needs to respawn (e.g., after death)
    triggerLocalPlayerRespawn() {
        const localPlayer = this.getLocalPlayer();
        if (localPlayer && localPlayer.transitionToState(PlayerLifecycleState.SELECTING)) {
            this.vehicleSelector?.show(); // Show the UI
            // Send presence update immediately
            this.networkManager?.updatePresence(localPlayer.getPresenceData());
        }
    }

    // Called by the VehicleSelector UI when a selection is made
    confirmLocalPlayerVehicleSelection(selectedVehicleType) {
        const localPlayer = this.getLocalPlayer();
        if (!localPlayer || localPlayer.state.lifecycleState !== PlayerLifecycleState.SELECTING) {
            console.warn("Attempted to confirm vehicle selection, but player is not in SELECTING state.");
            return;
        }

        console.log(`Local player selected vehicle type: ${selectedVehicleType}`);
        localPlayer.setVehicle(selectedVehicleType); // This also resets health/fuel

        // Determine spawn position (e.g., random, center, depends on game mode)
        // For now, near bottom center
        const spawnX = this.gameWidth / 2;
        const spawnY = this.gameHeight - (SPRITES.vehicles.hitboxHeight * this.renderScale) - 50;

        // Reset state and set to ACTIVE
        localPlayer.resetStateForSpawn(spawnX, spawnY);

        // Hide the selector UI
        this.vehicleSelector?.hide();

        // Send presence update immediately
        this.networkManager?.updatePresence(localPlayer.getPresenceData());
    }

    // Placeholder for triggering death (will be replaced by health system)
    killLocalPlayer() {
        const localPlayer = this.getLocalPlayer();
        if (localPlayer && localPlayer.transitionToState(PlayerLifecycleState.DEAD)) {
            console.log("Local player killed (Debug).");
            // Send presence update immediately
            this.networkManager?.updatePresence(localPlayer.getPresenceData());

            // Automatically trigger respawn selection after a short delay
            setTimeout(() => {
                 this.triggerLocalPlayerRespawn();
            }, 1500); // 1.5 second delay before showing selector
        }
    }
}

export default PlayerManager;