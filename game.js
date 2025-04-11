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
        if (!p || p.isMarkedForRemoval) continue; // Skip removed players

        const peerInfo = networkManager.getPeer(id);
        const name = peerInfo?.username || 'Unknown';
        debugText += `  ${name} (${id.substring(0, 4)}): P(${p.state.x.toFixed(0)}, ${p.state.y.toFixed(0)}) V(${p.state.vx.toFixed(0)}, ${p.state.vy.toFixed(0)}) R:${p.state.rotation.toFixed(2)} F:${p.state.facingDirection === 1 ? 'R' : 'L'}\n`;
        if (p.isLocalPlayer) {
             debugText += `    Input: ${JSON.stringify(inputManager.getInputState())} Thrust:${p.isThrusting}\n`;
        } else {
             debugText += `    Server: P(${p.state.serverX?.toFixed(0)}, ${p.state.serverY?.toFixed(0)}) R:${p.state.serverRotation?.toFixed(2)}\n`;
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

        const initialVehicleType = Math.floor(Math.random() * SPRITES.vehicles.frames.length);
        const initialX = Math.random() * (GAME_WIDTH * 0.8) + GAME_WIDTH * 0.1;
        const initialY = GAME_HEIGHT / 2;
        const initialRotation = 0;
        const initialFacingDirection = -1; // Default left

        createPlayer(localPlayerId, {
             x: initialX,
             y: initialY,
             vehicleType: initialVehicleType,
             facingDirection: initialFacingDirection,
             rotation: initialRotation
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
            if (!networkManager.peers[clientId]) {
                if (clientId !== localPlayerId) {
                     console.warn(`Presence received for unknown peer ${clientId}. Ignoring.`);
                     continue;
                }
            }

            const presenceData = presence[clientId];
            if (!players[clientId]) {
                if (clientId === localPlayerId && players[localPlayerId]) {
                    continue;
                }
                console.log("New player detected from presence:", clientId, networkManager.getPeer(clientId)?.username);
                const initialState = {
                    x: presenceData.x ?? GAME_WIDTH / 2,
                    y: presenceData.y ?? GAME_HEIGHT / 2,
                    vehicleType: presenceData.vehicleType ?? 0,
                    facingDirection: presenceData.facingDirection ?? -1,
                    rotation: presenceData.rotation ?? 0,
                };
                 createPlayer(clientId, initialState, clientId === localPlayerId); 
            } else if (clientId !== localPlayerId) {
                players[clientId].updateFromServer(presenceData, now);
            }
        }

        for (const existingPlayerId in players) {
            if (existingPlayerId === localPlayerId) continue; 

            const isInPresence = !!presence[existingPlayerId];
            const isInPeers = !!networkManager.peers[existingPlayerId];

            if (!isInPresence && !isInPeers) {
                if (players[existingPlayerId] && !players[existingPlayerId].isMarkedForRemoval) {
                    const peerInfo = networkManager.getPeer(existingPlayerId); 
                    console.log("Player disconnected or timed out:", existingPlayerId, peerInfo?.username ?? '(info gone)');
                    removePlayer(existingPlayerId);
                }
            }
        }
    });

    networkManager.onRoomStateUpdate((roomState) => {
        // Handle room state updates (e.g., world items) if needed
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
        // Handle broadcasted events (e.g., sound effects, temporary visuals)
        console.log("Received message:", event);
    });

    console.log("Network event handlers are fully registered.");
}

function createPlayer(clientId, initialState, isLocal = false) {
    if (players[clientId] && !players[clientId].isMarkedForRemoval) {
        console.warn(`Attempted to create player ${clientId} but they already exist.`);
        if (players[clientId].isLocalPlayer !== isLocal) {
            console.warn(`Correcting isLocal status for player ${clientId}.`);
             players[clientId].state.isLocalPlayer = isLocal; 
        }
        players[clientId].state.x = initialState.x;
        players[clientId].state.y = initialState.y;
        players[clientId].state.rotation = initialState.rotation;
        players[clientId].state.facingDirection = initialState.facingDirection;
        players[clientId].setVehicle(initialState.vehicleType);
        if (!isLocal) {
             players[clientId].updateFromServer(initialState, performance.now());
        }
        return players[clientId]; 
    }

    const safeInitialState = {
        x: initialState?.x ?? GAME_WIDTH / 2,
        y: initialState?.y ?? GAME_HEIGHT / 2,
        vehicleType: initialState?.vehicleType ?? 0,
        facingDirection: initialState?.facingDirection ?? -1,
        rotation: initialState?.rotation ?? 0,
    };

    const player = new Player(
        clientId,
        safeInitialState.x,
        safeInitialState.y,
        safeInitialState.vehicleType,
        isLocal,
        assets,
        renderer.getContext(),
        RENDER_SCALE,
        GAME_WIDTH, 
        GAME_HEIGHT
    );

    player.state.facingDirection = safeInitialState.facingDirection;
    player.state.rotation = safeInitialState.rotation; 

    players[clientId] = player;

    if (!isLocal) {
        player.updateFromServer(safeInitialState, performance.now());
        player.state.x = player.state.serverX; 
        player.state.y = player.state.serverY;
        player.state.rotation = player.state.serverRotation; 
    }

    console.log(`Player ${isLocal ? '(Local)' : ''} created: ${clientId} at ${player.state.x.toFixed(0)},${player.state.y.toFixed(0)}`);
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
        x: player.state.x,
        y: player.state.y,
        vehicleType: player.vehicleType,
        facingDirection: player.state.facingDirection,
        rotation: player.state.rotation,
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
        const clampX = localPlayer.state.x - localPlayer.drawOffsetX * RENDER_SCALE;
        const clampY = localPlayer.state.y - localPlayer.drawOffsetY * RENDER_SCALE;

        localPlayer.state.x = Math.max(localPlayer.drawOffsetX * RENDER_SCALE, Math.min(GAME_WIDTH - drawnWidth + localPlayer.drawOffsetX * RENDER_SCALE, localPlayer.state.x));
        localPlayer.state.y = Math.max(localPlayer.drawOffsetY * RENDER_SCALE, Math.min(GAME_HEIGHT - drawnHeight + localPlayer.drawOffsetY * RENDER_SCALE, localPlayer.state.y));

        if (now - lastPresenceUpdateTime > LOCAL_PLAYER_UPDATE_INTERVAL) {
            updateLocalPlayerPresence();
        }
    }

    for (const id in players) {
        if (id !== localPlayerId) {
            // players[id].interpolate(REMOTE_PLAYER_INTERPOLATION_FACTOR);
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
                const playerCenterX = players[id].state.x + (players[id].currentVehicle.width * RENDER_SCALE / 2) - (players[id].drawOffsetX * RENDER_SCALE);
                const playerTopY = players[id].state.y - (players[id].drawOffsetY * RENDER_SCALE);
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