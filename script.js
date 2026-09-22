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

let adminTicketsCache = {};

// ⭐ LUCKY GAMES — globals
let currentGame = 'coinflip';
let gameConfig = { minBet: 50, maxBet: 5000, bigWinThreshold: 10000 };

// ⭐ PRICING CONFIG (must match server.js)
const PRICING = {
    VIP_COST: 20000,
    CREATE_ROOM_COST: 9000,
    ALLOWED_BOOST_AMOUNTS: [1500, 6000, 54000]
};

// ⭐⭐⭐ PERFORMANCE CACHES ⭐⭐⭐
const profileCache = new Map();       // cache للبروفايل
const PROFILE_CACHE_TTL = 60000;      // 60 ثانية
const translateCache = new Map();     // cache للترجمات
const MAX_TRANSLATE_CACHE = 500;

// ==================== XIRSYS TURN CREDENTIALS ====================
let cachedTurnServers = null;
let turnCacheTime = 0;
const TURN_CACHE_TTL = 60 * 60 * 1000; // ساعة

async function getTurnCredentials() {
    // ⭐ استخدام الكاش لتسريع المكالمات
    if (cachedTurnServers && Date.now() - turnCacheTime < TURN_CACHE_TTL) {
        return cachedTurnServers;
    }
    try {
        const response = await fetch('/api/turn-credentials');
        const data = await response.json();
        if (data && data.iceServers) {
            cachedTurnServers = data.iceServers;
            turnCacheTime = Date.now();
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
        app_name: "Mokalmat Chat", rooms: "Rooms", friends: "Friends", gifts: "Gifts",
        login: "Login", register: "Register", username: "Username", password: "Password",
        send: "Send", join: "Join", create_room: "Create Room", room_name: "Room name",
        vip_room: "VIP Room", cancel: "Cancel", create: "Create",
        search_room: "Search room...", search_rooms: "Search rooms...", search_users: "Search users...", search: "Search",
        friend_requests: "Friend Requests", friends_list: "Friends", send_gift: "Send Gift",
        gift_history: "Gift History", type_message: "Type a message...", clear_all: "Clear",
        forgot_password: "Forgot Password?", reset_password: "Reset Password",
        get_question: "Next", new_password: "New Password", reset: "Reset",
        back: "Back", male: "Male", female: "Female", other: "Other",
        security_question: "Security Question", security_answer: "Answer",
        leave_room: "Leave Room", boost_room: "Boost Room", members: "members",
        boost: "Boost", online: "Online", offline: "Offline", room_settings: "Room Settings",
        ban_user: "Ban User", banned_list: "Banned Users List", upload_image: "Upload Image",
        upload: "Upload", message: "Message", joined: "joined", left: "left",
        boosted: "boosted", total_boost: "Total boost", coins: "coins", new_message: "New Message",
        sent_gift: "sent you", gift_received: "Gift Received", friend_request: "Friend Request",
        from: "from", admin_gave: "Admin gave you", removed_you: "removed you from friends",
        kicked_from: "You were kicked from", incoming_call: "Incoming Call", is_calling: "is calling",
        call_rejected: "Call rejected", support_reply: "Support Reply", replied_ticket: "replied to ticket",
        new_reply_support: "New reply from support for ticket", ticket_resolved: "Ticket Resolved",
        your_ticket: "Your ticket", resolved: "has been resolved", new_support_ticket: "New Support Ticket",
        call_ended: "Call ended by other user", room_video_changed: "Room video changed by",
        someone: "someone", you_were_added_to: "You were added to room",
        you_were_removed_from: "You were removed from room",
        friend_request_sent_to: "Friend request sent to",
        accepted_friend_request: "accepted your friend request",
        successful: "successful", members_only: "Members Only", no_rooms: "No rooms. Create one!",
        translation: "Translation", target_language: "Target Language",
        auto_translate: "Auto-translate all messages",
        translation_note: "Messages will be translated to your target language automatically.",
        notification_sounds: "Notification Sounds", enable_sounds: "Enable sound alerts",
        contact_support: "Contact Support", view_coin_history: "View Coin History",
        admin_panel: "Admin Panel", manage_users: "Manage Users", manage_rooms: "Manage Rooms",
        manage_gifts: "Manage Gifts", clear_friend_requests: "Clear Friend Requests",
        clear_coin_history: "Clear Coin History", boost_logs: "Boost Logs",
        pending_requests: "Pending Requests", support_tickets: "Support Tickets",
        give_coins: "Give Coins", send_coins: "Send Coins", reset_password_admin: "Reset Password",
        logout: "Logout", menu: "Menu", vip_status: "VIP Status", buy_vip: "Buy VIP Plan (20000 coins for 30 days)",
        buy_coins: "Buy Coins", card: "Card", crypto: "Crypto", request_coins: "Request Coins (Manual)",
        members_panel: "Members Panel", ban_kick: "Ban / Kick User", banned_list: "Banned Users List",
        add_member: "Add Member", member_list: "Member List", banned_users: "Banned Users",
        ban_kick_user: "Ban / Kick User", enter_username_ban: "Enter username to kick/ban from this room:",
        kick_ban: "Kick & Ban", mute: "Mute", video: "Video", end_call: "End Call",
        basic_boost: "1500 Coins - Basic", silver_boost: "6000 Coins - Silver", gold_boost: "54000 Coins - Gold",
        create_room_title: "Create Room (9000 coins)", vip_room_check: "VIP Room (gold theme + YouTube)",
        send_gift_title: "Send Gift in Room", request_coins_title: "Request Coins",
        gift_card: "Gift Card", gift_card_number: "Gift Card Number",
        send_usdt: "Send USDT (TRC20) to:", transaction_id: "Transaction ID", submit: "Submit",
        send_image: "Send Image", coin_history: "Coin History", reply_to_ticket: "Reply to Ticket",
        user_message: "User message:", your_reply: "Your reply...", send_reply: "Send Reply",
        ticket_id: "Ticket ID:", admin_reply: "Admin Reply:", close: "Close",
        ticket_reply: "Ticket Reply", describe_issue: "Describe your issue...",
        subject: "Subject", notifications: "Notifications", kick: "Kick", unban: "Unban",
        remove: "Remove", chat: "Chat", add_friend: "Add Friend", accept: "Accept",
        no_friends: "No friends yet. Search and add!", approve: "Approve", reject: "Reject",
        delete: "Delete", remove_mod: "Remove Mod", make_mod: "Make Mod",
        reply: "Reply", resolve: "Resolve", call: "Call", payout_history: "Payout History",
        games: "Games", lucky_games: "Lucky Games", bet_amount: "Bet Amount",
        play: "Play", win: "WIN", lose: "LOSE", game_history: "Recent Games",
        insufficient_coins: "Insufficient coins", min_bet: "Minimum bet",
        reset_instructions: "Enter your username, then answer your security question to reset your password.",
        security_info: "Set a security question for password reset",
        info_create_arabic: "Create Arabic ids is free",
        register_title: "Register", back_login: "Back to Login",
        select_gender: "Select Gender",
        search_users_placeholder: "Search users...",
        your_friends: "Your Friends", target: "Target",
        days_until_reset: "days until month reset",
        payout_history_title: "Payout History",
        gift_history_title: "Gift History",
        lucky_games_title: "Lucky Games",
        spin: "SPIN", spin_wheel: "SPIN WHEEL",
        select_user: "Select user...", amount_label: "Amount:",
        to_user: "To user:", message_optional: "Message (optional)",
        send_gift_btn: "Send Gift", members_count: "0 members",
        target_label: "Target", earned: "Earned",
        need_target_hint: "Login any 10 days this month to claim your payout",
        target_resets_hint: "Target resets on 1st of each month",
        milestone_hint: "50K=$25 · 100K=$50 · 150K=$75 · 200K=$100",
        no_gifts: "No gifts yet.", no_payouts: "No payouts yet",
        coinflip_info: "Pick Heads or Tails · 2× payout",
        dice_info: "Pick a number 1–6 · 5× payout",
        slot_info: "3-match = 10× · 2-match = 2×",
        wheel_info: "Spin for 0× / 0.5× / 1× / 2× / 5× / 10×",
        heads: "Heads", tails: "Tails",
        min_label: "Min", max_label: "Max",
        welcome: "Welcome",
        admin_payouts: "Payouts", game_logs: "Game Logs",
        mark_paid: "Mark Paid", no_games: "No games played yet",
        reply_btn: "Reply", resolve_btn: "Resolve",
        view_screenshot: "View Screenshot",
        subject_label: "Subject:", message_label: "Message:",
        from_label: "From:", ticket_label: "Ticket:",
        loading_tickets: "Loading tickets...",
        no_tickets: "No support tickets.",
        fill_required: "All fields required",
        request_submitted: "Request submitted! Admin will review.",
        amount_min_100: "Amount min 100",
        login_failed: "Login failed",
        registered_ok: "Registered! Please login.",
        password_reset_ok: "Password reset! You can now login.",
        incorrect_answer: "Incorrect security answer",
        vip_activated: "VIP activated!",
        user_exists: "Username exists",
        invalid_credentials: "Invalid credentials",
        not_enough_coins: "Not enough coins",
        need_20000_vip: "Need 20000 coins for VIP",
        need_9000_room: "Need 9000 coins to create room",
        room_exists: "Room exists",
        invalid_boost: "Invalid boost amount",
        microphone_needed: "Microphone access needed",
        connecting: "Connecting...",
        connected: "Connected", disconnected: "Disconnected",
        connection_lost: "Connection lost – reconnecting...",
        connected_server: "Connected to server",
        target_lang_set: "Target language set to",
        auto_translate_on: "Auto-translate enabled",
        auto_translate_off: "Auto-translate disabled",
        profile_updated: "Profile picture updated!",
        upload_failed: "Upload failed",
        online_status: "Online", offline_status: "Offline",
        loading: "Loading...", not_active: "Not active",
        active_until: "Active until", member_since: "Member since",
        answer: "Answer", decline: "Decline",
        create_room_btn: "Create Room (9000 coins)",
        youtube_placeholder: "Search YouTube or paste URL...",
        amount: "Amount", add: "Add",
        coinflip_tab: "Coin Flip", dice_tab: "Dice", slot_tab: "Slots", wheel_tab: "Wheel",
        heads_btn: "Heads", tails_btn: "Tails",
        spin_btn: "SPIN", spin_wheel_btn: "SPIN WHEEL",
        days: "days", total: "Total",
        no_requests: "No requests",
        no_users_found: "No users found",
        checking: "Checking...",
        resetting: "Resetting...",
        enter_username: "Enter username",
        select_amount: "Select amount",
        join_room_first: "Join a room first",
        network_error: "Network error",
        sending: "Sending...",
        ticket_submitted: "Ticket submitted!",
        network_error_msg: "Network error.",
        no_notifications: "No notifications",
        creating_invoice: "Creating crypto invoice...",
        popup_blocked: "Please allow pop-ups to complete payment",
        payment_confirmed: "Payment confirmed",
        payment_cancelled: "Payment cancelled",
        payment_error: "Payment error",
        verifying_payment: "Verifying payment...",
        delete_friend_confirm: "Remove",
        select_user_alert: "Select a user",
        select_amount_alert: "Select an amount",
        not_enough_coins_alert: "Not enough coins",
        active_rooms: "Active Rooms",
        no_active_rooms: "No active rooms right now",
        no_coin_history: "No coin history yet.",
        loading_history: "Loading...",
        my_private_code: "My Private Code",
        private_code_hint: "⚠️ Keep this code secret. It's only visible to you and the admin. Use it for account recovery.",
        copy_code: "Copy",
        admin_code_lookup: "Lookup User Code (Admin)",
        lookup_code: "Lookup Code",
        code_copied: "📋 Code copied!",
        code_not_ready: "Code not ready yet",
        copy_failed: "Copy failed",
        access_denied: "Access denied",
        user_not_found: "User not found",
        private_code_reveal_title: "🔑 YOUR PRIVATE CODE",
        private_code_reveal_warning: "⚠️ Save this code NOW! It's shown only once.\nOnly you and the admin can see it later from the side menu."
    },
    ar: {
        app_name: "موكلمات شات", rooms: "الغرف", friends: "الأصدقاء", gifts: "الهدايا",
        login: "تسجيل الدخول", register: "التسجيل", username: "اسم المستخدم", password: "كلمة المرور",
        send: "إرسال", join: "انضمام", create_room: "إنشاء غرفة", room_name: "اسم الغرفة",
        vip_room: "غرفة VIP", cancel: "إلغاء", create: "إنشاء",
        search_room: "ابحث عن غرفة...", search_rooms: "ابحث عن غرف...", search_users: "ابحث عن مستخدمين...", search: "بحث",
        friend_requests: "طلبات الصداقة", friends_list: "الأصدقاء", send_gift: "إرسال هدية",
        gift_history: "سجل الهدايا", type_message: "اكتب رسالة...", clear_all: "مسح الكل",
        forgot_password: "نسيت كلمة المرور؟", reset_password: "إعادة تعيين كلمة المرور",
        get_question: "التالي", new_password: "كلمة المرور الجديدة", reset: "إعادة تعيين",
        back: "رجوع", male: "ذكر", female: "أنثى", other: "أخرى",
        security_question: "سؤال الأمان", security_answer: "الإجابة",
        leave_room: "مغادرة الغرفة", boost_room: "تعزيز الغرفة", members: "الأعضاء",
        boost: "تعزيز", online: "متصل", offline: "غير متصل", room_settings: "إعدادات الغرفة",
        ban_user: "طرد مستخدم", banned_list: "قائمة المطرودين", upload_image: "رفع صورة",
        upload: "رفع", message: "رسالة", joined: "انضم", left: "غادر",
        boosted: "عزز بمبلغ", total_boost: "إجمالي التعزيز", coins: "عملة",
        new_message: "رسالة جديدة", sent_gift: "أرسل إليك", gift_received: "هدية مستلمة",
        friend_request: "طلب صداقة", from: "من", admin_gave: "المدير أعطاك",
        removed_you: "أزالك من الأصدقاء", kicked_from: "تم طردك من",
        incoming_call: "مكالمة واردة", is_calling: "يتصل بك", call_rejected: "تم رفض المكالمة",
        support_reply: "رد الدعم", replied_ticket: "رد على التذكرة",
        new_reply_support: "رد جديد من الدعم للتذكرة", ticket_resolved: "تم حل التذكرة",
        your_ticket: "تذكرتك", resolved: "تم حلها", new_support_ticket: "تذكرة دعم جديدة",
        call_ended: "أنهى الطرف الآخر المكالمة", room_video_changed: "تم تغيير الفيديو بواسطة",
        someone: "شخص ما", you_were_added_to: "تمت إضافتك إلى غرفة",
        you_were_removed_from: "تمت إزالتك من غرفة",
        friend_request_sent_to: "تم إرسال طلب صداقة إلى",
        accepted_friend_request: "قبل طلب صداقتك", successful: "ناجح",
        members_only: "الأعضاء فقط", no_rooms: "لا توجد غرف. أنشئ واحدة!",
        translation: "الترجمة", target_language: "اللغة المستهدفة",
        auto_translate: "ترجمة جميع الرسائل تلقائياً",
        translation_note: "سيتم ترجمة الرسائل إلى لغتك المستهدفة تلقائياً.",
        notification_sounds: "أصوات الإشعارات", enable_sounds: "تفعيل أصوات التنبيه",
        contact_support: "اتصل بالدعم", view_coin_history: "عرض سجل العملات",
        admin_panel: "لوحة التحكم", manage_users: "إدارة المستخدمين",
        manage_rooms: "إدارة الغرف", manage_gifts: "إدارة الهدايا",
        clear_friend_requests: "مسح طلبات الصداقة", clear_coin_history: "مسح سجل العملات",
        boost_logs: "سجل التعزيزات", pending_requests: "الطلبات المعلقة",
        support_tickets: "تذاكر الدعم", give_coins: "منح عملات", send_coins: "إرسال عملات",
        reset_password_admin: "إعادة تعيين كلمة المرور", logout: "تسجيل الخروج",
        menu: "القائمة", vip_status: "حالة VIP", buy_vip: "شراء باقة VIP (20000 عملة لمدة 30 يوم)",
        buy_coins: "شراء عملات", card: "بطاقة", crypto: "عملة رقمية",
        request_coins: "طلب عملات (يدوي)", members_panel: "لوحة الأعضاء",
        ban_kick: "طرد / منع مستخدم", banned_list: "قائمة المطرودين",
        add_member: "إضافة عضو", member_list: "قائمة الأعضاء",
        banned_users: "المستخدمون المطرودون", ban_kick_user: "طرد / منع مستخدم",
        enter_username_ban: "أدخل اسم المستخدم لطرده / منعه من هذه الغرفة:",
        kick_ban: "طرد ومنع", mute: "كتم", video: "فيديو", end_call: "إنهاء المكالمة",
        basic_boost: "1500 عملة - أساسي", silver_boost: "6000 عملة - فضي", gold_boost: "54000 عملة - ذهبي",
        create_room_title: "إنشاء غرفة (9000 عملة)", vip_room_check: "غرفة VIP (ثيم ذهبي + يوتيوب)",
        send_gift_title: "إرسال هدية في الغرفة", request_coins_title: "طلب عملات",
        gift_card: "بطاقة هدايا", gift_card_number: "رقم بطاقة الهدايا",
        send_usdt: "أرسل USDT (TRC20) إلى:", transaction_id: "رقم المعاملة",
        submit: "إرسال", send_image: "إرسال صورة", coin_history: "سجل العملات",
        reply_to_ticket: "رد على التذكرة", user_message: "رسالة المستخدم:",
        your_reply: "ردك...", send_reply: "إرسال الرد", ticket_id: "رقم التذكرة:",
        admin_reply: "رد المدير:", close: "إغلاق", ticket_reply: "رد التذكرة",
        describe_issue: "صف مشكلتك...", subject: "الموضوع", notifications: "الإشعارات",
        kick: "طرد", unban: "إلغاء الحظر", remove: "إزالة", chat: "محادثة",
        add_friend: "إضافة صديق", accept: "قبول", no_friends: "لا يوجد أصدقاء بعد. ابحث وأضف!",
        approve: "موافقة", reject: "رفض", delete: "حذف", remove_mod: "إزالة مشرف",
        make_mod: "تعيين مشرف", reply: "رد", resolve: "حل", call: "اتصال",
        payout_history: "سجل المدفوعات",
        games: "الألعاب", lucky_games: "ألعاب الحظ", bet_amount: "مبلغ الرهان",
        play: "العب", win: "فوز", lose: "خسارة", game_history: "الألعاب الأخيرة",
        insufficient_coins: "عملات غير كافية", min_bet: "الحد الأدنى للرهان",
        reset_instructions: "أدخل اسم المستخدم، ثم أجب على سؤال الأمان لإعادة تعيين كلمة المرور.",
        security_info: "قم بتعيين سؤال أمان لإعادة تعيين كلمة المرور",
        info_create_arabic: "إنشاء معرفات عربية مجاني",
        register_title: "التسجيل", back_login: "العودة لتسجيل الدخول",
        select_gender: "اختر الجنس",
        search_users_placeholder: "ابحث عن مستخدمين...",
        your_friends: "أصدقاؤك", target: "الهدف",
        days_until_reset: "يوم حتى إعادة تعيين الشهر",
        payout_history_title: "سجل المدفوعات",
        gift_history_title: "سجل الهدايا",
        lucky_games_title: "ألعاب الحظ",
        spin: "لف", spin_wheel: "لف العجلة",
        select_user: "اختر مستخدم...", amount_label: "المبلغ:",
        to_user: "إلى مستخدم:", message_optional: "رسالة (اختياري)",
        send_gift_btn: "إرسال هدية", members_count: "0 عضو",
        target_label: "الهدف", earned: "الأرباح",
        need_target_hint: "سجل دخولك أي 10 أيام هذا الشهر لتحصل على أرباحك",
        target_resets_hint: "يتم إعادة تعيين الهدف في الأول من كل شهر",
        milestone_hint: "50 ألف=25$ · 100 ألف=50$ · 150 ألف=75$ · 200 ألف=100$",
        no_gifts: "لا توجد هدايا بعد.", no_payouts: "لا توجد مدفوعات بعد",
        coinflip_info: "اختر صورة أو كتابة · ربح 2×",
        dice_info: "اختر رقم من 1 إلى 6 · ربح 5×",
        slot_info: "3 متطابقة = 10× · 2 متطابقة = 2×",
        wheel_info: "لف العجلة للربح 0× / 0.5× / 1× / 2× / 5× / 10×",
        heads: "صورة", tails: "كتابة",
        min_label: "الحد الأدنى", max_label: "الحد الأقصى",
        welcome: "أهلاً",
        admin_payouts: "المدفوعات", game_logs: "سجل الألعاب",
        mark_paid: "تحديد كمدفوع", no_games: "لم يتم لعب أي ألعاب بعد",
        reply_btn: "رد", resolve_btn: "حل",
        view_screenshot: "عرض لقطة الشاشة",
        subject_label: "الموضوع:", message_label: "الرسالة:",
        from_label: "من:", ticket_label: "التذكرة:",
        loading_tickets: "جاري تحميل التذاكر...",
        no_tickets: "لا توجد تذاكر دعم.",
        fill_required: "جميع الحقول مطلوبة",
        request_submitted: "تم تقديم الطلب! سيراجعه المدير.",
        amount_min_100: "الحد الأدنى للمبلغ 100",
        login_failed: "فشل تسجيل الدخول",
        registered_ok: "تم التسجيل! يرجى تسجيل الدخول.",
        password_reset_ok: "تم إعادة تعيين كلمة المرور! يمكنك تسجيل الدخول الآن.",
        incorrect_answer: "إجابة سؤال الأمان غير صحيحة",
        vip_activated: "تم تفعيل VIP!",
        user_exists: "اسم المستخدم موجود بالفعل",
        invalid_credentials: "بيانات الاعتماد غير صحيحة",
        not_enough_coins: "عملات غير كافية",
        need_20000_vip: "تحتاج 20000 عملة لـ VIP",
        need_9000_room: "تحتاج 9000 عملة لإنشاء غرفة",
        room_exists: "الغرفة موجودة بالفعل",
        invalid_boost: "مبلغ تعزيز غير صالح",
        microphone_needed: "مطلوب الوصول إلى الميكروفون",
        connecting: "جاري الاتصال...",
        connected: "متصل", disconnected: "غير متصل",
        connection_lost: "انقطع الاتصال – جاري إعادة الاتصال...",
        connected_server: "تم الاتصال بالخادم",
        target_lang_set: "تم تعيين اللغة المستهدفة إلى",
        auto_translate_on: "تم تفعيل الترجمة التلقائية",
        auto_translate_off: "تم تعطيل الترجمة التلقائية",
        profile_updated: "تم تحديث صورة الملف الشخصي!",
        upload_failed: "فشل الرفع",
        online_status: "متصل", offline_status: "غير متصل",
        loading: "جاري التحميل...", not_active: "غير نشط",
        active_until: "نشط حتى", member_since: "عضو منذ",
        answer: "رد", decline: "رفض",
        create_room_btn: "إنشاء غرفة (9000 عملة)",
        youtube_placeholder: "ابحث في يوتيوب أو الصق الرابط...",
        amount: "المبلغ", add: "إضافة",
        coinflip_tab: "صورة أو كتابة", dice_tab: "نرد", slot_tab: "ماكينة الحظ", wheel_tab: "عجلة الحظ",
        heads_btn: "صورة", tails_btn: "كتابة",
        spin_btn: "لف", spin_wheel_btn: "لف العجلة",
        days: "أيام", total: "المجموع",
        no_requests: "لا توجد طلبات",
        no_users_found: "لم يتم العثور على مستخدمين",
        checking: "جاري التحقق...",
        resetting: "جاري إعادة التعيين...",
        enter_username: "أدخل اسم المستخدم",
        select_amount: "اختر مبلغ",
        join_room_first: "انضم إلى غرفة أولاً",
        network_error: "خطأ في الشبكة",
        sending: "جاري الإرسال...",
        ticket_submitted: "تم تقديم التذكرة!",
        network_error_msg: "خطأ في الشبكة.",
        no_notifications: "لا توجد إشعارات",
        creating_invoice: "جاري إنشاء فاتورة العملة الرقمية...",
        popup_blocked: "يرجى السماح بالنوافذ المنبثقة لإتمام الدفع",
        payment_confirmed: "تم تأكيد الدفع",
        payment_cancelled: "تم إلغاء الدفع",
        payment_error: "خطأ في الدفع",
        verifying_payment: "جاري التحقق من الدفع...",
        delete_friend_confirm: "إزالة",
        select_user_alert: "اختر مستخدم",
        select_amount_alert: "اختر مبلغ",
        not_enough_coins_alert: "عملات غير كافية",
        active_rooms: "الغرف النشطة",
        no_active_rooms: "لا توجد غرف نشطة حالياً",
        no_coin_history: "لا يوجد سجل عملات بعد.",
        loading_history: "جاري التحميل...",
        my_private_code: "الرمز الخاص بي",
        private_code_hint: "⚠️ احفظ هذا الرمز سرياً. أنت والمدير فقط يمكنكما رؤيته.",
        copy_code: "نسخ",
        admin_code_lookup: "بحث عن رمز مستخدم (مدير)",
        lookup_code: "بحث عن الرمز",
        code_copied: "📋 تم نسخ الرمز!",
        code_not_ready: "الرمز غير جاهز بعد",
        copy_failed: "فشل النسخ",
        access_denied: "الوصول مرفوض",
        user_not_found: "المستخدم غير موجود",
        private_code_reveal_title: "🔑 رمزك الخاص",
        private_code_reveal_warning: "⚠️ احفظ هذا الرمز الآن! يُعرض مرة واحدة فقط.\nأنت والمدير فقط يمكنكما رؤيته لاحقاً من القائمة الجانبية."
    }
};

function t(key) { return translations[currentLanguage]?.[key] || key; }

// Emoji regex
const EMOJI_REGEX = /^[\u{1F000}-\u{1FFFF}\u2600-\u27BF\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}\u2B00-\u2BFF\uFE0F\u200D]+/u;

