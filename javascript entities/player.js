// ... imports ...

// Configuration Constants
const REMOTE_PLAYER_INTERPOLATION_FACTOR = 0.15;

class Player {
    constructor(id, x, y, vehicleType, isLocalPlayer, assets, ctx, renderScale, gameWidth, gameHeight) {
        this.state = new PlayerState(id, x, y, vehicleType, isLocalPlayer);

        // Keep references needed by subsystems
        this.assets = assets;
        this.ctx = ctx;
        this.renderScale = renderScale;
        this.gameBounds = { width: gameWidth, height: gameHeight };

        // References to managers (will be set externally)
        this.projectileManager = null;
        this.networkManager = null;
        this.playerManager = null;
        this.particleSystem = null;
        this.powerupManager = null;
        this.inputManager = null; // Added reference storage

        // Weapon System (instantiated once managers are set)
        this.weaponSystem = null;
    }

    // Set references to managers needed for actions
    // Added inputManager parameter
    setManagers(projectileManager, networkManager, playerManager, particleSystem, powerupManager, inputManager) {
        this.projectileManager = projectileManager;
        this.networkManager = networkManager;
        this.playerManager = playerManager;
        this.particleSystem = particleSystem;
        this.powerupManager = powerupManager;
        this.inputManager = inputManager; // Store reference

        // Instantiate WeaponSystem now that managers are available
        if (this.state.isLocalPlayer && !this.weaponSystem) {
            const boundGetVisualNosePos = () => getVisualNosePosition(this.state, this.renderScale);
            this.weaponSystem = new WeaponSystem(
                this.state,
                this.projectileManager,
                this.networkManager,
                boundGetVisualNosePos
            );
            console.log(`WeaponSystem initialized for local player ${this.id}`);
        }
    }

    // ... other getters ...
    get isMarkedForRemoval() { return this.state.isMarkedForRemoval; }
    set isMarkedForRemoval(value) { this.state.isMarkedForRemoval = value; }
    get lifecycleState() { return this.state.lifecycleState; }

    // --- Network Synchronization ---
    // ... existing updateFromServer ...

    // --- Input Handling (Refined) ---
    handleInput(inputState) {
        // Check inputManager is now set
        if (!this.isLocalPlayer || !this.inputManager) return;

        // Ignore input if not in ACTIVE state
        // ... existing inactive state logic ...

        // Update Movement Intent Flags
        this.state.isThrusting = inputState.up;
        this.state.isMovingLeft = inputState.left;
        this.state.isMovingRight = inputState.right;

        // Update Weapon System based on action key (' ')
        if (this.weaponSystem) {
            // USE this.inputManager now
            const actionKeyPressed = this.inputManager.wasKeyJustPressed(' ');
            const actionKeyHeld = this.inputManager.isKeyPressed(' '); // Check current held state

            // ... rest of weapon input logic remains the same ...
             if (actionKeyPressed) {
                this.weaponSystem.flagTapFire(); // Signal intent to tap fire
            } else if (actionKeyHeld && !this.weaponSystem.isTapFire) {
                // If holding and not already flagged for tap fire, start/continue charging
                this.weaponSystem.startCharging();
            } else if (!actionKeyHeld && this.weaponSystem.isCharging) {
                 // If released and was charging, stop charging (will trigger charged shot if charged enough)
                 this.weaponSystem.stopCharging();
            } else if (!actionKeyHeld && this.weaponSystem.isTapFire) {
                 // If released and was flagged for tap fire (but maybe cooldown prevented it), clear flags
                 this.weaponSystem.isTapFire = false;
                 this.weaponSystem.wantsToFire = false;
                 this.state.wantsToFire = false;
            }
             // Ensure player state reflects weapon state
             this.state.isCharging = this.weaponSystem.isCharging;
             this.state.wantsToFire = this.weaponSystem.wantsToFire; // <-- Sync state back

        } else {
             console.warn("WeaponSystem not available for input handling.");
        }


        // Update Target Facing Direction based purely on last horizontal input
        if (inputState.right) {
            this.state.targetFacingDirection = 1; // Right
        } else if (inputState.left) {
            this.state.targetFacingDirection = -1; // Left
        }
        // If neither left nor right is pressed, targetFacingDirection remains unchanged.
    }


    // --- Update Cycle ---
    // ... existing update method ...


    // --- Rendering ---
    // ... existing draw method ...

    // --- State Modification ---
    // ... existing setVehicle, getPresenceData ...


    // --- Lifecycle Methods ---
    // ... existing transitionToState, resetStateForSpawn, takeDamage, addScore ...
}

export default Player;