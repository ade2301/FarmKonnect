(function () {
    'use strict';

    const STORAGE_KEYS = {
        database: 'farmkonnect_db_v1',
        localSession: 'farmkonnect_session_v1',
        sessionSession: 'farmkonnect_session_temp_v1',
        loginAttempts: 'farmkonnect_login_attempts_v1'
    };

    const AUTH_POLICY = {
        minPasswordLength: 8,
        maxPasswordLength: 128,
        maxNameLength: 100,
        maxFarmTypeLength: 80,
        maxPhoneLength: 20,
        maxBankNameLength: 80,
        maxAccountNameLength: 100,
        accountNumberLength: 10,
        lockAfterFailures: 5,
        failureWindowMs: 10 * 60 * 1000,
        lockDurationMs: 15 * 60 * 1000,
        normalSessionMs: 12 * 60 * 60 * 1000,
        rememberSessionMs: 30 * 24 * 60 * 60 * 1000,
        pbkdf2Iterations: 120000
    };

    function isStorageAvailable(storage) {
        try {
            const key = '__fk_test__';
            storage.setItem(key, '1');
            storage.removeItem(key);
            return true;
        } catch (error) {
            return false;
        }
    }

    function getStorage(kind) {
        if (kind === 'session' && isStorageAvailable(window.sessionStorage)) {
            return window.sessionStorage;
        }

        if (isStorageAvailable(window.localStorage)) {
            return window.localStorage;
        }

        throw new Error('Browser storage is unavailable. Please enable storage and try again.');
    }

    function safeJsonParse(value, fallbackValue) {
        if (!value) {
            return fallbackValue;
        }

        try {
            return JSON.parse(value);
        } catch (error) {
            return fallbackValue;
        }
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function toBase64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function fromBase64(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function randomId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }

        const values = new Uint8Array(16);
        window.crypto.getRandomValues(values);
        return Array.from(values, function (value) {
            return value.toString(16).padStart(2, '0');
        }).join('');
    }

    function sanitizeText(value, maxLength) {
        return String(value || '')
            .trim()
            .replace(/[<>"'`]/g, '')
            .slice(0, maxLength);
    }

    function normalizeEmail(email) {
        return String(email || '').trim().toLowerCase();
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function assertCryptoSupport() {
        if (!window.crypto || !window.crypto.subtle || !window.crypto.getRandomValues) {
            throw new Error('This browser does not support secure authentication features.');
        }
    }

    async function derivePasswordHash(password, saltBase64) {
        assertCryptoSupport();

        const encoder = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits']
        );

        const bits = await window.crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                hash: 'SHA-256',
                salt: fromBase64(saltBase64),
                iterations: AUTH_POLICY.pbkdf2Iterations
            },
            keyMaterial,
            256
        );

        return toBase64(new Uint8Array(bits));
    }

    function secureCompare(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') {
            return false;
        }

        const maxLength = Math.max(a.length, b.length);
        let mismatch = a.length === b.length ? 0 : 1;

        for (let i = 0; i < maxLength; i += 1) {
            const codeA = i < a.length ? a.charCodeAt(i) : 0;
            const codeB = i < b.length ? b.charCodeAt(i) : 0;
            mismatch |= codeA ^ codeB;
        }

        return mismatch === 0;
    }

    function getDatabase() {
        const storage = getStorage('local');
        const fallback = {
            version: 1,
            users: [],
            auditLog: [],
            updatedAt: nowIso()
        };

        const db = safeJsonParse(storage.getItem(STORAGE_KEYS.database), fallback);

        if (!db || !Array.isArray(db.users) || !Array.isArray(db.auditLog)) {
            storage.setItem(STORAGE_KEYS.database, JSON.stringify(fallback));
            return fallback;
        }

        return db;
    }

    function saveDatabase(db) {
        db.updatedAt = nowIso();
        getStorage('local').setItem(STORAGE_KEYS.database, JSON.stringify(db));
    }

    function pushAuditLog(db, eventType, details) {
        db.auditLog.push({
            id: randomId(),
            type: eventType,
            details: details,
            at: nowIso()
        });

        if (db.auditLog.length > 200) {
            db.auditLog = db.auditLog.slice(-200);
        }
    }

    function getAttemptsTable() {
        return safeJsonParse(getStorage('local').getItem(STORAGE_KEYS.loginAttempts), {});
    }

    function saveAttemptsTable(table) {
        getStorage('local').setItem(STORAGE_KEYS.loginAttempts, JSON.stringify(table));
    }

    function attemptKey(role, email) {
        return role + ':' + email;
    }

    function getAttemptState(role, email) {
        const table = getAttemptsTable();
        const state = table[attemptKey(role, email)];
        if (!state) {
            return null;
        }

        if (state.lockedUntil && Date.now() > state.lockedUntil) {
            delete table[attemptKey(role, email)];
            saveAttemptsTable(table);
            return null;
        }

        return state;
    }

    function registerFailedAttempt(role, email) {
        const key = attemptKey(role, email);
        const table = getAttemptsTable();
        const now = Date.now();

        const state = table[key] || {
            failures: 0,
            firstFailureAt: now,
            lockedUntil: 0
        };

        if (now - state.firstFailureAt > AUTH_POLICY.failureWindowMs) {
            state.failures = 0;
            state.firstFailureAt = now;
        }

        state.failures += 1;

        if (state.failures >= AUTH_POLICY.lockAfterFailures) {
            state.lockedUntil = now + AUTH_POLICY.lockDurationMs;
            state.failures = 0;
            state.firstFailureAt = now;
        }

        table[key] = state;
        saveAttemptsTable(table);
        return state;
    }

    function clearAttemptState(role, email) {
        const key = attemptKey(role, email);
        const table = getAttemptsTable();
        if (table[key]) {
            delete table[key];
            saveAttemptsTable(table);
        }
    }

    function validatePassword(password) {
        const value = String(password || '');
        if (value.length < AUTH_POLICY.minPasswordLength) {
            throw new Error('Password must be at least 8 characters long.');
        }

        if (value.length > AUTH_POLICY.maxPasswordLength) {
            throw new Error('Password is too long.');
        }

        if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value)) {
            throw new Error('Password must include uppercase, lowercase, and a number.');
        }
    }

    function getPublicUser(user) {
        return {
            id: user.id,
            role: user.role,
            fullName: user.fullName,
            farmType: user.farmType,
            email: user.email,
            createdAt: user.createdAt
        };
    }

    async function createUser(options) {
        const role = options.role === 'farmer' ? 'farmer' : 'consumer';
        const fullName = sanitizeText(options.fullName, AUTH_POLICY.maxNameLength);
        const farmType = sanitizeText(options.farmType, AUTH_POLICY.maxFarmTypeLength);
        const phone = sanitizeText(options.phone, AUTH_POLICY.maxPhoneLength);
        const bankName = sanitizeText(options.bankName, AUTH_POLICY.maxBankNameLength);
        const accountName = sanitizeText(options.accountName, AUTH_POLICY.maxAccountNameLength);
        const accountNumber = String(options.accountNumber || '').replace(/\D/g, '').slice(0, AUTH_POLICY.accountNumberLength);
        const email = normalizeEmail(options.email);
        const password = String(options.password || '');

        if (!fullName || fullName.length < 2) {
            throw new Error('Please enter your full name.');
        }

        if (!isValidEmail(email)) {
            throw new Error('Please provide a valid email address.');
        }

        validatePassword(password);

        if (role === 'consumer' && options.acceptTerms !== true) {
            throw new Error('You must accept the terms and conditions.');
        }

        const db = getDatabase();
        const exists = db.users.some(function (user) {
            return user.email === email && user.role === role;
        });

        if (exists) {
            throw new Error('An account already exists for this email and portal.');
        }

        const salt = new Uint8Array(16);
        window.crypto.getRandomValues(salt);

        const saltBase64 = toBase64(salt);
        const hashBase64 = await derivePasswordHash(password, saltBase64);

        const user = {
            id: randomId(),
            role: role,
            fullName: fullName,
            farmType: role === 'farmer' ? farmType : '',
            phone: role === 'farmer' ? phone : '',
            payout: role === 'farmer' ? { bankName: bankName, accountName: accountName, accountNumber: accountNumber } : null,
            verificationStatus: role === 'farmer' ? 'pending' : 'not_required',
            email: email,
            passwordHash: hashBase64,
            passwordSalt: saltBase64,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            status: 'active'
        };

        db.users.push(user);
        pushAuditLog(db, 'USER_CREATED', { role: role, email: email });
        saveDatabase(db);

        return getPublicUser(user);
    }

    function completeFarmerVerification(session, options) {
        if (!session || session.role !== 'farmer') {
            throw new Error('Only farmer accounts can complete verification.');
        }

        const phone = sanitizeText(options.phone, AUTH_POLICY.maxPhoneLength);
        const bankName = sanitizeText(options.bankName, AUTH_POLICY.maxBankNameLength);
        const accountName = sanitizeText(options.accountName, AUTH_POLICY.maxAccountNameLength);
        const accountNumber = String(options.accountNumber || '').replace(/\D/g, '').slice(0, AUTH_POLICY.accountNumberLength);

        if (!phone || !bankName || !accountName || accountNumber.length !== AUTH_POLICY.accountNumberLength) {
            throw new Error('Provide a phone number and valid 10-digit bank payout details.');
        }

        const db = getDatabase();
        const user = db.users.find(function (entry) {
            return entry.id === session.userId && entry.role === 'farmer';
        });

        if (!user) {
            throw new Error('Farmer account could not be found.');
        }

        user.phone = phone;
        user.payout = { bankName: bankName, accountName: accountName, accountNumber: accountNumber };
        user.verificationStatus = 'submitted';
        user.updatedAt = nowIso();
        pushAuditLog(db, 'FARMER_VERIFICATION_SUBMITTED', { userId: user.id });
        saveDatabase(db);
        return getPublicUser(user);
    }

    function getCurrentUserProfile() {
        const session = getCurrentSession();
        if (!session) return null;
        const db = getDatabase();
        const user = db.users.find(function (entry) { return entry.id === session.userId; });
        if (!user) return null;
        return {
            id: user.id,
            role: user.role,
            fullName: user.fullName,
            phone: user.phone || '',
            payout: user.payout || null,
            verificationStatus: user.verificationStatus || 'pending'
        };
    }

    function getFarmerPayoutProfiles() {
        const db = getDatabase();
        return db.users.filter(function (user) {
            return user.role === 'farmer' && user.payout;
        }).map(function (user) {
            return {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                phone: user.phone || '',
                payout: user.payout,
                verificationStatus: user.verificationStatus || 'pending',
                createdAt: user.createdAt
            };
        });
    }

    function clearSession() {
        getStorage('local').removeItem(STORAGE_KEYS.localSession);
        try {
            getStorage('session').removeItem(STORAGE_KEYS.sessionSession);
        } catch (error) {
            // Ignore sessionStorage access errors and continue clearing local session.
        }
    }

    function writeSession(session, rememberMe) {
        clearSession();

        if (rememberMe) {
            getStorage('local').setItem(STORAGE_KEYS.localSession, JSON.stringify(session));
            return;
        }

        getStorage('session').setItem(STORAGE_KEYS.sessionSession, JSON.stringify(session));
    }

    function readSession() {
        const sessionStore = isStorageAvailable(window.sessionStorage) ? window.sessionStorage : null;
        const localStore = isStorageAvailable(window.localStorage) ? window.localStorage : null;

        const sessionData = sessionStore ? safeJsonParse(sessionStore.getItem(STORAGE_KEYS.sessionSession), null) : null;
        const localData = localStore ? safeJsonParse(localStore.getItem(STORAGE_KEYS.localSession), null) : null;

        return sessionData || localData;
    }

    function getCurrentSession() {
        const session = readSession();
        if (!session) {
            return null;
        }

        if (!session.expiresAt || Date.now() > session.expiresAt) {
            clearSession();
            return null;
        }

        return session;      
    }

    async function authenticateUser(options) {
        const role = options.role === 'farmer' ? 'farmer' : 'consumer';
        const email = normalizeEmail(options.email);
        const password = String(options.password || '');

        if (!isValidEmail(email) || !password) {
            throw new Error('Invalid email or password.');
        }

        const lockState = getAttemptState(role, email);
        if (lockState && lockState.lockedUntil && Date.now() < lockState.lockedUntil) {
            const minutes = Math.ceil((lockState.lockedUntil - Date.now()) / 60000);
            throw new Error('Too many attempts. Try again in ' + minutes + ' minute(s).');
        }

        const db = getDatabase();
        const user = db.users.find(function (entry) {
            return entry.email === email && entry.role === role && entry.status === 'active';
        });

        if (!user) {
            registerFailedAttempt(role, email);
            throw new Error('Invalid email or password.');
        }

        const computedHash = await derivePasswordHash(password, user.passwordSalt);
        if (!secureCompare(computedHash, user.passwordHash)) {
            registerFailedAttempt(role, email);
            throw new Error('Invalid email or password.');
        }

        clearAttemptState(role, email);

        const now = Date.now();
        const session = {
            sessionId: randomId(),
            userId: user.id,
            role: user.role,
            fullName: user.fullName,
            email: user.email,
            issuedAt: now,
            expiresAt: now + (options.rememberMe ? AUTH_POLICY.rememberSessionMs : AUTH_POLICY.normalSessionMs)
        };

        writeSession(session, Boolean(options.rememberMe));
        pushAuditLog(db, 'USER_LOGGED_IN', { role: user.role, email: user.email });
        saveDatabase(db);

        return session;
    }

    function signOut() {
        const session = getCurrentSession();
        if (session) {
            const db = getDatabase();
            pushAuditLog(db, 'USER_LOGGED_OUT', { role: session.role, email: session.email });
            saveDatabase(db);
        }

        clearSession();
    }

    function setAlert(element, type, message) {
        if (!element) {
            return;
        }

        element.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-warning');
        element.classList.add('alert', 'alert-' + type);
        element.textContent = message;
    }

    function clearAlert(element) {
        if (!element) {
            return;
        }

        element.classList.add('d-none');
        element.classList.remove('alert-success', 'alert-danger', 'alert-warning');
        element.textContent = '';
    }

    function withSubmitState(form, button, isSubmitting) {
        if (!form || !button) {
            return;
        }

        if (isSubmitting) {
            button.dataset.originalText = button.textContent;
            button.disabled = true;
            button.textContent = 'Please wait...';
        } else {
            button.disabled = false;
            button.textContent = button.dataset.originalText || button.textContent;
        }
    }

    function attachSignupForm(config) {
        const form = document.getElementById(config.formId);
        if (!form) {
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        const alertElement = document.getElementById(config.alertId);

        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            clearAlert(alertElement);

            try {
                withSubmitState(form, submitButton, true);

                await createUser({
                    role: config.role,
                    fullName: document.getElementById(config.nameId).value,
                    farmType: config.farmTypeId ? document.getElementById(config.farmTypeId).value : '',
                    phone: config.phoneId ? document.getElementById(config.phoneId).value : '',
                    bankName: config.bankNameId ? document.getElementById(config.bankNameId).value : '',
                    accountName: config.accountNameId ? document.getElementById(config.accountNameId).value : '',
                    accountNumber: config.accountNumberId ? document.getElementById(config.accountNumberId).value : '',
                    email: document.getElementById(config.emailId).value,
                    password: document.getElementById(config.passwordId).value,
                    acceptTerms: config.termsId ? document.getElementById(config.termsId).checked : true
                });

                setAlert(alertElement, 'success', 'Account created successfully. Redirecting to login...');
                form.reset();

                window.setTimeout(function () {
                    window.location.href = 'login.html';
                }, 900);
            } catch (error) {
                setAlert(alertElement, 'danger', error && error.message ? error.message : 'Signup failed. Please try again.');
            } finally {
                withSubmitState(form, submitButton, false);
            }
        });
    }

    function attachLoginForm(config) {
        const form = document.getElementById(config.formId);
        if (!form) {
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        const alertElement = document.getElementById(config.alertId);

        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            clearAlert(alertElement);

            try {
                withSubmitState(form, submitButton, true);

                await authenticateUser({
                    role: config.role,
                    email: document.getElementById(config.emailId).value,
                    password: document.getElementById(config.passwordId).value,
                    rememberMe: document.getElementById(config.rememberId).checked
                });

                setAlert(alertElement, 'success', 'Login successful. Continuing...');
                window.setTimeout(function () {
                    const pendingAction = window.localStorage.getItem('farmkonnect_pending_marketplace_action');
                    if (config.role === 'consumer' && pendingAction) {
                        try {
                            window.location.href = 'dashboard.html';
                            return;
                        } catch (error) {
                            window.localStorage.removeItem('farmkonnect_pending_marketplace_action');
                        }
                    }

                    window.location.href = 'dashboard.html';
                }, 700);
            } catch (error) {
                setAlert(alertElement, 'danger', error && error.message ? error.message : 'Login failed. Please try again.');
            } finally {
                withSubmitState(form, submitButton, false);
            }
        });
    }

    function enforceDashboardAuth() {
        const body = document.body;
        if (!body || body.dataset.page !== 'dashboard') {
            return;
        }

        const session = getCurrentSession();
        if (!session) {
            window.location.href = 'login.html';
            return;
        }

        const userNameElement = document.getElementById('dashboardUserName');
        const userRoleElement = document.getElementById('dashboardUserRole');
        const userEmailElement = document.getElementById('dashboardUserEmail');

        if (userNameElement) {
            userNameElement.textContent = session.fullName;
        }

        if (userRoleElement) {
            userRoleElement.textContent = session.role.charAt(0).toUpperCase() + session.role.slice(1);
        }

        if (userEmailElement) {
            userEmailElement.textContent = session.email;
        }

        document.querySelectorAll('[data-action="logout"]').forEach(function (button) {
            button.addEventListener('click', function () {
                signOut();
                window.location.href = 'login.html';
            });
        });
    }

    function bootstrapAuthPages() {
        getDatabase();

        const page = document.body ? document.body.dataset.page : '';

        if (page === 'signup') {
            attachSignupForm({
                role: 'farmer',
                formId: 'farmerSignupForm',
                alertId: 'farmerSignupFeedback',
                nameId: 'fName',
                farmTypeId: 'fType',
                emailId: 'fEmail',
                passwordId: 'fPass'
            });

            attachSignupForm({
                role: 'consumer',
                formId: 'consumerSignupForm',
                alertId: 'consumerSignupFeedback',
                nameId: 'cName',
                emailId: 'cEmail',
                passwordId: 'cPass',
                termsId: 'cAgree'
            });
        }

        if (page === 'login') {
            const session = getCurrentSession();
            if (session) {
                window.location.href = 'dashboard.html';
                return;
            }

            attachLoginForm({
                role: 'farmer',
                formId: 'farmerLoginForm',
                alertId: 'farmerLoginFeedback',
                emailId: 'lfEmail',
                passwordId: 'lfPass',
                rememberId: 'lfRemember'
            });

            attachLoginForm({
                role: 'consumer',
                formId: 'consumerLoginForm',
                alertId: 'consumerLoginFeedback',
                emailId: 'lcEmail',
                passwordId: 'lcPass',
                rememberId: 'lcRemember'
            });
        }

        enforceDashboardAuth();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapAuthPages);
    } else {
        bootstrapAuthPages();
    }

    window.FarmKonnectAuth = {
        getCurrentSession: getCurrentSession,
        signOut: signOut,
        completeFarmerVerification: completeFarmerVerification,
        getCurrentUserProfile: getCurrentUserProfile,
        getFarmerPayoutProfiles: getFarmerPayoutProfiles,
        resetLocalDatabase: function () {
            getStorage('local').removeItem(STORAGE_KEYS.database);
            getStorage('local').removeItem(STORAGE_KEYS.loginAttempts);
            clearSession();
        },
        getDatabaseSnapshot: function () {
            const db = getDatabase();
            return {
                users: db.users.map(getPublicUser),
                auditLogCount: db.auditLog.length,
                updatedAt: db.updatedAt
            };
        }
    };
})();
