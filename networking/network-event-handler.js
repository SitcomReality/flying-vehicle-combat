// New file: Handles incoming network events and updates game state accordingly

import { SPRITES } from 'config/sprites.js';
import { PlayerLifecycleState } from '../entities/player-lifecycle.js'; // Import lifecycle states

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
                console.warn(`Presence received for unknown or not-yet-fully-connected peer ${clientId}. Waiting for peer info.`);
                continue;
            }

            const presenceData = presence[clientId];
            const existingPlayer = this.playerManager.getPlayer(clientId);

            if (!existingPlayer) {
                if (isLocal && this.playerManager.getLocalPlayer()) {
                    // Avoid recreating local player if already exists but presence arrives late
                    if (this.playerManager.getLocalPlayer().lifecycleState !== PlayerLifecycleState.CONNECTING) {
                         continue;
                    } else {
                        console.log("Updating local player state from early presence data during CONNECTING phase.");
                        // Update state but don't recreate
                        this.playerManager.getLocalPlayer().updateFromServer(presenceData, now);
                        continue;
                    }
                }

                console.log("New player detected from presence:", clientId, peerInfo?.username);
                const initialState = {
                    x: presenceData.x ?? this.gameConfig.GAME_WIDTH / 2,
                    y: presenceData.y ?? this.gameConfig.GAME_HEIGHT / 2,
                    vehicleType: presenceData.vehicleType ?? 0,
                    facingDirection: presenceData.facingDirection ?? -1,
                    rotation: presenceData.rotation ?? 0,
                    lifecycleState: presenceData.lifecycleState ?? PlayerLifecycleState.ACTIVE, // Default remote players to ACTIVE if state missing initially
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
                 console.log("Local player received initial presence data while CONNECTING. Updating state.");
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

            if (!currentPeers[existingPlayerId]) {
                const playerToRemove = this.playerManager.getPlayer(existingPlayerId);
                if (playerToRemove && !playerToRemove.isMarkedForRemoval) {
                    const lastKnownPeerInfo = this.networkManager.getPeer(existingPlayerId);
                    console.log("Player disconnected (removed from peers):", existingPlayerId, lastKnownPeerInfo?.username ?? '(info gone)');
                    this.playerManager.removePlayer(existingPlayerId);
                }
            }
        }
    }

    _handleRoomStateUpdate(roomState) {
        // Handle room state updates (e.g., world items) if needed
    }

    _handlePresenceUpdateRequest(updateRequest, fromClientId) {
        console.log("Received presence update request:", updateRequest, "from", fromClientId);
        const localPlayer = this.playerManager.getLocalPlayer();
        if (!localPlayer || !localPlayer.state) return;

        if (updateRequest.type === 'changeVehicle') {
            const currentVehicle = localPlayer.vehicleType;
            const totalVehicles = SPRITES.vehicles.frames.length;
            const nextVehicle = (currentVehicle + 1) % totalVehicles;
            localPlayer.setVehicle(nextVehicle);
            console.log(`Changed vehicle to ${nextVehicle} via request from ${fromClientId}`);
        }
    }

    _handleMessage(event) {
        const data = event;
        switch (data.type) {
            case 'connected':
            case 'disconnected':
                console.log(`Network Event: ${data.type} - Client: ${data.clientId}, ${data.username}`);
                break;
            case 'fireProjectile':
                if (data.projectile && this.projectileManager) {
                    const p = data.projectile;
                    this.projectileManager.createProjectile(
                        p.id, p.ownerId, p.x, p.y, p.vx, p.vy, p.color
                    );
                } else {
                    console.warn("Received invalid fireProjectile event data or projectileManager not ready.");
                }
                break;
            default:
                if (data.type !== 'connected' && data.type !== 'disconnected') {
                    console.log("Received unhandled message:", data);
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