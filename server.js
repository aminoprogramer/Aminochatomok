require('dotenv').config();

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const https = require('https');
const crypto = require('crypto');
const compression = require('compression');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();

// ============================================================
// ========== HTTP SERVER =====================================
// ============================================================
const server = http.createServer({
    keepAlive: true,
    keepAliveInitialDelay: 300000
}, app);

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 60000;

// ============================================================
// ========== SOCKET.IO =======================================
// ============================================================
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
    maxHttpBufferSize: 1e6,
    pingTimeout: 25000,
    pingInterval: 25000,
    transports: ['websocket'],
    allowEIO3: true,
    path: '/socket.io/',
    perMessageDeflate: false,
    httpCompression: false
});

const onlineUsers = new Map();

// ============================================================
// ========== SECURITY MIDDLEWARE =============================
// ============================================================
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS", "DELETE"], credentials: true }));

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            mediaSrc: ["'self'", "blob:", "data:"],
            connectSrc: ["'self'", "wss:", "https:", "ws:"],
            frameSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
            fontSrc: ["'self'", "data:"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.path.startsWith('/socket.io')) return false;
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname, { maxAge: '7d', etag: true }));

app.use((req, res, next) => {
    if (req.method === 'POST' || req.url.includes('/api/')) {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    }
    next();
});

// ============================================================
// ========== PRICING CONFIG ==================================
// ============================================================
const PRICING = {
    VIP_COST: 20000,
    CREATE_ROOM_COST: 9000,
    ALLOWED_BOOST_AMOUNTS: [1500, 6000, 54000]
};

// ============================================================
// ========== SECURITY HELPERS ================================
// ============================================================
async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
    if (!hash || typeof hash !== 'string') return false;
    if (!hash.startsWith('$2')) {
        // Legacy plaintext — trigger migration on success
        return password === hash;
    }
    try {
        return await bcrypt.compare(password, hash);
    } catch (_) {
        return false;
    }
}

function isHashed(hash) {
    return hash && typeof hash === 'string' && hash.startsWith('$2');
}

function sanitizeString(str, maxLen = 500) {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, maxLen);
}

function isValidRoomName(name) {
    return /^[\w\s\u0600-\u06FF\-]{1,50}$/.test(name);
}

function isValidUsername(name) {
    return /^[a-zA-Z0-9_\u0600-\u06FF]{3,20}$/.test(name);
}

// ============================================================
// ========== MULTER SETUP ====================================
// ============================================================
const uploadsDir = path.join(__dirname, 'uploads');
const profilePicsDir = path.join(uploadsDir, 'profiles');
const roomImagesDir = path.join(uploadsDir, 'room-images');
const voiceDir = path.join(uploadsDir, 'voice');
const proofsDir = path.join(uploadsDir, 'proofs');
const supportDir = path.join(uploadsDir, 'support');
[uploadsDir, profilePicsDir, roomImagesDir, voiceDir, proofsDir, supportDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav'];

function imageFilter(req, file, cb) {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only images allowed'));
}
function audioFilter(req, file, cb) {
    if (ALLOWED_AUDIO_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only audio allowed'));
}

const profileStorage = multer.diskStorage({
    destination: profilePicsDir,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + uuidv4().slice(0, 8) + path.extname(file.originalname).toLowerCase())
});
const uploadProfile = multer({
    storage: profileStorage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: imageFilter
});

const roomImageStorage = multer.diskStorage({
    destination: roomImagesDir,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + uuidv4() + path.extname(file.originalname).toLowerCase())
});
const uploadRoomImage = multer({
    storage: roomImageStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: imageFilter
});

const voiceStorage = multer.diskStorage({
    destination: voiceDir,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + uuidv4() + '.webm')
});
const uploadVoice = multer({
    storage: voiceStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: audioFilter
});

const proofStorage = multer.diskStorage({
    destination: proofsDir,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + uuidv4() + path.extname(file.originalname).toLowerCase())
});
const uploadProof = multer({
    storage: proofStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: imageFilter
});

const supportStorage = multer.diskStorage({
    destination: supportDir,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + uuidv4() + path.extname(file.originalname).toLowerCase())
});
const uploadSupport = multer({
    storage: supportStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: imageFilter
});

app.use('/uploads', express.static(uploadsDir, { maxAge: '30d', immutable: true }));

// ============================================================
// ========== TELEGRAM NOTIFICATIONS ==========================
// ============================================================
function tgEscape(s) {
    return String(s ?? '').replace(/[&<>]/g, c => c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c);
}
function tgTruncate(s, n = 400) {
    const str = String(s ?? '');
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
}
function sendTelegramNotification(text) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!botToken || !chatId) return;
    const payload = JSON.stringify({
        chat_id: chatId, text,
        parse_mode: 'HTML', disable_web_page_preview: true
    });
    try {
        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${botToken}/sendMessage`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                if (res.statusCode !== 200) console.error('📨 Telegram failed:', res.statusCode);
            });
        });
        req.on('error', err => console.error('📨 Telegram error:', err.message));
        req.write(payload);
        req.end();
    } catch (err) { console.error('📨 Telegram exception:', err.message); }
}

function tgNotifyNewUser(username) {
    sendTelegramNotification(`🆕 <b>New user</b>\n👤 <code>${tgEscape(username)}</code>`);
}
function tgNotifySupportTicket({ ticketId, username, subject, message, screenshot }) {
    sendTelegramNotification(
        `📬 <b>Support ticket</b>\n🎫 <code>${tgEscape(ticketId)}</code>\n👤 <code>${tgEscape(username)}</code>\n📝 <b>${tgEscape(subject)}</b>\n💬 ${tgEscape(tgTruncate(message, 400))}` +
        (screenshot ? `\n🖼 <a href="${tgEscape(screenshot)}">Screenshot</a>` : '')
    );
}
function tgNotifyManualCoinRequest({ username, amount, method, giftCardNumber, cryptoTransactionId, proof }) {
    let extra = '';
    if (method === 'giftcard' && giftCardNumber) extra = `\n🎁 Card: <code>${tgEscape(giftCardNumber)}</code>`;
    if (method === 'crypto' && cryptoTransactionId) extra = `\n🔗 TX: <code>${tgEscape(cryptoTransactionId)}</code>`;
    sendTelegramNotification(
        `💰 <b>Manual coin request</b>\n👤 <code>${tgEscape(username)}</code>\n💵 <b>${tgEscape(amount)} coins</b>\n📦 ${tgEscape(method)}${extra}` +
        (proof ? `\n📎 <a href="${tgEscape(proof)}">Proof</a>` : '')
    );
}
function tgNotifyCryptoPurchase({ username, coins, priceUsd, orderId, payAmount, payCurrency }) {
    sendTelegramNotification(
        `💎 <b>Crypto payment</b>\n👤 <code>${tgEscape(username)}</code>\n🪙 +${tgEscape(coins)} coins\n💵 $${tgEscape(priceUsd)}` +
        (payAmount ? ` (${tgEscape(payAmount)} ${tgEscape(payCurrency || '')})` : '') +
        `\n🧾 <code>${tgEscape(orderId)}</code>`
    );
}
function tgNotifyPayoutCreated({ username, dollars, monthLabel, targetAmount }) {
    sendTelegramNotification(
        `🏆 <b>Payout created</b>\n👤 <code>${tgEscape(username)}</code>\n📅 ${tgEscape(monthLabel)}\n🎯 ${tgEscape(Number(targetAmount || 0).toLocaleString())}\n💵 <b>$${tgEscape(dollars)}</b>`
    );
}
function tgNotifyPayoutPaid({ username, dollars, month, adminUsername }) {
    sendTelegramNotification(
        `✅ <b>Payout paid</b>\n👤 <code>${tgEscape(username)}</code>\n📅 ${tgEscape(month)}\n💵 $${tgEscape(dollars)}\n👑 <code>${tgEscape(adminUsername)}</code>`
    );
}
function tgNotifyBigWin({ username, game, bet, payout, profit }) {
    sendTelegramNotification(
        `🎰 <b>Big win!</b>\n👤 <code>${tgEscape(username)}</code>\n🎮 ${tgEscape(game)}\n💵 Bet: ${tgEscape(bet)}\n💰 Payout: ${tgEscape(payout)} (+${tgEscape(profit)})`
    );
}

// ============================================================
// ========== MONGODB =========================================
// ============================================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mokalmat';

mongoose.connect(MONGODB_URI, {
    maxPoolSize: 20,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    compressors: ['zlib'],
    retryWrites: true
})
.then(async () => {
    console.log('✅ MongoDB connected');
    const adminExists = await User.findOne({ username: 'admin' }).lean();
    if (!adminExists) {
        const adminCode = await generatePrivateCode();
        const adminPass = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
        await User.create({
            username: 'admin',
            displayName: 'admin',
            password: await hashPassword(adminPass),
            gender: 'Other',
            securityQuestion: 'default',
            securityAnswer: await hashPassword('default'),
            coins: 999999,
            isAdmin: true,
            privateCode: adminCode
        });
        console.log(`👑 Admin created: admin / ${adminPass}`);
        console.log('⚠️  CHANGE THE ADMIN PASSWORD IMMEDIATELY!');
    }
})
.catch(err => console.error('❌ MongoDB error:', err.message));

// ============================================================
// ========== SCHEMAS =========================================
// ============================================================
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
    isAdmin: { type: Boolean, default: false },
    monthlyTarget: { type: Number, default: 0 },
    totalTargetEarned: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    monthlyLoginDays: { type: [Number], default: [] },
    lastLoginDate: { type: Date, default: null },
    privateCode: { type: String, unique: true, sparse: true, index: true }
});
userSchema.index({ vipExpires: 1 });
userSchema.index({ monthlyTarget: -1 });
userSchema.index({ coins: -1 });
const User = mongoose.model('User', userSchema);

const roomSchema = new mongoose.Schema({
    name: { type: String, required: true },
    members: [{ type: String, lowercase: true }],
    messages: [{
        id: Number, username: String, message: String, timestamp: String,
        type: { type: String, default: 'text' },
        profilePic: String, isVIP: Boolean, isModerator: Boolean
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
roomSchema.index({ boostLevel: -1 });
roomSchema.index({ members: 1 });
const Room = mongoose.model('Room', roomSchema);

const giftSchema = new mongoose.Schema({
    from: String, to: String, amount: Number, message: String,
    targetContribution: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now }
});
giftSchema.index({ from: 1, timestamp: -1 });
giftSchema.index({ to: 1, timestamp: -1 });
const Gift = mongoose.model('Gift', giftSchema);

const friendRequestSchema = new mongoose.Schema({
    to: { type: String, lowercase: true, required: true },
    from: String,
    timestamp: { type: Date, default: Date.now }
});
friendRequestSchema.index({ to: 1 });
const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema);

const privateMessageSchema = new mongoose.Schema({
    from: String, to: String, message: String, timestamp: String,
    type: { type: String, default: 'text' },
    isVIP: Boolean
});
privateMessageSchema.index({ from: 1, to: 1, timestamp: -1 });
const PrivateMessage = mongoose.model('PrivateMessage', privateMessageSchema);

const coinRequestSchema = new mongoose.Schema({
    username: String, type: String, amount: Number,
    date: { type: Date, default: Date.now }
});
coinRequestSchema.index({ username: 1, date: -1 });
const CoinRequest = mongoose.model('CoinRequest', coinRequestSchema);

const boostLogSchema = new mongoose.Schema({
    username: String, roomName: String, amount: Number,
    timestamp: { type: Date, default: Date.now }
});
boostLogSchema.index({ timestamp: -1 });
const BoostLog = mongoose.model('BoostLog', boostLogSchema);

const manualCoinRequestSchema = new mongoose.Schema({
    username: String, amount: Number, paymentMethod: String,
    giftCardNumber: String, cryptoTransactionId: String, proof: String,
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});
manualCoinRequestSchema.index({ status: 1 });
const ManualCoinRequest = mongoose.model('ManualCoinRequest', manualCoinRequestSchema);

// ⭐ SECURITY: Unique + auto-expiring tokens
const paymentTransactionSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, index: true },
    expires: { type: Number, required: true, index: true },
    createdAt: { type: Date, default: Date.now }
});
const PaymentTransaction = mongoose.model('PaymentTransaction', paymentTransactionSchema);

const supportTicketSchema = new mongoose.Schema({
    ticketId: { type: String, required: true, unique: true, default: () => uuidv4().slice(0, 8) },
    username: { type: String, required: true, lowercase: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    screenshot: { type: String, default: null },
    status: { type: String, enum: ['open', 'in-progress', 'resolved'], default: 'open' },
    adminReply: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
supportTicketSchema.index({ status: 1, createdAt: -1 });
const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

const notificationSchema = new mongoose.Schema({
    username: { type: String, lowercase: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, default: null },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
notificationSchema.index({ username: 1, read: 1, createdAt: -1 });
const Notification = mongoose.model('Notification', notificationSchema);

const payoutSchema = new mongoose.Schema({
    username: { type: String, lowercase: true, required: true },
    targetAmount: Number, dollarsEarned: Number, month: String,
    status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    paidAt: Date
});
payoutSchema.index({ username: 1, createdAt: -1 });
payoutSchema.index({ status: 1 });
const Payout = mongoose.model('Payout', payoutSchema);

const gameLogSchema = new mongoose.Schema({
    username: { type: String, lowercase: true, required: true, index: true },
    game: { type: String, required: true },
    bet: { type: Number, required: true },
    choice: { type: mongoose.Schema.Types.Mixed, default: null },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    payout: { type: Number, required: true },
    profit: { type: Number, required: true },
    win: { type: Boolean, required: true },
    createdAt: { type: Date, default: Date.now, index: true }
});
gameLogSchema.index({ username: 1, createdAt: -1 });
const GameLog = mongoose.model('GameLog', gameLogSchema);

const cryptoPaymentSchema = new mongoose.Schema({
    orderId: { type: String, unique: true, required: true, index: true },
    username: { type: String, lowercase: true, required: true },
    coins: { type: Number, required: true },
    priceUsd: { type: Number, required: true },
    paymentId: { type: String, default: null },
    payAddress: { type: String, default: null },
    payAmount: { type: Number, default: null },
    payCurrency: { type: String, default: null },
    status: { type: String, default: 'waiting' },
    credited: { type: Boolean, default: false },
    invoiceUrl: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const CryptoPayment = mongoose.model('CryptoPayment', cryptoPaymentSchema);

const COIN_PACKAGES = {
    '1500': { coins: 1500, priceUsd: 1 },
    '9000': { coins: 9000, priceUsd: 6 },
    '54000': { coins: 54000, priceUsd: 36 }
};

const GAME_CONFIG = {
    minBet: 50, maxBet: 5000, vipMaxBet: 20000,
    bigWinThreshold: 10000, houseEdge: 0.04
};

// ============================================================
// ========== PROFILE CACHE ===================================
// ============================================================
const profileCache = new Map();
const PROFILE_CACHE_TTL = 60000;

function getCachedProfile(username) {
    const cached = profileCache.get(username);
    if (cached && Date.now() - cached.time < PROFILE_CACHE_TTL) return cached.data;
    return null;
}
function setCachedProfile(username, data) {
    profileCache.set(username, { data, time: Date.now() });
    if (profileCache.size > 500) {
        const now = Date.now();
        for (const [k, v] of profileCache) {
            if (now - v.time > PROFILE_CACHE_TTL) profileCache.delete(k);
        }
    }
}
function clearProfileCache(username) {
    if (username) profileCache.delete(normalizeUsername(username));
    else profileCache.clear();
}

// ============================================================
// ========== HELPERS =========================================
// ============================================================
function normalizeUsername(username) { return (username || '').toLowerCase(); }

async function isAdmin(username) {
    const norm = normalizeUsername(username);
    if (!norm) return false;
    const user = await User.findOne({ username: norm }, 'isAdmin').lean();
    return !!user && user.isAdmin === true;
}

async function isVIP(username) {
    const user = await User.findOne({ username: normalizeUsername(username) }, 'vipExpires').lean();
    if (!user || !user.vipExpires) return false;
    return new Date(user.vipExpires) > Date.now();
}

function generateToken() {
    return uuidv4() + '-' + crypto.randomBytes(16).toString('hex');
}

async function generatePrivateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code, exists = true, attempts = 0;
    while (exists && attempts < 20) {
        code = '';
        for (let i = 0; i < 10; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        code = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 10)}`;
        exists = await User.findOne({ privateCode: code }, '_id').lean();
        attempts++;
    }
    return code;
}

