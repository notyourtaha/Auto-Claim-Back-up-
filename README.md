🤖 AutoCollector WhatsApp Bot
A powerful and customizable WhatsApp bot designed to automate the collection of cards and Pokémon from specific game bots, featuring human-like behavior, robust management commands, and inventory tracking.
✨ Features
 * Automated Card & Pokémon Collection: Automatically detects and sends collection commands for specified game bots.
 * Human-like Behavior:
   * Randomized Delays: Uses random delays (3-6 seconds) before sending collection commands to mimic human response times.
   * Typing Indicator: Displays "typing..." presence before sending collection commands for added realism.
 * Configurable Auto-Collection:
   * Global enable/disable for both card and Pokémon auto-collection.
   * Group-specific enable/disable to fine-tune where the bot operates.
 * Manual Pokémon Catch: If the bot cannot identify a Pokémon from an image, it sends the image to the owner's DM for manual identification and allows a !catch command reply.
 * Collection Statistics: Tracks successful and failed collection attempts.
 * Owner-Only Commands: Critical management commands are restricted to the bot owner.
 * Bot Management: Commands to change bot mode (public/private), restart, or shut down the bot.
 * Inventory Management: Lists collected cards and Pokémon, and allows clearing the inventory.
 * JID Extraction: A utility command to easily get the JID of a quoted message sender.
 * Test Message Sending: A safeguarded command to send a specified number of test messages to a target with a configurable delay.
 * Persistent Settings: Bot settings, inventory, and collection statistics are saved to files and persist across restarts.
 * Pop-up Prevention: Aggressively prevents the "This message will not disappear from the chat" pop-up.
 * Extensible Plugin System: Easily add new custom commands by creating files in the plugins/commands directory.
⚙️ Prerequisites
Before you begin, ensure you have the following:
 * Node.js: Version 18.x or higher.
 * npm: Node Package Manager, which comes with Node.js.
 * Git: For cloning the repository.
 * A WhatsApp Account: This will be the account your bot uses. It's recommended to use a dedicated number.
 * Termux (for Android users): A powerful terminal emulator for Android that allows you to run a Linux environment.
 * A stable internet connection on the device hosting the bot.
