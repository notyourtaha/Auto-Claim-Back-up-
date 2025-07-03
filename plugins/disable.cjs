// plugins/commands/disable.cjs
module.exports = {
  pattern: '#π ..',
  run: async (client, msg, config, context) => {
    context.setAutoCollector(false);
    await client.sendMessage(`${config.ownerNumber}@c.us`, '❌ Auto Collector DISABLED');
  }
};
