// index.cjs
// Import necessary modules directly from the main Baileys package for stability
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const config = require('./config.cjs'); // Make sure config.cjs exists and has ownerNumber

// --- Global State Variables ---
let botSettings = {
  mode: config.mode || 'private', // Bot mode: 'private' (owner only) or 'public' (everyone)
  autoCollectorGlobalEnabled: false, // Global switch for card auto-collection
  groupSpecificAutoCollector: {}, // { 'groupJid': true/false } overrides global setting for cards
  pokemonAutoCollectorGlobalEnabled: false, // Global switch for Pokémon auto-collection
  groupSpecificPokemonAutoCollector: {} // { 'groupJid': true/false } overrides global setting for Pokémon
};
const startTime = new Date(); // Stores bot start time for uptime calculation
let collectedCards = []; // Array to store details of all collected cards
let collectedPokemon = []; // Array to store details of all collected Pokémon

// Counters for collection performance
let successfulCollections = 0;
let failedCollections = 0;

// commands array moved to global scope
const commands = []; 

// Global queue for collection actions
const collectionQueue = [];
let isProcessingQueue = false;

// Context for the last detected Pokémon spawn, for manual !catch command
let lastPokemonSpawnContext = {}; // { jid: 'groupJid', imageBuffer: Buffer, originalMessageText: string }

// --- Constants and File Paths ---
const OWNER_NUMBER = config.ownerNumber; // Owner's phone number from config
const OWNER_JID = `${OWNER_NUMBER}@s.whatsapp.net`; // Owner's WhatsApp JID for direct messages
const MONITORED_BOT_NUMBERS = config.monitoredBotNumbers || []; // Array of JIDs of bots to specifically monitor for CARDS
const MONITORED_POKEMON_BOT_NUMBERS = config.monitoredPokemonBotNumbers || []; // Array of JIDs of bots to specifically monitor for POKEMON
const SESSION_DIR = path.resolve(__dirname, 'session_dir'); // Directory for Baileys session files
const INVENTORY_FILE = path.resolve(__dirname, 'inventory.json'); // File to store collected card inventory
const POKEMON_INVENTORY_FILE = path.resolve(__dirname, 'pokemon_inventory.json'); // File to store collected Pokémon inventory
const BOT_SETTINGS_FILE = path.resolve(__dirname, 'bot_settings.json'); // File to store bot settings

const COMMANDS_DIR = path.join(__dirname, 'plugins', 'commands'); // Directory for plugin command files

// Get delay ranges from config, with fallbacks
const INITIAL_DELAY_MIN = config.collectionDelays?.initial?.min || 3000;
const INITIAL_DELAY_MAX = config.collectionDelays?.initial?.max || 6000;
const INTER_GROUP_DELAY_MIN = config.collectionDelays?.interGroup?.min || 1000;
const INTER_GROUP_DELAY_MAX = config.collectionDelays?.interGroup?.max || 2000;

// NEW: Constants for !sendtestmessages command
const MAX_TEST_MESSAGES = 200; // Max messages per !sendtestmessages command
const MIN_TEST_MESSAGE_DELAY = 500; // Min delay in ms for !sendtestmessages


// --- Helper Functions ---

/**
 * Generates a random integer within a specified range (inclusive).
 * @param {number} min - The minimum value.
 * @param {number} max - The maximum value.
 * @returns {number} A random integer.
 */
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sends a message to the bot owner's DM. This is used for owner commands and critical bot status.
 * Auto-collection success/failure messages are suppressed from DM as per user request.
 * @param {import('@whiskeysockets/baileys').WASocket} sock - The Baileys socket instance.
 * @param {import('@whiskeysockets/baileys').AnyMessageContent} messageContent - The content of the message to send.
 */
async function sendToOwner(sock, messageContent) {
  try {
    // Ensure no ephemeral flags are set when sending to owner
    const messageOptions = { ...messageContent };
    delete messageOptions.ephemeralExpiration; // Remove ephemeral flag
    await sock.sendMessage(OWNER_JID, messageOptions);
    console.log(`[DEBUG] Sent message to owner DM: ${JSON.stringify(messageContent.text || messageContent.caption || 'Media message')}`);
  } catch (error) {
    console.error(`❌ CRITICAL: Failed to send message to owner DM (${OWNER_JID}). Bot might be unable to communicate!`, error);
  }
}

/**
 * Loads collected card inventory from inventory.json.
 */
function loadInventory() {
  if (fs.existsSync(INVENTORY_FILE)) {
    try {
      const data = fs.readFileSync(INVENTORY_FILE, 'utf8');
      collectedCards = JSON.parse(data);
      console.log(`[DEBUG] ✅ Loaded ${collectedCards.length} cards from inventory.`);
    } catch (error) {
      console.error('❌ Error loading inventory.json. Starting with empty inventory.', error);
      collectedCards = []; // Reset if file is corrupted
    }
  } else {
    collectedCards = [];
    console.log('[DEBUG] ℹ️ inventory.json not found. Starting with empty inventory.');
  }
}

/**
 * Saves the current collected card inventory to inventory.json.
 * Uses a temporary file to prevent data corruption during writes.
 */
function saveInventory() {
  try {
    const tempFilePath = INVENTORY_FILE + '.tmp';
    fs.writeFileSync(tempFilePath, JSON.stringify(collectedCards, null, 2), 'utf8');
    fs.renameSync(tempFilePath, INVENTORY_FILE); // Atomically replace the old file
    console.log(`[DEBUG] ✅ Inventory saved with ${collectedCards.length} cards.`);
  } catch (error) {
    console.error('❌ Error saving inventory.json:', error);
  }
}

/**
 * Loads collected Pokémon inventory from pokemon_inventory.json.
 */
function loadPokemonInventory() {
  if (fs.existsSync(POKEMON_INVENTORY_FILE)) {
    try {
      const data = fs.readFileSync(POKEMON_INVENTORY_FILE, 'utf8');
      collectedPokemon = JSON.parse(data);
      console.log(`[DEBUG] ✅ Loaded ${collectedPokemon.length} Pokémon from inventory.`);
    } catch (error) {
      console.error('❌ Error loading pokemon_inventory.json. Starting with empty Pokémon inventory.', error);
      collectedPokemon = []; // Reset if file is corrupted
    }
  } else {
    collectedPokemon = [];
    console.log('[DEBUG] ℹ️ pokemon_inventory.json not found. Starting with empty Pokémon inventory.');
  }
}

/**
 * Saves the current collected Pokémon inventory to pokemon_inventory.json.
 */
function savePokemonInventory() {
  try {
    const tempFilePath = POKEMON_INVENTORY_FILE + '.tmp';
    fs.writeFileSync(tempFilePath, JSON.stringify(collectedPokemon, null, 2), 'utf8');
    fs.renameSync(tempFilePath, POKEMON_INVENTORY_FILE); // Atomically replace the old file
    console.log(`[DEBUG] ✅ Pokémon Inventory saved with ${collectedPokemon.length} Pokémon.`);
  } catch (error) {
    console.error('❌ Error saving pokemon_inventory.json:', error);
  }
}

/**
 * Loads bot settings from bot_settings.json.
 */
function loadBotSettings() {
  if (fs.existsSync(BOT_SETTINGS_FILE)) {
    try {
      const data = fs.readFileSync(BOT_SETTINGS_FILE, 'utf8');
      const loadedSettings = JSON.parse(data);
      botSettings = {
        mode: loadedSettings.mode || config.mode || 'private',
        autoCollectorGlobalEnabled: typeof loadedSettings.autoCollectorGlobalEnabled === 'boolean' ? loadedSettings.autoCollectorGlobalEnabled : false,
        groupSpecificAutoCollector: loadedSettings.groupSpecificAutoCollector || {},
        pokemonAutoCollectorGlobalEnabled: typeof loadedSettings.pokemonAutoCollectorGlobalEnabled === 'boolean' ? loadedSettings.pokemonAutoCollectorGlobalEnabled : false,
        groupSpecificPokemonAutoCollector: loadedSettings.groupSpecificPokemonAutoCollector || {}
      };
      // Load collection stats if available
      successfulCollections = loadedSettings.successfulCollections || 0;
      failedCollections = loadedSettings.failedCollections || 0;

      console.log('[DEBUG] ✅ Loaded bot settings:', botSettings);
      console.log(`[DEBUG] Loaded collection stats: Success=${successfulCollections}, Failed=${failedCollections}`);
    } catch (error) {
      console.error('❌ Error loading bot_settings.json. Using default settings.', error);
      botSettings = {
        mode: config.mode || 'private',
        autoCollectorGlobalEnabled: false,
        groupSpecificAutoCollector: {},
        pokemonAutoCollectorGlobalEnabled: false,
        groupSpecificPokemonAutoCollector: {}
      };
      successfulCollections = 0; // Reset on error
      failedCollections = 0;     // Reset on error
    }
  } else {
    console.log('[DEBUG] ℹ️ bot_settings.json not found. Starting with empty settings.');
  }
  if (!botSettings.mode) {
      botSettings.mode = config.mode || 'private';
  }
}