async function findRoomInsensitive(roomName) {
    return await Room.findOne({ name: roomName }).collation({ locale: 'en', strength: 2 });
}

function calculatePayout(target) {
    return Math.floor((target || 0) / 50000) * 25;
}

async function updateLoginStreak(user) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfMonth = today.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let changed = false;

    if (!user.lastLoginDate) {
        user.monthlyLoginDays = [dayOfMonth];
        user.lastLoginDate = today;
        changed = true;
    } else {
        const last = new Date(user.lastLoginDate);
        const lastDate = new Date(last.getFullYear(), last.getMonth(), last.getDate());
        const sameDay = lastDate.getTime() === today.getTime();
        if (!sameDay) {
            if (last.getMonth() !== currentMonth || last.getFullYear() !== currentYear) {
                user.monthlyLoginDays = [];
            }
            if (!user.monthlyLoginDays.includes(dayOfMonth)) {
                user.monthlyLoginDays.push(dayOfMonth);
            }
            user.lastLoginDate = today;
            changed = true;
        }
    }

    const streak = user.monthlyLoginDays.length;
    let payoutCreated = false, payoutInfo = null, targetNotReached = false;

    if (streak >= 10) {
        const currentTarget = user.monthlyTarget || 0;
        const MIN_TARGET = 50000;
        if (currentTarget >= MIN_TARGET) {
            const dollars = calculatePayout(currentTarget);
            const monthLabel = now.toISOString().slice(0, 7);
            await Payout.create({
                username: user.username, targetAmount: currentTarget,
                dollarsEarned: dollars, month: monthLabel, status: 'pending'
            });
            tgNotifyPayoutCreated({ username: user.username, dollars, monthLabel, targetAmount: currentTarget });
            payoutInfo = { dollars, monthLabel, targetAmount: currentTarget };
            payoutCreated = true;
            user.monthlyTarget = 0;
            user.monthlyLoginDays = [];
        } else {
            targetNotReached = true;
        }
        changed = true;
    }

    if (changed) await user.save();
    clearProfileCache(user.username);

    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysUntilMonthEnd = Math.ceil((endOfMonth - today) / (1000 * 60 * 60 * 24));

    return {
        streak, daysLeft: Math.max(0, 10 - streak),
        currentTarget: user.monthlyTarget || 0,
        payoutCreated, payoutInfo, targetNotReached,
        minTarget: 50000, daysUntilMonthEnd
    };
}

function httpsJsonRequest(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                let parsed = data;
                try { parsed = JSON.parse(data); } catch (_) { }
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function rollCoinflip(choice) {
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const win = choice === result;
    const multiplier = win ? (2 - GAME_CONFIG.houseEdge) : 0;
    return { result, win, multiplier };
}
function rollDice(choice) {
    const n = Number(choice);
    const roll = Math.floor(Math.random() * 6) + 1;
    const win = n === roll;
    const multiplier = win ? 5 : 0;
    return { result: roll, win, multiplier };
}
function spinSlot() {
    const symbols = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'];
    const r1 = symbols[Math.floor(Math.random() * symbols.length)];
    const r2 = symbols[Math.floor(Math.random() * symbols.length)];
    const r3 = symbols[Math.floor(Math.random() * symbols.length)];
    let multiplier = 0, matchType = 0;
    if (r1 === r2 && r2 === r3) {
        matchType = 3;
        multiplier = (r1 === '💎' || r1 === '7️⃣') ? 20 : 10;
    } else if (r1 === r2 || r2 === r3 || r1 === r3) {
        matchType = 2; multiplier = 2;
    }
    return { result: [r1, r2, r3], win: multiplier > 0, multiplier, matchType };
}
function spinWheel() {
    const outcomes = [
        { mult: 0, weight: 30 }, { mult: 0.5, weight: 20 },
        { mult: 1, weight: 25 }, { mult: 2, weight: 15 },
        { mult: 5, weight: 7 }, { mult: 10, weight: 3 }
    ];
    const total = outcomes.reduce((s, o) => s + o.weight, 0);
    let r = Math.random() * total, picked = outcomes[0];
    for (const o of outcomes) {
        if (r < o.weight) { picked = o; break; }
        r -= o.weight;
    }
    return { result: picked.mult, win: picked.mult > 1, multiplier: picked.mult };
}

// ============================================================
// ========== AUTH MIDDLEWARE =================================
// ============================================================
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const tx = await PaymentTransaction.findOne({ token }).lean();
    if (!tx || tx.expires < Date.now()) {
        return res.status(401).json({ success: false, error: 'Invalid/expired token' });
    }
    req.authUsername = tx.username;
    next();
}

