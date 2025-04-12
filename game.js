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
import VehicleSelector from 'ui/vehicle-selector.js';
import { PlayerLifecycleState } from 'entities/player-lifecycle.js';
import StatusBarRenderer from 'ui/status-bars.js';
import PowerupManager from 'entities/powerups/powerup-manager.js';
import CollisionManager from 'entities/combat/collision-manager.js';
import PlayerLifecycleManager from 'entities/player-lifecycle-manager.js';
import SpaceObjectManager from 'entities/space-objects/space-object-manager.js';
import CollectibleManager from 'entities/collectibles/collectible-manager.js';
import Scoreboard from 'ui/scoreboard.js';
import ScorePersistence from 'networking/score-persistence.js';
import Leaderboard from 'ui/leaderboard.js';

console.log("Game starting...");

// --- Configuration ---
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const RENDER_SCALE = 0.2; // Global scale for player sprites
const LOCAL_PLAYER_UPDATE_INTERVAL = 50; // ms
const MAX_DELTA_TIME = 0.1; // seconds
const DEBUG_KILL_KEY = 'k';
const DEBUG_SPAWN_COLLECTIBLE_KEY = 'c'; // Key to test collectible spawning
const DEBUG_SPAWN_ASTEROID_KEY = 'v'; // Key to test asteroid spawning
const PRESENCE_UPDATE_THROTTLE = 50; // Milliseconds between sending presence updates

// --- DOM Elements ---
const canvas = document.getElementById('gameCanvas');
const debugEl = document.getElementById('debug');
const vehicleSelectorEl = document.getElementById('vehicleSelector');
const scoreboardEl = document.getElementById('scoreboard');
const leaderboardEl = document.getElementById('leaderboard');

// --- Core Modules ---
const renderer = new Renderer(canvas, GAME_WIDTH, GAME_HEIGHT);
const inputManager = new InputManager();
const networkManager = new NetworkManager();
const assetLoader = new AssetLoader();
const projectileManager = new ProjectileManager();
const scorePersistence = new ScorePersistence(networkManager);

// --- Game State ---
let assets = {};
let localPlayerId = null;
let lastUpdateTime = 0;
let lastPresenceUpdateTime = 0;
let groundLevelY = GAME_HEIGHT;

// --- Game Logic Modules (Initialized later) ---
let playerManager = null;
let powerupManager = null;
let spaceObjectManager = null;
let collectibleManager = null;
let networkEventHandler = null;
let debugRenderer = null;
let backgroundRenderer = null;
let particleSystem = null;
let vehicleSelector = null;
let statusBarRenderer = null;
let collisionManager = null;
let playerLifecycleManager = null;
let scoreboard = null;
let leaderboard = null;

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
        particleSystem = new ParticleSystem();

        // Instantiate PlayerManager *first* among player-related modules
        playerManager = new PlayerManager(assets, renderer.getContext(), RENDER_SCALE, GAME_WIDTH, GAME_HEIGHT);
        playerManager.setLocalPlayerId(localPlayerId);
        console.log("PlayerManager initialized.");

        // Initialize Status Bar Renderer
        statusBarRenderer = new StatusBarRenderer(renderer.getContext(), playerManager, RENDER_SCALE);

        // Pass particle system to managers that need it
        powerupManager = new PowerupManager(networkManager, assets, RENDER_SCALE, particleSystem);
        collectibleManager = new CollectibleManager(networkManager, assets, RENDER_SCALE, particleSystem);

        backgroundRenderer = new BackgroundRenderer(renderer.getContext(), GAME_WIDTH, GAME_HEIGHT);
        groundLevelY = backgroundRenderer.getGroundLevel();

        spaceObjectManager = new SpaceObjectManager(
            networkManager,
            assets,
            GAME_WIDTH,
            GAME_HEIGHT,
            groundLevelY,
            collectibleManager,
            playerManager,
            powerupManager,
            particleSystem
        );

        vehicleSelector = new VehicleSelector(vehicleSelectorEl, assets, (type) => {
            if (playerLifecycleManager) {
                playerLifecycleManager.confirmLocalPlayerVehicleSelection(type);
            } else {
                console.error("PlayerLifecycleManager not initialized when vehicle selection confirmed.");
            }
        });

        // Pass PlayerManager to modules that need it (Scoreboard, DebugRenderer, etc.)
        collisionManager = new CollisionManager(
            playerManager,
            projectileManager,
            powerupManager,
            spaceObjectManager,
            collectibleManager,
            particleSystem,
            RENDER_SCALE
        );

        scoreboard = new Scoreboard(scoreboardEl, playerManager, networkManager);
        // Pass assets to Leaderboard
        leaderboard = new Leaderboard(leaderboardEl, scorePersistence, networkManager, assets);

        // Pass PlayerManager to PlayerLifecycleManager
        playerLifecycleManager = new PlayerLifecycleManager(
            playerManager,
            networkManager,
            vehicleSelector,
            scorePersistence,
            GAME_WIDTH,
            GAME_HEIGHT,
            RENDER_SCALE,
            particleSystem
        );
        playerManager.setPlayerLifecycleManager(playerLifecycleManager);

        // PlayerManager needs other managers set *after* they are created
        playerManager.setManagers(
            projectileManager,
            networkManager,
            particleSystem,
            powerupManager,
            inputManager
        );

        const gameConfig = { GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE, groundLevelY };
        networkEventHandler = new NetworkEventHandler(networkManager, playerManager, projectileManager, gameConfig);
        debugRenderer = new DebugRenderer(debugEl, playerManager, networkManager, inputManager, gameConfig);
        debugRenderer.setLocalPlayerId(localPlayerId);

        // --- Initialize Local Player ---
        const initialX = GAME_WIDTH / 2;
        const initialY = groundLevelY / 2;
        const initialState = {
            x: initialX,
            y: initialY,
            vehicleType: 0,
            facingDirection: -1,
            rotation: 0,
            lifecycleState: PlayerLifecycleState.SELECTING
        };
        const localPlayer = playerManager.createPlayer(localPlayerId, initialState, true);

        if (playerManager.getLocalPlayer()) {
             console.log(`Local player ${localPlayerId} created via manager, initial state: ${playerManager.getLocalPlayer().state.lifecycleState}`);
        } else {
            console.error("Failed to create local player via PlayerManager!");
            throw new Error("Local player creation failed.");
        }

        // Check state via manager
        if (playerManager.getLocalPlayer()?.state.lifecycleState === PlayerLifecycleState.SELECTING) {
            vehicleSelector.show();
        } else {
             console.log("Initial presence deferred until vehicle selection (or if player started ACTIVE).");
        }

        // --- Setup Network Handlers ---
        networkEventHandler.setupNetworkHandlers();

        // --- Expose Debug Functions ---
        window.gameDebug = window.gameDebug || {}; // Ensure debug namespace exists
        window.gameDebug.resetMyScores = () => {
            console.log("Calling resetMyScores...");
            scorePersistence.resetMyScores();
        };
        console.log("Debug function window.gameDebug.resetMyScores() is available.");

        // --- Start Game Loop ---
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

