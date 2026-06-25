// ==================== GLOBAL ====================
let socket, currentUser = null, currentRoom = null, currentPrivateChat = null, onlineUsers = [], allRooms = [];
let mediaRecorder, audioChunks = [], isRecording = false, recTarget = null, currentImageTarget = null;
let currentRoomOwner = null, currentRoomIsVip = false, youtubePlayerVisible = false, currentRoomModerators = [], currentRoomMembersOnly = false;
let peerConnection = null, localStream = null, callActive = false, pendingCallFrom = null, pendingOffer = null;
let notifications = [];
let soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
let audioCtx = null;
let ringtoneInterval = null;
let typingTimeoutRoom = null;
let typingTimeoutPrivate = null;
let speakerEnabled = false;
let csrfToken = '';
let isJoiningFromUrl = false;
let currentLanguage = 'en';
let targetLanguage = localStorage.getItem('targetLanguage') || 'en';
let autoTranslateMessages = localStorage.getItem('autoTranslateMessages') !== 'false';

// ==================== TRANSLATIONS ====================
const translations = {
    en: {
        app_name: '💬 Mokalmat Chat',
        username: 'Username',
        password: 'Password',
        login: 'Login',
        register: 'Register',
        forgot_password: 'Forgot Password?',
        create_account: 'Create Account',
        back_to_login: 'Back to Login',
        no_rooms: 'No rooms available. Create one!',
        members: 'members',
        boost: 'Boost',
        join: 'Join',
        coins: 'coins',
        sent_gift: 'sent you',
        gift_received: 'Gift Received',
        friend_request: 'Friend Request',
        from: 'from',
        admin_gave: 'Admin gave you',
        removed_you: 'removed you',
        kicked_from: 'You were kicked from',
        incoming_call: 'Incoming Call',
        is_calling: 'is calling',
        call_rejected: 'Call rejected',
        call_ended: 'Call ended',
        support_reply: 'Support Reply',
        replied_ticket: 'replied to ticket',
        ticket_resolved: 'Ticket Resolved',
        your_ticket: 'Your ticket',
        resolved: 'has been resolved',
        new_support_ticket: 'New Support Ticket',
        room_video_changed: 'Room video changed by',
        someone: 'someone',
        you_were_added_to: 'You were added to',
        you_were_removed_from: 'You were removed from',
        friend_request_sent_to: 'Friend request sent to',
        accepted_friend_request: 'accepted your friend request',
        successful: 'successful',
        new_message: 'New Message',
        joined: 'joined',
        left: 'left',
        boosted: 'boosted',
        total_boost: 'Total Boost',
        new_reply_support: 'New reply on support ticket',
        members_only: 'Members Only',
        online: 'Online',
        offline: 'Offline'
    },
    ar: {
        app_name: '💬 شات مكلمات',
        username: 'اسم المستخدم',
        password: 'كلمة المرور',
        login: 'تسجيل الدخول',
        register: 'تسجيل',
        forgot_password: 'نسيت كلمة المرور؟',
        create_account: 'إنشاء حساب',
        back_to_login: 'العودة لتسجيل الدخول',
        no_rooms: 'لا توجد غرف. أنشئ واحدة!',
        members: 'أعضاء',
        boost: 'تعزيز',
        join: 'انضمام',
        coins: 'عملات',
        sent_gift: 'أرسل لك',
        gift_received: 'هدية مستلمة',
        friend_request: 'طلب صداقة',
        from: 'من',
        admin_gave: 'المدير أعطاك',
        removed_you: 'أزالك',
        kicked_from: 'تم طردك من',
        incoming_call: 'مكالمة واردة',
        is_calling: 'يتصل',
        call_rejected: 'تم رفض المكالمة',
        call_ended: 'انتهت المكالمة',
        support_reply: 'رد الدعم',
        replied_ticket: 'رد على التذكرة',
        ticket_resolved: 'تم حل التذكرة',
        your_ticket: 'تذكرتك',
        resolved: 'تم حلها',
        new_support_ticket: 'تذكرة دعم جديدة',
        room_video_changed: 'تم تغيير فيديو الغرفة بواسطة',
        someone: 'شخص ما',
        you_were_added_to: 'تمت إضافتك إلى',
        you_were_removed_from: 'تمت إزالتك من',
        friend_request_sent_to: 'تم إرسال طلب الصداقة إلى',
        accepted_friend_request: 'قبل طلب صداقتك',
        successful: 'ناجح',
        new_message: 'رسالة جديدة',
        joined: 'انضم',
        left: 'غادر',
        boosted: 'عزز',
        total_boost: 'إجمالي التعزيز',
        new_reply_support: 'رد جديد على تذكرة الدعم',
        members_only: 'الأعضاء فقط',
        online: 'متصل',
        offline: 'غير متصل'
    }
};

// ==================== I18N ====================
function t(key) {
    if (translations[currentLanguage] && translations[currentLanguage][key]) {
        return translations[currentLanguage][key];
    }
    return key;
}

function applyLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const val = t(key);
        if (el.tagName === 'INPUT' && el.placeholder) el.placeholder = val;
        else if (el.tagName === 'BUTTON' && el.innerText) el.innerText = val;
        else el.innerText = val;
    });
    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = currentLanguage === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('app_language', currentLanguage);
    const switcher = document.getElementById('languageSwitcher');
    if (switcher) switcher.value = currentLanguage;
}

function setLanguage(lang) {
    if (!translations[lang]) return;
    currentLanguage = lang;
    applyLanguage();
}

function detectLanguage() {
    const browserLang = navigator.language.split('-')[0];
    if (translations[browserLang]) currentLanguage = browserLang;
    else currentLanguage = 'en';
}

// ==================== CSRF & FETCH ====================
async function fetchCsrfToken() {
    try {
        const res = await fetch('/api/csrf-token', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch CSRF token');
        const data = await res.json();
        csrfToken = data.csrfToken;
    } catch (e) {
        console.warn('CSRF token fetch failed', e);
    }
}

function apiFetch(url, options = {}) {
    options.headers = options.headers || {};
    options.headers['CSRF-Token'] = csrfToken;
    options.credentials = 'include';
    return fetch(url, options);
}

// ==================== XSS SAFE ====================
function setSafeHTML(element, html) {
    if (element) element.innerHTML = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'span', 'img', 'audio', 'video', 'source', 'div'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'controls', 'preload', 'autoplay', 'muted', 'loop', 'data-src', 'data-username', 'style'],
        FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur']
    });
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ==================== HELPERS ====================
function normalizeUsername(u) { return (u || '').toLowerCase(); }

function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast-notification';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function updateVipBadge() {
    const badge = document.getElementById('headerVipBadge');
    if (currentUser && currentUser.isVIP) badge.style.display = 'inline-block';
    else badge.style.display = 'none';
}

function showGiftTicker(sender, receiver, amount) {
    const container = document.getElementById('giftTicker');
    const text = document.getElementById('tickerText');
    if (!container || !text) return;
    text.textContent = `🎁 ${sender} sent ${amount} coins to ${receiver}!`;
    container.classList.remove('active');
    void container.offsetWidth;
    container.classList.add('active');
    setTimeout(() => container.classList.remove('active'), 8000);
}

function saveSessionState() {
    if (currentUser) {
        localStorage.setItem('lastUser', currentUser.username);
        if (currentRoom) localStorage.setItem('lastRoom', currentRoom);
        else localStorage.removeItem('lastRoom');
    }
}

async function restoreSession() {
    const lastRoom = localStorage.getItem('lastRoom');
    if (lastRoom && socket) socket.emit('join-room', lastRoom);
}

async function refreshUserData() {
    const res = await fetch('/api/auto-login', { credentials: 'include' });
    const data = await res.json();
    if (data.success) {
        currentUser = data.user;
        document.getElementById('coinBalance').innerHTML = `💰 ${currentUser.coins}`;
        updateProfilePic();
        await checkAndUpdateVIPStatus();
        if (currentUser.isAdmin) document.getElementById('adminSection').style.display = 'block';
    }
}

async function checkAndUpdateVIPStatus() {
    if (!currentUser) return;
    const res = await fetch('/api/get-vip-status', { credentials: 'include' });
    const data = await res.json();
    currentUser.isVIP = data.isVIP;
    updateVipBadge();
    const vipDisplay = document.getElementById('vipStatusDisplay');
    if (vipDisplay) {
        if (data.isVIP) {
            const expiry = data.expires ? new Date(data.expires).toLocaleDateString() : 'soon';
            vipDisplay.innerHTML = `✅ VIP Active until ${expiry}`;
        } else {
            vipDisplay.innerHTML = '❌ No active VIP subscription';
        }
    }
}

function canCreateVipRoom() {
    return currentUser && currentUser.isVIP;
}

function showCreateRoomModal() {
    document.getElementById('createRoomModal').classList.add('active');
}

function createRoom() {
    const name = document.getElementById('newRoomName').value.trim();
    if (!name || name.length < 3) return alert('Room name must be at least 3 characters');
    const isVip = document.getElementById('isVipRoom').checked;
    if (isVip && !canCreateVipRoom()) return alert('You need VIP to create a VIP room.');
    socket.emit('create-room', { roomName: name, isVipRoom: isVip });
}

function closeCreateRoomModal() {
    document.getElementById('createRoomModal').classList.remove('active');
}

// ==================== NOTIFICATIONS & SOUND ====================
function playNotificationSound() {
    if (!soundEnabled) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.1;
        oscillator.start();
        setTimeout(() => oscillator.stop(), 150);
    } catch (e) { /* ignore */ }
}

function startRingtone() {
    if (!soundEnabled) return;
    if (ringtoneInterval) return;
    ringtoneInterval = setInterval(() => {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = 440;
            osc.type = 'square';
            gain.gain.value = 0.08;
            osc.start();
            setTimeout(() => osc.stop(), 200);
        } catch (e) { /* ignore */ }
    }, 600);
}

function stopRingtone() {
    if (ringtoneInterval) { clearInterval(ringtoneInterval);
        ringtoneInterval = null; }
}