function stripLeadingEmoji(str) {
    return String(str || '').replace(EMOJI_REGEX, '').trim();
}
function getLeadingEmoji(str) {
    const m = String(str || '').match(EMOJI_REGEX);
    return m ? m[0] : '';
}

// ⭐ applyLanguage — محسّن بدون forced reflow
function applyLanguage() {
    const isRTL = currentLanguage === 'ar';
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    document.documentElement.lang = currentLanguage;

    const elements = document.querySelectorAll('[data-i18n]');
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const key = el.getAttribute('data-i18n');
        const translation = translations[currentLanguage]?.[key];
        if (!translation) continue;

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            if (el.placeholder !== undefined) el.placeholder = translation;
        } else if (el.tagName === 'OPTION') {
            const original = el.textContent || '';
            const htmlEmoji = getLeadingEmoji(original);
            const cleanTranslation = stripLeadingEmoji(translation);
            el.textContent = htmlEmoji ? (htmlEmoji + ' ' + cleanTranslation) : translation;
        } else {
            const original = el.innerText || '';
            const htmlEmoji = getLeadingEmoji(original);
            const cleanTranslation = stripLeadingEmoji(translation);
            el.innerText = htmlEmoji ? (htmlEmoji + ' ' + cleanTranslation) : (cleanTranslation || translation);
        }
    }

    updateDynamicContent();
    refreshAllDynamicViews();
}

function refreshAllDynamicViews() {
    if (!currentUser) return;
    if (allRooms.length) displayRooms(allRooms);
    const activeView = document.querySelector('.nav-item.active');
    if (!activeView) return;
    const idx = Array.from(document.querySelectorAll('.nav-item')).indexOf(activeView);
    if (idx === 1) { loadFriends(); loadFriendRequests(); }
    else if (idx === 2) { loadGiftHistory(); loadTargetInfo(); loadPayoutHistory(); }
    else if (idx === 3) { loadGameHistory(); }
    if (currentRoom) loadRoomMembers();
    updateVIPButtonText();
}

function setLanguage(lang) {
    if (translations[lang]) {
        currentLanguage = lang;
        applyLanguage();
        localStorage.setItem('app_language', lang);
    }
}

function updateDynamicContent() {
    const vipDisplay = document.getElementById('vipStatusDisplay');
    if (vipDisplay) {
        const currentText = vipDisplay.innerText;
        if (currentText.includes('Active until') || currentText.includes('نشط حتى')) {
            const dateMatch = currentText.match(/(?:Active until|نشط حتى)\s*(.+)/);
            if (dateMatch) vipDisplay.innerText = `💎 ${t('vip_status')}: ${t('active_until')} ${dateMatch[1]}`;
        } else if (currentText.includes('Not active') || currentText.includes('غير نشط')) {
            vipDisplay.innerText = `❌ ${t('vip_status')}: ${t('not_active')}`;
        }
    }
    updateVIPButtonText();
}

function updateVIPButtonText() {
    const buyBtn = document.querySelector('.buy-vip-btn');
    if (buyBtn) {
        const isVIP = currentUser && currentUser.isVIP === true;
        if (isVIP) buyBtn.style.display = 'none';
        else {
            buyBtn.style.display = 'block';
            buyBtn.innerHTML = `💎 ${t('buy_vip')}`;
        }
    }
}

// ==================== DETECT TEXT LANGUAGE ====================
function detectTextLanguage(text) {
    if (!text) return 'en';
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    if (arabicRegex.test(text)) return 'ar';
    if (/[a-zA-Z]/.test(text)) return 'en';
    return 'unknown';
}

