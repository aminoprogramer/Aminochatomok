const _TgPkg = require('node-telegram-bot-api'); const TelegramBot = _TgPkg.default || _TgPkg;

module.exports = function startTelegramBot(ctx) {
    const { User, Room, SupportTicket, ManualCoinRequest,
            Payout, CoinRequest, Notification, io, onlineUsers } = ctx;

    const token    = process.env.TELEGRAM_BOT_TOKEN;
    const adminIds = (process.env.TELEGRAM_ADMIN_IDS || '')
        .split(',').map(s => s.trim()).filter(Boolean);

    if (!token) { console.log('Telegram: TELEGRAM_BOT_TOKEN not set'); return; }
    if (!adminIds.length) { console.log('Telegram: TELEGRAM_ADMIN_IDS not set'); return; }

    const bot  = new TelegramBot(token, { polling: true });
    const norm = u => (u || '').toLowerCase();
    const isAuthed = id => adminIds.includes(String(id));

    bot.on('polling_error', err => console.error('Telegram polling error:', err.message));

    async function withAuth(msg, match, fn) {
        const chatId = msg.chat.id;
        if (!isAuthed(chatId)) {
            return bot.sendMessage(chatId, 'Unauthorized. Your chat ID: ' + chatId);
        }
        try { await fn(chatId, match); }
        catch (err) { console.error('Bot error:', err); bot.sendMessage(chatId, 'Error: ' + err.message); }
    }

    const HELP = [
        'Mokalmat Admin Bot',
        '',
        '/stats - Server stats',
        '/online - Online users',
        '/users [page] - List users',
        '/user <username>',
        '/givecoins <username> <amount>',
        '/resetpass <username> <newpass>',
        '/deleteuser <username>',
        '/tickets - Open tickets',
        '/ticket <id>',
        '/reply <id> <text>',
        '/resolve <id>',
        '/pending - Pending coin requests',
        '/approve <id>',
        '/reject <id>',
        '/payouts - Pending payouts',
        '/pay <id>',
        '/rooms - List rooms',
        '/delroom <name>',
        '/broadcast <text>'
    ].join('\n');

    bot.onText(/^\/(start|help)/, msg => withAuth(msg, null, c => bot.sendMessage(c, HELP)));

    bot.onText(/^\/stats/, msg => withAuth(msg, null, async c => {
        const [users, rooms, tickets, open, pendReq, pendPay] = await Promise.all([
            User.countDocuments(),
            Room.countDocuments(),
            SupportTicket.countDocuments(),
            SupportTicket.countDocuments({ status: { $ne: 'resolved' } }),
            ManualCoinRequest.countDocuments({ status: 'pending' }),
            Payout.countDocuments({ status: 'pending' })
        ]);
        bot.sendMessage(c, 'Stats\nUsers: ' + users + '\nOnline: ' + onlineUsers.size +
            '\nRooms: ' + rooms + '\nTickets: ' + tickets + ' (' + open + ' open)' +
            '\nPending requests: ' + pendReq + '\nPending payouts: ' + pendPay);
    }));

    bot.onText(/^\/online/, msg => withAuth(msg, null, c => {
        const list = Array.from(onlineUsers.keys());
        bot.sendMessage(c, list.length ? 'Online (' + list.length + '):\n' + list.join(', ') : 'No users online.');
    }));

    bot.onText(/^\/users(?:\s+(\d+))?/, msg => withAuth(msg, null, async c => {
        const m = msg.text.match(/^\/users(?:\s+(\d+))?/);
        const page = Math.max(1, parseInt(m[1] || '1', 10));
        const limit = 20, skip = (page - 1) * limit;
        const [total, users] = await Promise.all([
            User.countDocuments(),
            User.find({}, 'username coins isAdmin vipExpires').sort({ createdAt: -1 }).skip(skip).limit(limit).lean()
        ]);
        const lines = users.map((u, i) => {
            const vip = u.vipExpires && new Date(u.vipExpires) > new Date() ? ' VIP' : '';
            const adm = u.isAdmin ? ' ADMIN' : '';
            return (skip + i + 1) + '. ' + u.username + ' - ' + u.coins + vip + adm;
        });
        const pages = Math.ceil(total / limit) || 1;
        bot.sendMessage(c, 'Users (page ' + page + '/' + pages + ', total ' + total + '):\n\n' + lines.join('\n'));
    }));

    bot.onText(/^\/user\s+(\S+)/, (msg, match) => withAuth(msg, match, async (c, m) => {
        const u = await User.findOne({ username: norm(m[1]) }).lean();
        if (!u) return bot.sendMessage(c, 'User not found');
        const isVip = u.vipExpires && new Date(u.vipExpires) > new Date();
        bot.sendMessage(c, 'User: ' + (u.displayName || u.username) + '\n' +
            'Username: ' + u.username + '\n' +
            'Coins: ' + u.coins + '\n' +
            'Admin: ' + (u.isAdmin ? 'yes' : 'no') + '\n' +
            'VIP: ' + (isVip ? new Date(u.vipExpires).toLocaleDateString() : 'no') + '\n' +
            'Target: ' + (u.monthlyTarget || 0).toLocaleString() + '\n' +
            'Streak: ' + (u.consecutiveLoginDays || 0) + '/10');
    }));

    bot.onText(/^\/givecoins\s+(\S+)\s+(-?\d+)/, (msg, match) => withAuth(msg, match, async (c, m) => {
        const username = norm(m[1]);
        const amount = parseInt(m[2], 10);
        const user = await User.findOne({ username });
        if (!user) return bot.sendMessage(c, 'User not found');
        user.coins += amount;
        await user.save();
        await CoinRequest.create({ username: user.username, type: 'Admin Gift (Telegram)', amount });
        const sock = onlineUsers.get(user.username);
        if (sock) { io.to(sock).emit('admin-gift', { amount }); io.to(sock).emit('coins-updated', user.coins); }
        bot.sendMessage(c, 'Gave ' + amount + ' coins to ' + username + '. Balance: ' + user.coins);
    }));

    bot.onText(/^\/resetpass\s+(\S+)\s+(.+)/, (msg, match) => withAuth(msg, match, async (c, m) => {
        const user = await User.findOne({ username: norm(m[1]) });
        if (!user) return bot.sendMessage(c, 'User not found');
        user.password = m[2].trim();
        await user.save();
        bot.sendMessage(c, 'Password reset for ' + user.username);
    }));

    bot.onText(/^\/deleteuser\s+(\S+)/, (msg, match) => withAuth(msg, match, async (c, m) => {
        const username = norm(m[1]);
        const user = await User.findOne({ username });
        if (!user) return bot.sendMessage(c, 'User not found');
        if (user.isAdmin) return bot.sendMessage(c, 'Cannot delete admin');
        await User.deleteOne({ username });
        bot.sendMessage(c, 'Deleted ' + username);
    }));

    bot.onText(/^\/tickets$/, msg => withAuth(msg, null, async c => {
        const tickets = await SupportTicket.find({ status: { $ne: 'resolved' } }).sort({ createdAt: -1 }).limit(20).lean();
        if (!tickets.length) return bot.sendMessage(c, 'No open tickets.');
        bot.sendMessage(c, 'Open tickets:\n\n' + tickets.map(t => '#' + t.ticketId + ' [' + t.status + '] ' + t.username + ': ' + t.subject).join('\n'));
    }));

    bot.onText(/^\/ticket\s+(\S+)/, (msg, match) => withAuth(msg, match, async (c, m) => {
        const tk = await SupportTicket.findOne({ ticketId: m[1] }).lean();
        if (!tk) return bot.sendMessage(c, 'Not found');
        bot.sendMessage(c, '#' + tk.ticketId + ' [' + tk.status + ']\nFrom: ' + tk.username + '\nSubject: ' + tk.subject + '\n\n' + tk.message);
    }));

    bot.onText(/^\/reply\s+(\S+)\s+([\s\S]+)/, (msg, match) => withAuth(msg, match, async (c, m) => {
        const ticket = await SupportTicket.findOne({ ticketId: m[1] });
        if (!ticket) return bot.sendMessage(c, 'Not found');
        const reply = m[2].trim();
        ticket.adminReply = reply;
        ticket.status = 'in-progress';
        ticket.updatedAt = Date.now();
        await ticket.save();
        await Notification.create({ username: ticket.username, title: 'Support Reply', message: 'Admin replied: ' + reply.substring(0, 100) });
        const sock = onlineUsers.get(ticket.username);
        if (sock) io.to(sock).emit('support-reply', { ticketId: ticket.ticketId, reply });
        bot.sendMessage(c, 'Replied to ' + ticket.ticketId);
    }));

    bot.onText(/^\/resolve\s+(\S+)/, (msg, match) => withAuth(msg, match, async (c, m) => {
        const ticket = await SupportTicket.findOne({ ticketId: m[1] });
        if (!ticket) return bot.sendMessage(c, 'Not found');
        ticket.status = 'resolved';
        ticket.updatedAt = Date.now();
        await ticket.save();
        await Notification.create({ username: ticket.username, title: 'Ticket Resolved', message: 'Ticket ' + ticket.ticketId + ' resolved' });
        const sock = onlineUsers.get(ticket.username);
        if (sock) io.to(sock).emit('support-resolved', { ticketId: ticket.ticketId });
        bot.sendMessage(c, 'Resolved ' + ticket.ticketId);
    }));

    bot.onText(/^\/pending$/, msg => withAuth(msg, null, async c => {
        const reqs = await ManualCoinRequest.find({ status: 'pending' }).lean();
        if (!reqs.length) return bot.sendMessage(c, 'No pending requests.');
        bot.sendMessage(c, 'Pending:\n\n' + reqs.map(r => r._id + '\n   ' + r.username + ' | ' + r.amount + ' | ' + r.paymentMethod).join('\n\n'));
    }));

    bot.onText(/^\/approve\s+(\S+)/, (msg, match) => withAuth(msg, match, async (c, m) => {
        const reqDoc = await ManualCoinRequest.findById(m[1]);
        if (!reqDoc) return bot.sendMessage(c, 'Not found');
        if (reqDoc.status !== 'pending') return bot.sendMessage(c, 'Already ' + reqDoc.status);
        const user = await User.findOne({ username: reqDoc.username });
        if (!user) return bot.sendMessage(c, 'User not found');
        user.coins += reqDoc.amount;
        await user.save();
        await CoinRequest.create({ username: user.username, type: 'Manual (Telegram)', amount: reqDoc.amount });
        reqDoc.status = 'approved';
        await reqDoc.save();
        const sock = onlineUsers.get(user.username);
        if (sock) io.to(sock).emit('coins-updated', user.coins);
        bot.sendMessage(c, 'Approved ' + reqDoc.amount + ' coins for ' + user.username);
    }));

    bot.onText(/^\/reject\s+(\S+)/, (msg, match) => withAuth(msg, match, async (c, m) => {
        const reqDoc = await ManualCoinRequest.findById(m[1]);
        if (!reqDoc) return bot.sendMessage(c, 'Not found');
        reqDoc.status = 'rejected';
        await reqDoc.save();
        bot.sendMessage(c, 'Rejected ' + m[1]);
    }));

    bot.onText(/^\/payouts$/, msg => withAuth(msg, null, async c => {
        const payouts = await Payout.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(30).lean();
        if (!payouts.length) return bot.sendMessage(c, 'No pending payouts.');
        bot.sendMessage(c, 'Pending payouts:\n\n' + payouts.map(p => p._id + '\n   ' + p.username + ' | ' + p.targetAmount.toLocaleString() + ' -> $' + p.dollarsEarned + ' | ' + p.month).join('\n\n'));
    }));

    bot.onText(/^\/pay\s+(\S+)/, (msg, match) => withAuth(msg, match, async (c, m) => {
        const payout = await Payout.findById(m[1]);
        if (!payout) return bot.sendMessage(c, 'Not found');
        if (payout.status === 'paid') return bot.sendMessage(c, 'Already paid');
        payout.status = 'paid';
        payout.paidAt = new Date();
        await payout.save();
        const user = await User.findOne({ username: payout.username });
        if (user) { user.totalPaid = (user.totalPaid || 0) + payout.dollarsEarned; await user.save(); }
        const sock = onlineUsers.get(payout.username);
        if (sock) io.to(sock).emit('payout-paid', { amount: payout.dollarsEarned, month: payout.month });
        bot.sendMessage(c, 'Paid $' + payout.dollarsEarned + ' to ' + payout.username);
    }));

    bot.onText(/^\/rooms$/, msg => withAuth(msg, null, async c => {
        const rooms = await Room.find({}, 'name owner members boostLevel isVipRoom').lean();
        if (!rooms.length) return bot.sendMessage(c, 'No rooms.');
        bot.sendMessage(c, 'Rooms:\n\n' + rooms.map(r => r.name + ' | owner: ' + r.owner + ' | ' + r.members.length + ' | boost ' + (r.boostLevel || 0) + (r.isVipRoom ? ' VIP' : '')).join('\n'));
    }));

    bot.onText(/^\/delroom\s+(.+)/, (msg, match) => withAuth(msg, match, async (c, m) => {
        const name = m[1].trim();
        const room = await Room.findOne({ name }).collation({ locale: 'en', strength: 2 });
        if (!room) return bot.sendMessage(c, 'Room not found');
        await Room.deleteOne({ _id: room._id });
        bot.sendMessage(c, 'Deleted ' + room.name);
    }));

    bot.onText(/^\/broadcast\s+([\s\S]+)/, (msg, match) => withAuth(msg, match, async (c, m) => {
        const text = m[1].trim();
        const rooms = await Room.find({}, 'name').lean();
        const payload = { username: 'Admin', message: text, timestamp: new Date().toLocaleTimeString(), type: 'text', isVIP: false, isModerator: true };
        rooms.forEach(r => io.to(r.name).emit('new-room-message', payload));
        bot.sendMessage(c, 'Broadcast sent to ' + rooms.length + ' rooms.');
    }));

    bot.on('message', msg => {
        if (!msg.text || !msg.text.startsWith('/')) return;
        if (!isAuthed(msg.chat.id)) return;
        const known = /^\/(start|help|stats|online|users|user|givecoins|resetpass|deleteuser|tickets|ticket|reply|resolve|pending|approve|reject|payouts|pay|rooms|delroom|broadcast)\b/;
        if (!known.test(msg.text)) bot.sendMessage(msg.chat.id, 'Unknown command. Send /start');
    });

    console.log('Telegram admin bot started');
    console.log('   Authorized chat IDs:', adminIds.join(', '));
};
