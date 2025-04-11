import AssetLoader from 'core/asset-loader.js';
import InputManager from 'core/input-manager.js';
import Renderer from 'rendering/renderer.js';
import NetworkManager from 'networking/network-manager.js';
import Player from 'entities/player.js';
import { SPRITES } from 'config/sprites.js';

console.log("Game starting...");

const canvas = document.getElementById('gameCanvas');
const debugEl = document.getElementById('debug');
const RENDER_SCALE = 2; // Render sprites larger for clarity/style

// --- Configuration ---
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const LOCAL_PLAYER_UPDATE_INTERVAL = 50; // ms - How often to send updates
const REMOTE_PLAYER_INTERPOLATION_FACTOR = 0.1; // How quickly remote players snap to server position (lower = smoother, higher = more responsive)
const MAX_DELTA_TIME = 0.1; // Maximum delta time in seconds (100ms) to prevent large jumps

// --- Global Game State ---
let assets = {};
let players = {}; // Store all players { clientId: Player instance }
let localPlayerId = null;
let lastUpdateTime = 0;
let lastPresenceUpdateTime = 0;

// --- Modules ---
const renderer = new Renderer(canvas, GAME_WIDTH, GAME_HEIGHT);
const inputManager = new InputManager();
const networkManager = new NetworkManager();
const assetLoader = new AssetLoader();

// --- Game Functions ---

function updateDebugInfo() {
    let debugText = `Client ID: ${localPlayerId}\n`;
    debugText += `Is Connected: ${networkManager.isOnline()}\n`;
    debugText += `Players (${Object.keys(players).length}):\n`;
    for (const id in players) {
        const p = players[id];
        if (!p) {
             debugText += `  ${id.substring(0, 4)}: Player object missing!\n`;
             continue;
        }
        const peerInfo = networkManager.getPeer(id);
        const name = peerInfo?.username || 'Unknown';
        const xVal = p.x; // Check value before toFixed
        const yVal = p.y; // Check value before toFixed

        debugText += `  ${name} (${id.substring(0, 4)}): x=${xVal}, y=${yVal}`;
        if (typeof xVal === 'number' && isFinite(xVal)) debugText += ` (int: ${Math.round(xVal)})`;
        else debugText += ` (INVALID)`;
        if (typeof yVal === 'number' && isFinite(yVal)) debugText += `, (int: ${Math.round(yVal)})`;
        else debugText += ` (INVALID)`;
        debugText += '\n';

        // Add isLocalPlayer flag check
        debugText += `    Is Local: ${p.isLocalPlayer}\n`;

        if (p.isLocalPlayer) {
             debugText += `    Input: ${JSON.stringify(inputManager.getInputState())}\n`;
             // Also show serverX/Y for local player for comparison if needed, though they aren't used for movement
             // const sxVal = p.serverX;
             // const syVal = p.serverY;
             // debugText += `    Local's server pos (unused): sx=${sxVal}, sy=${syVal}\n`;
        } else {
             const sxVal = p.serverX; // Check value before toFixed
             const syVal = p.serverY; // Check value before toFixed
             debugText += `    Server State: sx=${sxVal}, sy=${syVal}`;
             if (typeof sxVal === 'number' && isFinite(sxVal)) debugText += ` (int: ${Math.round(sxVal)})`;
             else debugText += ` (INVALID)`;
             if (typeof syVal === 'number' && isFinite(syVal)) debugText += `, (int: ${Math.round(syVal)})`;
             else debugText += ` (INVALID)`;
             debugText += '\n';
        }
    }
    debugEl.textContent = debugText;
}

