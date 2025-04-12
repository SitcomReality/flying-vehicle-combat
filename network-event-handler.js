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
                     // console.warn(`Presence received for unknown or not-yet-fully-connected peer ${clientId}. Waiting for peer info.`);
                     continue;
                 } else {
                    // console.log(`Received presence for peer ${clientId} before formal 'connected' event. Processing...`);
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
                        // console.log("Updating local player state from early presence data during CONNECTING phase.");
                        // Update state but don't recreate
                        this.playerManager.getLocalPlayer().updateFromServer(presenceData, now);
                        continue;
                    }
                }

                // console.log("New player detected from presence:", clientId, peerInfo?.username ?? this.networkManager.getPeer(clientId)?.username ?? 'Unknown');
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
                 // console.log("Local player received initial presence data while CONNECTING. Updating state.");
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
                    // console.log("Player disconnected (removed from presence/peers):", existingPlayerId, lastKnownPeerInfo?.username ?? '(info gone)');
                    this.playerManager.removePlayer(existingPlayerId);
                } else if (playerToRemove && !playerToRemove.isMarkedForRemoval && currentPeers[existingPlayerId]) {
                     // This case means presence is missing but peer info still exists - likely temporary desync or joining state
                     // console.warn(`Presence missing for ${existingPlayerId} but peer info still exists. Player not removed yet.`);
                }
            }
        }
    }

    _handleRoomStateUpdate(roomState) {
        // Handle room state updates (e.g., world items) if needed
    }

    _handlePresenceUpdateRequest(updateRequest, fromClientId) {
        // console.log("Received presence update request:", updateRequest, "from", fromClientId);
        const localPlayer = this.playerManager.getLocalPlayer();
        if (!localPlayer || !localPlayer.state) return;

        if (updateRequest.type === 'changeVehicle') {
            const currentVehicle = localPlayer.state.vehicleType; // Access state property
            const totalVehicles = SPRITES.vehicles.frames.length;
            const nextVehicle = (currentVehicle + 1) % totalVehicles;
            localPlayer.setVehicle(nextVehicle);
            console.log(`Changed vehicle to ${nextVehicle} via request from ${fromClientId}`);
        }
        // Handle potential damage requests here (low priority example)
        // else if (updateRequest.type === 'applyDamage' && localPlayer.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
        //     const damageAmount = updateRequest.amount || 0;
        //     console.log(`Received damage request from ${fromClientId} for ${damageAmount}`);
        //     localPlayer.takeDamage(damageAmount, performance.now());
        // }
    }

    _handleMessage(event) {
        const data = event.data;
        const myClientId = this.networkManager?.getClientId();

        if (!data || !data.type) {
            // console.warn(`[NetEvt ${myClientId}] Received event with missing data or type:`, event);
            return;
        }

        // --- Explicit Check for fireProjectile ---
        if (data.type === 'fireProjectile') {
            // --- START DETAILED LOGGING ---
            console.log(`[NetEvt ${myClientId}] === Received 'fireProjectile' event from ${data.clientId || 'Unknown'} ===`);
            console.log(`[NetEvt ${myClientId}] Event Data:`, JSON.stringify(data.projectile)); // Stringify for cleaner log

            // Check 1: Projectile Manager existence
            if (!this.projectileManager) {
                 console.error(`[NetEvt ${myClientId}] ABORT: ProjectileManager not available!`);
                 return; // Exit function
            }
            console.log(`[NetEvt ${myClientId}] Check 1 PASSED: ProjectileManager exists.`);

            // Check 2: Projectile data presence
            if (!data.projectile) {
                console.warn(`[NetEvt ${myClientId}] ABORT: 'projectile' data is missing.`);
                return; // Exit function
            }
            console.log(`[NetEvt ${myClientId}] Check 2 PASSED: Projectile data exists.`);

            const p = data.projectile;

            // Check 3: Basic data type validation
             if (typeof p.x !== 'number' || typeof p.y !== 'number' ||
                 typeof p.vx !== 'number' || typeof p.vy !== 'number' ||
                 typeof p.id !== 'string' || typeof p.ownerId !== 'string') {
                  console.warn(`[NetEvt ${myClientId}] ABORT: Invalid data types in projectile data.`, p);
                  return; // Exit function
             }
             console.log(`[NetEvt ${myClientId}] Check 3 PASSED: Basic data types valid.`);

            // Check 4: Duplicate Check
            if (this.projectileManager.projectiles[p.id]) {
                console.warn(`[NetEvt ${myClientId}] ABORT: Duplicate projectile ID ${p.id} detected. Skipping creation.`);
                return; // Exit function - prevent duplicate creation
            }
             console.log(`[NetEvt ${myClientId}] Check 4 PASSED: Projectile ID ${p.id} is not a duplicate.`);
            // --- END DUPLICATE CHECK ---

            // Extract data, providing defaults if necessary
            const gravityFactor = p.gravityFactor ?? GLOBAL_PHYSICS.PROJECTILE_GRAVITY_FACTOR;
            const damage = p.damage ?? 10; // Default damage if missing
            const color = p.color ?? 'yellow'; // Default color if missing
            console.log(`[NetEvt ${myClientId}] Extracted projectile details - Dmg: ${damage}, Grav: ${gravityFactor.toFixed(2)}, Color: ${color}`);

            // Attempt Creation
            console.log(`[NetEvt ${myClientId}] >>> Calling projectileManager.createProjectile for ID ${p.id}...`);
            try {
                this.projectileManager.createProjectile(
                    p.id, p.ownerId, p.x, p.y, p.vx, p.vy, color, damage, gravityFactor // Pass validated/defaulted data
                );
                console.log(`[NetEvt ${myClientId}] <<< projectileManager.createProjectile call completed for ID ${p.id}.`);
            } catch (error) {
                 console.error(`[NetEvt ${myClientId}] XXX Error during projectileManager.createProjectile call for ID ${p.id}:`, error);
            }
            // --- END DETAILED LOGGING ---

        } else if (data.type === 'connected' || data.type === 'disconnected') {
            // These are typically handled by presence updates, but log if received directly
            // console.log(`[NetEvt ${myClientId}] Received '${data.type}' message (usually handled by presence).`);
        } else {
            // Handle other potential custom message types here if needed
            console.log(`[NetworkEventHandler ${myClientId}] Received unhandled message type: ${data.type}`, data);
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