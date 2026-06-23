// ==================== GLOBAL VARIABLES ====================
let socket, currentUser = null, currentRoom = null, currentPrivateChat = null, onlineUsers = [], allRooms = [];
let mediaRecorder, audioChunks = [], isRecording = false, recTarget = null, currentImageTarget = null;
let currentRoomOwner = null, currentRoomIsVip = false, youtubePlayerVisible = false, currentRoomModerators = [], currentRoomMembersOnly = false;
let peerConnection = null, localStream = null, callActive = false, pendingCallFrom = null, pendingOffer = null;
let notifications = [];
let soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
let audioCtx = null;
let ringtoneInterval = null;
let roomMessagesCache = {};
let typingTimeoutRoom = null;
let typingTimeoutPrivate = null;
let speakerEnabled = false;

// ==================== XIRSYS TURN CREDENTIALS ====================
async function getTurnCredentials() {
    try {
        const response = await fetch('/api/turn-credentials');
        const data = await response.json();
        if (data && data.iceServers) {
            return data.iceServers;
        }
        return null;
    } catch (error) {
        console.error('Failed to get TURN credentials:', error);
        return null;
    }
}

// ==================== LANGUAGE & RTL SUPPORT ====================
let currentLanguage = 'en';
let targetLanguage = localStorage.getItem('targetLanguage') || 'en';
let autoTranslateMessages = localStorage.getItem('autoTranslateMessages') !== 'false';

const translations = {
    en: {
        app_name: "Mokalmat Chat",
        rooms: "Rooms",
        friends: "Friends",
        gifts: "Gifts",
        login: "Login",
        register: "Register",
        username: "Username",
        password: "Password",
        send: "Send",
        join: "Join",
        create_room: "Create Room",
        room_name: "Room name",
        vip_room: "VIP Room (1500 coins)",
        cancel: "Cancel",
        create: "Create",
        search_room: "Search room...",
        search_users: "Search users...",
        search: "Search",
        friend_requests: "Friend Requests",
        friends_list: "Friends",
        send_gift: "Send Gift",
        gift_history: "Gift History",
        type_message: "Type a message...",
        clear_all: "Clear All",
        forgot_password: "Forgot Password?",
        reset_password: "Reset Password",
        get_question: "Get Question",
        new_password: "New Password",
        reset: "Reset",
        back: "Back",
        male: "Male",
        female: "Female",
        other: "Other",
        security_question: "Security Question",
        security_answer: "Answer",
        leave_room: "Leave Room",
        boost_room: "Boost Room",
        members: "members",
        boost: "Boost",
        online: "Online",
        offline: "Offline",
        room_settings: "Room Settings",
        ban_user: "Ban User",
        banned_list: "Banned Users",
        upload_image: "Upload Image",
        upload: "Upload",
        message: "Message",
        joined: "joined",
        left: "left",
        boosted: "boosted",
        total_boost: "Total boost",
        coins: "coins",
        new_message: "New Message",
        sent_gift: "sent you",
        gift_received: "Gift Received",
        friend_request: "Friend Request",
        from: "from",
        admin_gave: "Admin gave you",
        removed_you: "removed you from friends",
        kicked_from: "You were kicked from",
        incoming_call: "Incoming Call",
        is_calling: "is calling",
        call_rejected: "Call rejected",
        support_reply: "Support Reply",
        replied_ticket: "replied to ticket",
        new_reply_support: "New reply from support for ticket",
        ticket_resolved: "Ticket Resolved",
        your_ticket: "Your ticket",
        resolved: "has been resolved",
        new_support_ticket: "New Support Ticket",
        call_ended: "Call ended by other user",
        room_video_changed: "Room video changed by",
        someone: "someone",
        you_were_added_to: "You were added to room",
        you_were_removed_from: "You were removed from room",
        friend_request_sent_to: "Friend request sent to",
        accepted_friend_request: "accepted your friend request",
        successful: "successful",
        members_only: "Members Only",
        no_rooms: "No rooms. Create one!",
        translation: "Translation",
        target_language: "Target Language",
        auto_translate: "Auto-translate all messages",
        translation_note: "💡 Messages will be translated to your target language automatically.",
        notification_sounds: "Notification Sounds",
        enable_sounds: "Enable sound alerts",
        contact_support: "Contact Support",
        view_coin_history: "View Coin History",
        admin_panel: "Admin Panel",
        manage_users: "Manage Users",
        manage_rooms: "Manage Rooms",
        manage_gifts: "Manage Gifts",
        clear_friend_requests: "Clear Friend Requests",
        clear_coin_history: "Clear Coin History",
        boost_logs: "Boost Logs",
        pending_requests: "Pending Requests",
        support_tickets: "Support Tickets",
        give_coins: "Give Coins",
        send_coins: "Send Coins",
        reset_password_admin: "Reset Password",
        logout: "Logout",
        menu: "Menu",
        vip_status: "VIP Status",
        buy_vip: "Buy VIP",
        buy_coins: "Buy Coins",
        card: "Card",
        crypto: "Crypto",
        request_coins: "Request Coins (Manual)",
        members_panel: "Members Panel",
        ban_kick: "Ban / Kick User",
        banned_list: "Banned Users List",
        leave_room: "Leave Room",
        room_settings: "Room Settings",
        add_member: "Add Member",
        member_list: "Member List",
        banned_users: "Banned Users",
        ban_kick_user: "Ban / Kick User",
        enter_username_ban: "Enter username to kick/ban from this room:",
        kick_ban: "Kick & Ban",
        mute: "Mute",
        video: "Video",
        end_call: "End Call",
        basic_boost: "Basic",
        silver_boost: "Silver",
        gold_boost: "Gold",
        create_room_title: "Create Room (1500 coins)",
        vip_room_check: "VIP Room (gold theme + YouTube)",
        send_gift_title: "Send Gift",
        request_coins_title: "Request Coins",
        gift_card: "Gift Card",
        gift_card_number: "Gift Card Number",
        send_usdt: "Send USDT (TRC20) to:",
        transaction_id: "Transaction ID",
        submit: "Submit",
        send_image: "Send Image",
        coin_history: "Coin History",
        reply_to_ticket: "Reply to Ticket",
        user_message: "User message:",
        your_reply: "Your reply:",
        send_reply: "Send Reply",
        ticket_id: "Ticket ID:",
        admin_reply: "Admin Reply:",
        close: "Close",
        ticket_reply: "Ticket Reply",
        describe_issue: "Describe your issue...",
        subject: "Subject",
        notifications: "Notifications",
        kick: "Kick",
        unban: "Unban",
        remove: "Remove",
        chat: "Chat",
        add_friend: "Add Friend",
        accept: "Accept",
        no_friends: "No friends yet. Search and add!",
        approve: "Approve",
        reject: "Reject",
        delete: "Delete",
        remove_mod: "Remove Mod",
        make_mod: "Make Mod",
        reply: "Reply",
        resolve: "Resolve",
        call: "Call"
    },
    ar: {
        app_name: "موكلمات شات",
        rooms: "الغرف",
        friends: "الأصدقاء",
        gifts: "الهدايا",
        login: "تسجيل الدخول",
        register: "التسجيل",
        username: "اسم المستخدم",
        password: "كلمة المرور",
        send: "إرسال",
        join: "انضمام",
        create_room: "إنشاء غرفة",
        room_name: "اسم الغرفة",
        vip_room: "غرفة VIP (1500 عملة)",
        cancel: "إلغاء",
        create: "إنشاء",
        search_room: "ابحث عن غرفة...",
        search_users: "ابحث عن مستخدمين...",
        search: "بحث",
        friend_requests: "طلبات الصداقة",
        friends_list: "الأصدقاء",
        send_gift: "إرسال هدية",
        gift_history: "سجل الهدايا",
        type_message: "اكتب رسالة...",
        clear_all: "مسح الكل",
        forgot_password: "نسيت كلمة المرور؟",
        reset_password: "إعادة تعيين كلمة المرور",
        get_question: "الحصول على السؤال",
        new_password: "كلمة المرور الجديدة",
        reset: "إعادة تعيين",
        back: "رجوع",
        male: "ذكر",
        female: "أنثى",
        other: "أخرى",
        security_question: "سؤال الأمان",
        security_answer: "الإجابة",
        leave_room: "مغادرة الغرفة",
        boost_room: "تعزيز الغرفة",
        members: "الأعضاء",
        boost: "تعزيز",
        online: "متصل",
        offline: "غير متصل",
        room_settings: "إعدادات الغرفة",
        ban_user: "طرد مستخدم",
        banned_list: "المطرودون",
        upload_image: "رفع صورة",
        upload: "رفع",
        message: "رسالة",
        joined: "انضم",
        left: "غادر",
        boosted: "عزز بمبلغ",
        total_boost: "إجمالي التعزيز",
        coins: "عملة",
        new_message: "رسالة جديدة",
        sent_gift: "أرسل إليك",
        gift_received: "هدية مستلمة",
        friend_request: "طلب صداقة",
        from: "من",
        admin_gave: "المدير أعطاك",
        removed_you: "أزالك من الأصدقاء",
        kicked_from: "تم طردك من",
        incoming_call: "مكالمة واردة",
        is_calling: "يتصل بك",
        call_rejected: "تم رفض المكالمة",
        support_reply: "رد الدعم",
        replied_ticket: "رد على التذكرة",
        new_reply_support: "رد جديد من الدعم للتذكرة",
        ticket_resolved: "تم حل التذكرة",
        your_ticket: "تذكرتك",
        resolved: "تم حلها",
        new_support_ticket: "تذكرة دعم جديدة",
        call_ended: "أنهى الطرف الآخر المكالمة",
        room_video_changed: "تم تغيير الفيديو بواسطة",
        someone: "شخص ما",
        you_were_added_to: "تمت إضافتك إلى غرفة",
        you_were_removed_from: "تمت إزالتك من غرفة",
        friend_request_sent_to: "تم إرسال طلب صداقة إلى",
        accepted_friend_request: "قبل طلب صداقتك",
        successful: "ناجح",
        members_only: "الأعضاء فقط",
        no_rooms: "لا توجد غرف. أنشئ واحدة!",
        translation: "الترجمة",
        target_language: "اللغة المستهدفة",
        auto_translate: "ترجمة جميع الرسائل تلقائياً",
        translation_note: "سيتم ترجمة الرسائل إلى لغتك المستهدفة تلقائياً.",
        notification_sounds: "أصوات الإشعارات",
        enable_sounds: "تفعيل أصوات التنبيه",
        contact_support: "اتصل بالدعم",
        view_coin_history: "عرض سجل العملات",
        admin_panel: "لوحة التحكم",
        manage_users: "إدارة المستخدمين",
        manage_rooms: "إدارة الغرف",
        manage_gifts: "إدارة الهدايا",
        clear_friend_requests: "مسح طلبات الصداقة",
        clear_coin_history: "مسح سجل العملات",
        boost_logs: "سجل التعزيزات",
        pending_requests: "الطلبات المعلقة",
        support_tickets: "تذاكر الدعم",
        give_coins: "منح عملات",
        send_coins: "إرسال عملات",
        reset_password_admin: "إعادة تعيين كلمة المرور",
        logout: "تسجيل الخروج",
        menu: "القائمة",
        vip_status: "حالة VIP",
        buy_vip: "شراء VIP",
        buy_coins: "شراء عملات",
        card: "بطاقة",
        crypto: "عملة رقمية",
        request_coins: "طلب عملات (يدوي)",
        members_panel: "لوحة الأعضاء",
        ban_kick: "طرد / منع مستخدم",
        banned_list: "قائمة المطرودين",
        leave_room: "مغادرة الغرفة",
        room_settings: "إعدادات الغرفة",
        add_member: "إضافة عضو",
        member_list: "قائمة الأعضاء",
        banned_users: "المستخدمون المطرودون",
        ban_kick_user: "طرد / منع مستخدم",
        enter_username_ban: "أدخل اسم المستخدم لطرده / منعه من هذه الغرفة:",
        kick_ban: "طرد ومنع",
        mute: "كتم",
        video: "فيديو",
        end_call: "إنهاء المكالمة",
        basic_boost: "أساسي",
        silver_boost: "فضي",
        gold_boost: "ذهبي",
        create_room_title: "إنشاء غرفة (1500 عملة)",
        vip_room_check: "غرفة VIP (ثيم ذهبي + يوتيوب)",
        send_gift_title: "إرسال هدية",
        request_coins_title: "طلب عملات",
        gift_card: "بطاقة هدايا",
        gift_card_number: "رقم بطاقة الهدايا",
        send_usdt: "أرسل USDT (TRC20) إلى:",
        transaction_id: "رقم المعاملة",
        submit: "إرسال",
        send_image: "إرسال صورة",
        coin_history: "سجل العملات",
        reply_to_ticket: "رد على التذكرة",
        user_message: "رسالة المستخدم:",
        your_reply: "ردك:",
        send_reply: "إرسال الرد",
        ticket_id: "رقم التذكرة:",
        admin_reply: "رد المدير:",
        close: "إغلاق",
        ticket_reply: "رد التذكرة",
        describe_issue: "صف مشكلتك...",
        subject: "الموضوع",
        notifications: "الإشعارات",
        kick: "طرد",
        unban: "إلغاء الحظر",
        remove: "إزالة",
        chat: "محادثة",
        add_friend: "إضافة صديق",
        accept: "قبول",
        no_friends: "لا يوجد أصدقاء بعد. ابحث وأضف!",
        approve: "موافقة",
        reject: "رفض",
        delete: "حذف",
        remove_mod: "إزالة مشرف",
        make_mod: "تعيين مشرف",
        reply: "رد",
        resolve: "حل",
        call: "اتصال"
    }
};

