class AnalyticsTracker {
    constructor() {
        this.events = [];
        this.sessions = [];
        this.revenue = [];
    }

    trackUserEngagement(userId, action, details) {
        this.events.push({
            type: 'engagement',
            userId,
            action,
            details,
            timestamp: new Date().toISOString()
        });
    }

    trackSessionStart(userId, details) {
        this.sessions.push({
            userId,
            startTime: new Date().toISOString(),
            details,
            status: 'active'
        });
    }

    trackSessionEnd(userId) {
        const session = this.sessions.find(s => s.userId === userId && s.status === 'active');
        if (session) {
            session.endTime = new Date().toISOString();
            session.status = 'completed';
            session.duration = (new Date(session.endTime) - new Date(session.startTime)) / 1000; // seconds
        }
    }

    trackTournamentEvent(tournamentId, event, details) {
        this.events.push({
            type: 'tournament',
            tournamentId,
            event,
            details,
            timestamp: new Date().toISOString()
        });
    }

    trackRevenue(details) {
        this.revenue.push({
            ...details,
            timestamp: new Date().toISOString()
        });
    }

    getEngagementReport(timeframe) {
        // Mock calculation
        const activeUsers = new Set(this.sessions.map(s => s.userId)).size;
        const totalSessions = this.sessions.length;
        const avgDuration = this.sessions.reduce((acc, s) => acc + (s.duration || 0), 0) / (totalSessions || 1);

        return {
            totalActiveUsers: activeUsers,
            totalSessions,
            averageSessionDuration: avgDuration,
            timeframe
        };
    }

    getRevenueReport(timeframe) {
        const totalRevenue = this.revenue.reduce((acc, r) => acc + r.amount, 0);
        return {
            summary: {
                totalRevenue,
                totalTransactions: this.revenue.length
            },
            growth: {
                trend: 'up',
                percentage: 15 // Mock
            }
        };
    }

    getPeakTimeAnalysis() {
        // Mock data
        return {
            peakHours: [
                { hour: '18:00', activeUsers: 45 },
                { hour: '19:00', activeUsers: 60 },
                { hour: '20:00', activeUsers: 55 }
            ],
            recommendations: [
                { type: 'Scheduling', suggestion: 'Host more tournaments between 18:00 and 21:00' }
            ]
        };
    }

    getTournamentAnalytics(tournamentId) {
        const events = this.events.filter(e => e.type === 'tournament' && e.tournamentId === tournamentId);
        return {
            views: events.filter(e => e.event === 'view').length,
            registrations: events.filter(e => e.event === 'registration').length,
            shares: events.filter(e => e.event === 'share').length
        };
    }

    getRetentionReport() {
        return {
            userChurn: {
                churnRate: 5.2,
                newUsers: 12,
                returningUsers: 45
            }
        };
    }
}

module.exports = AnalyticsTracker;