// --- Update Function ---
function update(deltaTime, currentTime) {
    backgroundRenderer.update(deltaTime);
    particleSystem.update(deltaTime);
    projectileManager.update(deltaTime, groundLevelY);
    powerupManager.update(deltaTime, GAME_WIDTH, GAME_HEIGHT, groundLevelY); 
    spaceObjectManager.update(deltaTime);
    collectibleManager.update(deltaTime);
    scoreboard.update(currentTime);

    const localPlayer = playerManager.getLocalPlayer();
    const input = inputManager.getInputState();

    if (localPlayer && localPlayer.lifecycleState && !localPlayer.isMarkedForRemoval) {
        if (inputManager.wasKeyJustPressed(DEBUG_KILL_KEY) && localPlayer.lifecycleState === PlayerLifecycleState.ACTIVE) {
            console.log("Debug key pressed: Kill Local Player");
            playerManager.playerLifecycleManager.killLocalPlayer();
        }
        if (inputManager.wasKeyJustPressed(DEBUG_SPAWN_COLLECTIBLE_KEY)) {
             console.log("Debug key pressed: Spawn Collectible");
             const spawnX = localPlayer.x + (Math.random() * 100 - 50);
             const spawnY = localPlayer.y - 50 + (Math.random() * 60 - 30);
             collectibleManager.spawnCollectible(spawnX, spawnY);
        }
        if (inputManager.wasKeyJustPressed(DEBUG_SPAWN_ASTEROID_KEY)) {
            console.log("Debug key pressed: Spawn Asteroid Manually");
            spaceObjectManager.attemptSpawnObject(currentTime - 2000); 
        }
    }

    playerManager.updatePlayers(deltaTime, groundLevelY, particleSystem, currentTime);

    if (collisionManager) {
        collisionManager.checkAllCollisions(currentTime);
    } else {
        console.warn("CollisionManager not initialized, skipping collision checks.");
    }

    if (currentTime - lastPresenceUpdateTime > PRESENCE_UPDATE_THROTTLE) {
         const localPlayer = playerManager.getLocalPlayer(); 
         if (localPlayer && localPlayer.lifecycleState !== PlayerLifecycleState.CONNECTING) {
             networkEventHandler.updateLocalPlayerPresence(currentTime);
         }
        lastPresenceUpdateTime = currentTime;
    }

    inputManager.update();
}

// --- Draw Function ---
function draw() {
    renderer.clear();
    backgroundRenderer.draw();
    spaceObjectManager.draw(renderer.getContext());
    collectibleManager.draw(renderer.getContext());
    powerupManager.draw(renderer.getContext());
    particleSystem.draw(renderer.getContext());
    projectileManager.draw(renderer.getContext());
    playerManager.drawPlayers(renderer);
    statusBarRenderer.draw(); 
    debugRenderer.drawPlayerInfo(renderer); 
    debugRenderer.updateDebugInfo(); 
}

// --- Game Loop ---
function gameLoop(currentTime) {
    const rawDeltaTime = (currentTime - lastUpdateTime) / 1000;
    const deltaTime = Math.min(rawDeltaTime, MAX_DELTA_TIME);
    lastUpdateTime = currentTime;

    if (!playerManager || !networkEventHandler || !debugRenderer || !backgroundRenderer || !particleSystem || !powerupManager || !collisionManager || !spaceObjectManager || !collectibleManager || !scoreboard || !leaderboard || !playerLifecycleManager) {
        console.warn("Game loop running before modules initialized. Skipping frame.");
        requestAnimationFrame(gameLoop);
        return;
    }

    try {
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

// --- Start the game ---
initializeGame();