// ==================== ⭐ TRANSLATION — WITH CACHE + TIMEOUT ⭐ ====================
async function translateText(text, targetLang) {
    if (!text || targetLang === 'en' || !autoTranslateMessages) return text;
    if (text.length < 2) return text;

    const detected = detectTextLanguage(text);
    if (detected === targetLang) return text;

    // ⭐ Cache hit
    const cacheKey = `${targetLang}:${text}`;
    const cached = translateCache.get(cacheKey);
    if (cached) return cached;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`,
            { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        const data = await response.json();
        let result = text;
        if (data && data[0] && data[0][0] && data[0][0][0]) result = data[0][0][0];

        // ⭐ حفظ في الكاش
        translateCache.set(cacheKey, result);
        if (translateCache.size > MAX_TRANSLATE_CACHE) {
            // حذف أقدم عنصر
            const firstKey = translateCache.keys().next().value;
            translateCache.delete(firstKey);
        }
        return result;
    } catch (err) {
        if (err.name !== 'AbortError') console.error('Translation error:', err);
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
    } catch(e) {}
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
    showToast(`${title}: ${message}`);
}

async function loadPendingNotifications() {
    if (!currentUser || !currentUser.username) return;
    try {
        const res = await fetch(`/api/notifications/pending?username=${encodeURIComponent(currentUser.username)}`);
        const data = await res.json();

        if (!data.success || !Array.isArray(data.notifications) || !data.notifications.length) return;

        for (const notif of data.notifications) {
            notifications.unshift({
                title: notif.title,
                message: notif.message,
                time: new Date(notif.createdAt).toLocaleTimeString(),
                onClickData: notif.type === 'support_reply'
                    ? { type: 'support_ticket', ticketId: notif.data?.ticketId, reply: notif.data?.reply }
                    : null
            });
            showToast(`📬 ${notif.title}: ${notif.message}`);
        }

        if (notifications.length > 30) notifications = notifications.slice(0, 30);

        updateNotificationUI();
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            badge.style.display = 'flex';
            badge.innerText = notifications.length;
        }

        const ids = data.notifications.map(n => n._id);
        fetch('/api/notifications/mark-read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser.username, ids })
        }).catch(() => {});
    } catch (err) {
        console.error('loadPendingNotifications error:', err);
    }
}

function togglePasswordVisibility(inputId, toggleElement) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        toggleElement.textContent = '🙈';
    } else {
        input.type = 'password';
        toggleElement.textContent = '👁️';
    }
}

function clearAllNotifications() {
    notifications = [];
    updateNotificationUI();
    document.getElementById('notificationBadge').style.display = 'none';
}

function updateNotificationUI() {
    const container = document.getElementById('notificationsList');
    if (!container) return;
    if (!notifications.length) {
        container.innerHTML = `<div style="padding:15px;text-align:center;color:#999;">${t('no_notifications') || 'No notifications'}</div>`;
    } else {
        container.innerHTML = notifications.map((n, idx) =>
            `<div class="notification-item" onclick="handleNotificationClick(${idx})"><strong>${escapeHtml(n.title)}</strong><br>${escapeHtml(n.message)}<br><div class="time">${n.time}</div></div>`
        ).join('');
    }
}

function handleNotificationClick(idx) {
    const n = notifications[idx];
    if (!n) return;
    if (n?.onClickData?.type === 'private_message' && currentPrivateChat !== n.onClickData.from) showPrivateChat(n.onClickData.from);
    else if (n?.onClickData?.type === 'support_ticket') openViewTicketModal(n.onClickData.ticketId, n.onClickData.reply);
    toggleNotifications();
}

function toggleNotifications() {
    document.getElementById('notificationDropdown').classList.toggle('active');
}

// ==================== HELPER FUNCTIONS ====================
function normalizeUsername(u) { return (u || '').toLowerCase(); }

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m =>
        m === '&' ? '&amp;' :
        m === '<' ? '&lt;' :
        m === '>' ? '&gt;' :
        m === '"' ? '&quot;' : '&#39;'
    );
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

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
    if (lastRoom && socket && socket.connected) setTimeout(() => socket.emit('join-room', lastRoom), 300);
    else if (lastPrivate && socket && socket.connected) showPrivateChat(lastPrivate);
}

// ⭐ refreshUserData — with dedup guard + cache-friendly
let lastRefreshTime = 0;
let refreshUserDataTimeout = null;

async function refreshUserData(force = false) {
    if (!currentUser || !currentUser.username) return;

    // ⭐ Skip if refreshed < 1s ago (handles focus+visibility double-fire)
    if (!force && Date.now() - lastRefreshTime < 1000) return;

    if (!force) {
        if (refreshUserDataTimeout) clearTimeout(refreshUserDataTimeout);
        return new Promise(resolve => {
            refreshUserDataTimeout = setTimeout(async () => {
                await refreshUserData(true);
                resolve();
            }, 300);
        });
    }

    lastRefreshTime = Date.now();
    try {
        const res = await fetch(`/api/user-profile?username=${currentUser.username}`);
        const data = await res.json();
        if (data.success) {
            currentUser.profile_pic = data.profile_pic;
            currentUser.coins = data.coins;
            currentUser.isAdmin = data.isAdmin;
            currentUser.isVIP = data.isVIP;
            const coinEl = document.getElementById('coinBalance');
            if (coinEl) coinEl.innerHTML = `💰 ${currentUser.coins}`;
            updateProfilePic();
            updateVipBadge();
            updateGamesBalance();
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
    } catch (err) { return false; }
}

function canCreateVipRoom() { return currentUser && currentUser.isVIP === true; }

function showCreateRoomModal() {
    const vipOpt = document.getElementById('vipRoomOption');
    if (!vipOpt) return;
    if (canCreateVipRoom()) vipOpt.style.display = 'block';
    else {
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

function closeCreateRoomModal() {
    document.getElementById('createRoomModal').classList.remove('active');
}

// ==================== AUTHENTICATION ====================
async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
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
        await refreshUserData(true);
        await checkAndUpdateVIPStatus();
        setLanguage(currentLanguage);
        loadFriends(); loadFriendRequests(); loadGiftHistory();
        if (currentUser.isAdmin) {
            document.getElementById('adminSection').style.display = 'block';
            document.getElementById('adminCodeLookupSection').style.display = 'block';
        }
        showRooms();
        requestMicrophonePermission();
        restoreSession();

        setTimeout(() => loadPendingNotifications(), 1500);
        setTimeout(() => loadPrivateCode(), 1200);

        if (data.streakInfo) {
            if (data.streakInfo.payoutCreated && data.streakInfo.payoutInfo) {
                setTimeout(() => {
                    alert(`🎉 مبروك! أكملت 10 أيام دخول هذا الشهر!\n💰 مكافأتك: $${data.streakInfo.payoutInfo.dollars}`);
                }, 800);
            } else if (data.streakInfo.targetNotReached) {
                setTimeout(() => {
                    alert(`⚠️ أكملت 10 أيام! لكن ينقصك تارجت للـ Payout.\nالتارجت الحالي: ${data.streakInfo.currentTarget.toLocaleString()}`);
                }, 800);
            } else if (data.streakInfo.streak) {
                showToast(`🔥 Day ${data.streakInfo.streak}/10 this month`);
            }
        }
    } else alert('Login failed');
}

async function register() {
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    const gender = document.getElementById('regGender').value;
    const securityQuestion = document.getElementById('regSecurityQuestion').value;
    const securityAnswer = document.getElementById('regSecurityAnswer').value;

    if (!username || !password || !securityQuestion || !securityAnswer) {
        return alert(t('fill_required') || 'All fields required');
    }

    const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, gender, securityQuestion, securityAnswer })
    });
    const data = await res.json();
    if (data.success) {
        if (data.privateCode) {
            alert(`${t('private_code_reveal_title')}\n\n${data.privateCode}\n\n${t('private_code_reveal_warning')}`);
        } else {
            alert(t('registered_ok') || 'Registered! Please login.');
        }
        showLogin();
    } else alert('Registration failed: ' + data.error);
}

function showLogin() {
    document.getElementById('registerScreen').style.display = 'none';
    document.getElementById('forgotScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
}
function showRegister() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('registerScreen').style.display = 'flex';
}
function showForgotPassword() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('forgotScreen').style.display = 'flex';
}

async function getSecurityQuestion() {
    const username = document.getElementById('resetUsername').value.trim();
    if (!username) return alert(t('enter_username') || 'Enter username');
    const statusDiv = document.getElementById('resetStatus');
    statusDiv.innerHTML = '⏳ ' + (t('checking') || 'Checking...');
    try {
        const res = await fetch('/api/get-security-question', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('questionText').innerText = data.question;
            document.getElementById('securityQuestionDiv').style.display = 'block';
            statusDiv.innerHTML = '';
        } else {
            statusDiv.innerHTML = '❌ ' + (data.error || 'User not found');
        }
    } catch (err) {
        statusDiv.innerHTML = '❌ ' + err.message;
    }
}

async function resetPassword() {
    const username = document.getElementById('resetUsername').value.trim();
    const answer = document.getElementById('resetAnswer').value.trim();
    const newPassword = document.getElementById('newPassword').value.trim();
    if (!username || !answer || !newPassword) return alert(t('fill_required') || 'Please fill all fields.');
    const statusDiv = document.getElementById('resetStatus');
    statusDiv.innerHTML = '⏳ ' + (t('resetting') || 'Resetting...');
    try {
        const res = await fetch('/api/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, answer, newPassword })
        });
        const data = await res.json();
        if (data.success) {
            statusDiv.innerHTML = '✅ ' + (t('password_reset_ok') || 'Password reset!');
            setTimeout(() => showLogin(), 2000);
        } else {
            statusDiv.innerHTML = '❌ ' + (data.error || 'Reset failed');
        }
    } catch (err) {
        statusDiv.innerHTML = '❌ ' + err.message;
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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
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
                    await refreshUserData(true);
                    showToast(t('profile_updated') || 'Profile picture updated!');
                } else {
                    alert((t('upload_failed') || 'Upload failed') + ': ' + (data.error || 'Unknown error'));
                }
            } catch (err) {
                alert('Upload error: ' + err.message);
            }
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

// ==================== PRIVATE CODE ====================
async function loadPrivateCode() {
    if (!currentUser) return;
    try {
        const res = await fetch(
            `/api/get-private-code?username=${encodeURIComponent(currentUser.username)}&requester=${encodeURIComponent(currentUser.username)}`
        );
        const data = await res.json();
        const el = document.getElementById('myPrivateCodeDisplay');
        if (data.success && el) {
            el.innerText = data.privateCode;
            el.dataset.code = data.privateCode;
        } else if (el) {
            el.innerText = 'Unavailable';
        }
    } catch (e) { console.error('loadPrivateCode error:', e); }
}

function copyPrivateCode() {
    const el = document.getElementById('myPrivateCodeDisplay');
    const code = el?.dataset?.code || el?.innerText;
    if (!code || code.includes('—') || code === 'Unavailable') {
        showToast(t('code_not_ready') || 'Code not ready yet');
        return;
    }
    navigator.clipboard.writeText(code).then(
        () => showToast(t('code_copied') || '📋 Code copied!'),
        () => showToast(t('copy_failed') || 'Copy failed')
    );
}

async function adminLookupPrivateCode() {
    if (!currentUser || !currentUser.isAdmin) return;
    const username = document.getElementById('adminCodeLookupUsername').value.trim();
    if (!username) return showToast('Enter username');
    try {
        const res = await fetch(
            `/api/get-private-code?username=${encodeURIComponent(username)}&requester=${encodeURIComponent(currentUser.username)}`
        );
        const data = await res.json();
        const el = document.getElementById('adminCodeLookupResult');
        if (data.success) {
            el.innerHTML = `<b>${escapeHtml(username)}</b>: <code>${escapeHtml(data.privateCode)}</code>
                <button class="copy-code-btn" onclick="navigator.clipboard.writeText('${data.privateCode}'); showToast('📋 Copied')">📋</button>`;
        } else {
            el.innerHTML = `❌ ${escapeHtml(data.error || 'Not found')}`;
        }
    } catch (e) { showToast('Network error'); }
}

// ==================== VIEWS ====================
function showRooms() {
    closeRoomMenu();
    document.getElementById('roomsView').style.display = 'flex';
    document.getElementById('friendsView').classList.remove('active');
    document.getElementById('giftsView').classList.remove('active');
    document.getElementById('gamesView').classList.remove('active');
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
    document.getElementById('gamesView').classList.remove('active');
    document.querySelectorAll('.chat-view').forEach(v => v.classList.remove('active'));
    document.getElementById('mainHeader').classList.remove('hidden');
    document.getElementById('bottomNav').classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.nav-item')[1].classList.add('active');
    loadFriends(); loadFriendRequests();
    const friendsList = document.getElementById('friendsList');
    if (friendsList) friendsList.scrollTop = 0;
    saveSessionState();
}

function showGifts() {
    closeRoomMenu();
    document.getElementById('roomsView').style.display = 'none';
    document.getElementById('friendsView').classList.remove('active');
    document.getElementById('giftsView').classList.add('active');
    document.getElementById('gamesView').classList.remove('active');
    document.querySelectorAll('.chat-view').forEach(v => v.classList.remove('active'));
    document.getElementById('mainHeader').classList.remove('hidden');
    document.getElementById('bottomNav').classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.nav-item')[2].classList.add('active');
    loadGiftHistory();
    loadTargetInfo();
    loadPayoutHistory();
    saveSessionState();
}

function showGames() {
    closeRoomMenu();
    document.getElementById('roomsView').style.display = 'none';
    document.getElementById('friendsView').classList.remove('active');
    document.getElementById('giftsView').classList.remove('active');
    document.getElementById('gamesView').classList.add('active');
    document.querySelectorAll('.chat-view').forEach(v => v.classList.remove('active'));
    document.getElementById('mainHeader').classList.remove('hidden');
    document.getElementById('bottomNav').classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const nav = document.querySelectorAll('.nav-item');
    if (nav[3]) nav[3].classList.add('active');
    loadGameConfig();
    loadGameHistory();
    updateGamesBalance();
    saveSessionState();
}

function showRoomChat() {
    document.getElementById('roomsView').style.display = 'none';
    document.getElementById('friendsView').classList.remove('active');
    document.getElementById('giftsView').classList.remove('active');
    document.getElementById('gamesView').classList.remove('active');
    document.getElementById('roomChatView').classList.add('active');
    document.getElementById('mainHeader').classList.add('hidden');
    document.getElementById('bottomNav').classList.add('hidden');
    saveSessionState();
}

function showPrivateChat(username) {
    currentPrivateChat = username;
    document.getElementById('privateChatName').innerHTML = username;
    updatePrivateStatus();
    document.getElementById('privateMessages').innerHTML = '';
    document.getElementById('roomsView').style.display = 'none';
    document.getElementById('friendsView').classList.remove('active');
    document.getElementById('giftsView').classList.remove('active');
    document.getElementById('gamesView').classList.remove('active');
    document.getElementById('roomChatView').classList.remove('active');
    document.getElementById('privateChatView').classList.add('active');
    document.getElementById('mainHeader').classList.add('hidden');
    document.getElementById('bottomNav').classList.add('hidden');
    saveSessionState();
    updatePrivateStatus();
}

function closePrivateChat() {
    if (callActive) endCall();
    currentPrivateChat = null;
    showFriends();
    saveSessionState();
}

function leaveRoom() {
    closeRoomMenu();
    if (currentRoom) { socket.emit('leave-room'); currentRoom = null; }
    showRooms();
    saveSessionState();
}

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

// ⭐ interval أقل = I/O أقل
setInterval(() => { if (currentPrivateChat) updatePrivateStatus(); }, 8000);

// ==================== ACTIVE ROOMS ====================
function renderActiveRooms(rooms) {
    const container = document.getElementById('activeRoomsList');
    const countEl = document.getElementById('activeRoomsCount');
    if (!container || !countEl) return;

    const active = (rooms || []).filter(r => r.members > 0).sort((a, b) => b.members - a.members);
    countEl.textContent = active.length;

    if (!active.length) {
        container.innerHTML = `<span class="active-rooms-empty">${t('no_active_rooms') || 'No active rooms right now'}</span>`;
        return;
    }

    container.innerHTML = active.map(r => {
        const vipClass = r.isVipRoom ? 'vip-chip' : '';
        const vipTag = r.isVipRoom ? '💎 ' : '';
        return `<div class="active-room-chip ${vipClass}" onclick="joinRoom('${escapeHtml(r.name)}')">
            <span class="chip-dot"></span>
            <span>${vipTag}#${escapeHtml(r.name)}</span>
            <span class="chip-members">👥 ${r.members}</span>
        </div>`;
    }).join('');
}

function displayRooms(rooms) {
    const container = document.getElementById('roomsList');
    if (!rooms.length) {
        container.innerHTML = `<div style="text-align:center;padding:40px;">${t('no_rooms')}</div>`;
    } else {
        const sorted = [...rooms].sort((a, b) => b.boostLevel - a.boostLevel);
        const parts = [];
        sorted.forEach((room, i) => {
            const isTop = i === 0 && room.boostLevel > 0;
            const vipTag = room.isVipRoom ? ' 💎' : '';
            const membersOnlyTag = room.membersOnly ? ` <span class="members-only-badge">🔒 ${t('members_only')}</span>` : '';
            const nameClass = room.isVipRoom ? 'vip-room-name' : '';
            parts.push(`<div class="room-card ${isTop ? 'boosted' : ''}"><div class="room-card-info"><h4 class="${nameClass}">#${escapeHtml(room.name)}${vipTag}${membersOnlyTag} ${room.boostLevel > 0 ? '🚀' : ''}</h4><p>👥 ${room.members} ${t('members')} | 🚀 ${t('boost')}: ${room.boostLevel}</p></div><button class="join-btn" onclick="joinRoom('${escapeHtml(room.name)}')">${t('join')}</button></div>`);
        });
        container.innerHTML = parts.join('');
    }
    renderActiveRooms(rooms);
}

