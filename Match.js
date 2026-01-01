const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema({
  tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true },
  round: { type: Number, required: true },
  player1: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  player2: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { 
    type: String, 
    enum: ['pending', 'scheduled', 'completed', 'under_review', 'dispute', 'awaiting_confirmation'], 
    default: 'pending' 
  },
  nextMatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', default: null },
  nextMatchSlot: { type: String, enum: ['player1', 'player2'], default: null },
  result: {
    scores: { player1: Number, player2: Number },
    timestamp: Date
  },
  claims: { type: Map, of: new mongoose.Schema({
    winnerId: String,
    scores: { player1: Number, player2: Number },
    proof: String,
    timestamp: Date
  }, { _id: false }) }
}, { timestamps: true });

module.exports = mongoose.model('Match', MatchSchema);