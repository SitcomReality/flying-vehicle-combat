import AssetLoader from 'core/asset-loader.js';
import InputManager from 'core/input-manager.js';
import Renderer from 'rendering/renderer.js';
import NetworkManager from 'networking/network-manager.js';
import Player from 'entities/player.js';
import { SPRITES } from 'config/sprites.js';

console.log("Game starting...");

const canvas = document.getElementById('gameCanvas');
const debugEl = document.getElementById('debug');
const RENDER_SCALE = 0.2; // Render sprites smaller

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const LOCAL_PLAYER_UPDATE_INTERVAL = 50; // ms - How often to send updates

let assets = {};
let players = {}; // Store all players { clientId: Player instance }
let localPlayerId = null;
let lastUpdateTime = 0;
let lastPresenceUpdateTime = 0;

const renderer = new Renderer(canvas, GAME_WIDTH, GAME_HEIGHT);
const inputManager = new InputManager();
const networkManager = new NetworkManager();
const assetLoader = new AssetLoader();

function updateDebugInfo() {
    let debugText = `Client ID: ${localPlayerId}\n`;
    debugText += `Render Scale: ${RENDER_SCALE}\n`;
    debugText += `Players (${Object.keys(players).length}):\n`;
    for (const id in players) {
        const p = players[id];
        if (!p || !p.state || p.isMarkedForRemoval) continue; // Added check for p.state

        const peerInfo = networkManager.getPeer(id);
        const name = peerInfo?.username || 'Unknown';
        debugText += `  ${name} (${id.substring(0, 4)}): P(${p.state.x?.toFixed(0)}, ${p.state.y?.toFixed(0)}) V(${p.state.vx?.toFixed(0)}, ${p.state.vy?.toFixed(0)}) R:${p.state.rotation?.toFixed(2)} F:${p.state.facingDirection === 1 ? 'R' : 'L'}\n`;
        if (p.isLocalPlayer) {
             debugText += `    Input: ${JSON.stringify(inputManager.getInputState())} Thrust:${p.isThrusting}\n`;
        } else {
             debugText += `    Server: P(${p.state.serverX?.toFixed(0)}, ${p.state.serverY?.toFixed(0)}) R:${p.state.serverRotation?.toFixed(2)}\n`;
        }
    }
    debugEl.textContent = debugText;
}

async function initializeGame() {
    console.log("Initializing game...");
    try {
        assets = await assetLoader.loadAssets(SPRITES);
        console.log("Assets loaded:", assets);

        await networkManager.initialize();
        localPlayerId = networkManager.getClientId();
        console.log("Network initialized. Client ID:", localPlayerId);

        const initialVehicleType = Math.floor(Math.random() * SPRITES.vehicles.frames.length);
        const initialX = Math.random() * (GAME_WIDTH * 0.8) + GAME_WIDTH * 0.1;
        const initialY = GAME_HEIGHT / 2;
        const initialRotation = 0;
        const initialFacingDirection = -1; // Default left

        // Ensure initial state has all required props
        const initialState = {
             x: initialX,
             y: initialY,
             vehicleType: initialVehicleType,
             facingDirection: initialFacingDirection,
             rotation: initialRotation
        };

        // Create player *before* setting up handlers that might receive presence for it
        createPlayer(localPlayerId, initialState, true);
        console.log("Local player object created.");

        // Send initial presence *after* player exists
        updateLocalPlayerPresence();
        console.log("Initial presence sent.");

        setupNetworkHandlers();
        console.log("Network handlers setup.");

        lastUpdateTime = performance.now();
        requestAnimationFrame(gameLoop);
        console.log("Game initialized successfully.");

    } catch (error) {
        console.error("Initialization failed:", error);
        // Display error to user
        debugEl.textContent = `Initialization Error:\n${error.message}\n${error.stack}`;
    }
}

