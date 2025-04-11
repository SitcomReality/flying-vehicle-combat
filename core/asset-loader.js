import { SPRITES } from 'config/sprites.js';

class AssetLoader {
    constructor() {
        this.promises = {};
        this.assets = {};
    }

    loadImage(key, src) {
        if (this.promises[key]) {
            return this.promises[key];
        }

        console.log(`Loading image: ${key} from ${src}`);
        this.promises[key] = new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                console.log(`Image loaded: ${key}`);
                this.assets[key] = img;
                resolve(img);
            };
            img.onerror = (err) => {
                console.error(`Failed to load image: ${key} from ${src}`, err);
                reject(new Error(`Failed to load image: ${key}`));
            };
            img.src = src;
        });
        return this.promises[key];
    }

    async loadAssets(spriteConfig) {
        console.log("Starting asset loading...");
        const loadPromises = [];

        for (const category in spriteConfig) {
            const config = spriteConfig[category];
            if (config.sheet) {
                loadPromises.push(this.loadImage(category, config.sheet));
            }
        }

        await Promise.all(loadPromises);
        console.log("All assets loaded.");
        return this.assets; // Return the loaded image elements keyed by category
    }

    getAsset(key) {
        return this.assets[key];
    }
}

export default AssetLoader;

