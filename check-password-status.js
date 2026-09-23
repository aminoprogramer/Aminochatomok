// check-passwords-status.js
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mokalmat';

const userSchema = new mongoose.Schema({ username: String, password: String }, {
    collection: 'users', strict: false
});
const User = mongoose.model('User', userSchema);

function isBcryptHash(str) {
    return /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(str || '');
}

(async () => {
    await mongoose.connect(MONGODB_URI);
    const users = await User.find({}, 'username password isAdmin').lean();
    const hashed = users.filter(u => isBcryptHash(u.password));
    const plain = users.filter(u => u.password && !isBcryptHash(u.password));
    const empty = users.filter(u => !u.password);

    console.log('\n📊 Password Status Report');
    console.log('='.repeat(40));
    console.log(`Total users:   ${users.length}`);
    console.log(`✅ Bcrypt:     ${hashed.length}`);
    console.log(`⚠️  Plaintext:  ${plain.length}`);
    console.log(`❌ Empty:       ${empty.length}`);
    console.log('='.repeat(40));

    if (plain.length > 0 && plain.length <= 20) {
        console.log('\nPlaintext users:');
        plain.forEach(u => console.log(`  • ${u.username}`));
    }
    if (empty.length > 0 && empty.length <= 20) {
        console.log('\nEmpty-password users:');
        empty.forEach(u => console.log(`  • ${u.username}${u.isAdmin ? ' [ADMIN]' : ''}`));
    }

    await mongoose.disconnect();
})();

