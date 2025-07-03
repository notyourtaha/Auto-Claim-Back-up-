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
    '919410207027@s.whatsapp.net', // Original unified spawn bot JID
    '2348163376700@s.whatsapp.net', // New JID from your logs
    '18765468192@s.whatsapp.net',   // New JID from your logs
  ],

  // Array of WhatsApp JIDs (numbers) of the bots your bot should specifically monitor for Pokémon spawns.
  // Set to the JID(s) of your card/Pokémon spawn bots.
  monitoredPokemonBotNumbers: [
    '919410207027@s.whatsapp.net', // Original unified spawn bot JID
    '2348163376700@s.whatsapp.net', // New JID from your logs
    '18765468192@s.whatsapp.net',   // New JID from your logs
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
  },

  // NEW: Adaptive Delay Settings
  adaptiveDelay: {
    enabled: true, // Set to true to enable adaptive delay
    adjustmentFactor: 0.05, // How much to adjust delay (e.g., 0.05 = 5% of current range)
    historySize: 10, // Number of recent collections to consider for success rate
    targetSuccessRate: 0.8 // Target success rate (80%)
  },

  // NEW: Bot Activity Monitor Settings
  botActivityMonitor: {
    enabled: true, // Set to true to enable monitoring
    checkInterval: 5 * 60 * 1000, // Check every 5 minutes (in milliseconds)
    inactivityThreshold: 30 * 60 * 1000 // Alert if bot hasn't sent message in 30 minutes (in milliseconds)
  }
};

