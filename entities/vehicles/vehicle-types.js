// New file: Defines base statistics for different vehicle types

// Import the configuration from the new file
import { VEHICLE_TYPES } from 'config/vehicle-config.js';

// Helper to get vehicle type config safely
export function getVehicleConfig(typeIndex) {
    const config = VEHICLE_TYPES[typeIndex];
    if (!config) {
        console.warn(`Invalid vehicle type index ${typeIndex}, defaulting to 0.`);
        return VEHICLE_TYPES[0]; // Default to vehicle 0 if index is invalid
    }
    return config;
}