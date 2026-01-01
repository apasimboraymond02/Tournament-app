const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const connectDB = require('./db');

// Import Phase 6 modules
const TournamentBracket = require('./bracketGenerator');
const LeaderboardManager = require('./leaderboardmanager');
const SocialManager = require('./socialmanager');
const AnalyticsTracker = require('./analyticsTracker');

const User = require('./User');
const Tournament = require('./Tournament');
const Match = require('./Match');
const Payment = require('./Payment');

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Initialize Phase 6 managers
const leaderboardManager = new LeaderboardManager();
const socialManager = new SocialManager();
const analyticsTracker = new AnalyticsTracker();
const tournamentBrackets = new Map();

// WebSocket setup
const wss = new WebSocket.Server({ server });
const connections = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// In-memory logs (keep these for simplicity or move to DB later)
const notifications = [];
const activityLog = [];

// ==================== ORIGINAL UTILITY FUNCTIONS ====================
function generateToken(userId) {
  return `token_${userId}_${Date.now()}`;
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const userId = token.split('_')[1];
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token format' });
  }
}

function checkAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
}

function logActivity(activity, user, details) {
  activityLog.unshift({
    id: activityLog.length + 1,
    time: new Date().toISOString(),
    activity,
    user,
    details
  });
  
  if (activityLog.length > 100) {
    activityLog.pop();
  }
}

// ==================== PHASE 6: WEB SOCKET FUNCTIONS ====================
wss.on('connection', (ws, req) => {
  const connectionId = Math.random().toString(36).substr(2, 9);
  connections.set(connectionId, ws);
  
  console.log(`WebSocket connected: ${connectionId}, Total: ${connections.size}`);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleWebSocketMessage(connectionId, data);
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    connections.delete(connectionId);
    console.log(`WebSocket disconnected: ${connectionId}, Total: ${connections.size}`);
  });
  
  ws.send(JSON.stringify({
    type: 'connection_established',
    connectionId,
    timestamp: new Date().toISOString()
  }));
});

function handleWebSocketMessage(connectionId, data) {
  const { type, payload } = data;
  
  switch(type) {
    case 'subscribe_tournament':
      console.log(`Connection ${connectionId} subscribed to tournament ${payload.tournamentId}`);
      break;
    case 'subscribe_user':
      console.log(`Connection ${connectionId} subscribed to user updates`);
      break;
    default:
      console.log(`Unknown message type: ${type} from ${connectionId}`);
  }
}