function filterRooms() {
    const q = document.getElementById('roomSearch').value.toLowerCase();
    displayRooms(allRooms.filter(r => r.name.toLowerCase().includes(q)));
}

function joinRoom(name) {
    socket.emit('join-room', name);
    saveSessionState();
}

// ==================== SEND MESSAGES ====================
function sendRoomMessage() {
    const input = document.getElementById('roomMessageInput');
    const msg = input.value.trim();
    if (msg && currentRoom) {
        socket.emit('room-message', {
            username: currentUser.username,
            message: msg,
            room: currentRoom,
            type: 'text'
        });
        input.value = '';
    }
}

function sendPrivateMessage() {
    if (!currentPrivateChat) return;
    const input = document.getElementById('privateMessageInput');
    const msg = input.value.trim();
    if (msg) {
        socket.emit('private-message', {
            from: currentUser.username,
            to: currentPrivateChat,
            message: msg
        });
        input.value = '';
    }
}

// ==================== MESSAGE DISPLAY WITH LAZY TRANSLATION ====================
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
        content = escapeHtml(msg.message).replace(/\n/g, '<br>');
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

    // ⭐ ترجمة في الخلفية بدون تعليق
    if (msg.type !== 'image' && msg.type !== 'audio' && autoTranslateMessages && targetLanguage !== 'en') {
        const msgText = div.querySelector('.message-text');
        if (!msgText) return;
        const detected = detectTextLanguage(msg.message);
        if (detected !== targetLanguage && detected !== 'unknown') {
            translateText(msg.message, targetLanguage).then(translatedText => {
                if (translatedText && translatedText !== msg.message) {
                    msgText.innerHTML = `${escapeHtml(translatedText)}<br><span style="font-size:10px;opacity:0.6;">🔁 ${escapeHtml(msg.message)}</span>`.replace(/\n/g, '<br>');
                }
            }).catch(() => {});
        }
    }
}

function addRoomMessage(msg) {
    translateAndDisplayMessage(msg, 'roomMessages', msg.username === currentUser.username);
}
function addPrivateMessage(msg) {
    translateAndDisplayMessage(msg, 'privateMessages', msg.from === currentUser.username);
}

function openLightbox(src) {
    document.getElementById('lightboxImg').src = src;
    document.getElementById('imageLightbox').classList.add('active');
}
function closeLightbox() {
    document.getElementById('imageLightbox').classList.remove('active');
}

// ==================== VOICE RECORDING ====================
async function startRecording(target) {
    if (isRecording) stopRecording();
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const fd = new FormData();
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
    } catch(e) { alert(t('microphone_needed') || 'Microphone access needed'); }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        const btn = recTarget === 'room' ? document.getElementById('roomVoiceBtn') : document.getElementById('privateVoiceBtn');
        if (btn) btn.classList.remove('recording');
    }
}
function toggleRoomRecording() {
    if (isRecording && recTarget === 'room') stopRecording();
    else startRecording('room');
}
function togglePrivateRecording() {
    if (isRecording && recTarget === 'private') stopRecording();
    else startRecording('private');
}

// ==================== IMAGE SHARING ====================
function sendRoomImage() { currentImageTarget = 'room'; document.getElementById('imageModal').classList.add('active'); }
function sendPrivateImage() { currentImageTarget = 'private'; document.getElementById('imageModal').classList.add('active'); }
function closeImageModal() { document.getElementById('imageModal').classList.remove('active'); }

async function uploadImage() {
    const file = document.getElementById('imageFile').files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('roomImage', file);
    const res = await fetch('/api/upload-room-image', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
        if (currentImageTarget === 'room' && currentRoom) socket.emit('room-message', { username: currentUser.username, message: data.imageUrl, room: currentRoom, type: 'image' });
        else if (currentImageTarget === 'private' && currentPrivateChat) socket.emit('private-message', { from: currentUser.username, to: currentPrivateChat, message: data.imageUrl, type: 'image' });
        closeImageModal();
        document.getElementById('imageFile').value = '';
    }
}

// ==================== GIFTS & COINS ====================
async function loadGiftHistory() {
    const res = await fetch('/api/get-gifts');
    const gifts = await res.json();
    const myGifts = gifts.filter(g => g.to === currentUser.username || g.from === currentUser.username);
    const container = document.getElementById('giftHistoryList');
    if (!myGifts.length) container.innerHTML = `<div>${t('no_gifts')}</div>`;
    else container.innerHTML = myGifts.map(g => `<div class="gift-history-item">🎁 ${g.from} → ${g.to}: ${g.amount} ${t('coins')}<br>💬 ${g.message}<br><small>${g.timestamp}</small></div>`).join('');
}

async function loadTargetInfo() {
    if (!currentUser) return;
    try {
        const res = await fetch(`/api/get-target-info?username=${currentUser.username}`);
        const data = await res.json();
        if (!data.success) return;

        const target = data.monthlyTarget || 0;
        const next = data.nextMilestone || 50000;
        const prev = Math.floor(target / 50000) * 50000;
        const pct = Math.min(100, ((target - prev) / (next - prev)) * 100);
        const streak = data.consecutiveLoginDays || 0;

        const fill = document.getElementById('targetProgressFill');
        const cur = document.getElementById('targetCurrent');
        const nxt = document.getElementById('targetNext');
        const reward = document.getElementById('targetReward');
        const streakBadge = document.getElementById('streakBadge');
        const monthCountdown = document.getElementById('monthCountdown');
        const dots = document.querySelectorAll('.streak-dot');

        if (fill) fill.style.width = pct + '%';
        if (cur) cur.textContent = target.toLocaleString();
        if (nxt) nxt.textContent = next.toLocaleString();
        if (reward) reward.textContent = `💰 ${t('earned')}: $${data.dollarsEarned} | ${t('total')}: $${data.totalPaid || 0}`;

        if (streakBadge) {
            streakBadge.textContent = `🔥 ${streak}/10 ${t('days')}`;
            if (streak >= 8) streakBadge.style.background = 'linear-gradient(135deg, #dc2626, #991b1b)';
            else if (streak >= 5) streakBadge.style.background = 'linear-gradient(135deg, #f59e0b, #ea580c)';
            else streakBadge.style.background = 'linear-gradient(135deg, #f97316, #ea580c)';
        }

        if (monthCountdown && typeof data.daysUntilMonthEnd === 'number') {
            monthCountdown.textContent = `📅 ${data.daysUntilMonthEnd} ${t('days_until_reset')}`;
        }

        dots.forEach((dot, i) => {
            dot.classList.toggle('filled', i < streak);
            dot.classList.toggle('today', i === streak - 1);
        });
    } catch (e) { console.error('Target info error', e); }
}

async function loadPayoutHistory() {
    if (!currentUser) return;
    try {
        const res = await fetch(`/api/get-payouts?username=${currentUser.username}`);
        const payouts = await res.json();
        const cont = document.getElementById('payoutHistoryList');
        if (!cont) return;
        if (!payouts.length) {
            cont.innerHTML = `<div style="text-align:center;color:#999;padding:10px;">${t('no_payouts')}</div>`;
        } else {
            cont.innerHTML = payouts.map(p => `
                <div class="payout-item">
                    <strong>${p.month}</strong> · ${p.targetAmount.toLocaleString()} ${t('target_label')} →
                    <span style="color:#10b981;font-weight:bold;">$${p.dollarsEarned}</span>
                    <span class="payout-status ${p.status}">${p.status}</span>
                </div>
            `).join('');
        }
    } catch (e) { console.error('Payout history error', e); }
}

async function showRoomGiftModal() {
    if (!currentRoom) { showToast(t('join_room_first') || 'Join a room first'); return; }
    const modal = document.getElementById('roomGiftModal');
    const select = document.getElementById('roomGiftToUser');
    select.innerHTML = `<option value="">${t('select_user')}</option>`;
    try {
        const res = await fetch(`/api/get-room-members/${currentRoom}`);
        const data = await res.json();
        if (data.success && data.members) {
            data.members.forEach(m => {
                if (normalizeUsername(m) !== normalizeUsername(currentUser.username)) {
                    const opt = document.createElement('option');
                    opt.value = m;
                    opt.textContent = m;
                    select.appendChild(opt);
                }
            });
        }
    } catch(e) { console.error(e); }
    document.getElementById('roomGiftMessage').value = '';
    modal.classList.add('active');
}

function closeRoomGiftModal() {
    document.getElementById('roomGiftModal').classList.remove('active');
}

async function sendRoomGift() {
    const to = document.getElementById('roomGiftToUser').value;
    const amount = parseInt(document.getElementById('roomGiftAmountSelect').value);
    const message = document.getElementById('roomGiftMessage').value.trim();
    if (!to) return alert(t('select_user_alert') || 'Select a user');
    if (!amount) return alert(t('select_amount_alert') || 'Select amount');
    if (currentUser.coins < amount) return alert(t('not_enough_coins') || 'Not enough coins');

    const res = await fetch('/api/send-gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: currentUser.username, to, amount, message })
    });
    const data = await res.json();
    if (data.success) {
        showToast(`🎁 Gift sent to ${to}! +${data.targetContribution} target added`);
        closeRoomGiftModal();
        updateCoins();
        loadGiftHistory();
        if (currentRoom) {
            socket.emit('room-message', {
                username: currentUser.username,
                message: `🎁 sent ${amount} coins gift to ${to} → +${data.targetContribution} target`,
                room: currentRoom,
                type: 'text'
            });
        }
        showGiftTicker(currentUser.username, to, amount);
    } else {
        alert(data.error || 'Failed');
    }
}

async function showAdminPayouts() {
    const res = await fetch(`/api/get-payouts?admin=${currentUser.username}`);
    const payouts = await res.json();
    const html = payouts.length ? payouts.map(p => `
        <div class="payout-item">
            <strong>${escapeHtml(p.username)}</strong> · ${p.month} · ${p.targetAmount.toLocaleString()} → 
            <b>$${p.dollarsEarned}</b>
            <span class="payout-status ${p.status}">${p.status}</span>
            ${p.status !== 'paid' ? `<button class="admin-btn green" style="margin-left:8px;" onclick="markPayoutPaid('${p._id}')">${t('mark_paid')}</button>` : ''}
        </div>
    `).join('') : `<div>${t('no_payouts')}</div>`;
    document.getElementById('adminPayoutsList').innerHTML = html;
    document.getElementById('adminPayoutsModal').classList.add('active');
}

async function markPayoutPaid(id) {
    await fetch('/api/mark-payout-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUsername: currentUser.username, payoutId: id })
    });
    showAdminPayouts();
}

async function loadFriends() {
    const res = await fetch(`/api/get-friends?username=${currentUser.username}`);
    const friends = await res.json();
    const container = document.getElementById('friendsList');
    if (!friends.length) container.innerHTML = `<div>${t('no_friends')}</div>`;
    else container.innerHTML = friends.map(f => {
        const isOnline = onlineUsers.some(u => normalizeUsername(u) === normalizeUsername(f));
        const statusText = isOnline ? '🟢 ' + t('online') : '⚫ ' + t('offline');
        return `<div class="room-card"><div class="room-card-info"><h4>${escapeHtml(f)}</h4><p>${statusText}</p></div><div class="friend-actions"><button class="delete-friend-btn" onclick="deleteFriend('${escapeHtml(f)}')">${t('remove')}</button><button class="join-btn" onclick="showPrivateChat('${escapeHtml(f)}')">${t('chat')}</button></div></div>`;
    }).join('');
}

async function loadFriendRequests() {
    const res = await fetch(`/api/get-friend-requests?username=${currentUser.username}`);
    const requests = await res.json();
    const container = document.getElementById('friendRequestsList');
    if (!requests.length) container.innerHTML = `<div>${t('no_requests')}</div>`;
    else container.innerHTML = requests.map(req => `<div class="friend-request-item">${escapeHtml(req.from)} <button onclick="acceptFriendRequest('${escapeHtml(req.from)}')">${t('accept')}</button></div>`).join('');
}

