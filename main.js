// 1. 最初にelectronからapp等を読み込む
const { app, BrowserWindow, BrowserView, ipcMain, shell } = require('electron');

// 2. 次にインストーラーの処理を行う (修正済み)
if (require('electron-squirrel-startup')) {
  app.quit();
}

const path = require('path');
const fs = require('fs');

// Linuxでキーリング未設定の場合、Cookie復号に失敗してログインが保持されないことがあります。
// basic を指定すると永続化が安定します（セキュリティ要件に応じて見直し可）。
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('password-store', 'basic');
}

// ログイン状態(セッション/Cookie)を安定して保持するため、userDataの保存先を明示的に固定します。
// (開発時は既定で "Electron" 配下になることがあり、パッケージ版と保存先が変わってログアウト扱いになるのを防ぐ)
app.setPath('userData', path.join(app.getPath('appData'), 'g-desk'));

// アプリのデータを保存するフォルダとファイルパスを定義
const userDataPath = app.getPath('userData');
const accountsFile = path.join(userDataPath, 'accounts.json');

let mainWindow;
const views = {};
let activeViewId = null;

let uiTopInset = 50; // タブバー高さ。レンダラから通知される(デフォルトは従来値)
let hasRestoredAccounts = false;

let splashWindow;

const SERVICE_URLS = {
  gmail: 'https://mail.google.com',
  calendar: 'https://calendar.google.com',
  drive: 'https://drive.google.com',
  keep: 'https://keep.google.com',
  contacts: 'https://contacts.google.com',
  chat: 'https://chat.google.com',
  meet: 'https://meet.google.com',
  photos: 'https://photos.google.com',
};

function resolveServiceUrl(serviceKey) {
  if (!serviceKey) return SERVICE_URLS.gmail;
  return SERVICE_URLS[serviceKey] || SERVICE_URLS.gmail;
}

function createWindow() {
  // 1. スプラッシュウィンドウを表示
  splashWindow = new BrowserWindow({
    width: 320,
    height: 320,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    icon: path.join(__dirname, 'icon.ico'),
    show: true,
  });
  splashWindow.loadFile('splash.html');

  // 2. メインウィンドウは非表示で生成
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#0b0f19',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.loadFile('index.html');

  mainWindow.on('resize', layoutActiveView);
  mainWindow.on('maximize', layoutActiveView);
  mainWindow.on('unmaximize', layoutActiveView);

  // 3. メインウィンドウの準備ができたらスプラッシュを閉じて表示
  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      splashWindow.close();
      mainWindow.show();
    }, 1200); // 1.2秒だけ表示
  });
}

// レンダラープロセスの準備完了を待ってからアカウントを復元する
ipcMain.on('renderer-ready', () => {
  if (!hasRestoredAccounts) {
    hasRestoredAccounts = true;
    restoreAccounts();
  } else {
    // 再読み込みなどでrenderer-readyが再度来ても、タブUIを再同期できるように通知だけ流す
    sendAccountsToRenderer();
  }
});

ipcMain.on('ui-top-inset', (_event, topInset) => {
  const parsed = Number(topInset);
  if (!Number.isFinite(parsed)) return;
  uiTopInset = Math.max(0, Math.min(200, Math.floor(parsed)));
  layoutActiveView();
});

ipcMain.on('switch-service', (_event, serviceKey) => {
  if (!activeViewId || !views[activeViewId]) return;
  const view = views[activeViewId];
  const nextKey = typeof serviceKey === 'string' ? serviceKey : 'gmail';

  view.currentService = SERVICE_URLS[nextKey] ? nextKey : 'gmail';
  view.webContents.loadURL(resolveServiceUrl(view.currentService));
  saveAccounts();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('active-service', { viewId: activeViewId, serviceKey: view.currentService });
  }
});

function layoutActiveView() {
  if (!mainWindow) return;
  if (!activeViewId || !views[activeViewId]) return;

  const [width, height] = mainWindow.getContentSize();
  const inset = Math.max(0, Math.min(height, uiTopInset));
  views[activeViewId].setBounds({ x: 0, y: inset, width, height: Math.max(0, height - inset) });
}

function sendAccountsToRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  Object.entries(views).forEach(([id, view]) => {
    mainWindow.webContents.send('account-added', { id, name: view.accountName || id });
  });
  if (activeViewId) {
    mainWindow.webContents.send('set-active-tab', activeViewId);
  }
}

