// ... imports ...

// --- Game Logic Modules (Initialized later) ---
// ... other modules ...
let inputManager = null; // Reference needed for PlayerManager

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

        // 3. Instantiate Input Manager (needs to happen before PlayerManager.setManagers)
        inputManager = new InputManager(); // Already instantiated globally

        // 4. Instantiate Game Logic Modules (pass dependencies)
        particleSystem = new ParticleSystem();

        playerManager = new PlayerManager(assets, renderer.getContext(), RENDER_SCALE, GAME_WIDTH, GAME_HEIGHT);
        playerManager.setLocalPlayerId(localPlayerId);

        powerupManager = new PowerupManager(networkManager, assets, RENDER_SCALE, particleSystem);
        collectibleManager = new CollectibleManager(networkManager, assets, RENDER_SCALE, particleSystem);
        backgroundRenderer = new BackgroundRenderer(renderer.getContext(), GAME_WIDTH, GAME_HEIGHT);
        groundLevelY = backgroundRenderer.getGroundLevel();
        spaceObjectManager = new SpaceObjectManager(networkManager, assets, GAME_WIDTH, GAME_HEIGHT, groundLevelY, collectibleManager, playerManager, powerupManager);
        vehicleSelector = new VehicleSelector(vehicleSelectorEl, assets, (type) => { /* callback */ });
        playerLifecycleManager = new PlayerLifecycleManager(playerManager, networkManager, vehicleSelector, scorePersistence, GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE, particleSystem);
        statusBarRenderer = new StatusBarRenderer(renderer.getContext(), playerManager, RENDER_SCALE);
        collisionManager = new CollisionManager(playerManager, projectileManager, powerupManager, spaceObjectManager, collectibleManager, particleSystem, RENDER_SCALE);
        scoreboard = new Scoreboard(scoreboardEl, playerManager, networkManager);
        leaderboard = new Leaderboard(leaderboardEl, scorePersistence, networkManager);

        // Call setManagers AFTER all managers are created, passing inputManager
        playerManager.setManagers(projectileManager, networkManager, playerLifecycleManager, particleSystem, powerupManager, inputManager);

        const gameConfig = { GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE, groundLevelY };
        networkEventHandler = new NetworkEventHandler(networkManager, playerManager, projectileManager, gameConfig);
        debugRenderer = new DebugRenderer(debugEl, playerManager, networkManager, inputManager, gameConfig); // Pass inputManager here too
        debugRenderer.setLocalPlayerId(localPlayerId);

        // --- Initialize Local Player ---
        inputManager.update(); // Update once before creating player to clear initial state

        // ... existing local player creation ...
        const initialX = GAME_WIDTH / 2;
        const initialY = groundLevelY / 2;
        const initialState = { /* ... */ };
        const localPlayer = playerManager.createPlayer(localPlayerId, initialState, true);
        // ... log creation ...


        // Show vehicle selector if player is in SELECTING state
        // ... existing logic ...


        // --- Setup Network Handlers ---
        networkEventHandler.setupNetworkHandlers();

        // --- Start Game Loop ---
        lastUpdateTime = performance.now();
        requestAnimationFrame(gameLoop);
        console.log("Game initialized successfully.");

    } catch (error) {
        // ... error handling ...
    }
}

// --- Update Function ---
function update(deltaTime, currentTime) {
    // ... other updates ...

    const localPlayer = playerManager.getLocalPlayer();
    // GET INPUT STATE *AFTER* inputManager.update() is called at end of previous frame
    const input = inputManager.getInputState(); // Use the manager's current state

    if (localPlayer && localPlayer.state && !localPlayer.isMarkedForRemoval) {
        // PASS the input state snapshot to the player's handler
        localPlayer.handleInput(input);

        // Debug key checks still use inputManager directly
        if (inputManager.wasKeyJustPressed(DEBUG_KILL_KEY) && localPlayer.state.lifecycleState === PlayerLifecycleState.ACTIVE) {
            // ... kill logic ...
        }
        // ... other debug keys ...
    }

    // ... rest of update logic ...

    // Ensure inputManager.update() is called at the end
    inputManager.update();
}

// --- Draw Function ---
// ... existing draw function ...

// --- Game Loop ---
// ... existing game loop ...

// --- Start the game ---
initializeGame();