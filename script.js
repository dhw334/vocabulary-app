const API_BASE = '';
let userId = localStorage.getItem('userId');
let books = [];
let currentBookId = null;
let words = [];
let currentStudyQueue = [];
let currentIndex = 0;
let currentWordObj = null;
let startX = 0, currentX = 0;
let todayStudiedCount = 0;
let dailyLimit = 0;
let studiedToday = new Set();

window.onload = () => {
    if(!userId) window.location.href = '/';
    document.getElementById('username').innerText = localStorage.getItem('username');
    loadStats();
    loadCheckinStatus();
    loadAnnouncement();
    loadBooks();
    initSwipe();
    setupShortcuts();
    if(localStorage.getItem('isAdmin') === 'true') {
        document.getElementById('adminPanel').style.display = 'block';
    }
};

function setupShortcuts() {
    document.addEventListener('keydown', (e) => {
        if(e.key === 'ArrowLeft') leftSwipe();
        if(e.key === 'ArrowRight') rightSwipe();
        if(e.key === ' ' || e.key === 'Space') {
            e.preventDefault();
            if(document.getElementById('cardFront').style.display !== 'none') showMeaningOnly();
        }
        if(e.key === 'Enter' && document.getElementById('spellArea').style.display !== 'none') checkSpell();
    });
}

function speakWord() {
    if(currentWordObj) {
        const utterance = new SpeechSynthesisUtterance(currentWordObj.word);
        utterance.lang = 'en-US';
        speechSynthesis.speak(utterance);
    }
}

function loadStats() {
    fetch(`/api/stats/${userId}`).then(res => res.json()).then(data => {
        document.getElementById('totalWords').innerText = data.total;
        document.getElementById('todayLearned').innerText = data.today;
        document.getElementById('masteredWords').innerText = data.mastered;
        todayStudiedCount = data.today;
    });
    fetch(`/api/checkin-streak/${userId}`).then(res => res.json()).then(data => {
        document.getElementById('streakDays').innerText = data.streak;
    });
}

function loadCheckinStatus() {
    fetch(`/api/checkin/${userId}`).then(res => res.json()).then(data => {
        const btn = document.getElementById('checkinBtn');
        if(data.checkedIn) {
            btn.innerText = '✅ 今日已打卡';
            btn.disabled = true;
        } else {
            btn.innerText = '📅 今日打卡';
            btn.disabled = false;
        }
    });
}

function checkin() {
    fetch('/api/checkin', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({userId}) })
        .then(() => { loadCheckinStatus(); loadStats(); alert('打卡成功！🔥'); });
}

function loadAnnouncement() {
    fetch('/api/announcements').then(res => res.json()).then(data => {
        if(data && data.length > 0) {
            document.getElementById('announcementBar').style.display = 'block';
            document.getElementById('announcementText').innerHTML = `<strong>${data[0].title}</strong><br>${data[0].content}`;
        }
    });
}

function loadBooks() {
    fetch(`/api/books/${userId}`).then(res => res.json()).then(data => {
        books = data;
        renderBooksList();
        updateBookSelects();
        loadImportTargetBookSelect();
        loadPublicBookSelect();
        if(!currentBookId && books.length > 0) {
            currentBookId = books[0].id;
            loadWordsByBook();
        }
    });
}

function renderBooksList() {
    const container = document.getElementById('booksList');
    if(!container) return;
    container.innerHTML = '';
    books.forEach(book => {
        const div = document.createElement('div');
        div.className = 'book-item';
        div.innerHTML = `<span>📖 ${escapeHtml(book.name)}</span><div><button onclick="selectBook(${book.id})">选择</button><button class="delete-btn" onclick="deleteBook(${book.id})">删除</button></div>`;
        container.appendChild(div);
    });
}

function updateBookSelects() {
    const options = books.map(b => `<option value="${b.id}">📖 ${escapeHtml(b.name)}</option>`).join('');
    const bookSelect = document.getElementById('bookSelect');
    const bookSelectAdd = document.getElementById('bookSelectAdd');
    if(bookSelect) bookSelect.innerHTML = options;
    if(bookSelectAdd) bookSelectAdd.innerHTML = options;
    if(bookSelect && currentBookId) bookSelect.value = currentBookId;
}

function selectBook(bookId) {
    currentBookId = bookId;
    updateBookSelects();
    studiedToday.clear();
    loadWordsByBook();
    showTab('study', document.querySelector('.tab-btn'));
}

function switchBook() {
    currentBookId = parseInt(document.getElementById('bookSelect').value);
    studiedToday.clear();
    loadWordsByBook();
}

function createBook() {
    const name = document.getElementById('newBookName').value;
    if(!name) return alert('请输入词书名');
    fetch('/api/books', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({userId, name, description: ''}) })
        .then(() => { loadBooks(); document.getElementById('newBookName').value = ''; alert('创建成功'); });
}

