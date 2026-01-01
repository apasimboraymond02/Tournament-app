const mongoose = require('mongoose');
const Match = require('./Match');
const Tournament = require('./Tournament');

class TournamentBracket {
  constructor(tournamentId, participants, format = 'single_elimination') {
    this.tournamentId = tournamentId;
    this.participants = participants; // Array of { id, username }
    this.format = format;
    this.matches = [];
    this.rounds = [];
    this.status = 'active';
    
    this.generateBracket();
  }

  async generateBracket(participants) {
    // Shuffle participants
    const shuffled = [...this.participants].sort(() => 0.5 - Math.random());
    
    // Calculate number of rounds
    const count = shuffled.length;
    const rounds = Math.ceil(Math.log2(count));
    const size = Math.pow(2, rounds);
    
    // Create first round matches
    const firstRoundMatches = [];
    const allMatches = [];
    
    for (let i = 0; i < size / 2; i++) {
      const player1 = shuffled[i] || null;
      const player2 = shuffled[size - 1 - i] || null;
      
      // If player2 is null (bye), player1 auto advances
      const match = new Match({
        _id: new mongoose.Types.ObjectId(),
        tournamentId: this.tournamentId,
        round: 1,
        player1: player1 ? player1._id : null,
        player2: player2 ? player2._id : null,
        winner: player2 ? null : (player1 ? player1._id : null), // Auto win if bye
        status: player2 ? 'scheduled' : 'completed',
        nextMatchId: null,
        nextMatchSlot: null
      });
      
      firstRoundMatches.push(match);
      allMatches.push(match);
    }
    
    // Generate subsequent rounds (empty slots)
    let currentRoundMatches = firstRoundMatches;
    for (let r = 2; r <= rounds; r++) {
      const nextRoundMatches = [];
      for (let i = 0; i < currentRoundMatches.length; i += 2) {
        const match = new Match({
          _id: new mongoose.Types.ObjectId(),
          tournamentId: this.tournamentId,
          round: r,
          player1: null, // Winner of previous match 1
          player2: null, // Winner of previous match 2
          winner: null,
          status: 'pending',
          nextMatchId: null
        });
        
        // Link previous matches to this one
        currentRoundMatches[i].nextMatchId = match._id;
        currentRoundMatches[i].nextMatchSlot = 'player1';
        if (currentRoundMatches[i+1]) {
            currentRoundMatches[i+1].nextMatchId = match._id;
            currentRoundMatches[i+1].nextMatchSlot = 'player2';
        }
        
        nextRoundMatches.push(match);
        allMatches.push(match);
      }
      currentRoundMatches = nextRoundMatches;
    }
    
    // Save all matches to DB
    await Match.insertMany(allMatches);

    // Automatically advance any byes (auto-wins) to the next round
    for (const match of allMatches) {
        if (match.status === 'completed' && match.winner) {
            await this.advanceWinner(match._id, match.winner);
        }
    }

    // Update Tournament with match IDs
    await Tournament.findByIdAndUpdate(this.tournamentId, {
        matches: allMatches.map(m => m._id),
        rounds: Array.from({length: rounds}, (_, i) => i + 1),
        status: 'Active'
    });

    return allMatches;
  }

  async getBracketData() {
    const matches = await Match.find({ tournamentId: this.tournamentId })
        .populate('player1', 'username')
        .populate('player2', 'username')
        .populate('winner', 'username');
        
    const tournament = await Tournament.findById(this.tournamentId);

    return {
      tournamentId: this.tournamentId,
      matches: matches,
      rounds: tournament.rounds,
      status: tournament.status
    };
  }

  async getMatch(matchId) {
    return await Match.findById(matchId)
        .populate('player1')
        .populate('player2');
  }

  async submitResult(matchId, userId, winnerId, scores, proof) {
    const match = await this.getMatch(matchId);
    if (!match) return null;
    
    // Initialize claims if not present
    if (!match.claims) match.claims = new Map();

    // Store the player's claim
    match.claims.set(userId, {
        winnerId: winnerId,
        scores,
        proof,
        timestamp: new Date().toISOString()
    });

    const p1Id = match.player1?._id.toString();
    const p2Id = match.player2?._id.toString();

    // Check for consensus (both players submitted)
    const claim1 = match.claims.get(p1Id);
    const claim2 = match.claims.get(p2Id);

    if (claim1 && claim2) {
        if (claim1.winnerId === claim2.winnerId) {
            // Consensus reached: Automatically finalize
            await this.finalizeMatch(match, claim1.winnerId, claim1.scores);
        } else {
            // Conflict: Mark for dispute
            match.status = 'dispute';
        }
    } else {
        // Waiting for the other player
        match.status = 'awaiting_confirmation';
    }
    
    await match.save();
    return match;
  }

  async finalizeMatch(match, winnerId, scores) {
    match.result = {
        winner: winnerId,
        scores,
        timestamp: new Date().toISOString()
    };
    match.status = 'completed';
    
    await this.advanceWinner(match._id, winnerId);
  }

  async advanceWinner(matchId, winnerId) {
    const match = await this.getMatch(matchId);
    if (!match) return;

    if (match.nextMatchId) {
        const nextMatch = await this.getMatch(match.nextMatchId);
        if (nextMatch) {
            const winner = match.player1.id == winnerId ? match.player1 : match.player2;
            
            if (match.nextMatchSlot === 'player1') {
                nextMatch.player1 = winner;
            } else if (match.nextMatchSlot === 'player2') {
                nextMatch.player2 = winner;
            }
            
            if (nextMatch.player1 && nextMatch.player2) {
                nextMatch.status = 'scheduled';
            }
            await nextMatch.save();
        }
    } else {
        // Final match
        this.status = 'completed';
    }
  }
}

module.exports = TournamentBracket;