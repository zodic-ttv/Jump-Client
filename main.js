const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const internalCssDir = path.join(__dirname, 'Assets', 'css');
const baseDir = app.isPackaged ? path.dirname(process.execPath) : __dirname;
const dirs = {
  css: path.join(baseDir, 'css'),
  scripts: path.join(baseDir, 'scripts')
};
const exts = { css: '.css', scripts: '.js' };
const configPath = path.join(app.getPath('userData'), 'client-config.json');
const cssKeys = new Map();

const defaultSettings = {
  startMode: 'remember',
  uncapFps: true,
  rawInput: true,
  hideBundlePopups: false,
  selectableChat: true,
  gpuRasterization: true,
  zeroCopy: true,
  ignoreGpuBlocklist: true,
  quic: true,
  highPerformanceGpu: false,
  angleBackend: 'default',
  jumpInfo: true,
};
const startModes = ['remember', 'windowed', 'maximized', 'fullscreen'];
const angleBackends = ['default', 'd3d11', 'gl', 'd3d11on12'];

function loadConfig() {
  let parsed = {};
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    parsed = {};
  }

  const disabled = parsed.disabled || {};
  const stored = parsed.settings || {};
  const settings = Object.assign({}, defaultSettings);
  for (const key of Object.keys(defaultSettings)) {
    if (typeof stored[key] === typeof defaultSettings[key]) settings[key] = stored[key];
  }
  if (!startModes.includes(settings.startMode)) settings.startMode = 'remember';
  if (!angleBackends.includes(settings.angleBackend)) settings.angleBackend = 'default';

  return {
    disabled: {
      css: Array.isArray(disabled.css) ? disabled.css : [],
      scripts: Array.isArray(disabled.scripts) ? disabled.scripts : []
    },
    settings,
    windowState: parsed.windowState || null,
    lastChangelogVersion: parsed.lastChangelogVersion || ''
  };
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

const startup = loadConfig();

if (startup.settings.uncapFps) {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}
const flags = startup.settings;

if (flags.uncapFps) {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}
if (flags.gpuRasterization) app.commandLine.appendSwitch('enable-gpu-rasterization');
if (flags.gpuRasterization && flags.zeroCopy) app.commandLine.appendSwitch('enable-zero-copy');
if (flags.ignoreGpuBlocklist) app.commandLine.appendSwitch('ignore-gpu-blocklist');
if (flags.quic) app.commandLine.appendSwitch('enable-quic');
if (flags.highPerformanceGpu) app.commandLine.appendSwitch('force_high_performance_gpu');
if (flags.angleBackend !== 'default') app.commandLine.appendSwitch('use-angle', flags.angleBackend);

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-networking');

app.setAppUserModelId('com.krunkerclient.app');

const GAME_URL = 'https://krunker.io';
const APP_NAME = 'Jump Client';

