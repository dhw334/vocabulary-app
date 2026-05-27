const API_URL = '';

let userId = localStorage.getItem('userId');
let publicBooks = [];
let currentBookId = null;
let currentBookName = '';
let currentWords = [];
let currentStudyQueue = [];
let currentIndex = 0;
let currentWordObj = null;
let startX = 0, currentX = 0;
let todayStudiedCount = 0;
let dailyLimit = 20;
let studiedToday = new Set();
let soundEnabled = true;

// 音效
function playCorrectSound() {
    if (!soundEnabled) return;
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 880;
        gainNode.gain.value = 0.2;
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch(e) { console.log('音效失败'); }
}

// 发音
function speakWord() {
    if(!currentWordObj) return;
    try { window.speechSynthesis.cancel(); } catch(e) {}
    setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(currentWordObj.word);
        utterance.lang = 'en-US';
        utterance.rate = 0.85;
        let voices = [];
        try { voices = window.speechSynthesis.getVoices(); } catch(e) {}
        let englishVoice = voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang === 'en-GB') || voices.find(v => v.lang && v.lang.startsWith('en'));
        if (englishVoice) utterance.voice = englishVoice;
        window.speechSynthesis.speak(utterance);
    }, 100);
}

// 页面加载
window.onload = async () => {
    if(!userId) { window.location.href = API_URL + '/'; return; }
    document.getElementById('username').innerText = localStorage.getItem('username');
    
    // 加载设置
    const savedLimit = localStorage.getItem('dailyLimit');
    if(savedLimit) dailyLimit = parseInt(savedLimit);
    document.getElementById('dailyLimitSetting').value = dailyLimit;
    const savedSound = localStorage.getItem('soundEnabled');
    if(savedSound !== null) soundEnabled = savedSound === 'true';
    document.getElementById('soundToggle').checked = soundEnabled;
    
    // 显示管理员按钮
    if(localStorage.getItem('isAdmin') === 'true') {
        document.getElementById('adminBtn').style.display = 'block';
    }
    
    await loadStats();
    await loadCheckinStatus();
    await loadAnnouncement();
    await loadPublicBooks();
    await loadCurrentBook();
};

async function fetchAPI(url, options = {}) {
    const response = await fetch(API_URL + url, options);
    return response.json();
}

// 统计
async function loadStats() {
    const data = await fetchAPI('/api/stats/' + userId);
    document.getElementById('totalWords').innerText = data.total;
    document.getElementById('todayLearned').innerText = data.today;
    document.getElementById('masteredWords').innerText = data.mastered;
    todayStudiedCount = data.today;
    updateProgress();
}
async function loadCheckinStatus() {
    const data = await fetchAPI('/api/checkin/' + userId);
    const btn = document.getElementById('checkinBtn');
    if(data.checkedIn) { btn.innerText = '✅ 今日已打卡'; btn.disabled = true; }
    else { btn.innerText = '📅 今日打卡'; btn.disabled = false; }
}
async function checkin() {
    await fetch(API_URL + '/api/checkin', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({userId}) });
    await loadCheckinStatus();
    await loadStats();
    alert('打卡成功！🔥');
}
async function loadAnnouncement() {
    const data = await fetchAPI('/api/announcements');
    if(data && data.length > 0) {
        document.getElementById('announcementBar').style.display = 'block';
        document.getElementById('announcementText').innerHTML = '<strong>' + data[0].title + '</strong><br>' + data[0].content;
    }
}

// 公开词书
async function loadPublicBooks() {
    const data = await fetchAPI('/api/public-wordbooks');
    publicBooks = data;
    const container = document.getElementById('publicBooksList');
    container.innerHTML = '';
    for(let book of publicBooks) {
        const wordCount = JSON.parse(book.words).length;
        const div = document.createElement('div');
        div.className = 'book-item-side';
        div.innerHTML = '📖 ' + book.name + '<span style="font-size:11px; color:#999; margin-left:8px;">' + wordCount + '词</span>';
        div.onclick = () => selectBook(book);
        container.appendChild(div);
    }
}
async function selectBook(book) {
    const words = JSON.parse(book.words);
    currentWords = words;
    currentBookName = book.name;
    document.getElementById('currentBookName').innerText = currentBookName;
    studiedToday.clear();
    loadDueWords();
    toggleSidebar();
}
async function loadCurrentBook() {
    if(publicBooks.length > 0) {
        await selectBook(publicBooks[0]);
    }
}