function setupNetworkHandlers() {
    networkManager.onPresenceUpdate((presence) => {
        const now = performance.now();
        const currentPeerIds = networkManager.getPeers ? Object.keys(networkManager.getPeers()) : Object.keys(presence);

        // Process updates for existing/new players
        for (const clientId in presence) {
             // Check if we have peer info. Sometimes presence arrives before peer info.
             // If peer info doesn't exist yet, wait for the next update cycle.
            if (!networkManager.peers[clientId] && clientId !== localPlayerId) {
                console.warn(`Presence received for unknown or not-yet-fully-connected peer ${clientId}. Waiting for peer info.`);
                continue;
            }

            const presenceData = presence[clientId];
            if (!players[clientId]) {
                 // Don't re-create local player if it already exists
                if (clientId === localPlayerId && players[localPlayerId]) {
                     // console.log("Ignoring presence update for existing local player.");
                    continue;
                }

                console.log("New player detected from presence:", clientId, networkManager.getPeer(clientId)?.username);
                // Validate presence data before creating player
                const initialState = {
                    x: presenceData.x ?? GAME_WIDTH / 2,
                    y: presenceData.y ?? GAME_HEIGHT / 2,
                    vehicleType: presenceData.vehicleType ?? 0,
                    facingDirection: presenceData.facingDirection ?? -1,
                    rotation: presenceData.rotation ?? 0,
                };
                 createPlayer(clientId, initialState, false); // Always false here, local player created separately
            } else if (clientId !== localPlayerId && players[clientId]) {
                // Update existing remote player
                 players[clientId].updateFromServer(presenceData, now);
            }
        }

        // Process disconnections (players in our list but not in current peers/presence)
        for (const existingPlayerId in players) {
            if (existingPlayerId === localPlayerId) continue;

            const isInPresence = !!presence[existingPlayerId];
            // Use peers list as the primary source of truth for connection status
            const isInPeers = !!networkManager.peers[existingPlayerId];

            if (!isInPeers) { // If not in peers list, they are disconnected
                if (players[existingPlayerId] && !players[existingPlayerId].isMarkedForRemoval) {
                    const peerInfo = networkManager.getPeer(existingPlayerId); // Try to get last known info
                    console.log("Player disconnected (removed from peers):", existingPlayerId, peerInfo?.username ?? '(info gone)');
                    removePlayer(existingPlayerId);
                }
            }
             // Optional: Handle cases where player is in peers but not presence (might indicate stale presence data)
             // else if (!isInPresence) {
             //     console.warn(`Player ${existingPlayerId} exists in peers but not in current presence update.`);
             // }
        }
    });
    // ... existing handlers ...
    networkManager.onRoomStateUpdate((roomState) => {
        // Handle room state updates (e.g., world items) if needed
        // console.log("Room state update:", roomState);
    });

    networkManager.onPresenceUpdateRequest((updateRequest, fromClientId) => {
        console.log("Received presence update request:", updateRequest, "from", fromClientId);
        const localPlayer = players[localPlayerId];
        if (!localPlayer || !localPlayer.state) return; // Added state check

        if (updateRequest.type === 'changeVehicle') {
            const currentVehicle = localPlayer.vehicleType;
            const totalVehicles = SPRITES.vehicles.frames.length;
            const nextVehicle = (currentVehicle + 1) % totalVehicles;
            localPlayer.setVehicle(nextVehicle);
            updateLocalPlayerPresence();
            console.log(`Changed vehicle to ${nextVehicle} via request from ${fromClientId}`);
        }
        // Add other request types here
    });

    networkManager.onMessage((event) => {
        // Handle broadcasted events (e.g., sound effects, temporary visuals)
        // Avoid logging built-in types handled elsewhere
        if (event.type !== 'connected' && event.type !== 'disconnected') {
            console.log("Received message:", event);
        }
    });

    console.log("Network event handlers are fully registered.");
}

