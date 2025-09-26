// server.js (ESM)
// Google OAuth + JSON file user DB (userdb.json) + UNIQ-ID flows (uniqid_users.json)
// Converted to ES module imports for projects using "type": "module" in package.json

import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { pathToFileURL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ESM __dirname helper
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Views (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static & body
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ----------------- JSON DB helper (Google users, original) -----------------
const JSON_DB_PATH = path.resolve(__dirname, 'userdb.json');
console.log('JSON DB path:', JSON_DB_PATH);

// Ensure file exists
function ensureDbFile() {
  if (!fs.existsSync(JSON_DB_PATH)) {
    fs.writeFileSync(JSON_DB_PATH, '[]', 'utf8');
    console.log('Created new userdb.json');
  }
}
ensureDbFile();

// Load all users (synchronous for simplicity)
function loadUsers() {
  try {
    const raw = fs.readFileSync(JSON_DB_PATH, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error('Failed to read userdb.json:', e);
    return [];
  }
}

// Save users array
function saveUsers(users) {
  try {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to write userdb.json:', e);
    return false;
  }
}

// Finders and mutators (Google/email users)
function findByEmail(email) {
  if (!email) return null;
  const users = loadUsers();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}
function findByUsername(username) {
  if (!username) return null;
  const users = loadUsers();
  return users.find(u => u.username && u.username.toLowerCase() === username.toLowerCase()) || null;
}
function getNextId() {
  const users = loadUsers();
  if (!users.length) return 1;
  return (users[users.length - 1].id || 0) + 1;
}
function addUser({ email, username, passwordHash, googleId }) {
  const users = loadUsers();
  if (findByEmail(email)) throw new Error('EmailExists');
  if (findByUsername(username)) throw new Error('UsernameExists');

  const newUser = {
    id: getNextId(),
    email,
    username,
    password: passwordHash,
    googleId: googleId || null,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  const ok = saveUsers(users);
  if (!ok) throw new Error('WriteFailed');
  return newUser;
}
function deleteUserByEmail(email) {
  let users = loadUsers();
  const before = users.length;
  users = users.filter(u => u.email.toLowerCase() !== email.toLowerCase());
  const after = users.length;
  const ok = saveUsers(users);
  return ok ? (before - after) : -1; // returns number of rows removed or -1 on failure
}

// ----------------- UNIQ users JSON (separate file) -----------------
const UNIQ_DB_PATH = path.resolve(__dirname, 'uniqid_users.json');
function ensureUniqDb() {
  if (!fs.existsSync(UNIQ_DB_PATH)) {
    fs.writeFileSync(UNIQ_DB_PATH, '[]', 'utf8');
    console.log('Created new uniqid_users.json');
  }
}
ensureUniqDb();

function loadUniqUsers() {
  try {
    const raw = fs.readFileSync(UNIQ_DB_PATH, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error('Failed to read uniqid_users.json:', e);
    return [];
  }
}
function saveUniqUsers(users) {
  try {
    fs.writeFileSync(UNIQ_DB_PATH, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to write uniqid_users.json:', e);
    return false;
  }
}
function findUniqById(uniqIdStr) {
  if (!uniqIdStr) return null;
  const arr = loadUniqUsers();
  return arr.find(u => u.uniqId === uniqIdStr) || null;
}
function addUniqUser({ uniqId, username }) {
  const arr = loadUniqUsers();
  if (findUniqById(uniqId)) throw new Error('UniqExists');
  const obj = {
    uniqId,
    username,
    createdAt: new Date().toISOString()
  };
  arr.push(obj);
  const ok = saveUniqUsers(arr);
  if (!ok) throw new Error('WriteFailed');
  return obj;
}
function deleteUniqById(uniqId) {
  let arr = loadUniqUsers();
  const before = arr.length;
  arr = arr.filter(u => u.uniqId !== uniqId);
  const after = arr.length;
  const ok = saveUniqUsers(arr);
  return ok ? (before - after) : -1;
}

// ----------------- Session + Passport -----------------
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: false, sameSite: 'lax' }
}));
app.use(passport.initialize());
app.use(passport.session());

// Passport Google strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK || `http://localhost:${PORT}/auth/google/callback`
}, (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile?.emails?.[0]?.value;
    if (!email) return done(new Error('Google profile has no email'));

    const existing = findByEmail(email);
    if (existing) {
      // existing user -> return the user object
      return done(null, existing);
    }

    // not found -> return lightweight "new" object (do not persist yet)
    return done(null, {
      email,
      googleId: profile.id,
      displayName: profile.displayName || '',
      isNew: true
    });
  } catch (e) {
    return done(e);
  }
}));