async function acceptFriendRequest(from) {
    socket.emit('accept-friend-request-socket', { username: currentUser.username, from });
}

async function deleteFriend(friend) {
    if (!confirm(`${t('delete_friend_confirm') || 'Remove'} ${friend}?`)) return;
    try {
        const res = await fetch('/api/delete-friend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser.username, friend })
        });
        const data = await res.json();
        if (data.success) loadFriends();
    } catch (err) { alert('Network error: ' + err.message); }
}

async function sendFriendRequest(to) {
    socket.emit('send-friend-request-socket', { from: currentUser.username, to });
}

async function searchUsers() {
    const q = document.getElementById('friendSearch').value.trim();
    if (!q) return;
    const token = localStorage.getItem('chat_token');
    const res = await fetch('/api/get-all-users', { headers: { 'Authorization': `Bearer ${token}` } });
    const all = await res.json();
    const qLower = q.toLowerCase();
    const filtered = all.filter(u => u.username.toLowerCase().includes(qLower) && u.username !== currentUser.username);
    const container = document.getElementById('searchResults');
    container.style.display = 'block';
    if (!filtered.length) container.innerHTML = `<div>${t('no_users_found')}</div>`;
    else container.innerHTML = filtered.map(u => `<div class="search-result-item">${escapeHtml(u.username)} <button class="send-req-btn" onclick="sendFriendRequest('${escapeHtml(u.username)}')">${t('add_friend')}</button></div>`).join('');
}

async function updateCoins() {
    const res = await fetch(`/api/auto-login`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('chat_token')}` } });
    const data = await res.json();
    if (data.success) {
        currentUser.coins = data.user.coins;
        document.getElementById('coinBalance').innerHTML = `💰 ${currentUser.coins}`;
        updateGamesBalance();
    }
}

// ==================== LUCKY GAMES ====================
function updateGamesBalance() {
    const el = document.getElementById('gamesBalance');
    if (el && currentUser) el.innerText = currentUser.coins.toLocaleString();
}

async function loadGameConfig() {
    try {
        const res = await fetch(`/api/game/config?username=${currentUser.username}`);
        const data = await res.json();
        if (data.success) {
            gameConfig = data;
            const betInput = document.getElementById('betAmount');
            if (betInput) {
                betInput.min = data.minBet;
                betInput.max = data.maxBet;
            }
            const maxEl = document.getElementById('maxBetDisplay');
            if (maxEl) maxEl.innerText = data.maxBet.toLocaleString();
            const vipHint = document.getElementById('vipMaxHint');
            if (vipHint) {
                const isVip = currentUser && currentUser.isVIP;
                vipHint.innerText = isVip ? '💎 VIP' : '';
            }
        }
    } catch (e) { console.error('loadGameConfig', e); }
}

function switchGame(game) {
    currentGame = game;
    document.querySelectorAll('.game-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.game-tab[data-game="${game}"]`)?.classList.add('active');
    document.querySelectorAll('.game-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`game-${game}`)?.classList.add('active');
    document.getElementById('gameResult').innerHTML = '';
}

function setBet(amount) {
    const input = document.getElementById('betAmount');
    if (input) input.value = amount;
}

async function playGame(game, choice) {
    const betInput = document.getElementById('betAmount');
    const bet = parseInt(betInput.value);

    if (!bet || bet < gameConfig.minBet) return alert(`${t('min_bet')} ${gameConfig.minBet} ${t('coins')}`);
    if (bet > gameConfig.maxBet) return alert(`${t('max_label')} ${gameConfig.maxBet.toLocaleString()} ${t('coins')}`);
    if (!currentUser || currentUser.coins < bet) return alert(t('insufficient_coins'));

    const resultEl = document.getElementById('gameResult');
    resultEl.innerHTML = '<div class="game-rolling">🎲 Rolling...</div>';
    document.querySelectorAll('.choice-btn, .spin-btn').forEach(b => b.disabled = true);

    try {
        const res = await fetch('/api/game/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser.username, game, bet, choice })
        });
        const data = await res.json();

        if (!data.success) {
            resultEl.innerHTML = `<div class="game-lose">❌ ${data.error}</div>`;
            document.querySelectorAll('.choice-btn, .spin-btn').forEach(b => b.disabled = false);
            return;
        }

        currentUser.coins = data.newBalance;
        document.getElementById('coinBalance').innerHTML = `💰 ${currentUser.coins}`;
        updateGamesBalance();

        await animateGameResult(game, data);

        const winClass = data.win ? 'game-win' : 'game-lose';
        const sign = data.profit >= 0 ? '+' : '';
        resultEl.innerHTML = `
            <div class="${winClass}">
                ${data.win ? '🎉 ' + t('win') + '!' : '😢 ' + t('lose')}
                <div class="game-result-line">
                    ${t('bet_amount')}: ${data.bet} · Payout: ${data.payout} · ${sign}${data.profit}
                </div>
            </div>`;

        loadGameHistory();
    } catch (err) {
        resultEl.innerHTML = `<div class="game-lose">❌ ${t('network_error')}</div>`;
    } finally {
        document.querySelectorAll('.choice-btn, .spin-btn').forEach(b => b.disabled = false);
    }
}

async function animateGameResult(game, data) {
    await new Promise(r => setTimeout(r, 600));

    if (game === 'coinflip') {
        const el = document.getElementById('coinDisplay');
        el.innerText = data.result === 'heads' ? '👑' : '🦅';
        el.classList.add('flip');
        setTimeout(() => el.classList.remove('flip'), 800);
    } else if (game === 'dice') {
        const faces = { 1: '⚀', 2: '⚁', 3: '⚂', 4: '⚃', 5: '⚄', 6: '⚅' };
        document.getElementById('diceDisplay').innerText = faces[data.result] || data.result;
    } else if (game === 'slot') {
        const reels = data.result;
        for (let i = 0; i < 3; i++) {
            const el = document.getElementById(`reel${i + 1}`);
            if (el) {
                el.classList.add('spinning');
                await new Promise(r => setTimeout(r, 200 + i * 200));
                el.innerText = reels[i];
                el.classList.remove('spinning');
            }
        }
    } else if (game === 'wheel') {
        const el = document.getElementById('wheelDisplay');
        el.innerText = `${data.multiplier}×`;
        el.classList.add('spin');
        setTimeout(() => el.classList.remove('spin'), 900);
    }
}

async function loadGameHistory() {
    if (!currentUser) return;
    try {
        const res = await fetch(`/api/game/history?username=${currentUser.username}&limit=15`);
        const data = await res.json();
        const cont = document.getElementById('gameHistoryList');
        if (!cont) return;

        if (!data.success || !data.logs.length) {
            cont.innerHTML = `<div style="text-align:center;color:#999;padding:10px;">${t('no_games')}</div>`;
            return;
        }

        cont.innerHTML = data.logs.map(log => {
            const sign = log.profit >= 0 ? '+' : '';
            const cls = log.win ? 'history-win' : 'history-lose';
            const time = new Date(log.createdAt).toLocaleTimeString();
            return `<div class="game-history-item ${cls}">
                <span class="gh-game">${gameEmoji(log.game)}</span>
                <span class="gh-bet">${t('bet_amount')}: ${log.bet}</span>
                <span class="gh-result">${log.win ? '✅' : '❌'} ${sign}${log.profit}</span>
                <span class="gh-time">${time}</span>
            </div>`;
        }).join('');
    } catch (e) { console.error('loadGameHistory', e); }
}

function gameEmoji(g) {
    return { coinflip: '🪙', dice: '🎲', slot: '🎰', wheel: '🎡' }[g] || '🎮';
}

async function showAdminGameLogs() {
    const res = await fetch(`/api/game/admin-logs?admin=${currentUser.username}`);
    const logs = await res.json();
    const html = logs.length ? logs.map(l => `
        <div class="game-history-item ${l.win ? 'history-win' : 'history-lose'}" style="font-size:12px;">
            <strong>${escapeHtml(l.username)}</strong> · ${gameEmoji(l.game)} · 
            bet ${l.bet} · payout ${l.payout} · 
            <b style="color:${l.profit >= 0 ? '#10b981' : '#ef4444'}">${l.profit >= 0 ? '+' : ''}${l.profit}</b>
        </div>
    `).join('') : `<div>${t('no_games')}</div>`;
    document.getElementById('gameLogsList').innerHTML = html;
    document.getElementById('gameLogsModal').classList.add('active');
}
function closeGameLogsModal() { document.getElementById('gameLogsModal').classList.remove('active'); }

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
            display.innerHTML = `💎 ${t('vip_status')}: ${t('active_until')} ${dateStr}`;
            if (currentUser) currentUser.isVIP = true;
            if (buyButton) buyButton.style.display = 'none';
        } else {
            display.innerHTML = `❌ ${t('vip_status')}: ${t('not_active')}`;
            if (currentUser) currentUser.isVIP = false;
            if (buyButton) {
                buyButton.style.display = 'block';
                buyButton.innerHTML = `💎 ${t('buy_vip')}`;
            }
        }
        updateVipBadge();
    } catch (err) { console.error('checkVIPStatus error:', err); }
}

async function buyVIP() {
    const res = await fetch('/api/buy-vip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username })
    });
    const data = await res.json();
    if (data.success) {
        alert(t('vip_activated') || 'VIP activated!');
        currentUser.isVIP = true;
        updateCoins();
        await checkVIPStatus();
        await checkAndUpdateVIPStatus();
        updateVipBadge();
        updateVIPButtonText();
    } else alert(data.error);
}

function showBoostModal() {
    document.getElementById('boostModal').classList.add('open');
    document.getElementById('overlay').classList.add('active');
}
function closeBoostModal() {
    document.getElementById('boostModal').classList.remove('open');
    document.getElementById('overlay').classList.remove('active');
}
function boostRoom() {
    const amount = parseInt(document.getElementById('boostAmount').value);
    if (!PRICING.ALLOWED_BOOST_AMOUNTS.includes(amount)) {
        return alert(t('invalid_boost') || 'Invalid boost amount');
    }
    if (amount && currentRoom && currentUser.coins >= amount) {
        socket.emit('boost-room', { username: currentUser.username, roomName: currentRoom, amount });
        closeBoostModal();
        updateCoins();
    } else {
        alert(t('insufficient_coins') || 'Insufficient coins');
    }
}

// ==================== ROOM MEMBERS ====================
async function loadRoomMembers() {
    if (!currentRoom) return;
    const res = await fetch(`/api/get-room-members/${currentRoom}`);
    const data = await res.json();
    if (data.success) {
        if (data.moderators) currentRoomModerators = data.moderators;
        const container = document.getElementById('roomMembersList');
        container.innerHTML = '';

        // ⭐ بناء HTML مباشرة بدون await inside loop
        const parts = [];
        for (const member of data.members) {
            const profilePic = profileCache.get(member)?.profile_pic || null;
            let avatarHtml = '👤';
            if (profilePic) {
                if (profilePic.startsWith('data:image') || profilePic.startsWith('/uploads')) {
                    avatarHtml = `<img src="${profilePic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none';this.parentElement.innerHTML='👤';">`;
                } else {
                    avatarHtml = profilePic;
                }
            }
            const isOwner = member === currentRoomOwner;
            const isMod = currentRoomModerators.includes(member);
            const isVIP = data.vipMap ? data.vipMap[member] : false;

            let nameColor = '', roleBadge = '';
            if (isOwner) { nameColor = 'style="color:#ef4444; font-weight:bold;"'; roleBadge = ' 👑'; }
            else if (isMod) { nameColor = 'style="color:#f97316; font-weight:bold;"'; roleBadge = ' <span class="moderator-badge">MOD</span>'; }

            const showKick = (currentUser.username === currentRoomOwner || currentRoomModerators.includes(currentUser.username)) && member !== currentUser.username;
            parts.push(`<div class="user-item"><div class="user-avatar" onclick="showUserProfile('${escapeHtml(member)}')">${avatarHtml}</div><div><span ${nameColor}>${escapeHtml(member)}</span>${isVIP ? ' 💎' : ''}${roleBadge}</div>${showKick ? `<button class="kick-btn" onclick="kickUserFromRoom('${escapeHtml(member)}')">${t('kick')}</button>` : ''}</div>`);
        }
        container.innerHTML = parts.join('');

        // ⭐ جلب صور البروفايل في الخلفية
        if (data.members.length) {
            loadMemberProfiles(data.members);
        }

        const kickedCont = document.getElementById('kickedUsersPanelList');
        if ((currentUser.username === currentRoomOwner || currentRoomModerators.includes(currentUser.username)) && data.kicked && data.kicked.length) {
            kickedCont.innerHTML = `<h4>${t('banned_users')}</h4>` + data.kicked.map(k => `<div class="user-item"><span>${escapeHtml(k)}</span><button class="unban-btn" onclick="unbanUserFromRoom('${escapeHtml(k)}')">${t('unban')}</button></div>`).join('');
        } else kickedCont.innerHTML = '';
    }
}

async function loadMemberProfiles(members) {
    // ⭐ جلب عدة مستخدمين في requests متوازية
    await Promise.all(members.map(async (m) => {
        if (profileCache.has(m)) return;
        try {
            const res = await fetch(`/api/user-profile?username=${m}`);
            const data = await res.json();
            if (data.success) {
                profileCache.set(m, data);
                // تحديث الصورة في الـ DOM
                setTimeout(() => {
                    const items = document.querySelectorAll('.user-item .user-avatar');
                    // البحث بالـ onclick
                    const target = Array.from(items).find(el => el.getAttribute('onclick')?.includes(`'${m}'`));
                    if (target && data.profile_pic) {
                        const pic = data.profile_pic;
                        if (pic.startsWith('data:image') || pic.startsWith('/uploads')) {
                            target.innerHTML = `<img src="${pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none';this.parentElement.innerHTML='👤';">`;
                        }
                    }
                }, 50);
            }
        } catch(e) {}
    }));
}

async function kickUserFromRoom(username) {
    if (!confirm(`Kick ${username}?`)) return;
    const res = await fetch('/api/kick-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: currentRoom, username, adminUsername: currentUser.username })
    });
    if ((await res.json()).success) { alert('Kicked'); loadRoomMembers(); } else alert('Failed');
}

async function unbanUserFromRoom(username) {
    const res = await fetch('/api/unban-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: currentRoom, username, adminUsername: currentUser.username })
    });
    if ((await res.json()).success) { alert('Unbanned'); loadRoomMembers(); } else alert('Failed');
}

