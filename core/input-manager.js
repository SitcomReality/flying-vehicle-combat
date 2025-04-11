class InputManager {
    constructor() {
        this.keys = {}; // Store state of relevant keys
        this.trackedKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', ' ', 'k']; // Added 'k' for debug kill
        this._previousKeys = {}; // Store key state from the previous frame

        this._handleKeyDown = this._handleKeyDown.bind(this);
        this._handleKeyUp = this._handleKeyUp.bind(this);
        this.update = this.update.bind(this); // Bind update method

        this._addEventListeners();
    }

    _addEventListeners() {
        window.addEventListener('keydown', this._handleKeyDown);
        window.addEventListener('keyup', this._handleKeyUp);
    }

    _removeEventListeners() {
        window.removeEventListener('keydown', this._handleKeyDown);
        window.removeEventListener('keyup', this._handleKeyUp);
    }

    _handleKeyDown(event) {
        if (this.trackedKeys.includes(event.key)) {
            if (!this.keys[event.key]) { // Only log/prevent default on initial press
                 this.keys[event.key] = true;
                 // Prevent default browser actions for game keys
                 if (event.key === ' ' || event.key.startsWith('Arrow')) {
                     event.preventDefault();
                 }
            }
        }
    }

    _handleKeyUp(event) {
        if (this.trackedKeys.includes(event.key)) {
            this.keys[event.key] = false;
            // Prevent default for consistency if needed, though usually not required on keyup
            if (event.key === ' ' || event.key.startsWith('Arrow')) {
               event.preventDefault();
            }
        }
    }

    isKeyPressed(key) {
        return this.keys[key] === true;
    }

    // --- New method: Check if a key was just pressed this frame ---
    wasKeyJustPressed(key) {
        return this.keys[key] === true && this._previousKeys[key] !== true;
    }
    // --- End new method ---

    // Get a snapshot of the current input state
    getInputState() {
        return {
            up: this.isKeyPressed('ArrowUp') || this.isKeyPressed('w'),
            down: this.isKeyPressed('ArrowDown') || this.isKeyPressed('s'),
            left: this.isKeyPressed('ArrowLeft') || this.isKeyPressed('a'),
            right: this.isKeyPressed('ArrowRight') || this.isKeyPressed('d'),
            action: this.isKeyPressed(' '), // Space bar press state
        };
    }

    // --- New method: Update the previous key state ---
    // Call this at the END of the game loop
    update() {
        // Shallow copy is enough since values are booleans
        this._previousKeys = { ...this.keys };
    }
    // --- End new method ---

    destroy() {
        this._removeEventListeners();
        this.keys = {};
        this._previousKeys = {};
    }
}

export default InputManager;