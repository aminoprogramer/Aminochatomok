require('dotenv').config();
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

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
    maxHttpBufferSize: 1e8,
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    path: '/socket.io/'
});

app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS", "DELETE"], credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// ========== MULTER SETUP ==========
const uploadsDir = path.join(__dirname, 'uploads');
const profilePicsDir = path.join(uploadsDir, 'profiles');
const roomImagesDir = path.join(uploadsDir, 'room-images');
const voiceDir = path.join(uploadsDir, 'voice');
const proofsDir = path.join(uploadsDir, 'proofs');
const supportDir = path.join(uploadsDir, 'support');
[uploadsDir, profilePicsDir, roomImagesDir, voiceDir, proofsDir, supportDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const profileStorage = multer.diskStorage({
    destination: profilePicsDir,
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const uploadProfile = multer({ storage: profileStorage });

const roomImageStorage = multer.diskStorage({
    destination: roomImagesDir,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + uuidv4() + path.extname(file.originalname))
});
const uploadRoomImage = multer({ storage: roomImageStorage });

const voiceStorage = multer.diskStorage({
    destination: voiceDir,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + uuidv4() + '.webm')
});
const uploadVoice = multer({ storage: voiceStorage });

const proofStorage = multer.diskStorage({
    destination: proofsDir,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + uuidv4() + path.extname(file.originalname))
});
const uploadProof = multer({ storage: proofStorage });

const supportStorage = multer.diskStorage({
    destination: supportDir,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + uuidv4() + path.extname(file.originalname))
});
const uploadSupport = multer({ storage: supportStorage });

app.use('/uploads', express.static(uploadsDir));

// ========== MONGODB ==========
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mokalmat';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('MongoDB error:', err));

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

const paymentTransactionSchema = new mongoose.Schema({
    token: String,
    username: String,
    expires: Number
});
const PaymentTransaction = mongoose.model('PaymentTransaction', paymentTransactionSchema);

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
function normalizeUsername(username) { return (username || '').toLowerCase(); }
async function isAdmin(username) {
    const user = await User.findOne({ username: normalizeUsername(username) });
    return user ? user.isAdmin === true : false;
}
async function isVIP(username) {
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (!user || !user.vipExpires) return false;
    return new Date(user.vipExpires) > Date.now();
}
function generateToken() { return uuidv4(); }
async function findRoomInsensitive(roomName) {
    return await Room.findOne({ name: roomName }).collation({ locale: 'en', strength: 2 });
}

// ========== API ROUTES ==========
app.get('/api/turn-credentials', async (req, res) => {
    const ident = process.env.XIRSYS_IDENT;
    const secret = process.env.XIRSYS_SECRET;
    const channel = process.env.XIRSYS_CHANNEL;
    if (!ident || !secret || !channel) {
        console.error('Xirsys credentials missing');
        return res.status(500).json({ error: 'Xirsys not configured on server' });
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
                if (parsed && parsed.iceServers) {
                    res.json(parsed);
                } else {
                    console.error('Xirsys invalid response:', parsed);
                    res.status(500).json({ error: 'Invalid response from Xirsys' });
                }
            } catch (e) {
                console.error('Xirsys parse error:', e);
                res.status(500).json({ error: 'Failed to parse Xirsys response' });
            }
        });
    });
    httpreq.on('error', (e) => {
        console.error('Xirsys request error:', e);
        res.status(500).json({ error: e.message });
    });
    httpreq.end();
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password, gender, securityQuestion, securityAnswer } = req.body;
        const existing = await User.findOne({ username: normalizeUsername(username) });
        if (existing) return res.json({ success: false, error: 'Username exists' });
        const user = new User({
            username: normalizeUsername(username),
            displayName: username,
            password,
            gender,
            securityQuestion,
            securityAnswer,
            coins: 100
        });
        await user.save();
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username: normalizeUsername(username) });
        if (!user || user.password !== password) {
            return res.json({ success: false, error: 'Invalid credentials' });
        }
        const token = generateToken();
        const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
        await PaymentTransaction.updateOne(
            { username: user.username },
            { token, expires },
            { upsert: true }
        );
        res.json({
            success: true,
            user: {
                username: user.username,
                coins: user.coins,
                isAdmin: user.isAdmin,
                profile_pic: user.profile_pic,
                isVIP: await isVIP(user.username),
                vipExpires: user.vipExpires
            },
            token
        });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.get('/api/auto-login', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.json({ success: false });
    const token = authHeader.split(' ')[1];
    const tx = await PaymentTransaction.findOne({ token });
    if (!tx || tx.expires < Date.now()) return res.json({ success: false });
    const user = await User.findOne({ username: tx.username });
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

app.get('/api/user-profile', async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ success: false, error: 'Username required' });
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (!user) return res.status(404).json({ success: false });
    res.json({
        success: true,
        profile_pic: user.profile_pic,
        coins: user.coins,
        isAdmin: user.isAdmin,
        isVIP: await isVIP(username)
    });
});