function showBanUserModal() {
    const modal = document.getElementById('banUserModal');
    if (modal) { document.getElementById('banUsername').value = ''; modal.classList.add('active'); }
    else {
        const username = prompt('Enter username to kick/ban from this room:');
        if (username && username.trim()) kickUserFromRoom(username.trim());
    }
}
function closeBanUserModal() {
    const modal = document.getElementById('banUserModal');
    if (modal) modal.classList.remove('active');
}
function executeBanUser() {
    const username = document.getElementById('banUsername').value.trim();
    if (!username) { alert('Please enter a username'); return; }
    if (username === currentUser.username) { alert('You cannot ban yourself'); return; }
    kickUserFromRoom(username);
    closeBanUserModal();
}
function showKickListModal() {
    const modal = document.getElementById('kickListModal');
    if (modal) modal.classList.add('active');
}
function closeKickListModal() {
    document.getElementById('kickListModal').classList.remove('active');
}

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
    cont.innerHTML = allowed.map(m => {
        const isMod = moderators.includes(m);
        return `<div class="user-item"><div class="user-avatar">👤</div><div><strong>${escapeHtml(m)}</strong> ${isMod ? '<span class="moderator-badge">MOD</span>' : ''}</div><div style="margin-left:auto;">${isOwner ? (isMod ? `<button class="kick-btn" onclick="removeModerator('${escapeHtml(m)}')">${t('remove_mod')}</button>` : `<button class="mod-btn" onclick="setModerator('${escapeHtml(m)}')">${t('make_mod')}</button>`) : ''}<button class="kick-btn" onclick="removeRoomMember('${escapeHtml(m)}')">${t('remove')}</button></div></div>`;
    }).join('');
}

async function toggleMembersOnly() {
    if (!currentRoom || currentUser.username !== currentRoomOwner) return;
    const mo = document.getElementById('membersOnlyToggle').checked;
    const res = await fetch('/api/room-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: currentRoom, membersOnly: mo, adminUsername: currentUser.username })
    });
    const data = await res.json();
    if (data.success) { currentRoomMembersOnly = mo; alert(`Room is now ${mo ? 'Members Only' : 'Open'}`); }
    else { alert(data.error); document.getElementById('membersOnlyToggle').checked = !mo; }
}

function addRoomMember() {
    const username = document.getElementById('addMemberUsername').value.trim();
    if (!username) return;
    socket.emit('add-room-member', { roomName: currentRoom, username, adminUsername: currentUser.username });
    document.getElementById('addMemberUsername').value = '';
}
function removeRoomMember(username) {
    if (!confirm(`Remove ${username}?`)) return;
    socket.emit('remove-room-member', { roomName: currentRoom, username, adminUsername: currentUser.username });
}
function setModerator(username) { socket.emit('set-moderator', { roomName: currentRoom, username, adminUsername: currentUser.username }); }
function removeModerator(username) { socket.emit('remove-moderator', { roomName: currentRoom, username, adminUsername: currentUser.username }); }
function closeRoomSettingsModal() { document.getElementById('roomSettingsModal').classList.remove('active'); }

// ==================== WEBRTC CALLS ====================
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
            urls: ['turn:global.turn.metered.ca:443?transport=tcp', 'turn:global.turn.metered.ca:443?transport=udp'],
            username: 'openrelayproject',
            credential: 'openrelayproject'
        });
    }
    return { ...baseCallConfig, iceServers };
}

function createPeerConnection(config) {
    const pc = new RTCPeerConnection(config);
    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') pc.restartIce();
    };
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
            showToast('Connection failed. Trying to reconnect...');
            setTimeout(() => { if (callActive && currentPrivateChat) restartCall(); }, 2000);
        }
    };
    return pc;
}

function setupPeerConnectionListeners(pc, isCaller = false) {
    pc.onicecandidate = (event) => {
        if (event.candidate && currentPrivateChat && socket?.connected) {
            socket.emit('ice-candidate', { to: currentPrivateChat, candidate: event.candidate });
        }
    };

    pc.ontrack = (event) => {
        const remoteVideo = document.getElementById('remoteVideo');
        if (!remoteVideo) return;
        let remoteStream = remoteVideo.srcObject;
        if (!remoteStream) {
            remoteStream = new MediaStream();
            remoteVideo.srcObject = remoteStream;
        }
        remoteStream.addTrack(event.track);
        remoteVideo.play().catch(() => setTimeout(() => remoteVideo.play().catch(()=>{}), 500));

        if (event.track.kind === 'audio') {
            let audioEl = document.querySelector('audio[data-call-audio]');
            if (!audioEl) {
                audioEl = document.createElement('audio');
                audioEl.setAttribute('data-call-audio', 'true');
                audioEl.autoplay = true;
                audioEl.style.display = 'none';
                document.body.appendChild(audioEl);
            }
            const audioStream = new MediaStream();
            audioStream.addTrack(event.track);
            audioEl.srcObject = audioStream;
            audioEl.play().catch(() => {});
        }
    };

    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') { showToast('Call connection failed'); endCall(); }
        else if (pc.iceConnectionState === 'connected') showToast('Call connected');
    };
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') { showToast('Call failed'); endCall(); }
        else if (pc.connectionState === 'connected') showToast('Call established');
    };
    pc.onnegotiationneeded = async () => {
        if (callActive && currentPrivateChat && socket?.connected) {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('call-user', { to: currentPrivateChat, from: currentUser.username, offer: pc.localDescription });
            } catch (err) { console.error('Re-negotiation error:', err); }
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

async function startCall() {
    if (!currentPrivateChat) { showToast('No private chat open'); return; }
    if (callActive) { showToast('Already in a call'); return; }
    if (!onlineUsers.some(u => normalizeUsername(u) === normalizeUsername(currentPrivateChat))) {
        showToast('User is offline'); return;
    }
    if (!socket || !socket.connected) { showToast('❌ Not connected'); return; }
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

        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true;
            localVideo.play().catch(() => {});
        }

        peerConnection = createPeerConnection(config);
        setupPeerConnectionListeners(peerConnection, true);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        const offer = await peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await peerConnection.setLocalDescription(offer);
        socket.emit('call-user', { to: currentPrivateChat, from: currentUser.username, offer: peerConnection.localDescription });
        document.getElementById('callModal').classList.add('active');
        callActive = true;
        showToast('Calling...');

        setTimeout(() => {
            if (callActive && !pendingCallFrom) { showToast('Call timed out'); endCall(); }
        }, 30000);
    } catch (error) {
        showToast('Could not start call: ' + error.message);
        endCall();
    }
}

async function acceptCall() {
    stopRingtone();
    if (!pendingCallFrom) return;
    if (callActive) { endCall(); await new Promise(r => setTimeout(r, 300)); }
    try {
        showToast('Accepting call...');
        const config = await getCallConfig();
        const constraints = { audio: true, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);

        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true;
            localVideo.play().catch(() => {});
        }

        if (peerConnection) { peerConnection.close(); peerConnection = null; }
        peerConnection = createPeerConnection(config);
        setupPeerConnectionListeners(peerConnection, false);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        await peerConnection.setRemoteDescription(new RTCSessionDescription(pendingOffer));
        const answer = await peerConnection.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await peerConnection.setLocalDescription(answer);

        if (socket && socket.connected) {
            socket.emit('call-accepted', { to: pendingCallFrom, answer: peerConnection.localDescription });
        } else { showToast('Socket disconnected'); endCall(); return; }

        document.getElementById('callModal').classList.add('active');
        document.getElementById('incomingCallBar').classList.remove('active');
        callActive = true;
        pendingCallFrom = null;
        pendingOffer = null;
        showToast('Call connected');
    } catch (error) {
        showToast('Could not accept call: ' + error.message);
        endCall();
    }
}

function rejectCall() {
    stopRingtone();
    if (pendingCallFrom) {
        socket.emit('call-rejected', { to: pendingCallFrom });
        document.getElementById('incomingCallBar').classList.remove('active');
        pendingCallFrom = null;
        pendingOffer = null;
    }
}

function endCall() {
    stopRingtone();
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    if (localVideo) { localVideo.srcObject = null; localVideo.muted = false; }
    if (remoteVideo) remoteVideo.srcObject = null;
    document.querySelectorAll('audio[data-call-audio]').forEach(el => el.remove());
    document.getElementById('callModal').classList.remove('active');
    if (callActive && currentPrivateChat) socket.emit('end-call', { to: currentPrivateChat });
    callActive = false;
    pendingCallFrom = null;
    pendingOffer = null;
    speakerEnabled = false;
    const speakerBtn = document.getElementById('speakerBtn');
    if (speakerBtn) speakerBtn.textContent = '🔊';
}

async function toggleSpeaker() {
    const remoteVideo = document.getElementById('remoteVideo');
    if (!remoteVideo) { showToast('No active call'); return; }
    if (!remoteVideo.setSinkId) {
        if (!remoteVideo.srcObject) { showToast('No audio stream'); return; }
        try {
            if (!window._speakerGainNode) {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const source = ctx.createMediaStreamSource(remoteVideo.srcObject);
                const gain = ctx.createGain();
                source.connect(gain);
                gain.connect(ctx.destination);
                window._speakerGainNode = gain;
            }
            const gain = window._speakerGainNode;
            speakerEnabled = !speakerEnabled;
            gain.gain.value = speakerEnabled ? 1.5 : 0.8;
            document.getElementById('speakerBtn').textContent = speakerEnabled ? '🔊' : '🔇';
            showToast(speakerEnabled ? 'Speaker on' : 'Speaker off');
        } catch (e) { showToast('Speaker toggle failed'); }
        return;
    }
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        if (audioOutputs.length < 2) { showToast('Only one audio output'); return; }
        let targetSinkId;
        if (!speakerEnabled) {
            const speakerDevice = audioOutputs.find(d => /speaker|headphone/i.test(d.label));
            targetSinkId = speakerDevice ? speakerDevice.deviceId : audioOutputs.find(d => d.deviceId !== 'default')?.deviceId;
            if (!targetSinkId) { showToast('No speaker'); return; }
        } else targetSinkId = 'default';
        await remoteVideo.setSinkId(targetSinkId);
        speakerEnabled = !speakerEnabled;
        document.getElementById('speakerBtn').textContent = speakerEnabled ? '🔊' : '🔇';
        showToast(speakerEnabled ? 'Speaker on' : 'Speaker off');
    } catch (err) { showToast('Failed to switch speaker'); }
}

function toggleCallAudio() {
    if (localStream && localStream.getAudioTracks().length > 0) {
        const track = localStream.getAudioTracks()[0];
        track.enabled = !track.enabled;
        showToast(track.enabled ? 'Mic unmuted' : 'Mic muted');
    } else showToast('No audio track');
}

function toggleCallVideo() {
    if (localStream && localStream.getVideoTracks().length > 0) {
        const track = localStream.getVideoTracks()[0];
        track.enabled = !track.enabled;
        showToast(track.enabled ? 'Camera on' : 'Camera off');
    } else showToast('No video track');
}

