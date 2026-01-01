const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true },
  amount: { type: Number, required: true },
  reference: { type: String, required: true, unique: true },
  status: { type: String, enum: ['success', 'failed', 'pending'], default: 'pending' },
  paymentMethod: String,
  phone: String,
  playerName: String
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);