require('dotenv').config();
const socketIo = require('socket.io');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const http = require('http');
const { Buffer } = require('buffer');

const app = express();
const PORT = process.env.PORT || 3001;

// ========== ENV VALIDATION ==========
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'change_this_in_production') {
  console.error('❌ SESSION_SECRET is missing or default! Set a strong secret in .env');
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI is missing!');
  process.exit(1);
}

// ========== SECURITY MIDDLEWARE ==========
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "cdnjs.cloudflare.com", "cdn.socket.io"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://*.googleusercontent.com"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "wss:"],
      frameSrc: ["'self'", "https://www.youtube.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  }
}));

// ========== HTTPS REDIRECT (Production) ==========
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// ========== RATE LIMITING ==========
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many login attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { success: false, error: 'Too many registrations from this IP.' },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false
});

const resetQuestionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { success: false, error: 'Too many reset attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', apiLimiter);

// ========== CORS (Allowlist) ==========
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  console.warn('⚠️ ALLOWED_ORIGINS not set – CORS will block all requests.');
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'CSRF-Token', 'Authorization']
}));

// ========== SESSION CONFIG ==========
const sessionConfig = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60
  }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    domain: process.env.COOKIE_DOMAIN || undefined
  }
};
app.use(session(sessionConfig));

// ========== CSRF PROTECTION ==========
const csrfProtection = csrf({ cookie: false });

const publicEndpoints = [
  '/api/login',
  '/api/register',
  '/api/get-security-question',
  '/api/reset-password',
  '/api/csrf-token'
];

app.use((req, res, next) => {
  if (req.path.startsWith('/socket.io/')) return next();
  if (publicEndpoints.includes(req.path)) return next();
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  csrfProtection(req, res, next);
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ========== MONGODB ==========
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ========== SCHEMAS ==========
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true },
  displayName: { type: String, required: true },
  password: { type: String, required: true },
  gender: { type: String, default: 'Not specified' },
  securityQuestion: { type: String, required: true },
  securityAnswer: { type: String, required: true },
  coins: { type: Number, default: 100 },
  friends: [{ type: String, lowercase: true }],
  createdAt: { type: Date, default: Date.now },
  vipExpires: { type: Date, default: null },
  profile_pic: { type: String, default: null },
  isAdmin: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  members: [{ type: String, lowercase: true }],
  messages: [{
    id: Number,
    username: String,
    message: String,
    timestamp: String,
    type: { type: String, default: 'text' },
    profilePic: String,
    isVIP: Boolean,
    isModerator: Boolean
  }],
  activity: { type: Number, default: 0 },
  boostLevel: { type: Number, default: 0 },
  createdBy: String,
  owner: String,
  isVipRoom: { type: Boolean, default: false },
  ownerProfilePic: String,
  kicked: [{ type: String, lowercase: true }],
  membersOnly: { type: Boolean, default: false },
  allowedMembers: [{ type: String, lowercase: true }],
  moderators: [{ type: String, lowercase: true }]
});
roomSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
const Room = mongoose.model('Room', roomSchema);

const giftSchema = new mongoose.Schema({
  from: String,
  to: String,
  amount: Number,
  message: String,
  timestamp: { type: Date, default: Date.now }
});
const Gift = mongoose.model('Gift', giftSchema);

const friendRequestSchema = new mongoose.Schema({
  to: { type: String, lowercase: true, required: true },
  from: String,
  timestamp: { type: Date, default: Date.now }
});
const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema);

const privateMessageSchema = new mongoose.Schema({
  from: String,
  to: String,
  message: String,
  timestamp: String,
  type: { type: String, default: 'text' },
  isVIP: Boolean
});
const PrivateMessage = mongoose.model('PrivateMessage', privateMessageSchema);

const coinRequestSchema = new mongoose.Schema({
  username: String,
  type: String,
  amount: Number,
  date: { type: Date, default: Date.now }
});
const CoinRequest = mongoose.model('CoinRequest', coinRequestSchema);

const boostLogSchema = new mongoose.Schema({
  username: String,
  roomName: String,
  amount: Number,
  timestamp: { type: Date, default: Date.now }
});
const BoostLog = mongoose.model('BoostLog', boostLogSchema);

const manualCoinRequestSchema = new mongoose.Schema({
  username: String,
  amount: Number,
  paymentMethod: String,
  giftCardNumber: String,
  cryptoTransactionId: String,
  proof: String,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});
const ManualCoinRequest = mongoose.model('ManualCoinRequest', manualCoinRequestSchema);