// Serialize/deserialize by email
passport.serializeUser((user, done) => {
  if (!user || !user.email) return done(new Error('serializeUser: missing email'));
  done(null, user.email);
});
passport.deserializeUser((email, done) => {
  const user = findByEmail(email);
  done(null, user || null);
});

// ----------------- Dynamic import of UNIQ SDK (server ESM) -----------------
// The server expects an ESM module at uniqid-sdk/uniqid-sdk.server.js exporting verifyAndProve(email,deKey)
// But SDK may export different function names (verifyProcess, checkkOnChain, etc.)
// We'll normalize and support multiple candidate names.

const sdkServerPath = path.join(__dirname, 'uniqid-sdk', 'uniqid-sdk.server.js');
let sdkModule = null;
let sdkLoaded = false;

(async () => {
  try {
    if (fs.existsSync(sdkServerPath)) {
      const url = pathToFileURL(sdkServerPath).href;
      const mod = await import(url);
      // Keep either default or named exports
      sdkModule = mod.default || mod;

      // log available keys for debugging (you already saw this)
      console.log('UNIQ SDK keys:', Object.keys(sdkModule || {}));

      // Quick check: look for any known verifier / quick-check function names
      const verifierCandidates = [
        'verifyAndProve',
        'verifyAndProveAsync',
        'verify',
        'verifyProcess',
        'verify_process',
        'verifyProof',
        'verifyProofAsync'
      ];
      const quickCandidates = [
        'onlyCheckOnChain',
        'only_check_on_chain',
        'checkRootOnChain',
        'checkOnChain',
        'checkkOnChain', // accomodate typo in your SDK
        'checkRoot'
      ];

      const hasVerifier = verifierCandidates.some(n => typeof sdkModule[n] === 'function');
      const hasQuick = quickCandidates.some(n => typeof sdkModule[n] === 'function');

      if (hasVerifier || hasQuick) {
        sdkLoaded = true;
        console.log('✅ UNIQ SDK (server) loaded from', sdkServerPath);
      } else {
        console.warn('⚠️ UNIQ SDK loaded but does not expose verify/verifyProcess/onlyCheckOnChain. Module keys:', Object.keys(sdkModule || {}));
      }
    } else {
      console.warn('⚠️ UNIQ SDK server file not found at', sdkServerPath, '— UNIQ endpoints will return errors until SDK server file is added (uniqid-sdk.server.js).');
    }
  } catch (err) {
    console.error('Failed to load UNIQ SDK (server):', err);
  }
})();

// Helper: pick first available function from sdkModule by name candidates
function pickSdkFunction(moduleObj, candidates = []) {
  if (!moduleObj) return null;
  for (const name of candidates) {
    if (typeof moduleObj[name] === 'function') return moduleObj[name];
  }
  // also try moduleObj itself if it's a function
  if (typeof moduleObj === 'function') return moduleObj;
  return null;
}

