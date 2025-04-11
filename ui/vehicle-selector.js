// New file: Handles the vehicle selection UI

import { getVehicleConfig } from '../entities/vehicles/vehicle-types.js';

class VehicleSelector {
    constructor(element, vehicleFrames, onSelectCallback) {
        this.element = element;
        this.vehicleFrames = vehicleFrames; // SPRITES.vehicles.frames
        this.onSelectCallback = onSelectCallback;
        this.selectedVehicleType = 0; // Default selection

        if (!this.element) {
            console.error("VehicleSelector element not found!");
            return;
        }

        this.element.style.display

