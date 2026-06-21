const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Forces Puppeteer to save Chrome inside your project directory instead of home cache
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};