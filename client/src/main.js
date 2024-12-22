import './crypto-polyfill'
import { app, shell, BrowserWindow, Menu, WebContentsView } from 'electron';
import path from 'path';
import * as AmazonCognitoIdentity from 'amazon-cognito-auth-js';
import awsSettings from '../../common/aws-settings.json';
import { ipcMain } from 'electron';
// import * as Logger from 'logger'
import Logger from 'logger';
import emwave from './emwave';
import { emWaveDbPath, deleteShortSessions as deleteShortEmwaveSessions, extractSessionData, getDataForSessions } from './emwave-data';
import { dbPath, closeDb, getKeyValue, setKeyValue, saveEmWaveSessionData, getEmWaveSessionsForStage, getEmWaveSessionMinutesForDayAndStage, hasDoneCognitiveExperiment, latestExperimentResult, saveCognitiveResults, deleteKeyValue, getLumosityDoneToday, setLumosityDoneToday } from './local-data';
import version from "../version.json";
import packageInfo from "../package.json"
import { SessionStore } from './session-store'
import s3utils from './s3utils'

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
import('electron-squirrel-startup').then(ess => {
  if (ess.default) app.quit();
});

app.setAboutPanelOptions({
  applicationName: "CALM Study",
  applicationVersion: packageInfo.version,
  iconPath: assetsPath() + "logo.png"
});

let mainWin = null
const appFileEntry = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)

const createWindow = async () => {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 1300,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('get-current-user');
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await win.loadFile(appFileEntry);
  }

  // Open the DevTools.
  // win.webContents.openDevTools();

  return win;

};


const EARNINGS_MENU_ID = 'earnings'
const TRAINING_MENU_ID = 'training'
const LAB_VISIT_MENU_ID = 'lab-visit'

function buildMenuTemplate(window) {
  const isMac = process.platform === 'darwin'

  return [
    // { role: 'appMenu' }
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
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
    // { role: 'fileMenu' }
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    // { role: 'editMenu' }
    {
      label: 'Edit',
      submenu: [
        { role: 'copy' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
          { type: 'separator' },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' },
              { role: 'stopSpeaking' }
            ]
          }
        ] : [ ])
      ]
    },
    // { role: 'viewMenu' }
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Earnings', id: EARNINGS_MENU_ID, click: () => window.webContents.send('go-to', '/earnings')},
        { label: 'Daily Training', id: TRAINING_MENU_ID, click: () => window.webContents.send('go-to', '/current-stage')},
        { label: 'Lab Visit 2', id: LAB_VISIT_MENU_ID, click: () => window.webContents.send('go-to', '/setup/3'), visible: false, accelerator: 'CmdOrCtrl+Shift+L'}
      ]
    },
    // { role: 'windowMenu' }
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    // { role: 'helpMenu' }
    ...(isMac ? [] : [{
      label: 'Help',
      submenu: [{role: 'about'}]
    }])
  ];
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  await emwave.startEmWave();
  // give emwave some time to start,
  // them create window and menus
  setTimeout(async () => {
    mainWin = await createWindow();
    const menuTmpl = buildMenuTemplate(mainWin);
    const menu = Menu.buildFromTemplate(menuTmpl);
    Menu.setApplicationMenu(menu);
    emwave.createClient(mainWin);
    mainWin.setFullScreen(true);
    mainWin.show();
    emwave.hideEmWave();
  }, 5000);
});

ipcMain.handle('disable-menus', () => {
  const m = Menu.getApplicationMenu();
  m.getMenuItemById(EARNINGS_MENU_ID).enabled = false;
  m.getMenuItemById(TRAINING_MENU_ID).enabled = false;
});

// Prevent multiple instances of the app
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWin) {
      if (mainWin.isMinimized()) {
        mainWin.restore();
      }

      mainWin.show();
  }
});

ipcMain.on('current-user', async (_event, user) => {
  const l = new Logger(true, user);
  await l.init();
});


app.on('before-quit', () => {
  emwave.stopEmWave()
  closeDb()
})

