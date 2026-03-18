// --- 操作するHTML要素を取得 ---
const tabsContainer = document.getElementById('tabs');
const addBtn = document.getElementById('add-btn');
const tabBar = document.getElementById('tab-bar');
const serviceSelect = document.getElementById('service-select');
const themeBtn = document.getElementById('theme-btn');

// --- モーダル関連の要素を取得 ---
const modal = document.getElementById('modal');
const accountNameInput = document.getElementById('account-name-input');
const okBtn = document.getElementById('ok-btn');
const cancelBtn = document.getElementById('cancel-btn');

// 起動時にmainプロセスへ準備完了を通知
window.api.rendererReady();

// BrowserViewの表示領域をタブバーの実寸に追従させる
function reportUiMetrics() {
    if (!tabBar) return;
    const rect = tabBar.getBoundingClientRect();
    const height = Math.ceil(rect.height);
    window.api.setUiTopInset(height);
}

reportUiMetrics();

// テーマ切替（system -> dark -> light -> system）
const THEME_KEY = 'gdesk.theme';

function applyTheme(theme) {
    const root = document.documentElement;
    if (!theme || theme === 'system') {
        root.removeAttribute('data-theme');
        return;
    }
    if (theme === 'dark' || theme === 'light') {
        root.setAttribute('data-theme', theme);
    }
}

function getSavedTheme() {
    try {
        return localStorage.getItem(THEME_KEY) || 'system';
    } catch {
        return 'system';
    }
}

function saveTheme(theme) {
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch {
        // ignore
    }
}

function cycleTheme() {
    const current = getSavedTheme();
    const next = current === 'system' ? 'dark' : current === 'dark' ? 'light' : 'system';
    saveTheme(next);
    applyTheme(next);
}

applyTheme(getSavedTheme());

if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        cycleTheme();
        reportUiMetrics();
    });
}

if (tabBar && 'ResizeObserver' in window) {
    const ro = new ResizeObserver(() => reportUiMetrics());
    ro.observe(tabBar);
}

window.addEventListener('resize', () => {
    reportUiMetrics();
});

// サービス切替（アクティブなアカウントに対して適用）
if (serviceSelect) {
    serviceSelect.addEventListener('change', () => {
        const key = serviceSelect.value;
        window.api.switchService(key);
    });
}

// 「+」ボタンがクリックされたらモーダルを表示
addBtn.addEventListener('click', () => {
    window.api.hideView();
    modal.classList.remove('hidden');
    accountNameInput.focus();
    reportUiMetrics();
});

// モーダルの「OK」ボタン
okBtn.addEventListener('click', () => {
    const accountName = accountNameInput.value;
    if (accountName) {
        window.api.addAccount(accountName);
        modal.classList.add('hidden');
        accountNameInput.value = '';
    } else {
        window.api.showView();
    }
    reportUiMetrics();
});

// モーダルの「キャンセル」ボタン
cancelBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    accountNameInput.value = '';
    window.api.showView();
    reportUiMetrics();
});

// main.jsからアカウント追加・復元の通知を受け取る
window.api.onAccountAdded(({ id, name }) => {
    // 既に同じタブがあれば作らない
    if (document.querySelector(`.tab[data-id="${id}"]`)) {
        return;
    }
    
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.textContent = name;
    tab.dataset.id = id;
    tabsContainer.appendChild(tab);

    tab.addEventListener('click', () => {
        window.api.switchAccount(id);
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        reportUiMetrics();
    });
});

// 新規アカウント追加完了後、そのタブをアクティブにする
window.api.onAccountAddedComplete(({ id }) => {
    const newTab = document.querySelector(`.tab[data-id="${id}"]`);
    if (newTab) {
        newTab.click();
    }
    window.api.showView();
    reportUiMetrics();
});

// 復元時にアクティブタブを設定する
window.api.onSetActiveTab((id) => {
    const tabToActivate = document.querySelector(`.tab[data-id="${id}"]`);
    if (tabToActivate) {
        tabToActivate.click();
    }
    reportUiMetrics();
});

// main側が「今アクティブなアカウントのサービス」を通知してくる
window.api.onActiveService(({ serviceKey }) => {
    if (!serviceSelect) return;
    if (!serviceKey) return;
    if (serviceSelect.value !== serviceKey) {
        serviceSelect.value = serviceKey;
    }
});