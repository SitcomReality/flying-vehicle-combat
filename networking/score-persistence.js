// New file: Handles saving and retrieving high scores using WebsimSocket records

// Use a versioned type name to easily invalidate old schemas if needed
const HIGHSCORE_RECORD_TYPE = 'highscore_v2'; // Incremented version for new schema

class ScorePersistence {
    constructor(networkManager) {
        this.networkManager = networkManager;
        if (!this.networkManager || !this.networkManager.room) {
            console.error("ScorePersistence requires a NetworkManager with an initialized room!");
            // Fallback to a dummy room object to prevent immediate errors, but persistence won't work
            this.room = { collection: () => ({ create: async () => {}, getList: () => [], subscribe: () => {}, filter: () => ({ getList: () => [], delete: async () => {} }) }) };
        } else {
            this.room = this.networkManager.room;
        }
    }

    /**
     * Saves a new high score record.
     * The username is automatically added by WebsimSocket.
     * @param {number} score - The player's final score.
     * @param {number} vehicleType - The index of the vehicle used.
     * @returns {Promise<object|null>} The created record object or null on error.
     */
    async saveScore(score, vehicleType) {
        if (!score || score <= 0 || vehicleType === undefined || vehicleType === null) {
             console.log("Skipping score save for score <= 0 or missing vehicleType", { score, vehicleType });
             return null;
        }
        try {
            console.log(`Attempting to save score: ${score}, vehicleType: ${vehicleType}`);
            // Username is automatically handled by WebsimSocket
            const record = await this.room.collection(HIGHSCORE_RECORD_TYPE).create({
                score: score,
                vehicleType: vehicleType, // Include vehicleType
            });
            console.log("Score saved successfully:", record);
            return record;
        } catch (error) {
            console.error("Error saving high score:", error);
            return null;
        }
    }

    /**
     * Retrieves the top N high scores.
     * Note: getList returns newest first by default. We need to sort by score.
     * @param {number} limit - The maximum number of scores to retrieve.
     * @returns {Array<object>} An array of high score records, sorted descending by score.
     */
    getHighScores(limit = 10) {
        try {
            const records = this.room.collection(HIGHSCORE_RECORD_TYPE).getList();
            // Sort by score descending after retrieving
            const sortedRecords = records.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
            // Apply limit
            return sortedRecords.slice(0, limit);
        } catch (error) {
            console.error("Error retrieving high scores:", error);
            return [];
        }
    }

    /**
     * Subscribes to changes in the high score list.
     * The callback receives the full list, sorted by score descending.
     * @param {function(Array<object>)} callback - Function to call with the updated list.
     * @returns {function} Unsubscribe function.
     */
    subscribeToHighScores(callback, limit = 10) {
         if (!this.room || !this.room.collection) {
              console.error("Cannot subscribe to high scores, room not available.");
              return () => {}; // Return a dummy unsubscribe function
         }
        return this.room.collection(HIGHSCORE_RECORD_TYPE).subscribe((records) => {
             // Sort by score descending after retrieving
             const sortedRecords = records.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
             // Apply limit
             const limitedRecords = sortedRecords.slice(0, limit);
             callback(limitedRecords);
        });
    }

    /**
     * Deletes all high score records created by the current user if their username is "SitcomReality".
     * Can only be executed by the user "SitcomReality".
     * @returns {Promise<boolean>} True if successful (or not the target user), false on error or permission denial.
     */
    async resetMyScores() {
        if (!this.room || !this.networkManager || !this.networkManager.getClientId()) {
            console.error("Cannot reset scores: NetworkManager or room not available.");
            return false;
        }

        const localClientId = this.networkManager.getClientId();
        const localPeer = this.networkManager.getPeer(localClientId);
        const localUsername = localPeer?.username;

        const targetUsername = "SitcomReality"; // The specific username allowed to reset

        if (!localUsername) {
            console.error("Cannot reset scores: Unable to determine local username.");
            return false;
        }

        if (localUsername !== targetUsername) {
            console.log(`User ${localUsername} is not authorized to reset scores.`);
            // Return true because no error occurred, just not authorized.
            alert(`Only ${targetUsername} can reset their scores.`);
            return true;
        }

        console.log(`User ${localUsername} is attempting to reset their scores...`);

        try {
            // Fetch ALL scores first, then filter locally.
            // This is a workaround for getList potentially returning empty arrays
            // immediately after applying a filter before data is synced.
            const allScores = this.room.collection(HIGHSCORE_RECORD_TYPE).getList();
            const userScores = allScores.filter(score => score.username === targetUsername);

            if (userScores.length === 0) {
                console.log(`No scores found for ${targetUsername} to reset.`);
                alert(`No scores found for ${targetUsername} to reset.`);
                return true;
            }

            console.log(`Found ${userScores.length} scores for ${targetUsername}. Deleting...`);

            // Delete each score record
            const deletePromises = userScores.map(score =>
                this.room.collection(HIGHSCORE_RECORD_TYPE).delete(score.id)
            );

            await Promise.all(deletePromises);

            console.log(`Successfully deleted ${userScores.length} scores for ${targetUsername}.`);
            alert(`Successfully deleted ${userScores.length} scores for ${targetUsername}.`);
            return true;

        } catch (error) {
            console.error(`Error resetting scores for ${targetUsername}:`, error);
            alert(`Error resetting scores: ${error.message}`);
            return false;
        }
    }
}

export default ScorePersistence;