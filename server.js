// server.js
// ⭐⭐⭐ Mokalmat Chat — SECURE SERVER v3.2 ⭐⭐⭐
// Balanced Security + Auto-Ban + Whitelist

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
const helmet = require('helmet');
const { body, query, validationResult } = require('express-validator');

// ⭐ وحدة الأمان
const {
    generateFingerprint,
    generateSocketFingerprint,
    signTokenWithFingerprint,
    verifyTokenWithFingerprint,
    createActionSignature,
    verifyActionSignature,
    limiters,
    reportSuspicious,
    getSuspicionScore,
    clearSuspicion,           // ⭐ FIX: أُضيفت — كانت مفقودة وتُستخدم في /api/admin/security/clear-suspicion
    recordIpViolation,
    isIpBlocked,
    checkConnectionRate,
    getClientIp,
    logActivity,
    getActivityLog,
    getSecurityStats,
    listBlockedIPs,
    unblockIP,
    manualBlockIP,
    handleViolation,
    trackUserIP,
    getUserIPs,
    getUserViolations,
    banIP,
    unbanIP,
    listAllBans,
    clearViolations,
    clearAllBans,
    setTelegramAlertSender,
    // ⭐ Whitelist
    isWhitelistedIP,
    isWhitelistedUser,
    isWhitelisted,
    isRateLimitExempt,
    AUTOBAN_ENABLED
} = require('./security');

// ============================================================
// ⭐ VALIDATION
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('❌ FATAL: JWT_SECRET must be set and at least 32 characters');
    process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

// ============================================================
// ⭐⭐⭐ HTTP SERVER
// ============================================================
const server = http.createServer({
    keepAlive: true,
    keepAliveInitialDelay: 300000
}, app);

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 60000;

// ============================================================
// ⭐⭐⭐ SECURITY HEADERS
// ============================================================
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// ============================================================
// ⭐⭐⭐ CORS
// ============================================================
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ============================================================
// ⭐⭐⭐ COMPRESSION
// ============================================================
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.path.startsWith('/socket.io')) return false;
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

// ============================================================
// ⭐⭐⭐ BODY PARSER
// ============================================================
app.use(express.json({ limit: '5mb' }));

// ============================================================
// ⭐⭐⭐ STATIC FILES
// ============================================================
app.use(express.static(__dirname, { maxAge: '7d', etag: true }));

// ============================================================
// ⭐⭐⭐ HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now(),
        autoban: AUTOBAN_ENABLED,
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    });
});

