const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const app = express();

// CORS 支持
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

app.use(express.json());
app.use(express.static('public'));

const db = new sqlite3.Database('./database.db');

// 创建所有表
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        is_admin INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS user_words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        book_id INTEGER,
        word TEXT,
        meaning TEXT,
        example TEXT,
        category TEXT DEFAULT '默认',
        review_count INTEGER DEFAULT 0,
        ease_factor REAL DEFAULT 2.5,
        interval_days INTEGER DEFAULT 1,
        next_review DATE,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(book_id) REFERENCES books(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS study_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        word_id INTEGER,
        status TEXT,
        studied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS user_checkins (
        user_id INTEGER,
        checkin_date DATE,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS public_wordbooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        description TEXT,
        words TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
        if (!row) {
            bcrypt.hash('admin123', 10, (err, hash) => {
                db.run("INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)", ['admin', hash]);
                console.log('管理员账号: admin / admin123');
            });
        }
    });
});

// ========== 用户接口 ==========
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password, is_admin) VALUES (?, ?, 0)', [username, hashedPassword], function(err) {
        if (err) return res.json({ success: false, message: '用户名已存在' });
        db.run('INSERT INTO books (user_id, name, description) VALUES (?, ?, ?)', [this.lastID, '我的生词本', '手动添加的单词']);
        res.json({ success: true, userId: this.lastID });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.json({ success: false, message: '用户名或密码错误' });
        }
        res.json({ success: true, userId: user.id, username: user.username, isAdmin: user.is_admin === 1 });
    });
});

app.put('/api/user/update-username', (req, res) => {
    const { userId, newUsername } = req.body;
    db.get('SELECT id FROM users WHERE username = ? AND id != ?', [newUsername, userId], (err, row) => {
        if(row) return res.json({ success: false, message: '用户名已存在' });
        db.run('UPDATE users SET username = ? WHERE id = ?', [newUsername, userId], function(err) {
            res.json({ success: !err });
        });
    });
});

app.put('/api/user/update-password', async (req, res) => {
    const { userId, oldPassword, newPassword } = req.body;
    db.get('SELECT password FROM users WHERE id = ?', [userId], async (err, user) => {
        if(!user || !(await bcrypt.compare(oldPassword, user.password))) {
            return res.json({ success: false, message: '原密码错误' });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId], function(err) {
            res.json({ success: !err });
        });
    });
});

// ========== 词书接口 ==========
app.get('/api/books/:userId', (req, res) => {
    db.all('SELECT * FROM books WHERE user_id = ? ORDER BY id', [req.params.userId], (err, books) => {
        res.json(books);
    });
});

app.post('/api/books', (req, res) => {
    const { userId, name, description } = req.body;
    db.run('INSERT INTO books (user_id, name, description) VALUES (?, ?, ?)', [userId, name, description || ''], function(err) {
        res.json({ success: !err, id: this.lastID });
    });
});

app.delete('/api/books/:bookId', (req, res) => {
    const bookId = req.params.bookId;
    db.run('DELETE FROM user_words WHERE book_id = ?', [bookId]);
    db.run('DELETE FROM books WHERE id = ?', [bookId], () => {
        res.json({ success: true });
    });
});

// ========== 单词接口 ==========
app.get('/api/books/:bookId/words', (req, res) => {
    db.all('SELECT * FROM user_words WHERE book_id = ? ORDER BY id', [req.params.bookId], (err, words) => {
        res.json(words);
    });
});

app.post('/api/words', (req, res) => {
    const { userId, bookId, word, meaning, example, category } = req.body;
    db.run('INSERT INTO user_words (user_id, book_id, word, meaning, example, category) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, bookId, word, meaning, example || '', category || '默认'], function(err) {
            res.json({ success: !err, id: this.lastID });
        });
});

app.delete('/api/words/:wordId', (req, res) => {
    db.run('DELETE FROM user_words WHERE id = ?', [req.params.wordId], () => {
        res.json({ success: true });
    });
});

app.post('/api/update-review-params', (req, res) => {
    const { wordId, quality } = req.body;
    db.get('SELECT ease_factor, interval_days, review_count FROM user_words WHERE id = ?', [wordId], (err, word) => {
        if(!word) return res.json({ success: false });
        let { ease_factor, interval_days, review_count } = word;
        review_count = (review_count || 0) + 1;
        if(quality === 0) {
            interval_days = 0;
            ease_factor = Math.max(1.3, ease_factor - 0.2);
        } else {
            if(review_count === 1) interval_days = 1;
            else if(review_count === 2) interval_days = 3;
            else if(review_count === 3) interval_days = 7;
            else if(review_count === 4) interval_days = 14;
            else interval_days = Math.round(interval_days * ease_factor);
            interval_days = Math.min(interval_days, 180);
            ease_factor = ease_factor + 0.1;
        }
        const next_review = new Date();
        next_review.setDate(next_review.getDate() + interval_days);
        const next_review_str = next_review.toISOString().split('T')[0];
        db.run(`UPDATE user_words SET ease_factor = ?, interval_days = ?, next_review = ?, review_count = ? WHERE id = ?`, [ease_factor, interval_days, next_review_str, review_count, wordId], () => {
            res.json({ success: true });
        });
    });
});

