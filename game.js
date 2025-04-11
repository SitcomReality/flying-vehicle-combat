import AssetLoader from 'core/asset-loader.js';
import InputManager from 'core/input-manager.js';
import Renderer from 'rendering/renderer.js';
import NetworkManager from 'networking/network-manager.js';
import PlayerManager from 'entities/player-manager.js'; // Import new manager
import NetworkEventHandler from 'networking/network-event-handler.js'; // Import new handler
import DebugRenderer from 'rendering/debug-renderer.js'; // Import new debug renderer
import { SPRITES } from 'config/sprites.js';

console.log("Game starting...");

// --- Configuration ---
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const RENDER_SCALE = 0.2; // Render sprites smaller
const LOCAL_PLAYER_UPDATE_INTERVAL = 50; // ms - How often to send updates
const MAX_DELTA_TIME = 0.1; // Max 100ms step to prevent large jumps

// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const debugEl = document.getElementById('debug');

// --- Core Modules ---
const renderer = new Renderer(canvas, GAME_WIDTH, GAME_HEIGHT);
const inputManager = new InputManager();
const networkManager = new NetworkManager();
const assetLoader = new AssetLoader();

// --- Game State ---
let assets = {};
let localPlayerId = null; // Stays here, needed by multiple modules
let lastUpdateTime = 0;
let lastPresenceUpdateTime = 0;

// --- Game Logic Modules (Initialized later) ---
let playerManager = null;
let networkEventHandler = null;
let debugRenderer = null;

// --- Initialization ---
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

        // 3. Instantiate Game Logic Modules (pass dependencies)
        playerManager = new PlayerManager(assets, renderer.getContext(), RENDER_SCALE, GAME_WIDTH, GAME_HEIGHT);
        playerManager.setLocalPlayerId(localPlayerId);

        const gameConfig = { GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE }; // Bundle config for modules
        networkEventHandler = new NetworkEventHandler(networkManager, playerManager, gameConfig);
        debugRenderer = new DebugRenderer(debugEl, playerManager, networkManager, inputManager, gameConfig);
        debugRenderer.setLocalPlayerId(localPlayerId);

        // 4. Create Local Player
        const initialVehicleType = Math.floor(Math.random() * SPRITES.vehicles.frames.length);
        const initialX = Math.random() * (GAME_WIDTH * 0.8) + GAME_WIDTH * 0.1;
        const initialY = GAME_HEIGHT / 2;
        const initialState = {
            x: initialX,
            y: initialY,
            vehicleType: initialVehicleType,
            facingDirection: -1,
            rotation: 0
        };
        playerManager.createPlayer(localPlayerId, initialState, true);
        console.log("Local player object created via PlayerManager.");

        // 5. Send Initial Presence
        networkEventHandler.updateLocalPlayerPresence(performance.now()); // Use handler to send presence
        lastPresenceUpdateTime = performance.now();
        console.log("Initial presence sent via NetworkEventHandler.");

        // 6. Setup Network Handlers (now done by NetworkEventHandler)
        networkEventHandler.setupNetworkHandlers();

        // 7. Start Game Loop
        lastUpdateTime = performance.now();
        requestAnimationFrame(gameLoop);
        console.log("Game initialized successfully.");

    } catch (error) {
        console.error("Initialization failed:", error);
        if (debugEl) { // Check if debugEl exists
             debugEl.textContent = `Initialization Error:\n${error.message}\n${error.stack}`;
        }
    }
}

// --- Main Update Function ---
function update(deltaTime) {
    const now = performance.now();

    // Update Local Player (Input + Physics + Clamping)
    const localPlayer = playerManager.getLocalPlayer();
    if (localPlayer && localPlayer.state && !localPlayer.isMarkedForRemoval) {
        const input = inputManager.getInputState();
        localPlayer.handleInput(input);
        localPlayer.update(deltaTime); // Runs local physics

        // Clamp local player position (Boundary checks)
         if (localPlayer.state.currentVehicle) {
             const vehicleConfig = localPlayer.state.currentVehicle;
             const minX = localPlayer.state.drawOffsetX * RENDER_SCALE;
             const maxX = GAME_WIDTH - (vehicleConfig.width - localPlayer.state.drawOffsetX) * RENDER_SCALE;
             const minY = localPlayer.state.drawOffsetY * RENDER_SCALE;
             const maxY = GAME_HEIGHT - (vehicleConfig.height - localPlayer.state.drawOffsetY) * RENDER_SCALE;

             localPlayer.state.x = Math.max(minX, Math.min(maxX, localPlayer.state.x));
             localPlayer.state.y = Math.max(minY, Math.min(maxY, localPlayer.state.y));
         }

        // Send presence update periodically
        if (now - lastPresenceUpdateTime > LOCAL_PLAYER_UPDATE_INTERVAL) {
             networkEventHandler.updateLocalPlayerPresence(now);
             lastPresenceUpdateTime = now;
        }
    }

    // Update Remote Players (Interpolation - now handled within PlayerManager)
    playerManager.updatePlayers(deltaTime);
}

// --- Main Draw Function ---
function draw() {
    renderer.clear();

    // Draw all players (handled by PlayerManager, includes sorting)
    playerManager.drawPlayers(renderer);

    // Draw player names/info (handled by DebugRenderer)
    debugRenderer.drawPlayerInfo(renderer);

    // Update debug div text (handled by DebugRenderer)
    debugRenderer.updateDebugInfo();
}

// --- Game Loop ---
function gameLoop(currentTime) {
    const rawDeltaTime = (currentTime - lastUpdateTime) / 1000;
    const deltaTime = Math.min(rawDeltaTime, MAX_DELTA_TIME);
    lastUpdateTime = currentTime;

    // Ensure modules are initialized before proceeding
    if (!playerManager || !networkEventHandler || !debugRenderer) {
        console.warn("Game loop running before modules initialized. Skipping frame.");
        requestAnimationFrame(gameLoop);
        return;
    }

    try {
        update(deltaTime);
        draw();
        // Debug info is updated within draw() via debugRenderer.updateDebugInfo()
    } catch (error) {
        console.error("Error in game loop:", error);
        if (debugEl) {
             debugEl.textContent = `GAME LOOP ERROR:\n${error.message}\n${error.stack}`;
        }
    }

    requestAnimationFrame(gameLoop);
}

// --- Start ---
initializeGame();