function saveAccounts() {
  const accountsToSave = Object.entries(views).map(([id, view]) => ({
    id: id,
    name: view.accountName, // viewに保存したカスタム名を使用
    service: view.currentService || 'gmail',
  }));
  fs.writeFileSync(accountsFile, JSON.stringify(accountsToSave, null, 2));
}

function restoreAccounts() {
  try {
    // accounts.jsonファイルがなければ何もしない
    if (!fs.existsSync(accountsFile)) {
      return;
    }

    const accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf-8'));
    if (accounts.length === 0) return;

    accounts.forEach(acc => {
      if (!views[acc.id]) { // 重複を避ける
        const view = new BrowserView({
          webPreferences: {
            partition: `persist:${acc.id}`,
            nativeWindowOpen: true,
          }
        });

        view.webContents.setWindowOpenHandler(({ url }) => {
          if (/^https?:\/\//.test(url)) {
            shell.openExternal(url);
          }
          return { action: 'deny' };
        });
        view.webContents.on('new-window', (event, url) => {
          event.preventDefault();
          if (/^https?:\/\//.test(url)) shell.openExternal(url);
        });

        view.accountName = acc.name; // カスタム名をviewに復元
        view.currentService = acc.service && SERVICE_URLS[acc.service] ? acc.service : 'gmail';
        views[acc.id] = view;
        view.webContents.loadURL(resolveServiceUrl(view.currentService));
      }

      // UIにタブを追加するよう通知（レンダラ準備前に送っても、renderer-readyで再同期する）
      mainWindow.webContents.send('account-added', { id: acc.id, name: acc.name });
    });

    // 最後にアクティブだった（または最初に見つかった）アカウントを表示
    const lastAccountId = accounts[accounts.length - 1].id;
    switchToView(lastAccountId);
    // UI側でもアクティブタブを正しく設定するよう通知
    mainWindow.webContents.send('set-active-tab', lastAccountId);

  } catch (error) {
    console.error('アカウントの復元に失敗しました:', error);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('add-account', (event, accountName) => {
  const viewId = `account-${Date.now()}`; // IDが重複しないように現在時刻を使う

  const view = new BrowserView({
    webPreferences: {
      partition: `persist:${viewId}`,
      nativeWindowOpen: true,
    }
  });
  
  // ★重要：ここでカスタム名をviewオブジェクトに保存します (修正済み)
  view.accountName = accountName;
  view.currentService = 'gmail';

  views[viewId] = view;
  view.webContents.loadURL(resolveServiceUrl(view.currentService));
  
  // UI側にアカウントが追加されたことを通知
  event.reply('account-added', { id: viewId, name: accountName });
  
  // ファイルに全アカウント情報を保存
  saveAccounts();

  switchToView(viewId);
  mainWindow.webContents.send('set-active-tab', viewId);

  // レンダラ側のUX(モーダル閉鎖・表示復帰など)を完了できるよう通知
  event.reply('account-added-complete', { id: viewId });
});

ipcMain.on('switch-account', (event, viewId) => {
  switchToView(viewId);
});

function switchToView(viewId) {
  if (!views[viewId]) return;

  const currentView = views[activeViewId];
  if (currentView) {
    mainWindow.removeBrowserView(currentView);
  }

  const newView = views[viewId];
  mainWindow.addBrowserView(newView);
  layoutView(newView);

  activeViewId = viewId;

  if (mainWindow && !mainWindow.isDestroyed()) {
    const serviceKey = views[viewId].currentService || 'gmail';
    mainWindow.webContents.send('active-service', { viewId, serviceKey });
  }
}

function layoutView(view) {
  if (!mainWindow) return;
  const [width, height] = mainWindow.getContentSize();
  const inset = Math.max(0, Math.min(height, uiTopInset));
  view.setBounds({ x: 0, y: inset, width, height: Math.max(0, height - inset) });
}

ipcMain.on('hide-view', () => {
  if (activeViewId && views[activeViewId]) {
    mainWindow.removeBrowserView(views[activeViewId]);
  }
});

ipcMain.on('show-view', () => {
  if (activeViewId && views[activeViewId]) {
    mainWindow.addBrowserView(views[activeViewId]);
    layoutActiveView();
  }
});