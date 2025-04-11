import AssetLoader from 'core/asset-loader.js';
import InputManager from 'core/input-manager.js';
import Renderer from 'rendering/renderer.js';
import NetworkManager from 'networking/network-manager.js';
import Player from 'entities/player.js';
import { SPRITES } from 'config/sprites.js';

console.log("Game starting...");

const canvas = document.getElementById('gameCanvas');
const debugEl = document.getElementById('debug');
const RENDER_SCALE = 0.2; // Render sprites smaller

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const LOCAL_PLAYER_UPDATE_INTERVAL = 50; // ms - How often to send updates
const REMOTE_PLAYER_INTERPOLATION_FACTOR = 0.1; // How quickly remote players snap to server position (lower = smoother, higher = more responsive)

let assets = {};
let players = {}; // Store all players { clientId: Player instance }
let localPlayerId = null;
let lastUpdateTime = 0;
let lastPresenceUpdateTime = 0;

const renderer = new Renderer(canvas, GAME_WIDTH, GAME_HEIGHT);
const inputManager = new InputManager();
const networkManager = new NetworkManager();
const assetLoader = new AssetLoader();

function updateDebugInfo() {
    let debugText = `Client ID: ${localPlayerId}\n`;
    debugText += `Render Scale: ${RENDER_SCALE}\n`;
    debugText += `Players (${Object.keys(players).length}):\n`;
    for (const id in players) {
        const p = players[id];
        const peerInfo = networkManager.getPeer(id);
        const name = peerInfo?.username || 'Unknown';
        debugText += `  ${name} (${id.substring(0, 4)}): ${p.x.toFixed(0)}, ${p.y.toFixed(0)} Facing: ${p.facingDirection === 1 ? 'R' : 'L'}\n`;
        if (p.isLocalPlayer) {
             debugText += `    Input: ${JSON.stringify(inputManager.getInputState())}\n`;
        } else {
             debugText += `    Server: ${p.serverX?.toFixed(0)}, ${p.serverY?.toFixed(0)}\n`;
        }

    }
    debugEl.textContent = debugText;
}

async function initializeGame() {
    console.log("Initializing game...");
    try {
        assets = await assetLoader.loadAssets(SPRITES);
        console.log("Assets loaded:", assets);

        await networkManager.initialize();
        localPlayerId = networkManager.getClientId();
        console.log("Network initialized. Client ID:", localPlayerId);

        createPlayer(localPlayerId, {
            x: Math.random() * (GAME_WIDTH - (SPRITES.vehicles.frameWidth * RENDER_SCALE)),
            y: Math.random() * (GAME_HEIGHT - (SPRITES.vehicles.hitboxHeight * RENDER_SCALE)),
            vehicleType: Math.floor(Math.random() * SPRITES.vehicles.frames.length),
            facingDirection: -1
        }, true);
        console.log("Local player object created.");

        updateLocalPlayerPresence();
        console.log("Initial presence sent.");

        setupNetworkHandlers();
        console.log("Network handlers setup.");

        lastUpdateTime = performance.now();
        requestAnimationFrame(gameLoop);
        console.log("Game initialized successfully.");

    } catch (error) {
        console.error("Initialization failed:", error);
    }
}

function setupNetworkHandlers() {
    networkManager.onPresenceUpdate((presence) => {
        const now = performance.now();
        const currentPeerIds = networkManager.getPeers ? Object.keys(networkManager.getPeers()) : Object.keys(presence);

        for (const clientId in presence) {
            if (!currentPeerIds.includes(clientId)) {
                continue;
            }

            if (!players[clientId]) {
                if (clientId === localPlayerId) {
                    if (players[localPlayerId]) {
                        players[localPlayerId].updateFromServer(presence[clientId], now);
                    } else {
                        console.warn("Presence update for local player but local player object not found?");
                    }
                    continue;
                }
                console.log("New player joined:", clientId, networkManager.getPeer(clientId)?.username);
                createPlayer(clientId, presence[clientId]);
            } else if (clientId !== localPlayerId) {
                players[clientId].updateFromServer(presence[clientId], now);
            }
        }

        for (const existingPlayerId in players) {
            if (!(existingPlayerId in presence) || !currentPeerIds.includes(existingPlayerId)) {
                if (existingPlayerId === localPlayerId) continue;
                if (!players[existingPlayerId].isMarkedForRemoval) {
                    console.log("Player left or timed out:", existingPlayerId, networkManager.getPeer(existingPlayerId)?.username ?? '(no peer info)');
                    removePlayer(existingPlayerId);
                }
            }
        }
    });

    networkManager.onRoomStateUpdate((roomState) => {
    });

    networkManager.onPresenceUpdateRequest((updateRequest, fromClientId) => {
        console.log("Received presence update request:", updateRequest, "from", fromClientId);
        const localPlayer = players[localPlayerId];
        if (!localPlayer) return;

        if (updateRequest.type === 'changeVehicle') {
            const currentVehicle = localPlayer.vehicleType;
            const totalVehicles = SPRITES.vehicles.frames.length;
            const nextVehicle = (currentVehicle + 1) % totalVehicles;
            localPlayer.setVehicle(nextVehicle);
            updateLocalPlayerPresence();
            console.log(`Changed vehicle to ${nextVehicle} via request from ${fromClientId}`);
        }
    });

    networkManager.onMessage((event) => {
    });

    console.log("Network event handlers are fully registered.");
}