// ============================================================
// ⭐⭐⭐ REQUEST LOGGER
// ============================================================
app.use((req, res, next) => {
    if (req.method === 'POST' || req.url.includes('/api/')) {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${getClientIp(req)}`);
    }
    next();
});

// ============================================================
// ⭐⭐⭐ IP BLOCK MIDDLEWARE (متسامح مع Whitelist)
// ============================================================
app.use((req, res, next) => {
    const ip = getClientIp(req);

    // ⭐ IPs موثوقة تتخطى كل الفحوصات
    if (isWhitelistedIP(ip)) return next();

    if (isIpBlocked(ip)) {
        logActivity({
            type: 'blocked_request',
            ip,
            path: req.path,
            method: req.method
        });
        return res.status(403).json({ success: false, error: 'Access denied' });
    }
    next();
});

// ============================================================
// ⭐⭐⭐ PRICING CONFIG
// ============================================================
const PRICING = {
    VIP_COST: 20000,
    CREATE_ROOM_COST: 9000,
    ALLOWED_BOOST_AMOUNTS: [1500, 6000, 54000]
};

const GAME_CONFIG = {
    minBet: 50,
    maxBet: 5000,
    vipMaxBet: 20000,
    bigWinThreshold: 10000,
    houseEdge: 0.04
};

// ============================================================
// ⭐⭐⭐ SOCKET.IO
// ============================================================
const io = socketIo(server, {
    cors: {
        origin: allowedOrigins.length ? allowedOrigins : true,
        methods: ['GET', 'POST'],
        credentials: true
    },
    maxHttpBufferSize: 5 * 1024 * 1024,   // ⭐ 5MB
    pingTimeout: 30000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],  // ⭐ fallback
    allowEIO3: true,
    path: '/socket.io/',
    perMessageDeflate: false,
    httpCompression: false,
    connectTimeout: 45000
});

const onlineUsers = new Map();

// ============================================================
// ⭐⭐⭐ MULTER SETUP
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

const imageFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
        return cb(new Error('Only JPEG/PNG/GIF/WebP images allowed'));
    }
    cb(null, true);
};

const audioFilter = (req, file, cb) => {
    const allowed = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav'];
    if (!allowed.includes(file.mimetype)) {
        return cb(new Error('Invalid audio format'));
    }
    cb(null, true);
};

const safeFilename = (original) => {
    const ext = path.extname(original).toLowerCase().replace(/[^.a-z0-9]/g, '');
    return Date.now() + '-' + uuidv4() + ext;
};

const profileStorage = multer.diskStorage({
    destination: profilePicsDir,
    filename: (req, file, cb) => cb(null, safeFilename(file.originalname))
});
const uploadProfile = multer({
    storage: profileStorage,
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: imageFilter
});

const roomImageStorage = multer.diskStorage({
    destination: roomImagesDir,
    filename: (req, file, cb) => cb(null, safeFilename(file.originalname))
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
    filename: (req, file, cb) => cb(null, safeFilename(file.originalname))
});
const uploadProof = multer({
    storage: proofStorage,
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: imageFilter
});

const supportStorage = multer.diskStorage({
    destination: supportDir,
    filename: (req, file, cb) => cb(null, safeFilename(file.originalname))
});
const uploadSupport = multer({
    storage: supportStorage,
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: imageFilter
});

app.use('/uploads', express.static(uploadsDir, {
    maxAge: '30d',
    immutable: true,
    setHeaders: (res) => {
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'");
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }
}));

// ============================================================
// ⭐⭐⭐ TELEGRAM NOTIFICATIONS
// ============================================================
function tgEscape(s) {
    return String(s ?? '').replace(/[&<>]/g, c =>
        c === '&' ? '&amp;' :
        c === '<' ? '&lt;' :
        c === '>' ? '&gt;' : c
    );
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
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.error('📨 Telegram failed:', res.statusCode);
                }
            });
        });
        req.on('error', err => console.error('📨 Telegram error:', err.message));
        req.write(payload);
        req.end();
    } catch (err) {
        console.error('📨 Telegram exception:', err.message);
    }
}

// ⭐ ربط Telegram بنظام Auto-Ban
setTelegramAlertSender((alert) => {
    const emoji = alert.type === 'AUTO_BAN' ? '🚫' : '⚠️';
    const severityEmoji = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🟢'
    }[alert.severity] || '⚠️';

    let text = `${emoji} <b>${alert.type}</b>\n`;
    text += `${severityEmoji} <b>Severity:</b> ${tgEscape(alert.severity || 'N/A')}\n`;
    if (alert.ip) text += `🌐 <b>IP:</b> <code>${tgEscape(alert.ip)}</code>\n`;
    if (alert.username) text += `👤 <b>User:</b> <code>${tgEscape(alert.username)}</code>\n`;
    if (alert.violation) text += `⚠️ <b>Violation:</b> ${tgEscape(alert.violation)}\n`;
    if (alert.score) text += `📊 <b>Score:</b> ${alert.score}\n`;
    if (alert.duration) {
        const mins = Math.floor(alert.duration / 60);
        const hours = Math.floor(mins / 60);
        const dur = hours > 0 ? `${hours}h ${mins % 60}m` : `${mins}m`;
        text += `⏱️ <b>Duration:</b> ${dur}\n`;
    }

    sendTelegramNotification(text);
});

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
// ⭐⭐⭐ MONGODB
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

    const adminUsername = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword || adminPassword.length < 8) {
        console.error('❌ FATAL: ADMIN_PASSWORD must be at least 8 characters');
        process.exit(1);
    }

    console.log('🔍 Checking admin account...');
    console.log('   Username:', adminUsername);
    console.log('   Password length:', adminPassword.length);

    const adminExists = await User.findOne({ username: adminUsername });

    if (!adminExists) {
        // ⭐ إنشاء admin جديد
        const hashed = await bcrypt.hash(adminPassword, 12);
        const adminCode = await generatePrivateCode();
        await User.create({
            username: adminUsername,
            displayName: 'admin',
            password: hashed,
            gender: 'Other',
            securityQuestion: process.env.ADMIN_SECURITY_Q || 'default',
            securityAnswer: (process.env.ADMIN_SECURITY_A || 'default').toLowerCase(),
            coins: 999999,
            isAdmin: true,
            privateCode: adminCode
        });
        console.log(`👑 Admin created: ${adminUsername}`);
        console.log(`🔑 Admin private code: ${adminCode} (SAVE THIS!)`);
    } else {
        // ⭐ تحديث تلقائي من ENV
        const passwordMatch = await bcrypt.compare(adminPassword, adminExists.password);

        if (!passwordMatch) {
            adminExists.password = await bcrypt.hash(adminPassword, 12);
            adminExists.isAdmin = true;
            await adminExists.save();
            console.log(`🔄 Admin password UPDATED from ENV variable`);
        } else {
            console.log(`✅ Admin exists with correct password from ENV`);
        }

        if (process.env.ADMIN_SECURITY_Q &&
            process.env.ADMIN_SECURITY_A &&
            (adminExists.securityQuestion !== process.env.ADMIN_SECURITY_Q ||
             adminExists.securityAnswer !== process.env.ADMIN_SECURITY_A.toLowerCase())) {
            adminExists.securityQuestion = process.env.ADMIN_SECURITY_Q;
            adminExists.securityAnswer = process.env.ADMIN_SECURITY_A.toLowerCase();
            await adminExists.save();
            console.log(`🔄 Admin security question updated`);
        }

        if (!adminExists.isAdmin) {
            adminExists.isAdmin = true;
            await adminExists.save();
            console.log(`🔄 Admin isAdmin flag restored`);
        }
    }
})
.catch(err => console.error('❌ MongoDB error:', err.message));

// ============================================================
// ⭐⭐⭐ SCHEMAS
// ============================================================
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, index: true },
    displayName: { type: String, required: true },
    password: { type: String, required: true },
    gender: { type: String, default: 'Not specified' },
    securityQuestion: { type: String, required: true },
    securityAnswer: { type: String, required: true, lowercase: true },
    coins: { type: Number, default: 100, min: 0 },
    friends: [{ type: String, lowercase: true }],
    createdAt: { type: Date, default: Date.now },
    vipExpires: { type: Date, default: null },
    profile_pic: { type: String, default: null },
    isAdmin: { type: Boolean, default: false },
    monthlyTarget: { type: Number, default: 0, min: 0 },
    totalTargetEarned: { type: Number, default: 0, min: 0 },
    totalPaid: { type: Number, default: 0, min: 0 },
    monthlyLoginDays: { type: [Number], default: [] },
    lastLoginDate: { type: Date, default: null },
    privateCode: { type: String, unique: true, sparse: true, index: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null }
});
userSchema.index({ vipExpires: 1 });
userSchema.index({ monthlyTarget: -1 });
userSchema.index({ coins: -1 });
const User = mongoose.model('User', userSchema);

const roomSchema = new mongoose.Schema({
    name: { type: String, required: true, maxlength: 50 },
    members: [{ type: String, lowercase: true }],
    messages: [{
        id: Number, username: String, message: String, timestamp: String,
        type: { type: String, default: 'text' },
        profilePic: String, isVIP: Boolean, isModerator: Boolean
    }],
    activity: { type: Number, default: 0 },
    boostLevel: { type: Number, default: 0, min: 0 },
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

const supportTicketSchema = new mongoose.Schema({
    ticketId: { type: String, required: true, unique: true, default: () => uuidv4().slice(0, 8) },
    username: { type: String, required: true, lowercase: true },
    subject: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 5000 },
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

// ============================================================
// ⭐⭐⭐ CACHE
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
// ⭐⭐⭐ HELPERS
// ============================================================
function normalizeUsername(username) {
    return (username || '').toLowerCase().trim();
}

async function isVIP(username) {
    const user = await User.findOne({ username: normalizeUsername(username) }, 'vipExpires').lean();
    if (!user || !user.vipExpires) return false;
    return new Date(user.vipExpires) > Date.now();
}

async function generatePrivateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code, exists = true, attempts = 0;
    while (exists && attempts < 20) {
        const bytes = crypto.randomBytes(10);
        code = '';
        for (let i = 0; i < 10; i++) {
            code += chars.charAt(bytes[i] % chars.length);
        }
        code = `${code.slice(0,4)}-${code.slice(4,8)}-${code.slice(8,10)}`;
        exists = await User.findOne({ privateCode: code }, '_id').lean();
        attempts++;
    }
    if (!code) throw new Error('Failed to generate unique code');
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
        streak,
        daysLeft: Math.max(0, 10 - streak),
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
                try { parsed = JSON.parse(data); } catch (_) {}
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// ============================================================
// ⭐⭐⭐ GAME LOGIC
// ============================================================
function rollCoinflip(choice) {
    const result = crypto.randomInt(0, 2) === 0 ? 'heads' : 'tails';
    const win = choice === result;
    const multiplier = win ? (2 - GAME_CONFIG.houseEdge) : 0;
    return { result, win, multiplier };
}

function rollDice(choice) {
    const n = Number(choice);
    const roll = crypto.randomInt(1, 7);
    const win = n === roll;
    const multiplier = win ? 5 : 0;
    return { result: roll, win, multiplier };
}

function spinSlot() {
    const symbols = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'];
    const r1 = symbols[crypto.randomInt(0, symbols.length)];
    const r2 = symbols[crypto.randomInt(0, symbols.length)];
    const r3 = symbols[crypto.randomInt(0, symbols.length)];
    let multiplier = 0, matchType = 0;
    if (r1 === r2 && r2 === r3) {
        matchType = 3;
        multiplier = (r1 === '💎' || r1 === '7️⃣') ? 20 : 10;
    } else if (r1 === r2 || r2 === r3 || r1 === r3) {
        matchType = 2;
        multiplier = 2;
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
    let r = crypto.randomInt(0, total);
    let picked = outcomes[0];
    for (const o of outcomes) {
        if (r < o.weight) { picked = o; break; }
        r -= o.weight;
    }
    return { result: picked.mult, win: picked.mult > 1, multiplier: picked.mult };
}

// ============================================================
// ⭐⭐⭐ AUTH MIDDLEWARE (متسامح)
// ============================================================
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const token = authHeader.slice(7);
    const currentFp = generateFingerprint(req);
    const result = verifyTokenWithFingerprint(token, currentFp, JWT_SECRET);
    const ip = getClientIp(req);

    if (!result.valid) {
        // ⭐ التوكن المنتهي يُرفض
        if (result.reason === 'expired') {
            logActivity({ type: 'expired_token', ip });
            return res.status(401).json({ success: false, error: 'Session expired' });
        }

        // ⭐⭐ fingerprint mismatch — متسامح
        if (result.reason === 'fingerprint_mismatch' && result.payload?.username) {
            logActivity({
                type: 'fingerprint_warning',
                ip,
                username: result.payload.username
            });

            req.authUser = result.payload.username;
            req.authIsAdmin = result.payload.isAdmin;
            req.authJti = result.payload.jti;
            req.authFp = currentFp;
            req.clientIp = ip;
            trackUserIP(result.payload.username, ip);
            return next();
        }

        // ⭐ حالات أخرى
        if (result.reason !== 'expired') {
            handleViolation(ip, 'invalid_token', result.payload?.username);
        }
        return res.status(401).json({ success: false, error: 'Invalid session' });
    }

    trackUserIP(result.payload.username, ip);

    req.authUser = result.payload.username;
    req.authIsAdmin = result.payload.isAdmin;
    req.authJti = result.payload.jti;
    req.authFp = currentFp;
    req.clientIp = ip;
    next();
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (!req.authIsAdmin) {
            return res.status(403).json({ success: false, error: 'Admin required' });
        }
        next();
    });
}

// ============================================================
// ⭐⭐⭐ RATE LIMITING MIDDLEWARE
// ============================================================
app.use('/api/', (req, res, next) => {
    const ip = getClientIp(req);

    // ⭐ IPs موثوقة تتخطى كل الحدود
    if (isRateLimitExempt(ip)) return next();

    const ipCheck = limiters.api.check(ip);
    if (!ipCheck.allowed) {
        handleViolation(ip, 'api_flood');
        return res.status(429).json({
            success: false,
            error: 'Too many requests',
            retryAfter: ipCheck.retryAfter
        });
    }

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        const result = verifyTokenWithFingerprint(
            authHeader.slice(7),
            generateFingerprint(req),
            JWT_SECRET
        );
        if (result.valid && result.payload?.username) {
            // ⭐ تخطى لمستخدمين موثوقين
            if (isWhitelistedUser(result.payload.username)) return next();

            const userCheck = limiters.apiUser.check(result.payload.username);
            if (!userCheck.allowed) {
                handleViolation(ip, 'api_flood', result.payload.username);
                return res.status(429).json({
                    success: false,
                    error: 'Slow down',
                    retryAfter: userCheck.retryAfter
                });
            }
        }
    }

    next();
});

// ============================================================
// ⭐⭐⭐ API: TURN CREDENTIALS
// ============================================================
app.get('/api/turn-credentials', requireAuth, async (req, res) => {
    const ident = process.env.XIRSYS_IDENT;
    const secret = process.env.XIRSYS_SECRET;
    const channel = process.env.XIRSYS_CHANNEL;
    if (!ident || !secret || !channel) {
        return res.status(500).json({ error: 'Xirsys not configured' });
    }
    const options = {
        host: 'global.xirsys.net',
        path: `/_turn/${channel}`,
        method: 'PUT',
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
            } catch (e) {
                res.status(500).json({ error: 'Parse error' });
            }
        });
    });
    httpreq.on('error', () => res.status(500).json({ error: 'TURN server error' }));
    httpreq.end();
});

// ============================================================
// ⭐⭐⭐ API: REGISTER (متسامح)
// ============================================================
app.post('/api/register',
    body('username').isString().trim().isLength({ min: 2, max: 30 })
        .matches(/^[a-zA-Z0-9_\u0600-\u06FF]+$/),
    body('password').isString().isLength({ min: 6, max: 128 }),
    body('gender').optional().isIn(['Male', 'Female', 'Other', 'Not specified', '']),
    body('securityQuestion').isString().trim().isLength({ min: 3, max: 200 }),
    body('securityAnswer').isString().trim().isLength({ min: 1, max: 100 }),
    async (req, res) => {
        try {
            const ip = getClientIp(req);

            // ⭐ فحص Rate Limit
            if (!isRateLimitExempt(ip)) {
                const regCheck = limiters.register.check(ip);
                if (!regCheck.allowed) {
                    logActivity({
                        type: 'register_flood_warning',
                        ip
                    });
                    return res.status(429).json({
                        success: false,
                        error: 'Too many registrations. Try later.'
                    });
                }
            }

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.json({ success: false, error: 'Invalid input: ' + errors.array()[0].msg });
            }

            const { username, password, gender, securityQuestion, securityAnswer } = req.body;
            const norm = normalizeUsername(username);

            const existing = await User.findOne({ username: norm }, '_id').lean();
            if (existing) return res.json({ success: false, error: 'Username exists' });

            const hashed = await bcrypt.hash(password, 12);
            const privateCode = await generatePrivateCode();

            const user = new User({
                username: norm,
                displayName: username,
                password: hashed,
                gender: gender || 'Not specified',
                securityQuestion: securityQuestion.trim(),
                securityAnswer: securityAnswer.trim().toLowerCase(),
                coins: 100,
                privateCode
            });
            await user.save();
            tgNotifyNewUser(user.username);
            res.json({ success: true, privateCode });
        } catch (err) {
            console.error('Register error:', err);
            res.json({ success: false, error: 'Registration failed' });
        }
    }
);

// ============================================================
// ⭐⭐⭐ API: LOGIN (متسامح)
// ============================================================
app.post('/api/login',
    body('username').isString().trim().isLength({ min: 1, max: 30 }),
    body('password').isString().isLength({ min: 1, max: 128 }),
    async (req, res) => {
        try {
            const ip = getClientIp(req);
            const username = normalizeUsername(req.body.username);

            // ⭐ IP موثوق → تخطى كل الحدود
            if (!isRateLimitExempt(ip) && !isWhitelistedUser(username)) {
                const ipCheck = limiters.login.check(ip);
                if (!ipCheck.allowed) {
                    logActivity({
                        type: 'login_flood_warning',
                        ip,
                        username
                    });
                    return res.status(429).json({
                        success: false,
                        error: 'Too many attempts. Wait ' + ipCheck.retryAfter + 's',
                        retryAfter: ipCheck.retryAfter
                    });
                }

                const userCheck = limiters.loginUser.check(username);
                if (!userCheck.allowed) {
                    logActivity({
                        type: 'targeted_bruteforce_warning',
                        ip,
                        username
                    });
                    return res.status(429).json({
                        success: false,
                        error: 'Account temporarily locked'
                    });
                }
            }

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.json({ success: false, error: 'Invalid credentials' });
            }

            const { password } = req.body;
            const user = await User.findOne({ username });

            if (!user) {
                await bcrypt.hash(password, 10);
                logActivity({
                    type: 'failed_login',
                    username,
                    ip,
                    reason: 'user_not_found'
                });
                return res.json({ success: false, error: 'Invalid credentials' });
            }

            if (user.lockedUntil && user.lockedUntil > Date.now()) {
                return res.json({
                    success: false,
                    error: 'Account temporarily locked. Try again later.'
                });
            }

            const ok = await bcrypt.compare(password, user.password);
            if (!ok) {
                user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

                if (user.failedLoginAttempts >= 10) {   // ⭐ رفع من 5 إلى 10
                    user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
                    user.failedLoginAttempts = 0;
                    logActivity({
                        type: 'account_locked',
                        username,
                        ip
                    });
                }
                await user.save();

                logActivity({
                    type: 'failed_login',
                    username,
                    ip,
                    attempts: user.failedLoginAttempts
                });

                return res.json({ success: false, error: 'Invalid credentials' });
            }

            // ⭐ نجح
            user.failedLoginAttempts = 0;
            user.lockedUntil = null;

            trackUserIP(username, ip);

            if (!user.privateCode) {
                user.privateCode = await generatePrivateCode();
            }
            const streakInfo = await updateLoginStreak(user);
            await user.save();

            const fingerprint = generateFingerprint(req);
            const token = signTokenWithFingerprint(
                { username: user.username, isAdmin: user.isAdmin },
                fingerprint,
                JWT_SECRET
            );

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
                    username: user.username,
                    coins: user.coins,
                    isAdmin: user.isAdmin,
                    profile_pic: user.profile_pic,
                    isVIP: await isVIP(user.username),
                    vipExpires: user.vipExpires,
                    monthlyTarget: user.monthlyTarget || 0,
                    consecutiveLoginDays: user.monthlyLoginDays ? user.monthlyLoginDays.length : 0
                },
                streakInfo,
                token
            });
        } catch (err) {
            console.error('Login error:', err);
            res.json({ success: false, error: 'Login failed' });
        }
    }
);

// ============================================================
// ⭐⭐⭐ API: AUTO-LOGIN
// ============================================================
app.get('/api/auto-login', requireAuth, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.authUser });
        if (!user) return res.json({ success: false });

        if (!user.privateCode) {
            user.privateCode = await generatePrivateCode();
        }
        const streakInfo = await updateLoginStreak(user);
        await user.save();

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
                username: user.username,
                coins: user.coins,
                isAdmin: user.isAdmin,
                profile_pic: user.profile_pic,
                isVIP: await isVIP(user.username),
                vipExpires: user.vipExpires,
                monthlyTarget: user.monthlyTarget || 0,
                consecutiveLoginDays: user.monthlyLoginDays ? user.monthlyLoginDays.length : 0
            },
            streakInfo
        });
    } catch (err) {
        console.error('Auto-login error:', err);
        res.json({ success: false });
    }
});

// ============================================================
// ⭐⭐⭐ API: PRIVATE CODE
// ============================================================
app.get('/api/get-private-code', requireAuth,
    query('username').isString().trim().isLength({ min: 1, max: 30 }),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return res.status(400).json({ success: false });

            const targetUser = normalizeUsername(req.query.username);
            const isOwner = targetUser === req.authUser;
            const isAdminUser = req.authIsAdmin;

            if (!isOwner && !isAdminUser) {
                return res.status(403).json({ success: false, error: 'Access denied' });
            }

            const user = await User.findOne({ username: targetUser });
            if (!user) return res.json({ success: false, error: 'User not found' });

            if (!user.privateCode) {
                user.privateCode = await generatePrivateCode();
                await user.save();
            }
            res.json({ success: true, privateCode: user.privateCode });
        } catch (err) {
            res.json({ success: false, error: 'Failed' });
        }
    }
);

// ============================================================
// ⭐⭐⭐ API: USER PROFILE
// ============================================================
app.get('/api/user-profile', requireAuth,
    query('username').isString().trim().isLength({ min: 1, max: 30 }),
    async (req, res) => {
        try {
            const norm = normalizeUsername(req.query.username);
            const cached = getCachedProfile(norm);
            if (cached) return res.json(cached);

            const user = await User.findOne({ username: norm })
                .select('profile_pic coins isAdmin vipExpires monthlyTarget').lean();
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
        } catch (err) {
            res.status(500).json({ success: false });
        }
    }
);

// ============================================================
// ⭐⭐⭐ API: UPLOAD PROFILE PIC
// ============================================================
app.post('/api/upload-profile-pic-base64', requireAuth,
    body('profilePicBase64').isString().isLength({ min: 10, max: 2 * 1024 * 1024 }),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return res.json({ success: false, error: 'Invalid image' });

            const { profilePicBase64 } = req.body;
            if (!profilePicBase64.startsWith('data:image/')) {
                return res.json({ success: false, error: 'Invalid format' });
            }
            const mimeMatch = profilePicBase64.match(/^data:(image\/(jpeg|png|gif|webp));base64,/);
            if (!mimeMatch) return res.json({ success: false, error: 'Only JPEG/PNG/GIF/WebP' });

            if (Buffer.byteLength(profilePicBase64, 'utf8') > 1.5 * 1024 * 1024) {
                return res.json({ success: false, error: 'Too large (max 1.5MB)' });
            }

            const user = await User.findOne({ username: req.authUser });
            if (!user) return res.json({ success: false, error: 'User not found' });

            user.profile_pic = profilePicBase64;
            await user.save();
            clearProfileCache(user.username);
            res.json({ success: true, profilePic: profilePicBase64 });
        } catch (err) {
            res.json({ success: false, error: 'Upload failed' });
        }
    }
);

app.post('/api/upload-room-image', requireAuth,
    uploadRoomImage.single('roomImage'),
    (req, res) => {
        if (!req.file) return res.json({ success: false });
        res.json({ success: true, imageUrl: '/uploads/room-images/' + path.basename(req.file.path) });
    }
);

app.post('/api/upload-voice', requireAuth,
    uploadVoice.single('audio'),
    (req, res) => {
        if (!req.file) return res.json({ success: false });
        res.json({ success: true, url: '/uploads/voice/' + path.basename(req.file.path) });
    }
);

// ============================================================
// ⭐⭐⭐ API: SEND GIFT
// ============================================================
app.post('/api/send-gift', requireAuth,
    body('to').isString().trim().isLength({ min: 1, max: 30 }),
    body('amount').isInt({ min: 100, max: 1000000 }),
    body('message').optional().isString().trim().isLength({ max: 200 }),
    async (req, res) => {
        try {
            if (!isWhitelistedUser(req.authUser)) {
                const giftCheck = limiters.gift.check(req.authUser);
                if (!giftCheck.allowed) {
                    logActivity({
                        type: 'gift_flood_warning',
                        username: req.authUser,
                        ip: req.clientIp
                    });
                    return res.status(429).json({ success: false, error: 'Too many gifts' });
                }
            }

            const errors = validationResult(req);
            if (!errors.isEmpty()) return res.json({ success: false, error: 'Invalid input' });

            const { to, amount, message } = req.body;
            const from = req.authUser;
            const toNorm = normalizeUsername(to);

            if (from === toNorm) return res.json({ success: false, error: 'Cannot gift yourself' });

            const [fromUser, toUser] = await Promise.all([
                User.findOne({ username: from }),
                User.findOne({ username: toNorm })
            ]);
            if (!fromUser || !toUser || fromUser.coins < amount) {
                return res.json({ success: false, error: 'Insufficient coins or user not found' });
            }

            fromUser.coins -= amount;
            const oldMilestone = Math.floor((toUser.monthlyTarget || 0) / 50000);
            const targetContribution = Math.floor(amount / 2);
            toUser.monthlyTarget = (toUser.monthlyTarget || 0) + targetContribution;
            toUser.totalTargetEarned = (toUser.totalTargetEarned || 0) + targetContribution;
            const newMilestone = Math.floor(toUser.monthlyTarget / 50000);
            await Promise.all([fromUser.save(), toUser.save()]);
            clearProfileCache(fromUser.username);
            clearProfileCache(toUser.username);

            await Gift.create({ from, to: toUser.username, amount, message, targetContribution });
            await CoinRequest.create({ username: fromUser.username, type: 'Send Gift', amount: -amount });
            await CoinRequest.create({ username: toUser.username, type: 'Target from Gift', amount: targetContribution });

            io.emit('gift-received', { from, to: toUser.username, amount, message });
            io.emit('gift-ticker', { from, to: toUser.username, amount });

            const toSocket = onlineUsers.get(toUser.username);
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
            res.json({ success: false, error: 'Gift failed' });
        }
    }
);

app.get('/api/get-gifts', requireAuth, async (req, res) => {
    const gifts = await Gift.find().sort({ timestamp: -1 }).limit(200).lean();
    res.json(gifts);
});

// ============================================================
// ⭐⭐⭐ API: TARGET INFO
// ============================================================
app.get('/api/get-target-info', requireAuth, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.authUser })
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
            success: true,
            monthlyTarget, dollarsEarned, nextMilestone,
            nextReward: dollarsEarned + 25,
            totalTargetEarned: user.totalTargetEarned || 0,
            totalPaid: user.totalPaid || 0,
            consecutiveLoginDays: streak,
            daysLeft: Math.max(0, 10 - streak),
            daysUntilMonthEnd
        });
    } catch (err) {
        res.json({ success: false });
    }
});

// ============================================================
// ⭐⭐⭐ API: PAYOUTS
// ============================================================
app.get('/api/get-payouts', requireAuth, async (req, res) => {
    if (req.authIsAdmin && req.query.admin === 'true') {
        const payouts = await Payout.find().sort({ createdAt: -1 }).limit(200).lean();
        return res.json(payouts);
    }
    const payouts = await Payout.find({ username: req.authUser })
        .sort({ createdAt: -1 }).lean();
    res.json(payouts);
});

app.post('/api/mark-payout-paid', requireAdmin,
    body('payoutId').isMongoId(),
    async (req, res) => {
        const payout = await Payout.findById(req.body.payoutId);
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
            username: payout.username,
            dollars: payout.dollarsEarned,
            month: payout.month,
            adminUsername: req.authUser
        });
        const userSocket = onlineUsers.get(payout.username);
        if (userSocket) {
            io.to(userSocket).emit('payout-paid', {
                amount: payout.dollarsEarned,
                month: payout.month
            });
        }
        res.json({ success: true });
    }
);

// ============================================================
// ⭐⭐⭐ API: FRIENDS
// ============================================================
app.get('/api/get-friends', requireAuth, async (req, res) => {
    const user = await User.findOne({ username: req.authUser }, 'friends').lean();
    if (!user) return res.json([]);
    res.json(user.friends);
});

app.get('/api/get-friend-requests', requireAuth, async (req, res) => {
    const requests = await FriendRequest.find({ to: req.authUser }).lean();
    res.json(requests);
});

app.post('/api/delete-friend', requireAuth,
    body('friend').isString().trim().isLength({ min: 1, max: 30 }),
    async (req, res) => {
        const normUser = req.authUser;
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
    }
);

app.get('/api/get-all-users', requireAuth, async (req, res) => {
    const users = await User.find({}, 'username profile_pic').limit(500).lean();
    res.json(users);
});

// ============================================================
// ⭐⭐⭐ API: VIP
// ============================================================
app.post('/api/buy-vip', requireAuth, async (req, res) => {
    const user = await User.findOne({ username: req.authUser });
    if (!user || user.coins < PRICING.VIP_COST) {
        return res.json({ success: false, error: `Need ${PRICING.VIP_COST} coins` });
    }
    user.coins -= PRICING.VIP_COST;
    const currentExpiry = user.vipExpires && user.vipExpires > new Date()
        ? user.vipExpires
        : new Date();
    user.vipExpires = new Date(currentExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);
    await user.save();
    clearProfileCache(user.username);
    await CoinRequest.create({
        username: user.username,
        type: 'Buy VIP',
        amount: -PRICING.VIP_COST
    });
    res.json({ success: true });
});

app.get('/api/get-vip-status', requireAuth, async (req, res) => {
    const user = await User.findOne({ username: req.authUser }, 'vipExpires').lean();
    const isActive = user?.vipExpires && new Date(user.vipExpires) > Date.now();
    res.json({ success: isActive, expires: user?.vipExpires });
});

// ============================================================
// ⭐⭐⭐ API: MANUAL COIN REQUEST
// ============================================================
app.post('/api/manual-coin-request', requireAuth,
    uploadProof.single('proofFile'),
    body('amount').isInt({ min: 100, max: 10000000 }),
    body('paymentMethod').isIn(['giftcard', 'crypto']),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) return res.json({ success: false, error: 'Invalid input' });

            const { amount, paymentMethod, giftCardNumber, cryptoTransactionId } = req.body;
            const proof = req.file ? '/uploads/proofs/' + path.basename(req.file.path) : null;

            await ManualCoinRequest.create({
                username: req.authUser,
                amount: parseInt(amount),
                paymentMethod,
                giftCardNumber: (giftCardNumber || '').substring(0, 200),
                cryptoTransactionId: (cryptoTransactionId || '').substring(0, 200),
                proof
            });
            tgNotifyManualCoinRequest({
                username: req.authUser,
                amount, method: paymentMethod,
                giftCardNumber, cryptoTransactionId, proof
            });
            res.json({ success: true });
        } catch (err) {
            res.json({ success: false, error: 'Failed' });
        }
    }
);

app.get('/api/get-coin-history', requireAuth, async (req, res) => {
    const history = await CoinRequest.find({ username: req.authUser })
        .sort({ date: -1 }).limit(500).lean();
    res.json(history);
});

// ============================================================
// ⭐⭐⭐ API: ROOM MEMBERS
// ============================================================
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

// ============================================================
// ⭐⭐⭐ API: KICK USER
// ============================================================
app.post('/api/kick-user', requireAuth,
    body('roomName').isString().trim().isLength({ min: 1, max: 50 }),
    body('username').isString().trim().isLength({ min: 1, max: 30 }),
    async (req, res) => {
        if (!isWhitelistedUser(req.authUser)) {
            const kickCheck = limiters.kick.check(req.authUser);
            if (!kickCheck.allowed) {
                return res.status(429).json({ success: false });
            }
        }

        const { roomName, username } = req.body;
        const room = await findRoomInsensitive(roomName);
        if (!room) return res.json({ success: false });

        const isOwner = room.owner === req.authUser;
        const isMod = room.moderators.includes(req.authUser);
        const isAdminUser = req.authIsAdmin;
        if (!isOwner && !isMod && !isAdminUser) return res.json({ success: false });

        const targetNorm = normalizeUsername(username);
        if (targetNorm === room.owner) return res.json({ success: false, error: 'Cannot kick owner' });

        if (!room.kicked.includes(targetNorm)) room.kicked.push(targetNorm);
        room.members = room.members.filter(m => m !== targetNorm);
        await room.save();

        const targetSocket = onlineUsers.get(targetNorm);
        if (targetSocket) io.to(targetSocket).emit('kicked-from-room', { room: room.name });
        io.to(room.name).emit('user-left-room', { username: targetNorm });
        res.json({ success: true });
    }
);

app.post('/api/unban-user', requireAuth,
    body('roomName').isString().trim().isLength({ min: 1, max: 50 }),
    body('username').isString().trim().isLength({ min: 1, max: 30 }),
    async (req, res) => {
        const { roomName, username } = req.body;
        const room = await findRoomInsensitive(roomName);
        if (!room) return res.json({ success: false });

        const isOwner = room.owner === req.authUser;
        if (!isOwner && !req.authIsAdmin) return res.json({ success: false });

        room.kicked = room.kicked.filter(k => k !== normalizeUsername(username));
        await room.save();
        res.json({ success: true });
    }
);

// ============================================================
// ⭐⭐⭐ API: ROOM SETTINGS
// ============================================================
app.get('/api/room-settings/:roomName', requireAuth, async (req, res) => {
    const room = await findRoomInsensitive(req.params.roomName);
    if (!room) return res.json({ success: false });

    const isMember = room.members.includes(req.authUser) ||
                     room.owner === req.authUser ||
                     room.moderators.includes(req.authUser);
    if (!isMember) return res.status(403).json({ success: false });

    res.json({
        success: true,
        membersOnly: room.membersOnly,
        allowedMembers: room.allowedMembers,
        moderators: room.moderators
    });
});

app.post('/api/room-settings', requireAuth,
    body('roomName').isString().trim().isLength({ min: 1, max: 50 }),
    body('membersOnly').isBoolean(),
    async (req, res) => {
        const { roomName, membersOnly } = req.body;
        const room = await findRoomInsensitive(roomName);
        if (!room || room.owner !== req.authUser) {
            return res.json({ success: false, error: 'Only owner can change' });
        }
        room.membersOnly = membersOnly;
        if (membersOnly) {
            room.members.forEach(member => {
                if (!room.allowedMembers.includes(member)) room.allowedMembers.push(member);
            });
        }
        await room.save();
        res.json({ success: true });
    }
);

// ============================================================
// ⭐⭐⭐ API: ADMIN CLEAR
// ============================================================
app.post('/api/clear-friend-requests', requireAdmin, async (req, res) => {
    await FriendRequest.deleteMany({});
    res.json({ success: true });
});

app.post('/api/clear-coin-requests', requireAdmin, async (req, res) => {
    await CoinRequest.deleteMany({});
    res.json({ success: true });
});

app.get('/api/get-boost-logs', requireAdmin, async (req, res) => {
    const logs = await BoostLog.find().sort({ timestamp: -1 }).limit(50).lean();
    res.json(logs);
});

// ============================================================
// ⭐⭐⭐ API: PENDING MANUAL REQUESTS
// ============================================================
app.get('/api/get-pending-manual-requests', requireAdmin, async (req, res) => {
    const requests = await ManualCoinRequest.find({ status: 'pending' }).lean();
    res.json(requests);
});

app.post('/api/approve-manual-request', requireAdmin,
    body('requestId').isMongoId(),
    async (req, res) => {
        const reqDoc = await ManualCoinRequest.findById(req.body.requestId);
        if (!reqDoc) return res.json({ success: false });

        const user = await User.findOne({ username: reqDoc.username });
        if (user) {
            user.coins += reqDoc.amount;
            await user.save();
            clearProfileCache(user.username);
            await CoinRequest.create({
                username: user.username,
                type: 'Manual Coin Request',
                amount: reqDoc.amount
            });
            const userSocket = onlineUsers.get(reqDoc.username);
            if (userSocket) io.to(userSocket).emit('coins-updated', user.coins);
            sendTelegramNotification(
                `✅ <b>Approved</b>\n👤 <code>${tgEscape(reqDoc.username)}</code>\n🪙 +${tgEscape(reqDoc.amount)}\n👑 <code>${tgEscape(req.authUser)}</code>`
            );
        }
        reqDoc.status = 'approved';
        await reqDoc.save();
        res.json({ success: true });
    }
);

app.post('/api/reject-manual-request', requireAdmin,
    body('requestId').isMongoId(),
    async (req, res) => {
        await ManualCoinRequest.findByIdAndDelete(req.body.requestId);
        res.json({ success: true });
    }
);

// ============================================================
// ⭐⭐⭐ API: ADMIN GIVE COINS
// ============================================================
app.post('/api/admin-give-coins', requireAdmin,
    body('username').isString().trim().isLength({ min: 1, max: 30 }),
    body('amount').isInt({ min: -1000000, max: 1000000 }),
    async (req, res) => {
        const { username, amount } = req.body;
        const user = await User.findOne({ username: normalizeUsername(username) });
        if (user) {
            user.coins = Math.max(0, user.coins + parseInt(amount));
            await user.save();
            clearProfileCache(user.username);
            await CoinRequest.create({
                username: user.username,
                type: 'Admin Gift',
                amount: parseInt(amount)
            });
            const userSocket = onlineUsers.get(user.username);
            if (userSocket) {
                io.to(userSocket).emit('admin-gift', { amount });
                io.to(userSocket).emit('coins-updated', user.coins);
            }
        }
        res.json({ success: true });
    }
);

// ============================================================
// ⭐⭐⭐ API: ADMIN RESET PASSWORD
// ============================================================
app.post('/api/admin-reset-password', requireAdmin,
    body('username').isString().trim().isLength({ min: 1, max: 30 }),
    body('newPassword').isString().isLength({ min: 6, max: 128 }),
    async (req, res) => {
        const { username, newPassword } = req.body;
        const user = await User.findOne({ username: normalizeUsername(username) });
        if (user) {
            user.password = await bcrypt.hash(newPassword, 12);
            user.failedLoginAttempts = 0;
            user.lockedUntil = null;
            await user.save();
        }
        res.json({ success: true });
    }
);

// ============================================================
// ⭐⭐⭐ API: ADMIN USERS/ROOMS
// ============================================================
app.get('/api/admin/get-all-users', requireAdmin, async (req, res) => {
    const users = await User.find({}, 'username coins isAdmin privateCode')
        .limit(1000).lean();
    res.json(users);
});

app.post('/api/delete-user', requireAdmin,
    body('username').isString().trim().isLength({ min: 1, max: 30 }),
    async (req, res) => {
        const target = normalizeUsername(req.body.username);
        if (target === req.authUser) {
            return res.json({ success: false, error: 'Cannot delete yourself' });
        }
        await User.deleteOne({ username: target });
        clearProfileCache(target);
        res.json({ success: true });
    }
);

app.get('/api/get-all-rooms', requireAdmin, async (req, res) => {
    const rooms = await Room.find({}, 'name owner').lean();
    res.json(rooms);
});

app.delete('/api/delete-room', requireAdmin,
    body('roomName').isString().trim().isLength({ min: 1, max: 50 }),
    async (req, res) => {
        await Room.deleteOne({ name: req.body.roomName });
        res.json({ success: true });
    }
);

// ============================================================
// ⭐⭐⭐ API: SECURITY DASHBOARD
// ============================================================
app.get('/api/admin/security/stats', requireAdmin, (req, res) => {
    try {
        const stats = getSecurityStats();
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

app.get('/api/admin/security/log', requireAdmin, (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const log = getActivityLog(limit);
        res.json({ success: true, log });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

app.get('/api/admin/security/blocked-ips', requireAdmin, (req, res) => {
    try {
        const blocked = listBlockedIPs();
        res.json({ success: true, blocked });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

app.post('/api/admin/security/unblock-ip', requireAdmin,
    body('ip').isString().trim().isLength({ min: 7, max: 45 }),
    async (req, res) => {
        try {
            const success = unbanIP(req.body.ip, req.authUser);
            res.json({ success });
        } catch (err) {
            res.status(500).json({ success: false, error: 'Failed' });
        }
    }
);

app.post('/api/admin/security/block-ip', requireAdmin,
    body('ip').isString().trim().isLength({ min: 7, max: 45 }),
    body('duration').optional().isInt({ min: 60, max: 31536000 }),
    body('reason').optional().isString().trim().isLength({ max: 200 }),
    async (req, res) => {
        try {
            const duration = parseInt(req.body.duration) || 3600;
            const reason = req.body.reason || 'manual_block';
            banIP(req.body.ip, duration, reason, req.authUser);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: 'Failed' });
        }
    }
);

app.post('/api/admin/security/clear-suspicion', requireAdmin,
    body('username').isString().trim().isLength({ min: 1, max: 30 }),
    async (req, res) => {
        try {
            // ⭐ FIX: clearSuspicion الآن مُستوردة بشكل صحيح
            clearSuspicion(normalizeUsername(req.body.username));
            logActivity({
                type: 'admin_clear_suspicion',
                admin: req.authUser,
                target: req.body.username
            });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: 'Failed' });
        }
    }
);

app.get('/api/admin/security/limiters', requireAdmin, (req, res) => {
    try {
        const stats = {};
        for (const [name, limiter] of Object.entries(limiters)) {
            if (limiter.buckets) {
                stats[name] = {
                    type: limiter.windowMs ? 'sliding_window' : 'token_bucket',
                    windowMs: limiter.windowMs || null,
                    maxRequests: limiter.maxRequests || null,
                    capacity: limiter.capacity || null,
                    refillRate: limiter.refillRate || null,
                    activeKeys: limiter.buckets.size
                };
            }
        }
        res.json({ success: true, limiters: stats });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

// ============================================================
// ⭐⭐⭐ API: BANS MANAGEMENT
// ============================================================
app.get('/api/admin/bans/list', requireAdmin, (req, res) => {
    try {
        const bans = listAllBans();
        res.json({ success: true, bans });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
});

app.post('/api/admin/bans/ban', requireAdmin,
    body('ip').isString().trim().isLength({ min: 7, max: 45 }),
    body('duration').isInt({ min: 60, max: 2592000 }),
    body('reason').isString().trim().isLength({ min: 3, max: 200 }),
    async (req, res) => {
        const { ip, duration, reason } = req.body;
        banIP(ip, duration, reason, req.authUser);
        res.json({ success: true });
    }
);

app.post('/api/admin/bans/unban', requireAdmin,
    body('ip').isString().trim().isLength({ min: 7, max: 45 }),
    async (req, res) => {
        const success = unbanIP(req.body.ip, req.authUser);
        res.json({ success });
    }
);

app.get('/api/admin/bans/violations/:key', requireAdmin, (req, res) => {
    const key = req.params.key;
    const userViolations = getUserViolations(key);
    const userIPList = getUserIPs(key);
    res.json({
        success: true,
        violations: userViolations,
        linkedIPs: userIPList
    });
});

app.post('/api/admin/bans/clear', requireAdmin,
    body('key').isString().trim().isLength({ min: 1, max: 50 }),
    async (req, res) => {
        clearViolations(req.body.key);
        logActivity({
            type: 'admin_clear_violations',
            admin: req.authUser,
            target: req.body.key
        });
        res.json({ success: true });
    }
);

// ⭐⭐⭐ API: Emergency clear all
app.post('/api/admin/bans/clear-all', requireAdmin, async (req, res) => {
    clearAllBans();
    logActivity({
        type: 'admin_clear_all_bans',
        admin: req.authUser
    });
    res.json({ success: true });
});

// ============================================================
// ⭐⭐⭐ API: SUPPORT TICKETS
// ============================================================
app.post('/api/support/submit', requireAuth,
    uploadSupport.single('screenshot'),
    body('subject').isString().trim().isLength({ min: 3, max: 200 }),
    body('message').isString().trim().isLength({ min: 3, max: 5000 }),
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ success: false, error: 'Invalid input' });
            }

            const { subject, message } = req.body;
            const screenshot = req.file
                ? '/uploads/support/' + path.basename(req.file.path)
                : null;
            const ticketId = uuidv4().slice(0, 8);

            const ticket = new SupportTicket({
                ticketId,
                username: req.authUser,
                subject,
                message,
                screenshot
            });
            await ticket.save();
            tgNotifySupportTicket({
                ticketId,
                username: req.authUser,
                subject,
                message,
                screenshot
            });
            io.emit('new-support-ticket', {
                username: req.authUser,
                subject,
                ticketId
            });
            res.json({ success: true, ticketId });
        } catch (err) {
            res.status(500).json({ success: false, error: 'Failed' });
        }
    }
);

app.get('/api/support/tickets', requireAdmin, async (req, res) => {
    const status = req.query.status;
    const filter = (!status || status === 'all') ? {} : { status };
    const tickets = await SupportTicket.find(filter)
        .sort({ createdAt: -1 }).limit(200).lean();
    res.json(tickets);
});

app.post('/api/support/reply', requireAdmin,
    body('ticketId').isString().trim().isLength({ min: 1, max: 20 }),
    body('reply').isString().trim().isLength({ min: 1, max: 5000 }),
    async (req, res) => {
        const { ticketId, reply } = req.body;
        const ticket = await SupportTicket.findOne({ ticketId });
        if (!ticket) return res.status(404).json({ success: false });

        const normalizedUser = normalizeUsername(ticket.username);

        await Notification.create({
            username: normalizedUser,
            title: 'Support Reply',
            message: `Admin replied to ticket ${ticket.ticketId}`,
            type: 'support_reply',
            data: { ticketId: ticket.ticketId, reply }
        });
        const userSocket = onlineUsers.get(normalizedUser);
        if (userSocket) {
            io.to(userSocket).emit('support-reply', {
                ticketId: ticket.ticketId, reply
            });
        }
        ticket.adminReply = reply;
        ticket.status = 'in-progress';
        ticket.updatedAt = Date.now();
        await ticket.save();
        res.json({ success: true });
    }
);

app.post('/api/support/resolve', requireAdmin,
    body('ticketId').isString().trim().isLength({ min: 1, max: 20 }),
    async (req, res) => {
        const { ticketId } = req.body;
        const ticket = await SupportTicket.findOne({ ticketId });
        if (!ticket) return res.status(404).json({ success: false });

        const normalizedUser = normalizeUsername(ticket.username);

        await Notification.create({
            username: normalizedUser,
            title: 'Ticket Resolved',
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
    }
);

app.post('/api/support/clear-all', requireAdmin, async (req, res) => {
    const tickets = await SupportTicket.find({}).lean();
    for (const ticket of tickets) {
        const normalizedUser = normalizeUsername(ticket.username);
        await Notification.create({
            username: normalizedUser,
            title: 'Ticket Closed',
            message: `Your support ticket ${ticket.ticketId} has been closed.`,
            type: 'support_resolved',
            data: { ticketId: ticket.ticketId }
        });
        const userSocket = onlineUsers.get(normalizedUser);
        if (userSocket) {
            io.to(userSocket).emit('support-resolved', {
                ticketId: ticket.ticketId, message: 'Closed'
            });
        }
    }
    const result = await SupportTicket.deleteMany({});
    res.json({ success: true, deletedCount: result.deletedCount });
});

// ============================================================
// ⭐⭐⭐ API: NOTIFICATIONS
// ============================================================
app.get('/api/notifications/pending', requireAuth, async (req, res) => {
    const notifications = await Notification.find({
        username: req.authUser, read: false
    }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, notifications });
});

app.post('/api/notifications/mark-read', requireAuth,
    body('ids').optional().isArray({ max: 100 }),
    async (req, res) => {
        const filter = { username: req.authUser };
        if (Array.isArray(req.body.ids) && req.body.ids.length) {
            filter._id = { $in: req.body.ids };
        }
        await Notification.updateMany(filter, { $set: { read: true } });
        res.json({ success: true });
    }
);

// ============================================================
// ⭐⭐⭐ API: SECURITY QUESTIONS
// ============================================================
app.post('/api/get-security-question',
    body('username').isString().trim().isLength({ min: 1, max: 30 }),
    async (req, res) => {
        const ip = getClientIp(req);

        if (!isRateLimitExempt(ip)) {
            const check = limiters.login.check(ip);
            if (!check.allowed) {
                return res.status(429).json({ success: false });
            }
        }

        const user = await User.findOne(
            { username: normalizeUsername(req.body.username) },
            'securityQuestion'
        ).lean();
        if (!user) return res.json({ success: false, error: 'User not found' });
        if (!user.securityQuestion) return res.json({ success: false, error: 'No question set' });
        res.json({ success: true, question: user.securityQuestion });
    }
);

app.post('/api/reset-password',
    body('username').isString().trim().isLength({ min: 1, max: 30 }),
    body('answer').isString().trim().isLength({ min: 1, max: 100 }),
    body('newPassword').isString().isLength({ min: 6, max: 128 }),
    async (req, res) => {
        const ip = getClientIp(req);

        if (!isRateLimitExempt(ip)) {
            const check = limiters.login.check(ip);
            if (!check.allowed) {
                return res.status(429).json({ success: false });
            }
        }

        const { username, answer, newPassword } = req.body;
        const user = await User.findOne({ username: normalizeUsername(username) });
        if (!user) return res.json({ success: false, error: 'User not found' });

        const given = answer.trim().toLowerCase();
        const stored = (user.securityAnswer || '').toLowerCase();

        if (given.length !== stored.length ||
            !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(stored))) {
            return res.json({ success: false, error: 'Incorrect answer' });
        }

        user.password = await bcrypt.hash(newPassword, 12);
        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
        await user.save();
        res.json({ success: true });
    }
);

// ============================================================
// ⭐⭐⭐ API: NOWPAYMENTS
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

app.post('/api/nowpayments/create-invoice', requireAuth,
    body('packageId').isString().isIn(Object.keys(COIN_PACKAGES)),
    async (req, res) => {
        try {
            const { packageId } = req.body;
            const pkg = COIN_PACKAGES[packageId];
            if (!pkg) return res.json({ success: false, error: 'Invalid package' });

            const user = await User.findOne({ username: req.authUser }, '_id username').lean();
            if (!user) return res.json({ success: false, error: 'User not found' });

            const apiKey = process.env.NOWPAYMENTS_API_KEY;
            if (!apiKey) return res.json({ success: false, error: 'Not configured' });

            const orderId = 'MK-' + Date.now() + '-' + uuidv4().slice(0, 8);
            const host = (req.get('x-forwarded-proto') || req.protocol) + '://' + req.get('host');
            const payload = {
                price_amount: pkg.priceUsd,
                price_currency: 'usd',
                order_id: orderId,
                order_description: `${pkg.coins} coins for ${user.username}`,
                ipn_callback_url: `${host}/api/nowpayments/ipn`,
                success_url: `${host}/?payment=success&order=${orderId}`,
                cancel_url: `${host}/?payment=cancel&order=${orderId}`
            };
            if (process.env.NOWPAYMENTS_PAY_CURRENCY) {
                payload.pay_currency = process.env.NOWPAYMENTS_PAY_CURRENCY;
            }
            const result = await httpsJsonRequest({
                hostname: 'api.nowpayments.io',
                path: '/v1/invoice',
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json'
                }
            }, payload);
            if (result.status >= 200 && result.status < 300 &&
                result.body && result.body.invoice_url) {
                await CryptoPayment.create({
                    orderId,
                    username: user.username,
                    coins: pkg.coins,
                    priceUsd: pkg.priceUsd,
                    status: 'waiting',
                    invoiceUrl: result.body.invoice_url
                });
                return res.json({
                    success: true,
                    orderId,
                    invoiceUrl: result.body.invoice_url,
                    coins: pkg.coins,
                    priceUsd: pkg.priceUsd
                });
            }
            return res.json({ success: false, error: 'Payment gateway error' });
        } catch (err) {
            res.json({ success: false, error: 'Failed' });
        }
    }
);

app.post('/api/nowpayments/ipn', async (req, res) => {
    try {
        const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
        const sig = req.headers['x-nowpayments-sig'];

        if (ipnSecret) {
            if (!sig) return res.status(401).send('Missing signature');
            const expected = crypto.createHmac('sha512', ipnSecret)
                .update(JSON.stringify(sortObject(req.body))).digest('hex');
            if (sig.length !== expected.length ||
                !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
                return res.status(401).send('Invalid signature');
            }
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
                    username: user.username,
                    coins: payment.coins,
                    priceUsd: payment.priceUsd,
                    orderId: payment.orderId,
                    payAmount: payment.payAmount,
                    payCurrency: payment.payCurrency
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
    const payment = await CryptoPayment.findOne({
        orderId: req.params.orderId,
        username: req.authUser
    }).select('status credited coins priceUsd payAmount payCurrency').lean();
    if (!payment) return res.json({ success: false, error: 'Not found' });
    res.json({ success: true, ...payment });
});

// ============================================================
// ⭐⭐⭐ API: LUCKY GAMES
// ============================================================
app.post('/api/game/play', requireAuth,
    body('game').isIn(['coinflip', 'dice', 'slot', 'wheel']),
    body('bet').isInt({ min: GAME_CONFIG.minBet, max: GAME_CONFIG.vipMaxBet }),
    async (req, res) => {
        try {
            if (!isWhitelistedUser(req.authUser)) {
                const gameCheck = limiters.game.check(req.authUser);
                if (!gameCheck.allowed) {
                    return res.status(429).json({ success: false, error: 'Too fast' });
                }
            }

            const { game, choice } = req.body;
            const betAmount = parseInt(req.body.bet);

            const user = await User.findOne({ username: req.authUser });
            if (!user) return res.json({ success: false, error: 'User not found' });

            const userIsVip = user.vipExpires && new Date(user.vipExpires) > Date.now();
            const maxBet = userIsVip ? GAME_CONFIG.vipMaxBet : GAME_CONFIG.maxBet;
            if (betAmount > maxBet) {
                return res.json({ success: false, error: `Max ${maxBet.toLocaleString()}` });
            }
            if (user.coins < betAmount) {
                return res.json({ success: false, error: 'Insufficient coins' });
            }

            user.coins -= betAmount;
            let outcome, choiceLabel = choice;

            switch (game) {
                case 'coinflip':
                    if (choice !== 'heads' && choice !== 'tails') {
                        user.coins += betAmount;
                        return res.json({ success: false, error: 'Invalid choice' });
                    }
                    outcome = rollCoinflip(choice);
                    break;
                case 'dice': {
                    const n = Number(choice);
                    if (!Number.isInteger(n) || n < 1 || n > 6) {
                        user.coins += betAmount;
                        return res.json({ success: false, error: 'Invalid dice' });
                    }
                    outcome = rollDice(n);
                    break;
                }
                case 'slot':
                    outcome = spinSlot();
                    choiceLabel = null;
                    break;
                case 'wheel':
                    outcome = spinWheel();
                    choiceLabel = null;
                    break;
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
                username: user.username,
                game,
                bet: betAmount,
                choice: choiceLabel,
                result: outcome.result,
                payout, profit,
                win: outcome.win
            });
            await CoinRequest.create({
                username: user.username,
                type: `Game ${game} ${outcome.win ? 'WIN' : 'LOSS'}`,
                amount: profit
            });

            if (profit >= GAME_CONFIG.bigWinThreshold) {
                tgNotifyBigWin({
                    username: user.username,
                    game, bet: betAmount, payout, profit
                });
            }

            const sock = onlineUsers.get(user.username);
            if (sock) {
                io.to(sock).emit('coins-updated', user.coins);
                io.to(sock).emit('game-result', {
                    game, bet: betAmount, payout, profit,
                    win: outcome.win, result: outcome.result,
                    multiplier: outcome.multiplier
                });
            }

            res.json({
                success: true,
                newBalance: user.coins,
                bet: betAmount,
                payout, profit,
                win: outcome.win,
                result: outcome.result,
                multiplier: outcome.multiplier,
                game
            });
        } catch (err) {
            res.json({ success: false, error: 'Game failed' });
        }
    }
);

app.get('/api/game/history', requireAuth, async (req, res) => {
    const max = Math.min(parseInt(req.query.limit) || 20, 100);
    const logs = await GameLog.find({ username: req.authUser })
        .sort({ createdAt: -1 }).limit(max).lean();
    res.json({ success: true, logs });
});

app.get('/api/game/config', requireAuth, async (req, res) => {
    const isVip = await isVIP(req.authUser);
    res.json({
        success: true,
        minBet: GAME_CONFIG.minBet,
        maxBet: isVip ? GAME_CONFIG.vipMaxBet : GAME_CONFIG.maxBet,
        bigWinThreshold: GAME_CONFIG.bigWinThreshold
    });
});

app.get('/api/game/admin-logs', requireAdmin, async (req, res) => {
    const logs = await GameLog.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json(logs);
});

// ============================================================
// ⭐⭐⭐ SOCKET.IO — AUTHENTICATION (متسامح)
// ============================================================
io.use(async (socket, next) => {
    const ip = socket.handshake.address ||
               socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               'unknown';

    // ⭐ Whitelist exemption
    if (isWhitelistedIP(ip)) {
        socket.clientIp = ip;
        return next();
    }

    if (isIpBlocked(ip)) {
        logActivity({ type: 'blocked_socket', ip });
        return next(new Error('Access denied'));
    }

    const connCheck = checkConnectionRate(ip);
    if (!connCheck.allowed) {
        logActivity({
            type: 'connection_flood_warning',
            ip
        });
        return next(new Error('Too many connections'));
    }

    socket.clientIp = ip;
    next();
});

io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;
        if (!token || typeof token !== 'string') {
            return next(new Error('Authentication required'));
        }

        const socketFp = generateSocketFingerprint(socket);
        const result = verifyTokenWithFingerprint(token, socketFp, JWT_SECRET);

        if (!result.valid) {
            if (result.reason === 'expired') {
                return next(new Error('Session expired'));
            }

            // ⭐ fingerprint mismatch — متسامح
            if (result.reason === 'fingerprint_mismatch' && result.payload?.username) {
                logActivity({
                    type: 'socket_fingerprint_warning',
                    ip: socket.clientIp,
                    username: result.payload.username
                });
                const user = await User.findOne(
                    { username: result.payload.username },
                    '_id isAdmin'
                ).lean();
                if (!user) return next(new Error('User not found'));

                socket.username = result.payload.username;
                socket.isAdmin = !!user.isAdmin;
                socket.jti = result.payload.jti;
                socket.fingerprint = socketFp;
                socket.connectedAt = Date.now();
                trackUserIP(socket.username, socket.clientIp);
                return next();
            }

            return next(new Error('Invalid token'));
        }

        const user = await User.findOne({ username: result.payload.username }, '_id isAdmin').lean();
        if (!user) return next(new Error('User not found'));

        socket.username = result.payload.username;
        socket.isAdmin = !!user.isAdmin;
        socket.jti = result.payload.jti;
        socket.fingerprint = socketFp;
        socket.connectedAt = Date.now();

        trackUserIP(socket.username, socket.clientIp);
        next();
    } catch (err) {
        next(new Error('Auth error'));
    }
});

// ============================================================
// ⭐⭐⭐ SOCKET EVENT RATE LIMIT HELPER
// ============================================================
function checkSocketEvent(socket, limiterName, cost = 1) {
    // ⭐ Whitelist exemption
    if (isWhitelistedUser(socket.username) || isWhitelistedIP(socket.clientIp)) {
        return true;
    }

    const limiter = limiters[limiterName];
    if (!limiter) return true;

    const key = socket.username || socket.clientIp;
    const result = limiter.check(key, cost);

    if (!result.allowed) {
        // ⭐ سجّل تحذير فقط (لا حظر تلقائي)
        logActivity({
            type: 'socket_rate_limit_warning',
            event: limiterName,
            ip: socket.clientIp,
            username: socket.username
        });
        socket.emit('rate-limited', {
            event: limiterName,
            retryAfter: result.retryAfter || 1
        });
        return false;
    }
    return true;
}

function isHighRisk(username) {
    return getSuspicionScore(username) >= 500;   // ⭐ 500 بدل 200
}
// ============================================================
// ⭐⭐⭐ SOCKET.IO — CONNECTION
// ============================================================
io.on('connection', (socket) => {
    const username = socket.username;
    console.log(`🔌 Socket: ${socket.id} (${username}) from ${socket.clientIp}`);

    if (isHighRisk(username)) {
        console.log(`🚨 High-risk user connected: ${username}`);
        socket.emit('warning', 'Your account has been flagged for suspicious activity');
    }

    onlineUsers.set(username, socket.id);
    io.emit('online-users', Array.from(onlineUsers.keys()));

    (async () => {
        try {
            const [rooms, u] = await Promise.all([
                Room.find({}, {
                    name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1
                }).lean(),
                User.findOne({ username }, 'monthlyLoginDays').lean()
            ]);

            socket.emit('room-list', rooms.map(r => ({
                name: r.name,
                members: r.members.length,
                boostLevel: r.boostLevel,
                isVipRoom: r.isVipRoom,
                membersOnly: r.membersOnly
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
        } catch (err) {
            console.error('socket init error:', err);
        }
    })();

    socket.on('get-room-list', async () => {
        const rooms = await Room.find({}, {
            name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1
        }).lean();
        socket.emit('room-list', rooms.map(r => ({
            name: r.name,
            members: r.members.length,
            boostLevel: r.boostLevel,
            isVipRoom: r.isVipRoom,
            membersOnly: r.membersOnly
        })));
    });

    // ============ CREATE ROOM ============
    socket.on('create-room', async (data) => {
        try {
            if (!checkSocketEvent(socket, 'roomCreate')) return;
            if (!checkSocketEvent(socket, 'socketEvent')) return;

            const roomName = String(data?.roomName || '').trim().substring(0, 50);
            const isVipRoom = !!data?.isVipRoom;
            if (roomName.length < 2) return socket.emit('error', 'Room name too short');

            const existing = await findRoomInsensitive(roomName);
            if (existing) return socket.emit('error', 'Room exists');

            const user = await User.findOne({ username });
            if (!user) return socket.emit('error', 'User not found');

            if (isVipRoom) {
                const userIsVip = user.vipExpires && new Date(user.vipExpires) > Date.now();
                if (!userIsVip) return socket.emit('error', 'VIP required');
            }

            if (user.coins < PRICING.CREATE_ROOM_COST) {
                return socket.emit('error', `Not enough coins`);
            }

            user.coins -= PRICING.CREATE_ROOM_COST;
            await user.save();
            clearProfileCache(username);
            await CoinRequest.create({
                username,
                type: 'Create Room',
                amount: -PRICING.CREATE_ROOM_COST
            });

            const newRoom = new Room({
                name: roomName,
                members: [username],
                messages: [],
                boostLevel: 0,
                createdBy: username,
                owner: username,
                isVipRoom,
                ownerProfilePic: user.profile_pic,
                kicked: [], membersOnly: false,
                allowedMembers: [], moderators: []
            });
            await newRoom.save();
            socket.emit('room-created-success', roomName);
            socket.emit('coins-updated', user.coins);

            const rooms = await Room.find({}, {
                name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1
            }).lean();
            io.emit('room-list', rooms.map(r => ({
                name: r.name,
                members: r.members.length,
                boostLevel: r.boostLevel,
                isVipRoom: r.isVipRoom,
                membersOnly: r.membersOnly
            })));
        } catch (err) {
            socket.emit('error', 'Failed');
        }
    });

    // ============ JOIN ROOM ============
    socket.on('join-room', async (roomName) => {
        try {
            roomName = String(roomName || '').trim().substring(0, 50);
            const room = await findRoomInsensitive(roomName);
            if (!room) return socket.emit('room-not-found', roomName);

            if (room.kicked && room.kicked.includes(username)) {
                return socket.emit('room-join-denied', 'You are banned');
            }

            const isExistingMember = room.members.includes(username);
            if (room.membersOnly && !isExistingMember) {
                const isAllowed = room.allowedMembers.includes(username) ||
                                 room.owner === username ||
                                 room.moderators.includes(username);
                if (!isAllowed) return socket.emit('room-join-denied', 'Members-only room.');
            }

            if (socket.currentRoom) socket.leave(socket.currentRoom);
            socket.join(room.name);
            socket.currentRoom = room.name;

            if (!isExistingMember) {
                room.members.push(username);
                room.activity++;
                await room.save();
            }

            const memberUsers = await User.find(
                { username: { $in: room.members } },
                'username vipExpires'
            ).lean();
            const now = Date.now();
            const vipMap = {};
            memberUsers.forEach(u => {
                vipMap[u.username] = u.vipExpires && new Date(u.vipExpires) > now;
            });

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

            Room.find({}, {
                name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1
            }).lean().then(rooms => {
                io.emit('room-list', rooms.map(r => ({
                    name: r.name,
                    members: r.members.length,
                    boostLevel: r.boostLevel,
                    isVipRoom: r.isVipRoom,
                    membersOnly: r.membersOnly
                })));
            });
        } catch (err) {
            socket.emit('error', 'Failed');
        }
    });

    // ============ LEAVE ROOM ============
    socket.on('leave-room', async () => {
        if (socket.currentRoom) {
            const roomName = socket.currentRoom;
            const room = await findRoomInsensitive(roomName);
            if (room) {
                room.members = room.members.filter(m => m !== username);
                await room.save();
                socket.to(room.name).emit('user-left-room', { username });
            }
            socket.leave(roomName);
            socket.currentRoom = null;

            Room.find({}, {
                name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1
            }).lean().then(rooms => {
                io.emit('room-list', rooms.map(r => ({
                    name: r.name,
                    members: r.members.length,
                    boostLevel: r.boostLevel,
                    isVipRoom: r.isVipRoom,
                    membersOnly: r.membersOnly
                })));
            });
        }
    });

    // ============ ROOM MESSAGE ============
    socket.on('room-message', async (data) => {
        try {
            if (!checkSocketEvent(socket, 'roomMsg')) return;
            if (!checkSocketEvent(socket, 'socketEvent')) return;
            if (!socket.currentRoom) return;

            const messageText = String(data?.message || '').trim().substring(0, 2000);
            if (!messageText) return;

            const msgType = ['text', 'image', 'audio'].includes(data?.type)
                ? data.type : 'text';

            const room = await findRoomInsensitive(socket.currentRoom);
            if (!room || !room.members.includes(username)) return;

            const user = await User.findOne({ username }, 'profile_pic').lean();
            const msg = {
                id: Date.now(),
                username,
                message: messageText,
                timestamp: new Date().toLocaleTimeString(),
                type: msgType,
                profilePic: user?.profile_pic,
                isVIP: await isVIP(username),
                isModerator: room.moderators.includes(username)
            };

            room.messages.push(msg);
            room.activity++;
            if (room.messages.length > 200) {
                room.messages = room.messages.slice(-200);
            }
            await room.save();
            io.to(room.name).emit('new-room-message', msg);
        } catch (err) {}
    });

    // ============ PRIVATE MESSAGE ============
    socket.on('private-message', async (data) => {
        try {
            if (!checkSocketEvent(socket, 'privateMsg')) return;
            if (!checkSocketEvent(socket, 'socketEvent')) return;

            const toNorm = normalizeUsername(data?.to);
            if (!toNorm || toNorm === username) return;

            const messageText = String(data?.message || '').trim().substring(0, 2000);
            if (!messageText) return;

            const msgType = ['text', 'image', 'audio'].includes(data?.type)
                ? data.type : 'text';

            const toUser = await User.findOne({ username: toNorm }, '_id').lean();
            if (!toUser) return;

            const msg = {
                from: username,
                to: toNorm,
                message: messageText,
                timestamp: new Date().toLocaleTimeString(),
                type: msgType,
                isVIP: await isVIP(username)
            };
            await PrivateMessage.create(msg);

            const toSocket = onlineUsers.get(toNorm);
            const fromSocket = onlineUsers.get(username);
            if (toSocket) io.to(toSocket).emit('new-private-message', msg);
            if (fromSocket) io.to(fromSocket).emit('private-message-sent', msg);
        } catch (err) {}
    });

    // ============ BOOST ROOM ============
    socket.on('boost-room', async (data) => {
        try {
            if (!checkSocketEvent(socket, 'boost')) return;

            const boostAmount = parseInt(data?.amount);
            if (!PRICING.ALLOWED_BOOST_AMOUNTS.includes(boostAmount)) {
                return socket.emit('error', 'Invalid boost amount');
            }

            const roomName = String(data?.roomName || '').trim();
            const [room, user] = await Promise.all([
                findRoomInsensitive(roomName),
                User.findOne({ username })
            ]);

            if (room && user && user.coins >= boostAmount && room.members.includes(username)) {
                user.coins -= boostAmount;
                await user.save();
                clearProfileCache(username);
                await CoinRequest.create({
                    username,
                    type: 'Room Boost',
                    amount: -boostAmount
                });
                room.boostLevel = (room.boostLevel || 0) + boostAmount;
                await room.save();
                await BoostLog.create({ username, roomName: room.name, amount: boostAmount });
                io.to(room.name).emit('room-boosted', {
                    boostedBy: username,
                    amount: boostAmount,
                    boostLevel: room.boostLevel
                });
                socket.emit('coins-updated', user.coins);

                Room.find({}, {
                    name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1
                }).lean().then(rooms => {
                    io.emit('room-list', rooms.map(r => ({
                        name: r.name,
                        members: r.members.length,
                        boostLevel: r.boostLevel,
                        isVipRoom: r.isVipRoom,
                        membersOnly: r.membersOnly
                    })));
                });
            } else {
                socket.emit('error', 'Boost failed');
            }
        } catch (err) {}
    });

    // ============ YOUTUBE SYNC ============
    socket.on('sync-youtube', (data) => {
        try {
            if (!socket.currentRoom) return;
            const videoId = String(data?.videoId || '').substring(0, 20)
                .replace(/[^a-zA-Z0-9_-]/g, '');
            if (!videoId) return;
            socket.to(socket.currentRoom).emit('sync-youtube', {
                videoId,
                room: socket.currentRoom,
                by: username
            });
        } catch (err) {}
    });

    // ============ WEBRTC CALLS ============
    socket.on('call-user', (data) => {
        try {
            if (!checkSocketEvent(socket, 'call')) return;
            const toNorm = normalizeUsername(data?.to);
            if (!toNorm) return;
            const targetSocketId = onlineUsers.get(toNorm);
            if (targetSocketId) {
                io.to(targetSocketId).emit('incoming-call', {
                    from: username,
                    offer: data.offer
                });
            } else {
                socket.emit('call-rejected', { message: 'User offline' });
            }
        } catch (err) {}
    });

    socket.on('call-accepted', (data) => {
        const toNorm = normalizeUsername(data?.to);
        if (!toNorm) return;
        const targetSocketId = onlineUsers.get(toNorm);
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-accepted', { answer: data.answer });
        }
    });

    socket.on('call-rejected', (data) => {
        const toNorm = normalizeUsername(data?.to);
        if (!toNorm) return;
        const targetSocketId = onlineUsers.get(toNorm);
        if (targetSocketId) io.to(targetSocketId).emit('call-rejected');
    });

    socket.on('end-call', (data) => {
        const toNorm = normalizeUsername(data?.to);
        if (!toNorm) return;
        const targetSocketId = onlineUsers.get(toNorm);
        if (targetSocketId) io.to(targetSocketId).emit('end-call');
    });

    socket.on('ice-candidate', (data) => {
        const toNorm = normalizeUsername(data?.to);
        if (!toNorm) return;
        const targetSocketId = onlineUsers.get(toNorm);
        if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', { candidate: data.candidate });
        }
    });

    // ============ ROOM MEMBERS MANAGEMENT ============
    socket.on('add-room-member', async (data) => {
        try {
            if (!checkSocketEvent(socket, 'socketEvent')) return;
            const roomName = String(data?.roomName || '').trim();
            const targetUser = normalizeUsername(data?.username);
            const room = await findRoomInsensitive(roomName);
            if (!room || !targetUser) return;

            const isAuthorized = room.owner === username ||
                                 room.moderators.includes(username) ||
                                 socket.isAdmin;
            if (!isAuthorized) return socket.emit('error', 'Not authorized');

            if (!room.allowedMembers.includes(targetUser)) {
                room.allowedMembers.push(targetUser);
            }
            await room.save();

            io.to(room.name).emit('room-member-added', {
                username: targetUser, roomName: room.name
            });
            const targetSocket = onlineUsers.get(targetUser);
            if (targetSocket) {
                io.to(targetSocket).emit('room-member-added', {
                    username: targetUser, roomName: room.name
                });
            }
            socket.emit('member-action-success', { action: 'add', username: targetUser });
        } catch (err) {}
    });

    socket.on('remove-room-member', async (data) => {
        try {
            if (!checkSocketEvent(socket, 'socketEvent')) return;
            const roomName = String(data?.roomName || '').trim();
            const targetUser = normalizeUsername(data?.username);
            const room = await findRoomInsensitive(roomName);
            if (!room || !targetUser) return;

            const isAuthorized = room.owner === username ||
                                 room.moderators.includes(username) ||
                                 socket.isAdmin;
            if (!isAuthorized) return socket.emit('error', 'Not authorized');

            room.allowedMembers = room.allowedMembers.filter(m => m !== targetUser);
            await room.save();

            io.to(room.name).emit('room-member-removed', {
                username: targetUser, roomName: room.name
            });

            if (room.membersOnly && room.members.includes(targetUser)) {
                room.members = room.members.filter(m => m !== targetUser);
                await room.save();
                const kickedSocket = onlineUsers.get(targetUser);
                if (kickedSocket) {
                    io.to(kickedSocket).emit('kicked-from-room', { room: room.name });
                }
                io.to(room.name).emit('user-left-room', { username: targetUser });
            }
            socket.emit('member-action-success', { action: 'remove', username: targetUser });
        } catch (err) {}
    });

    socket.on('set-moderator', async (data) => {
        try {
            if (!checkSocketEvent(socket, 'socketEvent')) return;
            const roomName = String(data?.roomName || '').trim();
            const targetUser = normalizeUsername(data?.username);
            const room = await findRoomInsensitive(roomName);
            if (!room || room.owner !== username) return socket.emit('error', 'Only owner');
            if (!targetUser) return;

            if (!room.moderators.includes(targetUser)) room.moderators.push(targetUser);
            if (!room.allowedMembers.includes(targetUser)) room.allowedMembers.push(targetUser);
            await room.save();

            io.to(room.name).emit('room-moderator-updated', {
                moderators: room.moderators, room: room.name
            });
            socket.emit('member-action-success', { action: 'set_mod', username: targetUser });
        } catch (err) {}
    });

    socket.on('remove-moderator', async (data) => {
        try {
            if (!checkSocketEvent(socket, 'socketEvent')) return;
            const roomName = String(data?.roomName || '').trim();
            const targetUser = normalizeUsername(data?.username);
            const room = await findRoomInsensitive(roomName);
            if (!room || room.owner !== username) return socket.emit('error', 'Only owner');
            if (!targetUser) return;

            room.moderators = room.moderators.filter(m => m !== targetUser);
            await room.save();

            io.to(room.name).emit('room-moderator-updated', {
                moderators: room.moderators, room: room.name
            });
            socket.emit('member-action-success', { action: 'remove_mod', username: targetUser });
        } catch (err) {}
    });

    // ============ FRIEND REQUESTS ============
    socket.on('send-friend-request-socket', async (data) => {
        try {
            if (!checkSocketEvent(socket, 'friendReq')) return;
            const toNorm = normalizeUsername(data?.to);
            if (!toNorm || toNorm === username) return;

            const toUser = await User.findOne({ username: toNorm }, '_id').lean();
            if (!toUser) return socket.emit('error', 'User not found');

            const existing = await FriendRequest.findOne(
                { to: toNorm, from: username }, '_id'
            ).lean();
            if (existing) return socket.emit('error', 'Request already sent');

            await FriendRequest.create({
                to: toNorm, from: username, timestamp: Date.now()
            });
            const toSocket = onlineUsers.get(toNorm);
            if (toSocket) {
                io.to(toSocket).emit('friend-request-received', { from: username });
            }
            socket.emit('friend-request-sent', { to: toNorm });
        } catch (err) {}
    });

    socket.on('accept-friend-request-socket', async (data) => {
        try {
            const fromNorm = normalizeUsername(data?.from);
            if (!fromNorm) return;

            await FriendRequest.deleteOne({ to: username, from: fromNorm });
            const [user, friendUser] = await Promise.all([
                User.findOne({ username }),
                User.findOne({ username: fromNorm })
            ]);

            if (user && friendUser) {
                if (!user.friends.includes(fromNorm)) user.friends.push(fromNorm);
                if (!friendUser.friends.includes(username)) friendUser.friends.push(username);
                await Promise.all([user.save(), friendUser.save()]);

                const userSocket = onlineUsers.get(username);
                const friendSocket = onlineUsers.get(fromNorm);
                if (userSocket) io.to(userSocket).emit('friends-updated');
                if (friendSocket) io.to(friendSocket).emit('friends-updated');
            }
            socket.emit('friend-request-accepted', { from: fromNorm });
        } catch (err) {}
    });

    // ============ TYPING ============
    socket.on('typing', (data) => {
        if (isWhitelistedUser(socket.username)) {
            if (!socket.currentRoom) return;
            return socket.to(socket.currentRoom).emit('user-typing', {
                room: socket.currentRoom, username
            });
        }
        if (!checkSocketEvent(socket, 'socketEvent', 0.5)) return;
        if (!socket.currentRoom) return;
        socket.to(socket.currentRoom).emit('user-typing', {
            room: socket.currentRoom,
            username
        });
    });

    socket.on('stop-typing', (data) => {
        if (!socket.currentRoom) return;
        socket.to(socket.currentRoom).emit('user-stop-typing', {
            room: socket.currentRoom,
            username
        });
    });

    socket.on('private-typing', (data) => {
        if (!checkSocketEvent(socket, 'socketEvent', 0.5)) return;
        const toNorm = normalizeUsername(data?.to);
        if (!toNorm) return;
        const toSocket = onlineUsers.get(toNorm);
        if (toSocket) io.to(toSocket).emit('private-user-typing', { from: username });
    });

    socket.on('private-stop-typing', (data) => {
        const toNorm = normalizeUsername(data?.to);
        if (!toNorm) return;
        const toSocket = onlineUsers.get(toNorm);
        if (toSocket) io.to(toSocket).emit('private-user-stop-typing', { from: username });
    });

    // ============ DISCONNECT ============
    socket.on('disconnect', () => {
        onlineUsers.delete(username);
        io.emit('online-users', Array.from(onlineUsers.keys()));
        console.log(`🔌 Disconnected: ${socket.id} (${username})`);
    });
});

// ============================================================
// ⭐⭐⭐ CRON JOBS
// ============================================================
cron.schedule('0 0 1 * *', async () => {
    console.log('🔄 Monthly reset started...');
    try {
        const now = new Date();
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const monthLabel = prevMonth.toISOString().slice(0, 7);
        const MIN_TARGET = 50000;

        const eligibleUsers = await User.find({ monthlyTarget: { $gte: MIN_TARGET } });

        for (const user of eligibleUsers) {
            const streak = user.monthlyLoginDays ? user.monthlyLoginDays.length : 0;
            if (streak < 10) continue;

            const dollars = calculatePayout(user.monthlyTarget);
            await Payout.create({
                username: user.username,
                targetAmount: user.monthlyTarget,
                dollarsEarned: dollars,
                month: monthLabel,
                status: 'pending'
            });
            tgNotifyPayoutCreated({
                username: user.username,
                dollars,
                monthLabel,
                targetAmount: user.monthlyTarget
            });
            const sock = onlineUsers.get(user.username);
            if (sock) {
                io.to(sock).emit('payout-created', {
                    month: monthLabel,
                    dollarsEarned: dollars,
                    targetAmount: user.monthlyTarget
                });
            }
        }

        await User.updateMany({}, {
            $set: { monthlyTarget: 0, monthlyLoginDays: [] }
        });
        await Room.updateMany({}, { $set: { boostLevel: 0 } });
        io.emit('boost-reset', { message: 'Monthly reset complete' });

        const rooms = await Room.find({}, {
            name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1
        }).lean();
        io.emit('room-list', rooms.map(r => ({
            name: r.name,
            members: r.members.length,
            boostLevel: r.boostLevel,
            isVipRoom: r.isVipRoom,
            membersOnly: r.membersOnly
        })));

        clearProfileCache();
        console.log('🎉 Monthly reset complete!');
    } catch (err) {
        console.error('❌ Monthly reset error:', err);
    }
});

// ============================================================
// ⭐⭐⭐ 404 + ERROR HANDLER
// ============================================================
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
});

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    if (err.message && err.message.includes('CORS')) {
        return res.status(403).json({ success: false, error: 'CORS error' });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, error: 'File too large' });
    }
    res.status(500).json({ success: false, error: 'Server error' });
});

// ============================================================
// ⭐⭐⭐ START SERVER
// ============================================================
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`🔒 SECURITY: bcrypt + JWT + rate-limits + CORS + auth + validation`);
    console.log(`🛡️  Fingerprint: TOLERANT mode`);
    console.log(`🛡️  Rate Limiting: 5-layer (balanced)`);
    console.log(`🚫 AUTO-BAN: ${AUTOBAN_ENABLED ? 'ENABLED (threshold: 100 points)' : 'DISABLED'}`);
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID) {
        console.log('📨 Telegram: ENABLED');
    } else {
        console.log('📨 Telegram: DISABLED');
    }
});