/**
 * Saves the current bot settings to bot_settings.json.
 */
function saveBotSettings() {
  try {
    const settingsToSave = {
      ...botSettings,
      successfulCollections, // Save collection stats
      failedCollections      // Save collection stats
    };
    const tempFilePath = BOT_SETTINGS_FILE + '.tmp';
    fs.writeFileSync(tempFilePath, JSON.stringify(settingsToSave, null, 2), 'utf8');
    fs.renameSync(tempFilePath, BOT_SETTINGS_FILE); // Atomically replace the old file
    console.log('[DEBUG] ✅ Bot settings saved:', botSettings);
    console.log(`[DEBUG] Saved collection stats: Success=${successfulCollections}, Failed=${failedCollections}`);
  } catch (error) {
    console.error('❌ Error saving bot_settings.json:', error);
  }
}

/**
 * Adds a new collected card's details to the inventory and saves it.
 * @param {object} cardDetails - Object containing card name, tier, description, captcha, time, groupJid, groupName.
 */
function addCardToInventory(cardDetails) {
  collectedCards.push(cardDetails);
  saveInventory();
}

/**
 * Adds a new collected Pokémon's details to the inventory and saves it.
 * @param {object} pokemonDetails - Object containing Pokémon name, time, groupJid, groupName.
 */
function addPokemonToInventory(pokemonDetails) {
  collectedPokemon.push(pokemonDetails);
  savePokemonInventory();
}

/**
 * Calculates and returns the bot's uptime in a human-readable format.
 * @returns {string} Uptime string (e.g., "1d 5h 30m 15s").
 */
function getUptime() {
  const diff = new Date().getTime() - startTime.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 24);
  const days = Math.floor(hours / 24);

  return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
}

/**
 * Determines if card auto-collector is enabled for a given chat (group or private).
 * @param {string} chatJid - The JID of the chat.
 * @returns {boolean} True if card auto-collector is enabled for this chat.
 */
function isAutoCollectorEnabledForChat(chatJid) {
  // If a specific setting exists for this group, use it
  if (typeof botSettings.groupSpecificAutoCollector[chatJid] === 'boolean') {
    return botSettings.groupSpecificAutoCollector[chatJid];
  }
  // Otherwise, fallback to the global setting
  return botSettings.autoCollectorGlobalEnabled;
}

/**
 * Determines if Pokémon auto-collector is enabled for a given chat.
 * @param {string} chatJid - The JID of the chat.
 * @returns {boolean} True if Pokémon auto-collector is enabled for this chat.
 */
function isPokemonAutoCollectorEnabledForChat(chatJid) {
  if (typeof botSettings.groupSpecificPokemonAutoCollector[chatJid] === 'boolean') {
    return botSettings.groupSpecificPokemonAutoCollector[chatJid];
  }
  return botSettings.pokemonAutoCollectorGlobalEnabled;
}

/**
 * Normalizes a message body by removing common invisible characters and trimming.
 * IMPORTANT: This version preserves newlines as they are crucial for regex parsing.
 * @param {string} text - The raw message text.
 * @returns {string} The normalized text.
 */
function normalizeText(text) {
    // Remove zero-width spaces, non-breaking spaces, and other invisible Unicode characters
    let normalized = text.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');
    // Only trim leading/trailing whitespace, preserve internal newlines and spaces
    normalized = normalized.trim();
    return normalized;
}

/**
 * Attempts to extract text content from various message types.
 * This is crucial for handling messages from other bots which might use non-standard text fields.
 * @param {object} message - The message object from Baileys.
 * @returns {string} The extracted text content, or an empty string if no text is found.
 */
function extractMessageText(message) {
  // Prioritize image/video/document captions
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  
  // Then check standard text fields
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  
  // For replies/quoted messages, try to get text from the quoted message
  if (message.extendedTextMessage?.contextInfo?.quotedMessage) {
    return extractMessageText(message.extendedTextMessage.contextInfo.quotedMessage);
  }
  // Add other message types if needed, e.g., list messages, template messages
  if (message.listResponseMessage?.title) return message.listResponseMessage.title;
  if (message.templateButtonReplyMessage?.selectedDisplayText) return message.templateButtonReplyMessage.selectedDisplayText;
  if (message.reactionMessage?.text) return message.reactionMessage.text; // For reactions that are text
  
  return ''; // Return empty string if no text found
}


/**
 * Attempts to parse a card message and extract its details.
 * This function uses robust regex patterns and text normalization.
 * @param {string} rawBody - The raw message body.
 * @returns {object|null} An object with card details if found, otherwise null.
 */
