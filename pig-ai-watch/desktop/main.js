const { app, BrowserWindow, ipcMain, shell, dialog, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const Store = require('electron-store');
const fs = require('fs');

// Initialize store for settings
const store = new Store({
    defaults: {
        windowBounds: { width: 1400, height: 900 },
        backendPort: 8000,
        autoStartBackend: true,
        minimizeToTray: true
    }
});

let mainWindow;
let splashWindow;
let tray = null;
let backendProcess = null;
let isQuitting = false;

// Optional IPC coalescer for high-frequency detection streams.
// Use this if WebSocket handling is moved to the main process.
let coalesceTimer = null;
let coalesceBuffer = [];

function queueDetectionIpcMessage(message) {
    coalesceBuffer.push(message);
    if (coalesceTimer !== null) {
        return;
    }

    coalesceTimer = setTimeout(() => {
        coalesceTimer = null;
        if (!mainWindow || mainWindow.isDestroyed() || coalesceBuffer.length === 0) {
            coalesceBuffer = [];
            return;
        }

        const batch = coalesceBuffer;
        coalesceBuffer = [];
        mainWindow.webContents.send('ws-detections-batch', batch);
    }, 16);
}

// Backend configuration
const BACKEND_PORT = store.get('backendPort');
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

// Check if running in development
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Get paths based on environment
function getBackendPath() {
    if (isDev) {
        return path.join(__dirname, '..', 'backend');
    }
    return path.join(process.resourcesPath, 'backend');
}

function getPythonPath() {
    if (isDev) {
        // Use the venv in development
        const venvPath = path.join(__dirname, '..', '..', '.venv');
        if (process.platform === 'win32') {
            return path.join(venvPath, 'Scripts', 'python.exe');
        }
        const venvPython = path.join(venvPath, 'bin', 'python');
        if (fs.existsSync(venvPython)) {
            return venvPython;
        }
    }
    
    // In production, find system Python
    if (process.platform === 'darwin') {
        // macOS: Check common Python locations in order of preference
        const macPaths = [
            '/opt/homebrew/bin/python3',           // Homebrew on Apple Silicon
            '/usr/local/bin/python3',               // Homebrew on Intel Mac
            '/Library/Frameworks/Python.framework/Versions/3.13/bin/python3',
            '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3',
            '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3',
            '/Library/Frameworks/Python.framework/Versions/3.10/bin/python3',
            '/opt/local/bin/python3',               // MacPorts
            '/usr/bin/python3'                      // System Python (older macOS)
        ];
        
        for (const p of macPaths) {
            if (fs.existsSync(p)) {
                console.log('Found Python at:', p);
                return p;
            }
        }
        
        // Try using 'which' as fallback
        try {
            const result = execSync('which python3', { encoding: 'utf8' }).trim();
            if (result && fs.existsSync(result)) {
                console.log('Found Python via which:', result);
                return result;
            }
        } catch (e) {
            console.log('which python3 failed:', e.message);
        }
    } else if (process.platform === 'win32') {
        // Windows: Check common Python locations
        const winPaths = [
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
            'C:\\Python313\\python.exe',
            'C:\\Python312\\python.exe',
            'C:\\Python311\\python.exe',
            'C:\\Python310\\python.exe'
        ];
        
        for (const p of winPaths) {
            if (fs.existsSync(p)) {
                console.log('Found Python at:', p);
                return p;
            }
        }
        
        // Try using 'where' as fallback
        try {
            const result = execSync('where python', { encoding: 'utf8' }).split('\n')[0].trim();
            if (result && fs.existsSync(result)) {
                console.log('Found Python via where:', result);
                return result;
            }
        } catch (e) {
            console.log('where python failed:', e.message);
        }
    } else {
        // Linux
        const linuxPaths = [
            '/usr/bin/python3',
            '/usr/local/bin/python3'
        ];
        
        for (const p of linuxPaths) {
            if (fs.existsSync(p)) {
                console.log('Found Python at:', p);
                return p;
            }
        }
    }
    
    // Last resort: just try 'python3' and hope it's in PATH
    console.log('Using fallback: python3');
    return 'python3';
}

function getFrontendPath() {
    if (isDev) {
        // Try multiple ports in case one is in use
        return 'http://localhost:5174';
    }
    return path.join(__dirname, 'frontend-dist', 'index.html');
}

function createSplashWindow() {
    splashWindow = new BrowserWindow({
        width: 500,
        height: 350,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    splashWindow.loadFile(path.join(__dirname, 'splash.html'));
    splashWindow.center();
}

function createMainWindow() {
    const { width, height } = store.get('windowBounds');

    mainWindow = new BrowserWindow({
        width,
        height,
        minWidth: 1024,
        minHeight: 768,
        show: false,
        frame: true,
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        trafficLightPosition: { x: 15, y: 15 },
        backgroundColor: '#0a0a0f',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: !isDev
        },
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    // Create application menu
    createMenu();

    // Load the app
    const frontendPath = getFrontendPath();
    if (isDev || frontendPath.startsWith('http')) {
        mainWindow.loadURL(frontendPath);
        if (isDev) {
            mainWindow.webContents.openDevTools();
        }
    } else {
        mainWindow.loadFile(frontendPath);
    }

    // Window events
    mainWindow.on('resize', () => {
        const { width, height } = mainWindow.getBounds();
        store.set('windowBounds', { width, height });
    });

    mainWindow.on('close', (event) => {
        if (!isQuitting && store.get('minimizeToTray')) {
            event.preventDefault();
            mainWindow.hide();
            return false;
        }
    });

    mainWindow.once('ready-to-show', () => {
        setTimeout(() => {
            if (splashWindow && !splashWindow.isDestroyed()) {
                splashWindow.destroy();
            }
            mainWindow.show();
            mainWindow.focus();
        }, 1000);
    });

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

function createTray() {
    let trayIcon;
    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    
    try {
        if (fs.existsSync(iconPath)) {
            trayIcon = nativeImage.createFromPath(iconPath);
        } else {
            // Create a simple colored icon as fallback
            trayIcon = nativeImage.createEmpty();
        }
    } catch {
        trayIcon = nativeImage.createEmpty();
    }

    tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
    
    updateTrayMenu();
    tray.setToolTip('PRISMA ATLAS');

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function updateTrayMenu() {
    if (!tray) return;
    
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open PRISMA ATLAS',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: backendProcess ? '● Backend Running' : '○ Backend Stopped',
            enabled: false
        },
        {
            label: 'Restart Backend',
            click: async () => {
                await stopBackend();
                await startBackend();
            }
        },
        { type: 'separator' },
        {
            label: 'Quit PRISMA ATLAS',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
}

function createMenu() {
    const isMac = process.platform === 'darwin';
    
    const template = [
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                {
                    label: 'Preferences...',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => {
                        if (mainWindow) {
                            mainWindow.webContents.send('navigate', '/settings');
                        }
                    }
                },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),
        {
            label: 'File',
            submenu: [
                isMac ? { role: 'close' } : { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front' }
                ] : [
                    { role: 'close' }
                ])
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Documentation',
                    click: () => shell.openExternal('https://github.com/Goriooooo/IPT2-Module1-Practical')
                },
                {
                    label: 'Report Issue',
                    click: () => shell.openExternal('https://github.com/Goriooooo/IPT2-Module1-Practical/issues')
                },
                { type: 'separator' },
                {
                    label: 'About PRISMA ATLAS',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About PRISMA ATLAS',
                            message: 'PRISMA ATLAS',
                            detail: `Version ${app.getVersion()}\n\nPiglet Realtime Identification and Sow Monitoring Assistant\n\nAI-powered pig farrowing monitoring system.`
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

async function startBackend() {
    if (backendProcess) {
        console.log('Backend already running');
        return true;
    }

    const backendPath = getBackendPath();
    const pythonPath = getPythonPath();

    console.log('Starting backend...');
    console.log('Backend path:', backendPath);
    console.log('Python path:', pythonPath);

    // Check if Python exists (skip check for bare command like 'python3')
    const isPythonCommand = !pythonPath.includes(path.sep);
    if (!isPythonCommand && !fs.existsSync(pythonPath)) {
        console.error('Python not found at:', pythonPath);
        
        // Try to find Python interactively
        const result = await dialog.showMessageBox(mainWindow || splashWindow, {
            type: 'error',
            title: 'Python Not Found',
            message: 'PRISMA ATLAS requires Python 3.10+ to be installed.',
            detail: 'Python was not found on your system. Please install Python from python.org and restart the application.',
            buttons: ['Download Python', 'Cancel'],
            defaultId: 0
        });
        
        if (result.response === 0) {
            shell.openExternal('https://www.python.org/downloads/');
        }
        return false;
    }
    
    // Verify Python version
    try {
        const versionOutput = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' });
        console.log('Python version:', versionOutput.trim());
    } catch (e) {
        console.error('Failed to verify Python version:', e.message);
        const result = await dialog.showMessageBox(mainWindow || splashWindow, {
            type: 'error',
            title: 'Python Error',
            message: 'Failed to run Python',
            detail: `Could not execute Python at: ${pythonPath}\n\nError: ${e.message}\n\nPlease ensure Python 3.10+ is installed.`,
            buttons: ['Download Python', 'Cancel'],
            defaultId: 0
        });
        
        if (result.response === 0) {
            shell.openExternal('https://www.python.org/downloads/');
        }
        return false;
    }
    
    // Check if backend path exists
    if (!fs.existsSync(backendPath)) {
        console.error('Backend path does not exist:', backendPath);
        dialog.showErrorBox('Backend Error', 
            `Backend files not found at:\n${backendPath}\n\nPlease reinstall the application.`
        );
        return false;
    }
    
    // Check if app/main.py exists
    const mainPyPath = path.join(backendPath, 'app', 'main.py');
    if (!fs.existsSync(mainPyPath)) {
        console.error('main.py not found at:', mainPyPath);
        dialog.showErrorBox('Backend Error', 
            `Backend main.py not found at:\n${mainPyPath}\n\nPlease reinstall the application.`
        );
        return false;
    }

    try {
        // Check if uvicorn is available, install if not
        try {
            execSync(`"${pythonPath}" -c "import uvicorn, fastapi"`, { stdio: 'ignore' });
            console.log('Python dependencies already installed');
        } catch {
            console.log('Installing uvicorn and dependencies...');
            if (splashWindow && !splashWindow.isDestroyed()) {
                splashWindow.webContents.executeJavaScript(
                    `document.getElementById('status').textContent = 'Installing Python dependencies (this may take a minute)...'`
                ).catch(() => {});
            }
            
            const requirementsPath = path.join(backendPath, 'requirements.txt');
            try {
                if (fs.existsSync(requirementsPath)) {
                    console.log('Installing from requirements.txt:', requirementsPath);
                    execSync(`"${pythonPath}" -m pip install --user -r "${requirementsPath}"`, {
                        cwd: backendPath,
                        stdio: 'inherit',
                        timeout: 300000 // 5 minute timeout
                    });
                } else {
                    console.log('requirements.txt not found, installing minimal deps');
                    execSync(`"${pythonPath}" -m pip install --user uvicorn fastapi sqlalchemy`, { 
                        stdio: 'inherit',
                        timeout: 120000 
                    });
                }
            } catch (installError) {
                console.error('Failed to install dependencies:', installError);
                dialog.showErrorBox('Dependency Installation Failed',
                    `Failed to install Python dependencies.\n\nError: ${installError.message}\n\nTry running manually:\npip install -r requirements.txt`
                );
                return false;
            }
        }

        console.log('Starting uvicorn server...');
        
        // Check if port is already in use and try to free it
        try {
            const checkPort = execSync(`lsof -ti:${BACKEND_PORT}`, { encoding: 'utf8' }).trim();
            if (checkPort) {
                console.log(`Port ${BACKEND_PORT} is in use by PID ${checkPort}, attempting to free it...`);
                try {
                    execSync(`kill -9 ${checkPort}`, { stdio: 'ignore' });
                    // Wait a moment for the port to be freed
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    console.log(`Port ${BACKEND_PORT} freed`);
                } catch (killErr) {
                    console.error('Failed to kill process on port:', killErr.message);
                }
            }
        } catch {
            // No process on port, which is good
            console.log(`Port ${BACKEND_PORT} is available`);
        }
        
        // Store stderr output for error reporting
        let stderrOutput = '';
        
        backendProcess = spawn(pythonPath, [
            '-m', 'uvicorn',
            'app.main:app',
            '--host', '127.0.0.1',
            '--port', String(BACKEND_PORT)
        ], {
            cwd: backendPath,
            env: { 
                ...process.env, 
                PYTHONUNBUFFERED: '1',
                PYTHONDONTWRITEBYTECODE: '1'
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        backendProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`Backend: ${output}`);
            
            if (splashWindow && !splashWindow.isDestroyed()) {
                if (output.includes('Uvicorn running') || output.includes('Application startup complete')) {
                    splashWindow.webContents.executeJavaScript(
                        `document.getElementById('status').textContent = 'Backend ready!'`
                    ).catch(() => {});
                }
            }
        });

        backendProcess.stderr.on('data', (data) => {
            const output = data.toString();
            console.error(`Backend stderr: ${output}`);
            stderrOutput += output;
            
            // uvicorn logs to stderr, check for startup success
            if (output.includes('Uvicorn running') || output.includes('Application startup complete')) {
                if (splashWindow && !splashWindow.isDestroyed()) {
                    splashWindow.webContents.executeJavaScript(
                        `document.getElementById('status').textContent = 'Backend ready!'`
                    ).catch(() => {});
                }
            }
        });

        backendProcess.on('error', (error) => {
            console.error('Failed to start backend process:', error);
            dialog.showErrorBox('Backend Error', 
                `Failed to start backend process.\n\nError: ${error.message}`
            );
            backendProcess = null;
            updateTrayMenu();
        });

        backendProcess.on('close', (code) => {
            console.log(`Backend process exited with code ${code}`);
            if (code !== 0 && code !== null) {
                console.error('Backend stderr output:', stderrOutput);
            }
            backendProcess = null;
            updateTrayMenu();
        });

        // Wait for backend to be ready
        const ready = await waitForBackend();
        updateTrayMenu();
        return ready;

    } catch (error) {
        console.error('Failed to start backend:', error);
        dialog.showErrorBox('Backend Error', `Failed to start backend: ${error.message}`);
        return false;
    }
}

async function waitForBackend(maxAttempts = 30) {
    console.log('Waiting for backend to be ready...');
    
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await fetch(`${BACKEND_URL}/health`, {
                method: 'GET',
                timeout: 2000
            });
            
            if (response.ok) {
                console.log('Backend is ready!');
                return true;
            }
        } catch (error) {
            // Backend not ready yet
        }
        
        if (splashWindow && !splashWindow.isDestroyed()) {
            const progress = Math.min(((i + 1) / maxAttempts) * 100, 95);
            splashWindow.webContents.executeJavaScript(`
                document.querySelector('.loading-progress').style.width = '${progress}%';
                document.getElementById('status').textContent = 'Starting backend... (${i + 1}/${maxAttempts})';
            `).catch(() => {});
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.error('Backend failed to start within timeout');
    return false;
}

async function stopBackend() {
    if (backendProcess) {
        console.log('Stopping backend...');
        
        return new Promise((resolve) => {
            backendProcess.on('close', () => {
                backendProcess = null;
                updateTrayMenu();
                resolve();
            });
            
            // Try graceful shutdown first
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', backendProcess.pid, '/f', '/t']);
            } else {
                backendProcess.kill('SIGTERM');
            }
            
            // Force kill after 5 seconds
            setTimeout(() => {
                if (backendProcess) {
                    backendProcess.kill('SIGKILL');
                }
            }, 5000);
        });
    }
}

// IPC Handlers
ipcMain.handle('get-backend-url', () => BACKEND_URL);
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-platform', () => process.platform);
ipcMain.handle('get-store-value', (event, key) => store.get(key));
ipcMain.handle('set-store-value', (event, key, value) => store.set(key, value));
ipcMain.handle('is-backend-running', () => backendProcess !== null);

ipcMain.on('restart-backend', async () => {
    await stopBackend();
    await startBackend();
});

ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

ipcMain.on('show-notification', (event, { title, body }) => {
    const notification = new Notification({ title, body });
    notification.show();
});

// IPC entrypoint for optional main-process WebSocket mode.
ipcMain.on('ws-detection-message', (event, message) => {
    queueDetectionIpcMessage(message);
});

// App lifecycle
app.whenReady().then(async () => {
    createSplashWindow();
    
    // Update splash status
    if (splashWindow) {
        splashWindow.webContents.executeJavaScript(`
            document.getElementById('status').textContent = 'Initializing...';
        `).catch(() => {});
    }
    
    if (store.get('autoStartBackend')) {
        const backendStarted = await startBackend();
        if (!backendStarted && !isDev) {
            dialog.showErrorBox('Startup Error', 
                'Failed to start the backend server. Some features may not work correctly.');
        }
    }
    
    createMainWindow();
    createTray();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        } else if (mainWindow) {
            mainWindow.show();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        isQuitting = true;
        app.quit();
    }
});

app.on('before-quit', async () => {
    isQuitting = true;
    await stopBackend();
});

// Handle certificate errors in development
if (isDev) {
    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
        event.preventDefault();
        callback(true);
    });
}

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}