app.post('/api/upload-profile-pic-base64', async (req, res) => {
    try {
        const { username, profilePicBase64 } = req.body;
        if (!profilePicBase64) return res.json({ success: false, error: 'No image data' });
        const user = await User.findOne({ username: normalizeUsername(username) });
        if (!user) return res.json({ success: false, error: 'User not found' });
        if (!profilePicBase64.startsWith('data:image/')) {
            return res.json({ success: false, error: 'Invalid image format' });
        }
        const sizeInBytes = Buffer.byteLength(profilePicBase64, 'utf8');
        if (sizeInBytes > 1.5 * 1024 * 1024) {
            return res.json({ success: false, error: 'Image too large (max 1.5MB)' });
        }
        user.profile_pic = profilePicBase64;
        await user.save();
        res.json({ success: true, profilePic: profilePicBase64 });
    } catch (err) {
        console.error('Profile pic upload error:', err);
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/upload-profile-pic', uploadProfile.single('profilePic'), async (req, res) => {
    const { username } = req.body;
    if (!req.file) return res.json({ success: false, error: 'No file' });
    try {
        const filePath = req.file.path;
        const base64Data = fs.readFileSync(filePath, { encoding: 'base64' });
        const mimeType = req.file.mimetype || 'image/jpeg';
        const dataUri = `data:${mimeType};base64,${base64Data}`;
        const user = await User.findOne({ username: normalizeUsername(username) });
        if (!user) return res.json({ success: false, error: 'User not found' });
        if (Buffer.byteLength(dataUri, 'utf8') > 1.5 * 1024 * 1024) {
            return res.json({ success: false, error: 'Image too large (max 1.5MB)' });
        }
        user.profile_pic = dataUri;
        await user.save();
        fs.unlink(filePath, () => {});
        res.json({ success: true, profilePic: dataUri });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/upload-room-image', uploadRoomImage.single('roomImage'), (req, res) => {
    if (!req.file) return res.json({ success: false });
    res.json({ success: true, imageUrl: '/uploads/room-images/' + path.basename(req.file.path) });
});

app.post('/api/upload-voice', uploadVoice.single('audio'), (req, res) => {
    if (!req.file) return res.json({ success: false });
    res.json({ success: true, url: '/uploads/voice/' + path.basename(req.file.path) });
});

app.post('/api/send-gift', async (req, res) => {
    const { from, to, amount, message } = req.body;
    const fromUser = await User.findOne({ username: normalizeUsername(from) });
    const toUser = await User.findOne({ username: normalizeUsername(to) });
    if (!fromUser || !toUser || fromUser.coins < amount) {
        return res.json({ success: false, error: 'Insufficient coins or user not found' });
    }
    fromUser.coins -= amount;
    toUser.coins += amount;
    await fromUser.save();
    await toUser.save();
    await Gift.create({ from, to, amount, message });
    await CoinRequest.create({ username: fromUser.username, type: 'Send Gift', amount: -amount });
    await CoinRequest.create({ username: toUser.username, type: 'Receive Gift', amount: amount });
    io.emit('gift-received', { from, to, amount, message });
    io.emit('gift-ticker', { from, to, amount });
    res.json({ success: true });
});

app.get('/api/get-gifts', async (req, res) => {
    const gifts = await Gift.find().sort({ timestamp: -1 });
    res.json(gifts);
});

app.get('/api/get-friends', async (req, res) => {
    const { username } = req.query;
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (!user) return res.json([]);
    res.json(user.friends);
});

app.get('/api/get-friend-requests', async (req, res) => {
    const { username } = req.query;
    const requests = await FriendRequest.find({ to: normalizeUsername(username) });
    res.json(requests);
});

app.post('/api/delete-friend', async (req, res) => {
    const { username, friend } = req.body;
    const normUser = normalizeUsername(username);
    const normFriend = normalizeUsername(friend);

    const user = await User.findOne({ username: normUser });
    const friendUser = await User.findOne({ username: normFriend });

    if (user && friendUser) {
        // Remove friend from both users' friends lists using normalized comparison
        user.friends = user.friends.filter(f => normalizeUsername(f) !== normFriend);
        friendUser.friends = friendUser.friends.filter(f => normalizeUsername(f) !== normUser);

        await user.save();
        await friendUser.save();

        // Notify the friend that they were removed
        const friendSocket = onlineUsers.get(normFriend);
        if (friendSocket) {
            io.to(friendSocket).emit('friend-deleted', normUser);
        }

        // Optionally notify the current user as well (frontend already reloads)
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'User not found' });
    }
});