// ==================== YOUTUBE ====================
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
    const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/, /youtube\.com\/embed\/([^&\n?#]+)/, /youtube\.com\/shorts\/([^&\n?#]+)/];
    for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match) { videoId = match[1]; break; }
    }
    if (videoId) updateYouTubeVideo(videoId);
    else {
        fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${encodeURIComponent(query)}`)
            .then(res => res.json())
            .then(data => {
                if (data.url) {
                    const match = data.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
                    if (match && match[1]) updateYouTubeVideo(match[1]);
                    else { window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank'); }
                } else showToast('Video not found');
            })
            .catch(() => { window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank'); });
    }
}

function updateYouTubeVideo(videoId) {
    const iframe = document.getElementById('youtubeIframe');
    iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
    if (currentRoom) socket.emit('sync-youtube', { room: currentRoom, videoId });
    document.getElementById('youtubeSearchInput').value = '';
    showToast('🎬 Video updated!');
}

// ==================== USER PROFILE ====================
async function showUserProfile(username) {
    // ⭐ استخدام الكاش
    let user = profileCache.get(username);
    if (!user) {
        const token = localStorage.getItem('chat_token');
        const res = await fetch('/api/get-all-users', { headers: { 'Authorization': `Bearer ${token}` } });
        const usersList = await res.json();
        user = usersList.find(u => u.username === username);
        if (user) profileCache.set(username, user);
    }
    if (!user) return;

    const isOnline = onlineUsers.some(u => normalizeUsername(u) === normalizeUsername(username));
    let avatarHtml = '👤';
    if (user.profile_pic) {
        if (typeof user.profile_pic === 'string' && (user.profile_pic.startsWith('data:image') || user.profile_pic.startsWith('/uploads'))) {
            avatarHtml = `<img src="${user.profile_pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none';this.parentElement.innerHTML='👤';">`;
        } else avatarHtml = user.profile_pic;
    }

    const content = `<div class="profile-card"><div class="profile-avatar">${avatarHtml}</div><div class="profile-name">${escapeHtml(user.username)}</div><div class="profile-status">${isOnline ? '🟢 ' + t('online') : '⚫ ' + t('offline')}</div><div class="profile-info"><p>💰 ${t('coins')}: ${user.coins}</p></div><div class="profile-buttons"><button onclick="showPrivateChat('${escapeHtml(user.username)}'); closeProfileModal();">💬 ${t('message')}</button><button onclick="sendFriendRequest('${escapeHtml(user.username)}'); closeProfileModal();">➕ ${t('add_friend')}</button></div></div>`;
    document.getElementById('profileContent').innerHTML = content;
    document.getElementById('profileModal').classList.add('active');
}

function closeProfileModal() { document.getElementById('profileModal').classList.remove('active'); }

// ==================== ADMIN PANEL ====================
async function showAllUsers() {
    const res = await fetch(`/api/admin/get-all-users?admin=${currentUser.username}`);
    const users = await res.json();
    if (users.error) { alert('Admin access required'); return; }
    const html = users.map(u => `<div>${escapeHtml(u.username)} (💰 ${u.coins}) ${u.isAdmin ? '👑' : ''} ${u.privateCode ? `🔑 <code style="font-size:11px;">${escapeHtml(u.privateCode)}</code>` : ''} <button onclick="deleteUser('${escapeHtml(u.username)}')">${t('delete')}</button></div>`).join('');
    document.getElementById('allUsersList').innerHTML = html;
    document.getElementById('usersModal').classList.add('active');
}
async function deleteUser(username) {
    if (confirm('Delete user?')) {
        await fetch('/api/delete-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminUsername: currentUser.username, username }) });
        showAllUsers();
    }
}
async function showAllRooms() {
    const res = await fetch(`/api/get-all-rooms?admin=${currentUser.username}`);
    const rooms = await res.json();
    const html = rooms.map(r => `<div>${r.name} (Owner: ${r.owner}) <button onclick="deleteRoom('${r.name}')">${t('delete')}</button></div>`).join('');
    document.getElementById('allRoomsList').innerHTML = html;
    document.getElementById('roomsModal').classList.add('active');
}
async function deleteRoom(roomName) {
    if (confirm('Delete room?')) {
        await fetch('/api/delete-room', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminUsername: currentUser.username, roomName }) });
        showAllRooms();
    }
}
async function showAllGifts() {
    const res = await fetch('/api/get-gifts');
    const gifts = await res.json();
    const html = gifts.map(g => `<div>${g.from} → ${g.to}: ${g.amount} coins (${g.timestamp})</div>`).join('');
    document.getElementById('allGiftsList').innerHTML = html;
    document.getElementById('giftsModal').classList.add('active');
}
async function clearAllFriendRequests() {
    if (confirm('Clear all friend requests?')) {
        await fetch('/api/clear-friend-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminUsername: currentUser.username }) });
        alert('Cleared');
    }
}
async function clearAllCoinRequests() {
    if (confirm('Clear coin history?')) {
        await fetch('/api/clear-coin-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminUsername: currentUser.username }) });
        alert('Cleared');
    }
}
async function showBoostLogModal() {
    const res = await fetch('/api/get-boost-logs');
    const logs = await res.json();
    const html = logs.map(l => `<div>${l.username} boosted ${l.roomName} with ${l.amount} coins</div>`).join('');
    document.getElementById('boostLogList').innerHTML = html;
    document.getElementById('boostLogModal').classList.add('active');
}
async function showPendingManualRequests() {
    const res = await fetch(`/api/get-pending-manual-requests?admin=${currentUser.username}`);
    const reqs = await res.json();
    const html = reqs.map(r => `<div>${r.username} requested ${r.amount} coins (${r.paymentMethod}) <button onclick="approveRequest('${r._id}')">${t('approve')}</button> <button onclick="rejectRequest('${r._id}')">${t('reject')}</button> ${r.proof ? `<a href="${r.proof}" target="_blank">Proof</a>` : ''}</div>`).join('');
    document.getElementById('pendingRequestsList').innerHTML = html;
    document.getElementById('pendingRequestsModal').classList.add('active');
}
async function approveRequest(id) {
    await fetch('/api/approve-manual-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: id, adminUsername: currentUser.username }) });
    showPendingManualRequests();
}
async function rejectRequest(id) {
    await fetch('/api/reject-manual-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: id, adminUsername: currentUser.username }) });
    showPendingManualRequests();
}
async function adminGiveCoins() {
    const username = document.getElementById('adminGiveUsername').value;
    const amount = document.getElementById('adminGiveAmount').value;
    await fetch('/api/admin-give-coins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminUsername: currentUser.username, username, amount }) });
    alert('Coins given');
}
async function adminResetPassword() {
    const username = document.getElementById('adminResetUser').value;
    const newPassword = document.getElementById('adminNewPass').value;
    await fetch('/api/admin-reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminUsername: currentUser.username, username, newPassword }) });
    alert('Password reset');
}
function closeUsersModal() { document.getElementById('usersModal').classList.remove('active'); }
function closeRoomsModal() { document.getElementById('roomsModal').classList.remove('active'); }
function closeGiftsModal() { document.getElementById('giftsModal').classList.remove('active'); }
function closeBoostLogModal() { document.getElementById('boostLogModal').classList.remove('active'); }
function closePendingRequestsModal() { document.getElementById('pendingRequestsModal').classList.remove('active'); }

// ==================== SUPPORT ====================
function openSupportModal() {
    document.getElementById('supportModal').classList.add('active');
    document.getElementById('supportResponse').innerHTML = '';
    document.getElementById('supportSubject').value = '';
    document.getElementById('supportMessage').value = '';
    document.getElementById('supportScreenshot').value = '';
}
function closeSupportModal() { document.getElementById('supportModal').classList.remove('active'); }

async function submitSupportTicket() {
    if (!currentUser || !currentUser.username) { alert('Must be logged in'); return; }
    const subject = document.getElementById('supportSubject').value.trim();
    const message = document.getElementById('supportMessage').value.trim();
    if (!subject || !message) { alert(t('fill_required') || 'Fill all fields'); return; }
    const fd = new FormData();
    fd.append('username', currentUser.username);
    fd.append('subject', subject);
    fd.append('message', message);
    const fileInput = document.getElementById('supportScreenshot');
    if (fileInput.files[0]) fd.append('screenshot', fileInput.files[0]);
    const responseDiv = document.getElementById('supportResponse');
    responseDiv.innerHTML = `<span style="color:blue;">${t('sending') || 'Sending...'}</span>`;
    try {
        const res = await fetch('/api/support/submit', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
            responseDiv.innerHTML = `<span style="color:green;">✅ ${t('ticket_submitted')} ID: ${data.ticketId}</span>`;
            setTimeout(() => closeSupportModal(), 2000);
        } else responseDiv.innerHTML = `<span style="color:red;">❌ ${data.error}</span>`;
    } catch (err) { responseDiv.innerHTML = `<span style="color:red;">❌ Network error</span>`; }
}

async function showAdminSupportPanel() {
    if (!currentUser || currentUser.isAdmin !== true) { showToast('Admin access required'); return; }
    const container = document.getElementById('adminTicketsList');
    container.innerHTML = `<div style="padding:12px;text-align:center;color:#6b7280;">${t('loading_tickets')}</div>`;
    document.getElementById('adminSupportModal').classList.add('active');

    try {
        const res = await fetch(`/api/support/tickets?admin=${encodeURIComponent(currentUser.username)}&status=all`);
        const data = await res.json().catch(() => null);
        if (!res.ok || !Array.isArray(data)) {
            container.innerHTML = `<div style="padding:12px;color:#ef4444;">❌ ${escapeHtml(data?.error || `Error ${res.status}`)}</div>`;
            return;
        }
        adminTicketsCache = {};
        data.forEach(ticket => { adminTicketsCache[ticket.ticketId] = ticket; });

        let html = `<div style="margin-bottom:12px;text-align:right;"><button onclick="clearAllSupportTickets()" style="background:#ef4444;color:white;border:none;padding:8px 16px;border-radius:40px;font-weight:600;cursor:pointer;">🗑️ Clear All</button></div>`;

        if (!data.length) {
            container.innerHTML = html + `<div style="padding:12px;text-align:center;color:#6b7280;">${t('no_tickets')}</div>`;
            return;
        }

        html += data.map(ticket => `
            <div class="ticket-item">
                <strong>${escapeHtml(ticket.ticketId)}</strong>
                <span class="ticket-status status-${escapeHtml(ticket.status)}">${escapeHtml(ticket.status)}</span><br>
                <strong>${t('from_label')}</strong> ${escapeHtml(ticket.username)}<br>
                <strong>${t('subject_label')}</strong> ${escapeHtml(ticket.subject)}<br>
                <strong>${t('message_label')}</strong> ${escapeHtml(ticket.message)}<br>
                ${ticket.screenshot ? `<a href="${escapeHtml(ticket.screenshot)}" target="_blank">${t('view_screenshot')}</a><br>` : ''}
                ${ticket.adminReply ? `<strong>${t('admin_reply')}</strong> ${escapeHtml(ticket.adminReply)}<br>` : ''}
                <div style="margin-top:10px;">
                    <button onclick="openReplyTicketModal('${escapeHtml(ticket.ticketId)}')">${t('reply_btn')}</button>
                    ${ticket.status !== 'resolved' ? `<button onclick="resolveTicket('${escapeHtml(ticket.ticketId)}')">${t('resolve_btn')}</button>` : ''}
                </div>
            </div>
        `).join('');
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div style="padding:12px;color:#ef4444;">❌ ${escapeHtml(err.message)}</div>`;
    }
}

function closeAdminSupportModal() { document.getElementById('adminSupportModal').classList.remove('active'); }

async function clearAllSupportTickets() {
    if (!confirm('Clear ALL tickets?')) return;
    try {
        const res = await fetch('/api/support/clear-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminUsername: currentUser.username })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ Cleared ${data.deletedCount} tickets`);
            showAdminSupportPanel();
        } else alert('Failed: ' + (data.error || 'Unknown'));
    } catch (err) { alert('Network error: ' + err.message); }
}

let currentReplyTicketId = null;

function openReplyTicketModal(ticketId) {
    const ticket = adminTicketsCache[ticketId];
    if (!ticket) { showToast('Ticket not found'); return; }
    currentReplyTicketId = ticketId;
    document.getElementById('replyTicketId').innerText = `${t('ticket_label')} ${ticketId}`;
    document.getElementById('replyUserMessage').innerText = ticket.message;
    document.getElementById('replyMessage').value = '';
    document.getElementById('replyTicketModal').classList.add('active');
}
function closeReplyTicketModal() {
    document.getElementById('replyTicketModal').classList.remove('active');
    currentReplyTicketId = null;
}

async function sendSupportReply() {
    if (!currentReplyTicketId) return;
    const reply = document.getElementById('replyMessage').value.trim();
    if (!reply) return alert('Enter reply');
    try {
        const res = await fetch('/api/support/reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminUsername: currentUser.username, ticketId: currentReplyTicketId, reply })
        });
        const data = await res.json();
        if (data.success) { alert('Sent'); closeReplyTicketModal(); showAdminSupportPanel(); }
        else alert('Failed: ' + (data.error || 'Unknown'));
    } catch (err) { alert('Network error: ' + err.message); }
}

async function resolveTicket(ticketId) {
    if (!confirm('Resolve this ticket?')) return;
    try {
        const res = await fetch('/api/support/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminUsername: currentUser.username, ticketId })
        });
        const data = await res.json();
        if (data.success) { showToast('✅ Resolved'); showAdminSupportPanel(); }
        else alert('Failed');
    } catch (err) { alert('Network error: ' + err.message); }
}

function openViewTicketModal(ticketId, reply) {
    document.getElementById('viewTicketId').innerText = ticketId;
    document.getElementById('viewTicketReply').innerHTML = escapeHtml(reply).replace(/\n/g, '<br>');
    document.getElementById('viewTicketModal').classList.add('active');
}
function closeViewTicketModal() { document.getElementById('viewTicketModal').classList.remove('active'); }

// ==================== UI HELPERS ====================
function addSystemMessage(text, containerId) {
    const c = document.getElementById(containerId);
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    c.appendChild(div);
}
function togglePanel() {
    document.getElementById('sidePanel').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('active');
}
function toggleUsersPanel() {
    document.getElementById('usersPanel').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('active');
    loadRoomMembers();
}
function closeAllPanels() {
    document.getElementById('sidePanel').classList.remove('open');
    document.getElementById('usersPanel').classList.remove('open');
    document.getElementById('boostModal').classList.remove('open');
    document.getElementById('overlay').classList.remove('active');
}
function toggleRoomMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById('roomDropdownMenu');
    const isOpen = menu.classList.contains('show');
    if (isOpen) closeRoomMenu();
    else {
        closeRoomMenu();
        updateRoomMenuPermissions();
        menu.classList.add('show');
        setTimeout(() => document.addEventListener('click', closeRoomMenuOnClickOutside), 0);
    }
}
function closeRoomMenu() {
    const menu = document.getElementById('roomDropdownMenu');
    menu.classList.remove('show');
    document.removeEventListener('click', closeRoomMenuOnClickOutside);
}
function closeRoomMenuOnClickOutside(event) {
    const menu = document.getElementById('roomDropdownMenu');
    const btn = document.getElementById('roomMenuBtn');
    if (!menu.contains(event.target) && !btn.contains(event.target)) closeRoomMenu();
}

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

async function requestMicrophonePermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
    } catch(e) {}
}