// 背单词逻辑
function loadDueWords() {
    const today = new Date().toISOString().split('T')[0];
    let due = currentWords.filter(w => !w.next_review || w.next_review <= today);
    due.sort((a,b) => {
        if(!a.next_review) return -1;
        if(!b.next_review) return 1;
        return a.next_review.localeCompare(b.next_review);
    });
    let available = due.filter(w => !studiedToday.has(w.word));
    if(available.length > dailyLimit) available = available.slice(0, dailyLimit);
    currentStudyQueue = available;
    currentIndex = 0;
    if(currentStudyQueue.length > 0) {
        loadWordForStudy(0);
        document.getElementById('studyStats').innerHTML = '📅 今日待复习: ' + currentStudyQueue.length;
    } else {
        document.getElementById('currentWord').innerText = '🎉 今天没有需要复习的单词！';
        document.getElementById('studyStats').innerHTML = '0 / 0';
    }
    updateProgress();
}
function loadWordForStudy(index) {
    if(currentStudyQueue.length === 0) return;
    if(todayStudiedCount >= dailyLimit) {
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
    document.getElementById('studyStats').innerHTML = '📅 ' + (index+1) + ' / ' + currentStudyQueue.length;
    updateProgress();
}
function updateProgress() {
    const percent = dailyLimit > 0 ? (todayStudiedCount / dailyLimit) * 100 : 0;
    document.getElementById('progressBar').style.width = Math.min(percent, 100) + '%';
    document.getElementById('progressText').innerHTML = todayStudiedCount + ' / ' + dailyLimit;
}

// 滑动和拼写
function initSwipe() {
    const card = document.getElementById('studyCard');
    if(!card) return;
    card.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; });
    card.addEventListener('touchmove', (e) => { currentX = e.touches[0].clientX; let diff = currentX - startX; card.style.transform = 'translateX(' + diff + 'px) rotate(' + (diff/20) + 'deg)'; });
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
    if(todayStudiedCount >= dailyLimit) return;
    showMeaningOnly();
    setTimeout(() => { recordStudy('forgot'); nextWord(); }, 1500);
}
function rightSwipe() {
    if(todayStudiedCount >= dailyLimit) return;
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
        playCorrectSound();
        recordStudy('remembered');
        todayStudiedCount++;
        loadStats();
        nextWord();
    } else {
        alert('❌ 拼写错误！正确答案：' + currentWordObj.word);
        recordStudy('forgot');
        nextWord();
    }
}
function recordStudy(status) {
    studiedToday.add(currentWordObj.word);
    // 更新本地复习计数
}
function nextWord() {
    currentIndex++;
    if(currentIndex >= currentStudyQueue.length) {
        alert('🎉 恭喜！今日复习任务完成！\n学习了 ' + todayStudiedCount + ' 个单词');
        loadDueWords();
    } else {
        loadWordForStudy(currentIndex);
    }
}

// 侧边栏
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
}