function t(key) { return translations[currentLanguage]?.[key] || key; }

function applyLanguage() {
    const isRTL = currentLanguage === 'ar';
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    document.documentElement.lang = currentLanguage;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = translations[currentLanguage]?.[key];
        if (translation) {
            if (el.tagName === 'INPUT' && el.placeholder !== undefined) {
                el.placeholder = translation;
            } else if (el.tagName === 'OPTION') {
                el.textContent = translation;
            } else {
                const original = el.innerText;
                const emojiMatch = original.match(/^[\u{1F000}-\u{1FFFF}]|[\u2600-\u27BF]|[\u{1F300}-\u{1F5FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]/u);
                if (emojiMatch) {
                    el.innerText = emojiMatch[0] + ' ' + translation;
                } else {
                    el.innerText = translation;
                }
            }
        }
    });
    updateDynamicContent();
}

function setLanguage(lang) {
    if (translations[lang]) {
        currentLanguage = lang;
        applyLanguage();
        localStorage.setItem('app_language', lang);
        if (currentUser) {
            if (document.getElementById('roomsView').style.display !== 'none') showRooms();
            else if (document.getElementById('friendsView').classList.contains('active')) loadFriends();
            else if (document.getElementById('giftsView').classList.contains('active')) loadGiftHistory();
            if (currentRoom) loadRoomMembers();
            updateVIPButtonText();
        }
    }
}

function updateDynamicContent() {
    const vipDisplay = document.getElementById('vipStatusDisplay');
    if (vipDisplay) {
        const currentText = vipDisplay.innerText;
        if (currentText.includes('Active until')) {
            const dateMatch = currentText.match(/Active until (.+)/);
            if (dateMatch) {
                vipDisplay.innerText = `💎 ${t('vip_status')}: ${dateMatch[1]}`;
            }
        } else if (currentText.includes('Not active')) {
            vipDisplay.innerText = `❌ ${t('vip_status')}: Not active`;
        }
    }
    updateVIPButtonText();
}

function updateVIPButtonText() {
    const buyBtn = document.querySelector('.buy-vip-btn');
    if (buyBtn) {
        const isVIP = currentUser && currentUser.isVIP === true;
        if (isVIP) {
            buyBtn.style.display = 'none';
        } else {
            buyBtn.style.display = 'block';
            buyBtn.innerHTML = `💎 ${t('buy_vip')} (5000 ${t('coins')})`;
        }
    }
}

// ==================== TRANSLATION HELPERS ====================
async function translateText(text, targetLang) {
    if (!text || targetLang === 'en' || !autoTranslateMessages) return text;
    if (text.length < 2) return text;
    try {
        const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`);
        const data = await response.json();
        if (data && data[0] && data[0][0] && data[0][0][0]) {
            return data[0][0][0];
        }
        return text;
    } catch (err) {
        console.error('Translation error:', err);
        return text;
    }
}

function detectLanguage() {
    const browserLang = navigator.language.split('-')[0];
    currentLanguage = translations[browserLang] ? browserLang : 'en';
    return currentLanguage;
}

// ==================== NOTIFICATIONS & SOUND ====================
function playNotificationSound() {
    if (!soundEnabled) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 880;
        gain.gain.value = 0.2;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
        osc.stop(audioCtx.currentTime + 0.5);
        if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch(e) {}
}

function startRingtone() {
    if (!soundEnabled) return;
    stopRingtone();
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtx.resume();
        const playBeep = (freq, duration) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            gain.gain.value = 0.3;
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
            osc.stop(audioCtx.currentTime + duration);
        };
        ringtoneInterval = setInterval(() => {
            if (soundEnabled) playBeep(880, 0.4);
        }, 800);
    } catch(e) { console.log('Ringtone error', e); }
}

function stopRingtone() {
    if (ringtoneInterval) { clearInterval(ringtoneInterval); ringtoneInterval = null; }
}

function addNotification(title, message, onClickData) {
    notifications.unshift({ title, message, time: new Date().toLocaleTimeString(), onClickData });
    if (notifications.length > 30) notifications.pop();
    updateNotificationUI();
    const badge = document.getElementById('notificationBadge');
    if (badge) { badge.style.display = 'flex'; badge.innerText = notifications.length; }
    if (title === 'New Message' || title === 'Friend Request' || title === 'Gift Received' || title === 'Support Reply' || title === 'Ticket Resolved')
        showToast(`${title}: ${message}`);
}
function togglePasswordVisibility(inputId, toggleElement) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        toggleElement.textContent = '🙈'; // or '🔒'
    } else {
        input.type = 'password';
        toggleElement.textContent = '👁️';
    }
}

function clearAllNotifications() { notifications = []; updateNotificationUI(); document.getElementById('notificationBadge').style.display = 'none'; }

function updateNotificationUI() {
    const container = document.getElementById('notificationsList');
    if (!container) return;
    if (!notifications.length) container.innerHTML = '<div style="padding:15px;text-align:center;color:#999;">No notifications</div>';
    else container.innerHTML = notifications.map((n, idx) => `<div class="notification-item" onclick="handleNotificationClick(${idx})"><strong>${escapeHtml(n.title)}</strong><br>${escapeHtml(n.message)}<br><div class="time">${n.time}</div></div>`).join('');
}

function handleNotificationClick(idx) {
    const n = notifications[idx];
    if (!n) return;
    if (n?.onClickData?.type === 'private_message' && currentPrivateChat !== n.onClickData.from) showPrivateChat(n.onClickData.from);
    else if (n?.onClickData?.type === 'support_ticket') {
        openViewTicketModal(n.onClickData.ticketId, n.onClickData.reply);
    }
    toggleNotifications();
}

function toggleNotifications() { document.getElementById('notificationDropdown').classList.toggle('active'); }

// ==================== HELPER FUNCTIONS ====================
function normalizeUsername(u) { return (u || '').toLowerCase(); }
function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;'); }
function showToast(msg) { const t = document.createElement('div'); t.className = 'toast-notification'; t.innerText = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3000); }

function updateVipBadge() {
    const badge = document.getElementById('headerVipBadge');
    if (badge) badge.style.display = (currentUser && currentUser.isVIP === true) ? 'inline-block' : 'none';
}

function showGiftTicker(sender, receiver, amount) {
    const container = document.getElementById('giftTicker');
    const text = document.getElementById('tickerText');
    text.textContent = `🎁 ${sender} sent ${amount} coins to ${receiver} 🎁`;
    const track = document.getElementById('tickerTrack');
    track.style.animation = 'none';
    track.offsetHeight;
    track.style.animation = 'ticker-scroll 8s linear forwards';
    container.classList.add('active');
    const onEnd = () => {
        container.classList.remove('active');
        track.removeEventListener('animationend', onEnd);
    };
    track.addEventListener('animationend', onEnd);
}

function saveSessionState() {
    if (currentRoom) localStorage.setItem('lastRoom', currentRoom); else localStorage.removeItem('lastRoom');
    if (currentPrivateChat) localStorage.setItem('lastPrivateChat', currentPrivateChat); else localStorage.removeItem('lastPrivateChat');
    const activeView = document.querySelector('.nav-item.active')?.innerText.toLowerCase() || 'rooms';
    localStorage.setItem('lastView', activeView);
}

async function restoreSession() {
    const lastRoom = localStorage.getItem('lastRoom');
    const lastPrivate = localStorage.getItem('lastPrivateChat');
    if (socket && !socket.connected) await new Promise(resolve => socket.once('connect', resolve));
    if (lastRoom && socket && socket.connected) setTimeout(() => socket.emit('join-room', lastRoom), 500);
    else if (lastPrivate && socket && socket.connected) showPrivateChat(lastPrivate);
}

async function refreshUserData() {
    if (!currentUser || !currentUser.username) return;
    try {
        const res = await fetch(`/api/user-profile?username=${currentUser.username}`);
        const data = await res.json();
        if (data.success) {
            currentUser.profile_pic = data.profile_pic;
            currentUser.coins = data.coins;
            currentUser.isAdmin = data.isAdmin;
            currentUser.isVIP = data.isVIP;
            document.getElementById('coinBalance').innerHTML = `💰 ${currentUser.coins}`;
            updateProfilePic();
            updateVipBadge();
            console.log('User data refreshed');
        }
    } catch (err) { console.error('Refresh user data error', err); }
}

async function checkAndUpdateVIPStatus() {
    if (!currentUser) return false;
    try {
        const res = await fetch(`/api/get-vip-status?username=${currentUser.username}`);
        const data = await res.json();
        const isActive = data.success === true;
        if (currentUser) currentUser.isVIP = isActive;
        updateVipBadge();
        await checkVIPStatus();
        return isActive;
    } catch (err) {
        console.error('VIP status check error:', err);
        return false;
    }
}

function canCreateVipRoom() { return currentUser && currentUser.isVIP === true; }

function showCreateRoomModal() {
    const vipOpt = document.getElementById('vipRoomOption');
    if (!vipOpt) return;
    if (canCreateVipRoom()) {
        vipOpt.style.display = 'block';
    } else {
        vipOpt.style.display = 'none';
        document.getElementById('isVipRoom').checked = false;
    }
    document.getElementById('createRoomModal').classList.add('active');
}

function createRoom() {
    const name = document.getElementById('newRoomName').value.trim();
    const isVip = document.getElementById('isVipRoom').checked;
    if (!name) return alert('Enter room name');
    if (isVip && !canCreateVipRoom()) return alert('Only VIP users can create VIP rooms!');
    socket.emit('create-room', { roomName: name, createdBy: currentUser.username, isVipRoom: isVip });
}

function closeCreateRoomModal() { document.getElementById('createRoomModal').classList.remove('active'); }

// ==================== AUTHENTICATION ====================
async function login() {
    const username = document.getElementById('loginUsername').value, password = document.getElementById('loginPassword').value;
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (data.success) {
        currentUser = data.user;
        if (data.token) localStorage.setItem('chat_token', data.token);
        document.getElementById('currentUsername').innerHTML = currentUser.username;
        document.getElementById('coinBalance').innerHTML = `💰 ${currentUser.coins}`;
        updateProfilePic();
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainContainer').style.display = 'flex';
        initSocket();
        await refreshUserData();
        await checkAndUpdateVIPStatus();
        loadFriends(); loadFriendRequests(); loadGiftHistory();
        if (currentUser.isAdmin) {
            document.getElementById('adminSection').style.display = 'block';
            const adminDiv = document.querySelector('#adminSection .admin-grid');
            if (adminDiv && !adminDiv.classList.contains('admin-grid')) adminDiv.classList.add('admin-grid');
        }
        showRooms();
        requestMicrophonePermission();
        restoreSession();
    } else alert('Login failed');
}

async function register() {
    const username = document.getElementById('regUsername').value, password = document.getElementById('regPassword').value, gender = document.getElementById('regGender').value;
    const securityQuestion = document.getElementById('regSecurityQuestion').value, securityAnswer = document.getElementById('regSecurityAnswer').value;
    if (!username || !password || !securityQuestion || !securityAnswer) return alert('All fields required');
    const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, gender, securityQuestion, securityAnswer }) });
    const data = await res.json();
    if (data.success) { alert('Registered! Please login.'); showLogin(); } else alert('Registration failed: ' + data.error);
}

function showLogin() { document.getElementById('registerScreen').style.display = 'none'; document.getElementById('forgotScreen').style.display = 'none'; document.getElementById('loginScreen').style.display = 'flex'; }
function showRegister() { document.getElementById('loginScreen').style.display = 'none'; document.getElementById('registerScreen').style.display = 'flex'; }
function showForgotPassword() { document.getElementById('loginScreen').style.display = 'none'; document.getElementById('forgotScreen').style.display = 'flex'; }

async function getSecurityQuestion() {
    const username = document.getElementById('resetUsername').value.trim();
    if (!username) return alert('Enter username');
    const statusDiv = document.getElementById('resetStatus');
    statusDiv.innerHTML = '⏳ Checking...';
    try {
        const res = await fetch('/api/get-security-question', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await res.text();
            if (text.includes('<!DOCTYPE html>')) {
                throw new Error('Server returned HTML – is the server running?');
            } else {
                throw new Error('Unexpected response from server');
            }
        }
        const data = await res.json();
        if (data.success) {
            document.getElementById('questionText').innerText = data.question;
            document.getElementById('securityQuestionDiv').style.display = 'block';
            statusDiv.innerHTML = '';
        } else {
            statusDiv.innerHTML = '❌ ' + (data.error || 'User not found or no security question set.');
        }
    } catch (err) {
        statusDiv.innerHTML = '❌ ' + err.message;
        console.error(err);
    }
}

async function resetPassword() {
    const username = document.getElementById('resetUsername').value.trim();
    const answer = document.getElementById('resetAnswer').value.trim();
    const newPassword = document.getElementById('newPassword').value.trim();
    if (!username || !answer || !newPassword) return alert('Please fill all fields.');
    const statusDiv = document.getElementById('resetStatus');
    statusDiv.innerHTML = '⏳ Resetting...';
    try {
        const res = await fetch('/api/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, answer, newPassword })
        });
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await res.text();
            if (text.includes('<!DOCTYPE html>')) {
                throw new Error('Server returned HTML – is the server running?');
            } else {
                throw new Error('Unexpected response from server');
            }
        }
        const data = await res.json();
        if (data.success) {
            statusDiv.innerHTML = '✅ Password reset! You can now login.';
            setTimeout(() => showLogin(), 2000);
        } else {
            statusDiv.innerHTML = '❌ ' + (data.error || 'Reset failed – incorrect answer or user not found.');
        }
    } catch (err) {
        statusDiv.innerHTML = '❌ ' + err.message;
        console.error(err);
    }
}

function updateProfilePic() {
    const pic = document.getElementById('profilePic');
    if (!pic) return;
    if (currentUser && currentUser.profile_pic) {
        const val = currentUser.profile_pic;
        if (typeof val === 'string' && val.startsWith('data:image')) {
            pic.innerHTML = `<img src="${val}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else if (typeof val === 'string' && val.startsWith('/uploads')) {
            pic.innerHTML = `<img src="${val}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none';this.parentElement.innerHTML='👤';">`;
        } else {
            pic.innerHTML = val || '👤';
        }
    } else {
        pic.innerHTML = '👤';
    }
}

