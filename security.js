// security.js
// ⭐⭐⭐ Advanced Security Module + Auto-Ban System v3.0 ⭐⭐⭐

const crypto = require('crypto');

// ============================================================
// 🔐 1. SESSION FINGERPRINTING
// ============================================================
function generateFingerprint(req) {
    const parts = [
        req.headers['user-agent'] || '',
        req.headers['accept-language'] || '',
        req.headers['accept-encoding'] || '',
        req.headers['sec-ch-ua'] || '',
        req.headers['sec-ch-ua-platform'] || '',
        req.headers['sec-ch-ua-mobile'] || ''
    ];
    const ip = req.ip || req.connection?.remoteAddress || '';
    const ipPrefix = ip.split('.').slice(0, 3).join('.');
    parts.push(ipPrefix);

    const raw = parts.join('|');
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32);
}

function generateSocketFingerprint(socket) {
    const parts = [
        socket.handshake.headers['user-agent'] || '',
        socket.handshake.headers['accept-language'] || '',
        socket.handshake.headers['sec-ch-ua'] || '',
        socket.handshake.headers['sec-ch-ua-platform'] || ''
    ];
    const raw = parts.join('|');
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32);
}

// ============================================================
// 🔐 2. FINGERPRINT-BOUND JWT
// ============================================================
function signTokenWithFingerprint(payload, fingerprint, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (7 * 24 * 60 * 60);

    const body = {
        ...payload,
        fp: fingerprint,
        iat: now,
        exp,
        jti: crypto.randomBytes(16).toString('hex')
    };
    const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const data = `${b64url(header)}.${b64url(body)}`;
    const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    return `${data}.${sig}`;
}

function verifyTokenWithFingerprint(token, currentFingerprint, secret) {
    try {
        const [h, b, sig] = token.split('.');
        if (!h || !b || !sig) return { valid: false, reason: 'malformed' };

        const expectedSig = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
        if (sig.length !== expectedSig.length ||
            !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
            return { valid: false, reason: 'bad_signature' };
        }

        const body = JSON.parse(Buffer.from(b, 'base64url').toString());

        if (body.exp < Math.floor(Date.now() / 1000)) {
            return { valid: false, reason: 'expired' };
        }

        if (body.fp && body.fp !== currentFingerprint) {
            return { valid: false, reason: 'fingerprint_mismatch', payload: body };
        }

        return { valid: true, payload: body };
    } catch (err) {
        return { valid: false, reason: 'error' };
    }
}

// ============================================================
// 🔐 3. ACTION SIGNING
// ============================================================
const actionNonces = new Map();
const NONCE_TTL_MS = 30 * 1000;

function generateActionNonce() {
    return crypto.randomBytes(16).toString('hex');
}

function createActionSignature(username, action, payload, secret) {
    const nonce = generateActionNonce();
    const timestamp = Date.now();
    const data = `${username}|${action}|${JSON.stringify(payload)}|${timestamp}|${nonce}`;
    const signature = crypto.createHmac('sha256', secret).update(data).digest('hex');

    actionNonces.set(nonce, {
        username, action, expires: timestamp + NONCE_TTL_MS
    });

    return { signature, nonce, timestamp };
}

function verifyActionSignature(username, action, payload, signature, nonce, timestamp, secret) {
    if (Date.now() - timestamp > NONCE_TTL_MS) return { valid: false, reason: 'expired' };

    const nonceData = actionNonces.get(nonce);
    if (!nonceData) return { valid: false, reason: 'invalid_nonce' };
    if (nonceData.username !== username || nonceData.action !== action) {
        return { valid: false, reason: 'nonce_mismatch' };
    }

    const data = `${username}|${action}|${JSON.stringify(payload)}|${timestamp}|${nonce}`;
    const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');
    if (signature.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return { valid: false, reason: 'bad_signature' };
    }

    actionNonces.delete(nonce);
    return { valid: true };
}

setInterval(() => {
    const now = Date.now();
    for (const [nonce, data] of actionNonces) {
        if (data.expires < now) actionNonces.delete(nonce);
    }
}, 30000);

// ============================================================
// 🔐 4. MULTI-LAYER RATE LIMITING
// ============================================================
class SlidingWindowLimiter {
    constructor(windowMs, maxRequests) {
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
        this.buckets = new Map();
    }

