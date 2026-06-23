// Disable strict SSL certificate validation (handles corporate proxies / self-signed CAs)
// Set at module level so it's active before puppeteer makes connections

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

module.exports = {
  description: 'Extract metadata (title, description, images, etc.) from a URL',
  async run(args) {
    const url = args[0];
    if (!url) {
      console.error('Usage: linkPreview <url>');
      console.error('Example: linkPreview https://github.com');
      process.exit(1);
    }

    // Basic URL validation
    if (!/^https?:\/\//i.test(url)) {
      console.error('Error: URL must start with http:// or https://');
      process.exit(1);
    }

    let browser = null;
    try {
      // Disable strict SSL for this command (handles corporate proxies / self-signed CAs)
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

      console.log('Fetching metadata for:', url);
      console.log('---');

      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--disable-blink-features=AutomationControlled']
      });

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Navigate and wait for network to settle
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Check if Cloudflare challenge is present, wait for it to resolve
      const pageTitle = await page.title();
      if (pageTitle.includes('Checking') || pageTitle.includes('Just a moment') || pageTitle.includes('Attention Required')) {
        console.log('(Waiting for site protection to resolve...)');
        const resolved = await page.waitForFunction(
          () => !document.title.includes('Checking') && !document.title.includes('Just a moment') && !document.title.includes('Attention Required'),
          { timeout: 30000 }
        ).then(() => true).catch(() => false);

        if (resolved) {
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        } else {
          console.log('WARNING: Site protection (Cloudflare/CAPTCHA) could not be bypassed.');
          console.log('         The metadata below may be incomplete or from the challenge page.');
          console.log('---');
        }
      }

      // Extract metadata from the rendered page
      const data = await page.evaluate(() => {
        function getMeta(name) {
          var el = document.querySelector('meta[property="' + name + '"]') ||
                   document.querySelector('meta[name="' + name + '"]');
          return el ? el.getAttribute('content') : null;
        }

        function getAllMeta(name) {
          var els = document.querySelectorAll('meta[property="' + name + '"], meta[name="' + name + '"]');
          return Array.from(els).map(function(el) { return el.getAttribute('content'); }).filter(Boolean);
        }

        var title = getMeta('og:title') || getMeta('twitter:title') || document.title || null;
        var description = getMeta('og:description') || getMeta('twitter:description') || getMeta('description') || null;
        var siteName = getMeta('og:site_name') || null;
        var type = getMeta('og:type') || null;
        var image = getMeta('og:image') || getMeta('twitter:image') || null;
        var images = getAllMeta('og:image');
        if (images.length === 0 && image) images = [image];
        var canonicalUrl = getMeta('og:url') || (document.querySelector('link[rel="canonical"]') || {}).href || window.location.href;
        var author = getMeta('author') || getMeta('article:author') || null;
        var publishedDate = getMeta('article:published_time') || getMeta('datePublished') || null;
        var keywords = getMeta('keywords') || null;

        // Get favicon
        var favicons = [];
        document.querySelectorAll('link[rel*="icon"]').forEach(function(el) {
          var href = el.getAttribute('href');
          if (href) {
            if (href.startsWith('//')) href = 'https:' + href;
            else if (href.startsWith('/')) href = window.location.origin + href;
            favicons.push(href);
          }
        });

        return {
          title: title,
          description: description,
          siteName: siteName,
          url: canonicalUrl,
          type: type,
          author: author,
          publishedDate: publishedDate,
          keywords: keywords,
          images: images,
          favicons: favicons
        };
      });

      // Format output
      console.log('Title:       ' + (data.title || '(none)'));
      console.log('Description: ' + (data.description || '(none)'));
      console.log('Site Name:   ' + (data.siteName || '(none)'));
      console.log('URL:         ' + (data.url || url));
      console.log('Type:        ' + (data.type || '(none)'));
      if (data.author) console.log('Author:      ' + data.author);
      if (data.publishedDate) console.log('Published:   ' + data.publishedDate);
      if (data.keywords) console.log('Keywords:    ' + data.keywords);

      if (data.favicons && data.favicons.length > 0) {
        console.log('Favicons:    ' + data.favicons.slice(0, 3).join(', '));
      }

      if (data.images && data.images.length > 0) {
        console.log('Images:');
        data.images.forEach((img, i) => {
          console.log('  [' + (i + 1) + '] ' + img);
        });
      }

      // Raw JSON
      console.log('\n--- Raw JSON ---');
      console.log(JSON.stringify(data, null, 2));

    } catch (err) {
      console.error('Error fetching link preview:', err.message || err);
      process.exit(1);
    } finally {
      if (browser) await browser.close();
    }
  },
};