async function requireAdmin(req, res, next) {
    const username = req.authUsername;
    if (!username || !(await isAdmin(username))) {
        return res.status(403).json({ success: false, error: 'Admin only' });
    }
    next();
}

// ============================================================
// ========== RATE LIMITERS ===================================
// ============================================================
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, error: 'Too many attempts. Try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { success: false, error: 'Too many registrations from this IP' },
    standardHeaders: true,
    legacyHeaders: false
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    message: { success: false, error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false
});

const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { success: false, error: 'Slow down' },
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api/', apiLimiter);

// ============================================================
// ========== API ROUTES ======================================
// ============================================================

// ---------- WebRTC TURN ----------
app.get('/api/turn-credentials', requireAuth, async (req, res) => {
    const ident = process.env.XIRSYS_IDENT;
    const secret = process.env.XIRSYS_SECRET;
    const channel = process.env.XIRSYS_CHANNEL;
    if (!ident || !secret || !channel) {
        return res.status(500).json({ error: 'Xirsys not configured' });
    }
    const options = {
        host: 'global.xirsys.net', path: `/_turn/${channel}`, method: 'PUT',
        headers: {
            'Authorization': 'Basic ' + Buffer.from(`${ident}:${secret}`).toString('base64'),
            'Content-Type': 'application/json'
        }
    };
    const httpreq = https.request(options, (httpres) => {
        let str = '';
        httpres.on('data', (data) => { str += data; });
        httpres.on('end', () => {
            try {
                const parsed = JSON.parse(str);
                if (parsed && parsed.iceServers) res.json(parsed);
                else res.status(500).json({ error: 'Invalid Xirsys response' });
            } catch (e) { res.status(500).json({ error: 'Parse error' }); }
        });
    });
    httpreq.on('error', (e) => res.status(500).json({ error: e.message }));
    httpreq.end();
});