function addNotification(title, message, onClickData) {
    notifications.unshift({ title, message, time: new Date().toLocaleTimeString(), onClickData });
    if (notifications.length > 30) notifications.pop();
    updateNotificationUI();
    const badge = document.getElementById('notificationBadge');
    if (badge) { badge.style.display = 'flex';
        badge.innerText = notifications.length; }
    if (title === 'New Message' || title === 'Friend Request' || title === 'Gift Received' || title === 'Support Reply' || title === 'Ticket Resolved')
        showToast(`${title}: ${message}`);
}

function clearAllNotifications() {
    notifications = [];
    updateNotificationUI();
    document.getElementById('notificationBadge').style.display = 'none';
}

function updateNotificationUI() {
    const list = document.getElementById('notificationsList');
    if (!list) return;
    if (notifications.length === 0) {
        list.innerHTML = '<div style="padding:16px;color:#6b7280;text-align:center;">No notifications</div>';
        return;
    }
    list.innerHTML = notifications.map((n, i) =>
        `<div class="notification-item" data-index="${i}">
            <div><strong>${escapeHtml(n.title)}</strong></div>
            <div>${escapeHtml(n.message)}</div>
            <div class="time">${escapeHtml(n.time)}</div>
        </div>`
    ).join('');
}

function handleNotificationClick(idx) {
    const data = notifications[idx]?.onClickData;
    if (!data) return;
    if (data.type === 'private_message') {
        showPrivateChat(data.from);
    } else if (data.type === 'support_ticket') {
        if (currentUser.isAdmin) {
            openReplyTicketModal(data.ticketId);
        } else {
            openViewTicketModal(data.ticketId);
        }
    }
    document.getElementById('notificationDropdown').classList.remove('active');
}

function toggleNotifications() {
    const dropdown = document.getElementById('notificationDropdown');
    dropdown.classList.toggle('active');
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

// ==================== URL ROUTE HANDLER ====================
function handleDirectUrl() {
    const path = window.location.pathname;
    let roomName = null;

    // Check for /chat/roomname
    const match = path.match(/^\/chat\/(.+)$/);
    if (match) {
        roomName = decodeURIComponent(match[1]);
    }

    // Check for ?room=roomname
    const params = new URLSearchParams(window.location.search);
    if (!roomName && params.has('room')) {
        roomName = params.get('room');
    }

    // Check for #chat/roomname
    if (!roomName) {
        const hashMatch = window.location.hash.match(/^#chat\/(.+)$/);
        if (hashMatch) {
            roomName = decodeURIComponent(hashMatch[1]);
        }
    }

    if (roomName && socket && socket.connected) {
        console.log(`🔗 Joining room from URL: ${roomName}`);
        isJoiningFromUrl = true;
        // Show loading
        const container = document.getElementById('roomMessages');
        if (container) {
            container.innerHTML = '<div class="system-message">⏳ Loading chat history...</div>';
        }
        socket.emit('join-room', roomName);
        localStorage.setItem('lastRoom', roomName);
        // Update URL without reload
        if (window.history && window.history.replaceState) {
            window.history.replaceState({}, '', `/chat/${encodeURIComponent(roomName)}`);
        }
        return true;
    }
    return false;
}

// ==================== AUTH ====================
async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const res = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
        currentUser = data.user;
        document.getElementById('currentUsername').innerHTML = escapeHtml(currentUser.username);
        document.getElementById('coinBalance').innerHTML = `💰 ${currentUser.coins}`;
        updateProfilePic();
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainContainer').style.display = 'flex';
        await fetchCsrfToken();
        initSocket();
        await refreshUserData();
        await checkAndUpdateVIPStatus();
        loadFriends();
        loadFriendRequests();
        loadGiftHistory();
        if (currentUser.isAdmin) {
            document.getElementById('adminSection').style.display = 'block';
        }
        showRooms();
        requestMicrophonePermission();
        restoreSession();

        // Handle direct URL after socket connects
        setTimeout(() => {
            if (socket && socket.connected) {
                handleDirectUrl();
            } else {
                socket?.once('connect', () => {
                    setTimeout(handleDirectUrl, 500);
                });
            }
        }, 1000);
    } else {
        alert('Login failed: ' + data.error);
    }
}

async function register() {
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    const gender = document.getElementById('regGender').value;
    const securityQuestion = document.getElementById('regSecurityQuestion').value;
    const securityAnswer = document.getElementById('regSecurityAnswer').value;
    if (!username || !password || !securityQuestion || !securityAnswer) return alert('All fields required');
    const res = await apiFetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, gender, securityQuestion, securityAnswer })
    });
    const data = await res.json();
    if (data.success) { alert('Registered! Please login.');
        showLogin(); } else alert('Registration failed: ' + data.error);
}

function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('registerScreen').style.display = 'none';
    document.getElementById('forgotScreen').style.display = 'none';
}

function showRegister() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('registerScreen').style.display = 'flex';
    document.getElementById('forgotScreen').style.display = 'none';
}

function showForgotPassword() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('registerScreen').style.display = 'none';
    document.getElementById('forgotScreen').style.display = 'flex';
}

async function getSecurityQuestion() {
    const username = document.getElementById('resetUsername').value.trim();
    if (!username) return alert('Enter username');
    const res = await apiFetch('/api/get-security-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (data.success) {
        document.getElementById('questionText').innerText = data.question;
        document.getElementById('securityQuestionDiv').style.display = 'block';
    } else {
        alert('User not found');
    }
}

async function resetPassword() {
    const username = document.getElementById('resetUsername').value.trim();
    const answer = document.getElementById('resetAnswer').value.trim();
    const newPass = document.getElementById('newPassword').value;
    if (!username || !answer || !newPass) return alert('Fill all fields');
    const res = await apiFetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, answer, newPassword: newPass })
    });
    const data = await res.json();
    if (data.success) {
        alert('Password reset successfully!');
        showLogin();
    } else {
        alert(data.error || 'Reset failed');
    }
}

function updateProfilePic() {
    const pic = document.getElementById('profilePic');
    if (!pic) return;
    if (currentUser && currentUser.profile_pic) {
        const val = currentUser.profile_pic;
        if (typeof val === 'string' && val.startsWith('data:image')) {
            pic.innerHTML = `<img src="${escapeHtml(val)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else if (typeof val === 'string' && val.startsWith('/uploads')) {
            pic.innerHTML = `<img src="${escapeHtml(val)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none';this.parentElement.innerHTML='👤';">`;
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
        if (file.size > 2 * 1024 * 1024) {
            alert('Image too large (max 2MB)');
            return;
        }
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const base64Data = ev.target.result;
            try {
                const res = await apiFetch('/api/upload-profile-pic-base64', {
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
    document.getElementById('roomsView').style.display = 'flex';
    document.getElementById('friendsView').classList.remove('active');
    document.getElementById('giftsView').classList.remove('active');
    document.getElementById('roomChatView').classList.remove('active');
    document.getElementById('privateChatView').classList.remove('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('navRooms').classList.add('active');
    socket.emit('get-room-list');
}

function showFriends() {
    document.getElementById('roomsView').style.display = 'none';
    document.getElementById('friendsView').classList.add('active');
    document.getElementById('giftsView').classList.remove('active');
    document.getElementById('roomChatView').classList.remove('active');
    document.getElementById('privateChatView').classList.remove('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('navFriends').classList.add('active');
    loadFriends();
    loadFriendRequests();
}

function showGifts() {
    document.getElementById('roomsView').style.display = 'none';
    document.getElementById('friendsView').classList.remove('active');
    document.getElementById('giftsView').classList.add('active');
    document.getElementById('roomChatView').classList.remove('active');
    document.getElementById('privateChatView').classList.remove('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('navGifts').classList.add('active');
    loadGiftHistory();
}

function showRoomChat() {
    document.getElementById('roomsView').style.display = 'none';
    document.getElementById('friendsView').classList.remove('active');
    document.getElementById('giftsView').classList.remove('active');
    document.getElementById('roomChatView').classList.add('active');
    document.getElementById('privateChatView').classList.remove('active');
}

function showPrivateChat(username) {
    if (!username) return;
    currentPrivateChat = username;
    document.getElementById('privateChatName').innerHTML = escapeHtml(username);
    document.getElementById('privateMessages').innerHTML = '';
    document.getElementById('privateChatView').classList.add('active');
    document.getElementById('roomChatView').classList.remove('active');
    document.getElementById('roomsView').style.display = 'none';
    document.getElementById('friendsView').classList.remove('active');
    document.getElementById('giftsView').classList.remove('active');
    updatePrivateStatus();
}

function closePrivateChat() {
    currentPrivateChat = null;
    document.getElementById('privateChatView').classList.remove('active');
    showFriends();
}

function leaveRoom() {
    if (currentRoom) {
        socket.emit('leave-room');
        currentRoom = null;
        currentRoomOwner = null;
        currentRoomIsVip = false;
        currentRoomModerators = [];
        currentRoomMembersOnly = false;
        document.getElementById('roomChatView').classList.remove('active');
        showRooms();
        saveSessionState();
    }
}

function updatePrivateStatus() {
    if (currentPrivateChat && onlineUsers.includes(currentPrivateChat)) {
        document.getElementById('privateChatStatus').innerHTML = '🟢 Online';
    } else {
        document.getElementById('privateChatStatus').innerHTML = '🔴 Offline';
    }
}

function displayRooms(rooms) {
    const container = document.getElementById('roomsList');
    if (!rooms.length) { container.innerHTML = `<div style="text-align:center;padding:40px;">${escapeHtml(t('no_rooms'))}</div>`; return; }
    const sorted = [...rooms].sort((a, b) => b.boostLevel - a.boostLevel);
    let html = '';
    sorted.forEach(room => {
        const isTop = sorted[0].boostLevel === room.boostLevel && room.boostLevel > 0;
        const vipTag = room.isVipRoom ? ' 💎' : '';
        const membersOnlyTag = room.membersOnly ? ` <span class="members-only-badge">🔒 ${escapeHtml(t('members_only'))}</span>` : '';
        const nameClass = room.isVipRoom ? 'vip-room-name' : '';
        html += `<div class="room-card ${isTop ? 'boosted' : ''}"><div class="room-card-info"><h4 class="${nameClass}">#${escapeHtml(room.name)}${vipTag}${membersOnlyTag} ${room.boostLevel > 0 ? '🚀' : ''}</h4><p>👥 ${room.members} ${escapeHtml(t('members'))} | 🚀 ${escapeHtml(t('boost'))}: ${room.boostLevel}</p></div><button class="join-btn" data-room="${escapeHtml(room.name)}">${escapeHtml(t('join'))}</button></div>`;
    });
    setSafeHTML(container, html);
}