function ensureDirs() {
  for (const dir of Object.values(dirs)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function filePath(type, name) {
  return path.join(dirs[type], path.basename(name));
}

function listFiles(type) {
  const disabled = loadConfig().disabled[type];
  return fs
    .readdirSync(dirs[type])
    .filter((name) => name.toLowerCase().endsWith(exts[type]))
    .map((name) => ({ name, enabled: !disabled.includes(name) }));
}

function openInEditor(file) {
  if (process.platform === 'win32') {
    spawn('notepad.exe', [file], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', ['-t', file], { detached: true, stdio: 'ignore' }).unref();
  } else {
    shell.openPath(file);
  }
}

async function insertCss(webContents, name) {
  try {
    const css = fs.readFileSync(filePath('css', name), 'utf8');
    const key = await webContents.insertCSS(css);
    cssKeys.set(name, key);
  } catch (err) {
    console.error('CSS error in', name, err);
  }
}

async function applyCss(webContents) {
  cssKeys.clear();
  for (const file of listFiles('css')) {
    if (file.enabled) await insertCss(webContents, file.name);
  }
}
async function applyInternalCss(webContents) {
  if (!fs.existsSync(internalCssDir)) return;
  for (const name of fs.readdirSync(internalCssDir)) {
    if (!name.toLowerCase().endsWith('.css')) continue;
    try {
      const css = fs.readFileSync(path.join(internalCssDir, name), 'utf8');
      await webContents.insertCSS(css);
    } catch (err) {
      console.error('Internal CSS error in', name, err);
    }
  }
}
async function applyScripts(webContents) {
  for (const file of listFiles('scripts')) {
    if (!file.enabled) continue;
    try {
      const code = fs.readFileSync(filePath('scripts', file.name), 'utf8');
      await webContents.executeJavaScript('(function(){\n' + code + '\n})();');
    } catch (err) {
      console.error('Userscript error in', file.name, err);
    }
  }
}

function isGameUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'krunker.io' || host.endsWith('.krunker.io');
  } catch {
    return false;
  }
}

function applyStartMode(win, mode, saved) {
  let target = mode;
  if (mode === 'remember') {
    if (!saved) target = 'fullscreen';
    else if (saved.fullscreen) target = 'fullscreen';
    else if (saved.maximized) target = 'maximized';
    else target = 'windowed';
  }

  if (target === 'fullscreen') win.setFullScreen(true);
  else if (target === 'maximized') win.maximize();
}

ipcMain.on('settings:get', (event) => {
  event.returnValue = loadConfig().settings;
});

ipcMain.handle('settings:set', (event, key, value) => {
  if (!Object.prototype.hasOwnProperty.call(defaultSettings, key)) return false;
  if (typeof value !== typeof defaultSettings[key]) return false;
  if (key === 'startMode' && !startModes.includes(value)) return false;
  if (key === 'angleBackend' && !angleBackends.includes(value)) return false;

  const config = loadConfig();
  config.settings[key] = value;
  saveConfig(config);
  return true;
});

ipcMain.handle('app:quit', () => {
  app.quit();
});

ipcMain.handle('app:relaunch', () => {
  app.relaunch();
  app.quit();
});

ipcMain.handle('files:list', (event, type) => {
  if (!dirs[type]) return [];
  return listFiles(type);
});

ipcMain.handle('files:open', (event, type, name) => {
  if (!dirs[type]) return;
  openInEditor(filePath(type, name));
});

ipcMain.handle('files:folder', (event, type) => {
  if (!dirs[type]) return;
  shell.openPath(dirs[type]);
});

ipcMain.handle('files:toggle', async (event, type, name, enabled) => {
  if (!dirs[type]) return false;
  const config = loadConfig();
  const list = new Set(config.disabled[type]);
  if (enabled) list.delete(name);
  else list.add(name);
  config.disabled[type] = [...list];
  saveConfig(config);

  if (type === 'css') {
    if (enabled) {
      await insertCss(event.sender, name);
    } else {
      const key = cssKeys.get(name);
      if (key) {
        await event.sender.removeInsertedCSS(key);
        cssKeys.delete(name);
      }
    }
  }
  return true;
});

function createWindow() {
  Menu.setApplicationMenu(null);
  ensureDirs();

  const config = loadConfig();
  const mode = config.settings.startMode;
  const saved = config.windowState;

  const options = {
    width: 1280,
    height: 720,
    show: false,
    title: APP_NAME,
    icon: path.join(__dirname, 'Assets', 'icon.ico'),
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  };

  if (mode === 'remember' && saved && saved.bounds) {
    Object.assign(options, saved.bounds);
  }

  const win = new BrowserWindow(options);
  win.webContents.on('preload-error', (event, preloadPath, error) => {
    console.log('preload error:', preloadPath, error && error.message);
  });
  console.log('patched electron:', typeof win.setFrameCap === 'function');
  win.webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
    if (isMainFrame) console.log('main page failed:', code, description, url);
  });
  win.webContents.on('render-process-gone', (event, details) => {
    console.log('renderer gone:', details.reason);
  });
  win.webContents.on('did-finish-load', () => {
    console.log('page loaded:', win.webContents.getURL());
  });
  win.once('ready-to-show', () => {
    console.log('window ready to show');
  });

  win.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  win.on('close', () => {
    const latest = loadConfig();
    latest.windowState = {
      fullscreen: win.isFullScreen(),
      maximized: win.isMaximized(),
      bounds: win.getNormalBounds()
    };
    saveConfig(latest);
  });

  win.once('ready-to-show', () => {
    win.show();
    applyStartMode(win, mode, saved);
  });

  win.webContents.on('dom-ready', async () => {
    if (!isGameUrl(win.webContents.getURL())) return;
    await applyCss(win.webContents);
    await applyInternalCss(win.webContents);
    await applyScripts(win.webContents);
    
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isGameUrl(url)) {
      win.loadURL(url);
    } else {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isGameUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'F5') {
      win.webContents.reload();
      event.preventDefault();
    } else if (input.key === 'F6') {
      win.loadURL(GAME_URL);
      event.preventDefault();
    } else if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  win.loadURL(GAME_URL);
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, 'icon.png'));
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});