async function initializeGame() {
    console.log("Initializing game...");
    try {
        // 1. Load Assets
        assets = await assetLoader.loadAssets(SPRITES);
        console.log("Assets loaded:", assets);

        // 2. Initialize Network
        await networkManager.initialize();
        localPlayerId = networkManager.getClientId();
        if (!localPlayerId) {
            throw new Error("Failed to get Client ID after network initialization.");
        }
        console.log("Network initialized. Client ID:", localPlayerId);

        // 3. Setup Network Event Handlers
        setupNetworkHandlers();

        // 4. Initialize Local Player (initial state before first presence update)
        // Ensure initial state has valid numbers
        const initialX = Math.random() * (GAME_WIDTH - (SPRITES.vehicles.frameWidth * RENDER_SCALE)); // Adjust for sprite width
        const initialY = Math.random() * (GAME_HEIGHT - (SPRITES.vehicles.hitboxHeight * RENDER_SCALE)); // Adjust for sprite height
        console.log(`Creating local player ${localPlayerId} at ${initialX}, ${initialY}`);
        createPlayer(localPlayerId, {
            x: initialX,
            y: initialY,
            vehicleType: 0 // Default vehicle
        }, true); // isLocalPlayer = true

        // Check if player was created successfully
        if (!players[localPlayerId]) {
             throw new Error("Local player object not found after creation.");
        }
        console.log("Local player instance:", players[localPlayerId]);


        // Send initial presence only after player object is confirmed created
        updateLocalPlayerPresence();

        // 5. Start Game Loop
        lastUpdateTime = performance.now();
        requestAnimationFrame(gameLoop);
        console.log("Game initialized successfully.");

    } catch (error) {
        console.error("Initialization failed:", error);
        debugEl.textContent = `Initialization failed: ${error.message}\nCheck console for details.`;
        // Display error to user?
    }
}

function setupNetworkHandlers() {
    networkManager.onPresenceUpdate((presence) => {
        const now = performance.now();
        // Add new players or update existing ones
        for (const clientId in presence) {
            // Ensure we don't accidentally re-create or update local player via presence
            if (clientId === localPlayerId) continue;

            if (!players[clientId]) {
                console.log("New player joined:", clientId, networkManager.getPeer(clientId)?.username);
                 // Make sure presence data has valid coordinates before creating player
                const initialState = presence[clientId];
                if (typeof initialState.x !== 'number' || typeof initialState.y !== 'number') {
                    console.warn(`Received invalid initial state for ${clientId}, using defaults.`);
                    initialState.x = GAME_WIDTH / 2;
                    initialState.y = GAME_HEIGHT / 2;
                }
                createPlayer(clientId, initialState); // isLocal defaults to false
            } else {
                 // Only update remote players based on presence
                players[clientId].updateFromServer(presence[clientId], now);
            }
        }
        // Remove players who are no longer present
        for (const clientId in players) {
            // Don't remove local player based on presence list
             if (clientId === localPlayerId) continue;

             if (!(clientId in presence) && !players[clientId].isMarkedForRemoval) {
                console.log("Player left:", clientId, networkManager.getPeer(clientId)?.username);
                removePlayer(clientId);
            }
        }
    });

    networkManager.onRoomStateUpdate((roomState) => {
        // Handle shared room state updates (e.g., item positions)
        // console.log("Room state updated:", roomState);
        // TODO: Implement room state handling (collectibles, powerups)
    });

     networkManager.onPresenceUpdateRequest((updateRequest, fromClientId) => {
        console.log("Received presence update request:", updateRequest, "from", fromClientId);
        // TODO: Handle requests like damage, powerup effects etc.
        // Example:
        // if (updateRequest.type === 'setColor') {
        //     const localPlayer = players[localPlayerId];
        //     if (localPlayer) {
        //         localPlayer.color = updateRequest.color;
        //         updateLocalPlayerPresence(); // Send updated state
        //     }
        // }
    });

    networkManager.onMessage((event) => {
        // Handle ephemeral events (like sound effects, explosions)
        // console.log("Received message:", event);
        // switch (event.type) {
        //     case 'player_shoot':
        //         // play shoot sound at event.x, event.y
        //         break;
        // }
    });
}