function filterRooms() {
    const query = document.getElementById('roomSearch').value.toLowerCase();
    const filtered = allRooms.filter(r => r.name.toLowerCase().includes(query));
    displayRooms(filtered);
}

function joinRoom(name) {
    // Clear messages before joining
    document.getElementById('roomMessages').innerHTML = '';
    // Show loading indicator
    const loadingEl = document.createElement('div');
    loadingEl.id = 'roomLoadingIndicator';
    loadingEl.className = 'system-message';
    loadingEl.textContent = '⏳ Loading chat history...';
    document.getElementById('roomMessages').appendChild(loadingEl);
    socket.emit('join-room', name);
    saveSessionState();
}

// ==================== MESSAGE RENDERING (SECURE) ====================
async function translateAndDisplayMessage(msg, containerId, isSentByMe) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const div = document.createElement('div');
    div.className = `message-wrapper ${isSentByMe ? 'sent' : 'received'}`;
    let content = '';
    const safeMsg = escapeHtml(msg.message);
    if (msg.type === 'image') {
        if (msg.message.startsWith('/uploads/') || msg.message.startsWith('data:image')) {
            content = `<img src="${escapeHtml(msg.message)}" class="message-img" data-src="${escapeHtml(msg.message)}">`;
        } else {
            content = '[Invalid image]';
        }
    } else if (msg.type === 'audio') {
        if (msg.message.startsWith('/uploads/')) {
            content = `<audio controls src="${escapeHtml(msg.message)}" class="message-audio" preload="metadata"></audio>`;
        } else {
            content = '[Invalid audio]';
        }
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
    content = DOMPurify.sanitize(content, { ALLOWED_TAGS: ['br', 'span', 'img', 'audio'], ALLOWED_ATTR: ['src', 'class', 'controls', 'preload', 'data-src', 'style'] });

    let avatarHtml = '👤';
    if (msg.profilePic) {
        if (typeof msg.profilePic === 'string' && msg.profilePic.startsWith('data:image')) {
            avatarHtml = `<img src="${escapeHtml(msg.profilePic)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else if (typeof msg.profilePic === 'string' && msg.profilePic.startsWith('/uploads')) {
            avatarHtml = `<img src="${escapeHtml(msg.profilePic)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none';this.parentElement.innerHTML='👤';">`;
        } else {
            avatarHtml = escapeHtml(msg.profilePic);
        }
    }
    const displayName = escapeHtml(msg.from || msg.username);
    const username = msg.username || msg.from;
    const isOwner = username === currentRoomOwner;
    const isMod = currentRoomModerators && currentRoomModerators.includes(username);
    let senderClass = '';
    if (isOwner) senderClass = 'owner';
    else if (isMod) senderClass = 'moderator';
    const html = `<div class="message-avatar" data-username="${escapeHtml(username)}">${avatarHtml}</div>
        <div class="message-bubble">
            <div class="message-sender ${senderClass}">${displayName}${msg.isVIP ? '<span class="vip-diamond">💎</span>' : ''}${isOwner ? ' 👑' : ''}${isMod ? ' <span class="moderator-badge">MOD</span>' : ''}</div>
            <div class="message-text">${content}</div>
            <div class="message-time">${escapeHtml(msg.timestamp)}</div>
        </div>`;
    setSafeHTML(div, html);
    container.appendChild(div);
    div.scrollIntoView({ behavior: 'smooth' });
}

function addRoomMessage(msg) {
    translateAndDisplayMessage(msg, 'roomMessages', msg.username === currentUser.username);
}

function sendRoomMessage() {
    const msg = document.getElementById('roomMessageInput').value.trim();
    if (msg && currentRoom) {
        if (msg.length > 5000) { alert('Message too long'); return; }
        socket.emit('room-message', { username: currentUser.username, message: escapeHtml(msg), room: currentRoom, type: 'text' });
        document.getElementById('roomMessageInput').value = '';
    }
}

function addPrivateMessage(msg) {
    translateAndDisplayMessage(msg, 'privateMessages', msg.from === currentUser.username);
}

function sendPrivateMessage() {
    if (!currentPrivateChat) return;
    const msg = document.getElementById('privateMessageInput').value.trim();
    if (msg) {
        if (msg.length > 5000) { alert('Message too long'); return; }
        socket.emit('private-message', { from: currentUser.username, to: currentPrivateChat, message: escapeHtml(msg) });
        document.getElementById('privateMessageInput').value = '';
    }
}

function openLightbox(src) {
    if (src.startsWith('/uploads/') || src.startsWith('data:image')) {
        document.getElementById('lightboxImg').src = escapeHtml(src);
        document.getElementById('imageLightbox').classList.add('active');
    } else {
        showToast('Invalid image');
    }
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
            const blob = new Blob(audioChunks, { type: 'audio/webm' }),
                fd = new FormData();
            fd.append('audio', blob, 'recording.webm');
            const res = await apiFetch('/api/upload-voice', { method: 'POST', body: fd });
            const data = await res.json();
            if (data.url) {
                if (target === 'room' && currentRoom) socket.emit('room-message', { username: currentUser.username, message: data.url, room: currentRoom, type: 'audio' });
                else if (target === 'private' && currentPrivateChat) socket.emit('private-message', { from: currentUser.username, to: currentPrivateChat, message: data.url, type: 'audio' });
            }
            stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        isRecording = true;
        recTarget = target;
        const btn = target === 'room' ? document.getElementById('roomVoiceBtn') : document.getElementById('privateVoiceBtn');
        if (btn) btn.classList.add('recording');
    } catch (e) { alert('Microphone access needed'); }
}

function stopRecording() {
    if (mediaRecorder && isRecording) { mediaRecorder.stop();
        isRecording = false;
        const btn = recTarget === 'room' ? document.getElementById('roomVoiceBtn') : document.getElementById('privateVoiceBtn'); if (btn) btn.classList.remove('recording'); }
}

function toggleRoomRecording() { if (isRecording && recTarget === 'room') stopRecording();
    else startRecording('room'); }

function togglePrivateRecording() { if (isRecording && recTarget === 'private') stopRecording();
    else startRecording('private'); }

// ==================== IMAGE SHARING ====================
function sendRoomImage() { currentImageTarget = 'room';
    document.getElementById('imageModal').classList.add('active'); }

function sendPrivateImage() { currentImageTarget = 'private';
    document.getElementById('imageModal').classList.add('active'); }

function closeImageModal() { document.getElementById('imageModal').classList.remove('active'); }

async function uploadImage() {
    const file = document.getElementById('imageFile').files[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Image too large (max 2MB)'); return; }
    const fd = new FormData();
    fd.append('roomImage', file);
    const res = await apiFetch('/api/upload-room-image', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
        if (currentImageTarget === 'room' && currentRoom) socket.emit('room-message', { username: currentUser.username, message: data.imageUrl, room: currentRoom, type: 'image' });
        else if (currentImageTarget === 'private' && currentPrivateChat) socket.emit('private-message', { from: currentUser.username, to: currentPrivateChat, message: data.imageUrl, type: 'image' });
        closeImageModal();
        document.getElementById('imageFile').value = '';
    }
}

// ==================== GIFTS & COINS ====================
async function sendGift() {
    const to = document.getElementById('giftToUser').value.trim(),
        amount = parseInt(document.getElementById('giftAmountSelect').value),
        message = document.getElementById('giftMessage').value.trim();
    if (!to || !amount) return alert('Enter recipient and amount');
    if (to === currentUser.username) return alert('You cannot send a gift to yourself.');
    const res = await apiFetch('/api/send-gift', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: currentUser.username, to, amount, message }) });
    const data = await res.json();
    if (data.success) { alert(`Gift sent!`);
        updateCoins();
        loadGiftHistory();
        closeSendGiftModal();
        addNotification(t('gift_received'), `You sent ${amount} coins to ${to}`);
        showGiftTicker(currentUser.username, to, amount); } else alert(data.error);
}

async function loadGiftHistory() {
    const res = await apiFetch('/api/get-gifts');
    const gifts = await res.json();
    const myGifts = gifts.filter(g => g.to === currentUser.username || g.from === currentUser.username);
    const container = document.getElementById('giftHistoryList');
    if (!myGifts.length) container.innerHTML = '<div>No gifts yet.</div>';
    else container.innerHTML = myGifts.map(g => {
        const from = escapeHtml(g.from);
        const to = escapeHtml(g.to);
        const msg = escapeHtml(g.message);
        return `<div>${from} → ${to}: ${g.amount}<br>${msg}</div>`;
    }).join('');
}

function showSendGiftModal() { document.getElementById('sendGiftModal').classList.add('active'); }

function closeSendGiftModal() { document.getElementById('sendGiftModal').classList.remove('active'); }

// ==================== FRIENDS ====================
async function loadFriends() {
    const res = await apiFetch('/api/get-friends');
    const friends = await res.json();
    const container = document.getElementById('friendsList');
    if (!friends.length) { container.innerHTML = '<div>No friends yet.</div>'; return; }
    container.innerHTML = friends.map(f =>
        `<div class="room-card"><div class="room-card-info"><h4>${escapeHtml(f.username)}${f.isVIP ? ' 💎' : ''}</h4><p>${f.isOnline ? '🟢 Online' : '🔴 Offline'}</p></div><button class="delete-friend-btn" data-friend="${escapeHtml(f.username)}">✖ Remove</button></div>`
    ).join('');
}

async function loadFriendRequests() {
    const res = await apiFetch('/api/get-friend-requests');
    const requests = await res.json();
    const container = document.getElementById('friendRequestsList');
    if (!requests.length) { container.innerHTML = '<div>No requests.</div>'; return; }
    container.innerHTML = requests.map(r =>
        `<div class="friend-request-item"><span>${escapeHtml(r.from)}</span><div><button data-from="${escapeHtml(r.from)}" class="accept-friend-btn">Accept</button></div></div>`
    ).join('');
}

async function acceptFriendRequest(from) {
    socket.emit('accept-friend-request-socket', { from, username: currentUser.username });
}

async function deleteFriend(friend) {
    const res = await apiFetch('/api/delete-friend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friend }) });
    const data = await res.json();
    if (data.success) { loadFriends();
        showToast('Friend removed'); }
}

async function sendFriendRequest(to) {
    socket.emit('send-friend-request-socket', { from: currentUser.username, to });
}

async function searchUsers() {
    const query = document.getElementById('friendSearch').value.trim();
    if (!query) return;
    const res = await apiFetch('/api/get-all-users');
    const users = await res.json();
    const results = users.filter(u => u.username.includes(query.toLowerCase()) && u.username !== currentUser.username);
    const container = document.getElementById('searchResults');
    if (!results.length) { container.style.display = 'block';
        container.innerHTML = '<div>No users found.</div>'; return; }
    container.style.display = 'block';
    container.innerHTML = results.map(u =>
        `<div class="search-result-item"><span>${escapeHtml(u.username)}</span><button class="send-req-btn" data-to="${escapeHtml(u.username)}">➕ Add</button></div>`
    ).join('');
}

// ==================== COINS & VIP ====================
function updateCoins() {
    if (currentUser) document.getElementById('coinBalance').innerHTML = `💰 ${currentUser.coins}`;
}

async function buyVIP() {
    const res = await apiFetch('/api/buy-vip', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
        currentUser.coins = data.newCoins;
        updateCoins();
        await checkAndUpdateVIPStatus();
        alert('VIP purchased!');
    } else {
        alert(data.error || 'Failed to buy VIP');
    }
}

function showBoostModal() { document.getElementById('boostModal').classList.add('open'); }

function closeBoostModal() { document.getElementById('boostModal').classList.remove('open'); }

function boostRoom() {
    const amount = parseInt(document.getElementById('boostAmount').value);
    if (!currentRoom) return alert('Join a room first');
    socket.emit('boost-room', { roomName: currentRoom, amount });
    closeBoostModal();
}

// ==================== ROOM MANAGEMENT ====================
async function loadRoomMembers() {
    if (!currentRoom) return;
    const res = await fetch(`/api/get-room-members/${encodeURIComponent(currentRoom)}`, { credentials: 'include' });
    const members = await res.json();
    const container = document.getElementById('roomMembersList');
    container.innerHTML = members.map(m =>
        `<div class="user-item">
            <div class="user-avatar" data-username="${escapeHtml(m.username)}">${m.profile_pic ? `<img src="${escapeHtml(m.profile_pic)}">` : '👤'}</div>
            <span>${escapeHtml(m.username)}${m.isVIP ? ' 💎' : ''}${m.isOwner ? ' 👑' : ''}${m.isModerator ? ' MOD' : ''}</span>
            ${m.isOnline ? '<span class="online-status">●</span>' : '<span class="offline-status">○</span>'}
        </div>`
    ).join('');
}

async function kickUserFromRoom(username, roomName) {
    if (!confirm(`Kick and ban ${username} from this room?`)) return;
    const res = await apiFetch('/api/kick-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName, username }) });
    const data = await res.json();
    if (data.success) { showToast(`${username} kicked and banned.`);
        loadRoomMembers(); } else alert(data.error || 'Failed');
}

async function unbanUserFromRoom(username, roomName) {
    const res = await apiFetch('/api/unban-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName, username }) });
    const data = await res.json();
    if (data.success) { showToast(`${username} unbanned.`);
        showKickListModal(); }
}

function showBanUserModal() { document.getElementById('banUserModal').classList.add('active'); }

function closeBanUserModal() { document.getElementById('banUserModal').classList.remove('active'); }

function executeBanUser() {
    const username = document.getElementById('banUsername').value.trim();
    if (!username || !currentRoom) return alert('Enter username');
    kickUserFromRoom(username, currentRoom);
    closeBanUserModal();
    document.getElementById('banUsername').value = '';
}

async function showKickListModal() {
    if (!currentRoom) return;
    const room = await fetch(`/api/room-settings/${encodeURIComponent(currentRoom)}`, { credentials: 'include' }).then(r => r.json());
    const kicked = room.kicked || [];
    const container = document.getElementById('kickedUsersList');
    if (!kicked.length) container.innerHTML = '<div>No banned users.</div>';
    else container.innerHTML = kicked.map(u =>
        `<div>${escapeHtml(u)} <button class="unban-btn" data-room="${escapeHtml(currentRoom)}" data-username="${escapeHtml(u)}">Unban</button></div>`
    ).join('');
    document.getElementById('kickListModal').classList.add('active');
}

function closeKickListModal() { document.getElementById('kickListModal').classList.remove('active'); }

// ==================== ROOM SETTINGS ====================
async function showRoomSettings() {
    if (!currentRoom) return;
    const res = await fetch(`/api/room-settings/${encodeURIComponent(currentRoom)}`, { credentials: 'include' });
    const data = await res.json();
    if (!data) return;
    document.getElementById('membersOnlyToggle').checked = data.membersOnly || false;
    renderMemberManageList(data.allowedMembers || [], data.moderators || [], data.owner);
    document.getElementById('roomSettingsModal').classList.add('active');
}

function renderMemberManageList(members, mods, owner) {
    const container = document.getElementById('roomMemberManageList');
    if (!members.length) { container.innerHTML = '<div>No members in allow list.</div>'; return; }
    container.innerHTML = members.map(u => {
        const isMod = mods.includes(u);
        const isOwner = u === owner;
        return `<div class="user-item">
            <span>${escapeHtml(u)}${isOwner ? ' 👑' : ''}${isMod ? ' MOD' : ''}</span>
            ${!isOwner ? `<button class="mod-btn" data-user="${escapeHtml(u)}" data-action="${isMod ? 'remove' : 'add'}">${isMod ? 'Remove MOD' : 'Make MOD'}</button>` : ''}
            <button class="kick-btn" data-user="${escapeHtml(u)}" data-action="remove">Remove</button>
        </div>`;
    }).join('');
}

async function toggleMembersOnly() {
    if (!currentRoom) return;
    await apiFetch('/api/room-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName: currentRoom, action: 'toggleMembersOnly' }) });
}

async function addRoomMember() {
    const username = document.getElementById('addMemberUsername').value.trim();
    if (!username || !currentRoom) return;
    const res = await apiFetch('/api/room-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName: currentRoom, action: 'addMember', username }) });
    if (res.ok) { document.getElementById('addMemberUsername').value = '';
        showRoomSettings(); }
}

async function removeRoomMember(username) {
    if (!currentRoom || !confirm(`Remove ${username} from allowed list?`)) return;
    await apiFetch('/api/room-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName: currentRoom, action: 'removeMember', username }) });
    showRoomSettings();
}

async function setModerator(username) {
    if (!currentRoom) return;
    await apiFetch('/api/room-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName: currentRoom, action: 'setModerator', username }) });
    showRoomSettings();
}

async function removeModerator(username) {
    if (!currentRoom) return;
    await apiFetch('/api/room-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName: currentRoom, action: 'removeModerator', username }) });
    showRoomSettings();
}

function closeRoomSettingsModal() { document.getElementById('roomSettingsModal').classList.remove('active'); }

// ==================== CALL ====================
async function startCall() {
    if (!currentPrivateChat) return;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        document.getElementById('localVideo').srcObject = localStream;
        peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        peerConnection.ontrack = (event) => { document.getElementById('remoteVideo').srcObject = event.streams[0]; };
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', { to: currentPrivateChat, candidate: event.candidate, from: currentUser.username });
            }
        };
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('call-user', { to: currentPrivateChat, offer: offer, from: currentUser.username });
        callActive = true;
        document.getElementById('callModal').classList.add('active');
    } catch (e) { alert('Call setup failed: ' + e.message); }
}

async function acceptCall() {
    if (!pendingCallFrom || !pendingOffer) return;
    stopRingtone();
    document.getElementById('incomingCallBar').classList.remove('active');
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        document.getElementById('localVideo').srcObject = localStream;
        peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        peerConnection.ontrack = (event) => { document.getElementById('remoteVideo').srcObject = event.streams[0]; };
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', { to: pendingCallFrom, candidate: event.candidate, from: currentUser.username });
            }
        };
        await peerConnection.setRemoteDescription(new RTCSessionDescription(pendingOffer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('accept-call', { to: pendingCallFrom, answer: answer, from: currentUser.username });
        callActive = true;
        pendingCallFrom = null;
        pendingOffer = null;
        document.getElementById('callModal').classList.add('active');
    } catch (e) { alert('Accept call failed: ' + e.message); }
}

function rejectCall() {
    if (pendingCallFrom) {
        socket.emit('reject-call', { to: pendingCallFrom, from: currentUser.username });
        pendingCallFrom = null;
        pendingOffer = null;
        document.getElementById('incomingCallBar').classList.remove('active');
        stopRingtone();
    }
}

function endCall() {
    if (peerConnection) peerConnection.close();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    callActive = false;
    document.getElementById('callModal').classList.remove('active');
    if (currentPrivateChat) socket.emit('end-call', { to: currentPrivateChat, from: currentUser.username });
    document.getElementById('localVideo').srcObject = null;
    document.getElementById('remoteVideo').srcObject = null;
    stopRingtone();
}

function toggleSpeaker() {
    speakerEnabled = !speakerEnabled;
    const video = document.getElementById('remoteVideo');
    if (video) video.muted = speakerEnabled;
    document.getElementById('speakerBtn').innerHTML = speakerEnabled ? '🔇' : '🔊';
}

function toggleCallAudio() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            document.getElementById('callMuteBtn').innerHTML = audioTrack.enabled ? '🎤 Mute' : '🔇 Unmute';
        }
    }
}

function toggleCallVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            document.getElementById('callVideoBtn').innerHTML = videoTrack.enabled ? '📹 Video' : '📷 No Video';
        }
    }
}

// ==================== YOUTUBE ====================
function toggleYouTubePlayer() {
    const container = document.getElementById('youtubePlayerContainer');
    youtubePlayerVisible = !youtubePlayerVisible;
    container.classList.toggle('active', youtubePlayerVisible);
}

async function searchAndPlayYouTube() {
    const input = document.getElementById('youtubeSearchInput').value.trim();
    if (!input) return;
    let videoId;
    const urlMatch = input.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
    if (urlMatch) { videoId = urlMatch[1]; } else {
        // search
        const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(input)}&key=YOUR_API_KEY&type=video&maxResults=1`);
        const data = await res.json();
        if (data.items && data.items.length) videoId = data.items[0].id.videoId;
        else { alert('No video found'); return; }
    }
    updateYouTubeVideo(videoId);
    socket.emit('sync-youtube', { room: currentRoom, videoId, by: currentUser.username });
}

