class LeaderboardManager {
    constructor() {
        // In-memory storage for leaderboards
        // Map<userId, stats>
        this.globalStats = new Map();
    }

    updateLeaderboard(userId, stats) {
        const current = this.globalStats.get(userId) || {
            userId,
            username: stats.username || 'Unknown',
            points: 0,
            wins: 0,
            earnings: 0,
            tournamentsPlayed: 0
        };

        // Accumulate stats
        if (stats.points) current.points += stats.points;
        if (stats.wins) current.wins += stats.wins;
        if (stats.earnings) current.earnings += stats.earnings;
        if (stats.tournamentsPlayed) current.tournamentsPlayed += stats.tournamentsPlayed;
        
        // Update username if provided
        if (stats.username) current.username = stats.username;

        this.globalStats.set(userId, current);
    }

    getUserStats(userId) {
        return this.globalStats.get(parseInt(userId)) || {
            userId,
            username: 'Unknown',
            points: 0,
            wins: 0,
            earnings: 0,
            tournamentsPlayed: 0,
            rank: 0
        };
    }

    getLeaderboard(timeframe = 'all_time', limit = 50) {
        // For this mock, we ignore timeframe and just return global stats
        // In a real app, we'd filter by date in a database
        
        const sorted = Array.from(this.globalStats.values())
            .sort((a, b) => b.points - a.points)
            .slice(0, limit)
            .map((entry, index) => ({
                ...entry,
                rank: index + 1
            }));
            
        return sorted;
    }

    getUserRank(timeframe, userId) {
        const leaderboard = this.getLeaderboard(timeframe, 10000); // Get all
        const entry = leaderboard.find(e => e.userId === userId);
        return entry ? entry.rank : 0;
    }

    getTournamentLeaderboard(tournamentId, matches) {
        // Calculate leaderboard based on match results in a specific tournament
        const playerStats = new Map();
        
        matches.forEach(match => {
            if (match.status === 'completed' && match.result) {
                const winnerId = match.result.winner;
                // Assign points for wins in this tournament context
                if (!playerStats.has(winnerId)) {
                    playerStats.set(winnerId, { 
                        userId: winnerId, 
                        username: match.player1.id === winnerId ? match.player1.username : match.player2.username,
                        wins: 0 
                    });
                }
                playerStats.get(winnerId).wins += 1;
            }
        });
        
        return Array.from(playerStats.values())
            .sort((a, b) => b.wins - a.wins)
            .map((e, i) => ({ ...e, rank: i + 1 }));
    }
}

module.exports = LeaderboardManager;