async function uploadProfilePic() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const base64Data = ev.target.result;
            try {
                const res = await fetch('/api/upload-profile-pic-base64', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser.username, profilePicBase64: base64Data })
                });
                const data = await res.json();
                if (data.success) {
                    currentUser.profile_pic = data.profilePic;
                    updateProfilePic();
                    await refreshUserData();
                    showToast('Profile picture updated!');
                } else {
                    alert('Upload failed: ' + (data.error || 'Unknown error'));
                }
            } catch (err) {
                alert('Upload error: ' + err.message);
            }
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

// ==================== VIEWS ====================
function showRooms() { 
    closeRoomMenu(); 
    document.getElementById('roomsView').style.display = 'flex'; 
    document.getElementById('friendsView').classList.remove('active'); 
    document.getElementById('giftsView').classList.remove('active'); 
    document.querySelectorAll('.chat-view').forEach(v => v.classList.remove('active')); 
    document.getElementById('mainHeader').classList.remove('hidden'); 
    document.getElementById('bottomNav').classList.remove('hidden'); 
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); 
    document.querySelectorAll('.nav-item')[0].classList.add('active'); 
    socket.emit('get-room-list'); 
    const roomsList = document.getElementById('roomsList');
    if (roomsList) roomsList.scrollTop = 0;
    saveSessionState(); 
}
function showFriends() { 
    closeRoomMenu(); 
    document.getElementById('roomsView').style.display = 'none'; 
    document.getElementById('friendsView').classList.add('active'); 
    document.getElementById('giftsView').classList.remove('active'); 
    document.querySelectorAll('.chat-view').forEach(v => v.classList.remove('active')); 
    document.getElementById('mainHeader').classList.remove('hidden'); 
    document.getElementById('bottomNav').classList.remove('hidden'); 
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); 
    document.querySelectorAll('.nav-item')[1].classList.add('active'); 
    loadFriends(); 
    loadFriendRequests();
    const friendsList = document.getElementById('friendsList');
    if (friendsList) friendsList.scrollTop = 0;
    saveSessionState(); 
}
function showGifts() { 
    closeRoomMenu(); 
    document.getElementById('roomsView').style.display = 'none'; 
    document.getElementById('friendsView').classList.remove('active'); 
    document.getElementById('giftsView').classList.add('active'); 
    document.querySelectorAll('.chat-view').forEach(v => v.classList.remove('active')); 
    document.getElementById('mainHeader').classList.remove('hidden'); 
    document.getElementById('bottomNav').classList.remove('hidden'); 
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); 
    document.querySelectorAll('.nav-item')[2].classList.add('active'); 
    loadGiftHistory(); 
    const giftList = document.getElementById('giftHistoryList');
    if (giftList) giftList.scrollTop = 0;
    saveSessionState(); 
}
function showRoomChat() { document.getElementById('roomsView').style.display = 'none'; document.getElementById('friendsView').classList.remove('active'); document.getElementById('giftsView').classList.remove('active'); document.getElementById('roomChatView').classList.add('active'); document.getElementById('mainHeader').classList.add('hidden'); document.getElementById('bottomNav').classList.add('hidden'); saveSessionState(); }
function showPrivateChat(username) { 
    currentPrivateChat = username; 
    document.getElementById('privateChatName').innerHTML = username; 
    updatePrivateStatus(); 
    document.getElementById('privateMessages').innerHTML = ''; 
    document.getElementById('roomsView').style.display = 'none'; 
    document.getElementById('friendsView').classList.remove('active'); 
    document.getElementById('giftsView').classList.remove('active'); 
    document.getElementById('roomChatView').classList.remove('active'); 
    document.getElementById('privateChatView').classList.add('active'); 
    document.getElementById('mainHeader').classList.add('hidden'); 
    document.getElementById('bottomNav').classList.add('hidden'); 
    saveSessionState();
    updatePrivateStatus();
}

function closePrivateChat() { if (callActive) endCall(); currentPrivateChat = null; showFriends(); saveSessionState(); }
function leaveRoom() { closeRoomMenu(); if (currentRoom) { socket.emit('leave-room'); currentRoom = null; } showRooms(); saveSessionState(); }

// ==================== UPDATED PRIVATE STATUS ====================
function updatePrivateStatus() {
    if (!currentPrivateChat) return;
    const norm = normalizeUsername(currentPrivateChat);
    const isOnline = onlineUsers.some(u => normalizeUsername(u) === norm);
    const statusEl = document.getElementById('privateChatStatus');
    if (isOnline) {
        statusEl.innerHTML = t('online');
        statusEl.style.color = '#10b981';
    } else {
        statusEl.innerHTML = t('offline');
        statusEl.style.color = '#6b7280';
    }
    const callBtn = document.querySelector('#privateChatView .call-icon');
    if (callBtn) {
        callBtn.disabled = !isOnline;
        callBtn.style.opacity = isOnline ? '1' : '0.5';
        callBtn.title = isOnline ? t('call') : t('offline');
    }
}

setInterval(() => {
    if (currentPrivateChat) updatePrivateStatus();
}, 5000);

function displayRooms(rooms) {
    const container = document.getElementById('roomsList');
    if (!rooms.length) { container.innerHTML = `<div style="text-align:center;padding:40px;">${t('no_rooms')}</div>`; return; }
    const sorted = [...rooms].sort((a,b) => b.boostLevel - a.boostLevel);
    container.innerHTML = '';
    sorted.forEach(room => {
        const isTop = sorted[0].boostLevel === room.boostLevel && room.boostLevel > 0;
        const vipTag = room.isVipRoom ? ' 💎' : '';
        const membersOnlyTag = room.membersOnly ? ` <span class="members-only-badge">🔒 ${t('members_only')}</span>` : '';
        const nameClass = room.isVipRoom ? 'vip-room-name' : '';
        container.innerHTML += `<div class="room-card ${isTop ? 'boosted' : ''}"><div class="room-card-info"><h4 class="${nameClass}">#${escapeHtml(room.name)}${vipTag}${membersOnlyTag} ${room.boostLevel > 0 ? '🚀' : ''}</h4><p>👥 ${room.members} ${t('members')} | 🚀 ${t('boost')}: ${room.boostLevel}</p></div><button class="join-btn" onclick="joinRoom('${escapeHtml(room.name)}')">${t('join')}</button></div>`;
    });
}
function filterRooms() { const q = document.getElementById('roomSearch').value.toLowerCase(); displayRooms(allRooms.filter(r => r.name.toLowerCase().includes(q))); }
function joinRoom(name) { socket.emit('join-room', name); saveSessionState(); }

function sendRoomMessage() { const msg = document.getElementById('roomMessageInput').value.trim(); if (msg && currentRoom) { socket.emit('room-message', { username: currentUser.username, message: escapeHtml(msg), room: currentRoom, type: 'text' }); document.getElementById('roomMessageInput').value = ''; } }