function updateYouTubeVideo(videoId) {
    const iframe = document.getElementById('youtubeIframe');
    iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
    showToast('Video updated');
}

// ==================== USER PROFILE ====================
async function showUserProfile(username) {
    const res = await fetch(`/api/user-profile?username=${encodeURIComponent(username)}`, { credentials: 'include' });
    const data = await res.json();
    if (!data.success) return alert('User not found');
    const p = data.profile;
    const container = document.getElementById('profileContent');
    const html = `<div class="profile-card">
        <div class="profile-avatar">${p.profile_pic ? `<img src="${escapeHtml(p.profile_pic)}">` : '👤'}</div>
        <div class="profile-name">${escapeHtml(p.username)}${p.isVIP ? ' 💎' : ''}</div>
        <div class="profile-status">${p.isOnline ? '🟢 Online' : '🔴 Offline'}</div>
        <div class="profile-info">Gender: ${escapeHtml(p.gender)} | Coins: ${p.coins}</div>
        ${p.isFriend ? '<button onclick="deleteFriend(\''+p.username+'\')">Remove Friend</button>' : '<button onclick="sendFriendRequest(\''+p.username+'\')">Add Friend</button>'}
    </div>`;
    setSafeHTML(container, html);
    document.getElementById('profileModal').classList.add('active');
}