function createPlayer(clientId, initialState, isLocal = false) {
    if (players[clientId]) {
        console.warn(`Player ${clientId} already exists. Ignoring create request.`);
        return;
    }
     // Validate initial state coordinates
    const startX = (typeof initialState.x === 'number' && isFinite(initialState.x)) ? initialState.x : GAME_WIDTH / 2;
    const startY = (typeof initialState.y === 'number' && isFinite(initialState.y)) ? initialState.y : GAME_HEIGHT / 2;
    const startVehicle = (typeof initialState.vehicleType === 'number') ? initialState.vehicleType : 0;

    console.log(`Creating player ${clientId}. isLocal=${isLocal}. Pos: ${startX}, ${startY}`);

    try {
        const player = new Player(
            clientId,
            startX,
            startY,
            startVehicle,
            isLocal,
            assets,
            renderer.getContext(),
            RENDER_SCALE
        );
        players[clientId] = player;

        // Ensure initial server state is set for interpolation, even for local (though unused locally)
        player.serverX = startX;
        player.serverY = startY;

        if (!isLocal) {
            // Force position immediately on creation for remote players
            player.x = player.serverX;
            player.y = player.serverY;
        }

        console.log(`Player ${isLocal ? '(Local)' : ''} created: ${clientId}`);
    } catch (error) {
        console.error(`Failed to create player ${clientId}:`, error);
    }
}

function removePlayer(clientId) {
    if (!players[clientId]) return;

    players[clientId].isMarkedForRemoval = true; // Mark for removal
    // Maybe add a fade-out or explosion effect here?
    console.log(`Player marked for removal: ${clientId}`);

    // Clean up after a short delay (e.g., for animations)
    // For now, remove immediately
    delete players[clientId];
    console.log(`Player removed: ${clientId}`);
}

function updateLocalPlayerPresence() {
    const player = players[localPlayerId];
    if (!player) return;

    const presenceData = {
        x: player.x,
        y: player.y,
        vehicleType: player.vehicleType,
        // Add other relevant state: velocity?, health?, score?
    };
    networkManager.updatePresence(presenceData);
    lastPresenceUpdateTime = performance.now();
}

function update(deltaTime) {
    const now = performance.now();

    // Update local player based on input
    const localPlayer = players[localPlayerId];
    if (localPlayer) {
        const input = inputManager.getInputState();
        localPlayer.handleInput(input);
        localPlayer.update(deltaTime);

        // Clamp player position to screen bounds
        localPlayer.x = Math.max(0, Math.min(GAME_WIDTH - localPlayer.width * RENDER_SCALE, localPlayer.x));
        localPlayer.y = Math.max(0, Math.min(GAME_HEIGHT - localPlayer.height * RENDER_SCALE, localPlayer.y));

        // Send updates periodically
        if (now - lastPresenceUpdateTime > LOCAL_PLAYER_UPDATE_INTERVAL) {
            updateLocalPlayerPresence();
        }
    }

    // Update remote players (interpolation)
    for (const id in players) {
        if (id !== localPlayerId) {
            players[id].interpolate(REMOTE_PLAYER_INTERPOLATION_FACTOR);
            players[id].update(deltaTime); // For animations etc.
        }
    }
}

function draw() {
    renderer.clear();
    const ctx = renderer.getContext();

    // Draw background (optional)

    // Draw players
    // Draw remote players first, then local player on top
    for (const id in players) {
        if (id !== localPlayerId && !players[id].isMarkedForRemoval) {
            players[id].draw();
        }
    }
     if (players[localPlayerId] && !players[localPlayerId].isMarkedForRemoval) {
        players[localPlayerId].draw();
    }

    // Draw other entities (collectibles, powerups - TODO)

    // Draw UI elements (player names/avatars - TODO)
    for (const id in players) {
        if (!players[id].isMarkedForRemoval) {
             const peerInfo = networkManager.getPeer(id);
             if (peerInfo) {
                 renderer.drawText(peerInfo.username, players[id].x + (players[id].width * RENDER_SCALE / 2), players[id].y - 10, '#000', '10px Comic Sans MS', 'center');
             }
        }
    }
}

function gameLoop(currentTime) {
    const deltaTime = Math.min((currentTime - lastUpdateTime) / 1000, MAX_DELTA_TIME); // Delta time in seconds, capped
    lastUpdateTime = currentTime;

    // Check network connection status (optional)
    // if (!networkManager.isConnected()) {
    //     console.log("Disconnected, attempting to reconnect...");
    //     // Show disconnected message? Attempt reconnect?
    //     // For now, just stop the loop or show an overlay
    //     return; // Stop the loop if disconnected
    // }

    update(deltaTime);
    draw();
    updateDebugInfo(); // Update debug overlay

    requestAnimationFrame(gameLoop);
}

// --- Start the game ---
initializeGame();