    check(key) {
        const now = Date.now();
        let arr = this.buckets.get(key) || [];
        arr = arr.filter(t => now - t < this.windowMs);
        if (arr.length >= this.maxRequests) {
            const oldest = arr[0];
            const retryAfter = Math.ceil((oldest + this.windowMs - now) / 1000);
            return { allowed: false, retryAfter, remaining: 0 };
        }
        arr.push(now);
        this.buckets.set(key, arr);
        return { allowed: true, remaining: this.maxRequests - arr.length };
    }

    cleanup() {
        const now = Date.now();
        for (const [key, arr] of this.buckets) {
            const filtered = arr.filter(t => now - t < this.windowMs);
            if (filtered.length === 0) this.buckets.delete(key);
            else this.buckets.set(key, filtered);
        }
    }
}

class TokenBucket {
    constructor(capacity, refillRate) {
        this.capacity = capacity;
        this.refillRate = refillRate;
        this.buckets = new Map();
    }

    check(key, cost = 1) {
        const now = Date.now();
        let bucket = this.buckets.get(key);
        if (!bucket) {
            bucket = { tokens: this.capacity, lastRefill: now };
        }
        const elapsed = (now - bucket.lastRefill) / 1000;
        bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillRate);
        bucket.lastRefill = now;

        if (bucket.tokens < cost) {
            this.buckets.set(key, bucket);
            return { allowed: false, tokens: bucket.tokens };
        }
        bucket.tokens -= cost;
        this.buckets.set(key, bucket);
        return { allowed: true, tokens: bucket.tokens };
    }

    cleanup() {
        const now = Date.now();
        for (const [key, bucket] of this.buckets) {
            if (now - bucket.lastRefill > 3600000) this.buckets.delete(key);
        }
    }
}

const limiters = {
    api:          new SlidingWindowLimiter(60 * 1000, 200),
    apiUser:      new SlidingWindowLimiter(60 * 1000, 120),
    login:        new SlidingWindowLimiter(15 * 60 * 1000, 10),
    loginUser:    new SlidingWindowLimiter(15 * 60 * 1000, 5),
    register:     new SlidingWindowLimiter(60 * 60 * 1000, 3),
    roomMsg:      new SlidingWindowLimiter(10 * 1000, 8),
    privateMsg:   new SlidingWindowLimiter(10 * 1000, 10),
    gift:         new SlidingWindowLimiter(60 * 1000, 10),
    boost:        new SlidingWindowLimiter(60 * 1000, 3),
    game:         new SlidingWindowLimiter(60 * 1000, 30),
    call:         new SlidingWindowLimiter(5 * 60 * 1000, 3),
    friendReq:    new SlidingWindowLimiter(60 * 60 * 1000, 20),
    roomCreate:   new SlidingWindowLimiter(60 * 60 * 1000, 2),
    kick:         new SlidingWindowLimiter(60 * 1000, 10),
    socketConnect: new SlidingWindowLimiter(60 * 1000, 10),
    socketEvent:   new TokenBucket(60, 5)
};

setInterval(() => {
    Object.values(limiters).forEach(l => l.cleanup && l.cleanup());
}, 60000);

// ============================================================
// 🔐 5. ANOMALY DETECTION
// ============================================================
const suspiciousActivity = new Map();

function reportSuspicious(username, reason, weight = 10) {
    const now = Date.now();
    let entry = suspiciousActivity.get(username);
    if (!entry) {
        entry = { score: 0, reasons: [], firstSeen: now, lastSeen: now };
    }
    entry.score += weight;
    entry.lastSeen = now;
    entry.reasons.push({ reason, time: now, weight });
    if (entry.reasons.length > 20) entry.reasons = entry.reasons.slice(-20);
    suspiciousActivity.set(username, entry);

    if (entry.score >= 100) {
        console.warn(`🚨 HIGH RISK user: ${username} (score=${entry.score})`);
    }
    return entry.score;
}

function getSuspicionScore(username) {
    const entry = suspiciousActivity.get(username);
    if (!entry) return 0;
    const minutesPassed = (Date.now() - entry.lastSeen) / 60000;
    return Math.max(0, entry.score - minutesPassed);
}

function clearSuspicion(username) {
    suspiciousActivity.delete(username);
}

// ============================================================
// 🔐 6. IP REPUTATION
// ============================================================
const ipReputation = new Map();