function closeProfileModal() { document.getElementById('profileModal').classList.remove('active'); }

// ==================== ADMIN FUNCTIONS ====================
async function showAllUsers() {
    const res = await fetch('/api/admin/get-all-users', { credentials: 'include' });
    const users = await res.json();
    const container = document.getElementById('allUsersList');
    container.innerHTML = users.map(u =>
        `<div class="user-item"><span>${escapeHtml(u.username)} ${u.isAdmin ? '👑' : ''}</span><button data-username="${escapeHtml(u.username)}" class="admin-delete-user">Delete</button></div>`
    ).join('');
    document.getElementById('usersModal').classList.add('active');
}

async function deleteUser(username) {
    if (!confirm(`Delete user ${username}?`)) return;
    await apiFetch('/api/delete-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
    showAllUsers();
}

async function showAllRooms() {
    const res = await fetch('/api/get-all-rooms', { credentials: 'include' });
    const rooms = await res.json();
    const container = document.getElementById('allRoomsList');
    container.innerHTML = rooms.map(r =>
        `<div class="user-item"><span>#${escapeHtml(r.name)} (${r.members.length} members)</span><button data-room="${escapeHtml(r.name)}" class="admin-delete-room">Delete</button></div>`
    ).join('');
    document.getElementById('roomsModal').classList.add('active');
}

async function deleteRoom(roomName) {
    if (!confirm(`Delete room ${roomName}?`)) return;
    await apiFetch('/api/delete-room', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName }) });
    showAllRooms();
}

async function showAllGifts() {
    const res = await fetch('/api/get-gifts', { credentials: 'include' });
    const gifts = await res.json();
    const container = document.getElementById('allGiftsList');
    container.innerHTML = gifts.map(g =>
        `<div>${escapeHtml(g.from)} → ${escapeHtml(g.to)}: ${g.amount} coins</div>`
    ).join('');
    document.getElementById('giftsModal').classList.add('active');
}

function clearAllFriendRequests() {
    if (!confirm('Clear all friend requests?')) return;
    apiFetch('/api/clear-friend-requests', { method: 'POST' }).then(() => loadFriendRequests());
}

function clearAllCoinRequests() {
    if (!confirm('Clear all coin history?')) return;
    apiFetch('/api/clear-coin-requests', { method: 'POST' });
}

async function showBoostLogModal() {
    const res = await fetch('/api/get-boost-logs', { credentials: 'include' });
    const logs = await res.json();
    const container = document.getElementById('boostLogList');
    container.innerHTML = logs.map(l =>
        `<div>${escapeHtml(l.username)} boosted ${escapeHtml(l.roomName)} by ${l.amount} coins at ${new Date(l.timestamp).toLocaleString()}</div>`
    ).join('');
    document.getElementById('boostLogModal').classList.add('active');
}

async function showPendingManualRequests() {
    const res = await fetch('/api/get-pending-manual-requests', { credentials: 'include' });
    const requests = await res.json();
    const container = document.getElementById('pendingRequestsList');
    container.innerHTML = requests.map(r =>
        `<div class="user-item"><span>${escapeHtml(r.username)}: ${r.amount} coins (${r.paymentMethod})</span>
            <button data-id="${r._id}" class="approve-request">✅ Approve</button>
            <button data-id="${r._id}" class="reject-request">❌ Reject</button>
        </div>`
    ).join('');
    document.getElementById('pendingRequestsModal').classList.add('active');
}