// Helper: normalize various verifier results into { uniqId, uniqIdString }
function normalizeVerifierResult(result) {
  if (!result) return null;

  // If SDK returned a wrapper { success: true, ... } unwrap it
  const r = (result && typeof result === 'object' && result.success === true && 'uniqId' in result) ? result : result;

  // possible keys: uniqId (number/string), uniqIdString, uniqString, uniq_id, uniq_id_dec, uniq (various)
  let uniqId = null;
  let uniqIdString = null;

  if (r.uniqId !== undefined && r.uniqId !== null) uniqId = Number(r.uniqId);
  else if (r.uniq_id !== undefined && r.uniq_id !== null) {
    // maybe string like "UNIQ-000007" or number
    const s = String(r.uniq_id);
    const m = s.match(/^UNIQ-(\d+)$/);
    if (m) uniqId = Number(m[1]);
    else if (/^\d+$/.test(s)) uniqId = Number(s);
  } else if (r.uniqString !== undefined) {
    // maybe UNIQ-000007
    const s = String(r.uniqString);
    const m = s.match(/^UNIQ-(\d+)$/);
    if (m) uniqId = Number(m[1]);
  } else if (r.uniqIdString) {
    // maybe "UNIQ-7" or "UNIQ-000007" or number string
    const s = String(r.uniqIdString);
    const m = s.match(/^UNIQ-(\d+)$/);
    if (m) uniqId = Number(m[1]);
    else if (/^\d+$/.test(s)) uniqId = Number(s);
  } else if (r.id !== undefined) {
    // fallback
    uniqId = Number(r.id);
  } else if (typeof r === 'number') {
    uniqId = r;
  }

  // If we have a numeric uniqId, build the padded UNIQ-000000 string
  if (!isNaN(uniqId) && uniqId > 0) {
    uniqIdString = `UNIQ-${String(uniqId).padStart(6, '0')}`;
  }

  // If the SDK returned an explicit uniqIdString use it (prefer full string from SDK)
  if (!uniqIdString && (r.uniqIdString || r.uniqString || r.uniq_id)) {
    uniqIdString = r.uniqIdString || r.uniqString || r.uniq_id;
  }

  // final fallback: if result contains leaf / leafBytes32 etc, we still return the result
  return {
    uniqId: uniqId || null,
    uniqIdString: uniqIdString || null,
    raw: r
  };
}

// ----------------- Routes -----------------

// home
app.get('/', (req, res) => res.redirect('/login'));

// Serve UNIQ login/signup page (route user clicks "Continue with UNIQ")
app.get('/uniq', (req, res) => {
  // renders views/login-signup-uniq.ejs
  return res.render('login-signup-uniq');
});

// login page
app.get('/login', (req, res) => {
  res.render('login', { user: req.user || null });
});

// start OAuth
app.get('/auth/google', (req, res, next) => {
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// callback
app.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user /* possibly lightweight */) => {
    if (err) {
      console.error('Passport auth error:', err);
      return res.redirect('/login?error=auth');
    }
    if (!user) {
      console.warn('Passport returned no user');
      return res.redirect('/login?error=nouser');
    }

    // If user.isNew (lightweight), do NOT login — prompt for username+password
    if (user.isNew) {
      req.session.tempGoogle = {
        email: user.email,
        googleId: user.googleId,
        displayName: user.displayName || ''
      };
      console.log('tempGoogle saved for:', req.session.tempGoogle.email);
      return res.redirect('/signup');
    }

    // existing user -> log in and redirect to dashboard
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('req.logIn error:', loginErr);
        return res.redirect('/login?error=loginfail');
      }
      console.log('Logged in existing user:', user.email);
      return res.redirect('/dashboard');
    });
  })(req, res, next);
});

// signup page (GET)
app.get('/signup', (req, res) => {
  const tmp = req.session.tempGoogle;
  if (!tmp) {
    console.log('/signup opened without tempGoogle -> redirect to /login');
    return res.redirect('/login');
  }
  res.render('signup', { email: tmp.email, displayName: tmp.displayName || '' });
});