const supportTicketSchema = new mongoose.Schema({
  ticketId: { type: String, required: true, unique: true, default: () => uuidv4().slice(0,8) },
  username: { type: String, required: true, lowercase: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  screenshot: { type: String, default: null },
  status: { type: String, enum: ['open', 'in-progress', 'resolved'], default: 'open' },
  adminReply: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

const notificationSchema = new mongoose.Schema({
  username: String,
  title: String,
  message: String,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const Notification = mongoose.model('Notification', notificationSchema);

// ========== HELPERS ==========
const SALT_ROUNDS = 12;
function normalizeUsername(username) { return (username || '').toLowerCase(); }

async function isAdmin(userId) {
  const user = await User.findById(userId);
  return user ? user.isAdmin === true : false;
}

async function isVIP(username) {
  const user = await User.findOne({ username: normalizeUsername(username) });
  if (!user || !user.vipExpires) return false;
  return new Date(user.vipExpires) > Date.now();
}

async function findRoomInsensitive(roomName) {
  return await Room.findOne({ name: roomName }).collation({ locale: 'en', strength: 2 });
}

const requireLogin = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  next();
};

const requireAdmin = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const user = await User.findById(req.session.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

// ========== BASE64 IMAGE VALIDATION ==========
function validateBase64Image(base64String) {
  if (!base64String || !base64String.startsWith('data:image/')) {
    throw new Error('Invalid image format');
  }
  const matches = base64String.match(/^data:image\/(\w+);base64,(.*)$/);
  if (!matches) throw new Error('Invalid base64 data');
  const mimeType = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');
  const sizeInBytes = buffer.length;
  const maxSize = 2 * 1024 * 1024;
  if (sizeInBytes > maxSize) {
    throw new Error(`Image too large: ${sizeInBytes} bytes (max ${maxSize})`);
  }
  const signatures = {
    'jpeg': [0xff, 0xd8, 0xff],
    'png': [0x89, 0x50, 0x4e, 0x47],
    'gif': [0x47, 0x49, 0x46],
  };
  const magic = buffer.subarray(0, 4);
  let valid = false;
  for (const [ext, sig] of Object.entries(signatures)) {
    if (magic.length >= sig.length && sig.every((b, i) => magic[i] === b)) {
      valid = true;
      break;
    }
  }
  if (!valid) throw new Error('Unsupported or invalid image type');
  return { mimeType, buffer, size: sizeInBytes };
}

// ========== FILE UPLOAD (SECURED) ==========
const uploadsDir = path.join(__dirname, 'uploads');
const profilePicsDir = path.join(uploadsDir, 'profiles');
const roomImagesDir = path.join(uploadsDir, 'room-images');
const voiceDir = path.join(uploadsDir, 'voice');
const proofsDir = path.join(uploadsDir, 'proofs');
const supportDir = path.join(uploadsDir, 'support');
[uploadsDir, profilePicsDir, roomImagesDir, voiceDir, proofsDir, supportDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'audio/webm', 'audio/mpeg', 'audio/ogg'];

function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '')
    .replace(/\.{2,}/g, '.')
    .toLowerCase();
}

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const profileStorage = multer.diskStorage({
  destination: profilePicsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = sanitizeFilename(path.basename(file.originalname, ext));
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});
const uploadProfile = multer({ storage: profileStorage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } });

const roomImageStorage = multer.diskStorage({
  destination: roomImagesDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = sanitizeFilename(path.basename(file.originalname, ext));
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});
const uploadRoomImage = multer({ storage: roomImageStorage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } });

const voiceStorage = multer.diskStorage({
  destination: voiceDir,
  filename: (req, file, cb) => {
    const ext = '.webm';
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  }
});
const uploadVoice = multer({ storage: voiceStorage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } });

const proofStorage = multer.diskStorage({
  destination: proofsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = sanitizeFilename(path.basename(file.originalname, ext));
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});
const uploadProof = multer({ storage: proofStorage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } });

const supportStorage = multer.diskStorage({
  destination: supportDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = sanitizeFilename(path.basename(file.originalname, ext));
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});
const uploadSupport = multer({ storage: supportStorage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } });

app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res, filePath) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'");
  }
}));

