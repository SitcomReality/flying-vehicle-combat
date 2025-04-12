// Handles the vehicle selection UI - Reworked for Carousel Style

import { getVehicleConfig } from '../entities/vehicles/vehicle-types.js';
import { SPRITES } from '../config/sprites.js';

class VehicleSelector {
    constructor(element, assets, onSelectCallback) {
        this.element = element;
        this.assets = assets; // Loaded asset images
        this.onSelectCallback = onSelectCallback;
        this.vehicleFrames = SPRITES.vehicles.frames;
        this.totalVehicles = this.vehicleFrames.length;
        this.currentIndex = 0; // Index of the vehicle currently in the center

        // Get references to the new structure elements
        this.slotLeft = this.element.querySelector('#vehicleSlotLeft');
        this.slotCenter = this.element.querySelector('#vehicleSlotCenter');
        this.slotRight = this.element.querySelector('#vehicleSlotRight');
        this.statsDisplay = this.element.querySelector('#selectedVehicleStats');
        this.confirmButton = this.element.querySelector('#confirmSelection');
        this.cycleLeftButton = this.element.querySelector('#cycleLeft');
        this.cycleRightButton = this.element.querySelector('#cycleRight');
        this.centerNameElement = this.slotCenter.querySelector('.vehicle-name');

        if (!this.element || !this.slotLeft || !this.slotCenter || !this.slotRight || !this.statsDisplay || !this.confirmButton || !this.cycleLeftButton || !this.cycleRightButton || !this.centerNameElement) {
            console.error("VehicleSelector is missing required elements in its new structure!");
            return;
        }

        // Bind event handlers
        this._handleKeyDown = this._handleKeyDown.bind(this);
        this._handleCycleLeft = this._handleCycle.bind(this, -1);
        this._handleCycleRight = this._handleCycle.bind(this, 1);
        this._handleConfirm = this._handleConfirm.bind(this);

        this._createPreviewCanvases();
        this.hide(); // Initially hidden
    }

    _createPreviewCanvases() {
        // Ensure canvases exist in each slot
        [this.slotLeft, this.slotCenter, this.slotRight].forEach(slot => {
            if (!slot.querySelector('canvas')) {
                const canvas = document.createElement('canvas');
                // Set logical size (CSS will handle display size)
                canvas.width = SPRITES.vehicles.frameWidth;
                canvas.height = SPRITES.vehicles.frameHeight;
                // Insert canvas before the name (if it exists)
                const nameEl = slot.querySelector('.vehicle-name');
                 if (nameEl) {
                    slot.insertBefore(canvas, nameEl);
                 } else {
                    slot.appendChild(canvas);
                 }
            }
        });
    }

