// New file: Manages player instances in the game

import Player from './player.js';
import { SPRITES } from 'config/sprites.js';

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
        };

        // Validate vehicleType before creating PlayerState
        if (safeInitialState.vehicleType < 0 || safeInitialState.vehicleType >= SPRITES.vehicles.frames.length) {
            console.warn(`Invalid initial vehicleType ${safeInitialState.vehicleType} for player ${clientId}. Defaulting to 0.`);
            safeInitialState.vehicleType = 0;
        }

        console.log(`Creating player ${clientId} (Local: ${isLocal}) with state:`, safeInitialState);

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

        // Set visual state directly after creation
        player.state.facingDirection = safeInitialState.facingDirection;
        player.state.rotation = safeInitialState.rotation;

        this.players[clientId] = player;

        // For remote players, immediately set their server state and snap visual state
        if (!isLocal) {
            player.updateFromServer(safeInitialState, performance.now()); // Set server target
            player.state.x = player.state.serverX; // Snap visual position
            player.state.y = player.state.serverY;
            player.state.rotation = player.state.serverRotation; // Snap visual rotation
            player.state.facingDirection = player.state.serverFacingDirection; // Snap visual direction
        }

        console.log(`Player ${clientId} (Local: ${isLocal}) created successfully. Position: ${player.state.x.toFixed(0)},${player.state.y.toFixed(0)} Vehicle: ${player.state.vehicleType}`);
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
             if (player && player.state && !player.isMarkedForRemoval) {
                 // Call update for all players, but only local player calculates physics inside its update
                 // Pass consistent arguments
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
            if (player && !player.isMarkedForRemoval) {
                player.draw(); // Player draw method uses the context stored during creation
            }
        }
    }
}

export default PlayerManager;