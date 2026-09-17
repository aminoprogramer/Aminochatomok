// ============================================================
//  telegram-bot.js — Admin control panel via Telegram
// ============================================================
//  Fixes applied:
//    • Forces IPv4-first DNS resolution (fixes ECONNABORTED on Node 20+)
//    • Adds request agent keepAlive + family:4 to polling
//    • Silences transient polling errors (ECONNABORTED/ETIMEDOUT/etc.)
//    • Supports WEBHOOK mode when WEBHOOK_URL is set
//    • Falls back to POLLING mode for local dev
//
//  .env:
//      TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
//      TELEGRAM_ADMIN_IDS=123456789,987654321
//
//      # Optional (recommended for Render):
//      WEBHOOK_URL=https://your-app.onrender.com
//      WEBHOOK_SECRET=some-random-string
// ============================================================

// ---- IPv4 FIX (must be at the very top, before any network code) ----
const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}
// Also set the older API for maximum compatibility
try { dns.setServers(['8.8.8.8', '8.8.4.4']); } catch (_) {}

let TelegramBot = null;
try { TelegramBot = require('node-telegram-bot-api'); } catch (_) {}

const MAX_MSG = 3800;
const chunk = (str, size = MAX_MSG) => {
    const out = [];
    for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
    return out;
};
const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function startTelegramBot(ctx) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.log('ℹ️  Telegram bot disabled (no TELEGRAM_BOT_TOKEN)');
        return null;
    }
    if (!TelegramBot) {
        console.log('⚠️  Telegram bot: run `npm install node-telegram-bot-api` then restart');
        return null;
    }

    const adminIds = (process.env.TELEGRAM_ADMIN_IDS || '')
        .split(',').map(s => s.trim()).filter(Boolean).map(Number);
    if (!adminIds.length) {
        console.log('⚠️  TELEGRAM_ADMIN_IDS is empty — nobody can use the bot');
    }

    const { io, onlineUsers, models, helpers, app } = ctx;
    const {
        User, Room, Gift, SupportTicket, Notification, Payout,
        ManualCoinRequest, BoostLog, CoinRequest, FriendRequest,
        PrivateMessage, PaymentTransaction, CryptoPayment
    } = models;
    const { normalizeUsername, calculatePayout, findRoomInsensitive } = helpers;

    // ---- Mode selection: webhook if WEBHOOK_URL is set, else polling ----
    const useWebhook = !!process.env.WEBHOOK_URL;
    const webhookPath = '/telegram-webhook';
    const webhookSecret = process.env.WEBHOOK_SECRET || 'mokalmat-secret';

    let bot;

    // Shared request options to force IPv4 and keep connections alive
    const requestOptions = {
        agentOptions: {
            keepAlive: true,
            keepAliveMsecs: 30000,
            family: 4
        }
    };

    if (useWebhook) {
        // ---- WEBHOOK MODE (recommended for Render) ----
        bot = new TelegramBot(token, { polling: false });

        if (app) {
            app.post(webhookPath, (req, res) => {
                const secret = req.headers['x-telegram-bot-api-secret-token'];
                if (secret !== webhookSecret) {
                    console.warn('⚠️  Telegram webhook: invalid secret token');
                    return res.sendStatus(401);
                }
                try {
                    bot.processUpdate(req.body);
                } catch (e) {
                    console.error('Webhook processUpdate error:', e);
                }
                res.sendStatus(200);
            });

            const fullUrl = process.env.WEBHOOK_URL.replace(/\/$/, '') + webhookPath;

            bot.deleteWebHook({ drop_pending_updates: true })
                .then(() => bot.setWebHook(fullUrl, { secret_token: webhookSecret }))
                .then(() => console.log(`🤖 Telegram bot started in WEBHOOK mode → ${fullUrl}`))
                .catch(err => console.error('❌ Failed to set webhook:', err.message));
        } else {
            console.error('❌ Webhook mode requires `app` in ctx — falling back to polling');
            bot = new TelegramBot(token, {
                polling: {
                    interval: 2000,
                    autoStart: true,
                    params: { timeout: 30 }
                },
                request: requestOptions
            });
        }
    } else {
        // ---- POLLING MODE (local dev / background worker) ----
        // NOTE: IPv4 is forced via dns.setDefaultResultOrder at the top of this file
        bot = new TelegramBot(token, {
            polling: {
                interval: 2000,
                autoStart: true,
                params: { timeout: 30 }
            },
            request: requestOptions
        });
        console.log('🤖 Telegram bot started in POLLING mode (IPv4 forced)');
    }

    // ============================================================
    //  HELPERS
    // ============================================================
    const isAuth = (msg) => adminIds.includes(msg.from?.id);

    const send = async (chatId, text, extra = {}) => {
        for (const part of chunk(String(text))) {
            await bot.sendMessage(chatId, part, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                ...extra
            }).catch(err => console.error('TG send error:', err.message));
        }
    };

    const guard = (fn) => async (msg, match) => {
        if (!isAuth(msg)) {
            return bot.sendMessage(msg.chat.id, '⛔ Unauthorized.').catch(() => {});
        }
        try {
            await fn(msg, match);
        } catch (e) {
            console.error('Bot command error:', e);
            await send(msg.chat.id, `❌ <b>Error:</b> ${esc(e.message)}`);
        }
    };

    const userLine = (u) =>
        `👤 <b>${esc(u.displayName || u.username)}</b> (<code>${esc(u.username)}</code>)` +
        `\n   💰 ${u.coins} coins` +
        (u.isAdmin ? ' · 👑 admin' : '') +
        ((u.vipExpires && new Date(u.vipExpires) > new Date()) ? ' · 💎 VIP' : '');

    const ticketLine = (t) =>
        `🎫 <code>${esc(t.ticketId)}</code> · <b>${esc(t.status)}</b>` +
        `\n   👤 ${esc(t.username)}` +
        `\n   📝 ${esc(t.subject)}`;

    // ============================================================
    //  COMMANDS
    // ============================================================

    // ---- /start /help ----
    bot.onText(/^\/(start|help)\b/, guard(async (msg) => {
        const help = [
            '🤖 <b>Mokalmat Admin Bot</b>',
            '',
            '<b>📊 Stats & Info</b>',
            '/stats — server overview',
            '/online — list online users',
            '',
            '<b>👥 Users</b>',
            '/users [page] — list users',
            '/finduser &lt;query&gt; — search users',
            '/user &lt;username&gt; — details + actions',
            '/givecoins &lt;username&gt; &lt;amount&gt;',
            '/resetpass &lt;username&gt; &lt;newpass&gt;',
            '/vip &lt;username&gt; [days] — grant VIP',
            '/unvip &lt;username&gt; — revoke VIP',
            '/deleteuser &lt;username&gt;',
            '',
            '<b>🏠 Rooms</b>',
            '/rooms — all rooms',
            '/room &lt;name&gt; — details',
            '/deleteroom &lt;name&gt;',
            '/kick &lt;username&gt; — kick from all rooms',
            '',
            '<b>🎫 Support</b>',
            '/tickets [all|open|in-progress|resolved]',
            '/ticket &lt;id&gt; — view one ticket',
            '/reply &lt;id&gt; &lt;message&gt;',
            '/resolve &lt;id&gt;',
            '',
            '<b>💰 Payments</b>',
            '/pending — pending coin requests',
            '/approve &lt;id&gt; · /reject &lt;id&gt;',
            '/payouts — all payouts',
            '/markpaid &lt;id&gt;',
            '',
            '<b>📢 Messaging</b>',
            '/broadcast &lt;message&gt;',
            '/notify &lt;username&gt; &lt;message&gt;',
            '',
            '<b>📈 Logs</b>',
            '/boostlogs — recent boosts',
            '/gifts [n] — recent gifts',
            '',
            '<i>Also: tap inline buttons on user/ticket/request messages.</i>'
        ].join('\n');
        await send(msg.chat.id, help);
    }));

    // ---- /stats ----
    bot.onText(/^\/stats\b/, guard(async (msg) => {
        const [totalUsers, totalRooms, vipUsers, openTickets, pendingPayouts, pendingReqs] = await Promise.all([
            User.countDocuments(),
            Room.countDocuments(),
            User.countDocuments({ vipExpires: { $gt: new Date() } }),
            SupportTicket.countDocuments({ status: { $ne: 'resolved' } }),
            Payout.countDocuments({ status: 'pending' }),
            ManualCoinRequest.countDocuments({ status: 'pending' })
        ]);

        const text =
            `📊 <b>Server Stats</b>\n\n` +
            `👥 Users: <b>${totalUsers}</b>\n` +
            `🟢 Online: <b>${onlineUsers.size}</b>\n` +
            `💎 VIP users: <b>${vipUsers}</b>\n` +
            `🏠 Rooms: <b>${totalRooms}</b>\n` +
            `🎫 Open tickets: <b>${openTickets}</b>\n` +
            `💵 Pending payouts: <b>${pendingPayouts}</b>\n` +
            `💳 Pending coin requests: <b>${pendingReqs}</b>`;

        await send(msg.chat.id, text);
    }));

    // ---- /online ----
    bot.onText(/^\/online\b/, guard(async (msg) => {
        const users = Array.from(onlineUsers.keys());
        if (!users.length) return send(msg.chat.id, '😴 Nobody online.');
        await send(msg.chat.id, `🟢 <b>Online (${users.length}):</b>\n` + users.map(u => `• <code>${esc(u)}</code>`).join('\n'));
    }));

    // ---- /users [page] ----
    bot.onText(/^\/users(?:\s+(\d+))?/, guard(async (msg, match) => {
        const page = Math.max(1, parseInt(match[1] || '1', 10));
        const perPage = 20;
        const total = await User.countDocuments();
        const users = await User.find({}, 'username displayName coins isAdmin vipExpires')
            .sort({ createdAt: -1 })
            .skip((page - 1) * perPage)
            .limit(perPage);

        const totalPages = Math.max(1, Math.ceil(total / perPage));
        const text =
            `👥 <b>Users</b> (page ${page}/${totalPages}, total ${total})\n\n` +
            users.map(userLine).join('\n\n');

        const kb = [];
        const nav = [];
        if (page > 1)     nav.push({ text: '⬅️ Prev', callback_data: `users:page:${page - 1}` });
        if (page < totalPages) nav.push({ text: 'Next ➡️', callback_data: `users:page:${page + 1}` });
        if (nav.length) kb.push(nav);

        await send(msg.chat.id, text, kb.length ? { reply_markup: { inline_keyboard: kb } } : {});
    }));

    // ---- /finduser <query> ----
    bot.onText(/^\/finduser\s+(.+)$/, guard(async (msg, match) => {
        const q = match[1].trim().toLowerCase();
        const users = await User.find({
            $or: [
                { username: { $regex: q, $options: 'i' } },
                { displayName: { $regex: q, $options: 'i' } }
            ]
        }).limit(20);

        if (!users.length) return send(msg.chat.id, `🔍 No users matching "${esc(q)}".`);
        await send(msg.chat.id, `🔍 <b>Results for "${esc(q)}":</b>\n\n` + users.map(userLine).join('\n\n'));
    }));

    // ---- /user <username> ----
    bot.onText(/^\/user\s+(\S+)/, guard(async (msg, match) => {
        const username = normalizeUsername(match[1]);
        const u = await User.findOne({ username });
        if (!u) return send(msg.chat.id, `❌ User <code>${esc(username)}</code> not found.`);

        const online = onlineUsers.has(username);
        const isVipActive = u.vipExpires && new Date(u.vipExpires) > new Date();

        const text =
            `👤 <b>${esc(u.displayName || u.username)}</b>\n` +
            `<code>${esc(u.username)}</code>\n` +
            `${online ? '🟢 Online' : '⚫ Offline'}\n\n` +
            `💰 Coins: <b>${u.coins}</b>\n` +
            `💎 VIP: <b>${isVipActive ? new Date(u.vipExpires).toLocaleDateString() : 'no'}</b>\n` +
            `🎯 Monthly target: <b>${(u.monthlyTarget || 0).toLocaleString()}</b> ($${calculatePayout(u.monthlyTarget)})\n` +
            `🔥 Streak: <b>${u.consecutiveLoginDays || 0}</b> / 10\n` +
            `👑 Admin: <b>${u.isAdmin ? 'yes' : 'no'}</b>\n` +
            `👥 Friends: ${u.friends?.length || 0}\n` +
            `📅 Joined: ${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '?'}`;

        const kb = [
            [{ text: '💰 +1000 coins', callback_data: `u:addcoins:${u.username}:1000` },
             { text: '💰 +5000 coins', callback_data: `u:addcoins:${u.username}:5000` }],
            [{ text: '💎 Grant VIP 30d', callback_data: `u:vip:${u.username}:30` },
             { text: '❌ Revoke VIP', callback_data: `u:unvip:${u.username}` }],
            [{ text: '📨 Send message', callback_data: `u:notify:${u.username}` }],
            [{ text: '🗑 Delete user', callback_data: `u:delete:${u.username}` }]
        ];

        await send(msg.chat.id, text, { reply_markup: { inline_keyboard: kb } });
    }));

    // ---- /givecoins <username> <amount> ----
    bot.onText(/^\/givecoins\s+(\S+)\s+(-?\d+)$/, guard(async (msg, match) => {
        const username = normalizeUsername(match[1]);
        const amount = parseInt(match[2], 10);
        const u = await User.findOne({ username });
        if (!u) return send(msg.chat.id, `❌ User <code>${esc(username)}</code> not found.`);

        u.coins += amount;
        await u.save();
        await CoinRequest.create({ username: u.username, type: 'Admin Gift (Telegram)', amount });

        const sock = onlineUsers.get(u.username);
        if (sock) io.to(sock).emit('coins-updated', u.coins);

        await send(msg.chat.id, `✅ <b>${esc(u.username)}</b> got <b>${amount > 0 ? '+' : ''}${amount}</b> coins.\nNew balance: <b>${u.coins}</b>`);
    }));

    // ---- /resetpass <username> <newpass> ----
    bot.onText(/^\/resetpass\s+(\S+)\s+(.+)$/, guard(async (msg, match) => {
        const username = normalizeUsername(match[1]);
        const newPassword = match[2].trim();
        if (newPassword.length < 4) return send(msg.chat.id, '❌ Password must be ≥ 4 chars.');

        const u = await User.findOne({ username });
        if (!u) return send(msg.chat.id, `❌ User <code>${esc(username)}</code> not found.`);

        u.password = newPassword;
        await u.save();
        await send(msg.chat.id, `✅ Password for <b>${esc(u.username)}</b> reset.`);
    }));

    // ---- /vip <username> [days] ----
    bot.onText(/^\/vip\s+(\S+)(?:\s+(\d+))?/, guard(async (msg, match) => {
        const username = normalizeUsername(match[1]);
        const days = parseInt(match[2] || '30', 10);
        const u = await User.findOne({ username });
        if (!u) return send(msg.chat.id, `❌ User <code>${esc(username)}</code> not found.`);

        const base = (u.vipExpires && new Date(u.vipExpires) > new Date())
            ? new Date(u.vipExpires).getTime()
            : Date.now();
        u.vipExpires = new Date(base + days * 24 * 60 * 60 * 1000);
        await u.save();

        const sock = onlineUsers.get(u.username);
        if (sock) io.to(sock).emit('coins-updated', u.coins);

        await send(msg.chat.id, `💎 <b>${esc(u.username)}</b> is now VIP until <b>${u.vipExpires.toLocaleDateString()}</b>.`);
    }));

    // ---- /unvip <username> ----
    bot.onText(/^\/unvip\s+(\S+)/, guard(async (msg, match) => {
        const username = normalizeUsername(match[1]);
        const u = await User.findOne({ username });
        if (!u) return send(msg.chat.id, `❌ User <code>${esc(username)}</code> not found.`);
        u.vipExpires = null;
        await u.save();
        await send(msg.chat.id, `❌ VIP revoked for <b>${esc(u.username)}</b>.`);
    }));

    // ---- /deleteuser <username> ----
    bot.onText(/^\/deleteuser\s+(\S+)/, guard(async (msg, match) => {
        const username = normalizeUsername(match[1]);
        const u = await User.findOne({ username });
        if (!u) return send(msg.chat.id, `❌ User <code>${esc(username)}</code> not found.`);
        await send(msg.chat.id, `⚠️ Delete <b>${esc(u.username)}</b>? (coins: ${u.coins})`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🗑 YES, delete', callback_data: `u:confirmdelete:${u.username}` },
                    { text: 'Cancel', callback_data: 'noop' }
                ]]
            }
        });
    }));

    // ---- /rooms ----
    bot.onText(/^\/rooms\b/, guard(async (msg) => {
        const rooms = await Room.find({}, 'name owner members boostLevel isVipRoom membersOnly').sort({ activity: -1 }).limit(60);
        if (!rooms.length) return send(msg.chat.id, '🏠 No rooms yet.');
        const text =
            `🏠 <b>Rooms (${rooms.length})</b>\n\n` +
            rooms.map(r =>
                `#${esc(r.name)}${r.isVipRoom ? ' 💎' : ''}${r.membersOnly ? ' 🔒' : ''}` +
                `\n   👥 ${r.members.length} · 🚀 ${r.boostLevel} · owner: ${esc(r.owner || '—')}`
            ).join('\n');
        await send(msg.chat.id, text);
    }));

    // ---- /room <name> ----
    bot.onText(/^\/room\s+(.+)$/, guard(async (msg, match) => {
        const name = match[1].trim();
        const r = await findRoomInsensitive(name);
        if (!r) return send(msg.chat.id, `❌ Room "${esc(name)}" not found.`);
        const text =
            `🏠 <b>#${esc(r.name)}</b>\n\n` +
            `👑 Owner: <code>${esc(r.owner || '—')}</code>\n` +
            `👥 Members (${r.members.length}): ${r.members.map(esc).join(', ') || '—'}\n` +
            `🛡 Moderators: ${r.moderators?.map(esc).join(', ') || '—'}\n` +
            `🚫 Kicked: ${r.kicked?.map(esc).join(', ') || '—'}\n` +
            `🚀 Boost: <b>${r.boostLevel || 0}</b>\n` +
            `💎 VIP: ${r.isVipRoom ? 'yes' : 'no'}\n` +
            `🔒 Members-only: ${r.membersOnly ? 'yes' : 'no'}`;
        await send(msg.chat.id, text, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🗑 Delete room', callback_data: `r:confirmdelete:${r.name}` }
                ]]
            }
        });
    }));

    // ---- /deleteroom <name> ----
    bot.onText(/^\/deleteroom\s+(.+)$/, guard(async (msg, match) => {
        const name = match[1].trim();
        const r = await findRoomInsensitive(name);
        if (!r) return send(msg.chat.id, `❌ Room not found.`);
        await send(msg.chat.id, `⚠️ Delete room <b>#${esc(r.name)}</b>?`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🗑 Delete', callback_data: `r:confirmdelete:${r.name}` },
                    { text: 'Cancel', callback_data: 'noop' }
                ]]
            }
        });
    }));

    // ---- /kick <username> ----
    bot.onText(/^\/kick\s+(\S+)/, guard(async (msg, match) => {
        const username = normalizeUsername(match[1]);
        const rooms = await Room.find({ members: username });
        if (!rooms.length) return send(msg.chat.id, `ℹ️ <b>${esc(username)}</b> is not in any rooms.`);

        for (const r of rooms) {
            r.members = r.members.filter(m => m !== username);
            if (!r.kicked.includes(username)) r.kicked.push(username);
            await r.save();
            io.to(r.name).emit('user-left-room', { username });
        }
        const sock = onlineUsers.get(username);
        if (sock) io.to(sock).emit('kicked-from-room', { room: '(all rooms)' });

        await send(msg.chat.id, `🚫 Kicked <b>${esc(username)}</b> from ${rooms.length} room(s).`);
    }));

    // ---- /tickets [status] ----
    bot.onText(/^\/tickets(?:\s+(\S+))?/, guard(async (msg, match) => {
        const status = (match[1] || 'all').toLowerCase();
        const filter = status === 'all' ? {} : { status };
        const tickets = await SupportTicket.find(filter).sort({ createdAt: -1 }).limit(30);

        if (!tickets.length) return send(msg.chat.id, `🎫 No tickets (${esc(status)}).`);
        await send(msg.chat.id, `🎫 <b>Tickets (${tickets.length}, filter=${esc(status)})</b>\n\n` +
            tickets.map(ticketLine).join('\n\n'), {
                reply_markup: {
                    inline_keyboard: tickets.slice(0, 10).map(t => ([{
                        text: `📩 ${t.ticketId} · ${t.username}`,
                        callback_data: `ticket:view:${t.ticketId}`
                    }]))
                }
            });
    }));

    // ---- /ticket <id> ----
    bot.onText(/^\/ticket\s+(\S+)/, guard(async (msg, match) => {
        const ticketId = match[1].trim();
        const t = await SupportTicket.findOne({ ticketId });
        if (!t) return send(msg.chat.id, `❌ Ticket <code>${esc(ticketId)}</code> not found.`);
        await sendTicketDetails(msg.chat.id, t);
    }));

    // ---- /reply <id> <message> ----
    bot.onText(/^\/reply\s+(\S+)\s+([\s\S]+)$/, guard(async (msg, match) => {
        const ticketId = match[1].trim();
        const reply = match[2].trim();
        const ticket = await SupportTicket.findOne({ ticketId });
        if (!ticket) return send(msg.chat.id, `❌ Ticket not found.`);

        await Notification.create({
            username: normalizeUsername(ticket.username),
            title: 'Support Reply',
            message: `Admin replied to ticket ${ticket.ticketId}`,
            type: 'support_reply',
            data: { ticketId: ticket.ticketId, reply }
        });
        const sock = onlineUsers.get(normalizeUsername(ticket.username));
        if (sock) io.to(sock).emit('support-reply', { ticketId: ticket.ticketId, reply });

        ticket.adminReply = reply;
        ticket.status = 'in-progress';
        ticket.updatedAt = Date.now();
        await ticket.save();

        await send(msg.chat.id, `✅ Reply sent to <b>${esc(ticket.username)}</b> on ticket <code>${esc(ticket.ticketId)}</code>.`);
    }));

    // ---- /resolve <id> ----
    bot.onText(/^\/resolve\s+(\S+)/, guard(async (msg, match) => {
        const ticketId = match[1].trim();
        const ticket = await SupportTicket.findOne({ ticketId });
        if (!ticket) return send(msg.chat.id, `❌ Ticket not found.`);

        await Notification.create({
            username: normalizeUsername(ticket.username),
            title: 'Ticket Resolved',
            message: `Ticket ${ticket.ticketId} was resolved`,
            type: 'support_resolved',
            data: { ticketId: ticket.ticketId }
        });
        const sock = onlineUsers.get(normalizeUsername(ticket.username));
        if (sock) io.to(sock).emit('support-resolved', { ticketId: ticket.ticketId });

        ticket.status = 'resolved';
        ticket.updatedAt = Date.now();
        await ticket.save();

        await send(msg.chat.id, `✅ Ticket <code>${esc(ticket.ticketId)}</code> marked resolved.`);
    }));

    // ---- /pending ----
    bot.onText(/^\/pending\b/, guard(async (msg) => {
        const reqs = await ManualCoinRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(20);
        if (!reqs.length) return send(msg.chat.id, '✅ No pending requests.');

        for (const r of reqs) {
            const text =
                `💳 <b>Pending request</b>\n` +
                `ID: <code>${r._id}</code>\n` +
                `👤 ${esc(r.username)}\n` +
                `💰 ${r.amount} coins\n` +
                `💠 Method: ${esc(r.paymentMethod || '—')}\n` +
                (r.giftCardNumber ? `🎁 Card: <code>${esc(r.giftCardNumber)}</code>\n` : '') +
                (r.cryptoTransactionId ? `₿ TX: <code>${esc(r.cryptoTransactionId)}</code>\n` : '') +
                (r.proof ? `🖼 Proof: sent\n` : '') +
                `📅 ${new Date(r.createdAt).toLocaleString()}`;

            await send(msg.chat.id, text, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Approve', callback_data: `req:approve:${r._id}` },
                        { text: '❌ Reject',  callback_data: `req:reject:${r._id}` }
                    ]]
                }
            });
        }
    }));

    // ---- /approve <id> ----
    bot.onText(/^\/approve\s+(\S+)/, guard(async (msg, match) => {
        await approveManualRequest(match[1].trim(), msg.chat.id);
    }));

    // ---- /reject <id> ----
    bot.onText(/^\/reject\s+(\S+)/, guard(async (msg, match) => {
        await rejectManualRequest(match[1].trim(), msg.chat.id);
    }));

    // ---- /payouts ----
    bot.onText(/^\/payouts\b/, guard(async (msg) => {
        const payouts = await Payout.find().sort({ createdAt: -1 }).limit(25);
        if (!payouts.length) return send(msg.chat.id, '💵 No payouts yet.');
        const text =
            `💵 <b>Payouts (${payouts.length})</b>\n\n` +
            payouts.map(p =>
                `• <b>${esc(p.username)}</b> · ${esc(p.month)} · ${p.targetAmount.toLocaleString()} → $${p.dollarsEarned}` +
                ` · <i>${esc(p.status)}</i>\n  ID: <code>${p._id}</code>`
            ).join('\n');
        await send(msg.chat.id, text);
    }));

    // ---- /markpaid <id> ----
    bot.onText(/^\/markpaid\s+(\S+)/, guard(async (msg, match) => {
        const id = match[1].trim();
        const p = await Payout.findById(id);
        if (!p) return send(msg.chat.id, '❌ Payout not found.');
        if (p.status === 'paid') return send(msg.chat.id, 'ℹ️ Already paid.');

        p.status = 'paid';
        p.paidAt = new Date();
        await p.save();

        const u = await User.findOne({ username: p.username });
        if (u) {
            u.totalPaid = (u.totalPaid || 0) + p.dollarsEarned;
            await u.save();
        }
        const sock = onlineUsers.get(p.username);
        if (sock) io.to(sock).emit('payout-paid', { amount: p.dollarsEarned, month: p.month });

        await send(msg.chat.id, `✅ Payout for <b>${esc(p.username)}</b> ($${p.dollarsEarned}) marked paid.`);
    }));

    // ---- /broadcast <msg> ----
    bot.onText(/^\/broadcast\s+([\s\S]+)$/, guard(async (msg, match) => {
        const text = match[1].trim();
        io.emit('admin-broadcast', { message: text });

        const users = await User.find({}, 'username');
        if (users.length) {
            await Notification.insertMany(users.map(u => ({
                username: u.username,
                title: 'Announcement',
                message: text,
                type: 'admin_broadcast',
                data: null
            })));
        }

        await send(msg.chat.id, `📢 Broadcast sent to <b>${onlineUsers.size}</b> online + stored for ${users.length} users.`);
    }));

    // ---- /notify <username> <msg> ----
    bot.onText(/^\/notify\s+(\S+)\s+([\s\S]+)$/, guard(async (msg, match) => {
        const username = normalizeUsername(match[1]);
        const message = match[2].trim();
        const u = await User.findOne({ username });
        if (!u) return send(msg.chat.id, `❌ User <code>${esc(username)}</code> not found.`);

        await Notification.create({
            username,
            title: 'Admin Message',
            message,
            type: 'admin_message',
            data: null
        });
        const sock = onlineUsers.get(username);
        if (sock) io.to(sock).emit('admin-notification', { title: 'Admin Message', message });

        await send(msg.chat.id, `📨 Sent to <b>${esc(username)}</b>${sock ? ' (online)' : ' (offline — will see on next login)'}.`);
    }));

    // ---- /boostlogs ----
    bot.onText(/^\/boostlogs\b/, guard(async (msg) => {
        const logs = await BoostLog.find().sort({ timestamp: -1 }).limit(20);
        if (!logs.length) return send(msg.chat.id, '📊 No boost logs.');
        await send(msg.chat.id,
            `📊 <b>Recent boosts (${logs.length})</b>\n\n` +
            logs.map(l => `• ${esc(l.username)} → #${esc(l.roomName)} · 🚀 ${l.amount} · ${new Date(l.timestamp).toLocaleString()}`).join('\n')
        );
    }));

    // ---- /gifts [n] ----
    bot.onText(/^\/gifts(?:\s+(\d+))?/, guard(async (msg, match) => {
        const n = Math.min(parseInt(match[1] || '15', 10), 50);
        const gifts = await Gift.find().sort({ timestamp: -1 }).limit(n);
        if (!gifts.length) return send(msg.chat.id, '🎁 No gifts yet.');
        await send(msg.chat.id,
            `🎁 <b>Recent gifts (${gifts.length})</b>\n\n` +
            gifts.map(g => `• ${esc(g.from)} → ${esc(g.to)} · ${g.amount} 🪙 · 🎯 +${g.targetContribution || 0}`).join('\n')
        );
    }));

    // ============================================================
    //  CALLBACK QUERIES (inline buttons)
    // ============================================================
    bot.on('callback_query', async (q) => {
        if (!adminIds.includes(q.from.id)) {
            return bot.answerCallbackQuery(q.id, { text: '⛔ Unauthorized' }).catch(() => {});
        }
        const data = q.data || '';
        const [ns, action, ...rest] = data.split(':');
        const chatId = q.message.chat.id;

        try {
            await bot.answerCallbackQuery(q.id);

            if (data === 'noop') return;

            // ---------- users:page ----------
            if (ns === 'users' && action === 'page') {
                const page = parseInt(rest[0], 10);
                const perPage = 20;
                const total = await User.countDocuments();
                const users = await User.find({}, 'username displayName coins isAdmin vipExpires')
                    .sort({ createdAt: -1 }).skip((page - 1) * perPage).limit(perPage);
                const totalPages = Math.max(1, Math.ceil(total / perPage));
                const text =
                    `👥 <b>Users</b> (page ${page}/${totalPages}, total ${total})\n\n` +
                    users.map(userLine).join('\n\n');
                const nav = [];
                if (page > 1) nav.push({ text: '⬅️ Prev', callback_data: `users:page:${page - 1}` });
                if (page < totalPages) nav.push({ text: 'Next ➡️', callback_data: `users:page:${page + 1}` });
                const kb = nav.length ? [nav] : [];
                await send(chatId, text, kb.length ? { reply_markup: { inline_keyboard: kb } } : {});
                return;
            }

            // ---------- ticket:view:<id> ----------
            if (ns === 'ticket' && action === 'view') {
                const t = await SupportTicket.findOne({ ticketId: rest[0] });
                if (!t) return send(chatId, '❌ Ticket not found.');
                return sendTicketDetails(chatId, t);
            }

            // ---------- ticket:resolve:<id> ----------
            if (ns === 'ticket' && action === 'resolve') {
                const ticketId = rest[0];
                const ticket = await SupportTicket.findOne({ ticketId });
                if (!ticket) return send(chatId, '❌ Ticket not found.');
                if (ticket.status === 'resolved') return send(chatId, 'ℹ️ Already resolved.');

                await Notification.create({
                    username: normalizeUsername(ticket.username),
                    title: 'Ticket Resolved',
                    message: `Ticket ${ticket.ticketId} was resolved`,
                    type: 'support_resolved',
                    data: { ticketId: ticket.ticketId }
                });
                const sock = onlineUsers.get(normalizeUsername(ticket.username));
                if (sock) io.to(sock).emit('support-resolved', { ticketId: ticket.ticketId });
                ticket.status = 'resolved';
                ticket.updatedAt = Date.now();
                await ticket.save();
                return send(chatId, `✅ Ticket <code>${esc(ticket.ticketId)}</code> resolved.`);
            }

            // ---------- req:approve / req:reject ----------
            if (ns === 'req' && action === 'approve') return approveManualRequest(rest[0], chatId);
            if (ns === 'req' && action === 'reject')  return rejectManualRequest(rest[0], chatId);

            // ---------- r:confirmdelete:<name> ----------
            if (ns === 'r' && action === 'confirmdelete') {
                const roomName = rest.join(':');
                const r = await findRoomInsensitive(roomName);
                if (!r) return send(chatId, '❌ Room not found.');
                io.to(r.name).emit('room-deleted', { room: r.name });
                await Room.deleteOne({ _id: r._id });
                const rooms = await Room.find({}, 'name members boostLevel isVipRoom membersOnly');
                io.emit('room-list', rooms.map(x => ({
                    name: x.name,
                    members: x.members.length,
                    boostLevel: x.boostLevel,
                    isVipRoom: x.isVipRoom,
                    membersOnly: x.membersOnly
                })));
                return send(chatId, `🗑 Room <b>#${esc(roomName)}</b> deleted.`);
            }

            // ---------- u:addcoins:<username>:<amount> ----------
            if (ns === 'u' && action === 'addcoins') {
                const username = normalizeUsername(rest[0]);
                const amount = parseInt(rest[1], 10);
                const u = await User.findOne({ username });
                if (!u) return send(chatId, '❌ User not found.');
                u.coins += amount;
                await u.save();
                await CoinRequest.create({ username: u.username, type: 'Admin Gift (Telegram)', amount });
                const sock = onlineUsers.get(u.username);
                if (sock) io.to(sock).emit('coins-updated', u.coins);
                return send(chatId, `✅ <b>${esc(u.username)}</b> +${amount} coins → balance <b>${u.coins}</b>`);
            }

            // ---------- u:vip:<username>:<days> ----------
            if (ns === 'u' && action === 'vip') {
                const username = normalizeUsername(rest[0]);
                const days = parseInt(rest[1] || '30', 10);
                const u = await User.findOne({ username });
                if (!u) return send(chatId, '❌ User not found.');
                const base = (u.vipExpires && new Date(u.vipExpires) > new Date())
                    ? new Date(u.vipExpires).getTime() : Date.now();
                u.vipExpires = new Date(base + days * 24 * 60 * 60 * 1000);
                await u.save();
                return send(chatId, `💎 <b>${esc(u.username)}</b> VIP until ${u.vipExpires.toLocaleDateString()}`);
            }

            // ---------- u:unvip:<username> ----------
            if (ns === 'u' && action === 'unvip') {
                const username = normalizeUsername(rest[0]);
                const u = await User.findOne({ username });
                if (!u) return send(chatId, '❌ User not found.');
                u.vipExpires = null;
                await u.save();
                return send(chatId, `❌ VIP revoked for <b>${esc(u.username)}</b>`);
            }

            // ---------- u:notify:<username> ----------
            if (ns === 'u' && action === 'notify') {
                const username = normalizeUsername(rest[0]);
                return send(chatId, `📨 To send a message to <b>${esc(username)}</b>, use:\n<code>/notify ${esc(username)} your message here</code>`);
            }

            // ---------- u:confirmdelete:<username> ----------
            if (ns === 'u' && action === 'confirmdelete') {
                const username = normalizeUsername(rest[0]);
                const u = await User.findOne({ username });
                if (!u) return send(chatId, '❌ User not found.');
                await User.deleteOne({ username });
                return send(chatId, `🗑 User <b>${esc(username)}</b> deleted.`);
            }

            // ---------- u:delete:<username> ----------
            if (ns === 'u' && action === 'delete') {
                const username = normalizeUsername(rest[0]);
                return send(chatId, `⚠️ Confirm deletion of <b>${esc(username)}</b>:`, {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🗑 YES, delete', callback_data: `u:confirmdelete:${username}` },
                            { text: 'Cancel', callback_data: 'noop' }
                        ]]
                    }
                });
            }

        } catch (e) {
            console.error('Callback error:', e);
            bot.sendMessage(chatId, `❌ ${esc(e.message)}`).catch(() => {});
        }
    });

    // ============================================================
    //  HELPERS USED BY COMMANDS
    // ============================================================
    async function sendTicketDetails(chatId, t) {
        const text =
            `🎫 <b>Ticket <code>${esc(t.ticketId)}</code></b>\n` +
            `👤 ${esc(t.username)}\n` +
            `🔖 Status: <b>${esc(t.status)}</b>\n` +
            `📅 ${new Date(t.createdAt).toLocaleString()}\n` +
            `📝 <b>Subject:</b> ${esc(t.subject)}\n\n` +
            `<b>Message:</b>\n${esc(t.message)}\n` +
            (t.adminReply ? `\n<b>Admin reply:</b>\n${esc(t.adminReply)}` : '') +
            (t.screenshot ? `\n\n🖼 Screenshot: ${esc(t.screenshot)}` : '');

        const kb = [];
        if (t.status !== 'resolved') {
            kb.push([{ text: '✅ Mark resolved', callback_data: `ticket:resolve:${t.ticketId}` }]);
        }
        kb.push([{ text: '💬 Reply with /reply ' + t.ticketId + ' <msg>', callback_data: 'noop' }]);

        await send(chatId, text, { reply_markup: { inline_keyboard: kb } });
    }

    async function approveManualRequest(id, chatId) {
        const r = await ManualCoinRequest.findById(id);
        if (!r) return send(chatId, '❌ Request not found.');
        if (r.status !== 'pending') return send(chatId, `ℹ️ Already ${esc(r.status)}.`);

        const u = await User.findOne({ username: r.username });
        if (u) {
            u.coins += r.amount;
            await u.save();
            await CoinRequest.create({ username: u.username, type: 'Manual Coin Request', amount: r.amount });
            const sock = onlineUsers.get(u.username);
            if (sock) io.to(sock).emit('coins-updated', u.coins);
        }
        r.status = 'approved';
        await r.save();
        await send(chatId, `✅ Approved: <b>${esc(r.username)}</b> +${r.amount} coins.`);
    }

    async function rejectManualRequest(id, chatId) {
        const r = await ManualCoinRequest.findById(id);
        if (!r) return send(chatId, '❌ Request not found.');
        await ManualCoinRequest.deleteOne({ _id: id });
        await send(chatId, `❌ Rejected request from <b>${esc(r.username)}</b>.`);
    }

    // ============================================================
    //  ERROR HANDLERS  (silence transient errors)
    // ============================================================
    bot.on('polling_error', (err) => {
        const msg = err.message || '';
        // These are transient network glitches — the library auto-retries.
        // Silencing them avoids log spam.
        if (msg.includes('ECONNABORTED') ||
            msg.includes('ETIMEDOUT') ||
            msg.includes('ECONNRESET') ||
            msg.includes('socket hang up') ||
            msg.includes('EFATAL')) {
            return;
        }
        console.error('TG polling error:', msg);
    });

    bot.on('webhook_error', (err) => {
        const msg = err.message || '';
        if (msg.includes('ECONNABORTED') || msg.includes('ETIMEDOUT')) return;
        console.error('TG webhook error:', msg);
    });

    bot.on('error', (err) => {
        console.error('TG error:', err.message);
    });

    // Register the command list (works in both modes)
    bot.setMyCommands([
        { command: 'help',       description: 'Show all commands' },
        { command: 'stats',      description: 'Server stats' },
        { command: 'online',     description: 'Online users' },
        { command: 'users',      description: 'List users' },
        { command: 'user',       description: '/user <username> — details' },
        { command: 'givecoins',  description: '/givecoins <user> <amount>' },
        { command: 'rooms',      description: 'All rooms' },
        { command: 'tickets',    description: 'Support tickets' },
        { command: 'pending',    description: 'Pending coin requests' },
        { command: 'payouts',    description: 'Payouts' },
        { command: 'broadcast',  description: '/broadcast <msg>' },
        { command: 'notify',     description: '/notify <user> <msg>' }
    ]).catch(() => {});

    return bot;
}

module.exports = { startTelegramBot };