// ==================== MESSAGE FUNCTIONS WITH TRANSLATION ====================
async function translateAndDisplayMessage(msg, containerId, isSentByMe) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const div = document.createElement('div');
    div.className = `message-wrapper ${isSentByMe ? 'sent' : 'received'}`;
    let content = '';
    const safeMsg = escapeHtml(msg.message);
    if (msg.type === 'image') {
        content = `<img src="${safeMsg}" class="message-img" onclick="openLightbox('${safeMsg}')">`;
    } else if (msg.type === 'audio') {
        content = `<audio controls src="${safeMsg}" class="message-audio" preload="metadata"></audio>`;
    } else {
        let translated = msg.message;
        if (autoTranslateMessages && targetLanguage !== 'en') {
            try {
                const translatedText = await translateText(msg.message, targetLanguage);
                if (translatedText && translatedText !== msg.message) {
                    translated = translatedText;
                    content = `${escapeHtml(translated)}<br><span style="font-size:10px;opacity:0.6;">🔁 ${escapeHtml(msg.message)}</span>`;
                } else {
                    content = escapeHtml(msg.message);
                }
            } catch (err) {
                content = escapeHtml(msg.message);
            }
        } else {
            content = escapeHtml(msg.message);
        }
        content = content.replace(/\n/g, '<br>');
    }
    let avatarHtml = '👤';
    if (msg.profilePic) {
        if (typeof msg.profilePic === 'string' && msg.profilePic.startsWith('data:image')) {
            avatarHtml = `<img src="${msg.profilePic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else if (typeof msg.profilePic === 'string' && msg.profilePic.startsWith('/uploads')) {
            avatarHtml = `<img src="${msg.profilePic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none';this.parentElement.innerHTML='👤';">`;
        } else {
            avatarHtml = msg.profilePic;
        }
    }
    const displayName = escapeHtml(msg.from || msg.username);
    const username = msg.username || msg.from;
    const isOwner = username === currentRoomOwner;
    const isMod = currentRoomModerators && currentRoomModerators.includes(username);
    let senderClass = '';
    if (isOwner) senderClass = 'owner';
    else if (isMod) senderClass = 'moderator';
    div.innerHTML = `<div class="message-avatar" onclick="showUserProfile('${escapeHtml(username)}')">${avatarHtml}</div>
        <div class="message-bubble">
            <div class="message-sender ${senderClass}">${displayName}${msg.isVIP ? '<span class="vip-diamond">💎</span>' : ''}${isOwner ? ' 👑' : ''}${isMod ? ' <span class="moderator-badge">MOD</span>' : ''}</div>
            <div class="message-text">${content}</div>
            <div class="message-time">${escapeHtml(msg.timestamp)}</div>
        </div>`;
    container.appendChild(div);
    div.scrollIntoView({ behavior: 'smooth' });
}
function addRoomMessage(msg) { translateAndDisplayMessage(msg, 'roomMessages', msg.username === currentUser.username); }

function sendPrivateMessage() { if (!currentPrivateChat) return; const msg = document.getElementById('privateMessageInput').value.trim(); if (msg) { socket.emit('private-message', { from: currentUser.username, to: currentPrivateChat, message: escapeHtml(msg) }); document.getElementById('privateMessageInput').value = ''; } }
function addPrivateMessage(msg) { translateAndDisplayMessage(msg, 'privateMessages', msg.from === currentUser.username); }

function openLightbox(src) { document.getElementById('lightboxImg').src = src; document.getElementById('imageLightbox').classList.add('active'); }
function closeLightbox() { document.getElementById('imageLightbox').classList.remove('active'); }

// ==================== VOICE RECORDING ====================
async function startRecording(target) {
    if (isRecording) stopRecording();
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' }), fd = new FormData();
            fd.append('audio', blob, 'recording.webm');
            const res = await fetch('/api/upload-voice', { method: 'POST', body: fd });
            const data = await res.json();
            if (data.url) {
                if (target === 'room' && currentRoom) socket.emit('room-message', { username: currentUser.username, message: data.url, room: currentRoom, type: 'audio' });
                else if (target === 'private' && currentPrivateChat) socket.emit('private-message', { from: currentUser.username, to: currentPrivateChat, message: data.url, type: 'audio' });
            }
            stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        isRecording = true; recTarget = target;
        const btn = target === 'room' ? document.getElementById('roomVoiceBtn') : document.getElementById('privateVoiceBtn');
        if (btn) btn.classList.add('recording');
    } catch(e) { alert('Microphone access needed'); }
}
function stopRecording() {
    if (mediaRecorder && isRecording) { mediaRecorder.stop(); isRecording = false; const btn = recTarget === 'room' ? document.getElementById('roomVoiceBtn') : document.getElementById('privateVoiceBtn'); if (btn) btn.classList.remove('recording'); }
}
function toggleRoomRecording() { if (isRecording && recTarget === 'room') stopRecording(); else startRecording('room'); }
function togglePrivateRecording() { if (isRecording && recTarget === 'private') stopRecording(); else startRecording('private'); }

// ==================== IMAGE SHARING ====================
function sendRoomImage() { currentImageTarget = 'room'; document.getElementById('imageModal').classList.add('active'); }
function sendPrivateImage() { currentImageTarget = 'private'; document.getElementById('imageModal').classList.add('active'); }
function closeImageModal() { document.getElementById('imageModal').classList.remove('active'); }
async function uploadImage() {
    const file = document.getElementById('imageFile').files[0]; if (!file) return;
    const fd = new FormData(); fd.append('roomImage', file);
    const res = await fetch('/api/upload-room-image', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
        if (currentImageTarget === 'room' && currentRoom) socket.emit('room-message', { username: currentUser.username, message: data.imageUrl, room: currentRoom, type: 'image' });
        else if (currentImageTarget === 'private' && currentPrivateChat) socket.emit('private-message', { from: currentUser.username, to: currentPrivateChat, message: data.imageUrl, type: 'image' });
        closeImageModal(); document.getElementById('imageFile').value = '';
    }
}

// ==================== GIFTS & COINS ====================
async function sendGift() {
    const to = document.getElementById('giftToUser').value.trim(), amount = parseInt(document.getElementById('giftAmountSelect').value), message = document.getElementById('giftMessage').value.trim();
    if (!to || !amount) return alert('Enter recipient and amount');
    const res = await fetch('/api/send-gift', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: currentUser.username, to, amount, message }) });
    const data = await res.json();
    if (data.success) { alert(`Gift sent!`); updateCoins(); loadGiftHistory(); closeSendGiftModal(); addNotification(t('gift_received'), `You sent ${amount} coins to ${to}`); showGiftTicker(currentUser.username, to, amount); }
    else alert(data.error);
}
async function loadGiftHistory() {
    const res = await fetch('/api/get-gifts');
    const gifts = await res.json();
    const myGifts = gifts.filter(g => g.to === currentUser.username || g.from === currentUser.username);
    const container = document.getElementById('giftHistoryList');
    if (!myGifts.length) container.innerHTML = '<div>No gifts yet.</div>';
    else container.innerHTML = myGifts.map(g => `<div class="gift-history-item">🎁 ${g.from} → ${g.to}: ${g.amount} coins<br>💬 ${g.message}<br><small>${g.timestamp}</small></div>`).join('');
}

async function loadFriends() {
    const res = await fetch(`/api/get-friends?username=${currentUser.username}`);
    const friends = await res.json();
    const container = document.getElementById('friendsList');
    if (!friends.length) container.innerHTML = `<div>${t('no_friends') || 'No friends yet. Search and add!'}</div>`;
    else container.innerHTML = friends.map(f => {
        const isOnline = onlineUsers.some(u => normalizeUsername(u) === normalizeUsername(f));
        const statusText = isOnline ? '🟢 ' + t('online') : '⚫ ' + t('offline');
        return `<div class="room-card"><div class="room-card-info"><h4>${escapeHtml(f)}</h4><p>${statusText}</p></div><div class="friend-actions"><button class="delete-friend-btn" onclick="deleteFriend('${escapeHtml(f)}')">${t('remove') || 'Remove'}</button><button class="join-btn" onclick="showPrivateChat('${escapeHtml(f)}')">${t('chat') || 'Chat'}</button></div></div>`;
    }).join('');
}
async function loadFriendRequests() {
    const res = await fetch(`/api/get-friend-requests?username=${currentUser.username}`);
    const requests = await res.json();
    const container = document.getElementById('friendRequestsList');
    if (!requests.length) container.innerHTML = '<div>No requests</div>';
    else container.innerHTML = requests.map(req => `<div class="friend-request-item">${escapeHtml(req.from)} <button onclick="acceptFriendRequest('${escapeHtml(req.from)}')">${t('accept') || 'Accept'}</button></div>`).join('');
}
async function acceptFriendRequest(from) { socket.emit('accept-friend-request-socket', { username: currentUser.username, from }); }
async function deleteFriend(friend) {
    if (!confirm(`Remove ${friend}?`)) return;
    try {
        const res = await fetch('/api/delete-friend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser.username, friend })
        });
        const data = await res.json();
        if (data.success) {
            loadFriends();
        } else {
            alert('Failed to remove friend: ' + (data.error || 'Unknown error'));
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    }
}
async function sendFriendRequest(to) { socket.emit('send-friend-request-socket', { from: currentUser.username, to }); }
async function searchUsers() {
    const q = document.getElementById('friendSearch').value.trim();
    if (!q) return;
    const token = localStorage.getItem('chat_token');
    const res = await fetch('/api/get-all-users', { headers: { 'Authorization': `Bearer ${token}` } });
    const all = await res.json();
    const filtered = all.filter(u => u.username.toLowerCase().includes(q.toLowerCase()) && u.username !== currentUser.username);
    const container = document.getElementById('searchResults');
    container.style.display = 'block';
    if (!filtered.length) container.innerHTML = '<div>No users found</div>';
    else container.innerHTML = filtered.map(u => `<div class="search-result-item">${escapeHtml(u.username)} <button class="send-req-btn" onclick="sendFriendRequest('${escapeHtml(u.username)}')">${t('add_friend') || 'Add Friend'}</button></div>`).join('');
}

async function updateCoins() {
    const res = await fetch(`/api/auto-login`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('chat_token')}` } });
    const data = await res.json();
    if (data.success) { currentUser.coins = data.user.coins; document.getElementById('coinBalance').innerHTML = `💰 ${currentUser.coins}`; }
}
function closeSendGiftModal() { document.getElementById('sendGiftModal').classList.remove('active'); }
function showSendGiftModal() { document.getElementById('sendGiftModal').classList.add('active'); }

// ==================== VIP & BOOST ====================
async function checkVIPStatus() {
    if (!currentUser) return;
    try {
        const res = await fetch(`/api/get-vip-status?username=${currentUser.username}`);
        const data = await res.json();
        const display = document.getElementById('vipStatusDisplay');
        const buyButton = document.querySelector('.buy-vip-btn');
        if (data.success) {
            const expiresDate = data.expires ? new Date(data.expires) : null;
            const dateStr = expiresDate ? expiresDate.toLocaleDateString() : 'Unknown';
            display.innerHTML = `💎 ${t('vip_status')}: ${dateStr}`;
            if (currentUser) currentUser.isVIP = true;
            if (buyButton) buyButton.style.display = 'none';
        } else {
            display.innerHTML = `❌ ${t('vip_status')}: Not active`;
            if (currentUser) currentUser.isVIP = false;
            if (buyButton) {
                buyButton.style.display = 'block';
                buyButton.innerHTML = `💎 ${t('buy_vip')} (5000 ${t('coins')})`;
            }
        }
        updateVipBadge();
    } catch (err) {
        console.error('checkVIPStatus error:', err);
    }
}

