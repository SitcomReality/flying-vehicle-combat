class InputManager {
    constructor() {
        this.keys = {}; // Store state of relevant keys
        this.trackedKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', ' ']; // Example keys

        this._handleKeyDown = this._handleKeyDown.bind(this);
        this._handleKeyUp = this._handleKeyUp.bind(this);

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
            this.keys[event.key] = true;
            // event.preventDefault(); // Prevent default browser actions for game keys
        }
    }

    _handleKeyUp(event) {
        if (this.trackedKeys.includes(event.key)) {
            this.keys[event.key] = false;
           // event.preventDefault();
        }
    }

    isKeyPressed(key) {
        return this.keys[key] === true;
    }

    // Get a snapshot of the current input state
    getInputState() {
        return {
            up: this.isKeyPressed('ArrowUp') || this.isKeyPressed('w'),
            down: this.isKeyPressed('ArrowDown') || this.isKeyPressed('s'),
            left: this.isKeyPressed('ArrowLeft') || this.isKeyPressed('a'),
            right: this.isKeyPressed('ArrowRight') || this.isKeyPressed('d'),
            action: this.isKeyPressed(' '), // Example action key
        };
    }

    destroy() {
        this._removeEventListeners();
        this.keys = {};
    }
}

export default InputManager;