🚀 Installation & Setup on Termux
This guide provides a complete process for setting up and running your bot on an Android device using Termux.
1. Install Termux
 * Important: Install Termux from F-Droid (https://f-droid.org/packages/com.termux/) or the Termux GitHub releases page. The version on Google Play Store is often outdated.
2. Update Termux Packages
 * Open Termux.
 * Update and upgrade all packages:
   pkg update && pkg upgrade -y

3. Install Necessary Tools
 * Install git (for cloning the repository) and nodejs (which includes npm):
   pkg install git nodejs -y

4. Clone the Bot Repository
 * Navigate to your desired directory (e.g., your home directory in Termux).
 * Clone the bot's GitHub repository:
   cd ~
git clone https://github.com/notyourtaha/Auto-Claim-Back-up-.git

   This will create a folder named Auto-Claim-Back-up-.git in your Termux home directory.
5. Navigate into the Bot's Directory
 * Change your current directory to the bot's folder:
   cd Auto-Claim-Back-up-.git

6. Install Node.js Dependencies
 * Install all required Node.js packages:
   npm install

 * Ensure Baileys (the WhatsApp library) is up-to-date:
   npm install @whiskeysockets/baileys@latest

7. Create config.cjs
 * Create a file named config.cjs in the bot's root directory (same level as index.cjs). You can use a text editor like nano or vim in Termux:
   nano config.cjs

 * Paste the following content into the file. Remember to replace 923004204338 with your actual WhatsApp number (without + or spaces).
   // config.cjs
module.exports = {
  // Your WhatsApp number without any leading '+' or spaces.
  ownerNumber: '923004204338', 

  // Bot's operational mode:
  // 'private': Only the owner can use commands and receive notifications.
  // 'public': Everyone can use commands (auto-collector enable/disable remains owner-only).
  mode: 'private', // Initial mode. Can be changed via !setmode command.

  // Array of WhatsApp JIDs (numbers) of the bots your bot should specifically monitor for cards.
  // Set to the JID(s) of your card/Pokémon spawn bots.
  monitoredBotNumbers: [
    '919410207027@s.whatsapp.net', // Example JID
    '2348163376700@s.whatsapp.net', // Example JID
    '18765468192@s.whatsapp.net',   // Example JID
  ],

  // Array of WhatsApp JIDs (numbers) of the bots your bot should specifically monitor for Pokémon spawns.
  // Set to the JID(s) of your card/Pokémon spawn bots.
  monitoredPokemonBotNumbers: [
    '919410207027@s.whatsapp.net', // Example JID
    '2348163376700@s.whatsapp.net', // Example JID
    '18765468192@s.whatsapp.net',   // Example JID
  ],

  // Collection delay ranges in milliseconds for human-like behavior
  collectionDelays: {
    initial: { // Delay before sending the first collection command for a spawn
      min: 3000, // Minimum 3 seconds
      max: 6000  // Maximum 6 seconds
    },
    interGroup: { // Delay between sending collection commands to different groups if multiple spawns
      min: 1000, // Minimum 1 second
      max: 2000  // Maximum 2 seconds
    }
  }
};

 * Save the file (in nano, press Ctrl+X, then Y to confirm, then Enter).
8. Initial Run & QR Code Scan
 * Run the bot for the first time. It will generate a QR code in your Termux terminal.
   node index.cjs

 * Scan this QR code using your WhatsApp app on another phone (or the same phone if you can split-screen/switch apps quickly). Go to WhatsApp Settings -> Linked Devices -> Link a Device.
 * A session_dir folder will be created in the bot's directory to store your session data. Do not delete this folder unless you want to re-authenticate.
9. Enable Auto-Collectors
 * After the bot connects and sends you an "Online" message in your WhatsApp DM, you must enable the auto-collectors:
   * To enable global card auto-collection, send !π .. to the bot in your DM.
   * To enable global Pokémon auto-collection, send !√ .. to the bot in your DM.
   * You will receive confirmation messages.
🏃 Running the Bot on Termux
Running in the Foreground (for testing/monitoring):
 * Simply execute:
   node index.cjs

 * The bot's output will be visible in the Termux terminal. If you close Termux or your phone goes to deep sleep, the bot will stop.
Running in the Background (Recommended for continuous operation):
To keep the bot running even if Termux is closed or your phone screen is off, use pm2 (a Node.js process manager).
 * Install PM2:
   npm install -g pm2

 * Start the Bot with PM2:
   Make sure you are in the bot's directory (cd Auto-Claim-Back-up-.git).
   pm2 start index.cjs --name autocollector-bot

   You should see output indicating the bot has started.
 * Save PM2 Configuration (Optional, but Recommended):
   This command ensures PM2 will automatically restart your bot if your device reboots.
   pm2 save

   PM2 might ask you to run a command to set up startup scripts. Follow its instructions.
 * Manage PM2 Processes:
   * View logs: pm2 logs autocollector-bot
   * List all PM2 processes: pm2 list
   * Stop the bot: pm2 stop autocollector-bot
   * Restart the bot: pm2 restart autocollector-bot
   * Delete the process from PM2: pm2 delete autocollector-bot
Keeping Termux Awake (Crucial for Background Operation)
For the bot to run reliably in the background, you need to prevent Termux from being killed by Android's battery optimization.
 * Acquire a Wake Lock:
   Inside Termux, run:
   termux-wake-lock

   This will keep the CPU awake. You'll see a persistent notification from Termux. To release the wake lock, run termux-wake-unlock.
 * Disable Battery Optimization for Termux:
   * Go to your Android device's Settings.
   * Search for "Battery optimization" or "App battery usage".
   * Find "Termux" in the list.
   * Set it to "Don't optimize" or "Unrestricted" (exact wording varies by Android version).
 * Lock Termux in Recents (Optional):
   * Open your phone's recent apps screen.
   * Long-press on the Termux app card.
   * Look for an option like "Lock" or a padlock icon to prevent it from being swiped away or killed by the system.
💬 Bot Commands
All commands start with !. Commands marked "(Owner only)" can only be used by the ownerNumber defined in config.cjs.
General Commands
 * !help: Displays a list of all available commands.
 * !uptime: Shows how long the bot has been running.
 * !stats (Owner only): Displays bot collection statistics (successful/failed collections).
 * !setmode <public/private> (Owner only): Changes the bot's operational mode.
   * public: Everyone can use general commands.
   * private: Only the owner can use commands.
 * !restart (Owner only): Restarts the bot process.
 * !shutdown (Owner only): Shuts down the bot process.
 * !{} (reply to message) (Owner only): Gets the WhatsApp JID (e.g., number@s.whatsapp.net or group@g.us) of the sender of a quoted message.
 * !sendtestmessages <amount> <JID> <delay_ms> [message] (Owner only): Sends a specified amount of messages to a JID with a delay_ms between each. Optional message content.
   * Safeguards: Max amount is 200, min delay_ms is 500ms to prevent WhatsApp bans.
Inventory & Status Commands
 * !cards: Lists a brief overview of all collected cards.
 * !cards-info: Provides detailed information for all collected cards.
 * !pokemon: Lists a brief overview of all collected Pokémon.
 * !status (Owner only): Shows the current auto-collector global status and group-specific overrides.
 * !clearinventory (Owner only): Initiates a process to clear all collected cards and Pokémon data. Requires a confirmation step (!confirm clear).
Auto-Collector Control (Owner Only)
 * !π .: Enables card auto-collection for the current group where the command is sent.
 * !π ..: Enables card auto-collection globally for all chats the bot is in. This clears any group-specific overrides.
 * !π ...: Disables card auto-collection for the current group where the command is sent.
 * !π ....: Disables card auto-collection globally for all chats. This clears any group-specific overrides.
 * !√ .: Enables Pokémon auto-collection for the current group where the command is sent.
 * !√ ..: Enables Pokémon auto-collection globally for all chats the bot is in. This clears any group-specific overrides.
 * !√ ...: Disables Pokémon auto-collection for the current group where the command is sent.
 * !√ ....: Disables Pokémon auto-collection globally for all chats. This clears any group-specific overrides.
 * !catch <PokemonName> (reply to bot's DM): Used in your DM as a reply to the bot's Pokémon notification message. Tells the bot the name of the Pokémon to catch.
🔌 Extending the Bot (Plugins)
The bot is designed to be extensible through a simple plugin system for commands.
 * Create plugins/commands Directory:
   Ensure you have a folder named plugins in your bot's root directory, and inside it, a folder named commands.
   your-bot-folder/
├── index.cjs
├── config.cjs
├── plugins/
│   └── commands/
│       └── myNewCommand.cjs
└── ...

 * Create a Command File:
   Inside plugins/commands/, create a new JavaScript file (e.g., myNewCommand.cjs).
 * Command Structure:
   Each command file should export an object with at least pattern and run properties:
   // plugins/commands/myNewCommand.cjs
module.exports = {
    pattern: '!mycommand', // The command trigger (e.g., '!hello', '!greet <name>')
    description: 'A brief description of what this command does.', // Optional: for !help
    async run(sock, msg, config, helpers) {
        // sock: The Baileys socket instance (for sending messages)
        // msg: The full message object that triggered the command
        // config: Your bot's config.cjs content
        // helpers: An object containing useful functions and bot state:
        //   - isAutoCollectorEnabledForChat(jid)
        //   - isPokemonAutoCollectorEnabledForChat(jid)
        //   - setAutoCollectorGlobal(boolean)
        //   - setGroupAutoCollector(jid, boolean)
        //   - setPokemonAutoCollectorGlobal(boolean)
        //   - setGroupPokemonAutoCollector(jid, boolean)
        //   - getBotMode()
        //   - setBotMode(mode)
        //   - isOwner (boolean)
        //   - isGroup (boolean)
        //   - sendToOwner(messageContent) (sends message to owner DM)
        //   - getUptime()
        //   - collectedCards (array of collected cards)
        //   - addCardToInventory(cardDetails)
        //   - saveInventory()
        //   - collectedPokemon (array of collected Pokémon)
        //   - addPokemonToInventory(pokemonDetails)
        //   - savePokemonInventory()
        //   - logActivity(level, message) (for logging to console and file)

        const { from, sender, isGroup, isOwner } = msg.key;
        const commandText = helpers.extractMessageText(msg.message); // Helper to get command text

        if (!isOwner) {
            await helpers.sendToOwner(sock, { text: '🚫 *Permission Denied!* You are not the bot owner.' });
            return;
        }

        await sock.sendMessage(from, { text: 'Hello from my custom command!' });
        console.log(`[DEBUG] Custom command !mycommand executed by ${sender}`);
    }
};

   Restart your bot after adding or modifying plugin files for changes to take effect.
⚠️ Troubleshooting
 * Bot not connecting / QR code issues:
   * Ensure your internet connection is stable.
   * Delete the session_dir folder and restart node index.cjs to generate a new QR code.
   * Make sure your WhatsApp app is updated to the latest version.
 * "This message will not disappear from the chat. The sender may be on an old version of WhatsApp." pop-up:
   * This issue has been addressed with ephemeralExpiration: 0 on outgoing messages. Ensure you are using the latest index.cjs provided. If it persists, it might be a client-side WhatsApp issue on your device.
 * Typing indicator (3 dots) not showing consistently:
   * Ensure you are using the latest index.cjs which has improved reliability for this.
   * Check your network connection; delays or dropped packets can affect presence updates.
 * Bot not responding to commands:
   * Verify the ownerNumber in config.cjs is correct (no + or spaces).
   * Check the bot's mode (!setmode public if you want non-owners to use general commands).
   * Ensure the command syntax is correct (e.g., !help, not help).
   * Check the console for any error messages.
 * Auto-collection not working:
   * Ensure global auto-collector is enabled (!π .. or !√ ..).
   * If in a specific group, ensure auto-collector is enabled for that group (!π . or !√ .).
   * Verify monitoredBotNumbers in config.cjs are correct JIDs of the game bots.
   * Check the console for "Card Auto-collector NOT triggered" or "Pokémon auto-collector NOT triggered" messages to understand why.
   * Ensure the bot is actually receiving messages from the game bot (check console logs).
 * !sendtestmessages not working as expected:
   * Ensure you are the owner.
   * Check the amount and delay parameters against the MAX_TEST_MESSAGES (200) and MIN_TEST_MESSAGE_DELAY (500ms) safeguards.
   * Verify the target JID is valid.
 * Bot stops running when Termux is closed or phone screen is off:
   * Ensure you have used termux-wake-lock and disabled battery optimization for the Termux app in your Android settings.
   * Consider using pm2 to run the bot in the background (see "Running in the Background" section).
📞 Contact & Support
For help, support, or any inquiries, please feel free to reach out:
 * Owner: 🗣️ T A H A 🔥
 * WhatsApp Contact: 03004204338
 * GitHub Repository: https://github.com/notyourtaha/Auto-Claim-Back-up-.git
📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