async function buyVIP() {
    const res = await fetch('/api/buy-vip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username }) });
    const data = await res.json();
    if (data.success) {
        alert('VIP activated!');
        currentUser.isVIP = true;
        updateCoins();
        await checkVIPStatus();
        await checkAndUpdateVIPStatus();
        updateVipBadge();
        updateVIPButtonText();
    } else alert(data.error);
}
function showBoostModal() { document.getElementById('boostModal').classList.add('open'); document.getElementById('overlay').classList.add('active'); }
function closeBoostModal() { document.getElementById('boostModal').classList.remove('open'); document.getElementById('overlay').classList.remove('active'); }
function boostRoom() { const amount = parseInt(document.getElementById('boostAmount').value); if (amount && currentRoom && currentUser.coins >= amount) { socket.emit('boost-room', { username: currentUser.username, roomName: currentRoom, amount }); closeBoostModal(); updateCoins(); } else alert('Insufficient coins'); }

// ==================== ROOM MEMBERS & ADMIN ====================
async function loadRoomMembers() {
    if (!currentRoom) return;
    const res = await fetch(`/api/get-room-members/${currentRoom}`);
    const data = await res.json();
    if (data.success) {
        if (data.moderators) currentRoomModerators = data.moderators;
        const container = document.getElementById('roomMembersList');
        container.innerHTML = '';
        const membersWithProfiles = await Promise.all(data.members.map(async (member) => {
            let profilePic = null;
            try { const profileRes = await fetch(`/api/user-profile?username=${member}`); const profileData = await profileRes.json(); profilePic = profileData.profile_pic; } catch(e) {}
            return { username: member, profile_pic: profilePic, isOwner: member === currentRoomOwner, isMod: currentRoomModerators.includes(member), isVIP: data.vipMap ? data.vipMap[member] : false };
        }));
        membersWithProfiles.forEach(m => {
            let avatarHtml = '👤';
            if (m.profile_pic) {
                if (typeof m.profile_pic === 'string' && m.profile_pic.startsWith('data:image')) {
                    avatarHtml = `<img src="${m.profile_pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                } else if (typeof m.profile_pic === 'string' && m.profile_pic.startsWith('/uploads')) {
                    avatarHtml = `<img src="${m.profile_pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none';this.parentElement.innerHTML='👤';">`;
                } else {
                    avatarHtml = m.profile_pic;
                }
            }
            let nameColor = '', roleBadge = '', nameClass = '';
            if (m.isOwner) { nameColor = 'style="color:#ef4444; font-weight:bold;"'; roleBadge = ' 👑'; }
            else if (m.isMod) { nameColor = 'style="color:#f97316; font-weight:bold;"'; roleBadge = ' <span class="moderator-badge">MOD</span>'; nameClass = 'class="moderator-name"'; }
            container.innerHTML += `<div class="user-item"><div class="user-avatar" onclick="showUserProfile('${escapeHtml(m.username)}')">${avatarHtml}</div><div><span ${nameColor} ${nameClass}>${escapeHtml(m.username)}</span>${m.isVIP ? ' 💎' : ''}${roleBadge}</div>${(currentUser.username === currentRoomOwner || currentRoomModerators.includes(currentUser.username)) && m.username !== currentUser.username ? `<button class="kick-btn" onclick="kickUserFromRoom('${escapeHtml(m.username)}')">${t('kick') || 'Kick'}</button>` : ''}</div>`;
        });
        const kickedCont = document.getElementById('kickedUsersPanelList');
        if ((currentUser.username === currentRoomOwner || currentRoomModerators.includes(currentUser.username)) && data.kicked && data.kicked.length) kickedCont.innerHTML = `<h4>${t('banned_users')}</h4>` + data.kicked.map(k => `<div class="user-item"><span>${escapeHtml(k)}</span><button class="unban-btn" onclick="unbanUserFromRoom('${escapeHtml(k)}')">${t('unban') || 'Unban'}</button></div>`).join('');
        else kickedCont.innerHTML = '';
    }
}
async function kickUserFromRoom(username) {
    if (!confirm(`Kick ${username}?`)) return;
    const res = await fetch('/api/kick-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName: currentRoom, username, adminUsername: currentUser.username }) });
    if ((await res.json()).success) { alert('Kicked'); loadRoomMembers(); } else alert('Failed');
}
async function unbanUserFromRoom(username) {
    const res = await fetch('/api/unban-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName: currentRoom, username, adminUsername: currentUser.username }) });
    if ((await res.json()).success) { alert('Unbanned'); loadRoomMembers(); } else alert('Failed');
}
function showBanUserModal() { const modal = document.getElementById('banUserModal'); if (modal) { document.getElementById('banUsername').value = ''; modal.classList.add('active'); } else { const username = prompt('Enter username to kick/ban from this room:'); if (username && username.trim()) kickUserFromRoom(username.trim()); } }
function closeBanUserModal() { const modal = document.getElementById('banUserModal'); if (modal) modal.classList.remove('active'); }
function executeBanUser() { const username = document.getElementById('banUsername').value.trim(); if (!username) { alert('Please enter a username'); return; } if (username === currentUser.username) { alert('You cannot ban yourself'); return; } kickUserFromRoom(username); closeBanUserModal(); }
function showKickListModal() { const modal = document.getElementById('kickListModal'); if (modal) modal.classList.add('active'); else alert('Modal not found'); }
function closeKickListModal() { document.getElementById('kickListModal').classList.remove('active'); }

async function showRoomSettings() {
    if (!currentRoom) return;
    const isOwnerOrMod = currentUser.username === currentRoomOwner || currentRoomModerators.includes(currentUser.username);
    if (!isOwnerOrMod) return alert('Only owner or moderators can access settings');
    const res = await fetch(`/api/room-settings/${currentRoom}`);
    const data = await res.json();
    if (data.success) {
        const membersOnlyCheck = document.getElementById('membersOnlyToggle');
        membersOnlyCheck.checked = data.membersOnly;
        currentRoomMembersOnly = data.membersOnly;
        const isOwner = currentUser.username === currentRoomOwner;
        const membersOnlyDiv = document.querySelector('#roomSettingsModal .checkbox-group');
        if (membersOnlyDiv) membersOnlyDiv.style.display = isOwner ? 'block' : 'none';
        renderMemberManageList(data.allowedMembers || [], data.moderators || [], isOwner);
        document.getElementById('roomSettingsModal').classList.add('active');
    } else alert('Failed');
}
function renderMemberManageList(allowed, moderators, isOwner) {
    const cont = document.getElementById('roomMemberManageList');
    if (!cont) return;
    if (!allowed.length) { cont.innerHTML = '<div style="padding:10px;text-align:center;">No members added yet.</div>'; return; }
    cont.innerHTML = '';
    allowed.forEach(m => {
        const isMod = moderators.includes(m);
        cont.innerHTML += `<div class="user-item"><div class="user-avatar">👤</div><div><strong>${escapeHtml(m)}</strong> ${isMod ? '<span class="moderator-badge">MOD</span>' : ''}</div><div style="margin-left:auto;">${isOwner ? (isMod ? `<button class="kick-btn" onclick="removeModerator('${escapeHtml(m)}')">${t('remove_mod') || 'Remove Mod'}</button>` : `<button class="mod-btn" onclick="setModerator('${escapeHtml(m)}')">${t('make_mod') || 'Make Mod'}</button>`) : ''}<button class="kick-btn" onclick="removeRoomMember('${escapeHtml(m)}')">${t('remove') || 'Remove'}</button></div></div>`;
    });
}
async function toggleMembersOnly() {
    if (!currentRoom || currentUser.username !== currentRoomOwner) return;
    const mo = document.getElementById('membersOnlyToggle').checked;
    const res = await fetch('/api/room-settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ roomName: currentRoom, membersOnly: mo, adminUsername: currentUser.username }) });
    const data = await res.json();
    if (data.success) { currentRoomMembersOnly = mo; alert(`Room is now ${mo ? 'Members Only' : 'Open'}`); }
    else { alert(data.error); document.getElementById('membersOnlyToggle').checked = !mo; }
}
function addRoomMember() { const username = document.getElementById('addMemberUsername').value.trim(); if (!username) return; socket.emit('add-room-member', { roomName: currentRoom, username: username, adminUsername: currentUser.username }); document.getElementById('addMemberUsername').value = ''; }
function removeRoomMember(username) { if (!confirm(`Remove ${username}?`)) return; socket.emit('remove-room-member', { roomName: currentRoom, username: username, adminUsername: currentUser.username }); }
function setModerator(username) { socket.emit('set-moderator', { roomName: currentRoom, username: username, adminUsername: currentUser.username }); }
function removeModerator(username) { socket.emit('remove-moderator', { roomName: currentRoom, username: username, adminUsername: currentUser.username }); }
function closeRoomSettingsModal() { document.getElementById('roomSettingsModal').classList.remove('active'); }

// ==================== WEBRTC CALLS (FULLY REWORKED) ====================

const baseCallConfig = {
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

async function getCallConfig() {
    const turnServers = await getTurnCredentials();
    let iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];
    if (turnServers && turnServers.length > 0) {
        iceServers = iceServers.concat(turnServers);
    } else {
        iceServers.push({
            urls: [
                'turn:global.turn.metered.ca:443?transport=tcp',
                'turn:global.turn.metered.ca:443?transport=udp'
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject'
        });
        iceServers.push({
            urls: 'turn:numb.viagenie.ca',
            username: 'webrtc@live.com',
            credential: 'muazkh'
        });
    }
    return { ...baseCallConfig, iceServers };
}

function createPeerConnection(config) {
    const pc = new RTCPeerConnection(config);
    pc.oniceconnectionstatechange = () => {
        console.log('ICE Connection State:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
            console.warn('ICE failed – restarting...');
            pc.restartIce();
        }
    };
    pc.onconnectionstatechange = () => {
        console.log('Connection State:', pc.connectionState);
        if (pc.connectionState === 'failed') {
            showToast('Connection failed. Trying to reconnect...');
            setTimeout(() => {
                if (callActive && currentPrivateChat) {
                    restartCall();
                }
            }, 2000);
        }
    };
    return pc;
}

// -----------------------------------------------
// CRITICAL FIX: improved ontrack handler
// -----------------------------------------------
function setupPeerConnectionListeners(pc, isCaller = false) {
    pc.onicecandidate = (event) => {
        if (event.candidate && currentPrivateChat) {
            console.log('Sending ICE candidate to', currentPrivateChat);
            if (socket && socket.connected) {
                socket.emit('ice-candidate', { 
                    to: currentPrivateChat, 
                    candidate: event.candidate 
                });
            } else {
                console.warn('Socket not ready – cannot send ICE candidate');
            }
        }
    };

    pc.ontrack = (event) => {
        console.log('📡 Track received:', event.track.kind);
        const remoteVideo = document.getElementById('remoteVideo');
        if (!remoteVideo) return;

        let remoteStream = remoteVideo.srcObject;
        if (!remoteStream) {
            remoteStream = new MediaStream();
            remoteVideo.srcObject = remoteStream;
            console.log('📦 Created new remote stream');
        }
        remoteStream.addTrack(event.track);
        console.log(`➕ Added ${event.track.kind} track (total: ${remoteStream.getTracks().length})`);

        // Play the remote video (with retry)
        const playRemote = () => {
            remoteVideo.play().catch(err => {
                console.warn('⚠️ Remote video play failed, retrying...', err);
                setTimeout(() => remoteVideo.play().catch(e => console.error('❌ Final play failed:', e)), 500);
            });
        };
        playRemote();

        // 🔥 Fallback: dedicated audio element (ensures audio plays)
        if (event.track.kind === 'audio') {
            let audioEl = document.querySelector('audio[data-call-audio]');
            if (!audioEl) {
                audioEl = document.createElement('audio');
                audioEl.setAttribute('data-call-audio', 'true');
                audioEl.autoplay = true;
                audioEl.style.display = 'none';
                document.body.appendChild(audioEl);
                console.log('🔊 Created hidden audio element');
            }
            const audioStream = new MediaStream();
            audioStream.addTrack(event.track);
            audioEl.srcObject = audioStream;
            audioEl.play().catch(e => console.warn('Audio fallback play:', e));
        }
    };

    pc.oniceconnectionstatechange = () => {
        console.log('ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
            showToast('Call connection failed (ICE)');
            endCall();
        } else if (pc.iceConnectionState === 'connected') {
            showToast('Call connected');
        } else if (pc.iceConnectionState === 'disconnected') {
            showToast('Call disconnected');
        }
    };
    pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
        if (pc.connectionState === 'failed') {
            showToast('Call connection failed');
            endCall();
        } else if (pc.connectionState === 'connected') {
            showToast('Call established');
        }
    };
    pc.onnegotiationneeded = async () => {
        if (callActive && currentPrivateChat) {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                if (socket && socket.connected) {
                    socket.emit('call-user', {
                        to: currentPrivateChat,
                        from: currentUser.username,
                        offer: pc.localDescription
                    });
                } else {
                    console.warn('Socket not ready for negotiation');
                }
            } catch (err) {
                console.error('Re-negotiation error:', err);
            }
        }
    };
}

async function restartCall() {
    if (!currentPrivateChat) return;
    showToast('Reconnecting call...');
    endCall();
    await new Promise(r => setTimeout(r, 1000));
    startCall();
}

// -----------------------------------------------
// startCall – added socket check and audio track verification
// -----------------------------------------------
async function startCall() {
    if (!currentPrivateChat) { showToast('No private chat open'); return; }
    if (callActive) { showToast('Already in a call'); return; }
    if (!onlineUsers.some(u => normalizeUsername(u) === normalizeUsername(currentPrivateChat))) {
        showToast('User is offline - cannot start call');
        return;
    }
    if (!socket || !socket.connected) {
        showToast('❌ Not connected to server. Please wait.');
        console.error('Socket not ready');
        return;
    }
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }

    try {
        showToast('Starting call...');
        const config = await getCallConfig();
        const constraints = {
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('🎤 Local tracks:', localStream.getTracks().map(t => t.kind));
        if (!localStream.getAudioTracks().length) {
            showToast('⚠️ No microphone – call will be silent!');
        }

        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true;
            localVideo.play().catch(e => console.log('Local video play error:', e));
        }

        peerConnection = createPeerConnection(config);
        setupPeerConnectionListeners(peerConnection, true);
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
            console.log('Added track:', track.kind);
        });

        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(offer);

        socket.emit('call-user', {
            to: currentPrivateChat,
            from: currentUser.username,
            offer: peerConnection.localDescription
        });
        document.getElementById('callModal').classList.add('active');
        callActive = true;
        showToast('Calling...');

        // Timeout if no answer
        setTimeout(() => {
            if (callActive && !pendingCallFrom) {
                showToast('Call timed out - user didn\'t answer');
                endCall();
            }
        }, 30000);
    } catch (error) {
        console.error('Start call error:', error);
        showToast('Could not start call: ' + error.message);
        endCall();
    }
}

// -----------------------------------------------
// acceptCall – improved
// -----------------------------------------------
async function acceptCall() {
    stopRingtone();
    if (!pendingCallFrom) return;
    if (callActive) {
        endCall();
        await new Promise(r => setTimeout(r, 300));
    }
    try {
        showToast('Accepting call...');
        const config = await getCallConfig();
        const constraints = {
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('🎤 Local tracks:', localStream.getTracks().map(t => t.kind));
        if (!localStream.getAudioTracks().length) {
            showToast('⚠️ No microphone – call will be silent!');
        }

        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true;
            localVideo.play().catch(e => console.log('Local video play error:', e));
        }

        if (peerConnection) { peerConnection.close(); peerConnection = null; }
        peerConnection = createPeerConnection(config);
        setupPeerConnectionListeners(peerConnection, false);
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
            console.log('Added track:', track.kind);
        });

        await peerConnection.setRemoteDescription(new RTCSessionDescription(pendingOffer));
        const answer = await peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        await peerConnection.setLocalDescription(answer);

        if (socket && socket.connected) {
            socket.emit('call-accepted', {
    to: pendingCallFrom,
    answer: peerConnection.localDescription
});
        } else {
            showToast('❌ Socket disconnected – cannot accept call');
            endCall();
            return;
        }

        document.getElementById('callModal').classList.add('active');
        document.getElementById('incomingCallBar').classList.remove('active');
        callActive = true;
        pendingCallFrom = null;
        pendingOffer = null;
        showToast('Call connected');
    } catch (error) {
        console.error('Accept call error:', error);
        showToast('Could not accept call: ' + error.message);
        endCall();
    }
}

function rejectCall() {
    stopRingtone();
    if (pendingCallFrom) {
        socket.emit('call-rejected', {
            to: pendingCallFrom
        });
        document.getElementById('incomingCallBar').classList.remove('active');
        pendingCallFrom = null;
        pendingOffer = null;
    }
}
function endCall() {
    stopRingtone();
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    if (localVideo) {
        localVideo.srcObject = null;
        localVideo.muted = false;
    }
    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }
    document.querySelectorAll('audio[data-call-audio]').forEach(el => el.remove());
    document.getElementById('callModal').classList.remove('active');
    if (callActive && currentPrivateChat) {
        socket.emit('end-call', { to: currentPrivateChat });
    }
    callActive = false;
    pendingCallFrom = null;
    pendingOffer = null;
    speakerEnabled = false;
    const speakerBtn = document.getElementById('speakerBtn');
    if (speakerBtn) speakerBtn.textContent = '🔊';
}

// ==================== SPEAKER TOGGLE (LOUDSPEAKER) ====================
async function toggleSpeaker() {
    const remoteVideo = document.getElementById('remoteVideo');
    if (!remoteVideo) {
        showToast('No active call');
        return;
    }
    if (!remoteVideo.setSinkId) {
        if (!remoteVideo.srcObject) {
            showToast('No audio stream');
            return;
        }
        try {
            if (!window._speakerGainNode) {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioCtx.createMediaStreamSource(remoteVideo.srcObject);
                const gain = audioCtx.createGain();
                source.connect(gain);
                gain.connect(audioCtx.destination);
                window._speakerGainNode = gain;
                window._speakerAudioCtx = audioCtx;
            }
            const gain = window._speakerGainNode;
            speakerEnabled = !speakerEnabled;
            gain.gain.value = speakerEnabled ? 1.5 : 0.8;
            const speakerBtn = document.getElementById('speakerBtn');
            speakerBtn.textContent = speakerEnabled ? '🔊' : '🔇';
            showToast(speakerEnabled ? 'Speaker on (volume boost)' : 'Speaker off');
        } catch (e) {
            console.error('Fallback speaker error:', e);
            showToast('Speaker toggle failed');
        }
        return;
    }
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        if (audioOutputs.length < 2) {
            showToast('Only one audio output – using system volume');
            return;
        }
        let targetSinkId;
        if (!speakerEnabled) {
            const speakerDevice = audioOutputs.find(d =>
                d.label.toLowerCase().includes('speaker') ||
                d.label.toLowerCase().includes('headphone')
            );
            targetSinkId = speakerDevice
                ? speakerDevice.deviceId
                : audioOutputs.find(d => d.deviceId !== 'default')?.deviceId;
            if (!targetSinkId) {
                showToast('No speaker device found');
                return;
            }
        } else {
            targetSinkId = 'default';
        }
        await remoteVideo.setSinkId(targetSinkId);
        speakerEnabled = !speakerEnabled;
        const speakerBtn = document.getElementById('speakerBtn');
        speakerBtn.textContent = speakerEnabled ? '🔊' : '🔇';
        showToast(speakerEnabled ? 'Speaker on' : 'Speaker off');
    } catch (err) {
        console.error('setSinkId error:', err);
        showToast('Failed to switch speaker');
    }
}

function toggleCallAudio() {
    if (localStream && localStream.getAudioTracks().length > 0) {
        const enabled = localStream.getAudioTracks()[0].enabled;
        localStream.getAudioTracks()[0].enabled = !enabled;
        showToast(enabled ? 'Microphone muted' : 'Microphone unmuted');
    } else {
        showToast('No audio track found');
    }
}
function toggleCallVideo() {
    if (localStream && localStream.getVideoTracks().length > 0) {
        const enabled = localStream.getVideoTracks()[0].enabled;
        localStream.getVideoTracks()[0].enabled = !enabled;
        showToast(enabled ? 'Camera off' : 'Camera on');
    } else {
        showToast('No video track found');
    }
}

// ==================== YOUTUBE SYNC ====================
function toggleYouTubePlayer() {
    const c = document.getElementById('youtubePlayerContainer');
    youtubePlayerVisible = !youtubePlayerVisible;
    if (youtubePlayerVisible) { c.classList.add('active'); document.getElementById('youtubeSearchInput').value = ''; }
    else c.classList.remove('active');
}
function searchAndPlayYouTube() {
    const query = document.getElementById('youtubeSearchInput').value.trim();
    if (!query) return;
    let videoId = null;
    const patterns = [ /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/, /youtube\.com\/embed\/([^&\n?#]+)/, /youtube\.com\/shorts\/([^&\n?#]+)/ ];
    for (const pattern of patterns) { const match = query.match(pattern); if (match) { videoId = match[1]; break; } }
    if (videoId) updateYouTubeVideo(videoId);
    else {
        fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${encodeURIComponent(query)}`)
            .then(res => res.json())
            .then(data => {
                if (data.url) {
                    const match = data.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
                    if (match && match[1]) updateYouTubeVideo(match[1]);
                    else { window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank'); showToast('Opening YouTube search in new tab. Copy video URL and paste here.'); }
                } else showToast('Video not found. Try a direct YouTube URL.');
            })
            .catch(() => { window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank'); showToast('Opening YouTube search. Copy video URL and paste here.'); });
    }
}
function updateYouTubeVideo(videoId) {
    const iframe = document.getElementById('youtubeIframe');
    iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
    if (currentRoom) socket.emit('sync-youtube', { room: currentRoom, videoId: videoId });
    document.getElementById('youtubeSearchInput').value = '';
    showToast('🎬 Video updated!');
}

// ==================== USER PROFILE MODAL ====================
async function showUserProfile(username) {
    const token = localStorage.getItem('chat_token');
    const res = await fetch('/api/get-all-users', { headers: { 'Authorization': `Bearer ${token}` } });
    const usersList = await res.json();
    const user = usersList.find(u => u.username === username);
    if (!user) return;
    const isOnline = onlineUsers.some(u => normalizeUsername(u) === normalizeUsername(username));
    let avatarHtml = '👤';
    if (user.profile_pic) {
        if (typeof user.profile_pic === 'string' && user.profile_pic.startsWith('data:image')) {
            avatarHtml = `<img src="${user.profile_pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else if (typeof user.profile_pic === 'string' && user.profile_pic.startsWith('/uploads')) {
            avatarHtml = `<img src="${user.profile_pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none';this.parentElement.innerHTML='👤';">`;
        } else {
            avatarHtml = user.profile_pic;
        }
    }
    const content = `<div class="profile-card"><div class="profile-avatar">${avatarHtml}</div><div class="profile-name">${escapeHtml(user.username)}</div><div class="profile-status">${isOnline ? '🟢 ' + t('online') : '⚫ ' + t('offline')}</div><div class="profile-info"><p>💰 ${t('coins')}: ${user.coins}</p></div><div class="profile-buttons"><button onclick="showPrivateChat('${escapeHtml(user.username)}'); closeProfileModal();">💬 ${t('message')}</button><button onclick="sendFriendRequest('${escapeHtml(user.username)}'); closeProfileModal();">➕ ${t('add_friend') || 'Add Friend'}</button></div></div>`;
    document.getElementById('profileContent').innerHTML = content; document.getElementById('profileModal').classList.add('active');
}
function closeProfileModal() { document.getElementById('profileModal').classList.remove('active'); }

// ==================== ADMIN PANEL FUNCTIONS ====================
async function showAllUsers() { const res = await fetch(`/api/admin/get-all-users?admin=${currentUser.username}`); const users = await res.json(); if (users.error) { alert('Admin access required'); return; } const html = users.map(u => `<div>${escapeHtml(u.username)} (💰 ${u.coins}) ${u.isAdmin ? '👑 Admin' : ''} <button onclick="deleteUser('${escapeHtml(u.username)}')">${t('delete') || 'Delete'}</button></div>`).join(''); document.getElementById('allUsersList').innerHTML = html; document.getElementById('usersModal').classList.add('active'); }
async function deleteUser(username) { if(confirm('Delete user?')){ await fetch('/api/delete-user', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ adminUsername: currentUser.username, username }) }); showAllUsers(); } }
async function showAllRooms() { const res = await fetch(`/api/get-all-rooms?admin=${currentUser.username}`); const rooms = await res.json(); const html = rooms.map(r => `<div>${r.name} (Owner: ${r.owner}) <button onclick="deleteRoom('${r.name}')">${t('delete') || 'Delete'}</button></div>`).join(''); document.getElementById('allRoomsList').innerHTML = html; document.getElementById('roomsModal').classList.add('active'); }
async function deleteRoom(roomName) { if(confirm('Delete room?')){ await fetch('/api/delete-room', { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ adminUsername: currentUser.username, roomName }) }); showAllRooms(); } }
async function showAllGifts() { const res = await fetch('/api/get-gifts'); const gifts = await res.json(); const html = gifts.map(g => `<div>${g.from} → ${g.to}: ${g.amount} coins (${g.timestamp})</div>`).join(''); document.getElementById('allGiftsList').innerHTML = html; document.getElementById('giftsModal').classList.add('active'); }
async function clearAllFriendRequests() { if(confirm('Clear all friend requests?')){ await fetch('/api/clear-friend-requests', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ adminUsername: currentUser.username }) }); alert('Cleared'); } }
async function clearAllCoinRequests() { if(confirm('Clear coin history?')){ await fetch('/api/clear-coin-requests', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ adminUsername: currentUser.username }) }); alert('Cleared'); } }
async function showBoostLogModal() { const res = await fetch('/api/get-boost-logs'); const logs = await res.json(); const html = logs.map(l => `<div>${l.username} boosted ${l.roomName} with ${l.amount} coins at ${l.timestamp}</div>`).join(''); document.getElementById('boostLogList').innerHTML = html; document.getElementById('boostLogModal').classList.add('active'); }
async function showPendingManualRequests() { const res = await fetch(`/api/get-pending-manual-requests?admin=${currentUser.username}`); const reqs = await res.json(); const html = reqs.map(r => `<div>${r.username} requested ${r.amount} coins (${r.paymentMethod}) <button onclick="approveRequest('${r._id}')">${t('approve') || 'Approve'}</button> <button onclick="rejectRequest('${r._id}')">${t('reject') || 'Reject'}</button> ${r.proof ? `<a href="${r.proof}" target="_blank">Proof</a>` : ''}</div>`).join(''); document.getElementById('pendingRequestsList').innerHTML = html; document.getElementById('pendingRequestsModal').classList.add('active'); }
async function approveRequest(id) { await fetch('/api/approve-manual-request', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ requestId: id, adminUsername: currentUser.username }) }); showPendingManualRequests(); }
async function rejectRequest(id) { await fetch('/api/reject-manual-request', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ requestId: id, adminUsername: currentUser.username }) }); showPendingManualRequests(); }
async function adminGiveCoins() { const username = document.getElementById('adminGiveUsername').value, amount = document.getElementById('adminGiveAmount').value; await fetch('/api/admin-give-coins', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ adminUsername: currentUser.username, username, amount }) }); alert('Coins given'); }
async function adminResetPassword() { const username = document.getElementById('adminResetUser').value, newPassword = document.getElementById('adminNewPass').value; await fetch('/api/admin-reset-password', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ adminUsername: currentUser.username, username, newPassword }) }); alert('Password reset'); }
function closeUsersModal() { document.getElementById('usersModal').classList.remove('active'); }
function closeRoomsModal() { document.getElementById('roomsModal').classList.remove('active'); }
function closeGiftsModal() { document.getElementById('giftsModal').classList.remove('active'); }
function closeBoostLogModal() { document.getElementById('boostLogModal').classList.remove('active'); }
function closePendingRequestsModal() { document.getElementById('pendingRequestsModal').classList.remove('active'); }

// ==================== SUPPORT TICKETS ====================
function openSupportModal() { document.getElementById('supportModal').classList.add('active'); document.getElementById('supportResponse').innerHTML = ''; document.getElementById('supportSubject').value = ''; document.getElementById('supportMessage').value = ''; document.getElementById('supportScreenshot').value = ''; }
function closeSupportModal() { document.getElementById('supportModal').classList.remove('active'); }
async function submitSupportTicket() {
    if (!currentUser || !currentUser.username) { alert('You must be logged in.'); return; }
    const subject = document.getElementById('supportSubject').value.trim();
    const message = document.getElementById('supportMessage').value.trim();
    if (!subject || !message) { alert('Please fill subject and message.'); return; }
    const fd = new FormData();
    fd.append('username', currentUser.username);
    fd.append('subject', subject);
    fd.append('message', message);
    const fileInput = document.getElementById('supportScreenshot');
    if (fileInput.files[0]) fd.append('screenshot', fileInput.files[0]);
    const responseDiv = document.getElementById('supportResponse');
    responseDiv.innerHTML = '<span style="color:blue;">Sending...</span>';
    try {
        const res = await fetch('/api/support/submit', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) { responseDiv.innerHTML = `<span style="color:green;">✅ Ticket submitted! ID: ${data.ticketId}</span>`; setTimeout(() => closeSupportModal(), 2000); }
        else responseDiv.innerHTML = `<span style="color:red;">❌ ${data.error || 'Unknown error'}</span>`;
    } catch (err) { console.error('Upload error:', err); responseDiv.innerHTML = '<span style="color:red;">❌ Network error.</span>'; }
}
async function showAdminSupportPanel() {
    if (!currentUser.isAdmin) return;
    try {
        const res = await fetch(`/api/support/tickets?admin=${currentUser.username}&status=all`);
        if (!res.ok) throw new Error('Failed to fetch tickets');
        const tickets = await res.json();
        const container = document.getElementById('adminTicketsList');
        if (!tickets.length) container.innerHTML = '<div>No support tickets.</div>';
        else container.innerHTML = tickets.map(t => `
            <div class="ticket-item">
                <strong>${escapeHtml(t.ticketId)}</strong> 
                <span class="ticket-status status-${t.status}">${escapeHtml(t.status)}</span><br>
                <strong>From:</strong> ${escapeHtml(t.username)}<br>
                <strong>Subject:</strong> ${escapeHtml(t.subject)}<br>
                <strong>Message:</strong> ${escapeHtml(t.message)}<br>
                ${t.screenshot ? `<a href="${escapeHtml(t.screenshot)}" target="_blank">📷 View Screenshot</a><br>` : ''}
                ${t.adminReply ? `<strong>Admin Reply:</strong> ${escapeHtml(t.adminReply)}<br>` : ''}
                <div style="margin-top:10px;">
                    <button onclick="openReplyTicketModal('${escapeHtml(t.ticketId)}', '${escapeHtml(t.message.replace(/'/g, "\\'"))}')">${t('reply') || 'Reply'}</button>
                    ${t.status !== 'resolved' ? `<button onclick="resolveTicket('${escapeHtml(t.ticketId)}')">${t('resolve') || 'Resolve'}</button>` : ''}
                </div>
            </div>
        `).join('');
        document.getElementById('adminSupportModal').classList.add('active');
    } catch (err) { console.error('Error loading tickets:', err); alert('Failed to load support tickets.'); }
}
function closeAdminSupportModal() { document.getElementById('adminSupportModal').classList.remove('active'); }
let currentReplyTicketId = null;
function openReplyTicketModal(ticketId, userMessage) {
    currentReplyTicketId = ticketId;
    document.getElementById('replyTicketId').innerText = `Ticket: ${ticketId}`;
    document.getElementById('replyUserMessage').innerText = userMessage;
    document.getElementById('replyMessage').value = '';
    document.getElementById('replyTicketModal').classList.add('active');
}
function closeReplyTicketModal() { document.getElementById('replyTicketModal').classList.remove('active'); currentReplyTicketId = null; }
async function sendSupportReply() {
    if (!currentReplyTicketId) return;
    const reply = document.getElementById('replyMessage').value.trim();
    if (!reply) return alert('Please enter a reply');
    const res = await fetch('/api/support/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUsername: currentUser.username, ticketId: currentReplyTicketId, reply })
    });
    const data = await res.json();
    if (data.success) { alert('Reply sent.'); closeReplyTicketModal(); showAdminSupportPanel(); }
    else alert('Failed to send reply');
}
async function resolveTicket(ticketId) {
    if (!confirm('Mark this ticket as resolved?')) return;
    const res = await fetch('/api/support/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUsername: currentUser.username, ticketId })
    });
    const data = await res.json();
    if (data.success) { alert('Ticket resolved.'); showAdminSupportPanel(); }
    else alert('Failed to resolve');
}
function openViewTicketModal(ticketId, reply) {
    document.getElementById('viewTicketId').innerText = ticketId;
    document.getElementById('viewTicketReply').innerHTML = escapeHtml(reply).replace(/\n/g, '<br>');
    document.getElementById('viewTicketModal').classList.add('active');
}
function closeViewTicketModal() { document.getElementById('viewTicketModal').classList.remove('active'); }

// ==================== UI HELPERS ====================
function addSystemMessage(text, containerId) { const c = document.getElementById(containerId); const div = document.createElement('div'); div.className = 'system-message'; div.textContent = text; c.appendChild(div); }
function togglePanel() { document.getElementById('sidePanel').classList.toggle('open'); document.getElementById('overlay').classList.toggle('active'); }
function toggleUsersPanel() { document.getElementById('usersPanel').classList.toggle('open'); document.getElementById('overlay').classList.toggle('active'); loadRoomMembers(); }
function closeAllPanels() { document.getElementById('sidePanel').classList.remove('open'); document.getElementById('usersPanel').classList.remove('open'); document.getElementById('boostModal').classList.remove('open'); document.getElementById('overlay').classList.remove('active'); }
function toggleRoomMenu(event) { event.stopPropagation(); const menu = document.getElementById('roomDropdownMenu'); const isOpen = menu.classList.contains('show'); if (isOpen) closeRoomMenu(); else { closeRoomMenu(); updateRoomMenuPermissions(); menu.classList.add('show'); setTimeout(() => { document.addEventListener('click', closeRoomMenuOnClickOutside); }, 0); } }
function closeRoomMenu() { const menu = document.getElementById('roomDropdownMenu'); menu.classList.remove('show'); document.removeEventListener('click', closeRoomMenuOnClickOutside); }
function closeRoomMenuOnClickOutside(event) { const menu = document.getElementById('roomDropdownMenu'); const btn = document.getElementById('roomMenuBtn'); if (!menu.contains(event.target) && !btn.contains(event.target)) closeRoomMenu(); }
function updateRoomMenuPermissions() {
    const isOwner = currentUser && currentRoom && currentUser.username === currentRoomOwner;
    const isMod = currentUser && currentRoom && currentRoomModerators && currentRoomModerators.includes(currentUser.username);
    const canManage = isOwner || isMod;
    const settingsItem = document.getElementById('roomSettingsMenuItem');
    const banItem = document.getElementById('banUserMenuItem');
    const kickedListItem = document.getElementById('kickedListMenuItem');
    if (settingsItem) settingsItem.style.display = canManage ? 'flex' : 'none';
    if (banItem) banItem.style.display = canManage ? 'flex' : 'none';
    if (kickedListItem) kickedListItem.style.display = canManage ? 'flex' : 'none';
}

function refreshRoomMessagesModeratorStatus() {
    if (!currentRoom) return;
    const messages = document.querySelectorAll('#roomMessages .message-wrapper');
    messages.forEach(wrapper => {
        const senderDiv = wrapper.querySelector('.message-sender');
        if (!senderDiv) return;
        let username = senderDiv.innerText.trim().split(' ')[0] || '';
        if (!username) return;
        senderDiv.classList.remove('owner', 'moderator');
        const existingBadge = senderDiv.querySelector('.moderator-badge');
        if (existingBadge) existingBadge.remove();

        const isOwner = username === currentRoomOwner;
        const isMod = currentRoomModerators.includes(username);

        if (isOwner) {
            senderDiv.classList.add('owner');
        } else if (isMod) {
            senderDiv.classList.add('moderator');
            const badge = document.createElement('span');
            badge.className = 'moderator-badge';
            badge.innerText = 'MOD';
            senderDiv.appendChild(badge);
        }
    });
}

function onRoomTyping() {
    if (currentRoom && socket) {
        socket.emit('typing', { room: currentRoom, username: currentUser.username });
        clearTimeout(typingTimeoutRoom);
        typingTimeoutRoom = setTimeout(() => {
            socket.emit('stop-typing', { room: currentRoom, username: currentUser.username });
        }, 1000);
    }
}
function onPrivateTyping() {
    if (currentPrivateChat && socket) {
        socket.emit('private-typing', { to: currentPrivateChat, from: currentUser.username });
        clearTimeout(typingTimeoutPrivate);
        typingTimeoutPrivate = setTimeout(() => {
            socket.emit('private-stop-typing', { to: currentPrivateChat, from: currentUser.username });
        }, 1000);
    }
}

async function requestMicrophonePermission() { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach(t => t.stop()); } catch(e) {} }

// ==================== SOCKET INITIALIZATION ====================
function initSocket() {
    const socketURL = window.location.origin;
    socket = io(socketURL, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        transports: ['websocket', 'polling'],
        path: '/socket.io/',
        secure: true
    });
    socket.on('connect', () => {
        targetLanguage = localStorage.getItem('targetLanguage') || 'en';
        autoTranslateMessages = localStorage.getItem('autoTranslateMessages') !== 'false';
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.className = 'connection-status-indicator';
            statusEl.innerHTML = '<span class="dot"></span> Connected';
        }
        showToast('Connected to server');
        refreshUserData();
        socket.emit('user-online', currentUser.username);
        socket.emit('get-room-list');
        const lastRoom = localStorage.getItem('lastRoom');
        if (lastRoom && !currentRoom) setTimeout(() => socket.emit('join-room', lastRoom), 500);
    });
    socket.on('reconnect', () => {
        setTimeout(() => refreshUserData(), 500);
        socket.emit('user-online', currentUser.username);
        const lastRoom = localStorage.getItem('lastRoom');
        if (lastRoom && !currentRoom) setTimeout(() => { socket.emit('join-room', lastRoom); }, 500);
    });
    socket.on('disconnect', () => {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.className = 'connection-status-indicator disconnected';
            statusEl.innerHTML = '<span class="dot"></span> Disconnected';
        }
        showToast('⚠️ Connection lost – reconnecting...');
    });
    socket.on('connect_error', (err) => { console.error('Connection error:', err); });

    socket.on('online-users', (users) => {
        onlineUsers = users;
        updatePrivateStatus();
        loadFriends();
    });
    socket.on('room-list', (rooms) => { allRooms = rooms; displayRooms(rooms); });
    socket.on('room-created-success', (name) => { alert(`Room "${name}" created`); socket.emit('get-room-list'); closeCreateRoomModal(); updateCoins(); });
    socket.on('room-joined', (data) => {
        currentRoom = data.room;
        currentRoomOwner = data.owner;
        currentRoomIsVip = data.isVipRoom;
        currentRoomModerators = data.moderators || [];
        currentRoomMembersOnly = data.membersOnly || false;
        document.getElementById('roomChatName').innerHTML = `#${escapeHtml(data.room)}${data.isVipRoom ? ' 💎' : ''}`;
        document.getElementById('roomChatStats').innerHTML = `${data.members.length} ${t('members')} | ${t('boost')}: ${data.boostLevel || 0}`;
        const container = document.getElementById('roomMessages');
        container.innerHTML = '';
        roomMessagesCache[data.room] = [];
        const youtubeBtn = document.getElementById('youtubeToggleBtn');
        if (data.isVipRoom) youtubeBtn.style.display = 'inline-block';
        else { youtubeBtn.style.display = 'none'; document.getElementById('youtubePlayerContainer').classList.remove('active'); }
        const chatCont = document.getElementById('roomChatView'), msgCont = document.getElementById('roomMessages'), header = document.getElementById('roomChatHeader');
        if (data.isVipRoom) { chatCont.classList.add('vip-room-chat'); msgCont.classList.add('vip-room-messages'); header.classList.add('vip-room-header'); document.getElementById('roomChatName').classList.add('vip-room-title'); document.getElementById('roomChatStats').classList.add('vip-room-stats'); }
        else { chatCont.classList.remove('vip-room-chat'); msgCont.classList.remove('vip-room-messages'); header.classList.remove('vip-room-header'); document.getElementById('roomChatName').classList.remove('vip-room-title'); document.getElementById('roomChatStats').classList.remove('vip-room-stats'); }
        loadRoomMembers(); showRoomChat(); saveSessionState();
    });
    socket.on('room-messages-history', (data) => { /* ignore */ });
    socket.on('new-room-message', (msg) => addRoomMessage(msg));
    socket.on('user-joined-room', (data) => { addSystemMessage(`${data.username} ${t('joined')}`, 'roomMessages'); loadRoomMembers(); });
    socket.on('user-left-room', (data) => { addSystemMessage(`${data.username} ${t('left')}`, 'roomMessages'); loadRoomMembers(); });
    socket.on('room-boosted', (data) => { addSystemMessage(`🚀 ${data.boostedBy} ${t('boosted')} ${data.amount} ${t('coins')}! ${t('total_boost')}: ${data.boostLevel}`, 'roomMessages'); document.getElementById('roomChatStats').innerHTML = `${t('boost')}: ${data.boostLevel}`; if(currentUser.isAdmin) showBoostLogModal(); socket.emit('get-room-list'); });
    socket.on('new-private-message', (msg) => { playNotificationSound(); if (currentPrivateChat === msg.from) addPrivateMessage(msg); else addNotification(t('new_message'), `${msg.from}: ${msg.message.substring(0,50)}`, { type: 'private_message', from: msg.from }); });
    socket.on('private-message-sent', (msg) => addPrivateMessage(msg));
    socket.on('gift-received', (gift) => { playNotificationSound(); alert(`🎁 ${gift.from} ${t('sent_gift')} ${gift.amount} ${t('coins')}!`); updateCoins(); loadGiftHistory(); addNotification(t('gift_received'), `${gift.from} ${t('sent_gift')} ${gift.amount} ${t('coins')}!`); showGiftTicker(gift.from, gift.to, gift.amount); });
    socket.on('friend-request-received', (data) => { playNotificationSound(); alert(`📨 ${t('friend_request')} ${t('from')} ${data.from}`); loadFriendRequests(); addNotification(t('friend_request'), `${t('from')} ${data.from}`); });
    socket.on('coins-updated', (balance) => { currentUser.coins = balance; document.getElementById('coinBalance').innerHTML = `💰 ${balance}`; });
    socket.on('admin-gift', (data) => { alert(`🎁 ${t('admin_gave')} ${data.amount} ${t('coins')}!`); updateCoins(); });
    socket.on('friend-deleted', (friendName) => { alert(`${friendName} ${t('removed_you')}`); loadFriends(); });
    socket.on('gift-ticker', (data) => { showGiftTicker(data.from, data.to, data.amount); });
    socket.on('kicked-from-room', (data) => { alert(`${t('kicked_from')} ${data.room}`); if (currentRoom === data.room) leaveRoom(); });

    // -----------------------------------------------
    // INCOMING CALL – fixed with socket check
    // -----------------------------------------------
    socket.on('incoming-call', (data) => {
        playNotificationSound(); startRingtone();
        if (callActive) {
            socket.emit('call-rejected', { to: data.from });
            return;
        }
        pendingCallFrom = data.from;
        pendingOffer = data.offer;
        document.getElementById('callerName').innerText = data.from;
        document.getElementById('incomingCallBar').classList.add('active');
        addNotification(t('incoming_call'), `${data.from} ${t('is_calling')}...`);
    });

    // -----------------------------------------------
    // CALL ACCEPTED – fixed to set remote description and play later
    // -----------------------------------------------
    socket.on('call-accepted', async (data) => {
        if (!peerConnection) {
            try {
                const config = await getCallConfig();
                peerConnection = createPeerConnection(config);
                setupPeerConnectionListeners(peerConnection, true);
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                console.log('🎤 Local tracks:', localStream.getTracks().map(t => t.kind));
                if (!localStream.getAudioTracks().length) {
                    showToast('⚠️ No microphone – call will be silent!');
                }
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = localStream;
                    localVideo.muted = true;
                    localVideo.play().catch(e => console.log('Local video play error:', e));
                }
                localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, localStream);
                });
            } catch (err) {
                showToast('Failed to create connection: ' + err.message);
                endCall();
                return;
            }
        }
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            console.log('✅ Remote description set');
            showToast('Call connected');
            // Do NOT play remote video here – ontrack will handle it
        } catch (error) {
            console.error('Set remote description error:', error);
            showToast('Call connection failed');
            endCall();
        }
    });

    socket.on('call-rejected', () => { stopRingtone(); showToast(t('call_rejected')); endCall(); });
    socket.on('end-call', () => { stopRingtone(); showToast(t('call_ended')); endCall(); });
    socket.on('ice-candidate', async (data) => {
        if (peerConnection && data.candidate) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log('ICE candidate added successfully');
            } catch (error) {
                console.error('Add ICE candidate error:', error);
            }
        }
    });

    socket.on('support-reply', (data) => { playNotificationSound(); addNotification(t('support_reply'), `Admin ${t('replied_ticket')} ${data.ticketId}: ${data.reply.substring(0,50)}...`, { type: 'support_ticket', ticketId: data.ticketId, reply: data.reply }); showToast(`📬 ${t('new_reply_support')} ${data.ticketId}`); });
    socket.on('support-resolved', (data) => { playNotificationSound(); addNotification(t('ticket_resolved'), `${t('your_ticket')} ${data.ticketId} ${t('resolved')}.`); showToast(`✅ ${t('ticket_resolved')} ${data.ticketId}.`); });
    socket.on('new-support-ticket', (data) => { if (currentUser.isAdmin) addNotification(t('new_support_ticket'), `${data.username}: ${data.subject}`); });
    socket.on('room-join-denied', (msg) => { alert(msg); });
    socket.on('sync-youtube', (data) => { if (currentRoom === data.room) { const iframe = document.getElementById('youtubeIframe'); iframe.src = `https://www.youtube.com/embed/${data.videoId}?enablejsapi=1`; showToast(`🎬 ${t('room_video_changed')} ${data.by || t('someone')}`); } });
    socket.on('room-member-added', (data) => { const { username, roomName } = data; if (roomName === currentRoom) loadRoomMembers(); if (username === currentUser.username) { showToast(`${t('you_were_added_to')} "${roomName}"!`); setTimeout(() => socket.emit('join-room', roomName), 500); } });
    socket.on('room-member-removed', (data) => { const { username, roomName } = data; if (roomName === currentRoom) { loadRoomMembers(); if (username === currentUser.username) { showToast(`${t('you_were_removed_from')} "${roomName}"`); leaveRoom(); } } });
    socket.on('room-moderator-updated', (data) => { if (currentRoom === data.room) { currentRoomModerators = data.moderators; loadRoomMembers(); refreshRoomMessagesModeratorStatus(); const modal = document.getElementById('roomSettingsModal'); if (modal.classList.contains('active')) showRoomSettings(); } });
    socket.on('friend-request-sent', (data) => { showToast(`${t('friend_request_sent_to')} ${data.to}`); });
    socket.on('friend-request-accepted', (data) => { showToast(`${data.from} ${t('accepted_friend_request')}!`); loadFriends(); loadFriendRequests(); });
    socket.on('friends-updated', () => { loadFriends(); loadFriendRequests(); });
    socket.on('member-action-success', (data) => { showToast(`${data.action} ${data.username} ${t('successful')}`); showRoomSettings(); loadRoomMembers(); });
    socket.on('boost-reset', (data) => { showToast(data.message); if (currentRoom) { const boostElement = document.getElementById('roomChatStats'); if (boostElement) { boostElement.innerHTML = boostElement.innerHTML.replace(/Boost: \d+/, `${t('boost')}: 0`); } } socket.emit('get-room-list'); });

    socket.on('user-typing', (data) => { if (currentRoom === data.room) { document.getElementById('roomTypingIndicator').textContent = `${data.username} is typing...`; } });
    socket.on('user-stop-typing', (data) => { if (currentRoom === data.room) { document.getElementById('roomTypingIndicator').textContent = ''; } });
    socket.on('private-user-typing', (data) => { if (currentPrivateChat === data.from) { document.getElementById('privateTypingIndicator').textContent = `${data.from} is typing...`; } });
    socket.on('private-user-stop-typing', (data) => { if (currentPrivateChat === data.from) { document.getElementById('privateTypingIndicator').textContent = ''; } });
}

