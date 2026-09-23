// migrate-passwords.js
require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mokalmat';
const BCRYPT_ROUNDS = 12;
const BACKUP_DIR = path.join(__dirname, 'migration-backup');

const C = {
    reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
    yellow: '\x1b[33m', cyan: '\x1b[36m', magenta: '\x1b[35m'
};
const log = (m, c = 'reset') => console.log(`${C[c]}${m}${C.reset}`);

const userSchema = new mongoose.Schema({}, { collection: 'users', strict: false });
const User = mongoose.model('User', userSchema);

function isBcryptHash(str) {
    return /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(str || '');
}

async function createBackup() {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `users-backup-${timestamp}.json`);

    log('\n📦 Creating backup...', 'cyan');
    const users = await User.find({}).lean();
    fs.writeFileSync(backupFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        database: MONGODB_URI,
        userCount: users.length,
        users
    }, null, 2));
    log(`✅ Backup: ${backupFile} (${users.length} users)`, 'green');
    return backupFile;
}

async function migrate() {
    log('\n' + '='.repeat(60), 'magenta');
    log('  🔐 PASSWORD MIGRATION — plaintext → bcrypt', 'magenta');
    log('='.repeat(60) + '\n', 'magenta');

    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    log('✅ MongoDB connected\n', 'green');

    const users = await User.find({}, 'username password').lean();
    const plaintextUsers = users.filter(u => !isBcryptHash(u.password));

    log(`📊 Users: ${users.length} | Plaintext: ${plaintextUsers.length}`, 'cyan');

    if (plaintextUsers.length === 0) {
        log('\n🎉 Nothing to migrate!', 'green');
        await mongoose.disconnect();
        return;
    }

    if (!process.argv.includes('--force')) {
        log('\n⚠️  Will convert ' + plaintextUsers.length + ' passwords.', 'yellow');
        log('   Press Ctrl+C to cancel, or wait 10 seconds...', 'yellow');
        await new Promise(r => setTimeout(r, 10000));
    }

    const backupFile = await createBackup();

    log('\n🔄 Migrating...', 'cyan');
    let success = 0, failed = 0;
    const errors = [];

    for (let i = 0; i < plaintextUsers.length; i++) {
        const user = plaintextUsers[i];
        try {
            const fresh = await User.findOne({ username: user.username }, 'password').lean();
            if (!fresh || isBcryptHash(fresh.password)) { success++; continue; }
            if (!fresh.password) { failed++; continue; }

            const hashed = await bcrypt.hash(String(fresh.password), BCRYPT_ROUNDS);
            const result = await User.updateOne(
                { username: user.username, password: fresh.password },
                { $set: { password: hashed } }
            );

            if (result.modifiedCount === 1) {
                log(`   [${i+1}/${plaintextUsers.length}] ✅ ${user.username}`, 'green');
                success++;
            } else {
                log(`   [${i+1}/${plaintextUsers.length}] ⚠️  ${user.username}`, 'yellow');
                failed++;
            }
        } catch (err) {
            log(`   [${i+1}/${plaintextUsers.length}] ❌ ${user.username} — ${err.message}`, 'red');
            failed++;
            errors.push({ username: user.username, error: err.message });
        }
    }

    const verify = await User.find({}, 'username password').lean();
    const stillPlain = verify.filter(u => !isBcryptHash(u.password) && u.password);

    log('\n' + '='.repeat(60), 'magenta');
    log(`   ✅ Migrated: ${success}`, 'green');
    log(`   ❌ Failed:   ${failed}`, failed > 0 ? 'red' : 'green');
    log(`   ⚠️  Still plaintext: ${stillPlain.length}`, stillPlain.length > 0 ? 'red' : 'green');
    log(`   📦 Backup: ${backupFile}`, 'cyan');
    log('='.repeat(60) + '\n', 'magenta');

    if (errors.length) {
        log('Errors:', 'red');
        errors.forEach(e => log(`  • ${e.username}: ${e.error}`, 'red'));
    }

    if (stillPlain.length === 0) {
        log('🎉 MIGRATION COMPLETE!', 'green');
    }

    await mongoose.disconnect();
}

migrate().then(() => process.exit(0)).catch(err => {
    log('\n❌ FATAL: ' + err.message, 'red');
    console.error(err);
    process.exit(1);
});