function deleteBook(bookId) {
    if(!confirm('删除词书会清空其中的单词，确定吗？')) return;
    fetch(`/api/books/${bookId}`, {method: 'DELETE'}).then(() => {
        loadBooks();
        if(bookId === currentBookId && books.length > 0) currentBookId = books[0]?.id;
        loadWordsByBook();
    });
}

function loadWordsByBook() {
    if(!currentBookId) return;
    fetch(`/api/books/${currentBookId}/words`).then(res => res.json()).then(data => {
        words = data;
        studiedToday.clear();
        loadDueWords();
        renderWordList();
        loadStats();
    });
}

function loadDueWords() {
    const today = new Date().toISOString().split('T')[0];
    let due = words.filter(w => !w.next_review || w.next_review <= today);
    due.sort((a, b) => {
        if(!a.next_review) return -1;
        if(!b.next_review) return 1;
        return a.next_review.localeCompare(b.next_review);
    });
    dailyLimit = parseInt(document.getElementById('dailyLimit').value);
    let available = due.filter(w => !studiedToday.has(w.id));
    if(dailyLimit > 0 && available.length > dailyLimit) available = available.slice(0, dailyLimit);
    currentStudyQueue = available;
    const orderMode = document.getElementById('orderMode').value;
    if(orderMode === 'random') {
        for(let i = currentStudyQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [currentStudyQueue[i], currentStudyQueue[j]] = [currentStudyQueue[j], currentStudyQueue[i]];
        }
    }
    currentIndex = 0;
    if(currentStudyQueue.length > 0) {
        loadWordForStudy(0);
        document.getElementById('studyStats').innerHTML = `📅 今日待复习: ${currentStudyQueue.length} 个`;
    } else {
        document.getElementById('currentWord').innerText = '🎉 今天没有需要复习的单词！';
        document.getElementById('studyStats').innerHTML = '0 / 0';
    }
}

function resetStudyQueue() { loadDueWords(); }

function loadWordForStudy(index) {
    if(currentStudyQueue.length === 0) return;
    if(dailyLimit > 0 && todayStudiedCount >= dailyLimit) {
        document.getElementById('currentWord').innerText = '🎉 今日目标已完成！明天继续~';
        document.getElementById('cardFront').style.display = 'block';
        document.getElementById('cardBack').style.display = 'none';
        return;
    }
    currentWordObj = currentStudyQueue[index];
    document.getElementById('currentWord').innerText = currentWordObj.word;
    document.getElementById('cardFront').style.display = 'block';
    document.getElementById('cardBack').style.display = 'none';
    document.getElementById('spellArea').style.display = 'none';
    document.getElementById('studyStats').innerHTML = `📅 ${index+1} / ${currentStudyQueue.length}`;
}

function renderWordList() {
    const container = document.getElementById('wordList');
    if(!container) return;
    container.innerHTML = words.map(w => `<div class="word-item"><div><strong>${escapeHtml(w.word)}</strong> - ${escapeHtml(w.meaning)} <span style="color:#999">[${w.category || '默认'}]</span></div><button class="delete-btn" onclick="deleteWord(${w.id})">删除</button></div>`).join('');
}

function addWord() {
    const word = document.getElementById('newWord').value;
    const meaning = document.getElementById('newMeaning').value;
    const category = document.getElementById('newCategory').value || '默认';
    const example = document.getElementById('newExample').value;
    const bookId = parseInt(document.getElementById('bookSelectAdd').value);
    if(!word || !meaning) return alert('请填写单词和释义');
    if(!bookId) return alert('请选择词书');
    fetch('/api/words', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({userId, bookId, word, meaning, example, category}) })
        .then(() => { loadWordsByBook(); document.getElementById('newWord').value = ''; document.getElementById('newMeaning').value = ''; document.getElementById('newCategory').value = ''; document.getElementById('newExample').value = ''; alert('添加成功'); });
}

function deleteWord(wordId) {
    if(confirm('确定删除？')) fetch(`/api/words/${wordId}`, {method: 'DELETE'}).then(() => loadWordsByBook());
}

function initSwipe() {
    const card = document.getElementById('studyCard');
    card.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; });
    card.addEventListener('touchmove', (e) => { currentX = e.touches[0].clientX; let diff = currentX - startX; card.style.transform = `translateX(${diff}px) rotate(${diff/20}deg)`; });
    card.addEventListener('touchend', () => {
        let diff = currentX - startX;
        if(diff > 80) rightSwipe();
        else if(diff < -80) leftSwipe();
        card.style.transform = '';
        card.style.transition = 'transform 0.3s';
        setTimeout(() => card.style.transition = '', 300);
    });
}

