// New file: Defines player lifecycle states and transitions

export const PlayerLifecycleState = {
    CONNECTING: 'CONNECTING', // Initial state before fully joined/presence known
    SELECTING: 'SELECTING',   // Choosing vehicle (after join or death)
    ACTIVE: 'ACTIVE',       // Playing the game
    DEAD: 'DEAD',         // Vehicle destroyed, before respawn/selection
    SPECTATING: 'SPECTATING', // Watching (potentially after death or joining late - future use)
};

// Functions to manage state transitions could go here if complex logic is needed,
// but for now, we'll manage state changes directly in PlayerManager/PlayerState.