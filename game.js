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

console.log("Game starting...");

// --- Configuration ---
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const RENDER_SCALE = 0.2; 
const LOCAL_PLAYER_UPDATE_INTERVAL = 50; 
const MAX_DELTA_TIME = 0.1; 

// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const debugEl = document.getElementById('debug');

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

        const gameConfig = { GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE, groundLevelY }; 
        networkEventHandler = new NetworkEventHandler(networkManager, playerManager, projectileManager, gameConfig);
        debugRenderer = new DebugRenderer(debugEl, playerManager, networkManager, inputManager, gameConfig);
        debugRenderer.setLocalPlayerId(localPlayerId);

        // 4. Create Local Player
        const initialVehicleType = Math.floor(Math.random() * SPRITES.vehicles.frames.length);
        const initialX = Math.random() * (GAME_WIDTH * 0.8) + GAME_WIDTH * 0.1;
        const initialY = groundLevelY - (SPRITES.vehicles.hitboxHeight * RENDER_SCALE) - 10; 
        const initialState = {
            x: initialX,
            y: initialY,
            vehicleType: initialVehicleType,
            facingDirection: -1,
            rotation: 0,
            isOnGround: false 
        };
        const localPlayer = playerManager.createPlayer(localPlayerId, initialState, true);
        // Pass managers to the local player instance so it can fire projectiles
        if (localPlayer) {
             localPlayer.setManagers(projectileManager, networkManager);
        }
        console.log("Local player object created via PlayerManager.");

        // 5. Send Initial Presence
        networkEventHandler.updateLocalPlayerPresence(performance.now()); 
        lastPresenceUpdateTime = performance.now();
        console.log("Initial presence sent via NetworkEventHandler.");

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
    // Update Background
    backgroundRenderer.update(deltaTime);

    // Update Particle System
    particleSystem.update(deltaTime);

    // Update Projectiles
    projectileManager.update(deltaTime, groundLevelY);

    // --- Player Updates ---
    const localPlayer = playerManager.getLocalPlayer();

    // Handle local player input first
    if (localPlayer && localPlayer.state && !localPlayer.isMarkedForRemoval) {
        const input = inputManager.getInputState();
        localPlayer.handleInput(input); // Sets targetFacingDirection, isCharging, wantsToFire
    }

    // Update ALL players (Physics for local, Interpolation for remote, Animation/Charging for all)
    playerManager.updatePlayers(deltaTime, groundLevelY, particleSystem, currentTime);

    // Send local player presence periodically (after physics update)
    if (localPlayer && localPlayer.state && !localPlayer.isMarkedForRemoval) {
        if (currentTime - lastPresenceUpdateTime > LOCAL_PLAYER_UPDATE_INTERVAL) {
             networkEventHandler.updateLocalPlayerPresence(currentTime); // Use current time
             lastPresenceUpdateTime = currentTime;
        }
    }
}

// --- Main Draw Function ---
function draw() {
    renderer.clear(); 

    // Draw Background first (includes ground)
    backgroundRenderer.draw();

    // Draw Particles
    particleSystem.draw(renderer.getContext());

    // Draw Projectiles (draw before players?)
    projectileManager.draw(renderer.getContext());

    // Draw all players
    playerManager.drawPlayers(renderer);

    // Draw player names/info
    debugRenderer.drawPlayerInfo(renderer);

    // Update debug div text
    debugRenderer.updateDebugInfo();
}

// --- Game Loop ---
function gameLoop(currentTime) {
    const rawDeltaTime = (currentTime - lastUpdateTime) / 1000;
    const deltaTime = Math.min(rawDeltaTime, MAX_DELTA_TIME);
    lastUpdateTime = currentTime;

    // Ensure modules are initialized before proceeding
    if (!playerManager || !networkEventHandler || !debugRenderer || !backgroundRenderer || !particleSystem) {
        console.warn("Game loop running before modules initialized. Skipping frame.");
        requestAnimationFrame(gameLoop);
        return;
    }

    try {
        update(deltaTime, currentTime); // Pass currentTime to update
        draw();
    } catch (error) {
        console.error("Error in game loop:", error);
        if (debugEl) {
             debugEl.textContent = `GAME LOOP ERROR:\n${error.message}\n${error.stack}`;
        }
        // Optional: Stop the loop on error to prevent spamming
        // return;
    }

    requestAnimationFrame(gameLoop);
}

// --- Start ---
initializeGame();