function parseCardMessage(rawBody) {
    const body = normalizeText(rawBody);
    console.log(`[DEBUG] parseCardMessage: Normalized body for parsing: "${body}"`);

    // Check for the main card header
    if (!body.startsWith('*A Collectable card Has Arrived!*')) {
        console.log('[DEBUG] parseCardMessage: Missing main card header.');
        return null;
    }
    // Use more flexible includes for the card details header
    if (!body.includes('*🃏 Card Details 🃏*')) {
        console.log('[DEBUG] parseCardMessage: Missing card details section header.');
        return null;
    }
    if (!body.includes('🍀 *Captcha:*')) {
        console.log('[DEBUG] parseCardMessage: Missing captcha line.');
        return null;
    }

    // Regex to capture the entire card details block, making it easier to parse
    // Adjusted to be more forgiving with whitespace around the main header
    // The `[\s\S]*?` allows matching across newlines (which normalizeText now preserves)
    const cardDetailsBlockRegex = /\*🃏 Card Details 🃏\*\s*([\s\S]*?)(?=Use \*#collect\*|<captcha>|\[\s*\w+\s*\]|$)/;
    const blockMatch = body.match(cardDetailsBlockRegex);

    if (!blockMatch || !blockMatch[1]) {
        console.log('[DEBUG] parseCardMessage: Could not find card details block.');
        return null;
    }

    const detailsBlock = normalizeText(blockMatch[1]); // Normalize the extracted block too
    console.log(`[DEBUG] parseCardMessage: Extracted details block: "${detailsBlock}"`);

    const captchaMatch = detailsBlock.match(/🍀 \*Captcha:\* ([A-Z0-9]+)/);
    if (!captchaMatch || !captchaMatch[1]) {
        console.log('[DEBUG] parseCardMessage: Captcha not found in details block.');
        return null;
    }
    const captcha = captchaMatch[1].toUpperCase();

    // More flexible regex for other details, assuming newlines are preserved
    // The `(.+?)` should now correctly capture until the next line break or the end of the block
    const nameMatch = detailsBlock.match(/🔰 \*Name:\*:?\s*(.+?)(?:\n|$)/); 
    const descriptionMatch = detailsBlock.match(/🛡 \*Description:\*:?\s*(.+?)(?:\n|$)/); 
    const tierMatch = detailsBlock.match(/🏹 \*Tier:\*:?\s*(\d+|[Ss])(?:\n|$)/); // Modified to capture 'S'
    const priceMatch = detailsBlock.match(/💎 \*Price:\*:?\s*(\d+)(?:\n|$)/);
    const cardMakerMatch = detailsBlock.match(/🧧 \*Card Maker:\*:?\s*(.+?)(?:\n|$)/); // Last one might not have a newline after it

    const cardDetails = {
        name: nameMatch ? nameMatch[1].trim() : 'Unknown Card',
        captcha: captcha,
        description: descriptionMatch ? descriptionMatch[1].trim() : 'No description provided.',
        tier: tierMatch ? (isNaN(parseInt(tierMatch[1], 10)) ? tierMatch[1].toUpperCase() : parseInt(tierMatch[1], 10)) : 'Unknown Tier', // Parse 'S' as string, others as int
        price: priceMatch ? parseInt(priceMatch[1], 10) : 0,
        cardMaker: cardMakerMatch ? cardMakerMatch[1].trim() : 'Unknown Maker'
    };

    console.log('[DEBUG] parseCardMessage: Successfully parsed card details:', cardDetails);
    return cardDetails;
}


/**
 * Adds an action to the collection queue and triggers processing if not already active.
 * @param {object} action - The action object (type, targetJid, command, details).
 * @param {import('@whiskeysockets/baileys').WASocket} sock - The Baileys socket instance.
 */
function addCollectionActionToQueue(action, sock) {
    collectionQueue.push(action);
    console.log(`[DEBUG] Added action to queue: ${action.type} for ${action.targetJid}. Queue size: ${collectionQueue.length}`);
    triggerQueueProcessing(sock);
}

/**
 * Triggers the queue processing if it's not already running.
 * @param {import('@whiskeysockets/baileys').WASocket} sock - The Baileys socket instance.
 */
function triggerQueueProcessing(sock) {
    if (!isProcessingQueue) {
        processQueue(sock);
    }
}

/**
 * Processes items in the collection queue sequentially with randomized delays and typing indicators.
 * @param {import('@whiskeysockets/baileys').WASocket} sock - The Baileys socket instance.
 */
async function processQueue(sock) {
    if (isProcessingQueue) return;
    isProcessingQueue = true;
    console.log('[DEBUG] Starting queue processing...');

    while (collectionQueue.length > 0) {
        const item = collectionQueue.shift(); // Get first item
        const { type, targetJid, command, details } = item;

        console.log(`[DEBUG] Processing queue item: ${type} for ${targetJid} with command "${command}"`);

        // Send typing indicator
        await sock.sendPresenceUpdate('composing', targetJid);
        console.log(`[DEBUG] Sent 'composing' presence to ${targetJid}.`);

        // Randomized initial delay
        const initialDelay = getRandomInt(INITIAL_DELAY_MIN, INITIAL_DELAY_MAX); 
        console.log(`[DEBUG] Waiting for randomized initial delay: ${initialDelay / 1000} seconds.`);
        await new Promise(resolve => setTimeout(resolve, initialDelay));

        try {
            // Send message with explicit ephemeralExpiration: 0 to prevent disappearing messages
            await sock.sendMessage(targetJid, { text: command }, { ephemeralExpiration: 0 });
            console.log(`[DEBUG] Successfully sent "${command}" to ${targetJid}.`);
            successfulCollections++; // Increment successful count
            saveBotSettings(); // Save updated stats

            // Add to inventory
            if (type === 'card') {
                addCardToInventory(details);
                console.log(`[DEBUG] Card added to inventory: ${details.name}`);
            } else if (type === 'pokemon') {
                addPokemonToInventory(details);
                console.log(`[DEBUG] Pokémon added to inventory: ${details.name}`);
            }

        } catch (error) {
            console.error(`❌ Error sending ${type} command "${command}" to ${targetJid}:`, error);
            failedCollections++; // Increment failed count
            saveBotSettings(); // Save updated stats
            await sendToOwner(sock, { text: `❌ *Auto-Collection Failed!* ⛔\n\n*Type:* ${type}\n*Command:* \`${command}\`\n*Target:* ${targetJid}\n*Error:* ${error.message}\n\nPlease check the bot's console for more details.` });
        } finally {
            // Send paused indicator after message is sent (or failed)
            await sock.sendPresenceUpdate('paused', targetJid);
            console.log(`[DEBUG] Sent 'paused' presence to ${targetJid}.`);
        }

        // Delay BEFORE processing the next item in the queue (randomized inter-group delay)
        if (collectionQueue.length > 0) {
            const interGroupDelay = getRandomInt(INTER_GROUP_DELAY_MIN, INTER_GROUP_DELAY_MAX); 
            console.log(`[DEBUG] Waiting for randomized inter-group delay: ${interGroupDelay / 1000} seconds.`);
            await new Promise(resolve => setTimeout(resolve, interGroupDelay));
        }
    }
    isProcessingQueue = false;
    console.log('[DEBUG] Collection queue empty. Stopped processing.');
}


// --- Baileys Session Management ---

// Ensure the session directory exists before starting the bot
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  console.log(`[DEBUG] Created session directory: ${SESSION_DIR}`);
}

/**
 * Retrieves the authentication state for Baileys.
 * @returns {Promise<{state: import('@whiskeysockets/baileys').AuthenticationState, saveCreds: Function}>}
 */
async function getAuthState() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  return { state, saveCreds };
}

