

const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const internalCssDir = path.join(__dirname, 'Assets', 'css');
const baseDir = app.isPackaged ? path.dirname(process.execPath) : __dirname;
const dirs = {
  css: path.join(baseDir, 'css'),
  scripts: path.join(baseDir, 'scripts'),
  Builtinscripts: path.join(__dirname, 'Builtinscripts')
};
const exts = {
  css: '.css',
  scripts: '.js',
  Builtinscripts: '.js'
};
const configPath = path.join(app.getPath('userData'), 'client-config.json');
const cssKeys = new Map();
let skipUnloadPrompt = false;
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
  Editortweakstoggle: true,
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
const WINDOW_ICON = path.join(__dirname, 'Assets', 'icon.ico');

function ensureDirs() {
  for (const dir of Object.values(dirs)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function filePath(type, name) {
  return path.join(dirs[type], path.basename(name));
}


function listFiles(type) {
  const disabled = loadConfig().disabled[type] || [];

  return fs
    .readdirSync(dirs[type])
    .filter((name) => name.toLowerCase().endsWith(exts[type]))
    .map((name) => ({
      name,
      enabled: !disabled.includes(name)
    }));
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
    const url = webContents.getURL();
    const isEditor = new URL(url).pathname.endsWith("/editor.html");

    for (const type of ["scripts", "Builtinscripts"]) {
      
        for (const file of listFiles(type)) {
            console.log(
                "[Script Loader]",
                type,
                file.name,
                "enabled:",
                file.enabled,
                "URL:",
                webContents.getURL()
            );
            if (!file.enabled) continue;

            if (
                type === "Builtinscripts" &&
                file.name === "AdvancedGroupEditTool.js" &&
                !isEditor
            ) {
                continue;
            }

            try {
                const code = fs.readFileSync(
                    filePath(type, file.name),
                    "utf8"
                );

                await webContents.executeJavaScript(
                    "(function(){\n" + code + "\n})();"
                );
            } catch (err) {
                console.error(
                    `Userscript error in ${type}/${file.name}`,
                    err
                );
            }
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
function guardUnload(contents, parent) {
  contents.on('will-prevent-unload', (event) => {
    if (skipUnloadPrompt) {
      event.preventDefault();
      return;
    }

    const choice = dialog.showMessageBoxSync(parent, {
      type: 'question',
      buttons: ['Leave', 'Stay'],
      defaultId: 1,
      cancelId: 1,
      title: 'Leave this page?',
      message: 'The page is asking you to confirm before leaving. Unsaved progress may be lost.'
    });

    if (choice === 0) event.preventDefault();
  });
}

function applyBranding(win) {
  const apply = () => {
    if (win.isDestroyed()) return;
    win.setTitle(APP_NAME);
    win.setIcon(WINDOW_ICON);
  };

  apply();

  win.on('page-title-updated', (event) => {
    event.preventDefault();
    apply();
  });

  win.webContents.on('did-finish-load', apply);
  win.webContents.on('did-navigate-in-page', apply);
}
app.on('browser-window-created', (event, win) => {
  applyBranding(win);
});
function openIndependentWindow(url) {
  
  const child = new BrowserWindow({
    width: 1100,
    height: 750,
    title: APP_NAME,
    icon: WINDOW_ICON,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  applyBranding(child);
  guardUnload(child.webContents, child);
  child.webContents.setWindowOpenHandler(handleWindowOpen);
  attachShortcuts(child);
  child.loadURL(url);
}

function handleWindowOpen({ url }) {
  if (isGameUrl(url)) {
    openIndependentWindow(url);
  } else {
    shell.openExternal(url);
  }
  return { action: 'deny' };
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
function attachShortcuts(win) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;

      const devtoolsCombo = input.control && input.shift && input.key.toLowerCase() === 'i';

      if (input.key === 'F11') {
        win.setFullScreen(!win.isFullScreen());
        event.preventDefault();
      } else if (input.key === 'F5') {
        win.webContents.reload();
        event.preventDefault();
      } else if (input.key === 'F6') {
        win.loadURL(GAME_URL);
        event.preventDefault();
      } else if (input.key === 'F12' || devtoolsCombo) {
        win.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
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
  skipUnloadPrompt = true;
  app.quit();
});
ipcMain.handle('app:relaunch', () => {
  skipUnloadPrompt = true;
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

  console.log('patched electron:', typeof win.setFrameCap === 'function');
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

  guardUnload(win.webContents, win);
  win.webContents.setWindowOpenHandler(handleWindowOpen);

  win.webContents.on('will-navigate', (event, url) => {
    if (!isGameUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  attachShortcuts(win);

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