function broadcastToTournament(tournamentId, data) {
  connections.forEach((ws, connectionId) => {
    try {
      ws.send(JSON.stringify({
        type: 'tournament_update',
        tournamentId,
        data,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Broadcast error:', error);
    }
  });
}

function broadcastToUser(userId, data) {
  connections.forEach((ws, connectionId) => {
    try {
      ws.send(JSON.stringify({
        type: 'user_update',
        userId,
        data,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('User broadcast error:', error);
    }
  });
}

// ==================== ORIGINAL ROUTES (KEEP ALL) ====================

// Home
app.get('/', (req, res) => {
  res.json({
    message: '🎮 Skillr - Competitive Gaming Platform',
    status: 'OK',
    version: '1.0.0',
    features: ['User Authentication', 'Tournament Registration', 'Mobile Money Payments', 'Admin Panel', 'Real-time Updates', 'Tournament Brackets', 'Leaderboards', 'Social Features', 'Advanced Analytics']
  });
});

// Health check
app.get('/api/health', async (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    users: await User.countDocuments(),
    tournaments: await Tournament.countDocuments(),
    payments: await Payment.countDocuments()
  });
});

// ==================== AUTHENTICATION ROUTES ====================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, phone, username, fullName, password } = req.body;
    
    if (!email || !phone || !username || !fullName || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    const newUser = await User.create({
      email,
      phone,
      username,
      fullName,
      password: passwordHash,
      role: 'user'
    });
    
    const token = generateToken(newUser._id);
    const userWithoutPassword = newUser.toObject();
    delete userWithoutPassword.password;
    
    // Track analytics
    analyticsTracker.trackUserEngagement(newUser._id, 'user_registered', {
      email,
      username
    });
    
    logActivity('User registration', username, 'New user registered on Skillr');
    
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: userWithoutPassword,
      token
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Account has been suspended' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken(user._id);
    const userWithoutPassword = user.toObject();
    delete userWithoutPassword.password;
    
    // Track session start
    analyticsTracker.trackSessionStart(user._id, {
      userAgent: req.headers['user-agent']
    });
    
    if (user.role === 'admin') {
      logActivity('Admin login', user.username, 'Skillr admin panel accessed');
    } else {
      logActivity('User login', user.username, 'User logged into Skillr');
    }
    
    res.json({
      success: true,
      message: 'Login successful',
      user: userWithoutPassword,
      token
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/admin-login', async (req, res) => {
  try {
    const { email, password, adminKey } = req.body;
    
    if (adminKey !== 'Skillr2024') {
      return res.status(401).json({ error: 'Invalid admin key' });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken(user._id);
    const userWithoutPassword = user.toObject();
    delete userWithoutPassword.password;
    
    logActivity('Admin login', user.username, 'Admin login via admin endpoint on Skillr');
    
    res.json({
      success: true,
      message: 'Admin login successful',
      user: userWithoutPassword,
      token
    });
    
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Admin login failed' });
  }
});

app.get('/api/auth/profile', authenticateToken, (req, res) => {
  const userWithoutPassword = req.user.toObject();
  delete userWithoutPassword.password;
  res.json({ success: true, user: userWithoutPassword });
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { username, fullName, phone, currentPassword, newPassword, bio, dob } = req.body;
    const user = req.user;
    
    if (username) user.username = username;
    if (fullName) user.fullName = fullName;
    if (phone) user.phone = phone;
    if (bio !== undefined) user.bio = bio;
    if (dob) user.dob = dob;
    
    if (currentPassword && newPassword) {
      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
    }
    
    await user.save();
    const userWithoutPassword = user.toObject();
    delete userWithoutPassword.password;
    
    logActivity('Profile update', user.username, 'User updated profile on Skillr');
    
    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: userWithoutPassword 
    });
    
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

app.post('/api/user/profile/update', authenticateToken, async (req, res) => {
  try {
    const updates = req.body;
    const user = req.user;
    
    const allowedFields = ['username', 'fullName', 'phone', 'bio', 'dob'];
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        user[field] = updates[field];
      }
    });
    
    const { passwordHash, ...userWithoutPassword } = user;
    
    res.json({
      success: true,
      message: 'Profile updated',
      user: userWithoutPassword
    });
    
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Update failed' });
  }
});

// ==================== TOURNAMENT ROUTES ====================
app.get('/api/tournaments', async (req, res) => {
  const tournaments = await Tournament.find();
  // Track analytics for tournament views
  tournaments.forEach(tournament => {
    analyticsTracker.trackTournamentEvent(tournament._id, 'view', {
      timestamp: new Date().toISOString()
    });
  });
  
  res.json({ tournaments });
});

app.get('/api/tournament/:id', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
  
  if (tournament) {
    // Track detailed tournament view
    analyticsTracker.trackTournamentEvent(tournament._id, 'detailed_view', {
      timestamp: new Date().toISOString()
    });
    
    res.json({ tournament });
  } else {
    res.status(404).json({ error: 'Tournament not found' });
  }
  } catch (e) {
    res.status(404).json({ error: 'Tournament not found' });
  }
});

app.get('/api/tournaments/search', async (req, res) => {
  const query = req.query.q?.toLowerCase() || '';
  const game = req.query.game?.toLowerCase() || '';
  const minPrice = parseFloat(req.query.minPrice) || 0;
  const maxPrice = parseFloat(req.query.maxPrice) || 1000;
  const status = req.query.status?.toLowerCase();
  
  const filter = {};
  if (query) filter.$or = [{ title: new RegExp(query, 'i') }, { game: new RegExp(query, 'i') }];
  if (game) filter.game = new RegExp(game, 'i');
  if (status && status !== 'all') filter.status = new RegExp(status, 'i');
  filter.entryFee = { $gte: minPrice, $lte: maxPrice };

  const filtered = await Tournament.find(filter);
  
  res.json({ tournaments: filtered });
});

app.get('/api/users/search', authenticateToken, async (req, res) => {
  const query = req.query.q?.toLowerCase();
  if (!query || query.length < 2) return res.json({ users: [] });
  
  const foundUsers = await User.find({
    $or: [{ username: new RegExp(query, 'i') }, { email: new RegExp(query, 'i') }],
    _id: { $ne: req.user._id }
  }).select('username avatar');
  
  res.json({ users: foundUsers });
});

app.post('/api/tournament/:id/register', authenticateToken, async (req, res) => {
  const tournamentId = req.params.id;
  const userId = req.user._id;
  
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }
  
  if (tournament.status !== 'Open') {
    return res.status(400).json({ error: 'Tournament registration is closed' });
  }
  
  if (tournament.participants.length >= tournament.maxPlayers) {
    return res.status(400).json({ error: 'Tournament is full' });
  }
  
  if (tournament.participants.includes(userId)) {
    return res.status(400).json({ error: 'Already registered for this tournament' });
  }
  
  tournament.participants.push(userId);
  await tournament.save();
  
  req.user.tournamentsPlayed += 1;
  await req.user.save();
  
  // Track analytics
  analyticsTracker.trackTournamentEvent(tournamentId, 'registration', {
    userId,
    entryFee: tournament.entryFee
  });
  
  // Update leaderboard
  leaderboardManager.updateLeaderboard(userId, {
    points: 10, // Registration points
    wins: 0,
    earnings: 0,
    username: req.user.username,
    tournamentsPlayed: 1
  });
  
  // Broadcast real-time update
  broadcastToTournament(tournamentId, {
    event: 'player_joined',
    playerCount: tournament.participants.length,
    maxPlayers: tournament.maxPlayers,
    playerName: req.user.username,
    timestamp: new Date().toISOString()
  });
  
  logActivity('Tournament registration', req.user.username, `Registered for ${tournament.title} on Skillr`);
  
  res.json({
    success: true,
    message: `Successfully registered for ${tournament.title}`
  });
});

app.get('/api/user/registrations', authenticateToken, async (req, res) => {
  const userId = req.user._id;
  const tournaments = await Tournament.find({ participants: userId });
  res.json({ registrations: tournaments });
});

app.get('/api/games', async (req, res) => {
  const games = await Tournament.distinct('game');
  res.json({ games });
});