function leftSwipe() {
    if(dailyLimit > 0 && todayStudiedCount >= dailyLimit) return;
    showMeaningOnly();
    setTimeout(() => { recordStudy('forgot'); nextWord(); }, 1500);
}

function rightSwipe() {
    if(dailyLimit > 0 && todayStudiedCount >= dailyLimit) return;
    document.getElementById('cardFront').style.display = 'none';
    document.getElementById('cardBack').style.display = 'block';
    document.getElementById('wordMeaning').innerText = currentWordObj.meaning;
    document.getElementById('wordExample').innerText = currentWordObj.example || '';
    document.getElementById('spellArea').style.display = 'block';
    document.getElementById('spellInput').value = '';
    document.getElementById('spellInput').focus();
}

function showMeaningOnly() {
    document.getElementById('cardFront').style.display = 'none';
    document.getElementById('cardBack').style.display = 'block';
    document.getElementById('wordMeaning').innerText = currentWordObj.meaning;
    document.getElementById('wordExample').innerText = currentWordObj.example || '';
    document.getElementById('spellArea').style.display = 'none';
}

function checkSpell() {
    const userSpell = document.getElementById('spellInput').value.trim().toLowerCase();
    const correctWord = currentWordObj.word.toLowerCase();
    if(userSpell === correctWord) {
        alert('✅ 拼写正确！');
        recordStudy('remembered');
        todayStudiedCount++;
        loadStats();
        nextWord();
    } else {
        alert(`❌ 拼写错误！正确答案：${currentWordObj.word}`);
        recordStudy('forgot');
        nextWord();
    }
}

function recordStudy(status) {
    const quality = status === 'remembered' ? 1 : 0;
    fetch('/api/update-review-params', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ wordId: currentWordObj.id, quality }) });
    fetch('/api/study', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ userId, wordId: currentWordObj.id, status }) });
    studiedToday.add(currentWordObj.id);
}

function nextWord() {
    currentIndex++;
    if(currentIndex >= currentStudyQueue.length) {
        alert(`🎉 恭喜！今日复习任务完成！\n学习了 ${todayStudiedCount} 个单词`);
        loadDueWords();
    } else {
        loadWordForStudy(currentIndex);
    }
}

function showTab(tab, btnElement) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.getElementById(`${tab}Tab`).style.display = 'block';
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if(btnElement) btnElement.classList.add('active');
    if(tab === 'words') { loadWordsByBook(); loadBooks(); }
    if(tab === 'study') loadDueWords();
}

function updateUsername() {
    const newUsername = document.getElementById('newUsername').value.trim();
    if(!newUsername) return alert('请输入新用户名');
    fetch('/api/user/update-username', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({userId, newUsername}) })
        .then(res => res.json()).then(data => {
            if(data.success) { alert('用户名修改成功！'); localStorage.setItem('username', newUsername); document.getElementById('username').innerText = newUsername; document.getElementById('newUsername').value = ''; }
            else alert(data.message || '修改失败');
        });
}

function updatePassword() {
    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    if(!oldPassword || !newPassword) return alert('请填写原密码和新密码');
    if(newPassword.length < 3) return alert('新密码至少3位');
    if(newPassword !== confirmPassword) return alert('两次输入的新密码不一致');
    fetch('/api/user/update-password', { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({userId, oldPassword, newPassword}) })
        .then(res => res.json()).then(data => { if(data.success) { alert('密码修改成功！请重新登录'); logout(); } else alert(data.message || '修改失败'); });
}

// 管理员功能
function showAdminUsers() {
    fetch('/api/admin/users').then(res => res.json()).then(users => {
        document.getElementById('adminContent').innerHTML = `<h3>注册用户 (${users.length})</h3>` + users.map(u => `<div class="user-list">${escapeHtml(u.username)} - 注册于 ${u.created_at}</div>`).join('');
    });
}

function showAdminWordbooks() {
    const container = document.getElementById('adminContent');
    container.innerHTML = `
        <h3>📚 管理公开词书</h3>
        <div style="margin-bottom:20px; padding:15px; background:#f5f5f5; border-radius:10px;">
            <h4>添加新词书</h4>
            <input type="text" id="pubBookName" placeholder="词书名称" style="width:100%; padding:8px; margin:5px 0">
            <input type="text" id="pubBookDesc" placeholder="描述（可选）" style="width:100%; padding:8px; margin:5px 0">
            <textarea id="pubBookWords" placeholder="单词列表，每行格式：单词,释义,例句" style="width:100%; height:200px; padding:8px; margin:5px 0"></textarea>
            <button onclick="addPublicWordbook()" style="background:#4CAF50; color:white; border:none; padding:10px 20px; border-radius:5px;">➕ 添加词书</button>
        </div>
        <h4>现有公开词书</h4>
        <div id="publicWordbooksList"></div>
    `;
    loadPublicWordbooksList();
}