// handle signup (POST)
app.post('/signup', (req, res) => {
  const tmp = req.session.tempGoogle;
  if (!tmp) return res.redirect('/login');

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send('Username & password required');

  // Validate uniqueness
  if (findByEmail(tmp.email)) {
    delete req.session.tempGoogle;
    return res.status(400).send('Email already exists. Please login.');
  }
  if (findByUsername(username)) {
    return res.status(400).send('Username already taken. Choose another.');
  }

  // Hash password
  let hash;
  try {
    hash = bcrypt.hashSync(password, 10);
  } catch (e) {
    console.error('bcrypt error:', e);
    return res.status(500).send('Server error (hashing)');
  }

  // Create user
  try {
    const newUser = addUser({
      email: tmp.email,
      username,
      passwordHash: hash,
      googleId: tmp.googleId || null
    });
    // Clear temp and log user in (serialize uses email)
    delete req.session.tempGoogle;
    req.logIn(newUser, (loginErr) => {
      if (loginErr) {
        console.error('Login after signup failed:', loginErr);
        return res.status(500).send('Login after signup failed');
      }
      console.log('Signed up and logged in:', newUser.email);
      return res.redirect('/dashboard');
    });
  } catch (e) {
    console.error('Add user error:', e && e.message);
    if (e.message === 'EmailExists') return res.status(400).send('Email already exists');
    if (e.message === 'UsernameExists') return res.status(400).send('Username already taken');
    return res.status(500).send('Error creating account');
  }
});

// ========== UNIQ endpoints ==========