ipcMain.on('pulse-start', () => {
  emwave.startPulseSensor()
})

ipcMain.on('pulse-stop', () => {
  emwave.stopPulseSensor()
})

// btoa and atob are defined in global browser contexts,
// but not node. Define them here b/c amazon-cognito-auth-js
// expects them to exist
if (typeof btoa === 'undefined') {
  global.btoa = function (str) {
    return Buffer.from(str, 'binary').toString('base64');
  };
}

if (typeof atob === 'undefined') {
  global.atob = function (b64Encoded) {
    return Buffer.from(b64Encoded, 'base64').toString('binary');
  };
}

ipcMain.on('show-login-window', async () => {
  const remoteLogger = new Logger(false);
  await remoteLogger.init()
  try {
    const auth = new AmazonCognitoIdentity.CognitoAuth(awsSettings);
    auth.useCodeGrantFlow();
    const url = auth.getFQDNSignIn();
    mainWin.loadURL(url);
    
    mainWin.webContents.on('will-redirect', async (event, oauthRedirectUrl) => {
      if (!oauthRedirectUrl.startsWith(awsSettings.RedirectUriSignIn)) return;

      event.preventDefault();
      // depending on how the oauth flow went, the main window may now be showing
      // an Amazon Cognito page. We need to re-load the app and tell it to handle
      // the oauth response.
      // we want the renderer window to load the response from the oauth server
      // so that it gets the session and can store it
      
      // // in prod mode app URLs start with 'app://'
      const query = oauthRedirectUrl.indexOf('?') > 0 ? oauthRedirectUrl.slice(oauthRedirectUrl.indexOf('?')) : '';
      if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        await mainWin.loadURL(`http://localhost:5173/login${query}`);
      } else {
        const curUrl = mainWin.webContents.getURL();
        if (curUrl.indexOf(awsSettings.AppWebDomain) > -1) {
          // then we're currently showing an amazon login page and need to load
          // our app to proceed
          await mainWin.loadFile(appFileEntry);
        }
        await mainWin.webContents.send('go-to', `/login${query}`);
      }
    }) 
    
  } catch (err) {
    // console.error(err)
    remoteLogger.error(err);
  } 
});

ipcMain.handle('emwave-extract-sessions', (event, sinceDateTime, includeLiveIBI) => {
  const res = extractSessionData(sinceDateTime, includeLiveIBI);
  return res;
});

ipcMain.handle('save-emwave-session', (event, emWaveSessionId, avgCoherence, pulseStartTime, validStatus, durationSec, stage) => {
  saveEmWaveSessionData(emWaveSessionId, avgCoherence, pulseStartTime, validStatus, durationSec, stage);
});

ipcMain.handle('get-emwave-sessions-for-stage', (event, stage) => {
  return getEmWaveSessionsForStage(stage);
});

ipcMain.handle('get-emwave-session-data', (event, sessionIds) => {
  return getDataForSessions(sessionIds);
});

ipcMain.handle('get-emwave-session-minutes-for-day-and-stage', (event, date, stage) => {
  return getEmWaveSessionMinutesForDayAndStage(date, stage);
});

ipcMain.handle('has-done-cognitive-experiment', (_event, experiment, stage) => {
  return hasDoneCognitiveExperiment(experiment, stage);
});

ipcMain.handle('latest-experiment-result', (_event, experiment, stage) => {
  return latestExperimentResult(experiment, stage);
})

ipcMain.handle('save-cognitive-results', (event, experiment, isRelevant, stage, results) => {
  saveCognitiveResults(experiment, isRelevant, stage, results);
});

ipcMain.handle('upload-emwave-data', async (event, session) => {
  // give emWave a couple of seconds to save any lingering data before quitting
  await new Promise(resolve => setTimeout(() => {
    emwave.stopEmWave();
    resolve();
  }, 2000));
  deleteShortEmwaveSessions();
  const emWaveDb = emWaveDbPath();
  const fullSession = SessionStore.buildSession(session);
  await s3utils.uploadFile(fullSession, emWaveDb)
  .catch(err => {
    console.error(err);
    return (err.message);
  });
  return null;
});