app.post('/api/study', (req, res) => {
    const { userId, wordId, status } = req.body;
    db.run('INSERT INTO study_records (user_id, word_id, status) VALUES (?, ?, ?)', [userId, wordId, status]);
    res.json({ success: true });
});

// ========== 打卡接口 ==========
app.post('/api/checkin', (req, res) => {
    const { userId } = req.body;
    const today = new Date().toISOString().split('T')[0];
    db.run('INSERT INTO user_checkins (user_id, checkin_date) VALUES (?, ?)', [userId, today], (err) => {
        res.json({ success: !err });
    });
});

app.get('/api/checkin/:userId', (req, res) => {
    const userId = req.params.userId;
    const today = new Date().toISOString().split('T')[0];
    db.get('SELECT * FROM user_checkins WHERE user_id = ? AND checkin_date = ?', [userId, today], (err, row) => {
        res.json({ checkedIn: !!row });
    });
});

app.get('/api/checkin-streak/:userId', (req, res) => {
    const userId = req.params.userId;
    db.all('SELECT checkin_date FROM user_checkins WHERE user_id = ? ORDER BY checkin_date DESC', [userId], (err, rows) => {
        let streak = 0;
        let lastDate = null;
        for(let row of rows) {
            const currentDate = new Date(row.checkin_date);
            if(lastDate === null) streak = 1;
            else {
                const diffDays = (lastDate - currentDate) / (1000 * 60 * 60 * 24);
                if(diffDays === 1) streak++;
                else break;
            }
            lastDate = currentDate;
        }
        res.json({ streak });
    });
});

// ========== 统计接口 ==========
app.get('/api/stats/:userId', (req, res) => {
    const userId = req.params.userId;
    const today = new Date().toISOString().split('T')[0];
    db.get('SELECT COUNT(*) as total FROM user_words WHERE user_id = ?', [userId], (err, total) => {
        db.get('SELECT COUNT(DISTINCT word_id) as today FROM study_records WHERE user_id = ? AND date(studied_at) = ?', [userId, today], (err, todayStudy) => {
            db.get('SELECT COUNT(*) as mastered FROM user_words WHERE user_id = ? AND review_count >= 3', [userId], (err, mastered) => {
                res.json({
                    total: total.total || 0,
                    today: todayStudy.today || 0,
                    mastered: mastered.mastered || 0
                });
            });
        });
    });
});

// ========== 公告接口 ==========
app.get('/api/announcements', (req, res) => {
    db.all('SELECT * FROM announcements ORDER BY id DESC LIMIT 1', (err, announcements) => {
        res.json(announcements || []);
    });
});

app.post('/api/admin/announcement', (req, res) => {
    const { title, content } = req.body;
    db.run('INSERT INTO announcements (title, content) VALUES (?, ?)', [title, content], (err) => {
        res.json({ success: !err });
    });
});

// ========== 管理员用户列表 ==========
app.get('/api/admin/users', (req, res) => {
    db.all('SELECT id, username, created_at FROM users WHERE is_admin = 0', (err, users) => {
        res.json(users || []);
    });
});

// ========== 公开词书 ==========
app.get('/api/public-wordbooks', (req, res) => {
    db.all('SELECT * FROM public_wordbooks ORDER BY id DESC', (err, books) => {
        res.json(books || []);
    });
});

app.post('/api/admin/public-wordbook', (req, res) => {
    const { name, description, words } = req.body;
    if(!name || !words) return res.json({ success: false, message: '词书名和单词列表不能为空' });
    db.run('INSERT INTO public_wordbooks (name, description, words) VALUES (?, ?, ?)', [name, description || '', JSON.stringify(words)], function(err) {
        if(err) return res.json({ success: false, message: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

app.delete('/api/admin/public-wordbook/:id', (req, res) => {
    db.run('DELETE FROM public_wordbooks WHERE id = ?', [req.params.id], function(err) {
        if(err) return res.json({ success: false });
        res.json({ success: true });
    });
});

app.post('/api/select-public-wordbook', (req, res) => {
    const { userId, publicBookId } = req.body;
    // 获取公开词书的单词
    db.get('SELECT words FROM public_wordbooks WHERE id = ?', [publicBookId], (err, book) => {
        if(!book) return res.json({ success: false, message: '词书不存在' });
        
        // 获取用户的"当前词书"设置
        const words = JSON.parse(book.words);
        // 创建或更新用户当前使用的词书
        db.run('INSERT OR REPLACE INTO user_current_book (user_id, book_data) VALUES (?, ?)', [userId, JSON.stringify(words)], (err) => {
            if(err) return res.json({ success: false });
            res.json({ success: true, count: words.length });
        });
    });
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
    console.log(`服务器已启动！端口: ${port}`);
    console.log('管理员: admin / admin123');
});