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
        this.vehicleSelector = null; // Reference to the UI selector
        this.particleSystem = null; // Add reference for effects
        this.powerupManager = null; // Add reference for powerups
    }

    setManagers(projectileManager, networkManager, vehicleSelector, particleSystem, powerupManager) { // Added powerupManager
        this.projectileManager = projectileManager;
        this.networkManager = networkManager;
        this.vehicleSelector = vehicleSelector; // Store reference
        this.particleSystem = particleSystem; // Store reference
        this.powerupManager = powerupManager; // Store reference

        // Pass managers to already existing players
        for (const id in this.players) {
            // Ensure all required managers are passed to the Player instance
            // Pass self (PlayerManager), particleSystem, and powerupManager
            this.players[id].setManagers(projectileManager, networkManager, this, particleSystem, powerupManager);
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

        // Pass managers if they've been set already
        if (this.projectileManager && this.networkManager && this.particleSystem && this.powerupManager) {
            // Pass self, particleSystem and powerupManager
            player.setManagers(this.projectileManager, this.networkManager, this, this.particleSystem, this.powerupManager);
        }

        // Set initial lifecycle state explicitly AFTER player is created
        player.state.lifecycleState = safeInitialState.lifecycleState;

        // Set visual state directly after creation
        player.state.facingDirection = safeInitialState.facingDirection;
        player.state.rotation = safeInitialState.rotation;
        // Set initial health/fuel/timers/powerups
        player.state.health = safeInitialState.health;
        player.state.fuel = safeInitialState.fuel;
        player.state.lastGroundDamageTime = safeInitialState.lastGroundDamageTime;
        player.state.activePowerups = safeInitialState.activePowerups; // Set initial empty powerups

        // For remote players, immediately set their server state and snap visual state
        if (!isLocal) {
            player.updateFromServer(safeInitialState, performance.now()); // Set server target
            player.state.x = player.state.serverX; // Snap visual position
            player.state.y = player.state.serverY;
            player.state.rotation = player.state.serverRotation; // Snap visual rotation
            player.state.facingDirection = player.state.serverFacingDirection; // Snap visual direction
            player.state.visualFacingDirection = player.state.serverFacingDirection; // Snap visual facing
            player.state.lifecycleState = player.state.serverLifecycleState ?? PlayerLifecycleState.ACTIVE; // Sync lifecycle or assume active
        } else {
             // Set server state for local player as well to prevent initial interpolation jump
             player.state.serverX = player.state.x;
             player.state.serverY = player.state.y;
             player.state.serverRotation = player.state.rotation;
             player.state.serverFacingDirection = player.state.facingDirection;
             player.state.serverHealth = player.state.health;
             player.state.serverFuel = player.state.fuel;
        }

        this.players[clientId] = player;

        // If the local player was just created and is in SELECTING state, show the selector
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

    // --- Player Lifecycle Management ---

    triggerLocalPlayerRespawn() {
        const localPlayer = this.getLocalPlayer();
        if (localPlayer && localPlayer.transitionToState(PlayerLifecycleState.SELECTING)) {
             console.log(`Player ${localPlayer.id} transitioning to SELECTING for respawn.`);
            this.vehicleSelector?.show(); // Show the UI
            // Presence update happens inside transitionToState
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
        localPlayer.setVehicle(selectedVehicleType); // This also resets health/fuel

        // Determine spawn position
        const vehicleConfig = getVehicleConfig(selectedVehicleType);
        // Estimate vehicle height using known render scale and sprite data
        const vehicleHeight = (SPRITES.vehicles.hitboxHeight ?? SPRITES.vehicles.frameHeight) * this.renderScale;
        const spawnX = this.gameWidth / 2;
        // Estimate ground level (needs refinement if dynamic)
        const groundY = this.gameHeight - 30; // Use consistent ground estimate
        const spawnY = groundY - vehicleHeight - 10; // Spawn slightly above ground

        // Reset state and set to ACTIVE
        localPlayer.resetStateForSpawn(spawnX, spawnY);

        // Hide UI
        this.vehicleSelector?.hide();

        // Send presence update
        this.networkManager?.updatePresence(localPlayer.getPresenceData());
        console.log(`Player ${localPlayer.id} spawned and set to ACTIVE. Presence updated.`);
    }

    killLocalPlayer() {
        const localPlayer = this.getLocalPlayer();
        if (localPlayer && localPlayer.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
            console.log(`DEBUG: Applying lethal damage to local player ${localPlayer.id}`);
            // Apply enough damage to ensure death, passing current time and self (playerManager)
            localPlayer.takeDamage(localPlayer.state.maxHealth * 2, performance.now());
        } else {
            console.log(`Could not kill local player ${this.localPlayerId} via debug. State was ${localPlayer?.state.lifecycleState}.`);
        }
    }

    handlePlayerDeath(playerId) {
       const player = this.getPlayer(playerId);
       if (!player || !player.isLocalPlayer || player.state.lifecycleState === PlayerLifecycleState.DEAD) {
           console.warn(`handlePlayerDeath called for invalid player: ${playerId} or player already dead.`);
           return;
       }

       // Transition to DEAD state (this also syncs presence)
       if (player.transitionToState(PlayerLifecycleState.DEAD)) {
           console.log(`Local player ${player.id} officially DEAD.`);

           // TODO: Add explosion particle effect here using this.particleSystem
           // Example: this.particleSystem?.emitExplosion(player.x, player.y);

           // Automatically trigger respawn selection after a short delay
           setTimeout(() => {
                this.triggerLocalPlayerRespawn();
           }, 1500); // 1.5 second delay before showing selector
       } else {
           console.error(`Failed to transition player ${playerId} to DEAD state.`);
       }
    }
}

export default PlayerManager;