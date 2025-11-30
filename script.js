// ===== ENTERPRISE CONFIGURATION =====
const CONFIG = {
    SECURITY: {
        PBKDF2_ITERATIONS: 310000,
        SALT_LENGTH: 32,
        IV_LENGTH: 16,
        AES_KEY_LENGTH: 256,
        HMAC_KEY_LENGTH: 256,
        HMAC_LENGTH: 32,
        MIN_PASSWORD_LENGTH: 12,
        MAX_CRYPTO_RETRIES: 3,
        MEMORY_CLEANUP_DELAY: 5000,
        MAX_DECRYPT_ATTEMPTS: 5,
        LOCKOUT_DURATION: 300000,
        INACTIVITY_TIMEOUT: 300000,
        DECRYPT_ATTEMPTS_KEY: 'decrypt_attempts',
        LAST_ATTEMPT_KEY: 'last_attempt_time',
        SECURITY_LOG_KEY: 'security_logs'
    },
    BIP39: {
        WORDLIST_URL: 'https://raw.githubusercontent.com/bitcoin/bips/master/bip-0039/english.txt',
        CACHE_KEY: 'bip39-wordlist',
        CACHE_DURATION: 24 * 60 * 60 * 1000
    }
};

// ===== ENTERPRISE APPLICATION =====
class MnemoniQR {
    constructor() {
        this.encryptedData = null;
        this.bip39Wordlist = null;
        this.sensitiveBuffers = new Set();
        this.inactivityTimer = null;
        this.decryptAttempts = 0;
        this.lastAttemptTime = 0;
        
        this.state = {
            isSeedVisible: false,
            isPasswordVisible: false,
            scannerActive: false,
            videoStream: null,
            currentInputWord: '',
            currentStep: 1
        };
        
        this.init();
    }

    async init() {
        console.log('Initializing MnemoniQR Enterprise...');
        await this.loadBIP39Wordlist();
        this.setupEventListeners();
        this.registerServiceWorker();
        this.setupSecurityMonitoring();
        this.updateSecurityStatus();
        this.checkEnvironmentSecurity();
        this.showToast('MnemoniQR Enterprise v3.0.1 loaded successfully', 'success');
    }

