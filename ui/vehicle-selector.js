// New file: Handles the vehicle selection UI

import { getVehicleConfig } from '../entities/vehicles/vehicle-types.js';
import { SPRITES } from '../config/sprites.js'; // Need access to sprite sheet info

class VehicleSelector {
    constructor(element, assets, onSelectCallback) {
        this.element = element;
        this.assets = assets; // Loaded asset images
        this.onSelectCallback = onSelectCallback;
        this.selectedVehicleType = 0; // Default selection
        this.vehicleFrames = SPRITES.vehicles.frames; // Get frame data from config

        this.optionsContainer = this.element.querySelector('#vehicleOptions');
        this.confirmButton = this.element.querySelector('#confirmSelection');

        if (!this.element || !this.optionsContainer || !this.confirmButton) {
            console.error("VehicleSelector element or its children not found!");
            return;
        }

        this._populateOptions();
        this._addEventListeners();
        this.hide(); // Initially hidden
    }

    _populateOptions() {
        this.optionsContainer.innerHTML = ''; // Clear existing options

        this.vehicleFrames.forEach((frame, index) => {
            const config = getVehicleConfig(index);

            const optionDiv = document.createElement('div');
            optionDiv.classList.add('vehicle-option');
            optionDiv.dataset.type = index;

            // Create canvas for preview
            const previewCanvas = document.createElement('canvas');
            previewCanvas.width = 100; // Match CSS size
            previewCanvas.height = 100;
            optionDiv.appendChild(previewCanvas);

            this._drawPreview(previewCanvas, frame, index);

            // Add name
            const nameHeader = document.createElement('h3');
            nameHeader.textContent = config.name || `Vehicle ${index + 1}`;
            optionDiv.appendChild(nameHeader);

             // Add basic stats (example)
            const healthStat = document.createElement('p');
            healthStat.textContent = `HP: ${config.maxHealth}`;
            optionDiv.appendChild(healthStat);

            const fuelStat = document.createElement('p');
            fuelStat.textContent = `Fuel: ${config.maxFuel}`;
            optionDiv.appendChild(fuelStat);

            const speedStat = document.createElement('p');
            speedStat.textContent = `Speed: ${config.maxHorizontalSpeed}`;
            optionDiv.appendChild(speedStat);

            optionDiv.addEventListener('click', () => this._selectOption(index));
            this.optionsContainer.appendChild(optionDiv);
        });

         // Select the default initially
         this._selectOption(this.selectedVehicleType);
    }

    _drawPreview(canvas, frame, typeIndex) {
        const ctx = canvas.getContext('2d');
        const spriteSheet = this.assets.vehicles; // Get the loaded vehicle image

        if (!spriteSheet || !spriteSheet.complete || spriteSheet.naturalWidth === 0) {
            console.warn(`Vehicle spritesheet not ready for preview ${typeIndex}`);
            ctx.fillStyle = 'red';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            return;
        }

        const scale = Math.min(canvas.width / frame.width, canvas.height / frame.height) * 0.8; // Scale down to fit with padding
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

    _selectOption(typeIndex) {
        this.selectedVehicleType = typeIndex;

        // Update visual selection
        this.optionsContainer.querySelectorAll('.vehicle-option').forEach(el => {
            el.classList.remove('selected');
            if (parseInt(el.dataset.type, 10) === typeIndex) {
                el.classList.add('selected');
            }
        });
         this.confirmButton.disabled = false; // Enable confirm button
    }

    _addEventListeners() {
        this.confirmButton.addEventListener('click', () => {
            if (this.selectedVehicleType !== null) {
                this.onSelectCallback(this.selectedVehicleType);
            }
        });
    }

    show() {
        if (!this.element) return;
        // Refresh previews in case assets loaded late
        this._populateOptions();
        this.element.style.display = 'block';
        this.confirmButton.disabled = this.selectedVehicleType === null;
    }

    hide() {
        if (!this.element) return;
        this.element.style.display = 'none';
    }
}

export default VehicleSelector;