function loadPublicWordbooksList() {
    fetch('/api/public-wordbooks').then(res => res.json()).then(books => {
        const container = document.getElementById('publicWordbooksList');
        if(!container) return;
        if(books.length === 0) { container.innerHTML = '<p>暂无公开词书</p>'; return; }
        container.innerHTML = books.map(book => `
            <div style="border:1px solid #ddd; padding:10px; margin:10px 0; border-radius:8px;">
                <strong>📖 ${escapeHtml(book.name)}</strong>
                <span style="color:#666;">${book.description || ''}</span>
                <span style="color:#999;">(${JSON.parse(book.words).length}词)</span>
                <button onclick="deletePublicWordbook(${book.id})" style="float:right; background:#ff4757; color:white; border:none; padding:5px 10px; border-radius:5px;">删除</button>
            </div>
        `).join('');
    });
}

function addPublicWordbook() {
    const name = document.getElementById('pubBookName').value.trim();
    const description = document.getElementById('pubBookDesc').value.trim();
    const wordsText = document.getElementById('pubBookWords').value;
    if(!name) return alert('请输入词书名称');
    if(!wordsText) return alert('请输入单词列表');
    const words = [];
    const lines = wordsText.split('\n');
    for(let line of lines) {
        line = line.trim();
        if(line === '') continue;
        const parts = line.split(',');
        const word = parts[0]?.trim();
        const meaning = parts[1]?.trim();
        const example = parts.slice(2).join(',').trim() || '';
        if(word && meaning) words.push({ word, meaning, example });
    }
    if(words.length === 0) return alert('没有有效的单词');
    fetch('/api/admin/public-wordbook', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name, description, words }) })
        .then(res => res.json()).then(data => {
            if(data.success) { alert(`添加成功！共 ${words.length} 个单词`); document.getElementById('pubBookName').value = ''; document.getElementById('pubBookDesc').value = ''; document.getElementById('pubBookWords').value = ''; loadPublicWordbooksList(); loadPublicBookSelect(); }
            else alert('添加失败');
        });
}

function deletePublicWordbook(id) {
    if(!confirm('确定删除？')) return;
    fetch(`/api/admin/public-wordbook/${id}`, {method: 'DELETE'}).then(() => { loadPublicWordbooksList(); loadPublicBookSelect(); });
}

function showAdminAnnounce() {
    document.getElementById('adminContent').innerHTML = `
        <h3>发布公告</h3>
        <input type="text" id="announceTitle" placeholder="标题" style="width:100%; padding:10px; margin:10px 0">
        <textarea id="announceContent" placeholder="公告内容" style="width:100%; padding:10px; margin:10px 0" rows="3"></textarea>
        <button onclick="publishAnnouncement()">发布</button>
    `;
}

function publishAnnouncement() {
    const title = document.getElementById('announceTitle').value;
    const content = document.getElementById('announceContent').value;
    if(!title || !content) return alert('请填写完整');
    fetch('/api/admin/announcement', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({title, content}) })
        .then(() => { alert('公告已发布'); loadAnnouncement(); document.getElementById('adminContent').innerHTML = ''; });
}

// 用户导入公开词书
function loadPublicBookSelect() {
    const select = document.getElementById('publicBookSelect');
    if(!select) return;
    fetch('/api/public-wordbooks').then(res => res.json()).then(books => {
        if(books.length === 0) { select.innerHTML = '<option>暂无公开词书</option>'; return; }
        select.innerHTML = books.map(book => `<option value="${book.id}">📖 ${escapeHtml(book.name)} (${JSON.parse(book.words).length}词)</option>`).join('');
    });
}

function loadImportTargetBookSelect() {
    const select = document.getElementById('importTargetBook');
    if(!select) return;
    select.innerHTML = '<option value="">选择目标词书</option>' + books.map(b => `<option value="${b.id}">📖 ${escapeHtml(b.name)}</option>`).join('');
}

function importPublicWordbook() {
    const publicBookId = document.getElementById('publicBookSelect').value;
    const targetBookId = document.getElementById('importTargetBook').value;
    if(!publicBookId || publicBookId === '暂无公开词书') return alert('请选择要导入的词书');
    if(!targetBookId) return alert('请选择目标词书');
    fetch('/api/import-public-wordbook', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ userId, publicBookId, targetBookId }) })
        .then(res => res.json()).then(data => {
            if(data.success) { alert(`导入成功！共导入 ${data.count} 个单词`); loadWordsByBook(); }
            else alert('导入失败');
        });
}

function logout() { localStorage.clear(); window.location.href = '/'; }
function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])); }