// UNIQ Signup (server verifies root & proof via SDK, stores only uniqId + username)
app.post('/api/uniq/signup', async (req, res) => {
  try {
    if (!sdkLoaded || !sdkModule) {
      return res.status(500).json({ error: 'UNIQ SDK not loaded on server' });
    }

    // Candidate names for verifier (heavy proof + on-chain check) and quick on-chain-only check
    const verifierCandidates = [
      'verifyAndProve',
      'verifyAndProveAsync',
      'verify',
      'verifyProcess',
      'verify_process',
      'verifyProof'
    ];
    const quickCandidates = [
      'onlyCheckOnChain',
      'only_check_on_chain',
      'checkRootOnChain',
      'checkOnChain',
      'checkkOnChain', // tolerate typo
      'checkRoot'
    ];

    const verifier = pickSdkFunction(sdkModule, verifierCandidates);
    const quickCheck = pickSdkFunction(sdkModule, quickCandidates);

    if (!verifier && !quickCheck) {
      return res.status(500).json({ error: 'UNIQ SDK loaded but verification functions missing' });
    }

    const { uniqId, email, deKey, username } = req.body;
    if (!uniqId || !email || !deKey || !username) return res.status(400).json({ error: 'Missing fields' });

    // 1) call SDK to verify & produce proof (also checks chain rootToId) — prefer verifier, else quickCheck
    let rawResult;
    try {
      if (typeof verifier === 'function') {
        rawResult = await verifier(email, deKey);
      } else if (typeof quickCheck === 'function') {
        rawResult = await quickCheck(email, deKey);
      } else {
        throw new Error('No verifier function available');
      }
    } catch (err) {
      console.error('SDK verification failed:', err && (err.message || err));
      // If the SDK threw an error that includes human-friendly reason, return that
      const msg = err && (err.message || err.toString()) ? (err.message || err.toString()) : 'Verification failed';
      return res.status(400).json({ error: msg });
    }

    const normalized = normalizeVerifierResult(rawResult);

    // If normalization could not find uniqId/uniqIdString, but SDK result might include direct numeric id
    if ((!normalized || (!normalized.uniqId && !normalized.uniqIdString))) {
      // As a last attempt, try to interpret root->id from rawResult.raw if present
      console.warn('SDK returned result but no uniqId detected. SDK raw result:', rawResult);
      return res.status(500).json({ error: 'Verification did not return uniqId' });
    }

    // serverUniqString computed from normalized result
    const serverUniqString = normalized.uniqIdString || (normalized.uniqId ? `UNIQ-${String(normalized.uniqId).padStart(6, '0')}` : null);

    if (!serverUniqString) {
      return res.status(500).json({ error: 'Could not determine server-side UNIQ string from verification result' });
    }

    // 2) ensure client-sent uniqId matches server verified uniqIdString
    // Client may send either the numeric "7" or "UNIQ-000007" — tolerate both forms
    const clientSent = String(uniqId).trim();
    const clientNormalized = (m => {
      const mm = String(m || '').trim();
      const mmMatch = mm.match(/^UNIQ-(\d+)$/);
      if (mmMatch) return `UNIQ-${String(mmMatch[1]).padStart(6, '0')}`;
      if (/^\d+$/.test(mm)) return `UNIQ-${String(Number(mm)).padStart(6, '0')}`;
      return mm;
    })(clientSent);

    if (clientNormalized !== serverUniqString) {
      return res.status(400).json({ error: 'UNIQ ID mismatch', server: serverUniqString, client: clientNormalized });
    }

    // 3) store only { uniqId, username, createdAt } in uniqid_users.json
    try {
      if (findUniqById(serverUniqString)) {
        return res.status(400).json({ error: 'UNIQ ID already registered on this site' });
      }
      const saved = addUniqUser({ uniqId: serverUniqString, username });
      // create a session for this UNIQ user (store in session)
      req.session.uniqUser = { uniqId: saved.uniqId, username: saved.username };
      return res.json({ success: true, uniqId: saved.uniqId, username: saved.username });
    } catch (e) {
      console.error('Saving UNIQ user failed:', e);
      if (e.message === 'UniqExists') return res.status(400).json({ error: 'UNIQ ID already registered' });
      return res.status(500).json({ error: 'Failed to register UNIQ user' });
    }
  } catch (err) {
    console.error('UNIQ signup error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// UNIQ Login (verify via SDK, ensure uniqId exists in uniqid_users.json, create session)
app.post('/api/uniq/login', async (req, res) => {
  try {
    if (!sdkLoaded || !sdkModule) {
      return res.status(500).json({ error: 'UNIQ SDK not loaded on server' });
    }

    const verifierCandidates = [
      'verifyAndProve',
      'verifyAndProveAsync',
      'verify',
      'verifyProcess',
      'verify_process'
    ];
    const quickCandidates = [
      'onlyCheckOnChain',
      'only_check_on_chain',
      'checkRootOnChain',
      'checkOnChain',
      'checkkOnChain',
      'checkRoot'
    ];

    const verifier = pickSdkFunction(sdkModule, verifierCandidates);
    const quickCheck = pickSdkFunction(sdkModule, quickCandidates);

    if (!verifier && !quickCheck) {
      return res.status(500).json({ error: 'UNIQ SDK loaded but verification functions missing' });
    }

    const { uniqId, email, deKey } = req.body;
    if (!uniqId || !email || !deKey) return res.status(400).json({ error: 'Missing fields' });

    // ensure uniqId exists in our site DB
    const found = findUniqById(String(uniqId).startsWith('UNIQ-') ? uniqId : (String(uniqId).match(/^\d+$/) ? `UNIQ-${String(Number(uniqId)).padStart(6,'0')}` : uniqId));
    if (!found) return res.status(404).json({ error: 'UNIQ ID not registered on this site. Please sign up first.' });

    // verify proof & chain via SDK
    let rawResult;
    try {
      if (typeof verifier === 'function') {
        rawResult = await verifier(email, deKey);
      } else if (typeof quickCheck === 'function') {
        rawResult = await quickCheck(email, deKey);
      } else {
        throw new Error('No verifier function available');
      }
    } catch (err) {
      console.error('SDK verification failed:', err && (err.message || err));
      const msg = err && (err.message || err.toString()) ? (err.message || err.toString()) : 'Verification failed';
      return res.status(400).json({ error: msg });
    }

    const normalized = normalizeVerifierResult(rawResult);
    if ((!normalized || (!normalized.uniqId && !normalized.uniqIdString))) {
      console.warn('SDK returned result but no uniqId detected for login. SDK raw result:', rawResult);
      return res.status(500).json({ error: 'Verification did not return uniqId' });
    }

    const serverUniqString = normalized.uniqIdString || (normalized.uniqId ? `UNIQ-${String(normalized.uniqId).padStart(6, '0')}` : null);

    // compare with client sent uniqId (tolerate numeric or UNIQ- format)
    const clientNormalized = (m => {
      const mm = String(m || '').trim();
      const mmMatch = mm.match(/^UNIQ-(\d+)$/);
      if (mmMatch) return `UNIQ-${String(mmMatch[1]).padStart(6, '0')}`;
      if (/^\d+$/.test(mm)) return `UNIQ-${String(Number(mm)).padStart(6, '0')}`;
      return mm;
    })(uniqId);

    if (clientNormalized !== serverUniqString) {
      return res.status(400).json({ error: 'Verification mismatch', server: serverUniqString, client: clientNormalized });
    }

    // success — set session
    req.session.uniqUser = { uniqId: found.uniqId, username: found.username };
    return res.json({ success: true, uniqId: found.uniqId, username: found.username });
  } catch (err) {
    console.error('UNIQ login error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

// ========== rest of your routes ==========

// dashboard - Google users only
app.get('/dashboard', (req, res) => {
  if (req.user) {
    return res.render('dashboard', { user: req.user });
  }
  // If an UNIQ user tries /dashboard, redirect them to the UNIQ dashboard
  if (req.session && req.session.uniqUser) {
    return res.redirect('/uniq-dashboard');
  }
  return res.redirect('/login');
});

// UNIQ dashboard (separate view)
app.get('/uniq-dashboard', (req, res) => {
  if (!req.session || !req.session.uniqUser) {
    return res.redirect('/uniq');
  }

  // Find createdAt in uniq DB if possible
  const stored = findUniqById(req.session.uniqUser.uniqId);
  const user = {
    username: req.session.uniqUser.username,
    uniqId: req.session.uniqUser.uniqId,
    createdAt: stored ? stored.createdAt : null
  };

  return res.render('uniq-dashboard', { user });
});

// delete account (unified): deletes passport user OR uniq user depending on session
app.post('/delete', (req, res) => {
  // Passport user deletion (by email)
  if (req.user && req.user.email) {
    const removed = deleteUserByEmail(req.user.email);
    if (removed === -1) {
      console.error('Failed to remove user from JSON DB');
      return res.status(500).send('Delete error');
    }
    console.log('Deleted passport user rows:', removed, 'email:', req.user.email);
    req.logout((err) => {
      if (err) console.error('Logout error after delete:', err);
      // redirect to public index for both flows per your request
      req.session.destroy(() => res.redirect('/index.html'));
    });
    return;
  }

  // UNIQ user deletion
  if (req.session && req.session.uniqUser) {
    const uniqId = req.session.uniqUser.uniqId;
    const removed = deleteUniqById(uniqId);
    if (removed === -1) {
      console.error('Failed to remove UNIQ user from uniq DB');
      return res.status(500).send('Delete error');
    }
    console.log('Deleted UNIQ user rows:', removed, 'uniqId:', uniqId);
    // destroy uniq session and redirect to public index
    delete req.session.uniqUser;
    req.session.destroy(() => res.redirect('/index.html'));
    return;
  }

  // nothing to delete
  return res.status(401).send('Not logged in');
});

// logout
app.get('/logout', (req, res) => {
  // clear passport session or uniq session
  if (req.user) {
    req.logout((err) => {
      if (err) console.error('Logout error:', err);
      // Google users go back to Google login page
      req.session.destroy(() => res.redirect('/login'));
    });
    return;
  }
  if (req.session && req.session.uniqUser) {
    // UNIQ user -> go back to the UNIQ login/signup page
    delete req.session.uniqUser;
    req.session.destroy(() => res.redirect('/uniq'));
    return;
  }
  res.redirect('/login');
});

// small API for client (checks both passport and uniq)
app.get('/api/user', (req, res) => {
  if (req.user) {
    const { email, username } = req.user;
    return res.json({ loggedIn: true, type: 'google', email, username });
  }
  if (req.session && req.session.uniqUser) {
    return res.json({ loggedIn: true, type: 'uniq', uniqId: req.session.uniqUser.uniqId, username: req.session.uniqUser.username });
  }
  return res.json({ loggedIn: false });
});

// generic error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Server error');
});

// start
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