// ---------- Register ----------
app.post('/api/register', registerLimiter, async (req, res) => {
    try {
        const { username, password, gender, securityQuestion, securityAnswer } = req.body || {};

        if (!username || !password || !securityQuestion || !securityAnswer) {
            return res.json({ success: false, error: 'All fields required' });
        }

        const cleanUsername = sanitizeString(username, 20);
        const cleanQuestion = sanitizeString(securityQuestion, 200);
        const cleanAnswer = sanitizeString(securityAnswer, 200);

        if (!isValidUsername(cleanUsername)) {
            return res.json({ success: false, error: 'Invalid username (3-20 chars, letters/numbers/underscore)' });
        }
        if (password.length < 6 || password.length > 100) {
            return res.json({ success: false, error: 'Password must be 6-100 chars' });
        }
        if (!cleanQuestion || !cleanAnswer) {
            return res.json({ success: false, error: 'Security Q/A required' });
        }

        const existing = await User.findOne({ username: normalizeUsername(cleanUsername) }, '_id').lean();
        if (existing) return res.json({ success: false, error: 'Username exists' });

        const privateCode = await generatePrivateCode();
        const hashedPassword = await hashPassword(password);
        const hashedAnswer = await hashPassword(cleanAnswer.toLowerCase());

        const user = new User({
            username: normalizeUsername(cleanUsername),
            displayName: cleanUsername,
            password: hashedPassword,
            gender: sanitizeString(gender, 20) || 'Not specified',
            securityQuestion: cleanQuestion,
            securityAnswer: hashedAnswer,
            coins: 100,
            privateCode
        });
        await user.save();
        tgNotifyNewUser(user.username);
        res.json({ success: true, privateCode });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ---------- Login ----------
app.post('/api/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) {
            return res.json({ success: false, error: 'Missing credentials' });
        }

        const user = await User.findOne({ username: normalizeUsername(username) });

        // ⭐ Prevent user enumeration
        if (!user) {
            return res.json({ success: false, error: 'Invalid credentials' });
        }

        const valid = await verifyPassword(password, user.password);
        if (!valid) {
            return res.json({ success: false, error: 'Invalid credentials' });
        }

        // ⭐ Auto-migrate plaintext → bcrypt
        if (!isHashed(user.password)) {
            user.password = await hashPassword(password);
            if (!isHashed(user.securityAnswer)) {
                user.securityAnswer = await hashPassword(String(user.securityAnswer).toLowerCase());
            }
            await user.save();
            console.log(`🔐 Migrated ${user.username} to hashed password`);
        }

        if (!user.privateCode) {
            user.privateCode = await generatePrivateCode();
            await user.save();
        }
        const streakInfo = await updateLoginStreak(user);

        const token = generateToken();
        const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
        await PaymentTransaction.create({ token, username: user.username, expires });

        const socketId = onlineUsers.get(user.username);
        if (socketId) {
            if (streakInfo.payoutCreated && streakInfo.payoutInfo) {
                io.to(socketId).emit('streak-completed', {
                    dollarsEarned: streakInfo.payoutInfo.dollars,
                    monthLabel: streakInfo.payoutInfo.monthLabel
                });
            } else if (streakInfo.targetNotReached) {
                io.to(socketId).emit('target-not-reached', {
                    currentTarget: streakInfo.currentTarget,
                    minTarget: streakInfo.minTarget
                });
            }
        }

        res.json({
            success: true,
            user: {
                username: user.username, coins: user.coins,
                isAdmin: user.isAdmin, profile_pic: user.profile_pic,
                isVIP: await isVIP(user.username), vipExpires: user.vipExpires,
                monthlyTarget: user.monthlyTarget || 0,
                consecutiveLoginDays: user.monthlyLoginDays ? user.monthlyLoginDays.length : 0
            },
            streakInfo, token
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ---------- Auto-login ----------
app.get('/api/auto-login', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.json({ success: false });
    const token = authHeader.split(' ')[1];
    const tx = await PaymentTransaction.findOne({ token }).lean();
    if (!tx || tx.expires < Date.now()) return res.json({ success: false });
    const user = await User.findOne({ username: tx.username });
    if (!user) return res.json({ success: false });

    if (!user.privateCode) {
        user.privateCode = await generatePrivateCode();
        await user.save();
    }
    const streakInfo = await updateLoginStreak(user);

    const socketId = onlineUsers.get(user.username);
    if (socketId) {
        if (streakInfo.payoutCreated && streakInfo.payoutInfo) {
            io.to(socketId).emit('streak-completed', {
                dollarsEarned: streakInfo.payoutInfo.dollars,
                monthLabel: streakInfo.payoutInfo.monthLabel
            });
        } else if (streakInfo.targetNotReached) {
            io.to(socketId).emit('target-not-reached', {
                currentTarget: streakInfo.currentTarget,
                minTarget: streakInfo.minTarget
            });
        }
    }

    res.json({
        success: true,
        user: {
            username: user.username, coins: user.coins,
            isAdmin: user.isAdmin, profile_pic: user.profile_pic,
            isVIP: await isVIP(user.username), vipExpires: user.vipExpires,
            monthlyTarget: user.monthlyTarget || 0,
            consecutiveLoginDays: user.monthlyLoginDays ? user.monthlyLoginDays.length : 0
        },
        streakInfo
    });
});

// ---------- Private code ----------
app.get('/api/get-private-code', requireAuth, async (req, res) => {
    try {
        const { username } = req.query;
        const reqNorm = req.authUsername;
        const norm = normalizeUsername(username);

        const isOwner = norm === reqNorm;
        const isAdminUser = await isAdmin(reqNorm);
        if (!isOwner && !isAdminUser) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const user = await User.findOne({ username: norm });
        if (!user) return res.json({ success: false, error: 'User not found' });
        if (!user.privateCode) {
            user.privateCode = await generatePrivateCode();
            await user.save();
        }
        res.json({ success: true, privateCode: user.privateCode });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ---------- User profile ----------
app.get('/api/user-profile', requireAuth, async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ success: false });
    const norm = normalizeUsername(username);

    const cached = getCachedProfile(norm);
    if (cached) return res.json(cached);

    const user = await User.findOne({ username: norm }).lean();
    if (!user) return res.status(404).json({ success: false });

    const data = {
        success: true,
        profile_pic: user.profile_pic,
        coins: user.coins,
        isAdmin: user.isAdmin,
        isVIP: user.vipExpires && new Date(user.vipExpires) > Date.now(),
        monthlyTarget: user.monthlyTarget || 0
    };
    setCachedProfile(norm, data);
    res.json(data);
});

// ---------- Profile picture (base64) ----------
app.post('/api/upload-profile-pic-base64', requireAuth, async (req, res) => {
    try {
        const { profilePicBase64 } = req.body;
        if (!profilePicBase64) return res.json({ success: false, error: 'No image' });
        const user = await User.findOne({ username: req.authUsername });
        if (!user) return res.json({ success: false, error: 'User not found' });
        if (!profilePicBase64.startsWith('data:image/')) {
            return res.json({ success: false, error: 'Invalid format' });
        }
        if (Buffer.byteLength(profilePicBase64, 'utf8') > 1.5 * 1024 * 1024) {
            return res.json({ success: false, error: 'Too large (max 1.5MB)' });
        }
        user.profile_pic = profilePicBase64;
        await user.save();
        clearProfileCache(user.username);
        res.json({ success: true, profilePic: profilePicBase64 });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ---------- Profile picture (multipart) ----------
app.post('/api/upload-profile-pic', requireAuth, uploadProfile.single('profilePic'), async (req, res) => {
    if (!req.file) return res.json({ success: false, error: 'No file' });
    try {
        const filePath = req.file.path;
        const base64Data = fs.readFileSync(filePath, { encoding: 'base64' });
        const mimeType = req.file.mimetype || 'image/jpeg';
        const dataUri = `data:${mimeType};base64,${base64Data}`;
        const user = await User.findOne({ username: req.authUsername });
        if (!user) return res.json({ success: false, error: 'User not found' });
        if (Buffer.byteLength(dataUri, 'utf8') > 1.5 * 1024 * 1024) {
            return res.json({ success: false, error: 'Too large (max 1.5MB)' });
        }
        user.profile_pic = dataUri;
        await user.save();
        clearProfileCache(user.username);
        fs.unlink(filePath, () => { });
        res.json({ success: true, profilePic: dataUri });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ---------- Room image ----------
app.post('/api/upload-room-image', requireAuth, uploadRoomImage.single('roomImage'), (req, res) => {
    if (!req.file) return res.json({ success: false });
    res.json({ success: true, imageUrl: '/uploads/room-images/' + path.basename(req.file.path) });
});

// ---------- Voice ----------
app.post('/api/upload-voice', requireAuth, uploadVoice.single('audio'), (req, res) => {
    if (!req.file) return res.json({ success: false });
    res.json({ success: true, url: '/uploads/voice/' + path.basename(req.file.path) });
});

// ---------- Send gift ----------
app.post('/api/send-gift', requireAuth, writeLimiter, async (req, res) => {
    try {
        const from = req.authUsername;
        const { to, amount, message } = req.body;

        const amountNum = Math.floor(Number(amount));
        if (!to || !Number.isFinite(amountNum) || amountNum < 1 || amountNum > 1000000) {
            return res.json({ success: false, error: 'Invalid amount' });
        }

        const [fromUser, toUser] = await Promise.all([
            User.findOne({ username: from }),
            User.findOne({ username: normalizeUsername(to) })
        ]);
        if (!fromUser || !toUser || fromUser.coins < amountNum) {
            return res.json({ success: false, error: 'Insufficient coins or user not found' });
        }
        if (fromUser.username === toUser.username) {
            return res.json({ success: false, error: 'Cannot gift yourself' });
        }

        fromUser.coins -= amountNum;
        const oldMilestone = Math.floor((toUser.monthlyTarget || 0) / 50000);
        const targetContribution = Math.floor(amountNum / 2);
        toUser.monthlyTarget = (toUser.monthlyTarget || 0) + targetContribution;
        toUser.totalTargetEarned = (toUser.totalTargetEarned || 0) + targetContribution;
        const newMilestone = Math.floor(toUser.monthlyTarget / 50000);
        await Promise.all([fromUser.save(), toUser.save()]);
        clearProfileCache(fromUser.username);
        clearProfileCache(toUser.username);

        await Gift.create({
            from, to: toUser.username, amount: amountNum,
            message: sanitizeString(message, 200), targetContribution
        });
        await CoinRequest.create({ username: fromUser.username, type: 'Send Gift', amount: -amountNum });
        await CoinRequest.create({ username: toUser.username, type: 'Target from Gift', amount: targetContribution });

        io.emit('gift-received', { from, to: toUser.username, amount: amountNum, message: sanitizeString(message, 200) });
        io.emit('gift-ticker', { from, to: toUser.username, amount: amountNum });

        const toSocket = onlineUsers.get(normalizeUsername(toUser.username));
        if (toSocket) {
            io.to(toSocket).emit('target-updated', {
                monthlyTarget: toUser.monthlyTarget,
                dollarsEarned: calculatePayout(toUser.monthlyTarget),
                contribution: targetContribution, from
            });
            if (newMilestone > oldMilestone) {
                io.to(toSocket).emit('milestone-reached', {
                    milestone: newMilestone * 50000, dollars: newMilestone * 25
                });
            }
        }

        res.json({
            success: true, targetContribution,
            newTarget: toUser.monthlyTarget,
            dollarsEarned: calculatePayout(toUser.monthlyTarget)
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ---------- Gifts list ----------
app.get('/api/get-gifts', requireAuth, async (req, res) => {
    const gifts = await Gift.find().sort({ timestamp: -1 }).limit(200).lean();
    res.json(gifts);
});

// ---------- Target info ----------
app.get('/api/get-target-info', requireAuth, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.authUsername })
            .select('monthlyTarget totalTargetEarned totalPaid monthlyLoginDays').lean();
        if (!user) return res.json({ success: false });
        const monthlyTarget = user.monthlyTarget || 0;
        const dollarsEarned = calculatePayout(monthlyTarget);
        const nextMilestone = (Math.floor(monthlyTarget / 50000) + 1) * 50000;
        const streak = user.monthlyLoginDays ? user.monthlyLoginDays.length : 0;
        const now = new Date();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const daysUntilMonthEnd = Math.max(0, Math.ceil((endOfMonth - today) / (1000 * 60 * 60 * 24)));
        res.json({
            success: true, monthlyTarget, dollarsEarned, nextMilestone,
            nextReward: dollarsEarned + 25,
            totalTargetEarned: user.totalTargetEarned || 0,
            totalPaid: user.totalPaid || 0,
            consecutiveLoginDays: streak,
            daysLeft: Math.max(0, 10 - streak),
            daysUntilMonthEnd
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ---------- Payouts ----------
app.get('/api/get-payouts', requireAuth, async (req, res) => {
    const { admin } = req.query;
    const isAdminUser = await isAdmin(req.authUsername);
    if (admin && isAdminUser) {
        const payouts = await Payout.find().sort({ createdAt: -1 }).limit(200).lean();
        return res.json(payouts);
    }
    const payouts = await Payout.find({ username: req.authUsername })
        .sort({ createdAt: -1 }).lean();
    res.json(payouts);
});

app.post('/api/mark-payout-paid', requireAuth, requireAdmin, async (req, res) => {
    const { payoutId } = req.body;
    const payout = await Payout.findById(payoutId);
    if (!payout) return res.json({ success: false });
    payout.status = 'paid';
    payout.paidAt = new Date();
    await payout.save();
    const user = await User.findOne({ username: payout.username });
    if (user) {
        user.totalPaid = (user.totalPaid || 0) + payout.dollarsEarned;
        await user.save();
        clearProfileCache(user.username);
    }
    tgNotifyPayoutPaid({
        username: payout.username, dollars: payout.dollarsEarned,
        month: payout.month, adminUsername: req.authUsername
    });
    const userSocket = onlineUsers.get(payout.username);
    if (userSocket) {
        io.to(userSocket).emit('payout-paid', { amount: payout.dollarsEarned, month: payout.month });
    }
    res.json({ success: true });
});

// ---------- Friends ----------
app.get('/api/get-friends', requireAuth, async (req, res) => {
    const user = await User.findOne({ username: req.authUsername }, 'friends').lean();
    if (!user) return res.json([]);
    res.json(user.friends);
});

app.get('/api/get-friend-requests', requireAuth, async (req, res) => {
    const requests = await FriendRequest.find({ to: req.authUsername }).lean();
    res.json(requests);
});

app.post('/api/delete-friend', requireAuth, async (req, res) => {
    const normUser = req.authUsername;
    const normFriend = normalizeUsername(req.body.friend);
    const [user, friendUser] = await Promise.all([
        User.findOne({ username: normUser }),
        User.findOne({ username: normFriend })
    ]);
    if (user && friendUser) {
        user.friends = user.friends.filter(f => normalizeUsername(f) !== normFriend);
        friendUser.friends = friendUser.friends.filter(f => normalizeUsername(f) !== normUser);
        await Promise.all([user.save(), friendUser.save()]);
        const friendSocket = onlineUsers.get(normFriend);
        if (friendSocket) io.to(friendSocket).emit('friend-deleted', normUser);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'User not found' });
    }
});

// ---------- All users ----------
app.get('/api/get-all-users', requireAuth, async (req, res) => {
    const users = await User.find({}, 'username coins profile_pic').limit(500).lean();
    res.json(users);
});

// ---------- VIP ----------
app.post('/api/buy-vip', requireAuth, async (req, res) => {
    const user = await User.findOne({ username: req.authUsername });
    if (!user || user.coins < PRICING.VIP_COST) {
        return res.json({ success: false, error: `Need ${PRICING.VIP_COST} coins` });
    }
    user.coins -= PRICING.VIP_COST;
    user.vipExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await user.save();
    clearProfileCache(user.username);
    await CoinRequest.create({ username: user.username, type: 'Buy VIP', amount: -PRICING.VIP_COST });
    res.json({ success: true });
});

app.get('/api/get-vip-status', requireAuth, async (req, res) => {
    const isActive = await isVIP(req.authUsername);
    const user = await User.findOne({ username: req.authUsername }, 'vipExpires').lean();
    res.json({ success: isActive, expires: user?.vipExpires });
});

// ---------- Manual coin request ----------
app.post('/api/manual-coin-request', requireAuth, writeLimiter, uploadProof.single('proofFile'), async (req, res) => {
    const { amount, paymentMethod, giftCardNumber, cryptoTransactionId } = req.body;
    const amountNum = Math.floor(Number(amount));
    if (!Number.isFinite(amountNum) || amountNum < 100 || amountNum > 1000000) {
        return res.json({ success: false, error: 'Invalid amount' });
    }
    const proof = req.file ? '/uploads/proofs/' + path.basename(req.file.path) : null;
    await ManualCoinRequest.create({
        username: req.authUsername, amount: amountNum,
        paymentMethod: sanitizeString(paymentMethod, 20),
        giftCardNumber: sanitizeString(giftCardNumber, 100),
        cryptoTransactionId: sanitizeString(cryptoTransactionId, 200),
        proof
    });
    tgNotifyManualCoinRequest({
        username: req.authUsername, amount: amountNum, method: paymentMethod,
        giftCardNumber, cryptoTransactionId, proof
    });
    res.json({ success: true });
});

// ---------- Coin history ----------
app.get('/api/get-coin-history', requireAuth, async (req, res) => {
    const history = await CoinRequest.find({ username: req.authUsername })
        .sort({ date: -1 }).limit(500).lean();
    res.json(history);
});

// ---------- Room members ----------
app.get('/api/get-room-members/:roomName', requireAuth, async (req, res) => {
    const room = await findRoomInsensitive(req.params.roomName);
    if (!room) return res.json({ success: false });

    const memberUsers = await User.find(
        { username: { $in: room.members } },
        'username vipExpires'
    ).lean();
    const vipMap = {};
    const now = Date.now();
    memberUsers.forEach(u => {
        vipMap[u.username] = u.vipExpires && new Date(u.vipExpires) > now;
    });
    room.members.forEach(m => {
        if (vipMap[m] === undefined) vipMap[m] = false;
    });

    res.json({
        success: true,
        members: room.members,
        kicked: room.kicked,
        moderators: room.moderators,
        vipMap
    });
});

// ---------- Kick user ----------
app.post('/api/kick-user', requireAuth, async (req, res) => {
    const { roomName, username } = req.body;
    const room = await findRoomInsensitive(roomName);
    if (!room) return res.json({ success: false });
    const adminUsername = req.authUsername;
    const admin = await User.findOne({ username: adminUsername }, 'isAdmin').lean();
    if (!room.moderators.includes(adminUsername) && room.owner !== adminUsername && !admin?.isAdmin)
        return res.json({ success: false });
    if (!room.kicked.includes(username)) room.kicked.push(username);
    room.members = room.members.filter(m => m !== username);
    await room.save();
    const targetSocket = onlineUsers.get(normalizeUsername(username));
    if (targetSocket) io.to(targetSocket).emit('kicked-from-room', { room: room.name });
    io.to(room.name).emit('user-left-room', { username });
    res.json({ success: true });
});

// ---------- Unban ----------
app.post('/api/unban-user', requireAuth, async (req, res) => {
    const { roomName, username } = req.body;
    const room = await findRoomInsensitive(roomName);
    if (!room || (room.owner !== req.authUsername && !(await isAdmin(req.authUsername))))
        return res.json({ success: false });
    room.kicked = room.kicked.filter(k => k !== username);
    await room.save();
    res.json({ success: true });
});

// ---------- Room settings ----------
app.get('/api/room-settings/:roomName', requireAuth, async (req, res) => {
    const room = await findRoomInsensitive(req.params.roomName);
    if (!room) return res.json({ success: false });
    res.json({
        success: true, membersOnly: room.membersOnly,
        allowedMembers: room.allowedMembers, moderators: room.moderators
    });
});

app.post('/api/room-settings', requireAuth, async (req, res) => {
    const { roomName, membersOnly } = req.body;
    const room = await findRoomInsensitive(roomName);
    if (!room || room.owner !== req.authUsername) {
        return res.json({ success: false, error: 'Only owner can change' });
    }
    room.membersOnly = !!membersOnly;
    if (membersOnly) {
        room.members.forEach(member => {
            if (!room.allowedMembers.includes(member)) room.allowedMembers.push(member);
        });
    }
    await room.save();
    res.json({ success: true });
});

// ---------- Admin clear ----------
app.post('/api/clear-friend-requests', requireAuth, requireAdmin, async (req, res) => {
    await FriendRequest.deleteMany({});
    res.json({ success: true });
});

app.post('/api/clear-coin-requests', requireAuth, requireAdmin, async (req, res) => {
    await CoinRequest.deleteMany({});
    res.json({ success: true });
});

app.get('/api/get-boost-logs', requireAuth, requireAdmin, async (req, res) => {
    const logs = await BoostLog.find().sort({ timestamp: -1 }).limit(50).lean();
    res.json(logs);
});

app.get('/api/get-pending-manual-requests', requireAuth, requireAdmin, async (req, res) => {
    const requests = await ManualCoinRequest.find({ status: 'pending' }).lean();
    res.json(requests);
});

app.post('/api/approve-manual-request', requireAuth, requireAdmin, async (req, res) => {
    const { requestId } = req.body;
    const reqDoc = await ManualCoinRequest.findById(requestId);
    if (!reqDoc) return res.json({ success: false });
    const user = await User.findOne({ username: reqDoc.username });
    if (user) {
        user.coins += reqDoc.amount;
        await user.save();
        clearProfileCache(user.username);
        await CoinRequest.create({ username: user.username, type: 'Manual Coin Request', amount: reqDoc.amount });
        const userSocket = onlineUsers.get(reqDoc.username);
        if (userSocket) io.to(userSocket).emit('coins-updated', user.coins);
        sendTelegramNotification(
            `✅ <b>Approved</b>\n👤 <code>${tgEscape(reqDoc.username)}</code>\n🪙 +${tgEscape(reqDoc.amount)}\n👑 <code>${tgEscape(req.authUsername)}</code>`
        );
    }
    reqDoc.status = 'approved';
    await reqDoc.save();
    res.json({ success: true });
});

app.post('/api/reject-manual-request', requireAuth, requireAdmin, async (req, res) => {
    const { requestId } = req.body;
    await ManualCoinRequest.findByIdAndDelete(requestId);
    res.json({ success: true });
});

// ---------- Admin give coins ----------
app.post('/api/admin-give-coins', requireAuth, requireAdmin, async (req, res) => {
    const { username, amount } = req.body;
    const amountNum = Math.floor(Number(amount));
    if (!username || !Number.isFinite(amountNum)) {
        return res.json({ success: false, error: 'Invalid input' });
    }
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (user) {
        user.coins += amountNum;
        await user.save();
        clearProfileCache(user.username);
        await CoinRequest.create({ username: user.username, type: 'Admin Gift', amount: amountNum });
        const userSocket = onlineUsers.get(normalizeUsername(username));
        if (userSocket) {
            io.to(userSocket).emit('admin-gift', { amount: amountNum });
            io.to(userSocket).emit('coins-updated', user.coins);
        }
    }
    res.json({ success: true });
});

// ---------- Admin reset password ----------
app.post('/api/admin-reset-password', requireAuth, requireAdmin, async (req, res) => {
    const { username, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.json({ success: false, error: 'Min 6 chars' });
    }
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (user) {
        user.password = await hashPassword(newPassword);
        await user.save();
        // ⭐ Invalidate all sessions
        await PaymentTransaction.deleteMany({ username: user.username });
    }
    res.json({ success: true });
});

// ---------- Admin: users list ----------
app.get('/api/admin/get-all-users', requireAuth, requireAdmin, async (req, res) => {
    const users = await User.find({}, 'username coins isAdmin privateCode').limit(1000).lean();
    res.json(users);
});

app.post('/api/delete-user', requireAuth, requireAdmin, async (req, res) => {
    const { username } = req.body;
    await User.deleteOne({ username: normalizeUsername(username) });
    await PaymentTransaction.deleteMany({ username: normalizeUsername(username) });
    clearProfileCache(username);
    res.json({ success: true });
});

app.get('/api/get-all-rooms', requireAuth, requireAdmin, async (req, res) => {
    const rooms = await Room.find({}, 'name owner').lean();
    res.json(rooms);
});

app.delete('/api/delete-room', requireAuth, requireAdmin, async (req, res) => {
    const { roomName } = req.body;
    await Room.deleteOne({ name: roomName });
    res.json({ success: true });
});

// ============================================================
// ========== SUPPORT TICKETS =================================
// ============================================================
app.post('/api/support/submit', requireAuth, writeLimiter, uploadSupport.single('screenshot'), async (req, res) => {
    try {
        const { subject, message } = req.body;
        const cleanSubject = sanitizeString(subject, 100);
        const cleanMessage = sanitizeString(message, 2000);
        if (!cleanSubject || !cleanMessage) {
            return res.status(400).json({ success: false, error: 'Missing fields' });
        }
        const screenshot = req.file ? '/uploads/support/' + path.basename(req.file.path) : null;
        const ticketId = uuidv4().slice(0, 8);
        const ticket = new SupportTicket({
            ticketId,
            username: req.authUsername,
            subject: cleanSubject,
            message: cleanMessage,
            screenshot
        });
        await ticket.save();
        tgNotifySupportTicket({
            ticketId, username: req.authUsername,
            subject: cleanSubject, message: cleanMessage, screenshot
        });
        io.emit('new-support-ticket', { username: req.authUsername, subject: cleanSubject, ticketId });
        res.json({ success: true, ticketId });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/support/tickets', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { status } = req.query;
        const filter = (!status || status === 'all') ? {} : { status };
        const tickets = await SupportTicket.find(filter).sort({ createdAt: -1 }).limit(200).lean();
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/support/reply', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { ticketId, reply } = req.body;
        const cleanReply = sanitizeString(reply, 2000);
        if (!ticketId || !cleanReply) return res.status(400).json({ success: false });
        const ticket = await SupportTicket.findOne({ ticketId });
        if (!ticket) return res.status(404).json({ success: false });
        const normalizedUser = normalizeUsername(ticket.username);
        await Notification.create({
            username: normalizedUser, title: 'Support Reply',
            message: `Admin replied to ticket ${ticket.ticketId}`,
            type: 'support_reply',
            data: { ticketId: ticket.ticketId, reply: cleanReply }
        });
        const userSocket = onlineUsers.get(normalizedUser);
        if (userSocket) {
            io.to(userSocket).emit('support-reply', { ticketId: ticket.ticketId, reply: cleanReply });
        }
        ticket.adminReply = cleanReply;
        ticket.status = 'in-progress';
        ticket.updatedAt = Date.now();
        await ticket.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/support/resolve', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { ticketId } = req.body;
        if (!ticketId) return res.status(400).json({ success: false });
        const ticket = await SupportTicket.findOne({ ticketId });
        if (!ticket) return res.status(404).json({ success: false });
        const normalizedUser = normalizeUsername(ticket.username);
        await Notification.create({
            username: normalizedUser, title: 'Ticket Resolved',
            message: `Your support ticket ${ticket.ticketId} has been resolved.`,
            type: 'support_resolved',
            data: { ticketId: ticket.ticketId }
        });
        const userSocket = onlineUsers.get(normalizedUser);
        if (userSocket) {
            io.to(userSocket).emit('support-resolved', {
                ticketId: ticket.ticketId, message: 'Resolved'
            });
        }
        await SupportTicket.deleteOne({ ticketId });
        res.json({ success: true, deleted: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/support/clear-all', requireAuth, requireAdmin, async (req, res) => {
    try {
        const tickets = await SupportTicket.find({}).lean();
        let notifiedOnline = 0, notifiedOffline = 0;
        for (const ticket of tickets) {
            const normalizedUser = normalizeUsername(ticket.username);
            await Notification.create({
                username: normalizedUser, title: 'Ticket Closed',
                message: `Your support ticket ${ticket.ticketId} has been closed.`,
                type: 'support_resolved',
                data: { ticketId: ticket.ticketId }
            });
            const userSocket = onlineUsers.get(normalizedUser);
            if (userSocket) {
                io.to(userSocket).emit('support-resolved', {
                    ticketId: ticket.ticketId, message: 'Closed'
                });
                notifiedOnline++;
            } else notifiedOffline++;
        }
        const result = await SupportTicket.deleteMany({});
        res.json({
            success: true, deletedCount: result.deletedCount,
            notifiedOnline, notifiedOffline
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// ========== NOTIFICATIONS ===================================
// ============================================================
app.get('/api/notifications/pending', requireAuth, async (req, res) => {
    try {
        const notifications = await Notification.find({
            username: req.authUsername, read: false
        }).sort({ createdAt: -1 }).limit(50).lean();
        res.json({ success: true, notifications });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/notifications/mark-read', requireAuth, async (req, res) => {
    try {
        const { ids } = req.body;
        const filter = { username: req.authUsername };
        if (Array.isArray(ids) && ids.length) filter._id = { $in: ids };
        await Notification.updateMany(filter, { $set: { read: true } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================
// ========== PASSWORD RESET ==================================
// ============================================================
app.post('/api/get-security-question', authLimiter, async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.json({ success: false, error: 'Username required' });
        const user = await User.findOne({ username: normalizeUsername(username) }, 'securityQuestion').lean();
        // ⭐ Prevent enumeration
        if (!user || !user.securityQuestion) {
            return res.json({ success: false, error: 'Unable to retrieve question' });
        }
        res.json({ success: true, question: user.securityQuestion });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/reset-password', authLimiter, async (req, res) => {
    try {
        const { username, answer, newPassword } = req.body;
        if (!username || !answer || !newPassword) return res.json({ success: false });
        if (newPassword.length < 6) return res.json({ success: false, error: 'Min 6 chars' });
        const user = await User.findOne({ username: normalizeUsername(username) });

        // ⭐ Prevent enumeration
        if (!user) return res.json({ success: false, error: 'Unable to reset password' });

        const answerValid = await verifyPassword(answer.toLowerCase(), user.securityAnswer);
        if (!answerValid) {
            return res.json({ success: false, error: 'Unable to reset password' });
        }

        user.password = await hashPassword(newPassword);
        await user.save();

        // ⭐ Invalidate all sessions
        await PaymentTransaction.deleteMany({ username: user.username });

        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ============================================================
// ========== NOWPAYMENTS =====================================
// ============================================================
function sortObject(obj) {
    if (Array.isArray(obj)) return obj.map(sortObject);
    if (obj && typeof obj === 'object') {
        return Object.keys(obj).sort().reduce((acc, key) => {
            acc[key] = sortObject(obj[key]);
            return acc;
        }, {});
    }
    return obj;
}

app.post('/api/nowpayments/create-invoice', requireAuth, writeLimiter, async (req, res) => {
    try {
        const { packageId } = req.body || {};
        const username = req.authUsername;
        if (!packageId) return res.json({ success: false, error: 'Missing fields' });
        const pkg = COIN_PACKAGES[String(packageId)];
        if (!pkg) return res.json({ success: false, error: 'Invalid package' });
        const user = await User.findOne({ username }, '_id username').lean();
        if (!user) return res.json({ success: false, error: 'User not found' });
        const apiKey = process.env.NOWPAYMENTS_API_KEY;
        if (!apiKey) return res.json({ success: false, error: 'NOWPayments not configured' });
        const orderId = 'MK-' + Date.now() + '-' + uuidv4().slice(0, 8);
        const host = (req.get('x-forwarded-proto') || req.protocol) + '://' + req.get('host');
        const payload = {
            price_amount: pkg.priceUsd, price_currency: 'usd',
            order_id: orderId, order_description: `${pkg.coins} coins for ${user.username}`,
            ipn_callback_url: `${host}/api/nowpayments/ipn`,
            success_url: `${host}/?payment=success&order=${orderId}`,
            cancel_url: `${host}/?payment=cancel&order=${orderId}`
        };
        if (process.env.NOWPAYMENTS_PAY_CURRENCY) {
            payload.pay_currency = process.env.NOWPAYMENTS_PAY_CURRENCY;
        }
        const result = await httpsJsonRequest({
            hostname: 'api.nowpayments.io', path: '/v1/invoice', method: 'POST',
            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }
        }, payload);
        if (result.status >= 200 && result.status < 300 && result.body && result.body.invoice_url) {
            await CryptoPayment.create({
                orderId, username: user.username, coins: pkg.coins,
                priceUsd: pkg.priceUsd, status: 'waiting',
                invoiceUrl: result.body.invoice_url
            });
            return res.json({
                success: true, orderId,
                invoiceUrl: result.body.invoice_url,
                coins: pkg.coins, priceUsd: pkg.priceUsd
            });
        }
        return res.json({
            success: false,
            error: (result.body && (result.body.message || result.body.error)) || 'Failed'
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/nowpayments/ipn', async (req, res) => {
    try {
        const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
        const sig = req.headers['x-nowpayments-sig'];
        if (!ipnSecret) {
            console.error('⚠️ IPN_SECRET not configured — rejecting for safety');
            return res.status(500).send('IPN not configured');
        }
        if (!sig) return res.status(401).send('Missing signature');
        const expected = crypto.createHmac('sha512', ipnSecret)
            .update(JSON.stringify(sortObject(req.body))).digest('hex');
        // ⭐ Constant-time compare
        const expBuf = Buffer.from(expected);
        const sigBuf = Buffer.from(sig);
        if (expBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expBuf, sigBuf)) {
            return res.status(401).send('Invalid signature');
        }
        const { order_id, payment_status, payment_id, pay_amount, pay_currency } = req.body || {};
        if (!order_id) return res.status(400).send('Missing order_id');
        const payment = await CryptoPayment.findOne({ orderId: order_id });
        if (!payment) return res.status(404).send('Order not found');
        payment.status = payment_status || payment.status;
        payment.paymentId = payment_id || payment.paymentId;
        payment.payAmount = pay_amount || payment.payAmount;
        payment.payCurrency = pay_currency || payment.payCurrency;
        payment.updatedAt = new Date();
        const FINAL_OK = ['finished', 'confirmed'];
        if (FINAL_OK.includes(payment_status) && !payment.credited) {
            const user = await User.findOne({ username: payment.username });
            if (user) {
                user.coins += payment.coins;
                await user.save();
                clearProfileCache(user.username);
                await CoinRequest.create({
                    username: user.username,
                    type: 'Crypto Purchase (NOWPayments)',
                    amount: payment.coins
                });
                const sock = onlineUsers.get(user.username);
                if (sock) io.to(sock).emit('coins-updated', user.coins);
                payment.credited = true;
                tgNotifyCryptoPurchase({
                    username: user.username, coins: payment.coins,
                    priceUsd: payment.priceUsd, orderId: payment.orderId,
                    payAmount: payment.payAmount, payCurrency: payment.payCurrency
                });
            }
        }
        await payment.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).send('Error');
    }
});

app.get('/api/nowpayments/status/:orderId', requireAuth, async (req, res) => {
    try {
        const payment = await CryptoPayment.findOne({
            orderId: req.params.orderId,
            username: req.authUsername
        }).select('status credited coins priceUsd payAmount payCurrency').lean();
        if (!payment) return res.json({ success: false, error: 'Not found' });
        res.json({ success: true, ...payment });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ============================================================
// ========== LUCKY GAMES =====================================
// ============================================================
app.post('/api/game/play', requireAuth, writeLimiter, async (req, res) => {
    try {
        const { game, bet, choice } = req.body || {};
        const username = req.authUsername;
        if (!game || !bet) return res.json({ success: false, error: 'Missing fields' });
        const betAmount = Math.floor(Number(bet));
        if (!Number.isFinite(betAmount) || betAmount < GAME_CONFIG.minBet) {
            return res.json({ success: false, error: `Min bet ${GAME_CONFIG.minBet}` });
        }
        const user = await User.findOne({ username });
        if (!user) return res.json({ success: false, error: 'User not found' });
        const userIsVip = user.vipExpires && new Date(user.vipExpires) > Date.now();
        const maxBet = userIsVip ? GAME_CONFIG.vipMaxBet : GAME_CONFIG.maxBet;
        if (betAmount > maxBet) return res.json({ success: false, error: `Max ${maxBet.toLocaleString()}` });
        if (user.coins < betAmount) return res.json({ success: false, error: 'Insufficient coins' });
        user.coins -= betAmount;
        let outcome, choiceLabel = choice;
        switch (game) {
            case 'coinflip':
                if (choice !== 'heads' && choice !== 'tails') {
                    user.coins += betAmount;
                    return res.json({ success: false, error: 'Invalid choice' });
                }
                outcome = rollCoinflip(choice); break;
            case 'dice': {
                const n = Number(choice);
                if (!Number.isInteger(n) || n < 1 || n > 6) {
                    user.coins += betAmount;
                    return res.json({ success: false, error: 'Invalid dice' });
                }
                outcome = rollDice(n); break;
            }
            case 'slot': outcome = spinSlot(); choiceLabel = null; break;
            case 'wheel': outcome = spinWheel(); choiceLabel = null; break;
            default:
                user.coins += betAmount;
                return res.json({ success: false, error: 'Unknown game' });
        }
        const payout = Math.floor(betAmount * outcome.multiplier);
        const profit = payout - betAmount;
        user.coins += payout;
        await user.save();
        clearProfileCache(user.username);

        await GameLog.create({
            username: user.username, game, bet: betAmount,
            choice: choiceLabel, result: outcome.result,
            payout, profit, win: outcome.win
        });
        await CoinRequest.create({
            username: user.username,
            type: `Game ${game} ${outcome.win ? 'WIN' : 'LOSS'}`,
            amount: profit
        });
        if (profit >= GAME_CONFIG.bigWinThreshold) {
            tgNotifyBigWin({ username: user.username, game, bet: betAmount, payout, profit });
        }
        const sock = onlineUsers.get(user.username);
        if (sock) {
            io.to(sock).emit('coins-updated', user.coins);
            io.to(sock).emit('game-result', {
                game, bet: betAmount, payout, profit,
                win: outcome.win, result: outcome.result, multiplier: outcome.multiplier
            });
        }
        res.json({
            success: true, newBalance: user.coins, bet: betAmount,
            payout, profit, win: outcome.win, result: outcome.result,
            multiplier: outcome.multiplier, game
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.get('/api/game/history', requireAuth, async (req, res) => {
    try {
        const max = Math.min(parseInt(req.query.limit) || 20, 100);
        const logs = await GameLog.find({ username: req.authUsername })
            .sort({ createdAt: -1 }).limit(max).lean();
        res.json({ success: true, logs });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.get('/api/game/config', requireAuth, async (req, res) => {
    try {
        let maxBet = GAME_CONFIG.maxBet;
        const isVip = await isVIP(req.authUsername);
        if (isVip) maxBet = GAME_CONFIG.vipMaxBet;
        res.json({
            success: true, minBet: GAME_CONFIG.minBet,
            maxBet, bigWinThreshold: GAME_CONFIG.bigWinThreshold
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.get('/api/game/admin-logs', requireAuth, requireAdmin, async (req, res) => {
    try {
        const logs = await GameLog.find().sort({ createdAt: -1 }).limit(100).lean();
        res.json(logs);
    } catch (err) { res.json([]); }
});

// ============================================================
// ========== SOCKET.IO WITH AUTH =============================
// ============================================================
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Authentication required'));
        const tx = await PaymentTransaction.findOne({ token }).lean();
        if (!tx || tx.expires < Date.now()) {
            return next(new Error('Invalid or expired token'));
        }
        const user = await User.findOne({ username: tx.username }, 'displayName isAdmin').lean();
        if (!user) return next(new Error('User not found'));
        socket.authUsername = tx.username;
        socket.displayUsername = user.displayName || tx.username;
        socket.isAdmin = !!user.isAdmin;
        next();
    } catch (err) {
        next(new Error('Auth failed'));
    }
});

// ⭐ Per-socket rate limiter
const socketRateMap = new Map();
function socketRateAllowed(socket, max = 30) {
    const now = Date.now();
    let entry = socketRateMap.get(socket.id);
    if (!entry || now - entry.start > 1000) {
        entry = { start: now, count: 0 };
        socketRateMap.set(socket.id, entry);
    }
    entry.count++;
    return entry.count <= max;
}

io.on('connection', (socket) => {
    console.log('🔌 Socket connected:', socket.id, '→', socket.authUsername);

    socket.use((packet, next) => {
        if (!socketRateAllowed(socket)) {
            return next(new Error('Rate limit exceeded'));
        }
        next();
    });

    socket.on('user-online', async () => {
        const norm = socket.authUsername;
        if (!norm) return;
        onlineUsers.set(norm, socket.id);
        socket.username = norm;
        io.emit('online-users', Array.from(onlineUsers.keys()));

        const [rooms, u] = await Promise.all([
            Room.find({}, { name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1 }).lean(),
            User.findOne({ username: norm }, 'monthlyLoginDays').lean()
        ]);

        socket.emit('room-list', rooms.map(r => ({
            name: r.name, members: r.members.length,
            boostLevel: r.boostLevel, isVipRoom: r.isVipRoom, membersOnly: r.membersOnly
        })));

        if (u) {
            const now = new Date();
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const streak = u.monthlyLoginDays ? u.monthlyLoginDays.length : 0;
            socket.emit('streak-status', {
                consecutiveLoginDays: streak,
                daysLeft: Math.max(0, 10 - streak),
                daysUntilMonthEnd: Math.max(0, Math.ceil((endOfMonth - today) / (1000 * 60 * 60 * 24)))
            });
        }
    });

    socket.on('get-room-list', async () => {
        const rooms = await Room.find({}, { name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1 }).lean();
        socket.emit('room-list', rooms.map(r => ({
            name: r.name, members: r.members.length,
            boostLevel: r.boostLevel, isVipRoom: r.isVipRoom, membersOnly: r.membersOnly
        })));
    });

    socket.on('create-room', async (data) => {
        const roomName = sanitizeString(data?.roomName, 50);
        const isVipRoom = !!data?.isVipRoom;
        if (!roomName || !isValidRoomName(roomName)) {
            return socket.emit('error', 'Invalid room name');
        }
        const existing = await findRoomInsensitive(roomName);
        if (existing) return socket.emit('error', 'Room exists');

        const userNorm = socket.authUsername;
        const createdBy = socket.displayUsername;

        if (isVipRoom) {
            const vip = await isVIP(userNorm);
            if (!vip) return socket.emit('error', 'Only VIP users can create VIP rooms');
        }

        const user = await User.findOne({ username: userNorm });
        if (user && user.coins >= PRICING.CREATE_ROOM_COST) {
            user.coins -= PRICING.CREATE_ROOM_COST;
            await user.save();
            clearProfileCache(userNorm);
            await CoinRequest.create({ username: userNorm, type: 'Create Room', amount: -PRICING.CREATE_ROOM_COST });
            const newRoom = new Room({
                name: roomName, members: [createdBy], messages: [],
                boostLevel: 0, createdBy, owner: createdBy,
                isVipRoom,
                ownerProfilePic: user.profile_pic,
                kicked: [], membersOnly: false, allowedMembers: [], moderators: []
            });
            await newRoom.save();
            socket.emit('room-created-success', roomName);
            socket.emit('coins-updated', user.coins);
            const rooms = await Room.find({}, { name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1 }).lean();
            io.emit('room-list', rooms.map(r => ({
                name: r.name, members: r.members.length,
                boostLevel: r.boostLevel, isVipRoom: r.isVipRoom, membersOnly: r.membersOnly
            })));
        } else {
            socket.emit('error', `Not enough coins (need ${PRICING.CREATE_ROOM_COST})`);
        }
    });

    socket.on('join-room', async (roomName) => {
        const room = await findRoomInsensitive(sanitizeString(roomName, 50));
        if (!room) return socket.emit('room-not-found', roomName);
        const normUser = socket.username;
        const displayUser = socket.displayUsername;
        if (room.kicked && room.kicked.includes(normUser)) {
            return socket.emit('room-join-denied', 'You are banned');
        }
        const isExistingMember = room.members.includes(displayUser);
        if (room.membersOnly && !isExistingMember) {
            const isAllowed = room.allowedMembers.includes(displayUser) ||
                room.owner === displayUser ||
                room.moderators.includes(displayUser);
            if (!isAllowed) return socket.emit('room-join-denied', 'Members-only room.');
        }
        if (socket.currentRoom) socket.leave(socket.currentRoom);
        socket.join(room.name);
        socket.currentRoom = room.name;
        if (!isExistingMember) {
            room.members.push(displayUser);
            room.activity++;
            await room.save();
        }

        const memberUsers = await User.find(
            { username: { $in: room.members } }, 'username vipExpires'
        ).lean();
        const now = Date.now();
        const vipMap = {};
        memberUsers.forEach(u => { vipMap[u.username] = u.vipExpires && new Date(u.vipExpires) > now; });

        socket.emit('room-joined', {
            room: room.name, messages: [], members: room.members,
            boostLevel: room.boostLevel, owner: room.owner,
            isVipRoom: room.isVipRoom, ownerProfilePic: room.ownerProfilePic,
            vipMap, moderators: room.moderators, membersOnly: room.membersOnly
        });
        socket.to(room.name).emit('user-joined-room', { username: displayUser });

        Room.find({}, { name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1 })
            .lean().then(rooms => {
                io.emit('room-list', rooms.map(r => ({
                    name: r.name, members: r.members.length,
                    boostLevel: r.boostLevel, isVipRoom: r.isVipRoom, membersOnly: r.membersOnly
                })));
            });
    });

    socket.on('request-room-messages', async (roomName) => {
        socket.emit('room-messages-history', { room: roomName, messages: [] });
    });

    socket.on('leave-room', async () => {
        if (socket.currentRoom) {
            const roomName = socket.currentRoom;
            const room = await findRoomInsensitive(roomName);
            if (room) {
                room.members = room.members.filter(m => m !== socket.displayUsername);
                await room.save();
                socket.to(room.name).emit('user-left-room', { username: socket.displayUsername });
            }
            socket.leave(roomName);
            socket.currentRoom = null;
            Room.find({}, { name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1 })
                .lean().then(rooms => {
                    io.emit('room-list', rooms.map(r => ({
                        name: r.name, members: r.members.length,
                        boostLevel: r.boostLevel, isVipRoom: r.isVipRoom, membersOnly: r.membersOnly
                    })));
                });
        }
    });

    socket.on('room-message', async (data) => {
        const room = await findRoomInsensitive(sanitizeString(data?.room, 50));
        if (!room) return;

        const username = socket.displayUsername;
        const norm = socket.username;

        const user = await User.findOne({ username: norm }, 'profile_pic').lean();
        const msg = {
            id: Date.now(),
            username,
            message: sanitizeString(data.message, 2000),
            timestamp: new Date().toLocaleTimeString(),
            type: ['text', 'image', 'audio'].includes(data.type) ? data.type : 'text',
            profilePic: user?.profile_pic,
            isVIP: await isVIP(norm),
            isModerator: room.moderators.includes(username)
        };
        room.messages.push(msg);
        room.activity++;
        if (room.messages.length > 500) room.messages = room.messages.slice(-500);
        await room.save();
        io.to(room.name).emit('new-room-message', msg);
    });

    socket.on('private-message', async (data) => {
        const toNorm = normalizeUsername(data?.to);
        if (!toNorm) return;
        const from = socket.displayUsername;
        const fromNorm = socket.username;
        const toUser = await User.findOne({ username: toNorm }, 'displayName').lean();
        if (!toUser) return;
        const toDisplay = toUser.displayName || toNorm;

        const msg = {
            from, to: toDisplay,
            message: sanitizeString(data.message, 2000),
            timestamp: new Date().toLocaleTimeString(),
            type: ['text', 'image', 'audio'].includes(data.type) ? data.type : 'text',
            isVIP: await isVIP(fromNorm)
        };
        await PrivateMessage.create({
            from, to: toNorm,
            message: msg.message,
            timestamp: msg.timestamp,
            type: msg.type,
            isVIP: msg.isVIP
        });
        const toSocket = onlineUsers.get(toNorm);
        const fromSocket = onlineUsers.get(fromNorm);
        if (toSocket) io.to(toSocket).emit('new-private-message', msg);
        if (fromSocket) io.to(fromSocket).emit('private-message-sent', msg);
    });

    socket.on('boost-room', async (data) => {
        const roomName = sanitizeString(data?.roomName, 50);
        const boostAmount = parseInt(data?.amount);
        if (!PRICING.ALLOWED_BOOST_AMOUNTS.includes(boostAmount)) {
            return socket.emit('error', 'Invalid boost amount');
        }

        const username = socket.displayUsername;
        const norm = socket.username;

        const [room, user] = await Promise.all([
            findRoomInsensitive(roomName),
            User.findOne({ username: norm })
        ]);
        if (room && user && user.coins >= boostAmount) {
            user.coins -= boostAmount;
            await user.save();
            clearProfileCache(user.username);
            await CoinRequest.create({ username: user.username, type: 'Room Boost', amount: -boostAmount });
            room.boostLevel = (room.boostLevel || 0) + boostAmount;
            await room.save();
            await BoostLog.create({ username, roomName: room.name, amount: boostAmount });
            io.to(room.name).emit('room-boosted', { boostedBy: username, amount: boostAmount, boostLevel: room.boostLevel });
            socket.emit('coins-updated', user.coins);
            Room.find({}, { name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1 })
                .lean().then(rooms => {
                    io.emit('room-list', rooms.map(r => ({
                        name: r.name, members: r.members.length,
                        boostLevel: r.boostLevel, isVipRoom: r.isVipRoom, membersOnly: r.membersOnly
                    })));
                });
        } else {
            socket.emit('error', 'Boost failed');
        }
    });

    socket.on('sync-youtube', (data) => {
        if (data?.room) {
            socket.to(data.room).emit('sync-youtube', {
                videoId: data.videoId, room: data.room, by: socket.displayUsername
            });
        }
    });

    socket.on('call-user', (data) => {
        const targetSocketId = onlineUsers.get(normalizeUsername(data?.to));
        if (targetSocketId) {
            io.to(targetSocketId).emit('incoming-call', { from: socket.displayUsername, offer: data.offer });
        } else {
            socket.emit('call-rejected', { message: 'User offline' });
        }
    });

    socket.on('call-accepted', (data) => {
        const targetSocketId = onlineUsers.get(normalizeUsername(data?.to));
        if (targetSocketId) io.to(targetSocketId).emit('call-accepted', { answer: data.answer });
    });
    socket.on('call-rejected', (data) => {
        const targetSocketId = onlineUsers.get(normalizeUsername(data?.to));
        if (targetSocketId) io.to(targetSocketId).emit('call-rejected');
    });
    socket.on('end-call', (data) => {
        const targetSocketId = onlineUsers.get(normalizeUsername(data?.to));
        if (targetSocketId) io.to(targetSocketId).emit('end-call');
    });
    socket.on('ice-candidate', (data) => {
        const targetSocketId = onlineUsers.get(normalizeUsername(data?.to));
        if (targetSocketId) io.to(targetSocketId).emit('ice-candidate', { candidate: data.candidate });
    });

    socket.on('add-room-member', async (data) => {
        const roomName = sanitizeString(data?.roomName, 50);
        const username = sanitizeString(data?.username, 50);
        const adminUsername = socket.displayUsername;
        const room = await findRoomInsensitive(roomName);
        const isAuthorized = room && (room.owner === adminUsername || room.moderators.includes(adminUsername));
        if (!room || !isAuthorized) return socket.emit('error', 'Not authorized');
        if (!room.allowedMembers.includes(username)) room.allowedMembers.push(username);
        await room.save();
        io.to(room.name).emit('room-member-added', { username, roomName: room.name });
        const targetSocket = onlineUsers.get(normalizeUsername(username));
        if (targetSocket) io.to(targetSocket).emit('room-member-added', { username, roomName: room.name });
        socket.emit('member-action-success', { action: 'add', username });
    });

    socket.on('remove-room-member', async (data) => {
        const roomName = sanitizeString(data?.roomName, 50);
        const username = sanitizeString(data?.username, 50);
        const adminUsername = socket.displayUsername;
        const room = await findRoomInsensitive(roomName);
        const isAuthorized = room && (room.owner === adminUsername || room.moderators.includes(adminUsername));
        if (!room || !isAuthorized) return socket.emit('error', 'Not authorized');
        room.allowedMembers = room.allowedMembers.filter(m => m !== username);
        await room.save();
        io.to(room.name).emit('room-member-removed', { username, roomName: room.name });
        if (room.membersOnly && room.members.includes(username)) {
            room.members = room.members.filter(m => m !== username);
            await room.save();
            const kickedSocket = onlineUsers.get(normalizeUsername(username));
            if (kickedSocket) io.to(kickedSocket).emit('kicked-from-room', { room: room.name });
            io.to(room.name).emit('user-left-room', { username });
        }
        socket.emit('member-action-success', { action: 'remove', username });
    });

    socket.on('set-moderator', async (data) => {
        const roomName = sanitizeString(data?.roomName, 50);
        const username = sanitizeString(data?.username, 50);
        const adminUsername = socket.displayUsername;
        const room = await findRoomInsensitive(roomName);
        if (!room || room.owner !== adminUsername) return socket.emit('error', 'Only owner');
        if (!room.moderators.includes(username)) room.moderators.push(username);
        if (!room.allowedMembers.includes(username)) room.allowedMembers.push(username);
        await room.save();
        io.to(room.name).emit('room-moderator-updated', { moderators: room.moderators, room: room.name });
        socket.emit('member-action-success', { action: 'set_mod', username });
    });

    socket.on('remove-moderator', async (data) => {
        const roomName = sanitizeString(data?.roomName, 50);
        const username = sanitizeString(data?.username, 50);
        const adminUsername = socket.displayUsername;
        const room = await findRoomInsensitive(roomName);
        if (!room || room.owner !== adminUsername) return socket.emit('error', 'Only owner');
        room.moderators = room.moderators.filter(m => m !== username);
        await room.save();
        io.to(room.name).emit('room-moderator-updated', { moderators: room.moderators, room: room.name });
        socket.emit('member-action-success', { action: 'remove_mod', username });
    });

    socket.on('send-friend-request-socket', async (data) => {
        const from = socket.displayUsername;
        const to = sanitizeString(data?.to, 50);
        const toNorm = normalizeUsername(to);
        if (toNorm === socket.username) return socket.emit('error', 'Cannot add yourself');
        const toUser = await User.findOne({ username: toNorm }, '_id').lean();
        if (!toUser) return socket.emit('error', 'User not found');
        const existing = await FriendRequest.findOne({ to: toNorm, from }, '_id').lean();
        if (existing) return socket.emit('error', 'Request already sent');
        await FriendRequest.create({ to: toNorm, from, timestamp: Date.now() });
        const toSocket = onlineUsers.get(toNorm);
        if (toSocket) io.to(toSocket).emit('friend-request-received', { from });
        socket.emit('friend-request-sent', { to });
    });

    socket.on('accept-friend-request-socket', async (data) => {
        const username = socket.displayUsername;
        const norm = socket.username;
        const from = sanitizeString(data?.from, 50);
        const fromNorm = normalizeUsername(from);
        await FriendRequest.deleteOne({ to: norm, from });
        const [user, friendUser] = await Promise.all([
            User.findOne({ username: norm }),
            User.findOne({ username: fromNorm })
        ]);
        if (user && friendUser) {
            if (!user.friends.includes(from)) user.friends.push(from);
            if (!friendUser.friends.includes(username)) friendUser.friends.push(username);
            await Promise.all([user.save(), friendUser.save()]);
            const userSocket = onlineUsers.get(norm);
            const friendSocket = onlineUsers.get(fromNorm);
            if (userSocket) io.to(userSocket).emit('friends-updated');
            if (friendSocket) io.to(friendSocket).emit('friends-updated');
        }
        socket.emit('friend-request-accepted', { from });
    });

    socket.on('typing', (data) => {
        if (data?.room) {
            socket.to(data.room).emit('user-typing', { room: data.room, username: socket.displayUsername });
        }
    });
    socket.on('stop-typing', (data) => {
        if (data?.room) {
            socket.to(data.room).emit('user-stop-typing', { room: data.room, username: socket.displayUsername });
        }
    });
    socket.on('private-typing', (data) => {
        const toSocket = onlineUsers.get(normalizeUsername(data?.to));
        if (toSocket) io.to(toSocket).emit('private-user-typing', { from: socket.displayUsername });
    });
    socket.on('private-stop-typing', (data) => {
        const toSocket = onlineUsers.get(normalizeUsername(data?.to));
        if (toSocket) io.to(toSocket).emit('private-user-stop-typing', { from: socket.displayUsername });
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            onlineUsers.delete(socket.username);
            io.emit('online-users', Array.from(onlineUsers.keys()));
            console.log(`🔌 Disconnected: ${socket.id} (${socket.username})`);
        }
        socketRateMap.delete(socket.id);
    });
});

// ============================================================
// ========== CRON JOBS =======================================
// ============================================================
cron.schedule('0 0 1 * *', async () => {
    console.log('🔄 Monthly reset started...');
    try {
        const now = new Date();
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const monthLabel = prevMonth.toISOString().slice(0, 7);
        const MIN_TARGET = 50000;

        const eligibleUsers = await User.find({ monthlyTarget: { $gte: MIN_TARGET } });
        console.log(`💰 ${eligibleUsers.length} qualified for payout`);

        for (const user of eligibleUsers) {
            const streak = user.monthlyLoginDays ? user.monthlyLoginDays.length : 0;
            if (streak < 10) continue;
            const dollars = calculatePayout(user.monthlyTarget);
            await Payout.create({
                username: user.username, targetAmount: user.monthlyTarget,
                dollarsEarned: dollars, month: monthLabel, status: 'pending'
            });
            tgNotifyPayoutCreated({
                username: user.username, dollars, monthLabel,
                targetAmount: user.monthlyTarget
            });
            const sock = onlineUsers.get(user.username);
            if (sock) {
                io.to(sock).emit('payout-created', {
                    month: monthLabel, dollarsEarned: dollars,
                    targetAmount: user.monthlyTarget
                });
            }
        }

        const resetResult = await User.updateMany({}, {
            $set: { monthlyTarget: 0, monthlyLoginDays: [] }
        });
        console.log(`✅ Reset for ${resetResult.modifiedCount} users`);

        const boostResult = await Room.updateMany({}, { $set: { boostLevel: 0 } });
        console.log(`✅ Boost reset for ${boostResult.modifiedCount} rooms`);
        io.emit('boost-reset', { message: 'Monthly reset complete' });

        const rooms = await Room.find({}, { name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1 }).lean();
        io.emit('room-list', rooms.map(r => ({
            name: r.name, members: r.members.length,
            boostLevel: r.boostLevel, isVipRoom: r.isVipRoom, membersOnly: r.membersOnly
        })));

        clearProfileCache();
        console.log('🎉 Monthly reset complete!');
    } catch (err) {
        console.error('❌ Monthly reset error:', err);
    }
});

// ⭐ Cleanup expired tokens every hour
cron.schedule('0 * * * *', async () => {
    try {
        const result = await PaymentTransaction.deleteMany({ expires: { $lt: Date.now() } });
        if (result.deletedCount > 0) {
            console.log(`🧹 Cleaned ${result.deletedCount} expired tokens`);
        }
    } catch (err) {
        console.error('Token cleanup error:', err.message);
    }
});

// ============================================================
// ========== START ===========================================
// ============================================================
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`🔐 SECURITY: bcrypt + rate-limit + helmet + socket-auth enabled`);
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID) {
        console.log('📨 Telegram: ENABLED');
        sendTelegramNotification('🚀 <b>Mokalmat server started</b>\n🔐 Security mode active.');
    } else {
        console.log('📨 Telegram: DISABLED');
    }
});

