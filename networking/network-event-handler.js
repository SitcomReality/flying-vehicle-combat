import { SPRITES } from 'config/sprites.js';
import { PlayerLifecycleState } from '../entities/player-lifecycle.js'; // Import lifecycle states
import { GLOBAL_PHYSICS } from '../entities/player-state.js'; // Import for default gravity factor

class NetworkEventHandler {
    constructor(networkManager, playerManager, projectileManager, gameConfig) {
        this.networkManager = networkManager;
        this.playerManager = playerManager;
        this.projectileManager = projectileManager;
        this.gameConfig = gameConfig; // { GAME_WIDTH, GAME_HEIGHT }
    }

    setupNetworkHandlers() {
        this.networkManager.onPresenceUpdate(this._handlePresenceUpdate.bind(this));
        this.networkManager.onRoomStateUpdate(this._handleRoomStateUpdate.bind(this));
        this.networkManager.onPresenceUpdateRequest(this._handlePresenceUpdateRequest.bind(this));
        this.networkManager.onMessage(this._handleMessage.bind(this));

        console.log("Network event handlers are registered.");
    }

    _handlePresenceUpdate(presence) {
        const now = performance.now();
        const currentPeers = this.networkManager.getPeers();
        const localPlayerId = this.playerManager.localPlayerId;

        for (const clientId in presence) {
            const peerInfo = currentPeers[clientId];
            const isLocal = clientId === localPlayerId;

            if (!isLocal && !peerInfo) {
                // Check if peer info is delayed but presence exists
                const latePeerInfo = this.networkManager.getPeer(clientId);
                 if (!latePeerInfo) {
                     continue;
                 } else {
                 }
            }


            const presenceData = presence[clientId];
            const existingPlayer = this.playerManager.getPlayer(clientId);

            if (!existingPlayer) {
                if (isLocal && this.playerManager.getLocalPlayer()) {
                    // Avoid recreating local player if already exists but presence arrives late
                    if (this.playerManager.getLocalPlayer().lifecycleState !== PlayerLifecycleState.CONNECTING) {
                         continue;
                    } else {
                        this.playerManager.getLocalPlayer().updateFromServer(presenceData, now);
                        continue;
                    }
                }

                const initialState = {
                    x: presenceData.x ?? this.gameConfig.GAME_WIDTH / 2,
                    y: presenceData.y ?? this.gameConfig.GAME_HEIGHT / 2,
                    vehicleType: presenceData.vehicleType ?? 0,
                    facingDirection: presenceData.facingDirection ?? -1,
                    rotation: presenceData.rotation ?? 0,
                    lifecycleState: presenceData.lifecycleState ?? PlayerLifecycleState.ACTIVE, // Default remote players to ACTIVE if state missing initially
                     // Sync initial health/fuel/invuln state if available
                    health: presenceData.health,
                    fuel: presenceData.fuel,
                    isInvulnerable: presenceData.isInvulnerable,
                    score: presenceData.score, // Sync initial score
                };
                 // Only create if not already present (double check, createPlayer has guards too)
                 if (!this.playerManager.getPlayer(clientId)) {
                    this.playerManager.createPlayer(clientId, initialState, false);
                 }

            } else if (!isLocal && existingPlayer) {
                // Update existing remote player
                existingPlayer.updateFromServer(presenceData, now);
            } else if (isLocal && existingPlayer && existingPlayer.lifecycleState === PlayerLifecycleState.CONNECTING) {
                 // Handle the case where the local player was created but still in CONNECTING state
                 // and receives its own initial presence data. Update internal state.
                 existingPlayer.updateFromServer(presenceData, now);
                 // If the server confirmed a different state (e.g., ACTIVE), update local state
                 if (presenceData.lifecycleState && presenceData.lifecycleState !== PlayerLifecycleState.CONNECTING) {
                      existingPlayer.transitionToState(presenceData.lifecycleState);
                      if (existingPlayer.lifecycleState === PlayerLifecycleState.SELECTING) {
                           this.playerManager.vehicleSelector?.show();
                      }
                 }
            }
        }

        const currentPeerIds = Object.keys(currentPeers);
        const managedPlayerIds = this.playerManager.getAllPlayerIds();

        for (const existingPlayerId of managedPlayerIds) {
            if (existingPlayerId === localPlayerId) continue;

             // Use the presence keys as the source of truth for connected peers for player removal
            if (!presence[existingPlayerId]) {
                const playerToRemove = this.playerManager.getPlayer(existingPlayerId);
                 // Check if the player exists and isn't already marked for removal
                 // Also, check if they are ACTUALLY gone from the room.peers list (final sanity check)
                if (playerToRemove && !playerToRemove.isMarkedForRemoval && !currentPeers[existingPlayerId]) {
                    const lastKnownPeerInfo = this.networkManager.getPeer(existingPlayerId); // Might be undefined if already gone
                    console.log("Player disconnected (removed from presence/peers):", existingPlayerId, lastKnownPeerInfo?.username ?? '(info gone)');
                    this.playerManager.removePlayer(existingPlayerId);
                } else if (playerToRemove && !playerToRemove.isMarkedForRemoval && currentPeers[existingPlayerId]) {
                     console.warn(`Presence missing for ${existingPlayerId} but peer info still exists. Player not removed yet.`);
                }
            }
        }
    }

