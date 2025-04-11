// New file: Handles incoming network events and updates game state accordingly

import { SPRITES } from 'config/sprites.js';

class NetworkEventHandler {
    constructor(networkManager, playerManager, gameConfig) {
        this.networkManager = networkManager;
        this.playerManager = playerManager;
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
        const localPlayerId = this.playerManager.localPlayerId; // Get local ID from playerManager

        // Process updates for existing/new players based on presence data
        for (const clientId in presence) {
            const peerInfo = currentPeers[clientId];
            const isLocal = clientId === localPlayerId;

             // Sometimes presence arrives before peer info is fully populated for remote clients. Wait for it.
            if (!isLocal && !peerInfo) {
                console.warn(`Presence received for unknown or not-yet-fully-connected peer ${clientId}. Waiting for peer info.`);
                continue;
            }

            const presenceData = presence[clientId];
            const existingPlayer = this.playerManager.getPlayer(clientId);

            if (!existingPlayer) {
                 // Don't re-create local player if it already exists
                if (isLocal && this.playerManager.getLocalPlayer()) {
                    continue; // Already handled during init
                }

                console.log("New player detected from presence:", clientId, peerInfo?.username);
                // Validate presence data before creating player
                const initialState = {
                    x: presenceData.x ?? this.gameConfig.GAME_WIDTH / 2,
                    y: presenceData.y ?? this.gameConfig.GAME_HEIGHT / 2,
                    vehicleType: presenceData.vehicleType ?? 0,
                    facingDirection: presenceData.facingDirection ?? -1,
                    rotation: presenceData.rotation ?? 0,
                };
                 // PlayerManager handles creation and state initialization
                this.playerManager.createPlayer(clientId, initialState, false);
            } else if (!isLocal && existingPlayer) {
                // Update existing remote player
                existingPlayer.updateFromServer(presenceData, now);
            }
        }

        // Process disconnections (players in our list but not in current peers)
        const currentPeerIds = Object.keys(currentPeers);
        const managedPlayerIds = this.playerManager.getAllPlayerIds();

        for (const existingPlayerId of managedPlayerIds) {
            if (existingPlayerId === localPlayerId) continue; // Don't remove local player

            if (!currentPeers[existingPlayerId]) { // If not in the latest peer list, they disconnected
                 const playerToRemove = this.playerManager.getPlayer(existingPlayerId);
                 if (playerToRemove && !playerToRemove.isMarkedForRemoval) {
                    // Try to get last known info for logging before removal
                    const lastKnownPeerInfo = this.networkManager.getPeer(existingPlayerId);
                    console.log("Player disconnected (removed from peers):", existingPlayerId, lastKnownPeerInfo?.username ?? '(info gone)');
                    this.playerManager.removePlayer(existingPlayerId);
                }
            }
        }
    }

    _handleRoomStateUpdate(roomState) {
        // Handle room state updates (e.g., world items) if needed
        // console.log("Room state update:", roomState);
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
            // The main update loop will send the new presence data
            console.log(`Changed vehicle to ${nextVehicle} via request from ${fromClientId}`);
        }
        // Add other request types here
    }

    _handleMessage(event) {
        // Handle broadcasted events (e.g., sound effects, temporary visuals)
        // Avoid logging built-in types handled elsewhere
        if (event.type !== 'connected' && event.type !== 'disconnected') {
            console.log("Received message:", event);
        }
    }

    // Add a method to send the local player's presence
    updateLocalPlayerPresence(timestamp) {
        const player = this.playerManager.getLocalPlayer();
        // Ensure player and its state exist before sending presence
        if (!player || !player.state) {
            // This might happen briefly during initialization or if disconnected
            // console.warn("Attempted to update presence for non-existent local player or player state.");
            return;
        }

        const presenceData = player.getPresenceData();
        this.networkManager.updatePresence(presenceData);
        // The caller (e.g., game loop) should track the last update time
    }
}

export default NetworkEventHandler;