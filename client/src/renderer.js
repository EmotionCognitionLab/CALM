/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */

import './index.css';
import { createApp } from 'vue';
import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import App from './App.vue';
// import { process } from 'electron';

import SetupComponent from './components/SetupComponent.vue'
import UploadComponent from './components/UploadComponent.vue'
import LoginComponent from './components/LoginComponent.vue'
import StudyCompleteComponent from './components/StudyCompleteComponent.vue'
import EarningsComponent from './components/EarningsComponent.vue'
import DoneTodayComponent from './components/DoneTodayComponent.vue'
import OauthRedirectComponent from './components/OauthRedirectComponent.vue'
import ConnectingComponent from './components/ConnectingComponent.vue'
import CognitiveComponent from './components/CognitiveComponent.vue';


import { isAuthenticated, getAuth } from '../../common/auth/auth'
import { SessionStore } from './session-store'
import LumosityComponent from './components/LumosityComponent.vue';
import Stage2Component from './components/Stage2Component.vue';
import Stage3Component from './components/Stage3Component.vue'
import ApiClient from "../../common/api/client"


const routes = [
    { path: '/setup/:stageNum', beforeEnter: practiceOrSetup, component: SetupComponent, props: true },
    { path: '/upload', component: UploadComponent },
    { path: '/signin', component: LoginComponent, name: 'signin', props: true },
    { path: '/login', beforeEnter: handleOauthRedirect, component: OauthRedirectComponent }, // TODO eliminate now-obsolete OauthRedirectComponent; the beforeEnter guard is now doing all the work
    { path: '/earnings', component: EarningsComponent },
    { path: '/stage2/:mustWait', name: 'stage2', component: Stage2Component, props: (route) => {
        // apparently the router changes booleans to strings; change it back :-(
        if (route.params.mustWait == 'false') return { mustWait: false }
        if (route.params.mustWait == 'true') return { mustWait: true }
        return {}
     }},
     { path: '/stage3/:mustWait', name: 'stage3', component: Stage3Component, props: (route) => {
        // apparently the router changes booleans to strings; change it back :-(
        if (route.params.mustWait == 'false') return { mustWait: false }
        if (route.params.mustWait == 'true') return { mustWait: true }
        return {}
     }},
    { path: '/donetoday', component: DoneTodayComponent},
    { path: '/alldone', component: StudyCompleteComponent},
    { path: '/', name: 'landing-page', component: ConnectingComponent},
    { path: '/cognitive/:stageNum', component: CognitiveComponent, props: true },
    { path: '/current-stage', redirect: '/setup/1' },
    { path: '/lumosity/:stageNum', component: LumosityComponent, props: true }
]

const noAuthRoutes = ['/signin', '/login', '/']
const dbRequiredRoutes = ['/earnings', '/current-stage', '/setup/1', '/setup/3', '/cognitive/1', '/cognitive/4', '/lumosity/2', '/lumosity/3', '/stage2', '/stage3']
let stage2Complete = false

const router = createRouter({
    history: import.meta.env.PROD ? createWebHashHistory() : createWebHistory(),
    routes: routes
})

let isDbInitialized = false

async function practiceOrSetup(to) {
    if (!isDbInitialized) {
        console.error(`Database is not initialized; unable to tell if participant requires setup.`)
        return false // TODO should we just send them through signup again?
    }
    if (to.params.stageNum == 4) return true; // then we're trying to get to final lab visit; go there

    if (await window.mainAPI.getKeyValue('setupComplete') == 'true') {    
        if (await window.mainAPI.getLumosityDoneToday()) {
            if (stage2Complete) {
                return { path: '/stage3/true' }
            } else {
                return { path: '/stage2/true' }
            }
        }
        return stage2Complete ? { path: '/lumosity/3' } : { path: '/lumosity/2' }
    }

    return true
}

async function handleLoginSuccess(session) {
    SessionStore.session = session
    await window.mainAPI.loginSucceeded(session)
    const apiClient = new ApiClient(session)
    const data = await apiClient.getSelf()
    if (data?.progress?.status == 'stage2Complete') {
        stage2Complete = true
    }
    isDbInitialized = true
}

async function handleOauthRedirect(to) {
    if (to.query && to.query.code) {
        // we're handling a redirect from the oauth server
        // take the code and state from query string and let cognito parse them
        const p = new Promise((res, rej) => {
            const cognitoAuth = getAuth()
            cognitoAuth.userhandler = {
                onSuccess: session => res(session),
                onFailure: err => {
                    console.error(err)
                    rej(err)
                }
            }

            cognitoAuth.parseCognitoWebResponse(to.fullPath)
        })
        
        const session = await p
        await handleLoginSuccess(session)
    }
    const dest = window.sessionStorage.getItem('postLoginPath') ? window.sessionStorage.getItem('postLoginPath') : '/'
    window.sessionStorage.removeItem('postLoginPath')
    router.push({path: dest})
}

// use navigation guards to handle authentication
router.beforeEach(async (to) => {
    // index.html means we're running as a packaged app and win.loadFile has been called
    if (to.path.endsWith('index.html')) return {path: '/'}

    if (!isAuthenticated() && !noAuthRoutes.includes(to.path)) {
        return { name: 'signin', query: { 'postLoginPath': to.path } }
    }

    if (!dbRequiredRoutes.includes(to.path)) return true

    // make sure we have a session and use it to announce login success
    // and initialize db
    const sess = await SessionStore.getRendererSession()
    if (isAuthenticated() && !sess) {
        const p = new Promise((res, rej) => {
            const cognitoAuth = getAuth()
            cognitoAuth.userhandler = {
                onSuccess: session => res(session),
                onFailure: err => {
                    console.error(err)
                    rej(err)
                }
            }
            cognitoAuth.getSession()
        })

        const session = await p
        await handleLoginSuccess(session)
    } else if (sess) {
        await handleLoginSuccess(sess)
    }
    return true
})

window.mainAPI.onGoTo((routePath) => {
    if (routePath.indexOf('?') !== -1) {
        const queryItems = routePath.slice(routePath.indexOf('?') + 1).split('&')
        const query = {}
        queryItems.forEach(qi => {
            const parts = qi.split('=')
            const key = parts[0]
            const value = parts.length > 1 ? parts[1] : null
            query[key] = value
        })
        router.push({path: routePath, query: query})
    } else {
        router.push({path: routePath});
    }
})


const app = createApp(App)
app.use(router)

app.mount('#app')