function createPlayer(clientId, initialState, isLocal = false) {
    // Guard against existing, non-removed players
    if (players[clientId] && !players[clientId].isMarkedForRemoval) {
        console.warn(`Attempted to create player ${clientId} but they already exist and are not marked for removal.`);
         // If somehow the isLocal status is wrong, correct it.
        if (players[clientId].isLocalPlayer !== isLocal) {
             console.warn(`Correcting isLocal status for existing player ${clientId}.`);
             players[clientId].state.isLocalPlayer = isLocal;
        }
        // Optionally update state for the existing player? Be careful not to overwrite local authority.
        // if (!isLocal) {
        //     players[clientId].updateFromServer(initialState, performance.now());
        // }
        return players[clientId];
    }

    // Ensure initialState has defaults if properties are missing
    const safeInitialState = {
        x: initialState?.x ?? GAME_WIDTH / 2,
        y: initialState?.y ?? GAME_HEIGHT / 2,
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
        assets, // Pass loaded assets
        renderer.getContext(),
        RENDER_SCALE,
        GAME_WIDTH,
        GAME_HEIGHT
    );

    // Player constructor handles setting initial state via PlayerState constructor,
    // including calling updateVehicleProperties. We might still need to sync
    // rotation/facingDirection if not part of the core PlayerState constructor init logic.
    player.state.facingDirection = safeInitialState.facingDirection; // Ensure these visual states are set
    player.state.rotation = safeInitialState.rotation;

    players[clientId] = player;

    // For remote players, immediately set their server state and snap visual state
    if (!isLocal) {
        player.updateFromServer(safeInitialState, performance.now()); // Set server target
        player.state.x = player.state.serverX; // Snap visual position
        player.state.y = player.state.serverY;
        player.state.rotation = player.state.serverRotation; // Snap visual rotation
        player.state.facingDirection = player.state.serverFacingDirection; // Snap visual direction
    }

    console.log(`Player ${clientId} (Local: ${isLocal}) created successfully. Position: ${player.state.x.toFixed(0)},${player.state.y.toFixed(0)} Vehicle: ${player.state.vehicleType}`);
    return player; // Return the created player
}

function removePlayer(clientId) {
    if (!players[clientId]) return;

    // Mark for removal first to stop updates/drawing immediately
    players[clientId].isMarkedForRemoval = true;
    console.log(`Player marked for removal: ${clientId}`);

    // Clean up the actual object reference
    // Use delete for object property removal
    delete players[clientId];
    console.log(`Player removed from players object: ${clientId}`);
}

function updateLocalPlayerPresence() {
    const player = players[localPlayerId];
    // Ensure player and its state exist before sending presence
    if (!player || !player.state) {
         console.warn("Attempted to update presence for non-existent local player or player state.");
        return;
    }

    const presenceData = player.getPresenceData(); // Use the helper method
    networkManager.updatePresence(presenceData);
    lastPresenceUpdateTime = performance.now();
}

