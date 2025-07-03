// plugins/commands/enable.cjs
module.exports = {
  pattern: '#π .',
  run: async (client, msg, config, context) => {
    context.setAutoCollector(true);
    await client.sendMessage(`${config.ownerNumber}@c.us`, '✅ Auto Collector ENABLED');
  }
};