function recordIpViolation(ip, reason) {
    let entry = ipReputation.get(ip) || {
        violations: 0, reasons: [], blocked: false, blockedUntil: 0
    };
    entry.violations++;
    entry.reasons.push({ reason, time: Date.now() });
    if (entry.reasons.length > 20) entry.reasons = entry.reasons.slice(-20);

    if (entry.violations >= 50) {
        entry.blocked = true;
        entry.blockedUntil = Date.now() + 24 * 60 * 60 * 1000;
    } else if (entry.violations >= 20) {
        entry.blocked = true;
        entry.blockedUntil = Date.now() + 60 * 60 * 1000;
    } else if (entry.violations >= 10) {
        entry.blocked = true;
        entry.blockedUntil = Date.now() + 5 * 60 * 1000;
    }

    ipReputation.set(ip, entry);
}

function isIpBlocked(ip) {
    const entry = ipReputation.get(ip);
    if (!entry || !entry.blocked) return false;
    if (Date.now() > entry.blockedUntil) {
        entry.blocked = false;
        entry.blockedUntil = 0;
        return false;
    }
    return true;
}

// ============================================================
// 🔐 7. CONNECTION RATE
// ============================================================
const connectionAttempts = new Map();

function checkConnectionRate(ip) {
    const now = Date.now();
    let attempts = connectionAttempts.get(ip) || [];
    attempts = attempts.filter(t => now - t < 60000);
    if (attempts.length >= 5) {
        return { allowed: false, retryAfter: 60 };
    }
    attempts.push(now);
    connectionAttempts.set(ip, attempts);
    return { allowed: true };
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, arr] of connectionAttempts) {
        const filtered = arr.filter(t => now - t < 60000);
        if (filtered.length === 0) connectionAttempts.delete(ip);
        else connectionAttempts.set(ip, filtered);
    }
}, 60000);

// ============================================================
// 🔐 8. HELPERS
// ============================================================
function getClientIp(req) {
    return req.ip ||
           req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.connection?.remoteAddress ||
           'unknown';
}

// ============================================================
// 🔐 9. ACTIVITY LOG
// ============================================================
const activityLog = [];
const MAX_LOG_SIZE = 500;

function logActivity(entry) {
    activityLog.unshift({
        ...entry,
        timestamp: Date.now()
    });
    if (activityLog.length > MAX_LOG_SIZE) activityLog.pop();
}

function getActivityLog(limit = 100) {
    return activityLog.slice(0, limit);
}

// ============================================================
// 🔐 10. STATS
// ============================================================
function getSecurityStats() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    let blockedIPs = 0;
    let totalViolations = 0;
    const topViolators = [];
    for (const [ip, data] of ipReputation) {
        if (data.blocked && data.blockedUntil > now) blockedIPs++;
        totalViolations += data.violations;
        if (data.violations > 0) {
            topViolators.push({ ip, violations: data.violations });
        }
    }
    topViolators.sort((a, b) => b.violations - a.violations);

    const suspiciousUsers = [];
    for (const [username, data] of suspiciousActivity) {
        const score = getSuspicionScore(username);
        if (score > 0) {
            suspiciousUsers.push({
                username,
                score,
                reasons: data.reasons.slice(-5),
                lastSeen: data.lastSeen
            });
        }
    }
    suspiciousUsers.sort((a, b) => b.score - a.score);

    let recentConnections = 0;
    for (const [ip, arr] of connectionAttempts) {
        recentConnections += arr.filter(t => t > oneHourAgo).length;
    }

    return {
        blockedIPs,
        totalViolations,
        topViolators: topViolators.slice(0, 10),
        suspiciousUsers: suspiciousUsers.slice(0, 20),
        recentConnections,
        activeNonces: actionNonces.size,
        totalTrackedIPs: ipReputation.size,
        totalSuspicious: suspiciousActivity.size,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: now
    };
}

// ============================================================
// 🔐 11. IP MANAGEMENT
// ============================================================
function listBlockedIPs() {
    const now = Date.now();
    const result = [];
    for (const [ip, data] of ipReputation) {
        if (data.blocked && data.blockedUntil > now) {
            result.push({
                ip,
                violations: data.violations,
                blockedUntil: data.blockedUntil,
                remainingMs: data.blockedUntil - now,
                reasons: data.reasons.slice(-5)
            });
        }
    }
    return result.sort((a, b) => b.violations - a.violations);
}