async function approveRequest(id) {
    await apiFetch('/api/approve-manual-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: id }) });
    showPendingManualRequests();
}

async function rejectRequest(id) {
    await apiFetch('/api/reject-manual-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: id }) });
    showPendingManualRequests();
}

function adminGiveCoins() {
    const username = document.getElementById('adminGiveUsername').value.trim();
    const amount = parseInt(document.getElementById('adminGiveAmount').value);
    if (!username || !amount) return alert('Enter username and amount');
    apiFetch('/api/admin-give-coins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, amount }) })
        .then(r => r.json()).then(d => { if (d.success) alert('Coins sent!'); });
}

function adminResetPassword() {
    const username = document.getElementById('adminResetUser').value.trim();
    const newPass = document.getElementById('adminNewPass').value;
    if (!username || !newPass || newPass.length < 6) return alert('Invalid input');
    apiFetch('/api/admin-reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, newPassword: newPass }) })
        .then(r => r.json()).then(d => { if (d.success) alert('Password reset!'); });
}

function closeUsersModal() { document.getElementById('usersModal').classList.remove('active'); }

function closeRoomsModal() { document.getElementById('roomsModal').classList.remove('active'); }

function closeGiftsModal() { document.getElementById('giftsModal').classList.remove('active'); }

function closeBoostLogModal() { document.getElementById('boostLogModal').classList.remove('active'); }

function closePendingRequestsModal() { document.getElementById('pendingRequestsModal').classList.remove('active'); }

// ==================== SUPPORT ====================
function openSupportModal() { document.getElementById('supportModal').classList.add('active'); }

function closeSupportModal() { document.getElementById('supportModal').classList.remove('active'); }

async function submitSupportTicket() {
    const subject = document.getElementById('supportSubject').value.trim();
    const message = document.getElementById('supportMessage').value.trim();
    const fileInput = document.getElementById('supportScreenshot');
    if (!subject || !message) return alert('Subject and message required');
    const fd = new FormData();
    fd.append('subject', subject);
    fd.append('message', message);
    if (fileInput.files[0]) fd.append('screenshot', fileInput.files[0]);
    const res = await apiFetch('/api/support/submit', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) {
        alert('Ticket submitted! ID: ' + data.ticketId);
        closeSupportModal();
        document.getElementById('supportSubject').value = '';
        document.getElementById('supportMessage').value = '';
        document.getElementById('supportScreenshot').value = '';
    } else {
        alert(data.error || 'Failed');
    }
}

async function showAdminSupportPanel() {
    const res = await fetch('/api/support/tickets', { credentials: 'include' });
    const tickets = await res.json();
    const container = document.getElementById('adminTicketsList');
    container.innerHTML = tickets.map(t =>
        `<div class="user-item">
            <span>${escapeHtml(t.ticketId)} - ${escapeHtml(t.subject)} (${t.status})</span>
            <button data-id="${t.ticketId}" class="admin-reply-ticket">Reply</button>
            <button data-id="${t.ticketId}" class="admin-resolve-ticket">Resolve</button>
        </div>`
    ).join('');
    document.getElementById('adminSupportModal').classList.add('active');
}

function closeAdminSupportModal() { document.getElementById('adminSupportModal').classList.remove('active'); }

function openReplyTicketModal(ticketId) {
    document.getElementById('replyTicketId').innerText = `Ticket ID: ${ticketId}`;
    document.getElementById('replyUserMessage').innerText = '';
    document.getElementById('replyTicketModal').classList.add('active');
}

function closeReplyTicketModal() { document.getElementById('replyTicketModal').classList.remove('active'); }

async function sendSupportReply() {
    const ticketId = document.getElementById('replyTicketId').innerText.replace('Ticket ID: ', '').trim();
    const reply = document.getElementById('replyMessage').value.trim();
    if (!reply) return alert('Enter reply');
    const res = await apiFetch('/api/support/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId, reply }) });
    const data = await res.json();
    if (data.success) { alert('Reply sent');
        closeReplyTicketModal();
        showAdminSupportPanel(); }
}

async function resolveTicket(ticketId) {
    if (!confirm('Resolve ticket?')) return;
    await apiFetch('/api/support/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId }) });
    showAdminSupportPanel();
}

function openViewTicketModal(ticketId) {
    document.getElementById('viewTicketId').innerText = ticketId;
    document.getElementById('viewTicketReply').innerHTML = 'Loading...';
    document.getElementById('viewTicketModal').classList.add('active');
}

function closeViewTicketModal() { document.getElementById('viewTicketModal').classList.remove('active'); }

// ==================== UI HELPERS ====================
function addSystemMessage(text, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    container.appendChild(div);
    div.scrollIntoView({ behavior: 'smooth' });
}

function togglePanel() {
    document.getElementById('sidePanel').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('active');
}

function toggleUsersPanel() {
    document.getElementById('usersPanel').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('active');
}

function closeAllPanels() {
    document.getElementById('sidePanel').classList.remove('open');
    document.getElementById('usersPanel').classList.remove('open');
    document.getElementById('overlay').classList.remove('active');
    closeRoomMenu();
}

function toggleRoomMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById('roomDropdownMenu');
    menu.classList.toggle('show');
}

function closeRoomMenu() {
    document.getElementById('roomDropdownMenu').classList.remove('show');
}

function closeRoomMenuOnClickOutside(e) {
    const menu = document.getElementById('roomDropdownMenu');
    const btn = document.getElementById('roomMenuBtn');
    if (!menu.contains(e.target) && !btn.contains(e.target)) menu.classList.remove('show');
}

function updateRoomMenuPermissions() {
    if (!currentUser || !currentRoom) return;
    const isOwner = currentUser.username === currentRoomOwner;
    const isMod = currentRoomModerators.includes(currentUser.username);
    document.getElementById('roomSettingsMenuItem').style.display = (isOwner || isMod) ? 'block' : 'none';
    document.getElementById('banUserMenuItem').style.display = (isOwner || isMod) ? 'block' : 'none';
    document.getElementById('kickedListMenuItem').style.display = (isOwner || isMod) ? 'block' : 'none';
}

function refreshRoomMessagesModeratorStatus() {
    // re-render messages? not needed; just update future messages.
}

// ==================== TYPING ====================
function onRoomTyping() {
    if (typingTimeoutRoom) clearTimeout(typingTimeoutRoom);
    socket.emit('typing', { room: currentRoom, username: currentUser.username });
    typingTimeoutRoom = setTimeout(() => socket.emit('stop-typing', { room: currentRoom, username: currentUser.username }), 2000);
}

function onPrivateTyping() {
    if (typingTimeoutPrivate) clearTimeout(typingTimeoutPrivate);
    socket.emit('private-typing', { from: currentUser.username, to: currentPrivateChat });
    typingTimeoutPrivate = setTimeout(() => socket.emit('private-stop-typing', { from: currentUser.username, to: currentPrivateChat }), 2000);
}

function requestMicrophonePermission() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
}

// ==================== MANUAL COIN REQUEST ====================
function showManualCoinRequestModal() { document.getElementById('manualCoinRequestModal').classList.add('active'); }

function closeManualCoinRequestModal() { document.getElementById('manualCoinRequestModal').classList.remove('active'); }

function toggleManualPaymentFields() {
    const method = document.getElementById('manualPaymentMethod').value;
    document.getElementById('giftCardFields').style.display = method === 'giftcard' ? 'block' : 'none';
    document.getElementById('cryptoFields').style.display = method === 'crypto' ? 'block' : 'none';
}

async function sendManualCoinRequest() {
    const amount = parseInt(document.getElementById('manualCoinAmount').value);
    const method = document.getElementById('manualPaymentMethod').value;
    const giftCardNumber = document.getElementById('giftCardNumber').value.trim();
    const cryptoTransactionId = document.getElementById('cryptoTransactionId').value.trim();
    const proofFile = document.getElementById('proofFile').files[0];
    if (!amount || amount < 100) return alert('Amount must be at least 100.');
    const fd = new FormData();
    fd.append('amount', amount);
    fd.append('paymentMethod', method);
    fd.append('giftCardNumber', giftCardNumber);
    fd.append('cryptoTransactionId', cryptoTransactionId);
    if (proofFile) fd.append('proofFile', proofFile);
    const res = await apiFetch('/api/manual-coin-request', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) { alert('Request submitted!');
        closeManualCoinRequestModal(); } else alert(data.error || 'Failed');
}

function showCoinHistoryModal() {
    fetch('/api/get-coin-history', { credentials: 'include' })
        .then(r => r.json())
        .then(history => {
            const container = document.getElementById('coinHistoryModalList');
            if (!history.length) container.innerHTML = '<div>No history.</div>';
            else container.innerHTML = history.map(h =>
                `<div>${new Date(h.date).toLocaleString()}: ${h.type} - ${h.amount > 0 ? '+' : ''}${h.amount}</div>`
            ).join('');
            document.getElementById('coinHistoryModal').classList.add('active');
        });
}

function closeCoinHistoryModal() { document.getElementById('coinHistoryModal').classList.remove('active'); }

function purchaseCoins(coins, name, price, method) {
    alert(`⚠️ Payment demo. Use "Request Coins (Manual)" button.`);
}

// ==================== TRANSLATION API ====================
async function translateText(text, targetLang) {
    try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`);
        const data = await res.json();
        if (data && data[0] && data[0][0]) {
            return data[0].map(item => item[0]).join('');
        }
        return text;
    } catch (e) {
        return text;
    }
}

// ==================== SOCKET ====================
function initSocket() {
    socket = io({
        transports: ['websocket'],
        withCredentials: true
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
        socket.emit('get-room-list');
        const lastRoom = localStorage.getItem('lastRoom');
        if (lastRoom && !currentRoom) setTimeout(() => socket.emit('join-room', lastRoom), 500);

        // Handle direct URL if not already handled
        if (!isJoiningFromUrl) {
            setTimeout(handleDirectUrl, 500);
        }
    });

    socket.on('reconnect', () => {
        showToast('Reconnected');
    });
    socket.on('disconnect', () => {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            statusEl.className = 'connection-status-indicator disconnected';
            statusEl.innerHTML = '<span class="dot"></span> Disconnected';
        }
    });
    socket.on('connect_error', (err) => { console.error('Connection error:', err); });

    socket.on('online-users', (users) => { onlineUsers = users;
        updatePrivateStatus();
        loadFriends(); });
    socket.on('room-list', (rooms) => { allRooms = rooms;
        displayRooms(rooms); });
    socket.on('room-created-success', (name) => { alert(`Room "${name}" created`);
        socket.emit('get-room-list');
        closeCreateRoomModal();
        updateCoins(); });

    socket.on('room-joined', (data) => {
        currentRoom = data.room;
        currentRoomOwner = data.owner;
        currentRoomIsVip = data.isVipRoom;
        currentRoomModerators = data.moderators || [];
        currentRoomMembersOnly = data.membersOnly || false;

        document.getElementById('roomChatName').innerHTML = `#${escapeHtml(data.room)}${data.isVipRoom ? ' 💎' : ''}`;
        document.getElementById('roomChatStats').innerHTML = `${data.members.length} ${escapeHtml(t('members'))} | ${escapeHtml(t('boost'))}: ${data.boostLevel || 0}`;

        const container = document.getElementById('roomMessages');
        // Remove loading indicator
        const loadingEl = document.getElementById('roomLoadingIndicator');
        if (loadingEl) loadingEl.remove();
        container.innerHTML = '';

        // Display historical messages
        if (data.messages && data.messages.length > 0) {
            data.messages.forEach(msg => {
                addRoomMessage(msg);
            });
            console.log(`📜 Loaded ${data.messages.length} historical messages`);
        }

        const youtubeBtn = document.getElementById('youtubeToggleBtn');
        if (data.isVipRoom) youtubeBtn.style.display = 'inline-block';
        else { youtubeBtn.style.display = 'none';
            document.getElementById('youtubePlayerContainer').classList.remove('active'); }

        const chatCont = document.getElementById('roomChatView'),
            msgCont = document.getElementById('roomMessages'),
            header = document.getElementById('roomChatHeader');
        if (data.isVipRoom) { chatCont.classList.add('vip-room-chat');
            msgCont.classList.add('vip-room-messages');
            header.classList.add('vip-room-header');
            document.getElementById('roomChatName').classList.add('vip-room-title');
            document.getElementById('roomChatStats').classList.add('vip-room-stats'); } else { chatCont.classList.remove('vip-room-chat');
            msgCont.classList.remove('vip-room-messages');
            header.classList.remove('vip-room-header');
            document.getElementById('roomChatName').classList.remove('vip-room-title');
            document.getElementById('roomChatStats').classList.remove('vip-room-stats'); }

        loadRoomMembers();
        showRoomChat();
        saveSessionState();
        updateRoomMenuPermissions();
        isJoiningFromUrl = false;
    });

    socket.on('new-room-message', (msg) => addRoomMessage(msg));
    socket.on('user-joined-room', (data) => { addSystemMessage(`${escapeHtml(data.username)} ${escapeHtml(t('joined'))}`, 'roomMessages');
        loadRoomMembers(); });
    socket.on('user-left-room', (data) => { addSystemMessage(`${escapeHtml(data.username)} ${escapeHtml(t('left'))}`, 'roomMessages');
        loadRoomMembers(); });
    socket.on('room-boosted', (data) => { addSystemMessage(`🚀 ${escapeHtml(data.boostedBy)} ${escapeHtml(t('boosted'))} ${data.amount} ${escapeHtml(t('coins'))}! ${escapeHtml(t('total_boost'))}: ${data.boostLevel}`, 'roomMessages');
        document.getElementById('roomChatStats').innerHTML = `${escapeHtml(t('boost'))}: ${data.boostLevel}`; if (currentUser.isAdmin) showBoostLogModal();
        socket.emit('get-room-list'); });
    socket.on('new-private-message', (msg) => { playNotificationSound(); if (currentPrivateChat === msg.from) addPrivateMessage(msg);
        else addNotification(t('new_message'), `${msg.from}: ${msg.message.substring(0, 50)}`, { type: 'private_message', from: msg.from }); });
    socket.on('private-message-sent', (msg) => addPrivateMessage(msg));
    socket.on('gift-received', (gift) => { playNotificationSound();
        alert(`🎁 ${gift.from} ${t('sent_gift')} ${gift.amount} ${t('coins')}!`);
        updateCoins();
        loadGiftHistory();
        addNotification(t('gift_received'), `${gift.from} ${t('sent_gift')} ${gift.amount} ${t('coins')}!`);
        showGiftTicker(gift.from, gift.to, gift.amount); });
    socket.on('friend-request-received', (data) => { playNotificationSound();
        alert(`📨 ${t('friend_request')} ${t('from')} ${data.from}`);
        loadFriendRequests();
        addNotification(t('friend_request'), `${t('from')} ${data.from}`); });
    socket.on('coins-updated', (balance) => { currentUser.coins = balance;
        document.getElementById('coinBalance').innerHTML = `💰 ${balance}`; });
    socket.on('admin-gift', (data) => { alert(`🎁 ${t('admin_gave')} ${data.amount} ${t('coins')}!`);
        updateCoins(); });
    socket.on('friend-deleted', (friendName) => { alert(`${friendName} ${t('removed_you')}`);
        loadFriends(); });
    socket.on('gift-ticker', (data) => { showGiftTicker(data.from, data.to, data.amount); });
    socket.on('kicked-from-room', (data) => { alert(`${t('kicked_from')} ${data.room}`); if (currentRoom === data.room) leaveRoom(); });

    socket.on('incoming-call', (data) => { playNotificationSound();
        startRingtone(); if (callActive) { socket.emit('call-rejected', { to: data.from }); return; }
        pendingCallFrom = data.from;
        pendingOffer = data.offer;
        document.getElementById('callerName').innerText = data.from;
        document.getElementById('incomingCallBar').classList.add('active');
        addNotification(t('incoming_call'), `${data.from} ${t('is_calling')}...`); });
    socket.on('call-accepted', async (data) => {
        stopRingtone();
        document.getElementById('incomingCallBar').classList.remove('active');
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            document.getElementById('localVideo').srcObject = localStream;
            if (!peerConnection) {
                peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
                peerConnection.ontrack = (event) => { document.getElementById('remoteVideo').srcObject = event.streams[0]; };
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        socket.emit('ice-candidate', { to: currentPrivateChat || pendingCallFrom, candidate: event.candidate, from: currentUser.username });
                    }
                };
            }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            callActive = true;
            document.getElementById('callModal').classList.add('active');
        } catch (e) { alert('Call accept error: ' + e.message); }
    });
    socket.on('call-rejected', () => { stopRingtone();
        showToast(t('call_rejected'));
        endCall(); });
    socket.on('end-call', () => { stopRingtone();
        showToast(t('call_ended'));
        endCall(); });
    socket.on('ice-candidate', async (data) => { if (peerConnection && data.candidate) { try { await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (error) { console.error('Add ICE candidate error:', error); } } });
    socket.on('support-reply', (data) => { playNotificationSound();
        addNotification(t('support_reply'), `Admin ${t('replied_ticket')} ${data.ticketId}: ${data.reply.substring(0, 50)}...`, { type: 'support_ticket', ticketId: data.ticketId, reply: data.reply });
        showToast(`📬 ${t('new_reply_support')} ${data.ticketId}`); });
    socket.on('support-resolved', (data) => { playNotificationSound();
        addNotification(t('ticket_resolved'), `${t('your_ticket')} ${data.ticketId} ${t('resolved')}.`);
        showToast(`✅ ${t('ticket_resolved')} ${data.ticketId}.`); });
    socket.on('new-support-ticket', (data) => { if (currentUser.isAdmin) addNotification(t('new_support_ticket'), `${data.username}: ${data.subject}`); });
    socket.on('room-join-denied', (msg) => { alert(msg); });
    socket.on('sync-youtube', (data) => { if (currentRoom === data.room) { const iframe = document.getElementById('youtubeIframe');
            iframe.src = `https://www.youtube.com/embed/${data.videoId}?enablejsapi=1`;
            showToast(`🎬 ${t('room_video_changed')} ${data.by || t('someone')}`); } });
    socket.on('room-member-added', (data) => { const { username, roomName } = data; if (roomName === currentRoom) loadRoomMembers(); if (username === currentUser.username) { showToast(`${t('you_were_added_to')} "${roomName}"!`);
            setTimeout(() => socket.emit('join-room', roomName), 500); } });
    socket.on('room-member-removed', (data) => { const { username, roomName } = data; if (roomName === currentRoom) { loadRoomMembers(); if (username === currentUser.username) { showToast(`${t('you_were_removed_from')} "${roomName}"`);
                leaveRoom(); } } });
    socket.on('room-moderator-updated', (data) => { if (currentRoom === data.room) { currentRoomModerators = data.moderators;
            loadRoomMembers();
            refreshRoomMessagesModeratorStatus(); const modal = document.getElementById('roomSettingsModal'); if (modal.classList.contains('active')) showRoomSettings(); } });
    socket.on('friend-request-sent', (data) => { showToast(`${t('friend_request_sent_to')} ${data.to}`); });
    socket.on('friend-request-accepted', (data) => { showToast(`${data.from} ${t('accepted_friend_request')}!`);
        loadFriends();
        loadFriendRequests(); });
    socket.on('friends-updated', () => { loadFriends();
        loadFriendRequests(); });
    socket.on('member-action-success', (data) => { showToast(`${data.action} ${data.username} ${t('successful')}`);
        showRoomSettings();
        loadRoomMembers(); });
    socket.on('boost-reset', (data) => { showToast(data.message); if (currentRoom) { const boostElement = document.getElementById('roomChatStats'); if (boostElement) { boostElement.innerHTML = boostElement.innerHTML.replace(/Boost: \d+/, `${t('boost')}: 0`); } }
        socket.emit('get-room-list'); });
    socket.on('user-typing', (data) => { if (currentRoom === data.room) { document.getElementById('roomTypingIndicator').textContent = `${data.username} is typing...`; } });
    socket.on('user-stop-typing', (data) => { if (currentRoom === data.room) { document.getElementById('roomTypingIndicator').textContent = ''; } });
    socket.on('private-user-typing', (data) => { if (currentPrivateChat === data.from) { document.getElementById('privateTypingIndicator').textContent = `${data.from} is typing...`; } });
    socket.on('private-user-stop-typing', (data) => { if (currentPrivateChat === data.from) { document.getElementById('privateTypingIndicator').textContent = ''; } });
}