// ==================== PAYMENT ROUTES ====================
app.post('/api/payment/process', authenticateToken, async (req, res) => {
  const { tournamentId, amount, paymentMethod, pin, playerName } = req.body;
  const userId = req.user._id;
  
  const ghanaPhoneRegex = /^(0?(55|24|54|59|20|50|27|57|26|56))[0-9]{7}$/;
  if (!ghanaPhoneRegex.test(req.user.phone)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid Ghana phone number in profile'
    });
  }
  
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid PIN. Must be 4 digits'
    });
  }
  
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    return res.status(404).json({ 
      success: false, 
      error: 'Tournament not found' 
    });
  }
  
  if (parseFloat(amount) !== tournament.entryFee) {
    return res.status(400).json({
      success: false,
      error: `Amount must be GHS ${tournament.entryFee}`
    });
  }
  
  const reference = 'PMT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
  const isSuccess = Math.random() > 0.15;
  
  const payment = await Payment.create({
    reference,
    userId,
    tournamentId,
    amount: parseFloat(amount),
    phone: req.user.phone,
    paymentMethod,
    playerName: playerName || req.user.username,
    status: isSuccess ? 'success' : 'failed',
    timestamp: new Date().toISOString(),
    message: isSuccess 
      ? `Payment of GHS ${amount} to ${tournament.title} was successful on Skillr`
      : `Payment failed. Insufficient funds or network error`
  });
  
  // Track revenue analytics
  analyticsTracker.trackRevenue({
    amount: payment.amount,
    method: payment.paymentMethod,
    game: tournament.game,
    tournamentId: tournament.id,
    userId: req.user._id,
    timestamp: payment.timestamp
  });
  
  // If payment successful, register user for tournament
  if (isSuccess) {
    if (!tournament.participants.includes(userId)) {
      tournament.participants.push(userId);
      await tournament.save();
      
      req.user.tournamentsPlayed += 1;
      await req.user.save();
      
      // Broadcast real-time player count update
      broadcastToTournament(tournamentId, {
        event: 'player_joined_via_payment',
        playerCount: tournament.participants.length,
        playerName: payment.playerName,
        timestamp: new Date().toISOString()
      });
    }
    
    logActivity('Payment success', req.user.username, `Paid GHS ${amount} for ${tournament.title} on Skillr`);
  } else {
    logActivity('Payment failed', req.user.username, `Payment failed for ${tournament.title} on Skillr`);
  }
  
  // Simulate processing delay
  setTimeout(() => {
    res.json({
      success: isSuccess,
      payment,
      sms: isSuccess ? {
        to: req.user.phone,
        message: `You have paid GHS ${amount} to Skillr for ${tournament.title}. Ref: ${reference}. Thank you!`,
        timestamp: new Date().toLocaleString('en-GH')
      } : null
    });
  }, 2000);
});

app.get('/api/user/payments', authenticateToken, async (req, res) => {
  const userId = req.user._id;
  const userPayments = await Payment.find({ userId });

  const sortedPayments = userPayments.sort((a, b) => 
    new Date(b.timestamp) - new Date(a.timestamp)
  );
  
  res.json({ payments: sortedPayments });
});

app.get('/api/payment/verify/:reference', authenticateToken, async (req, res) => {
  const reference = req.params.reference;
  const payment = await Payment.findOne({ reference, userId: req.user._id });
  
  if (payment) {
    res.json({ success: true, payment });
  } else {
    res.status(404).json({ success: false, error: 'Payment not found' });
  }
});

app.get('/api/payment/:reference', authenticateToken, async (req, res) => {
  const reference = req.params.reference;
  const payment = await Payment.findOne({ reference });
  
  if (payment && (payment.userId.toString() === req.user._id.toString() || req.user.role === 'admin')) {
    res.json({ success: true, payment });
  } else {
    res.status(404).json({ success: false, error: 'Payment not found' });
  }
});

// ==================== STATISTICS ====================
app.get('/api/user/stats', authenticateToken, async (req, res) => {
  const userId = req.user._id;
  const userRegs = await Tournament.find({ participants: userId });
  const userPayments = await Payment.find({ userId, status: 'success' });
  
  const totalSpent = userPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const upcomingTournaments = userRegs.filter(t => t.status === 'Open').length;
  
  // Get leaderboard stats
  const leaderboardStats = leaderboardManager.getUserStats(userId);
  
  res.json({
    totalTournaments: userRegs.length,
    upcomingTournaments,
    totalSpent,
    tournamentsPlayed: req.user.tournamentsPlayed || 0,
    totalWinnings: req.user.totalWinnings || 0,
    leaderboardStats
  });
});

// ==================== ADMIN ROUTES ====================
app.get('/api/admin/stats', authenticateToken, checkAdmin, (req, res) => {
  const totalRevenue = payments
    .filter(p => p.status === 'success')
    .reduce((sum, p) => sum + p.amount, 0);
  
  const today = new Date().toISOString().split('T')[0];
  const todayRegistrations = userRegistrations.filter(
    reg => reg.registeredAt.startsWith(today)
  ).length;
  
  const todayPayments = payments.filter(
    p => p.timestamp.startsWith(today) && p.status === 'success'
  ).length;
  
  // Get analytics data
  const engagementReport = analyticsTracker.getEngagementReport('7d');
  const revenueReport = analyticsTracker.getRevenueReport('daily');
  const peakTimeAnalysis = analyticsTracker.getPeakTimeAnalysis();
  
  res.json({
    totalTournaments: tournaments.length,
    totalUsers: users.length,
    totalRevenue,
    todayRegistrations,
    todayPayments,
    totalPayments: payments.filter(p => p.status === 'success').length,
    activeTournaments: tournaments.filter(t => t.status === 'Open').length,
    totalRegistrations: userRegistrations.length,
    analytics: {
      engagement: engagementReport,
      revenue: revenueReport,
      peakTimes: peakTimeAnalysis
    }
  });
});

app.get('/api/admin/users', authenticateToken, checkAdmin, (req, res) => {
  const usersWithoutPasswords = users.map(({ passwordHash, ...user }) => {
    const userRegs = userRegistrations.filter(reg => reg.userId === user.id);
    const userPayments = payments.filter(p => p.userId === user.id && p.status === 'success');
    const totalSpent = userPayments.reduce((sum, p) => sum + p.amount, 0);
    
    // Get social data
    const socialData = socialManager.getUserSocialData(user.id);
    
    return {
      ...user,
      registrations: userRegs.length,
      totalSpent,
      lastActive: userRegs.length > 0 ? 
        userRegs.sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt))[0].registeredAt : 
        user.createdAt,
      socialData
    };
  });
  
  res.json({ users: usersWithoutPasswords });
});