function unblockIP(ip) {
    const entry = ipReputation.get(ip);
    if (!entry) return false;
    entry.blocked = false;
    entry.blockedUntil = 0;
    entry.violations = 0;
    entry.reasons = [];
    ipReputation.set(ip, entry);
    return true;
}

function manualBlockIP(ip, durationSeconds, reason) {
    let entry = ipReputation.get(ip) || {
        violations: 0, reasons: [], blocked: false, blockedUntil: 0
    };
    entry.blocked = true;
    entry.blockedUntil = Date.now() + (durationSeconds * 1000);
    entry.reasons.push({ reason: `manual: ${reason}`, time: Date.now() });
    ipReputation.set(ip, entry);
    return true;
}

// ============================================================
// 🚫 12. AUTO-BAN SYSTEM
// ============================================================

const VIOLATION_CONFIG = {
    // ════════ انتحال الهوية (الأخطر) ════════
    'fingerprint_mismatch': {
        weight: 60, autoBan: true, banDuration: 3600,
        category: 'impersonation', severity: 'critical'
    },
    'socket_fp_mismatch': {
        weight: 60, autoBan: true, banDuration: 3600,
        category: 'impersonation', severity: 'critical'
    },
    'bad_action_signature': {
        weight: 50, autoBan: true, banDuration: 3600,
        category: 'impersonation', severity: 'critical'
    },
    'invalid_token': {
        weight: 20, autoBan: false, banDuration: 300,
        category: 'auth', severity: 'medium'
    },

    // ════════ Brute Force ════════
    'targeted_bruteforce': {
        weight: 40, autoBan: true, banDuration: 7200,
        category: 'bruteforce', severity: 'critical'
    },
    'bruteforce_lockout': {
        weight: 30, autoBan: false, banDuration: 900,
        category: 'bruteforce', severity: 'high'
    },
    'login_flood': {
        weight: 15, autoBan: true, banDuration: 1800,
        category: 'flood', severity: 'high'
    },
    'register_flood': {
        weight: 20, autoBan: true, banDuration: 3600,
        category: 'flood', severity: 'high'
    },

    // ════════ Flood API ════════
    'api_flood': {
        weight: 10, autoBan: false, banDuration: 300,
        category: 'flood', severity: 'medium'
    },
    'connection_flood': {
        weight: 25, autoBan: true, banDuration: 3600,
        category: 'flood', severity: 'high'
    },

    // ════════ Flood Socket ════════
    'flood_roomMsg': {
        weight: 8, autoBan: false, banDuration: 120,
        category: 'flood', severity: 'low'
    },
    'flood_privateMsg': {
        weight: 8, autoBan: false, banDuration: 120,
        category: 'flood', severity: 'low'
    },
    'flood_game': {
        weight: 10, autoBan: false, banDuration: 300,
        category: 'flood', severity: 'medium'
    },
    'flood_gift': {
        weight: 12, autoBan: false, banDuration: 300,
        category: 'flood', severity: 'medium'
    },
    'flood_boost': {
        weight: 15, autoBan: false, banDuration: 600,
        category: 'flood', severity: 'medium'
    },
    'flood_friendReq': {
        weight: 10, autoBan: false, banDuration: 300,
        category: 'flood', severity: 'medium'
    },
    'flood_roomCreate': {
        weight: 15, autoBan: false, banDuration: 900,
        category: 'flood', severity: 'medium'
    },

    // ════════ General ════════
    'socket_rate_limit': {
        weight: 5, autoBan: false, banDuration: 60,
        category: 'rate_limit', severity: 'low'
    },
    'unknown': {
        weight: 5, autoBan: false, banDuration: 60,
        category: 'other', severity: 'low'
    }
};

const AUTO_BAN_THRESHOLDS = {
    levels: [
        { score: 20,  duration: 5 * 60,           reason: 'نقاط مشبوهة (20+)' },
        { score: 40,  duration: 30 * 60,          reason: 'نقاط مشبوهة (40+)' },
        { score: 60,  duration: 2 * 60 * 60,      reason: 'نقاط مشبوهة (60+)' },
        { score: 80,  duration: 6 * 60 * 60,      reason: 'نقاط مشبوهة (80+)' },
        { score: 100, duration: 24 * 60 * 60,     reason: 'نقاط مشبوهة (100+)' },
        { score: 150, duration: 7 * 24 * 60 * 60, reason: 'نقاط مشبوهة (150+)' }
    ],
    windowMs: 15 * 60 * 1000,
    decayRate: 0.5
};

