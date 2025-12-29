const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'icon.ico'),
        title: "RevestMaster Pro"
    });

    win.setMenuBarVisibility(false);
    win.loadFile('index.html');
}

ipcMain.on('set-theme', (event, theme) => {
    nativeTheme.themeSource = theme; // 'light', 'dark' or 'system'
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