    _handleRoomStateUpdate(roomState) {
        // Handle room state updates (e.g., world items) if needed
    }

    _handlePresenceUpdateRequest(updateRequest, fromClientId) {
        const localPlayer = this.playerManager.getLocalPlayer();
        if (!localPlayer || !localPlayer.state) return;

        if (updateRequest.type === 'changeVehicle') {
            const currentVehicle = localPlayer.state.vehicleType; // Access state property
            const totalVehicles = SPRITES.vehicles.frames.length;
            const nextVehicle = (currentVehicle + 1) % totalVehicles;
            localPlayer.setVehicle(nextVehicle);
            console.log(`Changed vehicle to ${nextVehicle} via request from ${fromClientId}`);
        }
        // Handle other request types if needed
    }

    _handleMessage(event) {
        const data = event; // data is the whole event object now
        const myClientId = this.networkManager?.getClientId() || 'UnknownClient'; // Safer way to get ID

        // Reduce logging frequency for non-essential messages
        if (data.type !== 'connected' && data.type !== 'disconnected' && data.type !== 'fireProjectile') {
            // console.log(`[NetworkEventHandler ${myClientId}] Received message:`, data);
        }

        switch (data.type) {
            case 'connected':
            case 'disconnected':
                // These are handled automatically by presence updates now
                // console.log(`[NetworkEventHandler ${myClientId}] Network Event: ${data.type} - Client: ${data.clientId}, ${data.username}`);
                break;
            case 'fireProjectile':
                // --- Enhanced Logging ---
                console.log(`[NetworkEventHandler ${myClientId}] Received 'fireProjectile' event from ${data.clientId || 'Unknown'}. Projectile ID: ${data.projectile?.id}`);

                // Check if projectileManager exists
                if (!this.projectileManager) {
                     console.error(`[NetworkEventHandler ${myClientId}] ProjectileManager not available! Cannot process fireProjectile event.`);
                     break;
                }
                // Validate essential data presence
                if (!data.projectile) {
                    console.warn(`[NetworkEventHandler ${myClientId}] Received 'fireProjectile' event but 'projectile' data is missing. Skipping.`);
                    break;
                }

                const p = data.projectile;

                // Basic validation of essential projectile data types from network
                 if (typeof p.x !== 'number' || typeof p.y !== 'number' ||
                     typeof p.vx !== 'number' || typeof p.vy !== 'number' ||
                     typeof p.id !== 'string' || typeof p.ownerId !== 'string') {
                      console.warn(`[NetworkEventHandler ${myClientId}] Received invalid 'fireProjectile' event data types. Skipping.`, p);
                      break;
                 }

                 // --- Log Before Duplicate Check ---
                 const existingProjectile = this.projectileManager.projectiles[p.id];
                 console.log(`[NetworkEventHandler ${myClientId}] Checking for duplicate projectile ${p.id}. Exists locally? ${!!existingProjectile}`);

                if (existingProjectile) {
                    console.warn(`[NetworkEventHandler ${myClientId}] Received 'fireProjectile' event for existing projectile ${p.id}. This shouldn't happen with echo:false. Ignoring creation.`);
                    break; // Prevent creating a duplicate if it somehow already exists
                }
                // --- End Duplicate Check ---


                // Extract data, providing defaults if necessary
                const gravityFactor = p.gravityFactor ?? GLOBAL_PHYSICS.PROJECTILE_GRAVITY_FACTOR;
                const damage = p.damage ?? 10; // Default damage if missing
                const color = p.color ?? 'yellow'; // Default color if missing

                // --- Log Before Calling Create ---
                console.log(`[NetworkEventHandler ${myClientId}] Calling projectileManager.createProjectile for ${p.id}...`);

                // Create the projectile using data directly from p
                // The createProjectile method now handles the creation logic
                this.projectileManager.createProjectile(
                    p.id, p.ownerId, p.x, p.y, p.vx, p.vy, color, damage, gravityFactor // Pass validated/defaulted data
                );
                // --- Note: createProjectile now logs success internally ---

                break;
            default:
                if (data.type !== 'connected' && data.type !== 'disconnected') {
                    // console.log(`[NetworkEventHandler ${myClientId}] Received unhandled message:`, data);
                }
                break;
        }
    }

    updateLocalPlayerPresence(timestamp) {
        const player = this.playerManager.getLocalPlayer();
        if (!player || !player.state) {
            return;
        }

        const presenceData = player.getPresenceData();
        this.networkManager.updatePresence(presenceData);
    }
}

export default NetworkEventHandler;