const violationTracker = new Map();
const userViolationTracker = new Map();
const userIPs = new Map();
const MAX_IPS_PER_USER = 10;
const manualBans = new Map();

function handleViolation(ip, type, username = null, extra = {}) {
    const config = VIOLATION_CONFIG[type] || VIOLATION_CONFIG['unknown'];
    const now = Date.now();

    recordIpViolation(ip, type);

    logActivity({
        type: 'violation',
        violationType: type,
        ip,
        username,
        weight: config.weight,
        severity: config.severity,
        category: config.category,
        extra
    });

    if (username) {
        reportSuspicious(username, type, config.weight);
        trackUserIP(username, ip);
    }

    addToTracker(violationTracker, ip, type, config.weight);
    if (username) {
        addToTracker(userViolationTracker, username, type, config.weight);
    }

    // ⭐ حظر فوري
    if (config.autoBan) {
        const banInfo = {
            reason: `${config.category}: ${type}`,
            duration: config.banDuration,
            by: 'auto',
            createdAt: now
        };
        manualBlockIP(ip, config.banDuration, banInfo.reason);
        manualBans.set(ip, banInfo);

        if (username) {
            const userIPList = userIPs.get(username) || [];
            for (const uip of userIPList) {
                if (uip !== ip) {
                    manualBlockIP(uip, config.banDuration, `user ${username} auto-banned`);
                    manualBans.set(uip, {
                        reason: `linked to ${username}`,
                        duration: config.banDuration,
                        by: 'auto-chain',
                        createdAt: now
                    });
                }
            }
        }

        logActivity({
            type: 'auto_ban',
            ip,
            username,
            violationType: type,
            duration: config.banDuration,
            reason: config.category
        });

        if (sendTelegramAlert) {
            sendTelegramAlert({
                type: 'AUTO_BAN',
                ip,
                username,
                violation: type,
                duration: config.banDuration,
                severity: config.severity
            });
        }

        return {
            banned: true,
            duration: config.banDuration,
            reason: type,
            level: 'immediate'
        };
    }

    // ⭐ فحص الحظر التدريجي
    const userScore = username ? getTrackerScore(userViolationTracker, username) : 0;
    const ipScore = getTrackerScore(violationTracker, ip);
    const maxScore = Math.max(userScore, ipScore);

    let targetLevel = null;
    for (const level of AUTO_BAN_THRESHOLDS.levels) {
        if (maxScore >= level.score) {
            targetLevel = level;
        }
    }

    if (targetLevel) {
        const existingBan = manualBans.get(ip);
        if (!existingBan || (existingBan.createdAt + existingBan.duration * 1000) < now) {
            manualBlockIP(ip, targetLevel.duration, targetLevel.reason);
            manualBans.set(ip, {
                reason: targetLevel.reason,
                duration: targetLevel.duration,
                by: 'auto-threshold',
                createdAt: now,
                score: maxScore
            });

            logActivity({
                type: 'auto_ban_threshold',
                ip,
                username,
                score: maxScore,
                duration: targetLevel.duration,
                reason: targetLevel.reason
            });

            if (sendTelegramAlert) {
                sendTelegramAlert({
                    type: 'AUTO_BAN_THRESHOLD',
                    ip,
                    username,
                    score: maxScore,
                    duration: targetLevel.duration,
                    violations: getUserViolations(username || ip)
                });
            }

            return {
                banned: true,
                duration: targetLevel.duration,
                reason: targetLevel.reason,
                level: 'threshold',
                score: maxScore
            };
        }
    }

    return {
        banned: false,
        count: (violationTracker.get(ip) || []).length,
        score: maxScore
    };
}

function addToTracker(tracker, key, type, weight) {
    const now = Date.now();
    let arr = tracker.get(key) || [];
    arr.push({ type, weight, time: now });
    arr = arr.filter(v => now - v.time < AUTO_BAN_THRESHOLDS.windowMs);
    if (arr.length > 100) arr = arr.slice(-100);
    tracker.set(key, arr);
}

function getTrackerScore(tracker, key) {
    const now = Date.now();
    const arr = tracker.get(key) || [];
    const recent = arr.filter(v => now - v.time < AUTO_BAN_THRESHOLDS.windowMs);

    let score = 0;
    for (const v of recent) {
        const ageMinutes = (now - v.time) / 60000;
        const decay = Math.pow(AUTO_BAN_THRESHOLDS.decayRate, ageMinutes / 15);
        score += v.weight * decay;
    }
    return Math.round(score);
}