// ==================== AUTO-LOGIN & START ====================
async function autoLogin() {
    const res = await fetch('/api/auto-login', { credentials: 'include' });
    const data = await res.json();
    if (data.success) {
        currentUser = data.user;
        await fetchCsrfToken();
        await checkAndUpdateVIPStatus();
        document.getElementById('currentUsername').innerHTML = currentUser.username;
        document.getElementById('coinBalance').innerHTML = `💰 ${currentUser.coins}`;
        updateProfilePic();
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainContainer').style.display = 'flex';
        initSocket();
        await refreshUserData();
        loadFriends();
        loadFriendRequests();
        loadGiftHistory();
        if (currentUser.isAdmin) { document.getElementById('adminSection').style.display = 'block'; }
        showRooms();
        requestMicrophonePermission();
        restoreSession();

        // Handle direct URL after socket connects
        setTimeout(() => {
            if (socket && socket.connected) {
                handleDirectUrl();
            } else {
                socket?.once('connect', () => {
                    setTimeout(handleDirectUrl, 500);
                });
            }
        }, 1000);
    }
}

function logout() { apiFetch('/api/logout', { method: 'POST' }).finally(() => window.location.reload()); }

// ==================== EVENT BINDING ====================
document.addEventListener('DOMContentLoaded', () => {
    // ---------- Auth ----------
    document.getElementById('loginBtn').addEventListener('click', login);
    document.getElementById('registerBtn').addEventListener('click', register);
    document.getElementById('showRegisterLink').addEventListener('click', showRegister);
    document.getElementById('showLoginLink').addEventListener('click', showLogin);
    document.getElementById('showForgotLink').addEventListener('click', showForgotPassword);
    document.getElementById('showLoginFromForgotLink').addEventListener('click', showLogin);

    document.getElementById('getQuestionBtn').addEventListener('click', getSecurityQuestion);
    document.getElementById('resetPasswordBtn').addEventListener('click', resetPassword);

    // ---------- Incoming Call ----------
    document.getElementById('acceptCallBtn').addEventListener('click', acceptCall);
    document.getElementById('declineCallBtn').addEventListener('click', rejectCall);

    // ---------- Header ----------
    document.getElementById('profilePic').addEventListener('click', uploadProfilePic);
    document.getElementById('bellIcon').addEventListener('click', toggleNotifications);
    document.getElementById('menuBtn').addEventListener('click', togglePanel);
    document.getElementById('clearNotifBtn').addEventListener('click', clearAllNotifications);

    // ---------- Views ----------
    document.getElementById('navRooms').addEventListener('click', showRooms);
    document.getElementById('navFriends').addEventListener('click', showFriends);
    document.getElementById('navGifts').addEventListener('click', showGifts);

    // ---------- Rooms ----------
    document.getElementById('roomSearchBtn').addEventListener('click', filterRooms);
    document.getElementById('createRoomBtn').addEventListener('click', showCreateRoomModal);
    document.getElementById('createRoomModalCreateBtn').addEventListener('click', createRoom);
    document.getElementById('createRoomModalCancelBtn').addEventListener('click', closeCreateRoomModal);

    // ---------- Friends ----------
    document.getElementById('friendSearchBtn').addEventListener('click', searchUsers);

    // ---------- Gifts ----------
    document.getElementById('sendGiftViewBtn').addEventListener('click', showSendGiftModal);
    document.getElementById('sendGiftSendBtn').addEventListener('click', sendGift);
    document.getElementById('sendGiftCancelBtn').addEventListener('click', closeSendGiftModal);

    // ---------- Chat Room ----------
    document.getElementById('roomSendBtn').addEventListener('click', sendRoomMessage);
    document.getElementById('roomImageBtn').addEventListener('click', sendRoomImage);
    document.getElementById('roomVoiceBtn').addEventListener('click', toggleRoomRecording);
    document.getElementById('roomMessageInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendRoomMessage(); });
    document.getElementById('roomMessageInput').addEventListener('input', onRoomTyping);

    // ---------- Private Chat ----------
    document.getElementById('privateChatBackBtn').addEventListener('click', closePrivateChat);
    document.getElementById('privateCallBtn').addEventListener('click', startCall);
    document.getElementById('privateSendBtn').addEventListener('click', sendPrivateMessage);
    document.getElementById('privateImageBtn').addEventListener('click', sendPrivateImage);
    document.getElementById('privateVoiceBtn').addEventListener('click', togglePrivateRecording);
    document.getElementById('privateMessageInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendPrivateMessage(); });
    document.getElementById('privateMessageInput').addEventListener('input', onPrivateTyping);

    // ---------- YouTube ----------
    document.getElementById('youtubeToggleBtn').addEventListener('click', toggleYouTubePlayer);
    document.getElementById('youtubeSearchBtn').addEventListener('click', searchAndPlayYouTube);
    document.getElementById('youtubeSearchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchAndPlayYouTube(); });

    // ---------- Boost ----------
    document.getElementById('boostIcon').addEventListener('click', showBoostModal);
    document.getElementById('boostModalBoostBtn').addEventListener('click', boostRoom);
    document.getElementById('boostModalCancelBtn').addEventListener('click', closeBoostModal);

    // ---------- Room Menu ----------
    document.getElementById('roomMenuBtn').addEventListener('click', toggleRoomMenu);
    document.addEventListener('click', closeRoomMenuOnClickOutside);

    document.getElementById('roomSettingsMenuItem').addEventListener('click', () => { showRoomSettings();
        closeRoomMenu(); });
    document.getElementById('membersPanelMenuItem').addEventListener('click', () => { toggleUsersPanel();
        closeRoomMenu(); });
    document.getElementById('banUserMenuItem').addEventListener('click', () => { showBanUserModal();
        closeRoomMenu(); });
    document.getElementById('kickedListMenuItem').addEventListener('click', () => { showKickListModal();
        closeRoomMenu(); });
    document.getElementById('leaveRoomMenuItem').addEventListener('click', () => { leaveRoom();
        closeRoomMenu(); });

    // ---------- Side Panel ----------
    document.getElementById('buyVipBtn').addEventListener('click', buyVIP);
    document.getElementById('supportBtn').addEventListener('click', openSupportModal);
    document.getElementById('supportSubmitBtn').addEventListener('click', submitSupportTicket);
    document.getElementById('supportCancelBtn').addEventListener('click', closeSupportModal);
    document.getElementById('coinHistoryBtn').addEventListener('click', showCoinHistoryModal);
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('manualCoinRequestBtn').addEventListener('click', showManualCoinRequestModal);
    document.getElementById('manualRequestSubmit').addEventListener('click', sendManualCoinRequest);
    document.getElementById('manualRequestCancel').addEventListener('click', closeManualCoinRequestModal);
    document.getElementById('manualPaymentMethod').addEventListener('change', toggleManualPaymentFields);

    // ---------- Admin ----------
    document.getElementById('adminManageUsersBtn').addEventListener('click', showAllUsers);
    document.getElementById('adminManageRoomsBtn').addEventListener('click', showAllRooms);
    document.getElementById('adminManageGiftsBtn').addEventListener('click', showAllGifts);
    document.getElementById('adminClearFriendRequestsBtn').addEventListener('click', clearAllFriendRequests);
    document.getElementById('adminClearCoinHistoryBtn').addEventListener('click', clearAllCoinRequests);
    document.getElementById('adminBoostLogBtn').addEventListener('click', showBoostLogModal);
    document.getElementById('adminPendingRequestsBtn').addEventListener('click', showPendingManualRequests);
    document.getElementById('adminSupportTicketsBtn').addEventListener('click', showAdminSupportPanel);
    document.getElementById('adminGiveCoinsBtn').addEventListener('click', adminGiveCoins);
    document.getElementById('adminResetPasswordBtn').addEventListener('click', adminResetPassword);
    document.getElementById('closeAdminSupportBtn').addEventListener('click', closeAdminSupportModal);
    document.getElementById('sendReplyBtn').addEventListener('click', sendSupportReply);
    document.getElementById('closeReplyTicketBtn').addEventListener('click', closeReplyTicketModal);
    document.getElementById('closeViewTicketBtn').addEventListener('click', closeViewTicketModal);

    // ---------- Modals (close) ----------
    document.getElementById('closeRoomSettingsBtn').addEventListener('click', closeRoomSettingsModal);
    document.getElementById('closeProfileBtn').addEventListener('click', closeProfileModal);
    document.getElementById('closeKickListBtn').addEventListener('click', closeKickListModal);
    document.getElementById('closeBanUserBtn').addEventListener('click', closeBanUserModal);
    document.getElementById('banUserExecuteBtn').addEventListener('click', executeBanUser);
    document.getElementById('imageSendBtn').addEventListener('click', uploadImage);
    document.getElementById('imageCancelBtn').addEventListener('click', closeImageModal);
    document.getElementById('closeUsersBtn').addEventListener('click', closeUsersModal);
    document.getElementById('closeRoomsBtn').addEventListener('click', closeRoomsModal);
    document.getElementById('closeGiftsBtn').addEventListener('click', closeGiftsModal);
    document.getElementById('closeBoostLogBtn').addEventListener('click', closeBoostLogModal);
    document.getElementById('closePendingRequestsBtn').addEventListener('click', closePendingRequestsModal);
    document.getElementById('closeCoinHistoryBtn').addEventListener('click', closeCoinHistoryModal);
    document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
    document.getElementById('imageLightbox').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeLightbox(); });
    document.getElementById('overlay').addEventListener('click', closeAllPanels);
    document.getElementById('closeUsersPanelBtn').addEventListener('click', toggleUsersPanel);

    // ---------- Room Settings ----------
    document.getElementById('membersOnlyToggle').addEventListener('change', toggleMembersOnly);
    document.getElementById('addMemberBtn').addEventListener('click', addRoomMember);

    // ---------- Sound Toggle ----------
    document.getElementById('soundToggle').addEventListener('change', (e) => {
        soundEnabled = e.target.checked;
        localStorage.setItem('soundEnabled', String(soundEnabled));
    });

    // ---------- Call Controls ----------
    document.getElementById('callMuteBtn').addEventListener('click', toggleCallAudio);
    document.getElementById('callVideoBtn').addEventListener('click', toggleCallVideo);
    document.getElementById('speakerBtn').addEventListener('click', toggleSpeaker);
    document.getElementById('endCallBtn').addEventListener('click', endCall);

    // ---------- Language & Translation ----------
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

    // ---------- Delegation for dynamic content ----------
    document.getElementById('roomsList').addEventListener('click', (e) => {
        const joinBtn = e.target.closest('.join-btn');
        if (joinBtn) {
            const roomName = joinBtn.dataset.room;
            if (roomName) joinRoom(roomName);
        }
    });

    document.getElementById('friendsList').addEventListener('click', (e) => {
        const delBtn = e.target.closest('.delete-friend-btn');
        if (delBtn) {
            const friend = delBtn.dataset.friend;
            if (friend) deleteFriend(friend);
        }
    });

    document.getElementById('friendRequestsList').addEventListener('click', (e) => {
        const acceptBtn = e.target.closest('.accept-friend-btn');
        if (acceptBtn) {
            const from = acceptBtn.dataset.from;
            if (from) acceptFriendRequest(from);
        }
    });

    document.getElementById('searchResults').addEventListener('click', (e) => {
        const reqBtn = e.target.closest('.send-req-btn');
        if (reqBtn) {
            const to = reqBtn.dataset.to;
            if (to) sendFriendRequest(to);
        }
    });

    document.getElementById('roomMembersList').addEventListener('click', (e) => {
        const avatar = e.target.closest('.user-avatar');
        if (avatar) {
            const username = avatar.dataset.username;
            if (username) showUserProfile(username);
        }
    });

    document.getElementById('roomMessages').addEventListener('click', (e) => {
        const avatar = e.target.closest('.message-avatar');
        if (avatar) {
            const username = avatar.dataset.username;
            if (username) showUserProfile(username);
        }
        const img = e.target.closest('.message-img');
        if (img) {
            const src = img.dataset.src || img.src;
            if (src) openLightbox(src);
        }
    });

    document.getElementById('privateMessages').addEventListener('click', (e) => {
        const avatar = e.target.closest('.message-avatar');
        if (avatar) {
            const username = avatar.dataset.username;
            if (username) showUserProfile(username);
        }
        const img = e.target.closest('.message-img');
        if (img) {
            const src = img.dataset.src || img.src;
            if (src) openLightbox(src);
        }
    });

    document.getElementById('kickedUsersList').addEventListener('click', (e) => {
        const unbanBtn = e.target.closest('.unban-btn');
        if (unbanBtn) {
            const room = unbanBtn.dataset.room;
            const username = unbanBtn.dataset.username;
            if (room && username) unbanUserFromRoom(username, room);
        }
    });

    document.getElementById('roomMemberManageList').addEventListener('click', (e) => {
        const modBtn = e.target.closest('.mod-btn');
        if (modBtn) {
            const user = modBtn.dataset.user;
            const action = modBtn.dataset.action;
            if (action === 'add') setModerator(user);
            else removeModerator(user);
        }
        const kickBtn = e.target.closest('.kick-btn');
        if (kickBtn) {
            const user = kickBtn.dataset.user;
            if (user) removeRoomMember(user);
        }
    });

    document.getElementById('allUsersList').addEventListener('click', (e) => {
        const delBtn = e.target.closest('.admin-delete-user');
        if (delBtn) {
            const username = delBtn.dataset.username;
            if (username) deleteUser(username);
        }
    });

    document.getElementById('allRoomsList').addEventListener('click', (e) => {
        const delBtn = e.target.closest('.admin-delete-room');
        if (delBtn) {
            const room = delBtn.dataset.room;
            if (room) deleteRoom(room);
        }
    });

    document.getElementById('pendingRequestsList').addEventListener('click', (e) => {
        const approveBtn = e.target.closest('.approve-request');
        if (approveBtn) {
            const id = approveBtn.dataset.id;
            if (id) approveRequest(id);
        }
        const rejectBtn = e.target.closest('.reject-request');
        if (rejectBtn) {
            const id = rejectBtn.dataset.id;
            if (id) rejectRequest(id);
        }
    });

    document.getElementById('adminTicketsList').addEventListener('click', (e) => {
        const replyBtn = e.target.closest('.admin-reply-ticket');
        if (replyBtn) {
            const id = replyBtn.dataset.id;
            if (id) openReplyTicketModal(id);
        }
        const resolveBtn = e.target.closest('.admin-resolve-ticket');
        if (resolveBtn) {
            const id = resolveBtn.dataset.id;
            if (id) resolveTicket(id);
        }
    });

    document.querySelectorAll('.card-btn, .crypto-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const coins = parseInt(this.dataset.coins);
            const name = this.dataset.package;
            const price = parseFloat(this.dataset.price);
            const method = this.dataset.method;
            purchaseCoins(coins, name, price, method);
        });
    });

    document.getElementById('notificationsList').addEventListener('click', (e) => {
        const item = e.target.closest('.notification-item');
        if (item) {
            const idx = parseInt(item.dataset.index);
            if (!isNaN(idx)) handleNotificationClick(idx);
        }
    });
});

// ==================== INIT ====================
const savedLang = localStorage.getItem('app_language');
detectLanguage();
if (savedLang && translations[savedLang]) setLanguage(savedLang);
else setLanguage(currentLanguage);

window.addEventListener('focus', () => { if (currentUser) refreshUserData(); });
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser) refreshUserData();
});

autoLogin();
console.log('🔍 Chat app loaded (secure, no inline events)');