ipcMain.handle('upload-breath-data', async (event, session) => {
  closeDb();
  const localDb = dbPath();
  const fullSession = SessionStore.buildSession(session);
  await s3utils.uploadFile(fullSession, localDb)
  .catch(err => {
    console.error(err);
    return (err.message);
  });
  return null;
});

ipcMain.handle('get-key-value', (event, key) => {
  return getKeyValue(key)
})

ipcMain.on('set-key-value', (event, key, value) => {
  setKeyValue(key, value)
})

ipcMain.on('delete-key-value', (event, key) => {
  deleteKeyValue(key)
})

ipcMain.handle('set-stage', async(_event, stage) => {
  emwave.setStage(stage);
});

let lumosityView = null;

// handles login page, returns true if login successfully attempted
function lumosityLogin(email, password) {
  const emailInput = document.getElementById("user_login");
  const passwordInput = document.getElementById("user_password");
  const formSubmit = document.querySelector('input[type="submit"][value="Log In"]');
  if (emailInput && passwordInput && formSubmit) {
      emailInput.value = email;
      passwordInput.value = password;
      formSubmit.click();
      return true;
  } else {
      return false;
  }
}

function lumosityLoginJS(email, password) {
  return `(${lumosityLogin})("${email}@${awsSettings.LumosDomain}", "${password}")`;
}

ipcMain.on('create-lumosity-view', async (_event, email, password, userAgent) => {
  if (lumosityView) {
      return;
  }
  if (!mainWin) {
    // if we're going staight to Lumosity on startup we may need to
    // wait a bit for main window initialization
    await new Promise(resolve => setTimeout(() => resolve(), 200))
  }

  // Sets bounds for the lumosity view based on the main content view,
  // allowing some room at the top for a "All done with brain games" button
  const calculateBounds = (bounds) => {
    return {x: bounds.x, y: bounds.y + 90, width: bounds.width, height: bounds.height - 90}
  }

  lumosityView = new WebContentsView();
  mainWin.contentView.addChildView(lumosityView);
  lumosityView.setBounds(calculateBounds(mainWin.contentView.getBounds()));
  // handle first login page load
  lumosityView.webContents.once("did-finish-load", () => {
      // skipping past lumosity might cause the lumosity view to be
      // removed before the login can be executed
      if (lumosityView && lumosityView.webContents) {
        lumosityView.webContents.executeJavaScript(lumosityLoginJS(email, password));
      }
  });
  lumosityView.webContents.loadURL("https://www.lumosity.com/login", {userAgent: userAgent.replace(/heartbeam.* /, '').replace(/Electron.* /, '')});
});

ipcMain.on('hide-lumosity-view', (_event) => {
  if (!lumosityView) return;

  lumosityView.setVisible(false);
});

ipcMain.on('close-lumosity-view', (_event) => {
  if (!mainWin || !lumosityView) return;

  mainWin.contentView.removeChildView(lumosityView);
  lumosityView = null;
});

ipcMain.on('show-lumosity-view', (_event) => {
  if (!lumosityView) return;

  lumosityView.setVisible(true);
});

ipcMain.handle('get-lumosity-done-today', (_event) => {
  return getLumosityDoneToday();
});

ipcMain.on('set-lumosity-done-today', (_event) => {
  return setLumosityDoneToday();
});

ipcMain.handle('beep', () => {
  shell.beep()
})

ipcMain.handle('quit', () => {
  app.quit();
})


// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});


function assetsPath() {
  if (process.env.NODE_ENV === 'production') {
    if (process.platform === 'darwin') {
      return path.join(path.dirname(app.getPath('exe')), '../src/assets/');
    }
    return path.join(path.dirname(app.getPath('exe')), '/src/assets/');
  } else {
    return path.join(app.getAppPath(), '../src/assets/');
  }
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
