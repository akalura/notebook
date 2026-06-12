const os = require('os');

module.exports = {
  description: 'Print system information',
  run() {
    console.log(`Platform: ${os.platform()}`);
    console.log(`Architecture: ${os.arch()}`);
    console.log(`Node version: ${process.version}`);
    console.log(`Uptime: ${(os.uptime() / 3600).toFixed(2)} hours`);
  },
};
