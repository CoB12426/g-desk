// 1. 最初にelectronからapp等を読み込む
const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');

// 2. 次にインストーラーの処理を行う (修正済み)
if (require('electron-squirrel-startup')) {
  app.quit();
}

const path = require('path');
const fs = require('fs');

// アプリのデータを保存するフォルダとファイルパスを定義
const userDataPath = app.getPath('userData');
const accountsFile = path.join(userDataPath, 'accounts.json');

let mainWindow;
const views = {};
let activeViewId = null;

let splashWindow;
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.loadFile('index.html');

  mainWindow.on('resize', () => {
    if (activeViewId && views[activeViewId]) {
      const [width, height] = mainWindow.getContentSize();
      views[activeViewId].setBounds({ x: 0, y: 50, width: width, height: height - 50 });
    }
  });

  // 3. メインウィンドウの準備ができたらスプラッシュを閉じて表示
  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      splashWindow.close();
      mainWindow.show();
      restoreAccounts();
    }, 1200); // 1.2秒だけ表示
  });
}

// レンダラープロセスの準備完了を待ってからアカウントを復元する
ipcMain.on('renderer-ready', () => {
  restoreAccounts();
});

function saveAccounts() {
  const accountsToSave = Object.entries(views).map(([id, view]) => ({
    id: id,
    name: view.accountName // viewに保存したカスタム名を使用
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
        view.accountName = acc.name; // カスタム名をviewに復元
        views[acc.id] = view;
        view.webContents.loadURL('https://mail.google.com');

        // UIにタブを追加するよう通知
        mainWindow.webContents.send('account-added', { id: acc.id, name: acc.name });
      }
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

  views[viewId] = view;
  view.webContents.loadURL('https://mail.google.com');
  
  // UI側にアカウントが追加されたことを通知
  event.reply('account-added', { id: viewId, name: accountName });
  
  // ファイルに全アカウント情報を保存
  saveAccounts();

  switchToView(viewId);
  mainWindow.webContents.send('set-active-tab', viewId);
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
  
  const [width, height] = mainWindow.getContentSize();
  newView.setBounds({ x: 0, y: 50, width, height: height - 50 });

  activeViewId = viewId;
}

ipcMain.on('hide-view', () => {
  if (activeViewId && views[activeViewId]) {
    mainWindow.removeBrowserView(views[activeViewId]);
  }
});

ipcMain.on('show-view', () => {
  if (activeViewId && views[activeViewId]) {
    mainWindow.addBrowserView(views[activeViewId]);
    const [width, height] = mainWindow.getContentSize();
    views[activeViewId].setBounds({ x: 0, y: 50, width: width, height: height - 50 });
  }
});