function update(deltaTime) {
    const now = performance.now();

    const localPlayer = players[localPlayerId];
    // **Crucial Check**: Ensure localPlayer and its state exist and haven't been marked for removal
    if (localPlayer && localPlayer.state && !localPlayer.isMarkedForRemoval) {
        const input = inputManager.getInputState();
        localPlayer.handleInput(input); // Update based on input
        localPlayer.update(deltaTime); // Run physics/interpolation

        // **Crucial Check**: Ensure currentVehicle is valid before accessing properties
        if (localPlayer.state.currentVehicle) {
             // Access properties via localPlayer.state
            const vehicleConfig = localPlayer.state.currentVehicle;
            const drawnWidth = vehicleConfig.width * RENDER_SCALE;
            const drawnHeight = vehicleConfig.height * RENDER_SCALE;

            // Calculate effective boundaries based on the anchor point (state.x/y) and draw offsets
            // Min X: anchor must be >= drawOffsetX * scale
            const minX = localPlayer.state.drawOffsetX * RENDER_SCALE;
            // Max X: anchor must be <= gameWidth - (spriteWidth - drawOffsetX) * scale
            const maxX = GAME_WIDTH - (vehicleConfig.width - localPlayer.state.drawOffsetX) * RENDER_SCALE;
            // Min Y: anchor must be >= drawOffsetY * scale
            const minY = localPlayer.state.drawOffsetY * RENDER_SCALE;
            // Max Y: anchor must be <= gameHeight - (spriteHeight - drawOffsetY) * scale
            const maxY = GAME_HEIGHT - (vehicleConfig.height - localPlayer.state.drawOffsetY) * RENDER_SCALE;

            // Clamp the anchor position (state.x, state.y)
            localPlayer.state.x = Math.max(minX, Math.min(maxX, localPlayer.state.x));
            localPlayer.state.y = Math.max(minY, Math.min(maxY, localPlayer.state.y));

        } else {
             console.warn(`Local player ${localPlayerId} missing currentVehicle in update()`);
        }


        // Send presence update periodically
        if (now - lastPresenceUpdateTime > LOCAL_PLAYER_UPDATE_INTERVAL) {
            updateLocalPlayerPresence();
        }
    }

    // Update remote players
    for (const id in players) {
        // Ensure player exists, is not local, has state, and is not marked for removal
        if (id !== localPlayerId && players[id] && players[id].state && !players[id].isMarkedForRemoval) {
            players[id].update(deltaTime); // Run interpolation logic
        }
    }
}

function draw() {
    renderer.clear();
    const ctx = renderer.getContext();

    // Sort players to draw local player last (on top) - or based on Y? For now, local on top.
    const sortedPlayerIds = Object.keys(players).sort((a, b) => {
        if (a === localPlayerId) return 1; // Draw local player later (on top)
        if (b === localPlayerId) return -1; // Draw other players earlier
        // Optional: sort by Y position for pseudo-depth
        // const playerA = players[a];
        // const playerB = players[b];
        // if (playerA && playerA.state && playerB && playerB.state) {
        //     return playerA.state.y - playerB.state.y;
        // }
        return 0; // Default sort order if data missing
    });

    // Draw players
    for (const id of sortedPlayerIds) {
        const player = players[id];
        // Ensure player exists and is not marked for removal before drawing
        if (player && !player.isMarkedForRemoval) {
            player.draw();
        }
    }

    // Draw player names/info
    for (const id in players) {
        const player = players[id];
         // Ensure player exists, has state, and is not marked for removal
        if (player && player.state && !player.isMarkedForRemoval) {
            const peerInfo = networkManager.getPeer(id);
            if (peerInfo) {
                const visualCenter = player.getVisualCenter(); // Use helper to get draw position
                renderer.drawText(
                    peerInfo.username,
                    visualCenter.x, // Centered horizontally
                    visualCenter.topY - 10, // Positioned above the sprite
                    '#333', // Dark color for readability
                    '11px "Comic Sans MS", "Chalkduster", cursive', // Crayon font
                    'center', // Align text center
                    'bottom' // Baseline at the bottom of the text
                );
            }
        }
    }
}

function gameLoop(currentTime) {
    // Robust delta time calculation
    const rawDeltaTime = (currentTime - lastUpdateTime) / 1000; // Delta time in seconds
    // Clamp delta time to prevent large jumps (e.g., during tab backgrounding)
    const deltaTime = Math.min(rawDeltaTime, 0.1); // Max 100ms step
    lastUpdateTime = currentTime;

    // Use try-catch to prevent game loop from stopping on errors
    try {
        update(deltaTime);
        draw();
        updateDebugInfo();
    } catch (error) {
        console.error("Error in game loop:", error);
        // Display error in debug div?
         debugEl.textContent = `GAME LOOP ERROR:\n${error.message}\n${error.stack}`;
         // Consider stopping the loop or specific subsystems on critical errors
    }

    // Continue the loop
    requestAnimationFrame(gameLoop);
}

// Start the game initialization process
initializeGame();