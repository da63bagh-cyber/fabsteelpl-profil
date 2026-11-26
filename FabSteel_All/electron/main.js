// Windows desktop shell for FabSteelViewer.html (offline). Run: npm install && npm start | npm run dist
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path'), fs = require('fs');
let win = null;

const fileArg = argv => argv.find(a => /\.fabsteel$/i.test(a) && fs.existsSync(a));
function openFile(f) {
  if (!win || !f) return;
  const b64 = fs.readFileSync(f).toString('base64');
  win.webContents.executeJavaScript(`window.FabLoadBase64(${JSON.stringify(b64)}, ${JSON.stringify(path.basename(f))})`).catch(() => {});
}
function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1440, height: 860, backgroundColor: '#050507', title: 'FAB STEEL VIEWER', icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false }
  });
  win.loadFile(path.join(__dirname, 'app', 'FabSteelViewer.html'));
  win.webContents.on('did-finish-load', () => openFile(fileArg(process.argv)));
}

ipcMain.handle('fab:printPdf', async (_e, name) => {
  const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true });
  const r = await dialog.showSaveDialog(win, { defaultPath: (name || 'FabSteel_report') + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, data); shell.openPath(r.filePath); return true;
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_e, argv) => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); openFile(fileArg(argv)); } });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