app.get('/api/get-all-users', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json([]);
    const token = authHeader.split(' ')[1];
    const tx = await PaymentTransaction.findOne({ token });
    if (!tx || tx.expires < Date.now()) return res.status(401).json([]);
    const users = await User.find({}, 'username coins profile_pic');
    res.json(users);
});

app.post('/api/buy-vip', async (req, res) => {
    const { username } = req.body;
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (!user || user.coins < 5000) return res.json({ success: false, error: 'Need 5000 coins' });
    user.coins -= 5000;
    user.vipExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await user.save();
    await CoinRequest.create({ username: user.username, type: 'Buy VIP', amount: -5000 });
    res.json({ success: true });
});

app.get('/api/get-vip-status', async (req, res) => {
    const { username } = req.query;
    const isActive = await isVIP(username);
    const user = await User.findOne({ username: normalizeUsername(username) });
    res.json({ success: isActive, expires: user?.vipExpires });
});

app.post('/api/manual-coin-request', uploadProof.single('proofFile'), async (req, res) => {
    const { username, amount, paymentMethod, giftCardNumber, cryptoTransactionId } = req.body;
    const proof = req.file ? '/uploads/proofs/' + path.basename(req.file.path) : null;
    await ManualCoinRequest.create({
        username: normalizeUsername(username),
        amount: parseInt(amount),
        paymentMethod,
        giftCardNumber,
        cryptoTransactionId,
        proof
    });
    res.json({ success: true });
});

app.get('/api/get-coin-history', async (req, res) => {
    const { username } = req.query;
    const history = await CoinRequest.find({ username: normalizeUsername(username) }).sort({ date: -1 });
    res.json(history);
});

app.get('/api/get-room-members/:roomName', async (req, res) => {
    const room = await findRoomInsensitive(req.params.roomName);
    if (!room) return res.json({ success: false });
    const vipMap = {};
    for (const m of room.members) vipMap[m] = await isVIP(m);
    res.json({
        success: true,
        members: room.members,
        kicked: room.kicked,
        moderators: room.moderators,
        vipMap
    });
});

app.post('/api/kick-user', async (req, res) => {
    const { roomName, username, adminUsername } = req.body;
    const room = await findRoomInsensitive(roomName);
    const admin = await User.findOne({ username: normalizeUsername(adminUsername) });
    if (!room || (!room.moderators.includes(adminUsername) && room.owner !== adminUsername && !admin?.isAdmin))
        return res.json({ success: false });
    if (!room.kicked.includes(username)) room.kicked.push(username);
    room.members = room.members.filter(m => m !== username);
    await room.save();
    const targetSocket = onlineUsers.get(normalizeUsername(username));
    if (targetSocket) io.to(targetSocket).emit('kicked-from-room', { room: room.name });
    io.to(room.name).emit('user-left-room', { username });
    res.json({ success: true });
});

app.post('/api/unban-user', async (req, res) => {
    const { roomName, username, adminUsername } = req.body;
    const room = await findRoomInsensitive(roomName);
    if (!room || (room.owner !== adminUsername && !(await isAdmin(adminUsername))))
        return res.json({ success: false });
    room.kicked = room.kicked.filter(k => k !== username);
    await room.save();
    res.json({ success: true });
});

app.get('/api/room-settings/:roomName', async (req, res) => {
    const room = await findRoomInsensitive(req.params.roomName);
    if (!room) return res.json({ success: false });
    res.json({
        success: true,
        membersOnly: room.membersOnly,
        allowedMembers: room.allowedMembers,
        moderators: room.moderators
    });
});

