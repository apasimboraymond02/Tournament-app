class SocialManager {
    constructor() {
        this.teams = []; // { id, name, description, captainId, members: [] }
        this.friendRequests = []; // { id, senderId, receiverId, status }
        this.friends = []; // { userId1, userId2, since }
        this.teamInvites = []; // { id, teamId, senderId, receiverId, status }
        this.chatRooms = new Map(); // tournamentId -> { participants: Set, messages: [] }
    }

    // --- Teams ---
    createTeam(userId, name, description) {
        const team = {
            id: this.teams.length + 1,
            name,
            description,
            captainId: userId,
            members: [{ userId, role: 'captain', joinedAt: new Date().toISOString() }],
            createdAt: new Date().toISOString(),
            stats: { wins: 0, earnings: 0 }
        };
        this.teams.push(team);
        return team;
    }

    inviteToTeam(teamId, senderId, inviteeId) {
        const team = this.teams.find(t => t.id == teamId);
        if (!team || team.captainId !== senderId) return null;
        
        const invite = {
            id: this.teamInvites.length + 1,
            teamId: parseInt(teamId),
            teamName: team.name,
            senderId,
            receiverId,
            status: 'pending',
            timestamp: new Date().toISOString()
        };
        this.teamInvites.push(invite);
        return invite;
    }

    acceptTeamInvite(inviteId, userId) {
        const invite = this.teamInvites.find(i => i.id == inviteId && i.receiverId == userId && i.status === 'pending');
        if (!invite) return null;
        
        invite.status = 'accepted';
        const team = this.teams.find(t => t.id === invite.teamId);
        if (team) {
            team.members.push({ userId, role: 'member', joinedAt: new Date().toISOString() });
        }
        return team;
    }

    // --- Friends ---
    sendFriendRequest(senderId, receiverId) {
        if (senderId === receiverId) return null;
        // Check existing
        const existing = this.friendRequests.find(r => 
            (r.senderId === senderId && r.receiverId === receiverId) || 
            (r.senderId === receiverId && r.receiverId === senderId)
        );
        if (existing) return null;

        const request = {
            id: this.friendRequests.length + 1,
            senderId,
            receiverId,
            status: 'pending',
            timestamp: new Date().toISOString()
        };
        this.friendRequests.push(request);
        return request;
    }

    acceptFriendRequest(requestId, userId) {
        const request = this.friendRequests.find(r => r.id == requestId && r.receiverId == userId && r.status === 'pending');
        if (!request) return null;

        request.status = 'accepted';
        this.friends.push({
            userId1: request.senderId,
            userId2: request.receiverId,
            since: new Date().toISOString()
        });
        return request;
    }

    getUserSocialData(userId) {
        const myTeams = this.teams.filter(t => t.members.some(m => m.userId === userId));
        const myFriends = this.friends
            .filter(f => f.userId1 === userId || f.userId2 === userId)
            .map(f => ({
                userId: f.userId1 === userId ? f.userId2 : f.userId1,
                friendSince: f.since
            }));
            
        const pendingRequests = this.friendRequests.filter(r => r.receiverId === userId && r.status === 'pending');
        const pendingTeamInvites = this.teamInvites.filter(i => i.receiverId === userId && i.status === 'pending');

        return {
            teams: myTeams,
            friends: { count: myFriends.length, list: myFriends },
            pendingRequests,
            pendingTeamInvites
        };
    }

    // --- Chat ---
    joinTournamentChat(tournamentId, userId) {
        if (!this.chatRooms.has(tournamentId)) {
            this.chatRooms.set(tournamentId, { participants: new Set(), messages: [] });
        }
        const room = this.chatRooms.get(tournamentId);
        room.participants.add(userId);
        return { tournamentId, participants: room.participants, messages: room.messages };
    }

    sendChatMessage(tournamentId, userId, message, type = 'text') {
        if (!this.chatRooms.has(tournamentId)) return null;
        
        const room = this.chatRooms.get(tournamentId);
        const chatMsg = {
            id: room.messages.length + 1,
            userId,
            message,
            type,
            timestamp: new Date().toISOString()
        };
        room.messages.push(chatMsg);
        
        // Keep history limited
        if (room.messages.length > 100) room.messages.shift();
        
        return chatMsg;
    }

    getChatHistory(tournamentId, limit = 50) {
        if (!this.chatRooms.has(tournamentId)) return [];
        return this.chatRooms.get(tournamentId).messages.slice(-limit);
    }

    generateShareLink(tournament, type) {
        return `http://localhost:5000/tournament.html?id=${tournament.id}&ref=${type}`;
    }
}

module.exports = SocialManager;