function initSocket() {
    const socketURL = window.location.origin;
    socket = io(socketURL, {
        reconnection: true,
        reconnectionAttempts: 20,                    // ⭐ capped (was Infinity)
        reconnectionDelay: 800,                      // ⭐ slower first retry
        reconnectionDelayMax: 5000,                  // ⭐ cap backoff
        randomizationFactor: 0.5,
        timeout: 8000,                               // ⭐ 8s connect timeout
        transports: ['websocket'],
        rememberUpgrade: true,
        path: '/socket.io/',
        secure: window.location.protocol === 'https:', // ⭐ FIXED — was hardcoded true
        autoConnect: true
    });

    socket.on('connect', () => {
        targetLanguage = localStorage.getItem('targetLanguage') || 'en';
        autoTranslateMessages = localStorage.getItem('autoTranslateMessages') !== 'false';
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.className = 'connection-status-indicator';
            statusEl.innerHTML = `<span class="dot"></span> ${t('connected')}`;
        }
        showToast(t('connected_server'));
        refreshUserData(true);
        socket.emit('user-online', currentUser.username);
        socket.emit('get-room-list');
        const lastRoom = localStorage.getItem('lastRoom');
        if (lastRoom && !currentRoom) setTimeout(() => socket.emit('join-room', lastRoom), 300);
    });

    socket.on('reconnect', () => {
        setTimeout(() => refreshUserData(true), 500);
        socket.emit('user-online', currentUser.username);
        const lastRoom = localStorage.getItem('lastRoom');
        if (lastRoom && !currentRoom) setTimeout(() => socket.emit('join-room', lastRoom), 300);
    });

    socket.on('disconnect', () => {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.className = 'connection-status-indicator disconnected';
            statusEl.innerHTML = `<span class="dot"></span> ${t('disconnected')}`;
        }
        showToast(t('connection_lost'));
    });

    socket.on('connect_error', (err) => console.error('Connection error:', err));

    socket.on('online-users', (users) => {
        onlineUsers = users;
        updatePrivateStatus();
        // ⭐ لا نحدث الأصدقاء هنا لتقليل الـ requests
    });

    socket.on('room-list', (rooms) => { allRooms = rooms; displayRooms(rooms); });
    socket.on('room-created-success', (name) => {
        alert(`Room "${name}" created`);
        socket.emit('get-room-list');
        closeCreateRoomModal();
        updateCoins();
    });

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

    socket.on('room-messages-history', () => {});
    socket.on('new-room-message', (msg) => addRoomMessage(msg));
    socket.on('user-joined-room', (data) => { addSystemMessage(`${data.username} ${t('joined')}`, 'roomMessages'); loadRoomMembers(); });
    socket.on('user-left-room', (data) => { addSystemMessage(`${data.username} ${t('left')}`, 'roomMessages'); loadRoomMembers(); });
    socket.on('room-boosted', (data) => {
        addSystemMessage(`🚀 ${data.boostedBy} ${t('boosted')} ${data.amount} ${t('coins')}! ${t('total_boost')}: ${data.boostLevel}`, 'roomMessages');
        document.getElementById('roomChatStats').innerHTML = `${t('boost')}: ${data.boostLevel}`;
        socket.emit('get-room-list');
    });
    socket.on('new-private-message', (msg) => {
        playNotificationSound();
        if (currentPrivateChat === msg.from) addPrivateMessage(msg);
        else addNotification(t('new_message'), `${msg.from}: ${msg.message.substring(0,50)}`, { type: 'private_message', from: msg.from });
    });
    socket.on('private-message-sent', (msg) => addPrivateMessage(msg));
    socket.on('gift-received', (gift) => {
        playNotificationSound();
        alert(`🎁 ${gift.from} ${t('sent_gift')} ${gift.amount} ${t('coins')}!`);
        updateCoins();
        loadGiftHistory();
        addNotification(t('gift_received'), `${gift.from} ${t('sent_gift')} ${gift.amount} ${t('coins')}!`);
        showGiftTicker(gift.from, gift.to, gift.amount);
    });
    socket.on('friend-request-received', (data) => {
        playNotificationSound();
        alert(`📨 ${t('friend_request')} ${t('from')} ${data.from}`);
        loadFriendRequests();
        addNotification(t('friend_request'), `${t('from')} ${data.from}`);
    });
    socket.on('coins-updated', (balance) => {
        currentUser.coins = balance;
        document.getElementById('coinBalance').innerHTML = `💰 ${balance}`;
        updateGamesBalance();
    });
    socket.on('admin-gift', (data) => {
        alert(`🎁 ${t('admin_gave')} ${data.amount} ${t('coins')}!`);
        updateCoins();
    });
    socket.on('friend-deleted', (friendName) => {
        alert(`${friendName} ${t('removed_you')}`);
        loadFriends();
    });
    socket.on('gift-ticker', (data) => showGiftTicker(data.from, data.to, data.amount));
    socket.on('kicked-from-room', (data) => {
        alert(`${t('kicked_from')} ${data.room}`);
        if (currentRoom === data.room) leaveRoom();
    });

    socket.on('target-updated', (data) => {
        showToast(`🎯 +${data.contribution} ${t('target')} ${t('from')} ${data.from}`);
        if (currentUser) currentUser.monthlyTarget = data.monthlyTarget;
        loadTargetInfo();
    });
    socket.on('streak-status', (data) => {
        if (currentUser) currentUser.consecutiveLoginDays = data.consecutiveLoginDays;
    });
    socket.on('streak-completed', (data) => {
        playNotificationSound();
        addNotification('🎉 10 Days!', `You earned $${data.dollarsEarned}!`);
        loadTargetInfo();
        loadPayoutHistory();
    });
    socket.on('target-not-reached', (data) => {
        playNotificationSound();
        addNotification('⚠️ Target Not Reached', `Target: ${data.currentTarget.toLocaleString()}/${data.minTarget.toLocaleString()}`);
        loadTargetInfo();
    });
    socket.on('milestone-reached', (data) => {
        playNotificationSound();
        showToast(`🎯 ${data.milestone.toLocaleString()} reached! = $${data.dollars}`);
        loadTargetInfo();
    });
    socket.on('payout-created', (data) => {
        playNotificationSound();
        addNotification('💰 Payout', `$${data.dollarsEarned} for ${data.month}`);
        loadTargetInfo();
        loadPayoutHistory();
    });
    socket.on('payout-paid', (data) => {
        playNotificationSound();
        addNotification('✅ Payout Paid', `$${data.amount} (${data.month})`);
        loadTargetInfo();
        loadPayoutHistory();
    });
    socket.on('monthly-reset', (data) => {
        playNotificationSound();
        addNotification('📅 Monthly Reset', data.reason);
        loadTargetInfo();
    });
    socket.on('game-result', (data) => {
        updateGamesBalance();
        if (data.profit >= gameConfig.bigWinThreshold) {
            playNotificationSound();
            showToast(`🎉 Big win! +${data.profit} coins`);
        }
    });

    socket.on('incoming-call', (data) => {
        playNotificationSound();
        startRingtone();
        if (callActive) { socket.emit('call-rejected', { to: data.from }); return; }
        pendingCallFrom = data.from;
        pendingOffer = data.offer;
        document.getElementById('callerName').innerText = data.from;
        document.getElementById('incomingCallBar').classList.add('active');
        addNotification(t('incoming_call'), `${data.from} ${t('is_calling')}...`);
    });

    socket.on('call-accepted', async (data) => {
        if (!peerConnection) {
            try {
                const config = await getCallConfig();
                peerConnection = createPeerConnection(config);
                setupPeerConnectionListeners(peerConnection, true);
                localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = localStream;
                    localVideo.muted = true;
                    localVideo.play().catch(() => {});
                }
                localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
            } catch (err) {
                showToast('Connection failed: ' + err.message);
                endCall();
                return;
            }
        }
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            showToast('Call connected');
        } catch (error) {
            showToast('Call failed');
            endCall();
        }
    });

    socket.on('call-rejected', () => { stopRingtone(); showToast(t('call_rejected')); endCall(); });
    socket.on('end-call', () => { stopRingtone(); showToast(t('call_ended')); endCall(); });
    socket.on('ice-candidate', async (data) => {
        if (peerConnection && data.candidate) {
            try { await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); }
            catch (error) { console.error('ICE error:', error); }
        }
    });

    socket.on('support-reply', (data) => {
        playNotificationSound();
        addNotification(t('support_reply'), `Admin ${t('replied_ticket')} ${data.ticketId}`, { type: 'support_ticket', ticketId: data.ticketId, reply: data.reply });
        showToast(`📬 ${t('new_reply_support')} ${data.ticketId}`);
    });
    socket.on('support-resolved', (data) => {
        playNotificationSound();
        addNotification(t('ticket_resolved'), `${t('your_ticket')} ${data.ticketId} ${t('resolved')}.`);
    });
    socket.on('new-support-ticket', (data) => {
        if (currentUser.isAdmin) addNotification(t('new_support_ticket'), `${data.username}: ${data.subject}`);
    });
    socket.on('room-join-denied', (msg) => alert(msg));
    socket.on('sync-youtube', (data) => {
        if (currentRoom === data.room) {
            const iframe = document.getElementById('youtubeIframe');
            iframe.src = `https://www.youtube.com/embed/${data.videoId}?enablejsapi=1`;
            showToast(`🎬 ${t('room_video_changed')} ${data.by || t('someone')}`);
        }
    });
    socket.on('room-member-added', (data) => {
        const { username, roomName } = data;
        if (roomName === currentRoom) loadRoomMembers();
        if (username === currentUser.username) {
            showToast(`${t('you_were_added_to')} "${roomName}"!`);
            setTimeout(() => socket.emit('join-room', roomName), 500);
        }
    });
    socket.on('room-member-removed', (data) => {
        const { username, roomName } = data;
        if (roomName === currentRoom) {
            loadRoomMembers();
            if (username === currentUser.username) {
                showToast(`${t('you_were_removed_from')} "${roomName}"`);
                leaveRoom();
            }
        }
    });
    socket.on('room-moderator-updated', (data) => {
        if (currentRoom === data.room) {
            currentRoomModerators = data.moderators;
            loadRoomMembers();
            const modal = document.getElementById('roomSettingsModal');
            if (modal.classList.contains('active')) showRoomSettings();
        }
    });
    socket.on('friend-request-sent', (data) => showToast(`${t('friend_request_sent_to')} ${data.to}`));
    socket.on('friend-request-accepted', (data) => {
        showToast(`${data.from} ${t('accepted_friend_request')}!`);
        loadFriends();
        loadFriendRequests();
    });
    socket.on('friends-updated', () => { loadFriends(); loadFriendRequests(); });
    socket.on('member-action-success', (data) => {
        showToast(`${data.action} ${data.username} ${t('successful')}`);
        showRoomSettings();
        loadRoomMembers();
    });
    socket.on('boost-reset', (data) => {
        showToast(data.message);
        if (currentRoom) {
            const boostElement = document.getElementById('roomChatStats');
            if (boostElement) boostElement.innerHTML = boostElement.innerHTML.replace(/Boost: \d+/, `${t('boost')}: 0`);
        }
        socket.emit('get-room-list');
    });

    socket.on('user-typing', (data) => {
        if (currentRoom === data.room) document.getElementById('roomTypingIndicator').textContent = `${data.username} is typing...`;
    });
    socket.on('user-stop-typing', (data) => {
        if (currentRoom === data.room) document.getElementById('roomTypingIndicator').textContent = '';
    });
    socket.on('private-user-typing', (data) => {
        if (currentPrivateChat === data.from) document.getElementById('privateTypingIndicator').textContent = `${data.from} is typing...`;
    });
    socket.on('private-user-stop-typing', (data) => {
        if (currentPrivateChat === data.from) document.getElementById('privateTypingIndicator').textContent = '';
    });
}

// ==================== AUTO-LOGIN ====================
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
        await refreshUserData(true);
        setLanguage(currentLanguage);
        loadFriends(); loadFriendRequests(); loadGiftHistory();
        if (currentUser.isAdmin) {
            document.getElementById('adminSection').style.display = 'block';
            document.getElementById('adminCodeLookupSection').style.display = 'block';
        }
        showRooms();
        requestMicrophonePermission();
        restoreSession();

        setTimeout(() => loadPendingNotifications(), 1500);
        setTimeout(() => loadPrivateCode(), 1200);
    } else localStorage.removeItem('chat_token');
}

function logout() {
    localStorage.removeItem('chat_token');
    localStorage.removeItem('lastRoom');
    localStorage.removeItem('lastPrivateChat');
    localStorage.removeItem('lastView');
    window.location.reload();
}

function showManualCoinRequestModal() { document.getElementById('manualCoinRequestModal').classList.add('active'); }
function closeManualCoinRequestModal() { document.getElementById('manualCoinRequestModal').classList.remove('active'); }

// ==================== COIN HISTORY ====================
async function showCoinHistoryModal() {
    const modal = document.getElementById('coinHistoryModal');
    const listContainer = document.getElementById('coinHistoryModalList');
    listContainer.innerHTML = `<div style="text-align:center;padding:20px;color:#6b7280;">⏳ ${t('loading_history')}</div>`;
    modal.classList.add('active');

    try {
        const res = await fetch(`/api/get-coin-history?username=${encodeURIComponent(currentUser.username)}`);
        if (!res.ok) throw new Error(`Server ${res.status}`);
        const history = await res.json();
        if (!Array.isArray(history) || !history.length) {
            listContainer.innerHTML = `<div style="text-align:center;padding:20px;color:#6b7280;">📭 ${t('no_coin_history')}</div>`;
            return;
        }
        listContainer.innerHTML = history.map(item => {
            const amount = Number(item.amount) || 0;
            const isPositive = amount > 0;
            const color = isPositive ? '#10b981' : '#ef4444';
            const sign = isPositive ? '+' : '';
            const date = item.date ? new Date(item.date).toLocaleString() : 'Unknown';
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid #f1f5f9;">
                <div style="min-width:0;flex:1;">
                    <div style="font-weight:600;color:#1f2937;word-break:break-word;">${escapeHtml(item.type || 'Transaction')}</div>
                    <div style="font-size:11px;color:#6b7280;">${escapeHtml(date)}</div>
                </div>
                <div style="font-weight:700;color:${color};font-size:15px;flex-shrink:0;margin-left:12px;">
                    ${sign}${amount.toLocaleString()}
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        listContainer.innerHTML = `<div style="text-align:center;padding:20px;color:#ef4444;">❌ ${escapeHtml(err.message)}</div>`;
    }
}
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
    if (!amount || amount < 100) return alert(t('amount_min_100') || 'Amount min 100');
    const fd = new FormData();
    fd.append('username', currentUser.username);
    fd.append('amount', amount);
    fd.append('paymentMethod', method);
    fd.append('giftCardNumber', giftCardNumber);
    fd.append('cryptoTransactionId', cryptoId);
    if (file) fd.append('proofFile', file);
    const res = await fetch('/api/manual-coin-request', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) alert(t('request_submitted') || 'Submitted!');
    else alert('Error');
    closeManualCoinRequestModal();
}

// ==================== NOWPAYMENTS ====================
async function purchaseCoins(coins, name, price, method) {
    if (!currentUser) return alert('Must be logged in');
    if (method === 'nowpayment') await startCryptoPayment(coins);
    else alert('⚠️ Use Crypto or Manual Request');
}

async function startCryptoPayment(packageId) {
    try {
        showToast(t('creating_invoice') || 'Creating invoice...');
        const res = await fetch('/api/nowpayments/create-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser.username, packageId: String(packageId) })
        });
        const data = await res.json();
        if (!data.success) { alert(t('payment_error') + ': ' + (data.error || 'Unknown')); return; }
        const win = window.open(data.invoiceUrl, '_blank', 'noopener');
        if (!win) showToast(t('popup_blocked') || 'Allow pop-ups');
        pollCryptoPayment(data.orderId);
    } catch (e) { alert(t('network_error') + ': ' + e.message); }
}

function pollCryptoPayment(orderId, fromReturn = false) {
    if (!orderId) return;
    let attempts = 0;
    const MAX = 120;
    const tick = async () => {
        attempts++;
        try {
            const res = await fetch(`/api/nowpayments/status/${orderId}`);
            const data = await res.json();
            if (!data.success) return;
            if (data.credited || data.status === 'finished' || data.status === 'confirmed') {
                clearInterval(iv);
                showToast(`✅ ${t('payment_confirmed')}! +${data.coins} coins`);
                addNotification('💰 ' + t('payment_confirmed'), `${data.coins} coins`);
                await updateCoins();
                return;
            }
            if (['failed', 'expired', 'refunded'].includes(data.status)) {
                clearInterval(iv);
                showToast(`❌ Payment ${data.status}`);
                return;
            }
        } catch (_) {}
        if (attempts >= MAX) clearInterval(iv);
    };
    if (fromReturn) tick();
    const iv = setInterval(tick, 10000);
}

function handlePaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const order = params.get('order');
    if (!payment) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (payment === 'success' && order) {
        showToast('⏳ ' + (t('verifying_payment') || 'Verifying...'));
        pollCryptoPayment(order, true);
    } else if (payment === 'cancel') showToast(t('payment_cancelled') || 'Cancelled');
}

// ==================== INIT ====================
const savedLang = localStorage.getItem('app_language');
detectLanguage();
if (savedLang && translations[savedLang]) setLanguage(savedLang);
else setLanguage(currentLanguage);

const langSwitcher = document.getElementById('languageSwitcher');
if (langSwitcher) {
    langSwitcher.value = currentLanguage;
    langSwitcher.addEventListener('change', (e) => {
        setLanguage(e.target.value);
        targetLanguage = e.target.value;
        localStorage.setItem('targetLanguage', targetLanguage);
    });
}

document.getElementById('targetLanguage').addEventListener('change', function(e) {
    targetLanguage = e.target.value;
    localStorage.setItem('targetLanguage', targetLanguage);
    showToast(`${t('target_lang_set')}: ${targetLanguage}`);
});

document.getElementById('autoTranslateMessages').addEventListener('change', function(e) {
    autoTranslateMessages = e.target.checked;
    localStorage.setItem('autoTranslateMessages', String(autoTranslateMessages));
    showToast(autoTranslateMessages ? t('auto_translate_on') : t('auto_translate_off'));
});

window.addEventListener('focus', () => { if (currentUser) refreshUserData(); });
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser) refreshUserData();
});

setInterval(() => {
    if (currentUser && document.getElementById('giftsView')?.classList.contains('active')) {
        loadTargetInfo();
    }
}, 60 * 1000);

autoLogin();
handlePaymentReturn();
console.log('⚡ Chat app loaded (optimized)');