app.post('/api/room-settings', async (req, res) => {
    const { roomName, membersOnly, adminUsername } = req.body;
    const room = await findRoomInsensitive(roomName);
    if (!room || room.owner !== adminUsername) {
        return res.json({ success: false, error: 'Only owner can change' });
    }
    room.membersOnly = membersOnly;
    if (membersOnly) {
        room.members.forEach(member => {
            if (!room.allowedMembers.includes(member)) {
                room.allowedMembers.push(member);
            }
        });
    }
    await room.save();
    res.json({ success: true });
});

app.post('/api/clear-friend-requests', async (req, res) => {
    const { adminUsername } = req.body;
    if (!(await isAdmin(adminUsername))) return res.json({ success: false });
    await FriendRequest.deleteMany({});
    res.json({ success: true });
});

app.post('/api/clear-coin-requests', async (req, res) => {
    const { adminUsername } = req.body;
    if (!(await isAdmin(adminUsername))) return res.json({ success: false });
    await CoinRequest.deleteMany({});
    res.json({ success: true });
});

app.get('/api/get-boost-logs', async (req, res) => {
    const logs = await BoostLog.find().sort({ timestamp: -1 }).limit(50);
    res.json(logs);
});

app.get('/api/get-pending-manual-requests', async (req, res) => {
    const { admin } = req.query;
    if (!(await isAdmin(admin))) return res.status(403).json([]);
    const requests = await ManualCoinRequest.find({ status: 'pending' });
    res.json(requests);
});

app.post('/api/approve-manual-request', async (req, res) => {
    const { requestId, adminUsername } = req.body;
    if (!(await isAdmin(adminUsername))) return res.json({ success: false });
    const reqDoc = await ManualCoinRequest.findById(requestId);
    if (!reqDoc) return res.json({ success: false });
    const user = await User.findOne({ username: reqDoc.username });
    if (user) {
        user.coins += reqDoc.amount;
        await user.save();
        await CoinRequest.create({ username: user.username, type: 'Manual Coin Request', amount: reqDoc.amount });
        const userSocket = onlineUsers.get(reqDoc.username);
        if (userSocket) io.to(userSocket).emit('coins-updated', user.coins);
    }
    reqDoc.status = 'approved';
    await reqDoc.save();
    res.json({ success: true });
});

app.post('/api/reject-manual-request', async (req, res) => {
    const { requestId, adminUsername } = req.body;
    if (!(await isAdmin(adminUsername))) return res.json({ success: false });
    await ManualCoinRequest.findByIdAndDelete(requestId);
    res.json({ success: true });
});

app.post('/api/admin-give-coins', async (req, res) => {
    const { adminUsername, username, amount } = req.body;
    if (!(await isAdmin(adminUsername))) return res.json({ success: false });
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (user) {
        user.coins += parseInt(amount);
        await user.save();
        await CoinRequest.create({ username: user.username, type: 'Admin Gift', amount: parseInt(amount) });
        const userSocket = onlineUsers.get(normalizeUsername(username));
        if (userSocket) io.to(userSocket).emit('admin-gift', { amount });
        io.to(userSocket).emit('coins-updated', user.coins);
    }
    res.json({ success: true });
});

app.post('/api/admin-reset-password', async (req, res) => {
    const { adminUsername, username, newPassword } = req.body;
    if (!(await isAdmin(adminUsername))) return res.json({ success: false });
    const user = await User.findOne({ username: normalizeUsername(username) });
    if (user) {
        user.password = newPassword;
        await user.save();
    }
    res.json({ success: true });
});

app.get('/api/admin/get-all-users', async (req, res) => {
    const { admin } = req.query;
    if (!(await isAdmin(admin))) return res.status(403).json({ error: 'Admin only' });
    const users = await User.find({}, 'username coins isAdmin');
    res.json(users);
});

app.post('/api/delete-user', async (req, res) => {
    const { adminUsername, username } = req.body;
    if (!(await isAdmin(adminUsername))) return res.json({ success: false });
    await User.deleteOne({ username: normalizeUsername(username) });
    res.json({ success: true });
});

app.get('/api/get-all-rooms', async (req, res) => {
    const { admin } = req.query;
    if (!(await isAdmin(admin))) return res.status(403).json([]);
    const rooms = await Room.find({}, 'name owner');
    res.json(rooms);
});

