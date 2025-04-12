// New file: Handles saving and retrieving high scores using WebsimSocket records

// Use a versioned type name to easily invalidate old schemas if needed
const HIGHSCORE_RECORD_TYPE = 'highscore_v1';

class ScorePersistence {
    constructor(networkManager) {
        this.networkManager = networkManager;
        if (!this.networkManager || !this.networkManager.room) {
            console.error("ScorePersistence requires a NetworkManager with an initialized room!");
            // Fallback to a dummy room object to prevent immediate errors, but persistence won't work
            this.room = { collection: () => ({ create: async () => {}, getList: () => [], subscribe: () => {} }) };
        } else {
            this.room = this.networkManager.room;
        }
    }

    /**
     * Saves a new high score record.
     * The username is automatically added by WebsimSocket.
     * @param {number} score - The player's final score.
     * @returns {Promise<object|null>} The created record object or null on error.
     */
    async saveScore(score) {
        if (!score || score <= 0) {
             console.log("Skipping score save for score <= 0");
             return null;
        }
        try {
            console.log(`Attempting to save score: ${score}`);
            // Username is automatically handled by WebsimSocket
            const record = await this.room.collection(HIGHSCORE_RECORD_TYPE).create({
                score: score,
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
}

export default ScorePersistence;