// --- 操作するHTML要素を取得 ---
const tabsContainer = document.getElementById('tabs');
const addBtn = document.getElementById('add-btn');

// --- モーダル関連の要素を取得 ---
const modal = document.getElementById('modal');
const accountNameInput = document.getElementById('account-name-input');
const okBtn = document.getElementById('ok-btn');
const cancelBtn = document.getElementById('cancel-btn');

// 起動時にmainプロセスへ準備完了を通知
window.api.rendererReady();

// 「+」ボタンがクリックされたらモーダルを表示
addBtn.addEventListener('click', () => {
    window.api.hideView();
    modal.classList.remove('hidden');
    accountNameInput.focus();
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
});

// モーダルの「キャンセル」ボタン
cancelBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    accountNameInput.value = '';
    window.api.showView();
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
    });
});

// 新規アカウント追加完了後、そのタブをアクティブにする
window.api.onAccountAddedComplete(({ id }) => {
    const newTab = document.querySelector(`.tab[data-id="${id}"]`);
    if (newTab) {
        newTab.click();
    }
    window.api.showView();
});

// 復元時にアクティブタブを設定する
window.api.onSetActiveTab((id) => {
    const tabToActivate = document.querySelector(`.tab[data-id="${id}"]`);
    if (tabToActivate) {
        tabToActivate.click();
    }
});