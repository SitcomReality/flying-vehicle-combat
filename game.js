import AssetLoader from 'core/asset-loader.js';
import InputManager from 'core/input-manager.js';
import Renderer from 'rendering/renderer.js';
import NetworkManager from 'networking/network-manager.js';
import PlayerManager from 'entities/player-manager.js';
import ProjectileManager from 'core/projectile-manager.js';
import NetworkEventHandler from 'networking/network-event-handler.js';
import DebugRenderer from 'rendering/debug-renderer.js';
import BackgroundRenderer from 'rendering/background-renderer.js';
import { ParticleSystem } from 'rendering/particle-system.js';
import { SPRITES } from 'config/sprites.js';
import VehicleSelector from './ui/vehicle-selector.js';
import { PlayerLifecycleState } from './entities/player-lifecycle.js';

console.log("Game starting...");

// --- Configuration ---
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const RENDER_SCALE = 0.2;
const LOCAL_PLAYER_UPDATE_INTERVAL = 50;
const MAX_DELTA_TIME = 0.1;
const DEBUG_KILL_KEY = 'k';

// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const debugEl = document.getElementById('debug');
const vehicleSelectorEl = document.getElementById('vehicleSelector');

// --- Core Modules ---
const renderer = new Renderer(canvas, GAME_WIDTH, GAME_HEIGHT);
const inputManager = new InputManager();
const networkManager = new NetworkManager();
const assetLoader = new AssetLoader();
const projectileManager = new ProjectileManager();

// --- Game State ---
let assets = {};
let localPlayerId = null;
let lastUpdateTime = 0;
let lastPresenceUpdateTime = 0;
let groundLevelY = GAME_HEIGHT;

// --- Game Logic Modules (Initialized later) ---
let playerManager = null;
let networkEventHandler = null;
let debugRenderer = null;
let backgroundRenderer = null;
let particleSystem = null;
let vehicleSelector = null;

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
        backgroundRenderer = new BackgroundRenderer(renderer.getContext(), GAME_WIDTH, GAME_HEIGHT);
        groundLevelY = backgroundRenderer.getGroundLevel();
        particleSystem = new ParticleSystem();
        vehicleSelector = new VehicleSelector(vehicleSelectorEl, SPRITES.vehicles.frames, (type) => {
            playerManager.confirmLocalPlayerVehicleSelection(type);
        });

        playerManager.setManagers(projectileManager, networkManager, vehicleSelector);

        const gameConfig = { GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE, groundLevelY };
        networkEventHandler = new NetworkEventHandler(networkManager, playerManager, projectileManager, gameConfig);
        debugRenderer = new DebugRenderer(debugEl, playerManager, networkManager, inputManager, gameConfig);
        debugRenderer.setLocalPlayerId(localPlayerId);

        // 4. Create Local Player
        const initialX = GAME_WIDTH / 2;
        const initialY = groundLevelY - (SPRITES.vehicles.hitboxHeight * RENDER_SCALE) - 10;
        const initialState = {
            x: initialX,
            y: initialY,
            vehicleType: 0,
            facingDirection: -1,
            rotation: 0,
        };
        const localPlayer = playerManager.createPlayer(localPlayerId, initialState, true);
        if (localPlayer) {
            localPlayer.setManagers(projectileManager, networkManager);
        }
        console.log("Local player creation initiated via PlayerManager.");

        if (localPlayer && localPlayer.state.lifecycleState !== PlayerLifecycleState.CONNECTING) {
            networkEventHandler.updateLocalPlayerPresence(performance.now());
            lastPresenceUpdateTime = performance.now();
            console.log("Initial presence sent via NetworkEventHandler.");
        } else {
            console.log("Initial presence deferred until player state is confirmed.");
        }

        // 6. Setup Network Handlers
        networkEventHandler.setupNetworkHandlers();

        // 7. Start Game Loop
        lastUpdateTime = performance.now();
        requestAnimationFrame(gameLoop);
        console.log("Game initialized successfully.");

    } catch (error) {
        console.error("Initialization failed:", error);
        if (debugEl) {
            debugEl.textContent = `Initialization Error:\n${error.message}\n${error.stack}`;
        }
    }
}

// --- Main Update Function ---
function update(deltaTime, currentTime) {
    backgroundRenderer.update(deltaTime);
    particleSystem.update(deltaTime);
    projectileManager.update(deltaTime, groundLevelY);

    const localPlayer = playerManager.getLocalPlayer();
    const input = inputManager.getInputState();

    if (localPlayer && localPlayer.state && !localPlayer.isMarkedForRemoval) {
        localPlayer.handleInput(input);
    }

    playerManager.updatePlayers(deltaTime, groundLevelY, particleSystem, currentTime);

    if (localPlayer && localPlayer.state && !localPlayer.isMarkedForRemoval && localPlayer.lifecycleState !== PlayerLifecycleState.CONNECTING) {
        if (currentTime - lastPresenceUpdateTime > LOCAL_PLAYER_UPDATE_INTERVAL) {
            networkEventHandler.updateLocalPlayerPresence(currentTime);
            lastPresenceUpdateTime = currentTime;
        }
    }

    if (inputManager.wasKeyJustPressed(DEBUG_KILL_KEY)) {
        console.log("Debug key pressed: Kill Local Player");
        playerManager.killLocalPlayer();
    }
}

// --- Main Draw Function ---
function draw() {
    renderer.clear();
    backgroundRenderer.draw();
    particleSystem.draw(renderer.getContext());
    projectileManager.draw(renderer.getContext());
    playerManager.drawPlayers(renderer);
    debugRenderer.drawPlayerInfo(renderer);
    debugRenderer.updateDebugInfo();
}

// --- Game Loop ---
function gameLoop(currentTime) {
    const rawDeltaTime = (currentTime - lastUpdateTime) / 1000;
    const deltaTime = Math.min(rawDeltaTime, MAX_DELTA_TIME);
    lastUpdateTime = currentTime;

    if (!playerManager || !networkEventHandler || !debugRenderer || !backgroundRenderer || !particleSystem) {
        console.warn("Game loop running before modules initialized. Skipping frame.");
        requestAnimationFrame(gameLoop);
        return;
    }

    try {
        inputManager.updateJustPressed();
        update(deltaTime, currentTime);
        draw();
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