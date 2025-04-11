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
    debugText += `Players (${Object.keys(players).length}):\n`;
    for (const id in players) {
        const p = players[id];
        const peerInfo = networkManager.getPeer(id);
        const name = peerInfo?.username || 'Unknown';
        debugText += `  ${name} (${id.substring(0, 4)}): ${p.x.toFixed(0)}, ${p.y.toFixed(0)}\n`;
        if (p.isLocalPlayer) {
             debugText += `    Input: ${JSON.stringify(inputManager.getInputState())}\n`;
        } else {
             debugText += `    Server: ${p.serverX?.toFixed(0)}, ${p.serverY?.toFixed(0)}\n`;
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
        console.log("Network initialized. Client ID:", localPlayerId);

        // 3. Setup Network Event Handlers
        setupNetworkHandlers();

        // 4. Initialize Local Player (initial state before first presence update)
        createPlayer(localPlayerId, {
            x: Math.random() * GAME_WIDTH,
            y: Math.random() * GAME_HEIGHT,
            vehicleType: 0 // Default vehicle
        }, true); // isLocalPlayer = true

        // Send initial presence
        updateLocalPlayerPresence();

        // 5. Start Game Loop
        lastUpdateTime = performance.now();
        requestAnimationFrame(gameLoop);
        console.log("Game initialized successfully.");

    } catch (error) {
        console.error("Initialization failed:", error);
        // Display error to user?
    }
}

function setupNetworkHandlers() {
    networkManager.onPresenceUpdate((presence) => {
        const now = performance.now();
        // Add new players or update existing ones
        for (const clientId in presence) {
            if (!players[clientId]) {
                console.log("New player joined:", clientId, networkManager.getPeer(clientId)?.username);
                createPlayer(clientId, presence[clientId]);
            } else if (clientId !== localPlayerId) {
                 // Only update remote players based on presence
                players[clientId].updateFromServer(presence[clientId], now);
            }
        }
        // Remove players who are no longer present
        for (const clientId in players) {
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
    if (players[clientId]) return; // Already exists

    const player = new Player(
        clientId,
        initialState.x ?? GAME_WIDTH / 2,
        initialState.y ?? GAME_HEIGHT / 2,
        initialState.vehicleType ?? 0,
        isLocal,
        assets,
        renderer.getContext(),
        RENDER_SCALE
    );
    players[clientId] = player;

    // Ensure initial server state is set for interpolation
    if (!isLocal) {
        player.updateFromServer(initialState, performance.now());
         // Force position immediately on creation for remote players
        player.x = player.serverX;
        player.y = player.serverY;
    }

    console.log(`Player ${isLocal ? '(Local)' : ''} created: ${clientId}`);
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
    const deltaTime = (currentTime - lastUpdateTime) / 1000; // Delta time in seconds
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