    // ===== SECURITY UTILITIES =====
    sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input.trim()
            .replace(/[<>]/g, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+=/gi, '');
    }

    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ===== MODALES DE SEGURIDAD =====
    showEnterpriseSecurityModal() {
        const hasSeenEnterprise = localStorage.getItem('hasSeenEnterpriseSecurity');
        if (!hasSeenEnterprise) {
            setTimeout(() => {
                this.showModal('enterprise-security-modal');
            }, 1000);
        }
    }

    hideEnterpriseSecurityModal() {
        this.hideModal('enterprise-security-modal');
        localStorage.setItem('hasSeenEnterpriseSecurity', 'true');
    }

    showSecurityDetailsModal() {
        this.showModal('security-details-modal');
    }

    hideSecurityDetailsModal() {
        this.hideModal('security-details-modal');
    }

    // ===== ENTERPRISE SECURITY MONITORING =====
    setupSecurityMonitoring() {
        this.setupInactivityTimer();
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.logSecurityEvent('page_hidden');
                this.startInactivityTimer();
            } else {
                this.logSecurityEvent('page_visible');
                this.clearInactivityTimer();
            }
        });

        this.loadDecryptAttempts();
    }

    setupInactivityTimer() {
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        events.forEach(event => {
            document.addEventListener(event, () => this.resetInactivityTimer(), { passive: true });
        });
        this.resetInactivityTimer();
    }

    resetInactivityTimer() {
        this.clearInactivityTimer();
        this.inactivityTimer = setTimeout(() => {
            this.handleInactivity();
        }, CONFIG.SECURITY.INACTIVITY_TIMEOUT);
        this.updateInactivityDisplay();
    }

    clearInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
    }

    startInactivityTimer() {
        this.resetInactivityTimer();
    }

    handleInactivity() {
        this.logSecurityEvent('inactivity_timeout');
        this.cleanupSensitiveData();
        this.showToast('Automatic security lock activated', 'warning');
        this.updateSecurityStatus();
    }

    updateInactivityDisplay() {
        const timerElement = this.get('inactivity-timer');
        if (timerElement) {
            const minutes = Math.floor(CONFIG.SECURITY.INACTIVITY_TIMEOUT / 60000);
            const seconds = (CONFIG.SECURITY.INACTIVITY_TIMEOUT % 60000) / 1000;
            timerElement.textContent = `Auto-lock: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    // ===== BRUTE-FORCE PROTECTION =====
    loadDecryptAttempts() {
        try {
            const attempts = localStorage.getItem(CONFIG.SECURITY.DECRYPT_ATTEMPTS_KEY);
            const lastAttempt = localStorage.getItem(CONFIG.SECURITY.LAST_ATTEMPT_KEY);
            
            this.decryptAttempts = attempts ? parseInt(attempts) : 0;
            this.lastAttemptTime = lastAttempt ? parseInt(lastAttempt) : 0;
            
            this.updateAttemptsWarning();
        } catch (error) {
            console.warn('Failed to load decrypt attempts:', error);
            this.decryptAttempts = 0;
            this.lastAttemptTime = 0;
        }
    }

    saveDecryptAttempts() {
        try {
            localStorage.setItem(CONFIG.SECURITY.DECRYPT_ATTEMPTS_KEY, this.decryptAttempts.toString());
            localStorage.setItem(CONFIG.SECURITY.LAST_ATTEMPT_KEY, this.lastAttemptTime.toString());
        } catch (error) {
            console.warn('Failed to save decrypt attempts:', error);
        }
    }

    incrementDecryptAttempts() {
        this.decryptAttempts++;
        this.lastAttemptTime = Date.now();
        this.saveDecryptAttempts();
        this.updateAttemptsWarning();
        this.logSecurityEvent('decrypt_attempt_incremented', { attempts: this.decryptAttempts });
    }

    resetDecryptAttempts() {
        this.decryptAttempts = 0;
        this.lastAttemptTime = 0;
        this.saveDecryptAttempts();
        this.updateAttemptsWarning();
        this.logSecurityEvent('decrypt_attempts_reset');
    }

    isAccountLocked() {
        if (this.decryptAttempts < CONFIG.SECURITY.MAX_DECRYPT_ATTEMPTS) {
            return false;
        }
        
        const timeSinceLastAttempt = Date.now() - this.lastAttemptTime;
        return timeSinceLastAttempt < CONFIG.SECURITY.LOCKOUT_DURATION;
    }

    getRemainingLockoutTime() {
        const timeSinceLastAttempt = Date.now() - this.lastAttemptTime;
        const remainingTime = CONFIG.SECURITY.LOCKOUT_DURATION - timeSinceLastAttempt;
        return Math.max(0, remainingTime);
    }

    updateAttemptsWarning() {
        const warningElement = this.get('attempts-warning');
        const messageElement = this.get('attempts-message');
        const decryptButton = this.get('confirm-decrypt');
        
        if (!warningElement || !messageElement || !decryptButton) return;

        if (this.isAccountLocked()) {
            const remainingMinutes = Math.ceil(this.getRemainingLockoutTime() / 60000);
            warningElement.style.display = 'flex';
            messageElement.textContent = `Too many failed attempts. Try again in ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}.`;
            decryptButton.disabled = true;
        } else if (this.decryptAttempts > 0) {
            const remainingAttempts = CONFIG.SECURITY.MAX_DECRYPT_ATTEMPTS - this.decryptAttempts;
            warningElement.style.display = 'flex';
            messageElement.textContent = `${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining`;
            decryptButton.disabled = false;
        } else {
            warningElement.style.display = 'none';
            decryptButton.disabled = false;
        }
    }

    // ===== ENVIRONMENT SECURITY CHECKS =====
    checkEnvironmentSecurity() {
        const warnings = [];
        const statusElement = this.get('environment-status');

        if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            warnings.push('Not using HTTPS');
        }

        if (!window.isSecureContext) {
            warnings.push('Not in secure context');
        }

        if (!crypto.subtle) {
            warnings.push('Web Crypto API not available');
        }

        if (statusElement) {
            if (warnings.length > 0) {
                statusElement.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: var(--warning);"></i>';
                statusElement.title = `Security Warnings: ${warnings.join(', ')}`;
            } else {
                statusElement.innerHTML = '<i class="fas fa-shield-check" style="color: var(--success);"></i>';
                statusElement.title = 'Security Environment: Secure';
            }
        }

        if (warnings.length > 0) {
            this.logSecurityEvent('environment_warnings', { warnings });
        }
    }

    // ===== SECURITY LOGGING =====
    logSecurityEvent(eventType, data = {}) {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                event: eventType,
                userAgent: navigator.userAgent ? this.sanitizeInput(navigator.userAgent) : 'unknown',
                url: location.href ? this.sanitizeInput(location.href) : 'unknown',
                ...data
            };
            
            const logs = JSON.parse(localStorage.getItem(CONFIG.SECURITY.SECURITY_LOG_KEY) || '[]');
            logs.push(logEntry);
            if (logs.length > 50) {
                logs.splice(0, logs.length - 50);
            }
            localStorage.setItem(CONFIG.SECURITY.SECURITY_LOG_KEY, JSON.stringify(logs));
        } catch (error) {
            console.warn('Failed to log security event:', error);
        }
    }

    // ===== SERVICE WORKER REGISTRATION =====
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered:', registration);
                
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            this.showToast('New version available! Refresh to update.', 'info');
                        }
                    });
                });
            } catch (error) {
                console.warn('Service Worker registration failed:', error);
                this.logSecurityEvent('service_worker_failed', { error: error.message });
            }
        }
    }

    // ===== BIP39 WORDLIST =====
    async loadBIP39Wordlist() {
        try {
            const cached = localStorage.getItem(CONFIG.BIP39.CACHE_KEY);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < CONFIG.BIP39.CACHE_DURATION) {
                    this.bip39Wordlist = data;
                    console.log('BIP39 wordlist loaded from cache');
                    return;
                }
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            try {
                const response = await fetch(CONFIG.BIP39.WORDLIST_URL, {
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) throw new Error('Failed to fetch BIP39 wordlist');
                
                const text = await response.text();
                this.bip39Wordlist = text.split('\n')
                    .map(word => word.trim())
                    .filter(word => word);

                localStorage.setItem(CONFIG.BIP39.CACHE_KEY, JSON.stringify({
                    data: this.bip39Wordlist,
                    timestamp: Date.now()
                }));

                console.log('BIP39 wordlist loaded from network');
                
            } catch (fetchError) {
                console.warn('Using embedded BIP39 wordlist:', fetchError);
                this.bip39Wordlist = this.getFallbackWordlist();
                
                localStorage.setItem(CONFIG.BIP39.CACHE_KEY, JSON.stringify({
                    data: this.bip39Wordlist,
                    timestamp: Date.now()
                }));
            }

        } catch (error) {
            console.warn('All BIP39 loading methods failed, using embedded fallback:', error);
            this.bip39Wordlist = this.getFallbackWordlist();
        }
    }

    getFallbackWordlist() {
        return [
            "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract",
            "absurd", "abuse", "access", "accident", "account", "accuse", "achieve", "acid",
            "acoustic", "acquire", "across", "act", "action", "actor", "actress", "actual",
            "adapt", "add", "addict", "address", "adjust", "admit", "adult", "advance",
            "advice", "aerobic", "affair", "afford", "afraid", "again", "age", "agent",
            "agree", "ahead", "aim", "air", "airport", "aisle", "alarm", "album",
            "alcohol", "alert", "alien", "all", "alley", "allow", "almost", "alone",
            "alpha", "already", "also", "alter", "always", "amateur", "amazing", "among",
            "amount", "amused", "analyst", "anchor", "ancient", "anger", "angle", "angry",
            "animal", "ankle", "announce", "annual", "another", "answer", "antenna", "antique",
            "anxiety", "any", "apart", "apology", "appear", "apple", "approve", "april",
            "arch", "arctic", "area", "arena", "argue", "arm", "armed", "armor",
            "army", "around", "arrange", "arrest", "arrive", "arrow", "art", "artefact",
            "artist", "artwork", "ask", "aspect", "assault", "asset", "assist", "assume",
            "asthma", "athlete", "atom", "attack", "attend", "attitude", "attract", "auction",
            "audit", "august", "aunt", "author", "auto", "autumn", "average", "avocado",
            "avoid", "awake", "aware", "away", "awesome", "awful", "awkward", "axis",
            "baby", "bachelor", "bacon", "badge", "bag", "balance", "balcony", "ball",
            "bamboo", "banana", "banner", "bar", "barely", "bargain", "barrel", "base",
            "basic", "basket", "battle", "beach", "bean", "beauty", "because", "become",
            "beef", "before", "begin", "behave", "behind", "believe", "below", "belt",
            "bench", "benefit", "best", "betray", "better", "between", "beyond", "bicycle",
            "bid", "bike", "bind", "biology", "bird", "birth", "bitter", "black",
            "blade", "blame", "blanket", "blast", "bleak", "bless", "blind", "blood",
            "blossom", "blouse", "blue", "blur", "blush", "board", "boat", "body",
            "boil", "bomb", "bone", "bonus", "book", "boost", "border", "boring",
            "borrow", "boss", "bottom", "bounce", "box", "boy", "bracket", "brain",
            "brand", "brass", "brave", "bread", "breeze", "brick", "bridge", "brief",
            "bright", "bring", "brisk", "broccoli", "broken", "bronze", "broom", "brother",
            "brown", "brush", "bubble", "buddy", "budget", "buffalo", "build", "bulb",
            "bulk", "bullet", "bundle", "bunker", "burden", "burger", "burst", "bus",
            "business", "busy", "butter", "buyer", "buzz", "cabbage", "cabin", "cable",
            "cactus", "cage", "cake", "call", "calm", "camera", "camp", "can",
            "canal", "cancel", "candy", "cannon", "canoe", "canvas", "canyon", "capable",
            "capital", "captain", "car", "carbon", "card", "cargo", "carpet", "carry",
            "cart", "case", "cash", "casino", "castle", "casual", "cat", "catch",
            "category", "cattle", "caught", "cause", "caution", "cave", "ceiling", "celery",
            "cement", "census", "century", "ceremony", "certain", "chair", "chalk", "champion",
            "change", "chaos", "chapter", "charge", "chase", "chat", "cheap", "check",
            "cheek", "cheese", "chef", "cherry", "chest", "chicken", "chief", "child",
            "chimney", "choice", "choose", "chronic", "chuckle", "chunk", "churn", "cigar",
            "cinnamon", "circle", "citizen", "city", "civil", "claim", "clap", "clarify",
            "claw", "clay", "clean", "clerk", "clever", "click", "client", "cliff",
            "climb", "clinic", "clip", "clock", "clog", "close", "cloth", "cloud",
            "clown", "club", "clump", "cluster", "clutch", "coach", "coast", "coconut",
            "code", "coffee", "coil", "coin", "collect", "color", "column", "combine",
            "come", "comfort", "comic", "common", "company", "concert", "conduct", "confirm",
            "congress", "connect", "consider", "control", "convince", "cook", "cool", "copper",
            "copy", "coral", "core", "corn", "correct", "cost", "cotton", "couch",
            "country", "couple", "course", "cousin", "cover", "coyote", "crack", "cradle",
            "craft", "cram", "crane", "crash", "crater", "crawl", "crazy", "cream",
            "credit", "creek", "crew", "cricket", "crime", "crisp", "critic", "crop",
            "cross", "crouch", "crowd", "crucial", "cruel", "cruise", "crumble", "crunch",
            "crush", "cry", "crystal", "cube", "culture", "cup", "cupboard", "curious",
            "current", "curtain", "curve", "cushion", "custom", "cute", "cycle", "dad",
            "damage", "damp", "dance", "danger", "daring", "dark", "dash", "date",
            "daughter", "dawn", "day", "deal", "debate", "debris", "decade", "december",
            "decide", "decline", "decorate", "decrease", "deer", "defense", "define", "defy",
            "degree", "delay", "deliver", "demand", "demise", "denial", "dentist", "deny",
            "depart", "depend", "deposit", "depth", "deputy", "derive", "describe", "desert",
            "design", "desk", "despair", "destroy", "detail", "detect", "develop", "device",
            "devote", "diagram", "dial", "diamond", "diary", "dice", "diesel", "diet",
            "differ", "digital", "dignity", "dilemma", "dinner", "dinosaur", "direct", "dirt",
            "disagree", "discover", "disease", "dish", "dismiss", "disorder", "display", "distance",
            "divert", "divide", "divorce", "dizzy", "doctor", "document", "dog", "doll",
            "dolphin", "domain", "donate", "donkey", "donor", "door", "dose", "double",
            "dove", "draft", "dragon", "drama", "drastic", "draw", "dream", "dress",
            "drift", "drill", "drink", "drip", "drive", "drop", "drum", "dry",
            "duck", "dumb", "dune", "during", "dust", "dutch", "duty", "dwarf",
            "dynamic", "eager", "eagle", "early", "earn", "earth", "easily", "east",
            "easy", "echo", "ecology", "economy", "edge", "edit", "educate", "effort",
            "egg", "eight", "either", "elbow", "elder", "electric", "elegant", "element",
            "elephant", "elevator", "elite", "else", "embark", "embody", "embrace", "emerge",
            "emotion", "employ", "empower", "empty", "enable", "enact", "end", "endless",
            "endorse", "enemy", "energy", "enforce", "engage", "engine", "enhance", "enjoy",
            "enlist", "enough", "enrich", "enroll", "ensure", "enter", "entire", "entry",
            "envelope", "episode", "equal", "equip", "era", "erase", "erode", "erosion",
            "error", "erupt", "escape", "essay", "essence", "estate", "eternal", "ethics",
            "evidence", "evil", "evoke", "evolve", "exact", "example", "exceed", "excel",
            "exception", "excess", "exchange", "excite", "exclude", "excuse", "execute", "exercise",
            "exhaust", "exhibit", "exile", "exist", "exit", "exotic", "expand", "expect",
            "expire", "explain", "expose", "express", "extend", "extra", "eye", "eyebrow",
            "fabric", "face", "faculty", "fade", "faint", "faith", "fall", "false",
            "fame", "family", "famous", "fan", "fancy", "fantasy", "farm", "fashion",
            "fat", "fatal", "father", "fatigue", "fault", "favorite", "feature", "february",
            "federal", "fee", "feed", "feel", "female", "fence", "festival", "fetch",
            "fever", "few", "fiber", "fiction", "field", "figure", "file", "film",
            "filter", "final", "find", "fine", "finger", "finish", "fire", "firm",
            "first", "fiscal", "fish", "fit", "fitness", "fix", "flag", "flame",
            "flash", "flat", "flavor", "flee", "flight", "flip", "float", "flock",
            "floor", "flower", "fluid", "flush", "fly", "foam", "focus", "fog",
            "foil", "fold", "follow", "food", "foot", "force", "foreign", "forest",
            "forget", "fork", "fortune", "forum", "forward", "fossil", "foster", "found",
            "fox", "fragile", "frame", "frequent", "fresh", "friend", "fringe", "frog",
            "front", "frost", "frown", "frozen", "fruit", "fuel", "fun", "funny",
            "furnace", "fury", "future", "gadget", "gain", "galaxy", "gallery", "game",
            "gap", "garage", "garbage", "garden", "garlic", "garment", "gas", "gasp",
            "gate", "gather", "gauge", "gaze", "general", "genius", "genre", "gentle",
            "genuine", "gesture", "ghost", "giant", "gift", "giggle", "ginger", "giraffe",
            "girl", "give", "glad", "glance", "glare", "glass", "glide", "glimpse",
            "globe", "gloom", "glory", "glove", "glow", "glue", "goat", "goddess",
            "gold", "good", "goose", "gorilla", "gospel", "gossip", "govern", "gown",
            "grab", "grace", "grain", "grant", "grape", "grass", "gravity", "great",
            "green", "grid", "grief", "grit", "grocery", "group", "grow", "grunt",
            "guard", "guess", "guide", "guilt", "guitar", "gun", "gym", "habit",
            "hair", "half", "hammer", "hamster", "hand", "happy", "harbor", "hard",
            "harsh", "harvest", "hat", "have", "hawk", "hazard", "head", "health",
            "heart", "heavy", "hedgehog", "height", "hello", "helmet", "help", "hen",
            "hero", "hidden", "high", "hill", "hint", "hip", "hire", "history",
            "hobby", "hockey", "hold", "hole", "holiday", "hollow", "home", "honey",
            "hood", "hope", "horn", "horror", "horse", "hospital", "host", "hotel",
            "hour", "hover", "hub", "huge", "human", "humble", "humor", "hundred",
            "hungry", "hunt", "hurdle", "hurry", "hurt", "husband", "hybrid", "ice",
            "icon", "idea", "identify", "idle", "ignore", "ill", "illegal", "illness",
            "image", "imitate", "immense", "immune", "impact", "impose", "improve", "impulse",
            "inch", "include", "income", "increase", "index", "indicate", "indoor", "industry",
            "infant", "inflict", "inform", "inhale", "inherit", "initial", "inject", "injury",
            "inmate", "inner", "innocent", "input", "inquiry", "insane", "insect", "inside",
            "inspire", "install", "intact", "interest", "into", "invest", "invite", "involve",
            "iron", "island", "isolate", "issue", "item", "ivory", "jacket", "jaguar",
            "jar", "jazz", "jealous", "jeans", "jelly", "jewel", "job", "join",
            "joke", "journey", "joy", "judge", "juice", "jump", "jungle", "junior",
            "junk", "just", "kangaroo", "keen", "keep", "ketchup", "key", "kick",
            "kid", "kidney", "kind", "kingdom", "kiss", "kit", "kitchen", "kite",
            "kitten", "kiwi", "knee", "knife", "knock", "know", "lab", "label",
            "labor", "ladder", "lady", "lake", "lamp", "language", "laptop", "large",
            "later", "latin", "laugh", "laundry", "lava", "law", "lawn", "lawsuit",
            "layer", "lazy", "leader", "leaf", "learn", "leave", "lecture", "left",
            "leg", "legal", "legend", "leisure", "lemon", "lend", "length", "lens",
            "leopard", "lesson", "letter", "level", "liar", "liberty", "library", "license",
            "life", "lift", "light", "like", "limb", "limit", "link", "lion",
            "liquid", "list", "little", "live", "lizard", "load", "loan", "lobster",
            "local", "lock", "logic", "lonely", "long", "loop", "lottery", "loud",
            "lounge", "love", "loyal", "lucky", "luggage", "lumber", "lunar", "lunch",
            "luxury", "lyrics", "machine", "mad", "magic", "magnet", "maid", "mail",
            "main", "major", "make", "mammal", "man", "manage", "mandate", "mango",
            "mansion", "manual", "maple", "marble", "march", "margin", "marine", "market",
            "marriage", "mask", "mass", "master", "match", "material", "math", "matrix",
            "matter", "maximum", "maze", "meadow", "mean", "measure", "meat", "mechanic",
            "medal", "media", "melody", "melt", "member", "memory", "mention", "menu",
            "mercy", "merge", "merit", "merry", "mesh", "message", "metal", "method",
            "middle", "midnight", "milk", "million", "mimic", "mind", "minimum", "minor",
            "minute", "miracle", "mirror", "misery", "miss", "mistake", "mix", "mixed",
            "mixture", "mobile", "model", "modify", "mom", "moment", "monitor", "monkey",
            "monster", "month", "moon", "moral", "more", "morning", "mosquito", "mother",
            "motion", "motor", "mountain", "mouse", "move", "movie", "much", "muffin",
            "mule", "multiply", "muscle", "museum", "mushroom", "music", "must", "mutual",
            "myself", "mystery", "myth", "naive", "name", "napkin", "narrow", "nasty",
            "nation", "nature", "near", "neck", "need", "negative", "neglect", "neither",
            "nephew", "nerve", "nest", "net", "network", "neutral", "never", "news",
            "next", "nice", "night", "noble", "noise", "nominee", "noodle", "normal",
            "north", "nose", "notable", "note", "nothing", "notice", "novel", "now",
            "nuclear", "number", "nurse", "nut", "oak", "obey", "object", "oblige",
            "obscure", "observe", "obtain", "obvious", "occur", "ocean", "october", "odor",
            "off", "offer", "office", "often", "oil", "okay", "old", "olive",
            "olympic", "omit", "once", "one", "onion", "online", "only", "open",
            "opera", "opinion", "oppose", "option", "orange", "orbit", "orchard", "order",
            "ordinary", "organ", "orient", "original", "orphan", "ostrich", "other", "outdoor",
            "outer", "output", "outside", "oval", "oven", "over", "own", "owner",
            "oxygen", "oyster", "ozone", "pact", "paddle", "page", "pair", "palace",
            "palm", "panda", "panel", "panic", "panther", "paper", "parade", "parent",
            "park", "parrot", "party", "pass", "patch", "path", "patient", "patrol",
            "pattern", "pause", "pave", "payment", "peace", "peanut", "pear", "peasant",
            "pelican", "pen", "penalty", "pencil", "people", "pepper", "perfect", "permit",
            "person", "pet", "phone", "photo", "phrase", "physical", "piano", "picnic",
            "picture", "piece", "pig", "pigeon", "pill", "pilot", "pink", "pioneer",
            "pipe", "pistol", "pitch", "pizza", "place", "planet", "plastic", "plate",
            "play", "player", "pleasure", "pledge", "pluck", "plug", "plunge", "poem",
            "poet", "point", "polar", "pole", "police", "pond", "pony", "pool",
            "popular", "portion", "position", "possible", "post", "potato", "pottery", "poverty",
            "powder", "power", "practice", "praise", "predict", "prefer", "prepare", "present",
            "pretty", "prevent", "price", "pride", "primary", "print", "priority", "prison",
            "private", "prize", "problem", "process", "produce", "profit", "program", "project",
            "promote", "proof", "property", "prosper", "protect", "proud", "provide", "public",
            "pudding", "pull", "pulp", "pulse", "pumpkin", "punch", "pupil", "puppy",
            "purchase", "purity", "purpose", "purse", "push", "put", "puzzle", "pyramid",
            "quality", "quantum", "quarter", "question", "quick", "quit", "quiz", "quote",
            "rabbit", "raccoon", "race", "rack", "radar", "radio", "rail", "rain",
            "raise", "rally", "ramp", "ranch", "random", "range", "rapid", "rare",
            "rate", "rather", "raven", "raw", "razor", "ready", "real", "reason",
            "rebel", "rebuild", "recall", "receive", "recipe", "record", "recycle", "reduce",
            "reflect", "reform", "refuse", "region", "regret", "regular", "reject", "relax",
            "release", "relief", "rely", "remain", "remember", "remind", "remove", "render",
            "renew", "rent", "reopen", "repair", "repeat", "replace", "report", "require",
            "rescue", "resemble", "resist", "resource", "response", "result", "retire", "retreat",
            "return", "reunion", "reveal", "review", "reward", "rhythm", "rib", "ribbon",
            "rice", "rich", "ride", "ridge", "rifle", "right", "rigid", "ring",
            "riot", "rip", "ripe", "rise", "risk", "rival", "river", "road",
            "roast", "robot", "robust", "rocket", "romance", "roof", "rookie", "room",
            "rose", "rotate", "rough", "round", "route", "royal", "rubber", "rude",
            "rug", "rule", "run", "runway", "rural", "sad", "saddle", "sadness",
            "safe", "sail", "salad", "salmon", "salon", "salt", "same", "sample",
            "sand", "satisfy", "satoshi", "sauce", "sausage", "save", "say", "scale",
            "scan", "scare", "scatter", "scene", "scheme", "school", "science", "scissors",
            "scorpion", "scout", "scrap", "screen", "script", "scrub", "sea", "search",
            "season", "seat", "second", "secret", "section", "security", "seed", "seek",
            "segment", "select", "sell", "seminar", "senior", "sense", "sentence", "series",
            "service", "session", "settle", "setup", "seven", "shadow", "shaft", "shallow",
            "share", "shed", "shell", "sheriff", "shield", "shift", "shine", "ship",
            "shiver", "shock", "shoe", "shoot", "shop", "short", "shoulder", "shove",
            "shrimp", "shrug", "shuffle", "shy", "sibling", "sick", "side", "siege",
            "sight", "sign", "silent", "silk", "silly", "silver", "similar", "simple",
            "since", "sing", "siren", "sister", "situate", "six", "size", "skate",
            "sketch", "ski", "skill", "skin", "skirt", "skull", "slab", "slam",
            "sleep", "slender", "slice", "slide", "slight", "slim", "slogan", "slot",
            "slow", "slush", "small", "smart", "smile", "smoke", "smooth", "snack",
            "snake", "snap", "sniff", "snow", "soap", "soccer", "social", "sock",
            "soda", "soft", "solar", "soldier", "solid", "solution", "solve", "someone",
            "song", "soon", "sorry", "sort", "soul", "sound", "soup", "source",
            "south", "space", "spare", "spatial", "spawn", "speak", "special", "speed",
            "spell", "spend", "sphere", "spice", "spider", "spike", "spin", "spirit",
            "split", "spoil", "sponsor", "spoon", "sport", "spot", "spray", "spread",
            "spring", "spy", "square", "squeeze", "squirrel", "stable", "stadium", "staff",
            "stage", "stairs", "stamp", "stand", "start", "state", "stay", "steak",
            "steel", "stem", "step", "stereo", "stick", "still", "sting", "stock",
            "stomach", "stone", "stool", "story", "stove", "strategy", "street", "strike",
            "strong", "struggle", "student", "stuff", "stumble", "style", "subject", "submit",
            "subway", "success", "such", "sudden", "suffer", "sugar", "suggest", "suit",
            "summer", "sun", "sunny", "sunset", "super", "supply", "supreme", "sure",
            "surface", "surge", "surprise", "surround", "survey", "suspect", "sustain", "swallow",
            "swamp", "swap", "swarm", "swear", "sweet", "swift", "swim", "swing",
            "switch", "sword", "symbol", "symptom", "syrup", "system", "table", "tackle",
            "tag", "tail", "talent", "talk", "tank", "tape", "target", "task",
            "taste", "tattoo", "taxi", "teach", "team", "tell", "ten", "tenant",
            "tennis", "tent", "term", "test", "text", "thank", "that", "theme",
            "then", "theory", "there", "they", "thing", "this", "thought", "three",
            "thrive", "throw", "thumb", "thunder", "ticket", "tide", "tiger", "tilt",
            "timber", "time", "tiny", "tip", "tired", "tissue", "title", "toast",
            "tobacco", "today", "toddler", "toe", "together", "toilet", "token", "tomato",
            "tomorrow", "tone", "tongue", "tonight", "tool", "tooth", "top", "topic",
            "topple", "torch", "tornado", "tortoise", "toss", "total", "tourist", "toward",
            "tower", "town", "toy", "track", "trade", "traffic", "tragic", "train",
            "transfer", "trap", "trash", "travel", "tray", "treat", "tree", "trend",
            "trial", "tribe", "trick", "trigger", "trim", "trip", "trophy", "trouble",
            "truck", "true", "truly", "trumpet", "trust", "truth", "try", "tube",
            "tuition", "tumble", "tuna", "tunnel", "turkey", "turn", "turtle", "twelve",
            "twenty", "twice", "twin", "twist", "two", "type", "typical", "ugly",
            "umbrella", "unable", "unaware", "uncle", "uncover", "under", "undo", "unfair",
            "unfold", "unhappy", "uniform", "unique", "unit", "universe", "unknown", "unlock",
            "until", "unusual", "unveil", "update", "upgrade", "uphold", "upon", "upper",
            "upset", "urban", "urge", "usage", "use", "used", "useful", "useless",
            "usual", "utility", "vacant", "vacuum", "vague", "valid", "valley", "valve",
            "van", "vanish", "vapor", "various", "vast", "vault", "vehicle", "velvet",
            "vendor", "venture", "venue", "verb", "verify", "version", "very", "vessel",
            "veteran", "viable", "vibrant", "vicious", "victory", "video", "view", "village",
            "vintage", "violin", "virtual", "virus", "visa", "visit", "visual", "vital",
            "vivid", "vocal", "voice", "void", "volcano", "volume", "vote", "voyage",
            "wage", "wagon", "wait", "walk", "wall", "walnut", "want", "warfare",
            "warm", "warrior", "wash", "wasp", "waste", "water", "wave", "way",
            "wealth", "weapon", "weary", "weather", "web", "wedding", "weekend", "weird",
            "welcome", "west", "wet", "whale", "what", "wheat", "wheel", "when",
            "where", "whip", "whisper", "wide", "width", "wife", "wild", "will",
            "win", "window", "wine", "wing", "wink", "winner", "winter", "wire",
            "wisdom", "wise", "wish", "witness", "wolf", "woman", "wonder", "wood",
            "wool", "word", "work", "world", "worry", "worth", "wrap", "wreck",
            "wrestle", "wrist", "write", "wrong", "yard", "year", "yellow", "you",
            "young", "youth", "zebra", "zero", "zone", "zoo"
        ];
    }

    // ===== ENHANCED SECURITY METHODS =====
    secureWipe(buffer) {
        if (!buffer) return;
        
        try {
            if (buffer instanceof Uint8Array || buffer instanceof ArrayBuffer) {
                const view = buffer instanceof ArrayBuffer ? 
                    new Uint8Array(buffer) : buffer;
                
                for (let i = 0; i < view.length; i++) {
                    view[i] = 0;
                }
            } else if (typeof buffer === 'string') {
                const encoder = new TextEncoder();
                const encoded = encoder.encode(buffer);
                this.secureWipe(encoded);
            }
        } catch (error) {
            console.warn('Secure wipe failed:', error);
        }
    }

    trackSensitiveBuffer(buffer) {
        if (buffer) {
            this.sensitiveBuffers.add(buffer);
            
            setTimeout(() => {
                this.secureWipe(buffer);
                this.sensitiveBuffers.delete(buffer);
            }, CONFIG.SECURITY.MEMORY_CLEANUP_DELAY);
        }
    }

    cleanupSensitiveData() {
        this.sensitiveBuffers.forEach(buffer => {
            this.secureWipe(buffer);
        });
        this.sensitiveBuffers.clear();
        
        const sensitiveFields = ['seed-input', 'password-input', 'decrypt-password', 'decrypted-seed'];
        sensitiveFields.forEach(id => {
            const element = this.get(id);
            if (element) {
                element.value = '';
                if (element.type === 'password') {
                    element.type = 'password';
                }
            }
        });

        this.logSecurityEvent('sensitive_data_cleaned');
    }

    updateSecurityStatus() {
        const securityStatus = this.get('security-status');
        if (securityStatus) {
            const isLocked = this.isAccountLocked();
            securityStatus.textContent = `Security: ${isLocked ? 'Locked' : 'Active'}`;
        }
        
        const cacheStatus = this.get('cache-status');
        if (cacheStatus) {
            cacheStatus.textContent = `Cache: ${this.bip39Wordlist ? 'Ready' : 'Loading'}`;
        }
    }

    // ===== EVENT MANAGEMENT =====
    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Enterprise Security Modal
        this.on('close-enterprise-security', 'click', () => this.hideEnterpriseSecurityModal());
        this.on('understand-enterprise-security', 'click', () => this.hideEnterpriseSecurityModal());
        
        // Security Details Modal
        this.on('security-details-btn', 'click', () => this.showSecurityDetailsModal());
        this.on('close-security-details', 'click', () => this.hideSecurityDetailsModal());
        this.on('understand-security-details', 'click', () => this.hideSecurityDetailsModal());

        // Main actions
        this.on('encrypt-btn', 'click', () => this.showEncryptModal());
        this.on('scan-btn', 'click', () => this.startScanner());

        // Encryption modal
        this.on('close-encrypt', 'click', () => this.hideEncryptModal());
        this.on('cancel-encrypt', 'click', () => this.hideEncryptModal());
        this.on('confirm-encrypt', 'click', () => this.encryptSeed());
        
        // Seed input
        this.on('seed-input', 'input', (e) => this.handleSeedInput(e));
        this.on('seed-input', 'keydown', (e) => this.handleSeedKeydown(e));
        this.on('toggle-seed-visibility', 'click', () => this.toggleSeedVisibility());
        
        // Password input
        this.on('password-input', 'input', (e) => this.handlePasswordInput(e));
        this.on('toggle-password-visibility', 'click', () => this.togglePasswordVisibility());
        this.on('generate-password', 'click', () => this.generateSecurePassword());

        // QR modal
        this.on('close-qr', 'click', () => this.hideQRModal());
        this.on('download-png', 'click', () => this.downloadQRAsPNG());
        this.on('download-encrypted-file', 'click', () => this.downloadEncryptedFile());

        // Decryption
        this.on('close-decrypt', 'click', () => this.hideDecryptModal());
        this.on('cancel-decrypt', 'click', () => this.hideDecryptModal());
        this.on('confirm-decrypt', 'click', () => this.decryptSeed());
        this.on('toggle-decrypt-password', 'click', () => this.toggleDecryptPasswordVisibility());

        // Scanner
        this.on('close-scanner', 'click', () => this.stopScanner());
        this.on('stop-scanner', 'click', () => this.stopScanner());

        // Result modal
        this.on('close-result', 'click', () => this.hideResultModal());
        this.on('close-result-btn', 'click', () => this.hideResultModal());
        this.on('copy-seed', 'click', () => this.copyDecryptedSeed());

        // File upload
        this.setupFileUpload();

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Security events
        window.addEventListener('beforeunload', () => {
            this.cleanupSensitiveData();
        });

        console.log('Event listeners setup completed');
    }

    on(id, event, handler) {
        const element = this.get(id);
        if (element) {
            element.addEventListener(event, handler);
            console.log(`Event listener attached to ${id}`);
        } else {
            console.warn(`Element ${id} not found for event listener`);
        }
    }

    setupFileUpload() {
        const dropArea = this.get('drop-area');
        const fileInput = this.get('file-input');
        
        if (dropArea) {
            dropArea.addEventListener('click', () => fileInput.click());
            dropArea.addEventListener('dragover', (e) => this.handleDragOver(e));
            dropArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            dropArea.addEventListener('drop', (e) => this.handleFileDrop(e));
        }
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }
    }

    // ===== SETUP GUIDE MANAGEMENT =====
    updateSetupGuide(step) {
        const steps = document.querySelectorAll('.guide-step');
        steps.forEach((stepElement, index) => {
            if (index + 1 === step) {
                stepElement.classList.add('active');
            } else if (index + 1 < step) {
                stepElement.classList.remove('active');
                stepElement.classList.add('completed');
            } else {
                stepElement.classList.remove('active', 'completed');
            }
        });
        this.state.currentStep = step;
    }

    // ===== MODALES PRINCIPALES =====
    showEncryptModal() {
        this.showModal('encrypt-modal');
        this.updateSetupGuide(1);
        this.get('seed-input').focus();
    }

    hideEncryptModal() {
        this.hideModal('encrypt-modal');
        this.resetForm();
    }

    // ===== UTILITY METHODS =====
    get(id) {
        return document.getElementById(id);
    }

    showModal(modalId) {
        const modal = this.get(modalId);
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }

    hideModal(modalId) {
        const modal = this.get(modalId);
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    showLoading(message = 'Processing...') {
        this.showModal('loading-overlay');
        const messageElement = this.get('loading-message');
        if (messageElement) {
            messageElement.textContent = message;
        }
    }

    hideLoading() {
        this.hideModal('loading-overlay');
    }

    showProgress(message, percentage = null) {
        const messageElement = this.get('loading-message');
        const progressBar = this.get('progress-bar');
        const progressFill = progressBar?.querySelector('.progress-fill');
        
        if (messageElement) messageElement.textContent = message;
        if (progressBar && percentage !== null) {
            progressBar.style.display = 'block';
            if (progressFill) progressFill.style.width = `${percentage}%`;
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const sanitizedMessage = this.escapeHtml(this.sanitizeInput(message));

        toast.innerHTML = `
            <i class="fas ${icons[type] || icons.info}"></i>
            <span>${sanitizedMessage}</span>
        `;

        const container = this.get('toast-container');
        if (container) {
            container.appendChild(toast);

            setTimeout(() => {
                toast.style.animation = 'toastSlideIn 0.3s ease reverse';
                setTimeout(() => {
                    if (toast.parentNode === container) {
                        container.removeChild(toast);
                    }
                }, 300);
            }, 5000);
        }
    }

    // ===== SUGERENCIAS BIP39 =====
    handleSeedInput(event) {
        const input = event.target;
        const words = this.getWords(input.value);
        this.setText('word-count', `${words.length} words`);
        
        this.validateEncryptionForm();
        
        if (words.length >= 12) {
            this.updateSetupGuide(2);
        }
        
        const cursorPosition = input.selectionStart;
        const textBeforeCursor = input.value.substring(0, cursorPosition);
        const wordsBeforeCursor = textBeforeCursor.trim().split(/\s+/);
        const currentWord = wordsBeforeCursor[wordsBeforeCursor.length - 1] || '';
        
        this.state.currentInputWord = currentWord;
        this.showBIP39Suggestions(currentWord, input);
    }

    handleSeedKeydown(event) {
        if (event.key === 'Tab') {
            const suggestions = this.get('bip39-suggestions');
            if (suggestions && suggestions.style.display === 'block') {
                event.preventDefault();
                const firstSuggestion = suggestions.querySelector('.suggestion-item');
                if (firstSuggestion) {
                    firstSuggestion.click();
                }
            }
        }
        
        if (event.key === 'ArrowDown') {
            const suggestions = this.get('bip39-suggestions');
            if (suggestions && suggestions.style.display === 'block') {
                event.preventDefault();
                const firstSuggestion = suggestions.querySelector('.suggestion-item');
                if (firstSuggestion) {
                    firstSuggestion.focus();
                }
            }
        }
    }

    showBIP39Suggestions(currentWord, input) {
        if (!this.bip39Wordlist?.length || currentWord.length < 2) {
            this.hideSuggestions();
            return;
        }

        const suggestions = this.bip39Wordlist
            .filter(word => word.startsWith(currentWord.toLowerCase()))
            .slice(0, 8);

        if (suggestions.length === 0) {
            this.hideSuggestions();
            return;
        }

        this.displaySuggestions(suggestions, input, currentWord);
    }

    displaySuggestions(suggestions, input, currentWord) {
        const container = this.get('bip39-suggestions');
        if (!container) return;
        
        container.innerHTML = '';
        
        suggestions.forEach(word => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.tabIndex = 0;
            
            const matchedPart = word.substring(0, currentWord.length);
            const remainingPart = word.substring(currentWord.length);
            
            div.innerHTML = `
                <span class="suggestion-highlight">${matchedPart}</span>${remainingPart}
            `;
            
            div.addEventListener('click', () => {
                this.selectSuggestion(word, input);
            });
            
            div.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.selectSuggestion(word, input);
                }
            });
            
            container.appendChild(div);
        });
        
        container.style.display = 'block';
        
        const inputRect = input.getBoundingClientRect();
        container.style.top = `${inputRect.bottom + window.scrollY}px`;
        container.style.left = `${inputRect.left + window.scrollX}px`;
        container.style.width = `${inputRect.width}px`;
    }

    selectSuggestion(selectedWord, input) {
        const words = this.getWords(input.value);
        const cursorPosition = input.selectionStart;
        const textBeforeCursor = input.value.substring(0, cursorPosition);
        const textAfterCursor = input.value.substring(cursorPosition);
        
        const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
        const startOfCurrentWord = lastSpaceIndex === -1 ? 0 : lastSpaceIndex + 1;
        
        const newTextBefore = textBeforeCursor.substring(0, startOfCurrentWord) + selectedWord + ' ';
        const newValue = newTextBefore + textAfterCursor;
        
        input.value = newValue;
        
        const newWords = this.getWords(newValue);
        this.setText('word-count', `${newWords.length} words`);
        
        const newCursorPosition = newTextBefore.length;
        input.setSelectionRange(newCursorPosition, newCursorPosition);
        input.focus();
        
        this.hideSuggestions();
        this.validateEncryptionForm();
    }

    hideSuggestions() {
        const container = this.get('bip39-suggestions');
        if (container) container.style.display = 'none';
    }

    getWords(text) {
        return text.trim().split(/\s+/).filter(word => word);
    }

    // ===== ENCRYPTION FLOW =====
    resetForm() {
        this.setValue('seed-input', '');
        this.setValue('password-input', '');
        this.setText('word-count', '0 words');
        
        const strengthBar = this.get('password-strength')?.querySelector('.strength-bar');
        if (strengthBar) strengthBar.style.width = '0%';
        
        this.get('confirm-encrypt').disabled = true;
        this.hideSuggestions();
        this.updateSetupGuide(1);
    }

    setValue(id, value) {
        const element = this.get(id);
        if (element) element.value = value;
    }

    setText(id, text) {
        const element = this.get(id);
        if (element) element.textContent = text;
    }

    toggleSeedVisibility() {
        const input = this.get('seed-input');
        const button = this.get('toggle-seed-visibility');
        
        if (input && button) {
            this.state.isSeedVisible = !this.state.isSeedVisible;
            input.type = this.state.isSeedVisible ? 'text' : 'password';
            button.innerHTML = this.state.isSeedVisible ? 
                '<i class="fas fa-eye-slash"></i>' : 
                '<i class="fas fa-eye"></i>';
        }
    }

    handlePasswordInput(event) {
        this.validateEncryptionForm();
        this.updatePasswordStrength(event.target.value);
        
        if (event.target.value.length >= CONFIG.SECURITY.MIN_PASSWORD_LENGTH) {
            this.updateSetupGuide(3);
        }
    }

    updatePasswordStrength(password) {
        const strengthBar = this.get('password-strength')?.querySelector('.strength-bar');
        if (strengthBar) {
            const strength = this.calculatePasswordStrength(password);
            strengthBar.style.width = `${strength}%`;
            strengthBar.style.background = strength < 40 ? 'var(--error)' : 
                                          strength < 70 ? 'var(--warning)' : 
                                          'var(--success)';
        }
    }

    calculatePasswordStrength(password) {
        if (!password) return 0;
        
        let strength = Math.min(password.length * 4, 40);
        
        if (/[A-Z]/.test(password)) strength += 10;
        if (/[a-z]/.test(password)) strength += 10;
        if (/[0-9]/.test(password)) strength += 10;
        if (/[^A-Za-z0-9]/.test(password)) strength += 15;
        
        const commonPatterns = ['123', 'abc', 'qwerty', 'password', 'admin'];
        commonPatterns.forEach(pattern => {
            if (password.toLowerCase().includes(pattern)) strength -= 15;
        });

        return Math.max(0, Math.min(100, strength));
    }

    togglePasswordVisibility() {
        const input = this.get('password-input');
        const button = this.get('toggle-password-visibility');
        
        if (input && button) {
            this.state.isPasswordVisible = !this.state.isPasswordVisible;
            input.type = this.state.isPasswordVisible ? 'text' : 'password';
            button.innerHTML = this.state.isPasswordVisible ? 
                '<i class="fas fa-eye-slash"></i>' : 
                '<i class="fas fa-eye"></i>';
        }
    }

    toggleDecryptPasswordVisibility() {
        const input = this.get('decrypt-password');
        const button = this.get('toggle-decrypt-password');
        
        if (input && button) {
            const type = input.type;
            input.type = type === 'password' ? 'text' : 'password';
            button.innerHTML = type === 'password' ? 
                '<i class="fas fa-eye-slash"></i>' : 
                '<i class="fas fa-eye"></i>';
        }
    }

    generateSecurePassword() {
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        let password = '';
        
        password += charset[Math.floor(Math.random() * 26)];
        password += charset[26 + Math.floor(Math.random() * 26)];
        password += charset[52 + Math.floor(Math.random() * 10)];
        password += charset[62 + Math.floor(Math.random() * 8)];
        
        for (let i = 4; i < 16; i++) {
            password += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        
        password = password.split('').sort(() => 0.5 - Math.random()).join('');
        
        this.setValue('password-input', password);
        this.updatePasswordStrength(password);
        this.validateEncryptionForm();
        this.updateSetupGuide(3);
    }

    validateEncryptionForm() {
        const seed = this.get('seed-input')?.value.trim() || '';
        const password = this.get('password-input')?.value || '';
        const words = this.getWords(seed);
        
        const isValidSeed = [12, 18, 24].includes(words.length);
        const isValidPassword = password.length >= CONFIG.SECURITY.MIN_PASSWORD_LENGTH;
        
        this.get('confirm-encrypt').disabled = !(isValidSeed && isValidPassword);
    }

    async encryptSeed() {
        const seed = this.get('seed-input')?.value.trim() || '';
        const password = this.get('password-input')?.value || '';

        try {
            this.showLoading('Encrypting seed phrase...');
            this.showProgress('Validating seed phrase', 25);
            
            if (!this.validateSeedPhrase(seed)) return;
            this.showProgress('Validating password', 50);
            if (!this.validatePassword(password)) return;

            this.showProgress('Performing encryption', 75);
            const encryptedData = await this.performEncryption(seed, password);
            this.encryptedData = encryptedData;

            this.showProgress('Generating QR code', 90);
            await this.generateQRCode(encryptedData);
            
            this.hideEncryptModal();
            this.showQRModal();
            this.logSecurityEvent('encryption_success');

        } catch (error) {
            console.error('Encryption error:', error);
            this.showToast(`Encryption failed: ${error.message}`, 'error');
            this.logSecurityEvent('encryption_failed', { error: error.message });
        } finally {
            this.hideLoading();
        }
    }

    validateSeedPhrase(seed) {
        const words = this.getWords(seed);
        
        if (![12, 18, 24].includes(words.length)) {
            this.showToast('Seed phrase must be 12, 18, or 24 words', 'error');
            return false;
        }

        if (this.bip39Wordlist?.length > 0) {
            const invalidWords = words.filter(word => !this.bip39Wordlist.includes(word.toLowerCase()));
            if (invalidWords.length > 0) {
                this.showToast(`Invalid BIP39 words: ${invalidWords.slice(0, 3).join(', ')}`, 'error');
                return false;
            }
        }

        return true;
    }

    validatePassword(password) {
        if (password.length < CONFIG.SECURITY.MIN_PASSWORD_LENGTH) {
            this.showToast(`Password must be at least ${CONFIG.SECURITY.MIN_PASSWORD_LENGTH} characters`, 'error');
            return false;
        }

        if (this.calculatePasswordStrength(password) < 40) {
            this.showToast('Password is too weak. Please use a stronger password.', 'error');
            return false;
        }

        return true;
    }

    async performEncryption(plaintext, password) {
        let retryCount = 0;
        
        while (retryCount < CONFIG.SECURITY.MAX_CRYPTO_RETRIES) {
            try {
                const salt = crypto.getRandomValues(new Uint8Array(CONFIG.SECURITY.SALT_LENGTH));
                const iv = crypto.getRandomValues(new Uint8Array(CONFIG.SECURITY.IV_LENGTH));

                this.trackSensitiveBuffer(salt);
                this.trackSensitiveBuffer(iv);

                const encoder = new TextEncoder();
                const passwordBuffer = encoder.encode(password);
                this.trackSensitiveBuffer(passwordBuffer);

                const passwordKey = await crypto.subtle.importKey(
                    'raw',
                    passwordBuffer,
                    'PBKDF2',
                    false,
                    ['deriveKey']
                );

                const keyMaterial = await crypto.subtle.deriveKey(
                    {
                        name: 'PBKDF2',
                        salt: salt,
                        iterations: CONFIG.SECURITY.PBKDF2_ITERATIONS,
                        hash: 'SHA-256'
                    },
                    passwordKey,
                    { name: 'AES-GCM', length: CONFIG.SECURITY.AES_KEY_LENGTH },
                    false,
                    ['encrypt']
                );

                const plaintextBuffer = encoder.encode(plaintext);
                this.trackSensitiveBuffer(plaintextBuffer);

                const encrypted = await crypto.subtle.encrypt(
                    { name: 'AES-GCM', iv: iv },
                    keyMaterial,
                    plaintextBuffer
                );

                const hmacPasswordBuffer = encoder.encode(password + 'hmac');
                this.trackSensitiveBuffer(hmacPasswordBuffer);

                const hmacKey = await crypto.subtle.importKey(
                    'raw',
                    hmacPasswordBuffer,
                    { name: 'HMAC', hash: 'SHA-256' },
                    false,
                    ['sign']
                );

                const hmac = await crypto.subtle.sign('HMAC', hmacKey, encrypted);

                const combined = new Uint8Array([
                    ...salt,
                    ...iv,
                    ...new Uint8Array(encrypted),
                    ...new Uint8Array(hmac)
                ]);

                const result = btoa(String.fromCharCode(...combined));

                this.secureWipe(passwordBuffer);
                this.secureWipe(plaintextBuffer);
                this.secureWipe(hmacPasswordBuffer);

                return result;

            } catch (error) {
                retryCount++;
                console.warn(`Encryption attempt ${retryCount} failed:`, error);
                
                if (retryCount >= CONFIG.SECURITY.MAX_CRYPTO_RETRIES) {
                    throw new Error(`Encryption failed after ${retryCount} attempts: ${error.message}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
            }
        }
    }

    async generateQRCode(data) {
        return new Promise((resolve, reject) => {
            // Verificar que QRCode esté disponible
            if (typeof QRCode === 'undefined') {
                reject(new Error('QRCode library not loaded. Please check your internet connection and try again.'));
                return;
            }

            const canvas = this.get('qr-canvas');
            if (!canvas) {
                reject(new Error('QR canvas not found'));
                return;
            }
            
            try {
                QRCode.toCanvas(canvas, data, {
                    width: 300,
                    margin: 2,
                    color: { dark: '#000000', light: '#FFFFFF' },
                    errorCorrectionLevel: 'M'
                }, (error) => {
                    error ? reject(error) : resolve();
                });
            } catch (error) {
                reject(new Error(`QR generation failed: ${error.message}`));
            }
        });
    }

    showQRModal() {
        this.showModal('qr-modal');
    }

    hideQRModal() {
        this.hideModal('qr-modal');
    }

    downloadQRAsPNG() {
        const canvas = this.get('qr-canvas');
        if (!canvas) {
            this.showToast('QR code not found', 'error');
            return;
        }
        
        const link = document.createElement('a');
        link.download = `mnemoniqr-seed-${new Date().toISOString().split('T')[0]}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        this.showToast('QR code downloaded', 'success');
        this.logSecurityEvent('qr_code_downloaded');
    }

    downloadEncryptedFile() {
        if (!this.encryptedData) {
            this.showToast('No encrypted data available', 'error');
            return;
        }

        try {
            const blob = new Blob([this.encryptedData], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `mnemoniqr-encrypted-${new Date().toISOString().split('T')[0]}.txt`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
            
            this.showToast('Encrypted file downloaded', 'success');
            this.logSecurityEvent('encrypted_file_downloaded');
        } catch (error) {
            this.showToast('Failed to download encrypted file', 'error');
            this.logSecurityEvent('encrypted_file_download_failed', { error: error.message });
        }
    }

    // ===== DECRYPTION FLOW =====
    async decryptSeed() {
        if (this.isAccountLocked()) {
            const remainingTime = Math.ceil(this.getRemainingLockoutTime() / 60000);
            this.showToast(`Account locked. Try again in ${remainingTime} minutes.`, 'error');
            return;
        }

        const password = this.get('decrypt-password')?.value || '';

        if (!password) {
            this.showToast('Please enter the password', 'error');
            return;
        }

        if (!this.encryptedData) {
            this.showToast('No encrypted data available', 'error');
            return;
        }

        try {
            this.showLoading('Decrypting seed phrase...');
            this.showProgress('Verifying password', 30);
            
            const decryptedSeed = await this.performDecryption(this.encryptedData, password);
            
            this.resetDecryptAttempts();
            this.showProgress('Displaying results', 90);
            this.showDecryptedResult(decryptedSeed);
            
            this.hideDecryptModal();
            this.logSecurityEvent('decryption_success');

        } catch (error) {
            console.error('Decryption error:', error);
            
            this.incrementDecryptAttempts();
            
            if (error.message.includes('Wrong password') || error.message.includes('HMAC')) {
                this.showToast('Wrong password or corrupted data', 'error');
                this.logSecurityEvent('decryption_failed_wrong_password');
            } else {
                this.showToast(`Decryption failed: ${error.message}`, 'error');
                this.logSecurityEvent('decryption_failed', { error: error.message });
            }
        } finally {
            this.hideLoading();
        }
    }

    async performDecryption(encryptedData, password) {
        let retryCount = 0;
        
        while (retryCount < CONFIG.SECURITY.MAX_CRYPTO_RETRIES) {
            try {
                const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
                this.trackSensitiveBuffer(combined);
                
                const salt = combined.slice(0, CONFIG.SECURITY.SALT_LENGTH);
                const iv = combined.slice(CONFIG.SECURITY.SALT_LENGTH, CONFIG.SECURITY.SALT_LENGTH + CONFIG.SECURITY.IV_LENGTH);
                const ciphertext = combined.slice(CONFIG.SECURITY.SALT_LENGTH + CONFIG.SECURITY.IV_LENGTH, combined.length - CONFIG.SECURITY.HMAC_LENGTH);
                const hmac = combined.slice(combined.length - CONFIG.SECURITY.HMAC_LENGTH);

                this.trackSensitiveBuffer(salt);
                this.trackSensitiveBuffer(iv);
                this.trackSensitiveBuffer(ciphertext);
                this.trackSensitiveBuffer(hmac);

                const encoder = new TextEncoder();
                const hmacPasswordBuffer = encoder.encode(password + 'hmac');
                this.trackSensitiveBuffer(hmacPasswordBuffer);

                const hmacKey = await crypto.subtle.importKey(
                    'raw',
                    hmacPasswordBuffer,
                    { name: 'HMAC', hash: 'SHA-256' },
                    false,
                    ['verify']
                );

                const hmacValid = await crypto.subtle.verify('HMAC', hmacKey, hmac, ciphertext);
                if (!hmacValid) {
                    throw new Error('HMAC verification failed');
                }

                const passwordBuffer = encoder.encode(password);
                this.trackSensitiveBuffer(passwordBuffer);

                const passwordKey = await crypto.subtle.importKey(
                    'raw',
                    passwordBuffer,
                    'PBKDF2',
                    false,
                    ['deriveKey']
                );

                const keyMaterial = await crypto.subtle.deriveKey(
                    {
                        name: 'PBKDF2',
                        salt: salt,
                        iterations: CONFIG.SECURITY.PBKDF2_ITERATIONS,
                        hash: 'SHA-256'
                    },
                    passwordKey,
                    { name: 'AES-GCM', length: CONFIG.SECURITY.AES_KEY_LENGTH },
                    false,
                    ['decrypt']
                );

                const decrypted = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: iv },
                    keyMaterial,
                    ciphertext
                );

                const plaintext = new TextDecoder().decode(decrypted);

                this.secureWipe(passwordBuffer);
                this.secureWipe(hmacPasswordBuffer);
                this.secureWipe(new Uint8Array(decrypted));

                return plaintext;

            } catch (error) {
                retryCount++;
                console.warn(`Decryption attempt ${retryCount} failed:`, error);
                
                if (retryCount >= CONFIG.SECURITY.MAX_CRYPTO_RETRIES) {
                    if (error.message.includes('HMAC')) {
                        throw new Error('Wrong password or corrupted data');
                    }
                    throw new Error(`Decryption failed after ${retryCount} attempts: ${error.message}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
            }
        }
    }

    showDecryptedResult(seed) {
        this.setValue('decrypted-seed', seed);
        this.displaySeedWords(seed);
        this.showModal('result-modal');
    }

    displaySeedWords(seed) {
        const words = this.getWords(seed);
        const container = this.get('seed-words-grid');
        if (!container) return;
        
        container.innerHTML = '';

        words.forEach((word, index) => {
            const div = document.createElement('div');
            div.className = 'seed-word-item';
            div.innerHTML = `
                <span class="seed-word-index">${index + 1}</span>
                ${word}
            `;
            container.appendChild(div);
        });
    }

    hideResultModal() {
        this.hideModal('result-modal');
        this.setValue('decrypt-password', '');
        this.cleanupSensitiveData();
    }

    copyDecryptedSeed() {
        const seed = this.get('decrypted-seed')?.value;
        if (seed) {
            navigator.clipboard.writeText(seed).then(() => {
                this.showToast('Seed phrase copied to clipboard', 'success');
                this.logSecurityEvent('seed_copied_to_clipboard');
            }).catch(() => {
                this.showToast('Failed to copy to clipboard', 'error');
                this.logSecurityEvent('copy_to_clipboard_failed');
            });
        }
    }

    // ===== SCANNER FUNCTIONALITY =====
    async startScanner() {
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                this.showToast('Camera access not supported', 'error');
                return;
            }

            this.showModal('scanner-modal');
            
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            this.state.videoStream = stream;
            const video = this.get('camera-preview');
            if (video) video.srcObject = stream;
            
            this.state.scannerActive = true;
            this.startScanningLoop();
            this.logSecurityEvent('scanner_started');

        } catch (error) {
            console.error('Camera error:', error);
            this.showToast('Cannot access camera: ' + error.message, 'error');
            this.stopScanner();
            this.logSecurityEvent('camera_access_failed', { error: error.message });
        }
    }

    startScanningLoop() {
        const scan = () => {
            if (!this.state.scannerActive) return;

            const video = this.get('camera-preview');
            if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
                requestAnimationFrame(scan);
                return;
            }

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code) {
                this.encryptedData = code.data;
                this.stopScanner();
                this.showDecryptModal();
                this.showToast('QR code scanned successfully', 'success');
                this.logSecurityEvent('qr_code_scanned_success');
                return;
            }

            requestAnimationFrame(scan);
        };

        requestAnimationFrame(scan);
    }

    stopScanner() {
        this.state.scannerActive = false;
        
        if (this.state.videoStream) {
            this.state.videoStream.getTracks().forEach(track => track.stop());
            this.state.videoStream = null;
        }
        
        this.hideModal('scanner-modal');
        this.logSecurityEvent('scanner_stopped');
    }

    showDecryptModal() {
        this.showModal('decrypt-modal');
        const decryptPassword = this.get('decrypt-password');
        if (decryptPassword) decryptPassword.focus();
    }

    hideDecryptModal() {
        this.hideModal('decrypt-modal');
        this.setValue('decrypt-password', '');
    }

    // ===== FILE UPLOAD =====
    handleDragOver(e) {
        e.preventDefault();
        const dropArea = this.get('drop-area');
        if (dropArea) {
            dropArea.style.borderColor = 'var(--primary-black)';
            dropArea.style.background = 'var(--secondary-white)';
        }
    }

    handleDragLeave(e) {
        e.preventDefault();
        const dropArea = this.get('drop-area');
        if (dropArea) {
            dropArea.style.borderColor = '';
            dropArea.style.background = '';
        }
    }

    async handleFileDrop(e) {
        e.preventDefault();
        this.handleDragLeave(e);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            await this.processImageFile(files[0]);
        }
    }

    async handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            await this.processImageFile(files[0]);
        }
    }

    async processImageFile(file) {
        try {
            this.showLoading('Processing QR code image...');
            
            const imageData = await this.readFileAsDataURL(file);
            const encryptedData = await this.extractQRFromImage(imageData);
            
            this.encryptedData = encryptedData;
            this.showDecryptModal();
            this.showToast('QR code image loaded', 'success');
            this.logSecurityEvent('qr_code_image_loaded');

        } catch (error) {
            console.error('File processing error:', error);
            this.showToast('Failed to read QR code from image', 'error');
            this.logSecurityEvent('qr_code_image_failed', { error: error.message });
        } finally {
            this.hideLoading();
        }
    }

    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async extractQRFromImage(imageData) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                
                const imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageDataObj.data, imageDataObj.width, imageDataObj.height);
                
                code ? resolve(code.data) : reject(new Error('No QR code found'));
            };
            img.onerror = reject;
            img.src = imageData;
        });
    }

    // ===== KEYBOARD SHORTCUTS =====
    handleKeyboard(e) {
        if (e.key === 'Escape') {
            const openModals = [
                'enterprise-security-modal', 
                'security-details-modal',
                'encrypt-modal', 
                'qr-modal', 
                'decrypt-modal', 
                'scanner-modal', 
                'result-modal'
            ];
            for (const modal of openModals) {
                if (this.get(modal)?.style.display === 'flex') {
                    this.hideModal(modal);
                    break;
                }
            }
        }
        
        if (e.key === 'Escape') {
            this.hideSuggestions();
        }
        
        if (e.ctrlKey || e.metaKey) {
            switch(e.key) {
                case 'e':
                    e.preventDefault();
                    if (this.get('encrypt-modal')?.style.display !== 'flex') {
                        this.showEncryptModal();
                    }
                    break;
                case 'd':
                    e.preventDefault();
                    if (this.get('decrypt-modal')?.style.display !== 'flex' && this.encryptedData) {
                        this.showDecryptModal();
                    }
                    break;
            }
        }
    }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Initializing MnemoniQR...');
    
    // Verificar que las librerías requeridas estén cargadas
    if (typeof QRCode === 'undefined') {
        console.error('QRCode library not loaded');
        // Mostrar error al usuario
        const toastContainer = document.getElementById('toast-container');
        if (toastContainer) {
            const toast = document.createElement('div');
            toast.className = 'toast error';
            toast.innerHTML = `
                <i class="fas fa-exclamation-circle"></i>
                <span>QRCode library failed to load. Please check your internet connection and refresh the page.</span>
            `;
            toastContainer.appendChild(toast);
            
            setTimeout(() => {
                if (toast.parentNode === toastContainer) {
                    toastContainer.removeChild(toast);
                }
            }, 10000);
        }
        return;
    }
    
    if (typeof jsQR === 'undefined') {
        console.error('jsQR library not loaded');
        // Manejar error de jsQR si es necesario
    }
    
    const app = new MnemoniQR();
    
    window.addEventListener('beforeunload', () => {
        app.cleanupSensitiveData();
    });
    
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        window.mnemoniQR = app;
    }
});