function getUserViolations(username) {
    if (!username) return [];
    return (userViolationTracker.get(username) || [])
        .filter(v => Date.now() - v.time < AUTO_BAN_THRESHOLDS.windowMs)
        .slice(-10);
}

function trackUserIP(username, ip) {
    if (!username || !ip) return;
    let ips = userIPs.get(username) || [];
    if (!ips.includes(ip)) {
        ips.push(ip);
        if (ips.length > MAX_IPS_PER_USER) ips.shift();
        userIPs.set(username, ips);
    }
}

function getUserIPs(username) {
    return userIPs.get(username) || [];
}

// ============================================================
// 🚫 13. MANUAL BAN MANAGEMENT
// ============================================================
function banIP(ip, durationSeconds, reason, adminUsername) {
    manualBlockIP(ip, durationSeconds, reason);
    manualBans.set(ip, {
        reason,
        duration: durationSeconds,
        by: adminUsername || 'admin',
        createdAt: Date.now()
    });
    logActivity({
        type: 'admin_ban',
        ip,
        admin: adminUsername,
        reason,
        duration: durationSeconds
    });
    return true;
}

function unbanIP(ip, adminUsername) {
    unblockIP(ip);
    manualBans.delete(ip);
    violationTracker.delete(ip);
    logActivity({
        type: 'admin_unban',
        ip,
        admin: adminUsername
    });
    return true;
}

function listAllBans() {
    const now = Date.now();
    const result = [];
    for (const [ip, data] of manualBans) {
        if (data.createdAt + (data.duration * 1000) > now) {
            result.push({
                ip,
                reason: data.reason,
                remainingMs: data.createdAt + (data.duration * 1000) - now,
                by: data.by,
                score: data.score,
                createdAt: data.createdAt,
                duration: data.duration
            });
        } else {
            manualBans.delete(ip);
        }
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
}

function clearViolations(key) {
    violationTracker.delete(key);
    userViolationTracker.delete(key);
    return true;
}

// ============================================================
// 🚫 14. TELEGRAM ALERTS BRIDGE
// ============================================================
let sendTelegramAlert = null;

function setTelegramAlertSender(fn) {
    sendTelegramAlert = fn;
}

// ============================================================
// 🚫 15. CLEANUP
// ============================================================
setInterval(() => {
    const now = Date.now();

    for (const [key, arr] of violationTracker) {
        const filtered = arr.filter(v => now - v.time < AUTO_BAN_THRESHOLDS.windowMs);
        if (filtered.length === 0) violationTracker.delete(key);
        else violationTracker.set(key, filtered);
    }

    for (const [key, arr] of userViolationTracker) {
        const filtered = arr.filter(v => now - v.time < AUTO_BAN_THRESHOLDS.windowMs);
        if (filtered.length === 0) userViolationTracker.delete(key);
        else userViolationTracker.set(key, filtered);
    }

    for (const [ip, data] of manualBans) {
        if (data.createdAt + (data.duration * 1000) < now) {
            manualBans.delete(ip);
        }
    }
}, 60000);

// ============================================================
// 🔐 EXPORTS
// ============================================================
module.exports = {
    // Fingerprinting
    generateFingerprint,
    generateSocketFingerprint,

    // Tokens
    signTokenWithFingerprint,
    verifyTokenWithFingerprint,

    // Action signing
    createActionSignature,
    verifyActionSignature,

    // Rate limiting
    limiters,
    SlidingWindowLimiter,
    TokenBucket,

    // Anomaly detection
    reportSuspicious,
    getSuspicionScore,
    clearSuspicion,

    // IP reputation
    recordIpViolation,
    isIpBlocked,

    // Connection rate
    checkConnectionRate,

    // Helpers
    getClientIp,
    logActivity,
    getActivityLog,
    getSecurityStats,
    listBlockedIPs,
    unblockIP,
    manualBlockIP,

    // Auto-Ban
    handleViolation,
    trackUserIP,
    getUserIPs,
    getUserViolations,
    banIP,
    unbanIP,
    listAllBans,
    clearViolations,
    setTelegramAlertSender,
    VIOLATION_CONFIG,
    AUTO_BAN_THRESHOLDS
};