// ==================== AUTO-LOGIN & STARTUP ====================
async function autoLogin() {
    const token = localStorage.getItem('chat_token');
    if (!token) return;
    const res = await fetch('/api/auto-login', { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    if (data.success) {
        currentUser = data.user;
        await checkAndUpdateVIPStatus();
        document.getElementById('currentUsername').innerHTML = currentUser.username;
        document.getElementById('coinBalance').innerHTML = `💰 ${currentUser.coins}`;
        updateProfilePic();
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainContainer').style.display = 'flex';
        initSocket();
        await refreshUserData();
        loadFriends(); loadFriendRequests(); loadGiftHistory();
        if (currentUser.isAdmin) { document.getElementById('adminSection').style.display = 'block'; const adminDiv = document.querySelector('#adminSection .admin-grid'); if (adminDiv && !adminDiv.classList.contains('admin-grid')) adminDiv.classList.add('admin-grid'); }
        showRooms();
        requestMicrophonePermission();
        restoreSession();
    } else localStorage.removeItem('chat_token');
}
function logout() { localStorage.removeItem('chat_token'); localStorage.removeItem('lastRoom'); localStorage.removeItem('lastPrivateChat'); localStorage.removeItem('lastView'); window.location.reload(); }

function showManualCoinRequestModal() { document.getElementById('manualCoinRequestModal').classList.add('active'); }
function closeManualCoinRequestModal() { document.getElementById('manualCoinRequestModal').classList.remove('active'); }
function showCoinHistoryModal() { document.getElementById('coinHistoryModal').classList.add('active'); }
function closeCoinHistoryModal() { document.getElementById('coinHistoryModal').classList.remove('active'); }
function toggleManualPaymentFields() {
    const method = document.getElementById('manualPaymentMethod').value;
    document.getElementById('giftCardFields').style.display = method === 'giftcard' ? 'block' : 'none';
    document.getElementById('cryptoFields').style.display = method === 'crypto' ? 'block' : 'none';
}
async function sendManualCoinRequest() {
    const amount = document.getElementById('manualCoinAmount').value;
    const method = document.getElementById('manualPaymentMethod').value;
    const giftCardNumber = document.getElementById('giftCardNumber').value;
    const cryptoId = document.getElementById('cryptoTransactionId').value;
    const file = document.getElementById('proofFile').files[0];
    if (!amount || amount < 100) return alert('Amount min 100');
    const fd = new FormData();
    fd.append('username', currentUser.username);
    fd.append('amount', amount);
    fd.append('paymentMethod', method);
    fd.append('giftCardNumber', giftCardNumber);
    fd.append('cryptoTransactionId', cryptoId);
    if (file) fd.append('proofFile', file);
    const res = await fetch('/api/manual-coin-request', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) alert('Request submitted! Admin will review.');
    else alert('Error');
    closeManualCoinRequestModal();
}
function purchaseCoins(coins, name, price, method) {
    alert(`⚠️ Payment demo. Use "Request Coins (Manual)" button.`);
}

const savedLang = localStorage.getItem('app_language');
detectLanguage();
if (savedLang && translations[savedLang]) setLanguage(savedLang);
else setLanguage(currentLanguage);
document.getElementById('languageSwitcher').addEventListener('change', (e) => setLanguage(e.target.value));

document.getElementById('targetLanguage').addEventListener('change', function(e) {
    targetLanguage = e.target.value;
    localStorage.setItem('targetLanguage', targetLanguage);
    showToast(`Target language set to: ${targetLanguage}`);
});

document.getElementById('autoTranslateMessages').addEventListener('change', function(e) {
    autoTranslateMessages = e.target.checked;
    localStorage.setItem('autoTranslateMessages', String(autoTranslateMessages));
    showToast(autoTranslateMessages ? 'Auto-translate enabled' : 'Auto-translate disabled');
});

window.addEventListener('focus', () => { if (currentUser) refreshUserData(); });
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser) {
        refreshUserData();
    }
});

autoLogin();
console.log('🔍 Chat app loaded');
console.log('📍 Origin:', window.location.origin);