// 设置
function showSettings() {
    document.getElementById('settingsModal').classList.add('show');
}
function closeSettings() {
    document.getElementById('settingsModal').classList.remove('show');
}
function saveDailyLimit() {
    dailyLimit = parseInt(document.getElementById('dailyLimitSetting').value);
    localStorage.setItem('dailyLimit', dailyLimit);
    loadDueWords();
}
function toggleSound() {
    soundEnabled = document.getElementById('soundToggle').checked;
    localStorage.setItem('soundEnabled', soundEnabled);
}
async function updateUsername() {
    const newUsername = document.getElementById('newUsernameInput').value.trim();
    if(!newUsername) return alert('请输入新用户名');
    const res = await fetch(API_URL + '/api/user/update-username', {
        method: 'PUT', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({userId, newUsername})
    });
    const data = await res.json();
    if(data.success) {
        alert('用户名修改成功！');
        localStorage.setItem('username', newUsername);
        document.getElementById('username').innerText = newUsername;
        document.getElementById('newUsernameInput').value = '';
    } else alert(data.message || '修改失败');
}
async function updatePassword() {
    const oldPassword = document.getElementById('oldPasswordInput').value;
    const newPassword = document.getElementById('newPasswordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;
    if(!oldPassword || !newPassword) return alert('请填写原密码和新密码');
    if(newPassword.length < 3) return alert('新密码至少3位');
    if(newPassword !== confirmPassword) return alert('两次输入的新密码不一致');
    const res = await fetch(API_URL + '/api/user/update-password', {
        method: 'PUT', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({userId, oldPassword, newPassword})
    });
    const data = await res.json();
    if(data.success) { alert('密码修改成功！请重新登录'); logout(); }
    else alert(data.message || '修改失败');
}

// 管理员后台
function showAdminPanel() {
    document.getElementById('adminModal').classList.add('show');
    showAdminUsers();
}
function closeAdminModal() {
    document.getElementById('adminModal').classList.remove('show');
}
async function showAdminUsers() {
    const users = await fetchAPI('/api/admin/users');
    let html = '<h3>👥 用户管理</h3>';
    for(let u of users) html += '<div class="admin-card"><div>' + escapeHtml(u.username) + '</div><div style="font-size:12px;color:#999;">注册于 ' + u.created_at + '</div></div>';
    document.getElementById('adminContent').innerHTML = html;
    document.getElementById('adminContent').innerHTML += '<button onclick="showAdminWordbooks()" style="margin-top:10px;">📚 管理词书</button><button onclick="showAdminAnnounce()" style="margin-left:10px;">📢 发布公告</button>';
}
async function showAdminWordbooks() {
    const books = await fetchAPI('/api/public-wordbooks');
    let html = '<h3>📚 公开词书管理</h3>';
    html += '<div style="margin-bottom:20px;"><input type="text" id="newBookName" placeholder="词书名称" style="width:100%;padding:10px;margin:5px 0;"><textarea id="newBookWords" placeholder="单词列表，每行：单词,释义,例句" rows="6" style="width:100%;padding:10px;"></textarea><button onclick="addPublicWordbook()">➕ 添加词书</button></div>';
    html += '<h4>现有词书</h4>';
    for(let b of books) {
        const wordCount = JSON.parse(b.words).length;
        html += '<div class="wordbook-item"><strong>' + escapeHtml(b.name) + '</strong> (' + wordCount + '词)<button onclick="deletePublicWordbook(' + b.id + ')">删除</button></div>';
    }
    document.getElementById('adminContent').innerHTML = html;
}
async function addPublicWordbook() {
    const name = document.getElementById('newBookName').value;
    const wordsText = document.getElementById('newBookWords').value;
    if(!name || !wordsText) return alert('请填写词书名称和单词列表');
    const lines = wordsText.split('\n');
    const words = [];
    for(let line of lines) {
        line = line.trim();
        if(line === '') continue;
        const parts = line.split(',');
        if(parts.length >= 2) words.push({word: parts[0].trim(), meaning: parts[1].trim(), example: parts.slice(2).join(',') || ''});
    }
    if(words.length === 0) return alert('没有有效的单词');
    const res = await fetch(API_URL + '/api/admin/public-wordbook', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name, description: '', words})
    });
    const data = await res.json();
    if(data.success) { alert('添加成功！'); showAdminWordbooks(); loadPublicBooks(); }
    else alert('添加失败');
}
async function deletePublicWordbook(id) {
    if(!confirm('确定删除？')) return;
    await fetch(API_URL + '/api/admin/public-wordbook/' + id, {method: 'DELETE'});
    showAdminWordbooks();
    loadPublicBooks();
}
function showAdminAnnounce() {
    document.getElementById('adminContent').innerHTML = '<h3>📢 发布公告</h3><input type="text" id="announceTitle" placeholder="标题" style="width:100%;padding:10px;margin:5px 0;"><textarea id="announceContent" placeholder="公告内容" rows="3" style="width:100%;padding:10px;"></textarea><button onclick="publishAnnouncement()">发布</button>';
}
async function publishAnnouncement() {
    const title = document.getElementById('announceTitle').value;
    const content = document.getElementById('announceContent').value;
    if(!title || !content) return alert('请填写完整');
    await fetch(API_URL + '/api/admin/announcement', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title, content})
    });
    alert('公告已发布');
    loadAnnouncement();
    closeAdminModal();
}

function logout() { localStorage.clear(); window.location.href = API_URL + '/'; }
function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }

// 初始化
initSwipe();