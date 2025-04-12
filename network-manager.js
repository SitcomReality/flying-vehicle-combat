// New file: Handles the network logic and synchronization

import { PlayerLifecycleState } from '../entities/player-lifecycle.js';
import { GLOBAL_PHYSICS } from '../entities/player-state.js';

class NetworkManager {
    constructor() {
        this.room = new WebsimSocket();
        this.clientId = null;
        this.peers = {};
        this.presence = {};
        this.roomState = {};
        this.isConnected = false;

        this.presenceUpdateCallback = null;
        this.roomStateUpdateCallback = null;
        this.presenceUpdateRequestCallback = null;
        this.messageCallback = null;

        this._handlePresenceUpdate = this._handlePresenceUpdate.bind(this);
        this._handleRoomStateUpdate = this._handleRoomStateUpdate.bind(this);
        this._handlePresenceUpdateRequest = this._handlePresenceUpdateRequest.bind(this);
        this._handleMessage = this._handleMessage.bind(this);
    }

    async initialize() {
        try {
            await this.room.initialize();
            this.clientId = this.room.clientId;
            this.peers = this.room.peers; // Initial snapshot
            this.presence = this.room.presence; // Initial snapshot
            this.roomState = this.room.roomState; // Initial snapshot
            this.isConnected = true;

            // Setup subscriptions
            this.room.subscribePresence(this._handlePresenceUpdate);
            this.room.subscribeRoomState(this._handleRoomStateUpdate);
            this.room.subscribePresenceUpdateRequests(this._handlePresenceUpdateRequest);
            this.room.onmessage = this._handleMessage;

            console.log("NetworkManager initialized. Client ID:", this.clientId);
            console.log("Initial Peers:", this.peers);
            console.log("Initial Presence:", this.presence);
            console.log("Initial Room State:", this.roomState);

        } catch (error) {
            console.error("WebsimSocket initialization failed:", error);
            this.isConnected = false;
            throw error; // Re-throw for the caller to handle
        }
    }

    _handlePresenceUpdate(currentPresence) {
        // Update internal state (WebsimSocket already does this via room.presence)
        this.presence = this.room.presence;
        this.peers = this.room.peers; // Peers can change when presence updates

        // Notify the game logic
        if (this.presenceUpdateCallback) {
            this.presenceUpdateCallback(this.presence);
        }
    }

    _handleRoomStateUpdate(currentRoomState) {
        // Update internal state
        this.roomState = this.room.roomState;

        // Notify the game logic
        if (this.roomStateUpdateCallback) {
            this.roomStateUpdateCallback(this.roomState);
        }
    }

     _handlePresenceUpdateRequest(updateRequest, fromClientId) {
        // Notify the game logic
        if (this.presenceUpdateRequestCallback) {
            this.presenceUpdateRequestCallback(updateRequest, fromClientId);
        }
    }

    _handleMessage(event) {
         // Built-in connection/disconnection events update peers automatically via presence subscription
        if (event.type === "connected" || event.type === "disconnected") {
            // console.log(`Network Event: ${event.type} - Client: ${event.clientId}, ${event.username}`);
            // Peer list is updated via the presence subscription handler
             this.peers = this.room.peers; // Update peers immediately
        } else {
             // Handle custom game events
            if (this.messageCallback) {
                this.messageCallback(event); // Pass the whole event object
            }
        }
    }

    updatePresence(data) {
        if (!this.isConnected) return;
        this.room.updatePresence(data);
    }

    updateRoomState(data) {
         if (!this.isConnected) return;
        this.room.updateRoomState(data);
    }

    requestPresenceUpdate(clientId, update) {
         if (!this.isConnected) return;
        this.room.requestPresenceUpdate(clientId, update);
    }

    sendEvent(eventData) {
         if (!this.isConnected) return;
        this.room.send(eventData);
    }

    // --- Callback Setters ---
    onPresenceUpdate(callback) {
        this.presenceUpdateCallback = callback;
         // Immediately call back with current state if already connected
        if (this.isConnected) {
             callback(this.presence);
        }
    }

    onRoomStateUpdate(callback) {
        this.roomStateUpdateCallback = callback;
         if (this.isConnected) {
             callback(this.roomState);
        }
    }

    onPresenceUpdateRequest(callback) {
        this.presenceUpdateRequestCallback = callback;
    }

    onMessage(callback) {
        this.messageCallback = callback;
    }

    // --- Getters ---
    getClientId() {
        return this.clientId;
    }

    getPeers() {
        return this.peers;
    }

    getPeer(clientId) {
        return this.peers[clientId];
    }

    getPresence() {
        return this.presence;
    }

    getRoomState() {
        return this.roomState;
    }

    isOnline() {
        return this.isConnected;
    }
}

export default NetworkManager;