app.get('/api/admin/tournaments', authenticateToken, checkAdmin, (req, res) => {
  // Enrich tournaments with analytics data
  const enrichedTournaments = tournaments.map(tournament => {
    const tournamentAnalytics = analyticsTracker.getTournamentAnalytics(tournament.id);
    const bracket = tournamentBrackets.get(tournament.id);
    
    return {
      ...tournament,
      analytics: tournamentAnalytics,
      hasBracket: !!bracket,
      bracket: bracket ? bracket.getBracketData() : null
    };
  });
  
  res.json({ tournaments: enrichedTournaments });
});

app.get('/api/admin/payments', authenticateToken, checkAdmin, (req, res) => {
  const enrichedPayments = payments.map(payment => {
    const user = users.find(u => u.id === payment.userId);
    const tournament = tournaments.find(t => t.id === payment.tournamentId);
    
    return {
      ...payment,
      user: user ? { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        phone: user.phone 
      } : null,
      tournament: tournament ? { 
        id: tournament.id,
        title: tournament.title, 
        game: tournament.game 
      } : null
    };
  });
  
  res.json({ payments: enrichedPayments });
});

app.get('/api/admin/registrations', authenticateToken, checkAdmin, (req, res) => {
  const enrichedRegistrations = userRegistrations.map(reg => {
    const user = users.find(u => u.id === reg.userId);
    const tournament = tournaments.find(t => t.id === reg.tournamentId);
    
    return {
      ...reg,
      user: user ? { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        phone: user.phone 
      } : null,
      tournament: tournament ? { 
        id: tournament.id,
        title: tournament.title, 
        game: tournament.game,
        date: tournament.date,
        status: tournament.status
      } : null
    };
  });
  
  res.json({ registrations: enrichedRegistrations });
});

app.get('/api/tournament/:id/registrations', authenticateToken, checkAdmin, (req, res) => {
  const tournamentId = parseInt(req.params.id);
  const tournamentRegs = userRegistrations.filter(reg => reg.tournamentId === tournamentId);
  
  const enrichedRegs = tournamentRegs.map(reg => {
    const user = users.find(u => u.id === reg.userId);
    return {
      ...reg,
      user: user ? { 
        id: user.id, 
        username: user.username, 
        email: user.email, 
        phone: user.phone 
      } : null
    };
  });
  
  res.json({ registrations: enrichedRegs });
});

app.get('/api/admin/activity', authenticateToken, checkAdmin, (req, res) => {
  res.json({ activities: activityLog.slice(0, 20) });
});

app.post('/api/admin/tournaments', authenticateToken, checkAdmin, (req, res) => {
  try {
    const {
      game,
      title,
      description,
      entryFee,
      prize,
      maxPlayers,
      date,
      time,
      status,
      mode,
      map,
      organizer,
      contact,
      rules,
      schedule,
      prizeDistribution
    } = req.body;
    
    if (!game || !title || !description || !entryFee || !maxPlayers || !date || !time) {
      return res.status(400).json({ error: 'Required fields missing' });
    }
    
    const newTournament = {
      id: tournaments.length + 1,
      game,
      title,
      description,
      entryFee: parseFloat(entryFee),
      prize: parseFloat(prize || entryFee * 10),
      players: 0,
      maxPlayers: parseInt(maxPlayers),
      date,
      time,
      status: status || 'Open',
      rules: Array.isArray(rules) ? rules : [rules || 'Standard tournament rules apply'],
      schedule: Array.isArray(schedule) ? schedule : [schedule || 'Check tournament details'],
      prizeDistribution: Array.isArray(prizeDistribution) ? prizeDistribution : [prizeDistribution || 'Prize details to be announced'],
      image: req.body.image || 'https://img.icons8.com/color/96/000000/controller.png',
      banner: req.body.banner || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&h=200&fit=crop',
      map: map || 'Default Map',
      mode: mode || 'Solo',
      organizer: organizer || 'Skillr Gaming Association',
      contact: contact || '055 000 0000'
    };
    
    tournaments.push(newTournament);
    
    logActivity('Tournament created', req.user.username, `Created: ${title} on Skillr`);
    
    res.status(201).json({
      success: true,
      message: 'Tournament created successfully',
      tournament: newTournament
    });
    
  } catch (error) {
    console.error('Create tournament error:', error);
    res.status(500).json({ error: 'Failed to create tournament' });
  }
});

app.put('/api/admin/tournament/:id', authenticateToken, checkAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = req.body;
    
    const tournamentIndex = tournaments.findIndex(t => t.id === id);
    if (tournamentIndex === -1) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    const preserveFields = ['id', 'players'];
    preserveFields.forEach(field => {
      if (updates[field] !== undefined) {
        delete updates[field];
      }
    });
    
    tournaments[tournamentIndex] = { ...tournaments[tournamentIndex], ...updates };
    
    logActivity('Tournament updated', req.user.username, `Updated: ${tournaments[tournamentIndex].title} on Skillr`);
    
    res.json({
      success: true,
      message: 'Tournament updated successfully',
      tournament: tournaments[tournamentIndex]
    });
    
  } catch (error) {
    console.error('Update tournament error:', error);
    res.status(500).json({ error: 'Failed to update tournament' });
  }
});

