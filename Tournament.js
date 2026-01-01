const mongoose = require('mongoose');

const TournamentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  game: { type: String, required: true },
  entryFee: { type: Number, default: 0 },
  prize: { type: Number, default: 0 },
  maxPlayers: { type: Number, required: true },
  date: Date,
  status: { type: String, enum: ['Open', 'Closed', 'Active', 'Completed'], default: 'Open' },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  matches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Match' }],
  rounds: [Number]
}, { timestamps: true });

module.exports = mongoose.model('Tournament', TournamentSchema);