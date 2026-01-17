import express from 'express';
import session from 'cookie-session';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Config
const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || 'secret';
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

if (!APP_ID || !APP_SECRET) {
    console.warn('WARNING: FEISHU_APP_ID or FEISHU_APP_SECRET is missing in .env');
}

// Middleware
app.use(session({
    name: 'fish-session',
    keys: [SESSION_SECRET],
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

app.use(express.json());

// Auth Middleware
const requireAuth = (req, res, next) => {
    // Skip auth for static assets, auth routes, and dev HMR
    if (req.path.startsWith('/auth') ||
        req.path.startsWith('/api/user') ||
        req.path.includes('@vite') ||
        req.path.includes('node_modules')) {
        return next();
    }

    if (req.session && req.session.user) {
        return next();
    }

    // Checking if it's an API request or Page load
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Redirect to login
    res.redirect('/auth/login');
};

// --- Routes ---

// 1. Auth Login (Redirect to Feishu)
app.get('/auth/login', (req, res) => {
    const redirectUri = `${APP_URL}/auth/callback`;
    // Feishu (Lark) OAuth URL
    const authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=RANDOM_STATE`;
    res.redirect(authUrl);
});

// 2. Auth Callback
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Missing authorization code');
    }

    try {
        // Exchange code for app_access_token (internal) or directly user_access_token
        // Feishu new flow: convert authorization code to user_access_token
        const tokenRes = await axios.post('https://open.feishu.cn/open-apis/authen/v1/oidc/access_token', {
            grant_type: 'authorization_code',
            code: code,
            app_access_token: await getAppAccessToken() // Need app token for some calls, but OIDC might just need App ID/Secret
        }, {
            headers: {
                'Authorization': `Bearer ${await getAppAccessToken()}`
            }
        });

        // Actually, the OIDC endpoint usually takes app_access_token as a header Authorization: Bearer ...
        // Let's use the standard "Get User Identity" flow which is simpler for internal apps.

        // Correct Flow:
        // 1. Get app_access_token
        const appToken = await getAppAccessToken();

        // 2. Get user info using code
        const userRes = await axios.post('https://open.feishu.cn/open-apis/authen/v1/access_token', {
            grant_type: 'authorization_code',
            code: code
        }, {
            headers: {
                'Authorization': `Bearer ${appToken}`
            }
        });

        const userData = userRes.data.data;

        if (!userData) {
            throw new Error(`Failed to get user data: ${JSON.stringify(userRes.data)}`);
        }

        // Store user in session
        req.session.user = {
            name: userData.name,
            avatar: userData.avatar_url,
            sub: userData.open_id || userData.user_id,
            ...userData
        };

        // Redirect home
        res.redirect('/');

    } catch (error) {
        console.error('Login failed:', error.response?.data || error.message);
        res.status(500).send('Login failed, check console logs.');
    }
});

// Helper: Get App Access Token (Cached)
let cachedAppToken = null;
let tokenExpiry = 0;

async function getAppAccessToken() {
    const now = Date.now();
    if (cachedAppToken && now < tokenExpiry) {
        return cachedAppToken;
    }

    try {
        const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
            app_id: APP_ID,
            app_secret: APP_SECRET
        });

        if (res.data.code !== 0) {
            throw new Error(`Feishu Error: ${res.data.msg}`);
        }

        cachedAppToken = res.data.app_access_token;
        tokenExpiry = now + (res.data.expire - 60) * 1000; // Buffer 60s
        return cachedAppToken;
    } catch (e) {
        console.error('Failed to get app_access_token:', e.message);
        throw e;
    }
}

// 3. Get Current User (Frontend API)
app.get('/api/user', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.status(401).json({ loggedIn: false });
    }
});

// 4. Logout
app.get('/auth/logout', (req, res) => {
    req.session = null;
    res.redirect('/');
});


// Static Files (Production)
// In development, Vite handles static files. In production, Express does.
if (process.env.NODE_ENV === 'production') {
    // Protect static files
    app.use(requireAuth, express.static(path.join(__dirname, 'dist')));

    // SPA Fallback
    app.get('*', requireAuth, (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
} else {
    // In Dev, we might want to protect /data if possible, but Vite proxy makes it tricky.
    // Ideally, for dev, we run this server and have Vite proxy /auth and /api to it.
    // The "requireAuth" middleware only protects routes hitting THIS server.
    // If accessing Vite dev server (port 5173), request goes to Vite.
    console.log('Running in Development Mode');

    // Serve data directory specifically (so we can test protection locally if accessing via port 3000)
    app.use('/data', requireAuth, express.static(path.join(__dirname, 'public/data')));
}

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