app.delete('/api/admin/tournament/:id', authenticateToken, checkAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const tournamentIndex = tournaments.findIndex(t => t.id === id);
  
  if (tournamentIndex === -1) {
    return res.status(404).json({ error: 'Tournament not found' });
  }
  
  const deletedTournament = tournaments.splice(tournamentIndex, 1)[0];
  
  const registrationIndices = userRegistrations
    .map((reg, index) => reg.tournamentId === id ? index : -1)
    .filter(index => index !== -1)
    .reverse();
  
  registrationIndices.forEach(index => {
    userRegistrations.splice(index, 1);
  });
  
  logActivity('Tournament deleted', req.user.username, `Deleted: ${deletedTournament.title} from Skillr`);
  
  res.json({
    success: true,
    message: 'Tournament deleted successfully',
    tournament: deletedTournament
  });
});

app.put('/api/admin/user/:id/status', authenticateToken, checkAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  
  const user = users.find(u => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const validStatuses = ['active', 'inactive', 'banned'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  
  const oldStatus = user.status;
  user.status = status;
  
  logActivity('User status updated', req.user.username, 
    `Changed ${user.username} from ${oldStatus} to ${status} on Skillr`);
  
  const { passwordHash, ...userWithoutPassword } = user;
  
  res.json({
    success: true,
    message: `User status updated to ${status}`,
    user: userWithoutPassword
  });
});

app.post('/api/admin/notifications', authenticateToken, checkAdmin, (req, res) => {
  try {
    const {
      type,
      subject,
      message,
      tournamentId,
      userId,
      sendInApp,
      sendSMS,
      sendEmail
    } = req.body;
    
    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required' });
    }
    
    let recipients = [];
    let notificationDetails = '';
    
    switch (type) {
      case 'all':
        recipients = users.map(u => ({ id: u.id, username: u.username, email: u.email, phone: u.phone }));
        notificationDetails = 'Sent to all Skillr users';
        break;
        
      case 'tournament':
        const tournament = tournaments.find(t => t.id === tournamentId);
        if (!tournament) {
          return res.status(404).json({ error: 'Tournament not found' });
        }
        
        const tournamentRegistrations = userRegistrations.filter(reg => reg.tournamentId === tournamentId);
        recipients = tournamentRegistrations.map(reg => {
          const user = users.find(u => u.id === reg.userId);
          return user ? { id: user.id, username: user.username, email: user.email, phone: user.phone } : null;
        }).filter(u => u !== null);
        
        notificationDetails = `Sent to ${recipients.length} participants of ${tournament.title} on Skillr`;
        break;
        
      case 'user':
        const targetUser = users.find(u => u.id === userId);
        if (!targetUser) {
          return res.status(404).json({ error: 'User not found' });
        }
        
        recipients = [{ id: targetUser.id, username: targetUser.username, email: targetUser.email, phone: targetUser.phone }];
        notificationDetails = `Sent to ${targetUser.username} on Skillr`;
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid notification type' });
    }
    
    const notification = {
      id: notifications.length + 1,
      type,
      subject,
      message,
      recipients: recipients.length,
      sentBy: req.user.id,
      sentAt: new Date().toISOString(),
      status: 'sent',
      details: notificationDetails
    };
    
    notifications.push(notification);
    
    // Send real-time notifications
    recipients.forEach(recipient => {
      broadcastToUser(recipient.id, {
        event: 'admin_notification',
        subject,
        message,
        timestamp: new Date().toISOString()
      });
    });
    
    logActivity('Notification sent', req.user.username, 
      `${subject} - ${notificationDetails}`);
    
    res.json({
      success: true,
      message: 'Notification sent successfully',
      notification,
      recipients: recipients.length
    });
    
  } catch (error) {
    console.error('Send notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

app.get('/api/admin/notifications', authenticateToken, checkAdmin, (req, res) => {
  const enrichedNotifications = notifications.map(notification => {
    const sender = users.find(u => u.id === notification.sentBy);
    return {
      ...notification,
      sentByUser: sender ? { username: sender.username } : null
    };
  });
  
  res.json({ notifications: enrichedNotifications });
});

app.get('/api/admin/reports', authenticateToken, checkAdmin, (req, res) => {
  const { type, period } = req.query;
  
  const now = new Date();
  let startDate, endDate;
  
  switch (period) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      endDate = new Date(now.setHours(23, 59, 59, 999));
      break;
      
    case 'week':
      startDate = new Date(now.setDate(now.getDate() - 7));
      endDate = new Date();
      break;
      
    case 'month':
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      endDate = new Date();
      break;
      
    case 'year':
      startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      endDate = new Date();
      break;
      
    default:
      startDate = new Date(0);
      endDate = new Date();
  }
  
  let reportData = {};
  
  switch (type) {
    case 'revenue':
      const periodPayments = payments.filter(p => {
        const paymentDate = new Date(p.timestamp);
        return paymentDate >= startDate && paymentDate <= endDate && p.status === 'success';
      });
      
      const revenueByDay = {};
      periodPayments.forEach(p => {
        const day = p.timestamp.split('T')[0];
        revenueByDay[day] = (revenueByDay[day] || 0) + p.amount;
      });
      
      reportData = {
        totalRevenue: periodPayments.reduce((sum, p) => sum + p.amount, 0),
        totalTransactions: periodPayments.length,
        avgTransaction: periodPayments.length > 0 ? 
          periodPayments.reduce((sum, p) => sum + p.amount, 0) / periodPayments.length : 0,
        revenueByDay: Object.entries(revenueByDay).map(([date, amount]) => ({ date, amount }))
      };
      break;
      
    case 'registrations':
      const periodRegistrations = userRegistrations.filter(reg => {
        const regDate = new Date(reg.registeredAt);
        return regDate >= startDate && regDate <= endDate;
      });
      
      const regsByGame = {};
      periodRegistrations.forEach(reg => {
        const tournament = tournaments.find(t => t.id === reg.tournamentId);
        if (tournament) {
          regsByGame[tournament.game] = (regsByGame[tournament.game] || 0) + 1;
        }
      });
      
      reportData = {
        totalRegistrations: periodRegistrations.length,
        regsByGame: Object.entries(regsByGame).map(([game, count]) => ({ game, count })),
        uniqueUsers: new Set(periodRegistrations.map(reg => reg.userId)).size
      };
      break;
      
    case 'users':
      const periodUsers = users.filter(u => {
        const userDate = new Date(u.createdAt);
        return userDate >= startDate && userDate <= endDate;
      });
      
      reportData = {
        newUsers: periodUsers.length,
        activeUsers: users.filter(u => u.status === 'active').length,
        userGrowth: periodUsers.length,
        userStatus: {
          active: users.filter(u => u.status === 'active').length,
          inactive: users.filter(u => u.status === 'inactive').length,
          banned: users.filter(u => u.status === 'banned').length
        }
      };
      break;
      
    case 'tournaments':
      reportData = {
        totalTournaments: tournaments.length,
        activeTournaments: tournaments.filter(t => t.status === 'Open').length,
        completedTournaments: tournaments.filter(t => t.status === 'Closed').length,
        avgPrizePool: tournaments.reduce((sum, t) => sum + t.prize, 0) / tournaments.length,
        avgPlayers: tournaments.reduce((sum, t) => sum + t.players, 0) / tournaments.length
      };
      break;
      
    default:
      return res.status(400).json({ error: 'Invalid report type' });
  }
  
  res.json({
    success: true,
    report: {
      type,
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
      data: reportData
    }
  });
});

// ==================== PHASE 6: ADVANCED FEATURES ROUTES ====================

// Tournament Bracket Routes
app.post('/api/tournament/:id/generate-bracket', authenticateToken, async (req, res) => {
  const tournamentId = req.params.id;
  
  if (tournamentBrackets.has(tournamentId)) {
    return res.status(400).json({ error: 'Bracket already exists' });
  }

  const tournament = await Tournament.findById(tournamentId).populate('participants');
  if (tournament.participants.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 participants' });
  }

  const participants = tournament.participants;

  const bracket = new TournamentBracket(tournamentId, participants, req.body.format || 'single_elimination');
  tournamentBrackets.set(tournamentId, bracket);

  analyticsTracker.trackTournamentEvent(tournamentId, 'bracket_created', {
    participants: participants.length,
    format: bracket.format
  });

  res.json({
    success: true,
    message: 'Tournament bracket generated',
    bracket: bracket.getBracketData()
  });
});

app.get('/api/tournament/:id/bracket', (req, res) => {
  const tournamentId = req.params.id;
  const bracket = tournamentBrackets.get(tournamentId);

  if (!bracket) {
    return res.status(404).json({ error: 'Bracket not found' });
  }

  res.json({
    success: true,
    bracket: bracket.getBracketData()
  });
});

app.post('/api/tournament/:id/match/:matchId/result', authenticateToken, (req, res) => {
  const tournamentId = req.params.id;
  const matchId = req.params.matchId;
  const { winnerId, scores } = req.body;
  const bracket = tournamentBrackets.get(tournamentId);

  if (!bracket) {
    return res.status(404).json({ error: 'Bracket not found' });
  }

  const match = bracket.getMatch(matchId);
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const isPlayerInMatch = match.player1?.id === req.user._id.toString() || match.player2?.id === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isPlayerInMatch && !isAdmin) {
    return res.status(403).json({ error: 'Not authorized to submit results' });
  }

  const updatedMatch = bracket.submitResult(matchId, winnerId, scores);
  
  if (!updatedMatch) {
    return res.status(400).json({ error: 'Failed to submit result' });
  }

  if (winnerId) {
    const winnerStats = {
      points: 25,
      wins: 1,
      earnings: 0,
      username: updatedMatch.player1?.id === winnerId ? updatedMatch.player1.username : updatedMatch.player2?.username
    };
    leaderboardManager.updateLeaderboard(winnerId, winnerStats);
  }

  analyticsTracker.trackTournamentEvent(tournamentId, 'match_result', {
    matchId,
    winnerId,
    round: match.round
  });

  broadcastToTournament(tournamentId, {
    event: 'match_result',
    matchId,
    winnerId,
    round: match.round,
    bracket: bracket.getBracketData()
  });

  res.json({
    success: true,
    message: 'Result submitted successfully',
    match: updatedMatch,
    bracket: bracket.getBracketData()
  });
});

// Leaderboard Routes
app.get('/api/leaderboard/:timeframe', (req, res) => {
  const { timeframe } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  
  const validTimeframes = ['all_time', 'monthly', 'weekly', 'daily'];
  if (!validTimeframes.includes(timeframe)) {
    return res.status(400).json({ error: 'Invalid timeframe' });
  }

  const leaderboard = leaderboardManager.getLeaderboard(timeframe, limit);
  
  res.json({
    success: true,
    timeframe,
    leaderboard,
    generatedAt: new Date().toISOString()
  });
});

app.get('/api/user/:userId/leaderboard-stats', authenticateToken, (req, res) => {
  const userId = req.params.userId;
  
  if (userId !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const stats = leaderboardManager.getUserStats(userId);
  
  res.json({
    success: true,
    userId,
    stats,
    globalRank: leaderboardManager.getUserRank('all_time', parseInt(userId))
  });
});

app.get('/api/tournament/:id/leaderboard', (req, res) => {
  const tournamentId = req.params.id;
  const bracket = tournamentBrackets.get(tournamentId);

  if (!bracket) {
    return res.status(404).json({ error: 'Tournament bracket not found' });
  }

  const tournamentLeaderboard = leaderboardManager.getTournamentLeaderboard(
    tournamentId,
    bracket.matches
  );

  res.json({
    success: true,
    tournamentId,
    leaderboard: tournamentLeaderboard
  });
});

// Social Features Routes
app.post('/api/teams', authenticateToken, (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Team name is required' });
  }

  const team = socialManager.createTeam(req.user._id, name, description);
  
  analyticsTracker.trackUserEngagement(req.user._id, 'team_created', { teamId: team.id });
  
  res.status(201).json({
    success: true,
    message: 'Team created successfully',
    team
  });
});

app.post('/api/teams/:teamId/invite', authenticateToken, (req, res) => {
  const { teamId } = req.params;
  const { inviteeId } = req.body;
  
  const invite = socialManager.inviteToTeam(teamId, req.user._id, inviteeId);
  
  if (!invite) {
    return res.status(400).json({ error: 'Cannot send invite' });
  }
  
  broadcastToUser(inviteeId, {
    event: 'team_invite',
    invite,
    message: `You've been invited to join ${invite.teamName}`
  });
  
  res.json({
    success: true,
    message: 'Invite sent successfully',
    invite
  });
});

app.post('/api/teams/invite/:inviteId/accept', authenticateToken, (req, res) => {
  const { inviteId } = req.params;
  
  const team = socialManager.acceptTeamInvite(inviteId, req.user._id);
  
  if (!team) {
    return res.status(400).json({ error: 'Cannot accept invite' });
  }
  
  res.json({
    success: true,
    message: 'Joined team successfully',
    team
  });
});

app.post('/api/friends/request', authenticateToken, (req, res) => {
  const { receiverId } = req.body;
  
  const request = socialManager.sendFriendRequest(req.user._id, receiverId);
  
  if (!request) {
    return res.status(400).json({ error: 'Cannot send friend request' });
  }
  
  broadcastToUser(receiverId, {
    event: 'friend_request',
    request,
    message: `You have a new friend request from ${req.user.username}`
  });
  
  res.json({
    success: true,
    message: 'Friend request sent',
    request
  });
});

app.post('/api/friends/request/:requestId/accept', authenticateToken, (req, res) => {
  const { requestId } = req.params;
  
  const request = socialManager.acceptFriendRequest(requestId, req.user._id);
  
  if (!request) {
    return res.status(400).json({ error: 'Cannot accept friend request' });
  }
  
  broadcastToUser(request.senderId, {
    event: 'friend_request_accepted',
    friend: {
      id: req.user._id,
      username: req.user.username
    },
    message: `${req.user.username} accepted your friend request`
  });
  
  res.json({ success: true, message: 'Friend request accepted' });
});

app.get('/api/social/profile', authenticateToken, (req, res) => {
  const socialData = socialManager.getUserSocialData(req.user._id);
  
  res.json({
    success: true,
    socialData
  });
});

// Tournament Chat Routes
app.post('/api/tournament/:id/chat/join', authenticateToken, (req, res) => {
  const tournamentId = req.params.id;
  
  const chatRoom = socialManager.joinTournamentChat(tournamentId, req.user._id);
  
  res.json({
    success: true,
    message: 'Joined tournament chat',
    chatRoom: {
      tournamentId: chatRoom.tournamentId,
      participants: Array.from(chatRoom.participants).length,
      messageCount: chatRoom.messages.length
    }
  });
});

app.post('/api/tournament/:id/chat/message', authenticateToken, (req, res) => {
  const tournamentId = req.params.id;
  const { message, type } = req.body;
  
  const chatMessage = socialManager.sendChatMessage(tournamentId, req.user._id, message, type);
  
  if (!chatMessage) {
    return res.status(400).json({ error: 'Cannot send message' });
  }
  
  const chatRoom = socialManager.chatRooms.get(tournamentId);
  if (chatRoom) {
    chatRoom.participants.forEach(participantId => {
      if (participantId !== req.user._id) {
        broadcastToUser(participantId, {
          event: 'chat_message',
          tournamentId,
          message: chatMessage,
          sender: req.user.username
        });
      }
    });
  }
  
  analyticsTracker.trackTournamentEvent(tournamentId, 'chat_message', {
    userId: req.user._id,
    messageLength: message.length
  });
  
  res.json({
    success: true,
    message: 'Message sent',
    chatMessage
  });
});

app.get('/api/tournament/:id/chat/history', authenticateToken, (req, res) => {
  const tournamentId = req.params.id;
  const limit = parseInt(req.query.limit) || 50;
  const before = req.query.before || null;
  
  const messages = socialManager.getChatHistory(tournamentId, limit, before);
  
  res.json({
    success: true,
    tournamentId,
    messages
  });
});

// Tournament Share Route
app.get('/api/tournament/:id/share', async (req, res) => {
  const tournamentId = req.params.id;
  const type = req.query.type || 'standard';
  
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }
  
  const shareLink = socialManager.generateShareLink(tournament, type);
  
  analyticsTracker.trackTournamentEvent(tournamentId, 'share', {
    shareType: type,
    timestamp: new Date().toISOString()
  });
  
  res.json({
    success: true,
    shareLink
  });
});

// Analytics Routes (Admin only)
app.get('/api/admin/analytics/engagement', authenticateToken, checkAdmin, (req, res) => {
  const timeframe = req.query.timeframe || '7d';
  
  const engagementReport = analyticsTracker.getEngagementReport(timeframe);
  
  res.json({
    success: true,
    report: engagementReport
  });
});

app.get('/api/admin/analytics/tournament/:id', authenticateToken, checkAdmin, (req, res) => {
  const tournamentId = req.params.id;
  
  const tournamentAnalytics = analyticsTracker.getTournamentAnalytics(tournamentId);
  
  if (!tournamentAnalytics) {
    return res.status(404).json({ error: 'No analytics data for this tournament' });
  }
  
  res.json({
    success: true,
    analytics: tournamentAnalytics
  });
});

app.get('/api/admin/analytics/revenue', authenticateToken, checkAdmin, (req, res) => {
  const timeframe = req.query.timeframe || 'monthly';
  
  const revenueReport = analyticsTracker.getRevenueReport(timeframe);
  
  res.json({
    success: true,
    report: revenueReport
  });
});

app.get('/api/admin/analytics/retention', authenticateToken, checkAdmin, (req, res) => {
  const retentionReport = analyticsTracker.getRetentionReport();
  
  res.json({
    success: true,
    report: retentionReport
  });
});

app.get('/api/admin/analytics/peak-times', authenticateToken, checkAdmin, (req, res) => {
  const peakTimeAnalysis = analyticsTracker.getPeakTimeAnalysis();
  
  res.json({
    success: true,
    analysis: peakTimeAnalysis
  });
});

// Analytics tracking middleware (applied to all routes)
app.use((req, res, next) => {
  if (req.user) {
    const action = `${req.method}_${req.path}`.replace(/[^a-zA-Z0-9]/g, '_');
    analyticsTracker.trackUserEngagement(req.user._id, action, {
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString()
    });
    
    // Track session start if not already tracking
    analyticsTracker.trackSessionStart(req.user._id, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      timestamp: new Date().toISOString()
    });
    
    // Set up session end tracking
    res.on('finish', () => {
      setTimeout(() => {
        analyticsTracker.trackSessionEnd(req.user._id);
      }, 30000);
    });
  }
  
  if (req.path.startsWith('/api/tournament/') && req.method === 'GET') {
    const tournamentId = req.path.split('/')[3];
    if (tournamentId) {
      analyticsTracker.trackTournamentEvent(tournamentId, 'view', {
        userId: req.user?._id,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  next();
});

// ==================== ERROR HANDLERS ====================
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    availableEndpoints: [
      'GET    /api/tournaments',
      'GET    /api/tournament/:id',
      'POST   /api/auth/register',
      'POST   /api/auth/login',
      'POST   /api/payment/process',
      'GET    /api/user/registrations',
      'GET    /api/user/payments',
      'GET    /api/user/stats',
      'GET    /api/leaderboard/:timeframe',
      'POST   /api/tournament/:id/generate-bracket',
      'GET    /api/tournament/:id/bracket',
      'POST   /api/teams',
      'POST   /api/friends/request',
      'GET    /api/admin/stats (admin only)',
      'GET    /api/admin/analytics/* (admin only)'
    ]
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// ==================== START SERVER ====================
server.listen(PORT, () => {
  console.log(`🚀 Skillr Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server running on ws://localhost:${PORT}`);
  console.log(`👤 User system: MongoDB Active`);
  console.log(`🎮 Tournament system: MongoDB Active`);
  console.log(`💰 Payment system ready`);
  console.log(`👑 Admin panel enabled`);
  console.log(`📊 Advanced Analytics system ready`);
  console.log(`🏆 Leaderboard system active`);
  console.log(`⚡ Real-time updates enabled`);
  console.log(`👥 Social features enabled`);
  console.log(`🏀 Tournament brackets system ready`);
  
  console.log('\n📋 Available endpoints:');
  console.log('  GET  /api/health                 - Health check');
  console.log('  GET  /api/tournaments            - All tournaments');
  console.log('  GET  /api/tournament/:id         - Single tournament');
  console.log('  POST /api/auth/register          - Register user');
  console.log('  POST /api/auth/login             - Login user');
  console.log('  POST /api/payment/process        - Process payment');
  console.log('  GET  /api/user/registrations     - Get user registrations');
  console.log('  GET  /api/leaderboard/:timeframe - Get leaderboards');
  console.log('  POST /api/tournament/:id/generate-bracket - Create bracket');
  console.log('  POST /api/teams                  - Create team');
  console.log('  POST /api/friends/request        - Send friend request');
  console.log('  GET  /api/admin/stats            - Admin dashboard stats');
  console.log('  GET  /api/admin/analytics/*      - Advanced analytics');
  
  console.log('\n🔐 Admin Credentials:');
  console.log('  Email: admin@skillr.com');
  console.log('  Password: ghana123');
  console.log('  Admin Key: Skillr2024');
  console.log('\n👤 Test User:');
  console.log('  Email: player@example.com');
  console.log('  Password: ghana123');
  
  console.log('\n🔥 Phase 6 Features:');
  console.log('  • Real-time tournament updates via WebSocket');
  console.log('  • Tournament brackets & match scheduling');
  console.log('  • Global and tournament leaderboards');
  console.log('  • Team creation & management');
  console.log('  • Friend system & invitations');
  console.log('  • Tournament chat rooms');
  console.log('  • Advanced analytics & reporting');
  console.log('  • Peak time analysis');
  console.log('  • User engagement tracking');
  
  console.log('\n🔧 Frontend URLs:');
  console.log('  Home: http://localhost:5000/index.html');
  console.log('  Login: http://localhost:5000/login.html');
  console.log('  Dashboard: http://localhost:5000/dashboard.html');
  console.log('  Admin Panel: http://localhost:5000/admin.html');
  console.log('  Leaderboards: http://localhost:5000/leaderboard.html');
  console.log('  Social: http://localhost:5000/social.html');
  console.log('  Teams: http://localhost:5000/teams.html');
  console.log('  Analytics: http://localhost:5000/analytics.html');
});