// --- Main Bot Logic ---
async function startBot() {
  // Load settings and inventory when the bot starts up
  loadBotSettings();
  loadInventory();
  loadPokemonInventory(); 

  // Get authentication state
  const { state, saveCreds } = await getAuthState();

  // Create Baileys socket instance
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false, // QR code will be sent to owner via DM
    browser: ['AutoCollector Bot', 'Safari', '1.0'], // Custom browser name
    // Add other connection options here if needed for stability
  });

  // --- Connection Update Listener ---
  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      qrcode.generate(qr, { small: true }); // Still print to console for initial setup
      console.log('[DEBUG] 📱 Scan the QR code above to connect');
      await sendToOwner(sock, { text: '📱 *Action Required:* Please scan the QR code in the console to connect the bot to WhatsApp.' });
    }

    if (connection === 'open') {
      console.log('[DEBUG] ✅ Bot connected');
      await sendToOwner(sock, { text: `✅ *Bot is now Online!!* 🎉\n\n*Current Mode:* ${botSettings.mode.toUpperCase()}\n*Global Card AutoCollector:* ${botSettings.autoCollectorGlobalEnabled ? 'ENABLED' : 'DISABLED'}\n*Global Pokémon AutoCollector:* ${botSettings.pokemonAutoCollectorGlobalEnabled ? 'ENABLED' : 'DISABLED'}\n*Uptime:* ${getUptime()}\n\nI'm ready to auto-collect cards and respond to your commands!` });
    } else if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log('[DEBUG] Connection closed. Reason:', reason);
      await sendToOwner(sock, { text: `⚠️ *Bot Connection Closed!* 💔\n\n*Reason:* ${reason || 'Unknown'}\n\nAttempting to reconnect...` });

      // Reconnect if not logged out (e.g., network issues)
      if (reason !== DisconnectReason.loggedOut) {
        console.log('[DEBUG] 🔄 Attempting to reconnect...');
        startBot(); // Restart the bot process
      } else {
        // If logged out, manual intervention is required
        console.log('❌ Bot logged out. Please delete the session_dir folder and restart to generate new QR.');
        await sendToOwner(sock, { text: '❌ *Bot Logged Out!* ⛔\n\nThis usually means the session has expired or was revoked. Please delete the `session_dir` folder and restart the bot (`node index.cjs`) to generate a new QR code for re-authentication.' });
        process.exit(1); // Exit process
      }
    }
  });

  // --- Creds Update Listener ---
  // This saves the authentication credentials whenever they change (e.g., new keys, session updates)
  sock.ev.on('creds.update', saveCreds);

  // --- Command Loading ---
  // loadCommands is now async and uses for...of for await compatibility
  const loadCommands = async () => { 
    // Ensure the commands directory exists
    if (!fs.existsSync(COMMANDS_DIR)) {
      fs.mkdirSync(COMMANDS_DIR, { recursive: true });
      console.log(`[DEBUG] Created commands directory: ${COMMANDS_DIR}`);
    }

    // Read and load all command files
    const commandFiles = fs.readdirSync(COMMANDS_DIR);
    for (const file of commandFiles) { // Use for...of for await compatibility
      if (file.endsWith('.cjs') || file.endsWith('.js')) {
        try {
          // Clear cache for hot-reloading commands (useful if you implement a reload command)
          delete require.cache[require.resolve(path.join(COMMANDS_DIR, file))];
          const cmd = require(path.join(COMMANDS_DIR, file));
          if (cmd.pattern && typeof cmd.run === 'function') {
            commands.push(cmd);
            console.log(`[DEBUG] Loaded command: ${cmd.pattern}`);
          } else {
            console.warn(`[DEBUG] Skipping invalid command file: ${file} (missing 'pattern' or 'run' function)`);
          }
        } catch (error) {
          console.error(`❌ Error loading command from ${file}:`, error);
          await sendToOwner(sock, { text: `❌ *Error Loading Command:* Failed to load \`${file}\`.\nDetails: ${error.message}` });
        }
      }
    }
  };
  await loadCommands(); // Call loadCommands with await

  // --- Message Handling ---
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    // Ignore messages from status updates.
    // `msg.key.fromMe` check is removed here to allow auto-collection from other bots.
    if (msg.key.remoteJid === 'status@broadcast' || !msg.message) return;

    const from = msg.key.remoteJid; // JID of the chat (group or private)
    const sender = msg.key.participant || from; // Actual sender's JID (for groups, this is the participant)
    const isGroup = from.endsWith('@g.us'); // Check if message is from a group
    const isOwner = sender.includes(OWNER_NUMBER); // Check if sender is the bot owner

    // Timestamp check for old messages (30 seconds threshold)
    const messageAgeSeconds = (Date.now() - (msg.messageTimestamp * 1000)) / 1000;
    if (messageAgeSeconds > 30) {
        console.log(`[DEBUG] Ignoring old message (${messageAgeSeconds.toFixed(1)}s old) from ${from}.`);
        return;
    }

    // Universal text extraction
    const body = extractMessageText(msg.message); 
    const commandText = body.trim(); // Trim whitespace for command matching

    // --- DEBUGGING LOGS FOR EVERY MESSAGE ---
    console.log(`\n--- Message Received ---`);
    console.log(`[DEBUG] Raw Message Object (key.remoteJid): ${msg.key.remoteJid}`);
    console.log(`[DEBUG] Raw Message Object (key.participant): ${msg.key.participant}`);
    console.log(`[DEBUG] Raw Message Object (key.fromMe): ${msg.key.fromMe}`); // Log this explicitly
    console.log(`[DEBUG] Raw Message Object (key.id): ${msg.key.id}`); // Log message ID
    console.log(`[DEBUG] Raw Message Object (message type): ${Object.keys(msg.message)[0]}`); // Log the actual message type
    console.log(`[DEBUG] From (derived): ${from} (isGroup: ${isGroup})`);
    console.log(`[DEBUG] Sender (derived): ${sender} (isOwner: ${isOwner})`);
    console.log(`[DEBUG] Extracted Message Body: "${body}"`); // Log extracted body
    console.log(`[DEBUG] Full Message Body (JSON.stringify): ${JSON.stringify(body)}`); // Crucial for hidden chars
    console.log(`[DEBUG] Current botSettings: ${JSON.stringify(botSettings)}`);
    console.log(`[DEBUG] Monitored Card Bot Numbers: ${JSON.stringify(MONITORED_BOT_NUMBERS)}`);
    console.log(`[DEBUG] Monitored Pokémon Bot Numbers: ${JSON.stringify(MONITORED_POKEMON_BOT_NUMBERS)}`);
    // --- END DEBUGGING LOGS ---

    // --- Pokémon Auto-Collector Logic (High Priority) ---
    console.log(`[DEBUG] Checking Pokémon AC status for this chat (${from})...`);
    const pokemonAcEnabledForChat = isPokemonAutoCollectorEnabledForChat(from);
    console.log(`[DEBUG] pokemonAcEnabledForChat(${from}) returned: ${pokemonAcEnabledForChat}`);

    // Check if the sender is one of the monitored Pokémon bots, or if no specific bots are monitored
    const isMonitoredPokemonSender = MONITORED_POKEMON_BOT_NUMBERS.length === 0 || MONITORED_POKEMON_BOT_NUMBERS.includes(sender);
    console.log(`[DEBUG] Is Monitored Pokémon Sender (${sender}): ${isMonitoredPokemonSender}`);

    const normalizedBody = normalizeText(body);
    const isPokemonSpawnMessage = normalizedBody.includes('A Wild Pokemon Has Appeared!') && normalizedBody.includes('Use *#catch <pokemon_name>*');
    console.log(`[DEBUG] Is Pokémon Spawn Message (normalized body check): ${isPokemonSpawnMessage}`);

    if (pokemonAcEnabledForChat && isMonitoredPokemonSender && isPokemonSpawnMessage && msg.message.imageMessage) {
        console.log(`[DEBUG] Pokémon spawn message detected, and all conditions met. Preparing to notify owner for manual ID.`);
        
        let imageBuffer;
        try {
            imageBuffer = await downloadMediaMessage(msg, 'buffer');
            console.log(`[DEBUG] Image buffer downloaded. Size: ${imageBuffer ? imageBuffer.length : '0'} bytes.`);
        } catch (error) {
            console.error('❌ Error downloading Pokémon image for notification:', error);
            await sendToOwner(sock, { text: `❌ *Pokémon Image Download Failed!* ⛔\n\nI detected a Pokémon spawn, but couldn't download the image to notify you. Error: ${error.message}` });
            return; // Stop processing if image can't be downloaded
        }

        if (imageBuffer) {
            // Store context for the !catch command, including the group JID
            lastPokemonSpawnContext = { jid: from, imageBuffer: imageBuffer, originalMessageText: body };

            // Send image to owner with instructions for manual catch
            await sendToOwner(sock, { 
                image: imageBuffer, 
                caption: `⚡️ *Wild Pokémon Appeared!* 🐾\n\n*Location:* ${isGroup ? `Group: ${from}` : 'Private Chat'}\n*Original Group JID:* \`${from}\`\n\nI cannot automatically identify this Pokémon. Please reply to *this message* with \`!catch <PokemonName>\` to catch it manually.` 
            });
            console.log('[DEBUG] Sent Pokémon image and manual catch instructions to owner.');
        } else {
            console.log('[DEBUG] Pokémon spawn message detected, but no image buffer found after download attempt for notification.');
        }
        return; // Stop further processing for this message as it was handled
    } else {
      console.log(`[DEBUG] Pokémon auto-collector NOT triggered for chat ${from}. One or more conditions failed.`);
    }


    // --- Card Auto-Collector Logic (High Priority & Advanced Detection) ---
    console.log(`[DEBUG] Checking Card AC status for this chat (${from})...`);
    const cardAcEnabledForChat = isAutoCollectorEnabledForChat(from); 
    console.log(`[DEBUG] isAutoCollectorEnabledForChat(${from}) returned: ${cardAcEnabledForChat}`);
    
    // Check if the sender is one of the monitored card bots, or if no specific bots are monitored
    const isMonitoredCardSender = MONITORED_BOT_NUMBERS.length === 0 || MONITORED_BOT_NUMBERS.includes(sender);
    console.log(`[DEBUG] Is Monitored Card Sender (${sender}): ${isMonitoredCardSender}`);

    // Attempt to parse the message as a card
    const parsedCard = parseCardMessage(body);

    console.log(`[DEBUG] Card Auto-collector conditions:`);
    console.log(`[DEBUG]   - AC Enabled for Chat: ${cardAcEnabledForChat}`);
    console.log(`[DEBUG]   - Is Monitored Card Sender: ${isMonitoredCardSender}`);
    console.log(`[DEBUG]   - Card message parsed successfully: ${!!parsedCard}`); // Convert object to boolean

    if (cardAcEnabledForChat && isMonitoredCardSender && parsedCard) {
      console.log(`[DEBUG] All card auto-collector conditions met for chat: ${from}. Adding to queue.`);
      const { captcha, name, tier, description, price, cardMaker } = parsedCard;
        
      addCollectionActionToQueue({ 
          type: 'card', 
          targetJid: from, 
          command: `#collect ${captcha}`, 
          details: { name, tier, description, captcha, price, cardMaker, time: new Date().toISOString(), groupJid: from, groupName: isGroup ? (await sock.groupMetadata(from).catch(() => null))?.subject || 'Unknown Group' : 'Private Chat' }
      }, sock);
      return; // Stop further processing for this message as it was handled
    } else {
      console.log(`[DEBUG] Card auto-collector NOT triggered for chat ${from}. One or more conditions failed.`);
    }

    // --- Command Handling ---
    // Only process messages that start with '!' as commands
    if (commandText.startsWith('!')) {
      console.log(`[DEBUG] Command received: ${commandText} from ${sender}`);
      // Private mode check: If bot is in private mode, only owner can use commands
      if (botSettings.mode === 'private' && !isOwner) {
        console.log(`[DEBUG] Blocked non-owner command '${commandText}' in private mode from: ${sender}`);
        await sendToOwner(sock, { text: '🚫 *Command Blocked!* ⛔\n\nI am currently in *PRIVATE* mode. Only the owner can use commands.' });
        return;
      }

      // --- Built-in Commands ---
      
      // Command: !help
      if (commandText === '!help') {
          let helpMessage = '📚 *Bot Commands List:*\n\n';
          helpMessage += '*--- General Commands ---*\n';
          helpMessage += '`!help` - Show this command list.\n';
          helpMessage += '`!uptime` - Check bot\'s uptime.\n';
          helpMessage += '`!stats` - Show bot collection statistics.\n';
          helpMessage += '`!setmode <public/private>` - Change bot\'s operational mode (Owner only).\n';
          helpMessage += '`!restart` - Restart the bot (Owner only).\n';
          helpMessage += '`!shutdown` - Shut down the bot (Owner only).\n';
          helpMessage += '`!cards` - List collected cards.\n';
          helpMessage += '`!cards-info` - Show detailed info for collected cards.\n';
          helpMessage += '`!pokemon` - List collected Pokémon.\n';
          helpMessage += '`!status` - Show detailed auto-collector status and group overrides (Owner only).\n';
          helpMessage += '`!clearinventory` - Clear all collected cards and Pokémon (Owner only, requires confirmation).\n';
          helpMessage += '`!{} (reply to message)` - Get JID of quoted message sender (Owner only).\n\n';

          helpMessage += '*--- Auto-Collector Control (Owner Only) ---*\n';
          helpMessage += '`!π .` - Enable Card AC for current group.\n';
          helpMessage += '`!π ..` - Enable Card AC globally.\n';
          helpMessage += '`!π ...` - Disable Card AC for current group.\n';
          helpMessage += '`!π ....` - Disable Card AC globally.\n';
          helpMessage += '`!√ .` - Enable Pokémon AC for current group.\n';
          helpMessage += '`!√ ..` - Enable Pokémon AC globally.\n';
          helpMessage += '`!√ ...` - Disable Pokémon AC for current group.\n';
          helpMessage += '`!√ ....` - Disable Pokémon AC globally.\n';
          helpMessage += '`!catch <PokemonName> (reply to bot\'s DM)` - Manually catch Pokémon after bot sends image to DM.\n\n';
          helpMessage += '`!sendtestmessages <amount> <JID> <delay_ms> [message]` - Send test messages to a JID (Owner only, with safeguards).\n\n';


          if (commands.length > 0) {
              helpMessage += '*--- Plugin Commands ---*\n';
              commands.forEach(cmd => {
                  helpMessage += `\`${cmd.pattern}\` - ${cmd.description || 'No description provided.'}\n`;
              });
          } else {
              helpMessage += '_No plugin commands loaded._\n';
          }

          await sendToOwner(sock, { text: helpMessage });
          console.log('[DEBUG] Help list sent to owner.');
          return;
      }

      // Command: !uptime
      if (commandText === '!uptime') {
        await sendToOwner(sock, { text: `📊 *Bot Uptime:*\n\`\`\`${getUptime()}\`\`\`` });
        return;
      }

      // Command: !stats
      if (commandText === '!stats') {
        if (!isOwner) {
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can check stats.' });
          return;
        }
        let statsMessage = `📊 *Bot Statistics:*\n\n`;
        statsMessage += `*Uptime:* ${getUptime()}\n`;
        statsMessage += `*Current Mode:* ${botSettings.mode.toUpperCase()}\n`;
        statsMessage += `*Global Card AutoCollector:* ${botSettings.autoCollectorGlobalEnabled ? 'ENABLED' : 'DISABLED'}\n`;
        statsMessage += `*Global Pokémon AutoCollector:* ${botSettings.pokemonAutoCollectorGlobalEnabled ? 'ENABLED' : 'DISABLED'}\n`;
        statsMessage += `*Successful Collections:* ${successfulCollections}\n`;
        statsMessage += `*Failed Collections:* ${failedCollections}\n`;
        statsMessage += `*Current Initial Delay Range:* ${INITIAL_DELAY_MIN / 1000}s - ${INITIAL_DELAY_MAX / 1000}s\n`;
        statsMessage += `*Current Inter-Group Delay Range:* ${INTER_GROUP_DELAY_MIN / 1000}s - ${INTER_GROUP_DELAY_MAX / 1000}s\n`;
        await sendToOwner(sock, { text: statsMessage });
        console.log('[DEBUG] Stats sent to owner.');
        return;
      }

      // Command: !setmode <public/private>
      if (commandText.startsWith('!setmode ')) {
        if (!isOwner) { 
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can change the bot\'s mode.' });
          return;
        }
        const newMode = commandText.split(' ')[1]?.toLowerCase();
        if (newMode === 'public' || newMode === 'private') {
          if (botSettings.mode === newMode) {
            await sendToOwner(sock, { text: `ℹ️ *Bot Mode Already ${newMode.toUpperCase()}!*` });
            return;
          }
          botSettings.mode = newMode;
          saveBotSettings(); 
          await sendToOwner(sock, { text: `✅ *Bot Mode Updated!* 🎉\n\nBot is now in *${botSettings.mode.toUpperCase()}* mode.` });
          console.log(`[DEBUG] Bot mode set to: ${botSettings.mode.toUpperCase()}`);
        } else {
          await sendToOwner(sock, { text: '❌ *Invalid Mode!* 🤷‍♂️\n\nUsage: `!setmode <public/private>`\nExample: `!setmode public`' });
          console.warn(`[DEBUG] Invalid Mode command: ${commandText}`);
        }
        return;
      }

      // Command: !restart
      if (commandText === '!restart') {
        if (!isOwner) {
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can restart the bot.' });
          return;
        }
        await sendToOwner(sock, { text: '🔄 *Restarting Bot...* 🚀\n\nPlease wait a moment while I restart. I will notify you when I\'m back online.' });
        console.log('[DEBUG] Bot restarting...');
        process.exit(0); 
      }

      // Command: !shutdown
      if (commandText === '!shutdown') {
        if (!isOwner) {
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can shut down the bot.' });
          return;
        }
        await sendToOwner(sock, { text: '🔴 *Shutting Down Bot...* 😴\n\nGoodbye! To start me again, you\'ll need to run the script manually.' });
        console.log('[DEBUG] Bot shutting down...');
        process.exit(0); 
      }
      
      // Command: !cards (brief list of collected cards)
      if (commandText === '!cards') {
        if (collectedCards.length === 0) {
          await sendToOwner(sock, { text: '📦 *Inventory Empty!* 🤷‍♀️\n\nNo cards collected by the bot yet.' });
          return;
        }
        let cardList = '📦 *Collected Cards List:*\n\n';
        collectedCards.forEach((card, index) => {
          cardList += `${index + 1}. *${card.name}* (Tier: ${card.tier || 'N/A'}) - Captcha: \`${card.captcha}\`\n`;
        });
        await sendToOwner(sock, { text: cardList });
        console.log('[DEBUG] Card list sent to owner.');
        return;
      }

      // Command: !cards-info (detailed information for all collected cards)
      if (commandText === '!cards-info') {
        if (collectedCards.length === 0) {
          await sendToOwner(sock, { text: '📦 *Inventory Empty!* 🤷‍♀️\n\nNo cards collected to show detailed information.' });
          return;
        }
        let cardInfoList = 'Detailed Collected Cards Info:\n\n';
        collectedCards.forEach((card, index) => {
          cardInfoList += `--- Card ${index + 1} ---\n`;
          cardInfoList += `*Name:* ${card.name || 'N/A'}\n`;
          cardInfoList += `*Tier:* ${card.tier || 'N/A'}\n`;
          cardInfoList += `*Description:* ${card.description || 'N/A'}\n`;
          cardInfoList += `*Captcha:* \`${card.captcha || 'N/A'}\`\n`;
          cardInfoList += `*Price:* ${card.price || 'N/A'}\n`;
          cardInfoList += `*Card Maker:* ${card.cardMaker || 'N/A'}\n`;
          cardInfoList += `*Collected At:* ${new Date(card.time).toLocaleString() || 'N/A'}\n`;
          cardInfoList += `*Group/Chat:* ${card.groupName || card.groupJid || 'N/A'}\n\n`;
        });
        await sendToOwner(sock, { text: cardInfoList });
        console.log('[DEBUG] Detailed card info sent to owner.');
        return;
      }

      // Command: !pokemon (brief list of collected Pokémon)
      if (commandText === '!pokemon') {
        if (collectedPokemon.length === 0) {
          await sendToOwner(sock, { text: '🐾 *Pokémon Inventory Empty!* 🤷‍♀️\n\nNo Pokémon collected by the bot yet.' });
          return;
        }
        let pokemonList = '🐾 *Collected Pokémon List:*\n\n';
        collectedPokemon.forEach((poke, index) => {
          pokemonList += `${index + 1}. *${poke.name}*\n`;
        });
        await sendToOwner(sock, { text: pokemonList });
        console.log('[DEBUG] Pokémon list sent to owner.');
        return;
      }

      // Command: !status (Live Group Scanner) - This is the ONLY exception for owner DM replies for status.
      if (commandText === '!status') {
        if (!isOwner) {
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can check the bot\'s status.' });
          return;
        }
        let statusMessage = `📊 *Bot Status Report:*\n\n*Current Mode:* ${botSettings.mode.toUpperCase()}\n*Global Card AutoCollector:* ${botSettings.autoCollectorGlobalEnabled ? 'ENABLED' : 'DISABLED'}\n*Global Pokémon AutoCollector:* ${botSettings.pokemonAutoCollectorGlobalEnabled ? 'ENABLED' : 'DISABLED'}\n*Uptime:* ${getUptime()}\n\n`;
        
        statusMessage += `*Card AutoCollector Group Overrides:*\n`;
        const cardGroupJids = Object.keys(botSettings.groupSpecificAutoCollector);
        if (cardGroupJids.length === 0) {
            statusMessage += `  _No specific card group overrides set._\n`;
        } else {
            for (const jid of cardGroupJids) {
                const groupMetadata = await sock.groupMetadata(jid).catch(() => null);
                const groupName = groupMetadata ? groupMetadata.subject : jid;
                const status = botSettings.groupSpecificAutoCollector[jid] ? 'ENABLED' : 'DISABLED';
                statusMessage += `  - *${groupName}*: ${status}\n`;
            }
        }
        statusMessage += `\n*Pokémon AutoCollector Group Overrides:*\n`; 
        const pokemonGroupJids = Object.keys(botSettings.groupSpecificPokemonAutoCollector); 
        if (pokemonGroupJids.length === 0) { 
            statusMessage += `  _No specific Pokémon group overrides set._\n`;
        } else {
            for (const jid of pokemonGroupJids) { 
                const groupMetadata = await sock.groupMetadata(jid).catch(() => null);
                const groupName = groupMetadata ? groupMetadata.subject : jid;
                const status = botSettings.groupSpecificPokemonAutoCollector[jid] ? 'ENABLED' : 'DISABLED';
                statusMessage += `  - *${groupName}*: ${status}\n`;
            }
        }

        statusMessage += `\n*Monitored Card Bot Numbers:*\n`;
        if (MONITORED_BOT_NUMBERS.length === 0) {
            statusMessage += `  _Monitoring card messages from all senders._\n`;
        } else {
            MONITORED_BOT_NUMBERS.forEach(botJid => {
                statusMessage += `  - \`${botJid}\`\n`;
            });
        }
        statusMessage += `\n*Monitored Pokémon Bot Numbers:*\n`; 
        if (MONITORED_POKEMON_BOT_NUMBERS.length === 0) { 
            statusMessage += `  _Monitoring Pokémon messages from all senders._\n`;
        } else {
            MONITORED_POKEMON_BOT_NUMBERS.forEach(botJid => { 
                statusMessage += `  - \`${botJid}\`\n`;
            });
        }

        await sendToOwner(sock, { text: statusMessage }); 
        console.log('[DEBUG] Status report sent to owner.');
        return;
      }

      // Command: !clearinventory
      if (commandText === '!clearinventory') {
          if (!isOwner) {
              await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can clear the inventory.' });
              return;
          }
          // Request confirmation
          await sendToOwner(sock, { text: '⚠️ *Confirm Clear Inventory!* ⚠️\n\nAre you sure you want to delete ALL collected cards and Pokémon?\n\n*Reply with `!confirm clear` to proceed.* This action cannot be undone.' });
          console.warn('[DEBUG] Owner requested !clearinventory. Awaiting confirmation.');
          return;
      }

      // Confirmation for !clearinventory
      if (commandText === '!confirm clear') {
          if (!isOwner) {
              await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can confirm this action.' });
              return;
          }
          collectedCards = [];
          collectedPokemon = [];
          saveInventory();
          savePokemonInventory();
          successfulCollections = 0;
          failedCollections = 0;
          saveBotSettings(); // Save updated stats
          await sendToOwner(sock, { text: '✅ *Inventory Cleared!* 🎉\n\nAll collected cards and Pokémon have been removed. Stats reset.' });
          console.log('[DEBUG] Inventory cleared by owner.');
          return;
      }


      // --- AutoCollector Enable/Disable Commands (Granular Control with Better Feedback) ---
      // These commands now only work for the current group (no JID argument)

      // Command: !π . (Enable for a specific GC) - Card AutoCollector
      if (commandText === '!π .') {
        if (!isOwner) {
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can manage AutoCollector settings.' });
          return;
        }
        if (!isGroup) {
          await sendToOwner(sock, { text: '❌ *Command Usage Error!* 🤷‍♂️\n\n`!π .` can only be used *inside a group* to enable Card AutoCollector for that specific group.' });
          return;
        }
        const groupMetadata = await sock.groupMetadata(from).catch(() => null);
        const groupName = groupMetadata ? groupMetadata.subject : from;

        if (botSettings.groupSpecificAutoCollector[from] === true) {
          await sendToOwner(sock, { text: `ℹ️ *Card AutoCollector Already Enabled!* ✅\n\nCard AutoCollector is already active for group: *${groupName}*.` });
          return;
        }

        botSettings.groupSpecificAutoCollector[from] = true;
        saveBotSettings();
        await sendToOwner(sock, { text: `✅ *Card AutoCollector Activated!* 🎉\n\nI will now actively monitor for cards in group: *${groupName}*.\n\n_Note: This setting overrides global Card AutoCollector status for this group._` });
        console.log(`[DEBUG] Card AutoCollector Enabled for ${groupName} (${from}) by owner.`);
        return;
      }

      // Command: !π .. (Enable overall all GCs bot is in) - Card AutoCollector
      if (commandText === '!π ..') {
        if (!isOwner) {
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can manage AutoCollector settings.' });
          return;
        }
        if (botSettings.autoCollectorGlobalEnabled === true) {
          await sendToOwner(sock, { text: 'ℹ️ *Card AutoCollector Already Enabled Globally!* ✅\n\nCard AutoCollector is already active for all chats.' });
          return;
        }
        botSettings.autoCollectorGlobalEnabled = true;
        botSettings.groupSpecificAutoCollector = {}; // Clear group-specific overrides when global is set
        saveBotSettings();
        await sendToOwner(sock, { text: '✅ *Card AutoCollector Activated Globally!* 🎉\n\nI will now actively monitor *all chats* I am in for card messages and automatically collect them when detected.\n\n_Note: All group-specific Card AutoCollector settings have been reset._' });
        console.log('[DEBUG] Card AutoCollector Enabled globally by owner.');
        return;
      }

      // Command: !π ... (Disable in a specific GC) - Card AutoCollector
      if (commandText === '!π ...') {
        if (!isOwner) {
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can manage AutoCollector settings.' });
          return;
        }
        if (!isGroup) {
          await sendToOwner(sock, { text: '❌ *Command Usage Error!* 🤷‍♂️\n\n`!π ...` can only be used *inside a group* to disable Card AutoCollector for that specific group.' });
          return;
        }
        const groupMetadata = await sock.groupMetadata(from).catch(() => null);
        const groupName = groupMetadata ? groupMetadata.subject : from;

        if (botSettings.groupSpecificAutoCollector[from] === false) {
          await sendToOwner(sock, { text: `ℹ️ *Card AutoCollector Already Disabled!* 🛑\n\nCard AutoCollector is already inactive for group: *${groupName}*.` });
          return;
        }

        botSettings.groupSpecificAutoCollector[from] = false;
        saveBotSettings();
        await sendToOwner(sock, { text: `❌ *Card AutoCollector Deactivated!* 🛑\n\nI will no longer automatically collect cards in group: *${groupName}*.\n\n_Note: This setting overrides global Card AutoCollector status for this group._` });
        console.log(`[DEBUG] Card AutoCollector Disabled for ${groupName} (${from}) by owner.`);
        return;
      }

      // Command: !π .... (Disable overall all GCs bot is in) - Card AutoCollector
      if (commandText === '!π ....') {
        if (!isOwner) {
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can manage AutoCollector settings.' });
          return;
        }
        if (botSettings.autoCollectorGlobalEnabled === false) {
          await sendToOwner(sock, { text: 'ℹ️ *Card AutoCollector Already Disabled Globally!* 🛑\n\nCard AutoCollector is already inactive for all chats.' });
          return;
        }
        botSettings.autoCollectorGlobalEnabled = false;
        botSettings.groupSpecificAutoCollector = {}; // Clear group-specific overrides when global is set
        saveBotSettings();
        await sendToOwner(sock, { text: '❌ *Card AutoCollector Deactivated Globally.* 🛑\n\nI will no longer automatically collect cards in *any chat*.\n\n_Note: All group-specific Card AutoCollector settings have been reset._' });
        console.log('[DEBUG] Card AutoCollector Disabled globally by owner.');
        return;
      }

      // Command: !√ . (Enable for a specific GC) - Pokémon AutoCollector
      if (commandText === '!√ .') {
        if (!isOwner) {
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can manage Pokémon AutoCollector settings.' });
          return;
        }
        if (!isGroup) {
          await sendToOwner(sock, { text: '❌ *Command Usage Error!* 🤷‍♂️\n\n`!√ .` can only be used *inside a group* to enable Pokémon AutoCollector for that specific group.' });
          return;
        }
        const groupMetadata = await sock.groupMetadata(from).catch(() => null);
        const groupName = groupMetadata ? groupMetadata.subject : from;

        if (botSettings.groupSpecificPokemonAutoCollector[from] === true) {
          await sendToOwner(sock, { text: `ℹ️ *Pokémon AutoCollector Already Enabled!* ✅\n\nPokémon AutoCollector is already active for group: *${groupName}*.` });
          return;
        }

        botSettings.groupSpecificPokemonAutoCollector[from] = true;
        saveBotSettings();
        await sendToOwner(sock, { text: `✅ *Pokémon AutoCollector Activated!* 🎉\n\nI will now actively monitor for Pokémon in group: *${groupName}*.\n\n_Note: This setting overrides global Pokémon AutoCollector status for this group._` });
        console.log(`[DEBUG] Pokémon AutoCollector Enabled for ${groupName} (${from}) by owner.`);
        return;
      }

      // Command: !√ .. (Enable overall all GCs bot is in) - Pokémon AutoCollector
      if (commandText === '!√ ..') {
        if (!isOwner) {
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can manage Pokémon AutoCollector settings.' });
          return;
        }
        if (botSettings.pokemonAutoCollectorGlobalEnabled === true) {
          await sendToOwner(sock, { text: 'ℹ️ *Pokémon AutoCollector Already Enabled Globally!* ✅\n\nPokémon AutoCollector is already active for all chats.' });
          return;
        }
        botSettings.pokemonAutoCollectorGlobalEnabled = true;
        botSettings.groupSpecificPokemonAutoCollector = {}; // Clear group-specific overrides
        saveBotSettings();
        await sendToOwner(sock, { text: '✅ *Pokémon AutoCollector Activated Globally!* 🎉\n\nI will now actively monitor *all chats* I am in for Pokémon spawn messages and automatically catch them when detected.\n\n_Note: All group-specific Pokémon AutoCollector settings have been reset._' });
        console.log('[DEBUG] Pokémon AutoCollector Enabled globally by owner.');
        return;
      }

      // Command: !√ ... (Disable in a specific GC) - Pokémon AutoCollector
      if (commandText === '!√ ...') {
        if (!isOwner) {
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can manage Pokémon AutoCollector settings.' });
          return;
        }
        if (!isGroup) {
          await sendToOwner(sock, { text: '❌ *Command Usage Error!* 🤷‍♂️\n\n`!√ ...` can only be used *inside a group* to disable Pokémon AutoCollector for that specific group.' });
          return;
        }
        const groupMetadata = await sock.groupMetadata(from).catch(() => null);
        const groupName = groupMetadata ? groupMetadata.subject : from;

        if (botSettings.groupSpecificPokemonAutoCollector[from] === false) {
          await sendToOwner(sock, { text: `ℹ️ *Pokémon AutoCollector Already Disabled!* 🛑\n\nPokémon AutoCollector is already inactive for group: *${groupName}*.` });
          return;
        }

        botSettings.groupSpecificPokemonAutoCollector[from] = false;
        saveBotSettings();
        await sendToOwner(sock, { text: `❌ *Pokémon AutoCollector Deactivated!* 🛑\n\nI will no longer automatically catch Pokémon in group: *${groupName}*.\n\n_Note: This setting overrides global Pokémon AutoCollector status for this group._` });
        console.log(`[DEBUG] Pokémon AutoCollector Disabled for ${groupName} (${from}) by owner.`);
        return;
      }

      // Command: !√ .... (Disable overall all GCs bot is in) - Pokémon AutoCollector
      if (commandText === '!√ ....') {
        if (!isOwner) {
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can manage Pokémon AutoCollector settings.' });
          return;
        }
        if (botSettings.pokemonAutoCollectorGlobalEnabled === false) {
          await sendToOwner(sock, { text: 'ℹ️ *Pokémon AutoCollector Already Disabled Globally!* 🛑\n\nPokémon AutoCollector is already inactive for all chats.' });
          return;
        }
        botSettings.pokemonAutoCollectorGlobalEnabled = false;
        botSettings.groupSpecificPokemonAutoCollector = {}; // Clear group-specific overrides
        saveBotSettings();
        await sendToOwner(sock, { text: '❌ *Pokémon AutoCollector Deactivated Globally.* 🛑\n\nI will no longer automatically catch Pokémon in *any chat*.\n\n_Note: All group-specific Pokémon AutoCollector settings have been reset._' });
        console.log('[DEBUG] Pokémon AutoCollector Disabled globally by owner.');
        return;
      }

      // Command: !{} (Get quoted message sender's JID)
      if (commandText === '!{}') {
        if (!isOwner) {
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can use this command.' });
          return;
        }
        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quotedMessage) {
          const quotedSenderJid = msg.message.extendedTextMessage.contextInfo.participant || msg.message.extendedTextMessage.contextInfo.remoteJid;
          if (quotedSenderJid) {
            await sendToOwner(sock, { text: `ℹ️ *Quoted Sender JID:*\n\`\`\`${quotedSenderJid}\`\`\`` });
            console.log(`[DEBUG] Quoted JID ${quotedSenderJid} sent to owner.`);
          } else {
            await sendToOwner(sock, { text: '❌ *Could not get JID of quoted message sender.* 🤷‍♂️\n\nMake sure the quoted message has a valid sender JID.' });
            console.warn(`[DEBUG] Could not get quoted JID for command !{}.`);
          }
        } else {
          await sendToOwner(sock, { text: '❌ *No message quoted!* 🤷‍♂️\n\nTo use `!{}`, you must reply to a message.' });
          console.warn(`[DEBUG] !{} command used without quoting a message.`);
        }
        return;
      }

      // Command: !catch <pokemon_name> (Manual Pokémon catch after owner identification)
      // This command is specifically designed to be a REPLY to the bot's own Pokémon notification in owner DM.
      if (commandText.startsWith('!catch ')) {
        if (!isOwner) {
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can use this command.' });
          return;
        }
        const pokemonName = commandText.substring('!catch '.length).trim();
        if (!pokemonName) {
          await sendToOwner(sock, { text: '❌ *Invalid Command!* 🤷‍♂️\n\nUsage: `!catch <PokemonName>`\nExample: `!catch Pikachu`' });
          return;
        }

        // Check if this command is a reply to the bot's own Pokémon notification
        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const isReplyToBotPokemonNotification = quotedMessage && 
                                                quotedMessage.imageMessage?.caption?.includes('Wild Pokémon Appeared!') &&
                                                quotedMessage.imageMessage?.caption?.includes('I cannot automatically identify this Pokémon.') &&
                                                msg.key.remoteJid === OWNER_JID && // Ensure it's a DM reply to bot
                                                lastPokemonSpawnContext.jid; // Ensure there's a stored context

        if (isReplyToBotPokemonNotification) {
            console.log(`[DEBUG] Owner manually identified Pokémon as "${pokemonName}". Adding to queue for collection.`);
            addCollectionActionToQueue({ 
                type: 'pokemon', 
                targetJid: lastPokemonSpawnContext.jid, // Use the stored JID from context
                command: `#catch ${pokemonName}`, 
                details: { name: pokemonName, time: new Date().toISOString(), groupJid: lastPokemonSpawnContext.jid, groupName: 'Manual Catch' }
            }, sock);
            await sendToOwner(sock, { text: `✅ *Manual Catch Initiated!* 🎉\n\nAttempting to catch *${pokemonName}* in the original chat. Check logs for status.` });
            lastPokemonSpawnContext = {}; // Clear context after use
        } else {
            await sendToOwner(sock, { text: '❌ *Manual Catch Failed!* 🤷‍♂️\n\nThis command must be used as a reply to the bot\'s "Wild Pokémon Appeared!" notification, or the context is too old/missing.' });
            console.warn(`[DEBUG] Manual catch failed: Not a reply to bot's notification or context missing.`);
        }
        return;
      }

      // NEW: Command: !sendtestmessages <amount> <target_JID> <delay_ms> [message_content]
      if (commandText.startsWith('!sendtestmessages ')) {
        if (!isOwner) {
          await sendToOwner(sock, { text: '🚫 *Permission Denied!* ⛔\n\nOnly the bot owner can use this command.' });
          return;
        }

        const args = commandText.split(' ').slice(1); // Remove '!sendtestmessages '
        const amount = parseInt(args[0], 10);
        const targetJid = args[1];
        const delayMs = parseInt(args[2], 10);
        const messageContent = args.slice(3).join(' ') || 'Test message';

        if (isNaN(amount) || amount <= 0 || isNaN(delayMs) || delayMs < MIN_TEST_MESSAGE_DELAY || !targetJid) {
          await sendToOwner(sock, { text: `❌ *Invalid Usage!* 🤷‍♂️\n\nUsage: \`!sendtestmessages <amount> <JID> <delay_ms> [message]\`\n\n*Safeguards:*\n- Amount (1-${MAX_TEST_MESSAGES})\n- Delay (min ${MIN_TEST_MESSAGE_DELAY}ms)\n\nExample: \`!sendtestmessages 10 1234567890@s.whatsapp.net 1000 Hello!\`` });
          console.warn(`[DEBUG] Invalid !sendtestmessages command usage: ${commandText}`);
          return;
        }

        if (amount > MAX_TEST_MESSAGES) {
          await sendToOwner(sock, { text: `⚠️ *Amount Too High!* ⛔\n\nMaximum messages allowed per command is ${MAX_TEST_MESSAGES}. Please reduce the amount.` });
          console.warn(`[DEBUG] !sendtestmessages amount too high: ${amount}`);
          return;
        }

        if (!targetJid.includes('@s.whatsapp.net') && !targetJid.includes('@g.us')) {
            await sendToOwner(sock, { text: '❌ *Invalid Target JID!* 🤷‍♂️\n\nPlease provide a valid WhatsApp JID (e.g., `1234567890@s.whatsapp.net` or `groupid@g.us`).' });
            console.warn(`[DEBUG] Invalid target JID for !sendtestmessages: ${targetJid}`);
            return;
        }

        await sendToOwner(sock, { text: `🚀 *Sending ${amount} test messages to \`${targetJid}\` with ${delayMs}ms delay...*` });
        console.log(`[DEBUG] Initiating sending of ${amount} test messages to ${targetJid} with ${delayMs}ms delay.`);

        for (let i = 1; i <= amount; i++) {
          try {
            await sock.sendMessage(targetJid, { text: `${messageContent} [${i}/${amount}]` }, { ephemeralExpiration: 0 });
            console.log(`[DEBUG] Sent test message ${i} to ${targetJid}.`);
            if (i < amount) { // Don't delay after the last message
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
          } catch (error) {
            console.error(`❌ Failed to send test message ${i} to ${targetJid}:`, error);
            await sendToOwner(sock, { text: `❌ *Failed to send test message ${i} to \`${targetJid}\`!* ⛔\n\nError: ${error.message}` });
            // Optionally break or continue based on desired robustness
          }
        }
        await sendToOwner(sock, { text: `✅ *Finished sending ${amount} test messages to \`${targetJid}\`.*` });
        console.log(`[DEBUG] Finished sending ${amount} test messages to ${targetJid}.`);
        return;
      }


      // --- Dynamic Plugin Commands ---
      // Iterate through loaded commands from the 'plugins/commands' directory
      for (const cmd of commands) {
        if (commandText.startsWith(cmd.pattern)) {
          console.log(`[DEBUG] Executing plugin command: ${cmd.pattern} from sender: ${sender}`);
          try {
            // Pass the socket, message, config, and extended bot state/helpers to the command's run function
            await cmd.run(sock, msg, config, {
              isAutoCollectorEnabledForChat: isAutoCollectorEnabledForChat(from), 
              isPokemonAutoCollectorEnabledForChat: isPokemonAutoCollectorEnabledForChat(from), 
              setAutoCollectorGlobal: val => { botSettings.autoCollectorGlobalEnabled = val; saveBotSettings(); },
              setGroupAutoCollector: (jid, val) => { botSettings.groupSpecificAutoCollector[jid] = val; saveBotSettings(); },
              setPokemonAutoCollectorGlobal: val => { botSettings.pokemonAutoCollectorGlobalEnabled = val; saveBotSettings(); }, 
              setGroupPokemonAutoCollector: (jid, val) => { botSettings.groupSpecificPokemonAutoCollector[jid] = val; saveBotSettings(); }, 
              getBotMode: () => botSettings.mode,
              setBotMode: val => { botSettings.mode = val; saveBotSettings(); },
              isOwner,
              isGroup,
              sendToOwner, // Allow plugin commands to send messages to the owner 
              getUptime,
              collectedCards, 
              addCardToInventory, 
              saveInventory, 
              collectedPokemon, 
              addPokemonToInventory, 
              savePokemonInventory 
            });
          } catch (error) {
            console.error(`❌ Error running plugin command ${cmd.pattern}:`, error);
            await sendToOwner(sock, { 
              text: `❌ *Plugin Command Error!* ⚠️\n\nAn error occurred while executing command \`${cmd.pattern}\`.\nDetails: ${error.message}\n\nPlease check the bot's console for more details.` 
            });
          }
          return; // Stop after the first matching command is executed
        }
      }
      // If no command matches, send an unknown command message to the owner
      console.warn(`[DEBUG] Unknown Command: ${commandText} from ${sender}`);
      await sendToOwner(sock, { text: `❓ *Unknown Command!* 🤷‍♂️\n\nI didn't recognize the command: \`${commandText}\`\n\nType \`!help\` for a list of available commands.` });
    }
  });
}

// Start the bot
startBot();

