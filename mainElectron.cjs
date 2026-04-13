const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');
const kill = require('tree-kill');

let phpProcess = null;
let reactProcess = null;
let mainWindow = null;

const HOST = '127.0.0.1';
let PORT = 8000;

// 📄 LOG EN PRODUCCIÓN
const logFile = path.join(app.getPath('userData'), 'app-log.txt');
function log(msg) {
    try {
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
    } catch (e) {}
}

// 🔴 Captura errores fatales
process.on('uncaughtException', (err) => {
    log('UNCAUGHT: ' + err.message);
});

process.on('unhandledRejection', (err) => {
    log('UNHANDLED: ' + err);
});

// 🔍 Verificar si el servidor está activo
function checkServer(port) {
    return new Promise((resolve) => {
        const req = http.get(`http://${HOST}:${port}`, () => resolve(true));
        req.on('error', () => resolve(false));
        req.end();
    });
}

// 🔄 Buscar puerto disponible
async function findAvailablePort(startPort) {
    let port = startPort;

    while (port < startPort + 100) {
        const isRunning = await checkServer(port);
        if (!isRunning) return port;
        port++;
    }

    throw new Error('No hay puertos disponibles');
}

// 🚀 Iniciar servidor PHP
function startPHPServer(port, phpPath, publicPath) {
    if (!fs.existsSync(phpPath)) {
        log('❌ PHP NO EXISTE: ' + phpPath);
        return false;
    }

    if (!fs.existsSync(publicPath)) {
        log('❌ PUBLIC PATH NO EXISTE: ' + publicPath);
        return false;
    }

    log('✅ PHP PATH: ' + phpPath);
    log('📂 PUBLIC PATH: ' + publicPath);

    try {
        phpProcess = spawn(phpPath, [
            '-S',
            `${HOST}:${port}`,
            '-t',
            publicPath
        ]);

        phpProcess.stdout.on('data', (data) => {
            log('PHP: ' + data.toString());
        });

        phpProcess.stderr.on('data', (data) => {
            log('PHP STDERR: ' + data.toString());
        });

        phpProcess.on('error', (err) => {
            log('❌ ERROR SPAWN PHP: ' + err.message);
        });

        phpProcess.on('close', (code) => {
            log('PHP EXIT: ' + code);
        });

        return true;

    } catch (err) {
        log('❌ EXCEPCIÓN PHP: ' + err.message);
        return false;
    }
}

// 🪟 Crear ventana
function createWindow(url) {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800
    });

    mainWindow.webContents.on('did-fail-load', () => {
        mainWindow.loadURL('data:text/html,<h2>No se pudo conectar a Laravel</h2><p>Revisa el log: app-log.txt</p>');
    });

    mainWindow.loadURL(url);
}

// ⏳ Esperar servidor
async function waitForServer(port, retries = 30) {
    for (let i = 0; i < retries; i++) {
        const isUp = await checkServer(port);
        if (isUp) return true;
        await new Promise(res => setTimeout(res, 500));
    }
    return false;
}

// 🎯 APP
app.whenReady().then(async () => {

    log('=== APP START ===');

    const isDev = !app.isPackaged;

    const phpPath = isDev
        ? path.join(__dirname, 'server/php/php.exe')
        : path.join(process.resourcesPath, 'php', 'php.exe');

    const laravelBasePath = isDev
        ? path.join(__dirname, 'server')
        : path.join(process.resourcesPath, 'app');

    const publicPath = path.join(laravelBasePath, 'public');

    log('Modo: ' + (isDev ? 'DEV' : 'PROD'));
    log('ResourcesPath: ' + process.resourcesPath);
    log('LaravelPath: ' + laravelBasePath);
    log('PublicPath: ' + publicPath);

    try {
        PORT = await findAvailablePort(PORT);
    } catch (err) {
        log(err.message);
        createWindow('data:text/html,<h1>Error: sin puertos disponibles</h1>');
        return;
    }

    const started = startPHPServer(PORT, phpPath, publicPath);

    if (!started) {
        createWindow('data:text/html,<h1>Error iniciando PHP</h1><p>Revisa app-log.txt</p>');
        return;
    }

    const ready = await waitForServer(PORT);

    if (!ready) {
        log('❌ Laravel no respondió');
        createWindow(`data:text/html,<h1>Laravel no inició</h1><p>Puerto: ${PORT}</p><p>Revisa log</p>`);
        return;
    }

    // --- INICIO DEL BLOQUE PARA REACT ---
    if (isDev) {
        const clientPath = path.join(__dirname, 'client');
        reactProcess = spawn(/^win/.test(process.platform) ? 'npm.cmd' : 'npm', ['run', 'dev'], {
            cwd: clientPath,
            shell: true
        });

        reactProcess.stdout.on('data', (data) => {
            log('React: ' + data.toString());
        });

        reactProcess.stderr.on('data', (data) => {
            log('React STDERR: ' + data.toString());
        });

        reactProcess.on('close', (code) => {
            log('React EXIT: ' + code);
        });
    }
    // --- FIN BLOQUE REACT ---

    // Crear ventana
    if (isDev) {
        createWindow('http://localhost:5173');
    } else {
        const indexPath = path.join(process.resourcesPath, 'client', 'index.html');
        createWindow(`file://${indexPath}`);
    }
});

// 🧹 Cerrar
app.on('window-all-closed', () => {
    // 🔴 Cerrar PHP embebido
    if (phpProcess && !phpProcess.killed) {
        kill(phpProcess.pid);
        phpProcess = null;
    }

    // 🔴 Cerrar React dev server (si está en desarrollo)
    if (reactProcess && !reactProcess.killed) {
        kill(reactProcess.pid);
        reactProcess = null;
    }

    // 🔴 Salir de la app en cualquier SO que no sea Mac
    app.quit();
});