app.delete('/api/delete-room', async (req, res) => {
    const { adminUsername, roomName } = req.body;
    if (!(await isAdmin(adminUsername))) return res.json({ success: false });
    await Room.deleteOne({ name: roomName });
    res.json({ success: true });
});

app.post('/api/support/submit', uploadSupport.single('screenshot'), async (req, res) => {
    const { username, subject, message } = req.body;
    const screenshot = req.file ? '/uploads/support/' + path.basename(req.file.path) : null;
    const ticketId = uuidv4().slice(0,8);
    const ticket = new SupportTicket({ ticketId, username, subject, message, screenshot });
    await ticket.save();
    io.emit('new-support-ticket', { username, subject, ticketId });
    res.json({ success: true, ticketId });
});

app.get('/api/support/tickets', async (req, res) => {
    const { admin, status } = req.query;
    if (!(await isAdmin(admin))) return res.status(403).json([]);
    const filter = status === 'all' ? {} : { status };
    const tickets = await SupportTicket.find(filter).sort({ createdAt: -1 });
    res.json(tickets);
});

app.post('/api/support/reply', async (req, res) => {
    const { adminUsername, ticketId, reply } = req.body;
    if (!(await isAdmin(adminUsername))) return res.json({ success: false });
    const ticket = await SupportTicket.findOne({ ticketId });
    if (!ticket) {
        return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    await Notification.create({
        username: ticket.username,
        title: 'Support Reply',
        message: `Admin replied to ticket ${ticket.ticketId}: ${reply.substring(0,100)}`
    });
    const userSocket = onlineUsers.get(ticket.username);
    if (userSocket) {
        io.to(userSocket).emit('support-reply', { ticketId, reply });
    }
    ticket.adminReply = reply;
    ticket.status = 'in-progress';
    ticket.updatedAt = Date.now();
    await ticket.save();
    res.json({ success: true });
});

app.post('/api/support/resolve', async (req, res) => {
    const { adminUsername, ticketId } = req.body;
    if (!(await isAdmin(adminUsername))) return res.json({ success: false });
    const ticket = await SupportTicket.findOne({ ticketId });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    await Notification.create({
        username: ticket.username,
        title: 'Ticket Resolved',
        message: `Ticket ${ticket.ticketId} was resolved`
    });
    const userSocket = onlineUsers.get(ticket.username);
    if (userSocket) {
        io.to(userSocket).emit('support-resolved', { ticketId });
    }
    ticket.status = 'resolved';
    ticket.updatedAt = Date.now();
    await ticket.save();
    res.json({ success: true });
});

app.post('/api/get-security-question', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) {
            return res.json({ success: false, error: 'Username required' });
        }
        const user = await User.findOne({ username: normalizeUsername(username) });
        if (!user) {
            return res.json({ success: false, error: 'User not found' });
        }
        if (!user.securityQuestion) {
            return res.json({ success: false, error: 'No security question set for this user' });
        }
        res.json({ success: true, question: user.securityQuestion });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const { username, answer, newPassword } = req.body;
        if (!username || !answer || !newPassword) {
            return res.json({ success: false, error: 'All fields required' });
        }
        if (newPassword.length < 4) {
            return res.json({ success: false, error: 'Password must be at least 4 characters' });
        }
        const user = await User.findOne({ username: normalizeUsername(username) });
        if (!user) {
            return res.json({ success: false, error: 'User not found' });
        }
        if (user.securityAnswer.toLowerCase() !== answer.toLowerCase()) {
            return res.json({ success: false, error: 'Incorrect security answer' });
        }
        user.password = newPassword;
        await user.save();
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ========== ONLINE USERS MAP ==========
const onlineUsers = new Map();

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
    console.log('🔌 Socket connected:', socket.id);

    socket.on('user-online', async (username) => {
        const norm = normalizeUsername(username);
        onlineUsers.set(norm, socket.id);
        socket.username = norm;
        socket.displayUsername = username;
        io.emit('online-users', Array.from(onlineUsers.keys()));
        const rooms = await Room.find({}, { name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1 });
        socket.emit('room-list', rooms.map(r => ({
            name: r.name,
            members: r.members.length,
            boostLevel: r.boostLevel,
            isVipRoom: r.isVipRoom,
            membersOnly: r.membersOnly
        })));
    });

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
        const { roomName, createdBy, isVipRoom } = data;
        const existing = await findRoomInsensitive(roomName);
        if (existing) return socket.emit('error', 'Room exists');
        const userNorm = normalizeUsername(createdBy);
        const user = await User.findOne({ username: userNorm });
        if (user && user.coins >= 1500) {
            user.coins -= 1500;
            await user.save();
            await CoinRequest.create({ username: userNorm, type: 'Create Room', amount: -1500 });
            const newRoom = new Room({
                name: roomName,
                members: [createdBy],
                messages: [],
                boostLevel: 0,
                createdBy: createdBy,
                owner: createdBy,
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
        } else {
            socket.emit('error', 'Not enough coins (need 1500)');
        }
    });

    socket.on('join-room', async (roomName) => {
        let room = await findRoomInsensitive(roomName);
        if (!room) return socket.emit('room-not-found', roomName);
        if (room.kicked && room.kicked.includes(normalizeUsername(socket.displayUsername))) {
            return socket.emit('room-join-denied', 'You are banned');
        }
        const isExistingMember = room.members.includes(socket.displayUsername);
        if (room.membersOnly && !isExistingMember) {
            const isAllowed = room.allowedMembers.includes(socket.displayUsername) ||
                             room.owner === socket.displayUsername ||
                             room.moderators.includes(socket.displayUsername);
            if (!isAllowed) {
                return socket.emit('room-join-denied', 'Members-only room. Ask owner or moderator to add you.');
            }
        }
        if (socket.currentRoom) socket.leave(socket.currentRoom);
        socket.join(room.name);
        socket.currentRoom = room.name;
        if (!room.members.includes(socket.displayUsername)) room.members.push(socket.displayUsername);
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
        socket.to(room.name).emit('user-joined-room', { username: socket.displayUsername });
        const rooms = await Room.find({}, { name: 1, members: 1, boostLevel: 1, isVipRoom: 1, membersOnly: 1 });
        io.emit('room-list', rooms.map(r => ({
            name: r.name,
            members: r.members.length,
            boostLevel: r.boostLevel,
            isVipRoom: r.isVipRoom,
            membersOnly: r.membersOnly
        })));
    });

    socket.on('request-room-messages', async (roomName) => {
        socket.emit('room-messages-history', { room: roomName, messages: [] });
    });

    socket.on('leave-room', async () => {
        if (socket.currentRoom) {
            const room = await findRoomInsensitive(socket.currentRoom);
            if (room) {
                room.members = room.members.filter(m => m !== socket.displayUsername);
                await room.save();
                socket.to(room.name).emit('user-left-room', { username: socket.displayUsername });
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
        const room = await findRoomInsensitive(data.room);
        if (!room) return;
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
        const { username, roomName, amount } = data;
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

    socket.on('sync-youtube', (data) => {
        if (data.room) {
            socket.to(data.room).emit('sync-youtube', {
                videoId: data.videoId,
                room: data.room,
                by: socket.displayUsername
            });
        }
    });

    // ========================================
    // 🔥 FIXED WEBRTC SIGNALING HANDLERS
    // ========================================

    socket.on('call-user', (data) => {
        const { to, from, offer } = data;
        const targetSocketId = onlineUsers.get(normalizeUsername(to));
        if (targetSocketId) {
            io.to(targetSocketId).emit('incoming-call', { from, offer });
            console.log(`📞 Call from ${from} to ${to}`);
        } else {
            socket.emit('call-rejected', { message: 'User offline' });
            console.log(`📞 Call to ${to} failed – user offline`);
        }
    });

    socket.on('call-accepted', (data) => {
        const { to, answer } = data;
        const targetSocketId = onlineUsers.get(normalizeUsername(to));
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-accepted', { answer });
            console.log(`📞 Call accepted by ${to}`);
        } else {
            console.log(`📞 Call accepted but target ${to} not found`);
        }
    });

    socket.on('call-rejected', (data) => {
        const { to } = data;
        const targetSocketId = onlineUsers.get(normalizeUsername(to));
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-rejected');
            console.log(`📞 Call rejected by ${to}`);
        }
    });

    socket.on('end-call', (data) => {
        const { to } = data;
        const targetSocketId = onlineUsers.get(normalizeUsername(to));
        if (targetSocketId) {
            io.to(targetSocketId).emit('end-call');
            console.log(`📞 Call ended by ${to}`);
        }
    });

    socket.on('ice-candidate', (data) => {
        const { to, candidate } = data;
        const targetSocketId = onlineUsers.get(normalizeUsername(to));
        if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', { candidate });
            console.log(`🧊 ICE candidate relayed to ${to}`);
        } else {
            console.log(`🧊 ICE candidate: target ${to} not online`);
        }
    });

    // ========================================
    // OTHER ROOM / FRIEND EVENTS (unchanged)
    // ========================================

    socket.on('add-room-member', async (data) => {
        const { roomName, username, adminUsername } = data;
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
        const { roomName, username, adminUsername } = data;
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
        const { roomName, username, adminUsername } = data;
        const room = await findRoomInsensitive(roomName);
        if (!room || room.owner !== adminUsername) {
            return socket.emit('error', 'Only owner can set moderators');
        }
        if (!room.moderators.includes(username)) room.moderators.push(username);
        if (!room.allowedMembers.includes(username)) room.allowedMembers.push(username);
        await room.save();
        io.to(room.name).emit('room-moderator-updated', { moderators: room.moderators, room: room.name });
        socket.emit('member-action-success', { action: 'set_mod', username });
    });

    socket.on('remove-moderator', async (data) => {
        const { roomName, username, adminUsername } = data;
        const room = await findRoomInsensitive(roomName);
        if (!room || room.owner !== adminUsername) return socket.emit('error', 'Only owner can remove moderators');
        room.moderators = room.moderators.filter(m => m !== username);
        await room.save();
        io.to(room.name).emit('room-moderator-updated', { moderators: room.moderators, room: room.name });
        socket.emit('member-action-success', { action: 'remove_mod', username });
    });

    socket.on('send-friend-request-socket', async (data) => {
        const { from, to } = data;
        const toNorm = normalizeUsername(to);
        const toUser = await User.findOne({ username: toNorm });
        if (!toUser) return socket.emit('error', 'User not found');
        const existing = await FriendRequest.findOne({ to: toNorm, from });
        if (existing) return socket.emit('error', 'Request already sent');
        await FriendRequest.create({ to: toNorm, from, timestamp: Date.now() });
        const toSocket = onlineUsers.get(toNorm);
        if (toSocket) io.to(toSocket).emit('friend-request-received', { from });
        socket.emit('friend-request-sent', { to });
    });

    socket.on('accept-friend-request-socket', async (data) => {
        const { username, from } = data;
        const norm = normalizeUsername(username);
        const fromNorm = normalizeUsername(from);
        await FriendRequest.deleteOne({ to: norm, from });
        const user = await User.findOne({ username: norm });
        const friendUser = await User.findOne({ username: fromNorm });
        if (user && friendUser) {
            if (!user.friends.includes(from)) user.friends.push(from);
            if (!friendUser.friends.includes(username)) friendUser.friends.push(username);
            await user.save();
            await friendUser.save();
            const userSocket = onlineUsers.get(norm);
            const friendSocket = onlineUsers.get(fromNorm);
            if (userSocket) io.to(userSocket).emit('friends-updated');
            if (friendSocket) io.to(friendSocket).emit('friends-updated');
        }
        socket.emit('friend-request-accepted', { from });
    });

    socket.on('typing', (data) => {
        socket.to(data.room).emit('user-typing', { room: data.room, username: data.username });
    });

    socket.on('stop-typing', (data) => {
        socket.to(data.room).emit('user-stop-typing', { room: data.room, username: data.username });
    });

    socket.on('private-typing', (data) => {
        const toSocket = onlineUsers.get(normalizeUsername(data.to));
        if (toSocket) {
            io.to(toSocket).emit('private-user-typing', { from: data.from });
        }
    });

    socket.on('private-stop-typing', (data) => {
        const toSocket = onlineUsers.get(normalizeUsername(data.to));
        if (toSocket) {
            io.to(toSocket).emit('private-user-stop-typing', { from: data.from });
        }
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            onlineUsers.delete(socket.username);
            io.emit('online-users', Array.from(onlineUsers.keys()));
            console.log(`🔌 Socket disconnected: ${socket.id} (${socket.username})`);
        }
    });
});

// ========== CRON JOBS ==========
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

// ========== START SERVER ==========
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', async () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
        await User.create({
            username: 'admin',
            displayName: 'admin',
            password: 'admin123',
            gender: 'Other',
            securityQuestion: 'default',
            securityAnswer: 'default',
            coins: 999999,
            isAdmin: true
        });
        console.log('👑 Admin user created: admin / admin123');
    }
});