// ========== AUTH ROUTES ==========
app.post('/api/register', registerLimiter, async (req, res) => {
  try {
    const { username, password, gender, securityQuestion, securityAnswer } = req.body;
    if (!username || !password || !securityQuestion || !securityAnswer)
      return res.json({ success: false, error: 'All fields required' });
    if (username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(username))
      return res.json({ success: false, error: 'Invalid username (3-20 alphanumeric)' });
    if (password.length < 6)
      return res.json({ success: false, error: 'Password must be at least 6 characters' });

    const existing = await User.findOne({ username: normalizeUsername(username) });
    if (existing) return res.json({ success: false, error: 'Username exists' });

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const hashedAnswer = await bcrypt.hash(securityAnswer, SALT_ROUNDS);

    const user = new User({
      username: normalizeUsername(username),
      displayName: username,
      password: hashedPassword,
      gender,
      securityQuestion,
      securityAnswer: hashedAnswer,
      coins: 100
    });
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (!user) return res.json({ success: false, error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ success: false, error: 'Invalid credentials' });

    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.isAdmin = user.isAdmin;

    res.json({
      success: true,
      user: {
        username: user.username,
        coins: user.coins,
        isAdmin: user.isAdmin,
        profile_pic: user.profile_pic,
        isVIP: await isVIP(user.username),
        vipExpires: user.vipExpires
      }
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/api/csrf-token', requireLogin, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.get('/api/auto-login', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) return res.json({ success: false });
  res.json({
    success: true,
    user: {
      username: user.username,
      coins: user.coins,
      isAdmin: user.isAdmin,
      profile_pic: user.profile_pic,
      isVIP: await isVIP(user.username),
      vipExpires: user.vipExpires
    }
  });
});

// ========== PROFILE PICTURE ==========
app.post('/api/upload-profile-pic-base64', requireLogin, async (req, res) => {
  try {
    const { username, profilePicBase64 } = req.body;
    if (!profilePicBase64) return res.status(400).json({ success: false, error: 'No image data' });
    let validated;
    try {
      validated = validateBase64Image(profilePicBase64);
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    const ext = validated.mimeType;
    const filename = `${Date.now()}-${uuidv4()}.${ext}`;
    const filePath = path.join(profilePicsDir, filename);
    fs.writeFileSync(filePath, validated.buffer);
    const profilePicUrl = `/uploads/profiles/${filename}`;
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (user.profile_pic && user.profile_pic.startsWith('/uploads/')) {
      const oldPath = path.join(__dirname, user.profile_pic);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    user.profile_pic = profilePicUrl;
    await user.save();
    res.json({ success: true, profilePic: profilePicUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== FILE UPLOAD ROUTES ==========
app.post('/api/upload-room-image', requireLogin, uploadRoomImage.single('roomImage'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const url = `/uploads/room-images/${req.file.filename}`;
    res.json({ success: true, imageUrl: url });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/upload-voice', requireLogin, uploadVoice.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No audio uploaded' });
    const url = `/uploads/voice/${req.file.filename}`;
    res.json({ success: true, url });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== SECURITY QUESTION ==========
app.post('/api/get-security-question', resetQuestionLimiter, async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (!user) return res.json({ success: false, error: 'User not found' });
    res.json({ success: true, question: user.securityQuestion });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/reset-password', resetPasswordLimiter, async (req, res) => {
  try {
    const { username, answer, newPassword } = req.body;
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (!user) return res.json({ success: false, error: 'User not found' });
    const match = await bcrypt.compare(answer, user.securityAnswer);
    if (!match) return res.json({ success: false, error: 'Incorrect answer' });
    if (newPassword.length < 6) return res.json({ success: false, error: 'Password too short' });
    user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ========== USER PROFILE & FRIENDS ROUTES ==========
app.get('/api/user-profile', requireLogin, async (req, res) => {
  try {
    const { username } = req.query;
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const isFriend = user.friends.includes(req.session.username);
    res.json({
      success: true,
      profile: {
        username: user.username,
        gender: user.gender,
        coins: user.coins,
        profile_pic: user.profile_pic,
        isVIP: await isVIP(user.username),
        isFriend,
        isOnline: onlineUsers.has(user.username)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/send-gift', requireLogin, async (req, res) => {
  try {
    const { from, to, amount, message } = req.body;
    if (!to || !amount || amount < 1) return res.json({ success: false, error: 'Invalid gift data' });
    if (from !== req.session.username) return res.status(403).json({ success: false, error: 'Unauthorized' });
    const sender = await User.findOne({ username: normalizeUsername(from) });
    if (!sender || sender.coins < amount) return res.json({ success: false, error: 'Not enough coins' });
    const receiver = await User.findOne({ username: normalizeUsername(to) });
    if (!receiver) return res.json({ success: false, error: 'Receiver not found' });
    sender.coins -= amount;
    receiver.coins += amount;
    await sender.save();
    await receiver.save();
    const gift = new Gift({ from, to, amount, message });
    await gift.save();
    await CoinRequest.create({ username: from, type: 'Send Gift', amount: -amount });
    await CoinRequest.create({ username: to, type: 'Receive Gift', amount });
    io.emit('gift-received', { from, to, amount, message });
    io.emit('gift-ticker', { from, to, amount });
    const fromSocket = onlineUsers.get(normalizeUsername(from));
    if (fromSocket) io.to(fromSocket).emit('coins-updated', sender.coins);
    const toSocket = onlineUsers.get(normalizeUsername(to));
    if (toSocket) io.to(toSocket).emit('coins-updated', receiver.coins);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/get-gifts', requireLogin, async (req, res) => {
  try {
    const gifts = await Gift.find().sort({ timestamp: -1 }).limit(50);
    res.json(gifts);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.get('/api/get-friends', requireLogin, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.session.username });
    if (!user) return res.json([]);
    const friends = await User.find({ username: { $in: user.friends } });
    res.json(friends.map(f => ({
      username: f.username,
      profile_pic: f.profile_pic,
      isOnline: onlineUsers.has(f.username),
      isVIP: f.vipExpires && new Date(f.vipExpires) > Date.now()
    })));
  } catch (err) {
    res.status(500).json([]);
  }
});

app.get('/api/get-friend-requests', requireLogin, async (req, res) => {
  try {
    const requests = await FriendRequest.find({ to: req.session.username });
    res.json(requests);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.post('/api/delete-friend', requireLogin, async (req, res) => {
  try {
    const { friend } = req.body;
    const user = await User.findOne({ username: req.session.username });
    const friendUser = await User.findOne({ username: normalizeUsername(friend) });
    if (!user || !friendUser) return res.json({ success: false });
    user.friends = user.friends.filter(f => f !== normalizeUsername(friend));
    friendUser.friends = friendUser.friends.filter(f => f !== req.session.username);
    await user.save();
    await friendUser.save();
    io.emit('friend-deleted', friend);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.get('/api/get-all-users', requireLogin, async (req, res) => {
  try {
    const users = await User.find({}, { username: 1, profile_pic: 1, isAdmin: 1, coins: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json([]);
  }
});

// ========== VIP ROUTES ==========
app.post('/api/buy-vip', requireLogin, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.session.username });
    if (!user) return res.json({ success: false, error: 'User not found' });
    const cost = 5000;
    if (user.coins < cost) return res.json({ success: false, error: 'Not enough coins' });
    user.coins -= cost;
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    user.vipExpires = expiry;
    await user.save();
    await CoinRequest.create({ username: user.username, type: 'VIP Purchase', amount: -cost });
    res.json({ success: true, newCoins: user.coins, vipExpires: user.vipExpires });
    const socketId = onlineUsers.get(user.username);
    if (socketId) io.to(socketId).emit('coins-updated', user.coins);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/get-vip-status', requireLogin, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.session.username });
    if (!user) return res.json({ isVIP: false });
    const isVip = user.vipExpires && new Date(user.vipExpires) > Date.now();
    res.json({ isVIP: isVip, expires: user.vipExpires });
  } catch (err) {
    res.json({ isVIP: false });
  }
});

// ========== MANUAL COIN REQUEST ==========
app.post('/api/manual-coin-request', requireLogin, uploadProof.single('proofFile'), async (req, res) => {
  try {
    const { amount, paymentMethod, giftCardNumber, cryptoTransactionId } = req.body;
    if (!amount || amount < 100) return res.json({ success: false, error: 'Invalid amount' });
    const proof = req.file ? `/uploads/proofs/${req.file.filename}` : null;
    const request = new ManualCoinRequest({
      username: req.session.username,
      amount,
      paymentMethod,
      giftCardNumber: paymentMethod === 'giftcard' ? giftCardNumber : undefined,
      cryptoTransactionId: paymentMethod === 'crypto' ? cryptoTransactionId : undefined,
      proof
    });
    await request.save();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/get-coin-history', requireLogin, async (req, res) => {
  try {
    const history = await CoinRequest.find({ username: req.session.username }).sort({ date: -1 }).limit(100);
    res.json(history);
  } catch (err) {
    res.status(500).json([]);
  }
});

// ========== ROOM MANAGEMENT ==========
app.get('/api/get-room-members/:roomName', requireLogin, async (req, res) => {
  try {
    const room = await findRoomInsensitive(req.params.roomName);
    if (!room) return res.json([]);
    const members = await User.find({ username: { $in: room.members } });
    const membersWithVIP = await Promise.all(members.map(async (m) => ({
      username: m.username,
      profile_pic: m.profile_pic,
      isOnline: onlineUsers.has(m.username),
      isVIP: await isVIP(m.username),
      isOwner: m.username === room.owner,
      isModerator: room.moderators.includes(m.username)
    })));
    res.json(membersWithVIP);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.post('/api/kick-user', requireLogin, async (req, res) => {
  try {
    const { roomName, username } = req.body;
    const room = await findRoomInsensitive(roomName);
    if (!room) return res.json({ success: false, error: 'Room not found' });
    const user = await User.findOne({ username: req.session.username });
    if (!user) return res.json({ success: false });
    const isOwner = req.session.username === room.owner;
    const isMod = room.moderators.includes(req.session.username);
    if (!isOwner && !isMod) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (username === room.owner) return res.json({ success: false, error: 'Cannot kick owner' });
    room.members = room.members.filter(m => m !== normalizeUsername(username));
    if (!room.kicked) room.kicked = [];
    if (!room.kicked.includes(normalizeUsername(username))) room.kicked.push(normalizeUsername(username));
    await room.save();
    io.to(room.name).emit('user-left-room', { username });
    io.emit('kicked-from-room', { username, room: room.name });
    const socketId = onlineUsers.get(normalizeUsername(username));
    if (socketId) io.to(socketId).emit('kicked-from-room', { room: room.name });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/unban-user', requireLogin, async (req, res) => {
  try {
    const { roomName, username } = req.body;
    const room = await findRoomInsensitive(roomName);
    if (!room) return res.json({ success: false });
    const isOwner = req.session.username === room.owner;
    const isMod = room.moderators.includes(req.session.username);
    if (!isOwner && !isMod) return res.status(403).json({ success: false });
    if (room.kicked) room.kicked = room.kicked.filter(u => u !== normalizeUsername(username));
    await room.save();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.get('/api/room-settings/:roomName', requireLogin, async (req, res) => {
  try {
    const room = await findRoomInsensitive(req.params.roomName);
    if (!room) return res.status(404).json({ success: false });
    res.json({
      membersOnly: room.membersOnly,
      allowedMembers: room.allowedMembers,
      moderators: room.moderators,
      owner: room.owner,
      kicked: room.kicked || [],
      isOwner: req.session.username === room.owner,
      isModerator: room.moderators.includes(req.session.username)
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/api/room-settings', requireLogin, async (req, res) => {
  try {
    const { roomName, action, username } = req.body;
    const room = await findRoomInsensitive(roomName);
    if (!room) return res.json({ success: false });
    const isOwner = req.session.username === room.owner;
    const isMod = room.moderators.includes(req.session.username);
    if (!isOwner && !isMod) return res.status(403).json({ success: false });

    if (action === 'toggleMembersOnly') {
      room.membersOnly = !room.membersOnly;
      await room.save();
      io.to(room.name).emit('room-settings-updated', { room: room.name, membersOnly: room.membersOnly });
      return res.json({ success: true });
    }
    if (action === 'addMember') {
      if (!room.allowedMembers) room.allowedMembers = [];
      if (!room.allowedMembers.includes(normalizeUsername(username))) {
        room.allowedMembers.push(normalizeUsername(username));
        await room.save();
        io.emit('room-member-added', { username, roomName: room.name });
        return res.json({ success: true });
      }
    }
    if (action === 'removeMember') {
      room.allowedMembers = room.allowedMembers.filter(u => u !== normalizeUsername(username));
      await room.save();
      io.emit('room-member-removed', { username, roomName: room.name });
      return res.json({ success: true });
    }
    if (action === 'setModerator') {
      if (!isOwner) return res.status(403).json({ success: false });
      if (!room.moderators.includes(normalizeUsername(username))) {
        room.moderators.push(normalizeUsername(username));
        await room.save();
        io.to(room.name).emit('room-moderator-updated', { room: room.name, moderators: room.moderators });
        return res.json({ success: true });
      }
    }
    if (action === 'removeModerator') {
      if (!isOwner) return res.status(403).json({ success: false });
      room.moderators = room.moderators.filter(u => u !== normalizeUsername(username));
      await room.save();
      io.to(room.name).emit('room-moderator-updated', { room: room.name, moderators: room.moderators });
      return res.json({ success: true });
    }
    res.json({ success: false });
  } catch (err) {
    res.json({ success: false });
  }
});

// ========== ADMIN ROUTES ==========
app.post('/api/clear-friend-requests', requireLogin, requireAdmin, async (req, res) => {
  try {
    await FriendRequest.deleteMany({});
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post('/api/clear-coin-requests', requireLogin, requireAdmin, async (req, res) => {
  try {
    await CoinRequest.deleteMany({});
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.get('/api/get-boost-logs', requireLogin, requireAdmin, async (req, res) => {
  try {
    const logs = await BoostLog.find().sort({ timestamp: -1 }).limit(100);
    res.json(logs);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.get('/api/get-pending-manual-requests', requireLogin, requireAdmin, async (req, res) => {
  try {
    const requests = await ManualCoinRequest.find({ status: 'pending' });
    res.json(requests);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.post('/api/approve-manual-request', requireLogin, requireAdmin, async (req, res) => {
  try {
    const { requestId } = req.body;
    const request = await ManualCoinRequest.findById(requestId);
    if (!request) return res.json({ success: false });
    const user = await User.findOne({ username: request.username });
    if (!user) return res.json({ success: false });
    user.coins += request.amount;
    await user.save();
    request.status = 'approved';
    await request.save();
    await CoinRequest.create({ username: user.username, type: 'Manual Coin Purchase', amount: request.amount });
    const socketId = onlineUsers.get(user.username);
    if (socketId) io.to(socketId).emit('coins-updated', user.coins);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post('/api/reject-manual-request', requireLogin, requireAdmin, async (req, res) => {
  try {
    const { requestId } = req.body;
    const request = await ManualCoinRequest.findById(requestId);
    if (!request) return res.json({ success: false });
    request.status = 'rejected';
    await request.save();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post('/api/admin-give-coins', requireLogin, requireAdmin, async (req, res) => {
  try {
    const { username, amount } = req.body;
    if (!amount || amount < 1) return res.json({ success: false });
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (!user) return res.json({ success: false });
    user.coins += amount;
    await user.save();
    await CoinRequest.create({ username: user.username, type: 'Admin Gift', amount });
    const socketId = onlineUsers.get(user.username);
    if (socketId) io.to(socketId).emit('coins-updated', user.coins);
    io.emit('admin-gift', { username: user.username, amount });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post('/api/admin-reset-password', requireLogin, requireAdmin, async (req, res) => {
  try {
    const { username, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.json({ success: false });
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (!user) return res.json({ success: false });
    user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.get('/api/admin/get-all-users', requireLogin, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, { password: 0, securityAnswer: 0 });
    res.json(users);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.post('/api/delete-user', requireLogin, requireAdmin, async (req, res) => {
  try {
    const { username } = req.body;
    if (username === 'admin') return res.json({ success: false });
    const user = await User.findOneAndDelete({ username: normalizeUsername(username) });
    if (!user) return res.json({ success: false });
    await Room.updateMany({}, { $pull: { members: normalizeUsername(username) } });
    await Room.updateMany({}, { $pull: { kicked: normalizeUsername(username) } });
    await PrivateMessage.deleteMany({ $or: [{ from: normalizeUsername(username) }, { to: normalizeUsername(username) }] });
    await FriendRequest.deleteMany({ $or: [{ from: normalizeUsername(username) }, { to: normalizeUsername(username) }] });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.get('/api/get-all-rooms', requireLogin, requireAdmin, async (req, res) => {
  try {
    const rooms = await Room.find();
    res.json(rooms);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.delete('/api/delete-room', requireLogin, requireAdmin, async (req, res) => {
  try {
    const { roomName } = req.body;
    await Room.findOneAndDelete({ name: roomName });
    io.emit('room-deleted', roomName);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

// ========== SUPPORT ROUTES ==========
app.post('/api/support/submit', requireLogin, uploadSupport.single('screenshot'), async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !message) return res.json({ success: false, error: 'All fields required' });
    const ticket = new SupportTicket({
      username: req.session.username,
      subject,
      message,
      screenshot: req.file ? `/uploads/support/${req.file.filename}` : null
    });
    await ticket.save();
    io.emit('new-support-ticket', { username: req.session.username, subject, ticketId: ticket.ticketId });
    res.json({ success: true, ticketId: ticket.ticketId });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/support/tickets', requireLogin, requireAdmin, async (req, res) => {
  try {
    const tickets = await SupportTicket.find().sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.post('/api/support/reply', requireLogin, requireAdmin, async (req, res) => {
  try {
    const { ticketId, reply } = req.body;
    if (!reply) return res.json({ success: false });
    const ticket = await SupportTicket.findOne({ ticketId });
    if (!ticket) return res.json({ success: false });
    ticket.adminReply = reply;
    ticket.status = 'in-progress';
    ticket.updatedAt = new Date();
    await ticket.save();
    io.emit('support-reply', { ticketId: ticket.ticketId, reply, username: ticket.username });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post('/api/support/resolve', requireLogin, requireAdmin, async (req, res) => {
  try {
    const { ticketId } = req.body;
    const ticket = await SupportTicket.findOne({ ticketId });
    if (!ticket) return res.json({ success: false });
    ticket.status = 'resolved';
    ticket.updatedAt = new Date();
    await ticket.save();
    io.emit('support-resolved', { ticketId: ticket.ticketId, username: ticket.username });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

// ========== SOCKET.IO ==========
const onlineUsers = new Map();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
  maxHttpBufferSize: 1e6,
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  path: '/socket.io/'
});

io.use((socket, next) => {
  session(sessionConfig)(socket.request, {}, (err) => {
    if (err) return next(err);
    const session = socket.request.session;
    if (!session || !session.userId) {
      return next(new Error('Unauthorized'));
    }
    User.findById(session.userId).then(user => {
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      next();
    }).catch(next);
  });
});

const socketRateLimits = new Map();

io.on('connection', (socket) => {
  const username = socket.user.username;
  socket.username = username;
  onlineUsers.set(username, socket.id);
  socket.emit('online-users', Array.from(onlineUsers.keys()));
  io.emit('online-users', Array.from(onlineUsers.keys()));

  const limitSocket = (event, handler) => {
    socket.use(([eventName, ...args], next) => {
      if (eventName !== event) return next();
      const key = `${socket.user._id}:${eventName}`;
      const now = Date.now();
      const last = socketRateLimits.get(key) || 0;
      if (now - last < 100) {
        socket.emit('error', 'Rate limit exceeded');
        return;
      }
      socketRateLimits.set(key, now);
      next();
    });
    socket.on(event, handler);
  };

  socket.on('get-room-list', async () => {
    const rooms = await Room.find({}, { name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1 });
    socket.emit('room-list', rooms.map(r => ({
      name: r.name,
      members: r.members.length,
      boostLevel: r.boostLevel,
      isVipRoom: r.isVipRoom,
      membersOnly: r.membersOnly
    })));
  });

  socket.on('create-room', async (data) => {
    const { roomName, isVipRoom } = data;
    if (!roomName || roomName.length < 3 || roomName.length > 30) {
      return socket.emit('error', 'Invalid room name');
    }
    const existing = await findRoomInsensitive(roomName);
    if (existing) return socket.emit('error', 'Room exists');
    const user = await User.findById(socket.user._id);
    if (!user || user.coins < 1500) return socket.emit('error', 'Not enough coins');
    user.coins -= 1500;
    await user.save();
    await CoinRequest.create({ username: user.username, type: 'Create Room', amount: -1500 });
    const newRoom = new Room({
      name: roomName,
      members: [user.username],
      messages: [],
      boostLevel: 0,
      createdBy: user.username,
      owner: user.username,
      isVipRoom: isVipRoom || false,
      ownerProfilePic: user.profile_pic,
      kicked: [],
      membersOnly: false,
      allowedMembers: [],
      moderators: []
    });
    await newRoom.save();
    socket.emit('room-created-success', roomName);
    socket.emit('coins-updated', user.coins);
    const rooms = await Room.find({}, { name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1 });
    io.emit('room-list', rooms.map(r => ({
      name: r.name,
      members: r.members.length,
      boostLevel: r.boostLevel,
      isVipRoom: r.isVipRoom,
      membersOnly: r.membersOnly
    })));
  });

  socket.on('join-room', async (roomName) => {
    if (!roomName) return;
    let room = await findRoomInsensitive(roomName);
    if (!room) return socket.emit('room-not-found', roomName);
    if (room.kicked && room.kicked.includes(username)) {
      return socket.emit('room-join-denied', 'You are banned');
    }
    const isExistingMember = room.members.includes(username);
    if (room.membersOnly && !isExistingMember) {
      const isAllowed = room.allowedMembers.includes(username) ||
                        room.owner === username ||
                        room.moderators.includes(username);
      if (!isAllowed) {
        return socket.emit('room-join-denied', 'Members-only room. Ask owner or moderator to add you.');
      }
    }
    if (socket.currentRoom) socket.leave(socket.currentRoom);
    socket.join(room.name);
    socket.currentRoom = room.name;
    if (!room.members.includes(username)) room.members.push(username);
    room.activity++;
    await room.save();
    const vipMap = {};
    for (const m of room.members) vipMap[m] = await isVIP(m);
    socket.emit('room-joined', {
      room: room.name,
      messages: [],
      members: room.members,
      boostLevel: room.boostLevel,
      owner: room.owner,
      isVipRoom: room.isVipRoom,
      ownerProfilePic: room.ownerProfilePic,
      vipMap,
      moderators: room.moderators,
      membersOnly: room.membersOnly
    });
    socket.to(room.name).emit('user-joined-room', { username });
    const rooms = await Room.find({}, { name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1 });
    io.emit('room-list', rooms.map(r => ({
      name: r.name,
      members: r.members.length,
      boostLevel: r.boostLevel,
      isVipRoom: r.isVipRoom,
      membersOnly: r.membersOnly
    })));
  });

  socket.on('leave-room', async () => {
    if (socket.currentRoom) {
      const room = await findRoomInsensitive(socket.currentRoom);
      if (room) {
        room.members = room.members.filter(m => m !== username);
        await room.save();
        socket.to(room.name).emit('user-left-room', { username });
      }
      socket.leave(socket.currentRoom);
      socket.currentRoom = null;
      const rooms = await Room.find({}, { name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1 });
      io.emit('room-list', rooms.map(r => ({
        name: r.name,
        members: r.members.length,
        boostLevel: r.boostLevel,
        isVipRoom: r.isVipRoom,
        membersOnly: r.membersOnly
      })));
    }
  });

  socket.on('room-message', async (data) => {
    if (socket.user.username !== data.username) {
      socket.emit('error', 'Unauthorized');
      return;
    }
    if (!data.message || data.message.length > 5000) {
      socket.emit('error', 'Message too long or empty');
      return;
    }
    const room = await findRoomInsensitive(data.room);
    if (!room) return;
    if (!room.members.includes(data.username)) {
      socket.emit('error', 'Not in room');
      return;
    }
    const user = await User.findOne({ username: normalizeUsername(data.username) });
    const msg = {
      id: Date.now(),
      username: data.username,
      message: data.message,
      timestamp: new Date().toLocaleTimeString(),
      type: data.type || 'text',
      profilePic: user?.profile_pic,
      isVIP: await isVIP(data.username),
      isModerator: room.moderators.includes(data.username)
    };
    room.messages.push(msg);
    room.activity++;
    await room.save();
    io.to(room.name).emit('new-room-message', msg);
  });

  socket.on('private-message', async (data) => {
    if (socket.user.username !== data.from) {
      socket.emit('error', 'Unauthorized');
      return;
    }
    if (!data.message || data.message.length > 5000) {
      socket.emit('error', 'Message too long');
      return;
    }
    const toNorm = normalizeUsername(data.to);
    const fromNorm = normalizeUsername(data.from);
    const msg = {
      from: data.from,
      to: data.to,
      message: data.message,
      timestamp: new Date().toLocaleTimeString(),
      type: data.type || 'text',
      isVIP: await isVIP(fromNorm)
    };
    await PrivateMessage.create(msg);
    const toSocket = onlineUsers.get(toNorm);
    if (toSocket) io.to(toSocket).emit('new-private-message', msg);
    const fromSocket = onlineUsers.get(fromNorm);
    if (fromSocket) io.to(fromSocket).emit('private-message-sent', msg);
  });

  socket.on('boost-room', async (data) => {
    const { roomName, amount } = data;
    if (!amount || amount < 100) return socket.emit('error', 'Invalid boost amount');
    const room = await findRoomInsensitive(roomName);
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (room && user && user.coins >= amount) {
      user.coins -= amount;
      await user.save();
      await CoinRequest.create({ username: user.username, type: 'Room Boost', amount: -amount });
      room.boostLevel = (room.boostLevel || 0) + amount;
      await room.save();
      await BoostLog.create({ username, roomName: room.name, amount });
      io.to(room.name).emit('room-boosted', { boostedBy: username, amount, boostLevel: room.boostLevel });
      const socketId = onlineUsers.get(normalizeUsername(username));
      if (socketId) io.to(socketId).emit('coins-updated', user.coins);
      const rooms = await Room.find({}, { name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1 });
      io.emit('room-list', rooms.map(r => ({
        name: r.name,
        members: r.members.length,
        boostLevel: r.boostLevel,
        isVipRoom: r.isVipRoom,
        membersOnly: r.membersOnly
      })));
    } else {
      socket.emit('error', 'Boost failed: not enough coins or room missing');
    }
  });

  socket.on('send-friend-request-socket', async (data) => {
    if (socket.user.username !== data.from) {
      socket.emit('error', 'Unauthorized');
      return;
    }
    const to = normalizeUsername(data.to);
    if (to === normalizeUsername(data.from)) return socket.emit('error', 'Cannot friend yourself');
    const existing = await FriendRequest.findOne({ to, from: data.from });
    if (existing) return socket.emit('error', 'Request already sent');
    const friendReq = new FriendRequest({ to, from: data.from });
    await friendReq.save();
    const toSocket = onlineUsers.get(to);
    if (toSocket) io.to(toSocket).emit('friend-request-received', { from: data.from });
    socket.emit('friend-request-sent', { to: data.to });
  });

  socket.on('accept-friend-request-socket', async (data) => {
    if (socket.user.username !== data.username) {
      socket.emit('error', 'Unauthorized');
      return;
    }
    const from = normalizeUsername(data.from);
    const to = normalizeUsername(data.username);
    await FriendRequest.findOneAndDelete({ from, to });
    const user = await User.findOne({ username: to });
    const friendUser = await User.findOne({ username: from });
    if (!user || !friendUser) return;
    if (!user.friends.includes(from)) user.friends.push(from);
    if (!friendUser.friends.includes(to)) friendUser.friends.push(to);
    await user.save();
    await friendUser.save();
    io.emit('friend-request-accepted', { from: data.from, to: data.username });
    const fromSocket = onlineUsers.get(from);
    if (fromSocket) io.to(fromSocket).emit('friends-updated');
    const toSocket = onlineUsers.get(to);
    if (toSocket) io.to(toSocket).emit('friends-updated');
  });

  socket.on('typing', (data) => {
    if (socket.user.username !== data.username) return;
    socket.to(data.room).emit('user-typing', { room: data.room, username: data.username });
  });
  socket.on('stop-typing', (data) => {
    if (socket.user.username !== data.username) return;
    socket.to(data.room).emit('user-stop-typing', { room: data.room, username: data.username });
  });
  socket.on('private-typing', (data) => {
    if (socket.user.username !== data.from) return;
    const toSocket = onlineUsers.get(normalizeUsername(data.to));
    if (toSocket) io.to(toSocket).emit('private-user-typing', { from: data.from });
  });
  socket.on('private-stop-typing', (data) => {
    if (socket.user.username !== data.from) return;
    const toSocket = onlineUsers.get(normalizeUsername(data.to));
    if (toSocket) io.to(toSocket).emit('private-user-stop-typing', { from: data.from });
  });

  // WebRTC signaling
  socket.on('call-user', (data) => {
    const toSocket = onlineUsers.get(normalizeUsername(data.to));
    if (toSocket) {
      io.to(toSocket).emit('incoming-call', {
        from: data.from,
        offer: data.offer
      });
    }
  });
  socket.on('call-accepted', (data) => {
    const toSocket = onlineUsers.get(normalizeUsername(data.to));
    if (toSocket) {
      io.to(toSocket).emit('call-accepted', {
        from: data.from,
        answer: data.answer
      });
    }
  });
  socket.on('call-rejected', (data) => {
    const toSocket = onlineUsers.get(normalizeUsername(data.to));
    if (toSocket) {
      io.to(toSocket).emit('call-rejected', { from: data.from });
    }
  });
  socket.on('end-call', (data) => {
    const toSocket = onlineUsers.get(normalizeUsername(data.to));
    if (toSocket) {
      io.to(toSocket).emit('end-call', { from: data.from });
    }
  });
  socket.on('ice-candidate', (data) => {
    const toSocket = onlineUsers.get(normalizeUsername(data.to));
    if (toSocket) {
      io.to(toSocket).emit('ice-candidate', {
        from: data.from,
        candidate: data.candidate
      });
    }
  });

  // YouTube sync
  socket.on('sync-youtube', (data) => {
    if (socket.user.username !== data.by) return;
    const room = data.room;
    const videoId = data.videoId;
    io.to(room).emit('sync-youtube', { room, videoId, by: data.by });
  });

  socket.on('disconnect', () => {
    if (username) {
      onlineUsers.delete(username);
      io.emit('online-users', Array.from(onlineUsers.keys()));
    }
  });
});

// ========== CRON ==========
cron.schedule('0 0 1 * *', async () => {
  console.log('🔄 Running monthly boost reset...');
  try {
    const result = await Room.updateMany({}, { $set: { boostLevel: 0 } });
    console.log(`✅ Reset boostLevel for ${result.modifiedCount} rooms.`);
    io.emit('boost-reset', { message: 'All room boosts have been reset for the new month.' });
    const rooms = await Room.find({}, { name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1 });
    io.emit('room-list', rooms.map(r => ({
      name: r.name,
      members: r.members.length,
      boostLevel: r.boostLevel,
      isVipRoom: r.isVipRoom,
      membersOnly: r.membersOnly
    })));
  } catch (err) {
    console.error('Error during monthly boost reset:', err);
  }
});

// ========== START ==========
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  const adminExists = await User.findOne({ username: 'admin' });
  if (!adminExists) {
    const hashed = await bcrypt.hash('admin123', SALT_ROUNDS);
    await User.create({
      username: 'admin',
      displayName: 'admin',
      password: hashed,
      gender: 'Other',
      securityQuestion: 'default',
      securityAnswer: await bcrypt.hash('default', SALT_ROUNDS),
      coins: 999999,
      isAdmin: true
    });
    console.log('👑 Admin user created: admin / admin123');
  }
});