function createPlayer(clientId, initialState, isLocal = false) {
    if (players[clientId]) {
        console.warn(`Attempted to create player ${clientId} but they already exist.`);
        return;
    }

    const player = new Player(
        clientId,
        initialState?.x ?? GAME_WIDTH / 2,
        initialState?.y ?? GAME_HEIGHT / 2,
        initialState?.vehicleType ?? 0,
        isLocal,
        assets,
        renderer.getContext(),
        RENDER_SCALE
    );
    player.facingDirection = initialState?.facingDirection ?? -1;

    players[clientId] = player;

    if (!isLocal) {
        player.updateFromServer(initialState, performance.now());
        player.x = player.serverX;
        player.y = player.serverY;
    }

    console.log(`Player ${isLocal ? '(Local)' : ''} created: ${clientId} at ${player.x.toFixed(0)},${player.y.toFixed(0)}`);
}

function removePlayer(clientId) {
    if (!players[clientId]) return;

    players[clientId].isMarkedForRemoval = true;
    console.log(`Player marked for removal: ${clientId}`);

    delete players[clientId];
    console.log(`Player removed: ${clientId}`);
}

function updateLocalPlayerPresence() {
    const player = players[localPlayerId];
    if (!player) return;

    const presenceData = {
        x: player.x,
        y: player.y,
        vehicleType: player.vehicleType,
        facingDirection: player.facingDirection,
    };
    networkManager.updatePresence(presenceData);
    lastPresenceUpdateTime = performance.now();
}

function update(deltaTime) {
    const now = performance.now();

    const localPlayer = players[localPlayerId];
    if (localPlayer) {
        const input = inputManager.getInputState();
        localPlayer.handleInput(input);
        localPlayer.update(deltaTime);

        const drawnWidth = localPlayer.currentVehicle.width * RENDER_SCALE;
        const drawnHeight = localPlayer.currentVehicle.height * RENDER_SCALE;
        const clampX = localPlayer.x - localPlayer.drawOffsetX * RENDER_SCALE;
        const clampY = localPlayer.y - localPlayer.drawOffsetY * RENDER_SCALE;

        localPlayer.x = Math.max(localPlayer.drawOffsetX * RENDER_SCALE, Math.min(GAME_WIDTH - drawnWidth + localPlayer.drawOffsetX * RENDER_SCALE, localPlayer.x));
        localPlayer.y = Math.max(localPlayer.drawOffsetY * RENDER_SCALE, Math.min(GAME_HEIGHT - drawnHeight + localPlayer.drawOffsetY * RENDER_SCALE, localPlayer.y));

        if (now - lastPresenceUpdateTime > LOCAL_PLAYER_UPDATE_INTERVAL) {
            updateLocalPlayerPresence();
        }
    }

    for (const id in players) {
        if (id !== localPlayerId) {
            players[id].interpolate(REMOTE_PLAYER_INTERPOLATION_FACTOR);
            players[id].update(deltaTime);
        }
    }
}

function draw() {
    renderer.clear();
    const ctx = renderer.getContext();

    const sortedPlayerIds = Object.keys(players).sort((a, b) => {
        if (a === localPlayerId) return 1;
        if (b === localPlayerId) return -1;
        return 0;
    });

    for (const id of sortedPlayerIds) {
        if (!players[id].isMarkedForRemoval) {
            players[id].draw();
        }
    }

    for (const id in players) {
        if (!players[id].isMarkedForRemoval) {
            const peerInfo = networkManager.getPeer(id);
            if (peerInfo) {
                const playerCenterX = players[id].x + (players[id].width * RENDER_SCALE / 2) - (players[id].drawOffsetX * RENDER_SCALE);
                const playerTopY = players[id].y - (players[id].drawOffsetY * RENDER_SCALE);
                renderer.drawText(
                    peerInfo.username,
                    playerCenterX,
                    playerTopY - 10,
                    '#333',
                    '11px "Comic Sans MS", "Chalkduster", cursive',
                    'center',
                    'bottom'
                );
            }
        }
    }
}

function gameLoop(currentTime) {
    const rawDeltaTime = (currentTime - lastUpdateTime) / 1000;
    const deltaTime = Math.min(rawDeltaTime, 0.1);
    lastUpdateTime = currentTime;

    update(deltaTime);
    draw();
    updateDebugInfo();

    requestAnimationFrame(gameLoop);
}

initializeGame();