    _drawPreview(canvas, frame) {
        if (!canvas || !frame) return;
        const ctx = canvas.getContext('2d');
        const spriteSheet = this.assets.vehicles; // Get the loaded vehicle image

        if (!spriteSheet || !spriteSheet.complete || spriteSheet.naturalWidth === 0) {
            console.warn(`Vehicle spritesheet not ready for preview.`);
            ctx.fillStyle = 'rgba(255, 0, 0, 0.5)'; // Red placeholder
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            return;
        }

        // Draw the sprite centered in the canvas
        const scale = Math.min(canvas.width / frame.width, canvas.height / frame.height) * 0.9; // Fit with padding
        const drawWidth = frame.width * scale;
        const drawHeight = frame.height * scale;
        const drawX = (canvas.width - drawWidth) / 2;
        const drawY = (canvas.height - drawHeight) / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
            spriteSheet,
            frame.x, frame.y, frame.width, frame.height, // Source
            drawX, drawY, drawWidth, drawHeight // Destination
        );
    }

    _updateDisplay() {
        const centerIndex = this.currentIndex;
        // Calculate wrap-around indices using modulo
        const leftIndex = (centerIndex - 1 + this.totalVehicles) % this.totalVehicles;
        const rightIndex = (centerIndex + 1) % this.totalVehicles;

        const centerFrame = this.vehicleFrames[centerIndex];
        const leftFrame = this.vehicleFrames[leftIndex];
        const rightFrame = this.vehicleFrames[rightIndex];

        // Update preview canvases
        this._drawPreview(this.slotCenter.querySelector('canvas'), centerFrame);
        this._drawPreview(this.slotLeft.querySelector('canvas'), leftFrame);
        this._drawPreview(this.slotRight.querySelector('canvas'), rightFrame);

        // Update center name
        const centerConfig = getVehicleConfig(centerIndex);
        this.centerNameElement.textContent = centerConfig.name || `Vehicle ${centerIndex + 1}`;

        // Update stats display for the center vehicle
        this._updateStats(centerConfig);

        // Enable confirm button
        this.confirmButton.disabled = false;
    }

     _updateStats(config) {
        this.statsDisplay.innerHTML = ''; // Clear previous stats

        const statsTitle = document.createElement('h4');
        statsTitle.textContent = 'Attributes';
        this.statsDisplay.appendChild(statsTitle);

        const healthStat = document.createElement('p');
        healthStat.textContent = `HP: ${config.maxHealth}`;
        this.statsDisplay.appendChild(healthStat);

        const fuelStat = document.createElement('p');
        fuelStat.textContent = `Fuel: ${config.maxFuel}`;
        this.statsDisplay.appendChild(fuelStat);

        const speedStat = document.createElement('p');
        speedStat.textContent = `Max Speed: ${config.maxHorizontalSpeed}`;
        this.statsDisplay.appendChild(speedStat);

        const accelStat = document.createElement('p');
        accelStat.textContent = `Accel: ${config.horizontalAcceleration}`;
        this.statsDisplay.appendChild(accelStat);

         const damageStat = document.createElement('p');
         damageStat.textContent = `Damage: ${config.projectileDamage}`;
         this.statsDisplay.appendChild(damageStat);

         const chargeStat = document.createElement('p');
         chargeStat.textContent = `Charge Rate: ${config.chargeRate}`;
         this.statsDisplay.appendChild(chargeStat);

    }


    _handleCycle(direction) {
        // Update current index with wrapping
        this.currentIndex = (this.currentIndex + direction + this.totalVehicles) % this.totalVehicles;
        this._updateDisplay();
    }

     _handleConfirm() {
         console.log(`Confirming selection: ${this.currentIndex}`);
        this.onSelectCallback(this.currentIndex);
        // Hide is usually called by PlayerLifecycleManager after this callback
    }

    _handleKeyDown(event) {
        // Prevent default browser behavior for arrow keys
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'a' || event.key === 'd' || event.key === 'Enter' || event.key === ' ') {
             event.preventDefault();
        }

        if (event.key === 'ArrowLeft' || event.key === 'a') {
            this._handleCycle(-1); // Cycle left
        } else if (event.key === 'ArrowRight' || event.key === 'd') {
            this._handleCycle(1); // Cycle right
        } else if (event.key === 'Enter' || event.key === ' ') {
             this._handleConfirm(); // Confirm selection
        }
    }

    _addEventListeners() {
        this.cycleLeftButton.addEventListener('click', this._handleCycleLeft);
        this.cycleRightButton.addEventListener('click', this._handleCycleRight);
        this.confirmButton.addEventListener('click', this._handleConfirm);
        // Add keydown listener to the document when the selector is shown
        document.addEventListener('keydown', this._handleKeyDown);
    }

    _removeEventListeners() {
        this.cycleLeftButton.removeEventListener('click', this._handleCycleLeft);
        this.cycleRightButton.removeEventListener('click', this._handleCycleRight);
        this.confirmButton.removeEventListener('click', this._handleConfirm);
        // Remove keydown listener from the document when hidden
        document.removeEventListener('keydown', this._handleKeyDown);
    }

    show() {
        if (!this.element) return;
        // Update display to show the initial state
        this._updateDisplay();
        this.element.style.display = 'flex'; // Use flex display now
        this._addEventListeners();
        this.confirmButton.disabled = false; // Should always be enabled initially
    }

    hide() {
        if (!this.element) return;
        this.element.style.display = 'none';
        this._removeEventListeners();
    }

    getCurrentSelection() {
        return this.currentIndex;
    }
}

export default VehicleSelector;