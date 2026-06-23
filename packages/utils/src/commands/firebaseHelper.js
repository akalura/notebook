const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase only once
let db = null;
let initialized = false;

function initFirebase() {
  if (db) return db;
  if (!initialized) {
    const serviceAccount = require(path.resolve(__dirname, '../../../../secrets/serviceAccountKey.json'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    initialized = true;
  }
  db = admin.firestore();
  return db;
}

/**
 * Parse the raw url field from Firestore into structured data.
 */
function parseUrlField(rawUrl) {
  if (!rawUrl) return { url: null, source: null, title: null };

  const raw = rawUrl.trim();

  const sourceMultiline = /^Source:\s*(.+?)[\n\r]+\s*(https?:\/\/\S+)$/i;
  const m1 = raw.match(sourceMultiline);
  if (m1) {
    return { url: m1[2].trim(), source: m1[1].trim(), title: null };
  }

  const sourceInline = /^Source:\s*(.+?)\s+(https?:\/\/\S+)$/i;
  const m2 = raw.match(sourceInline);
  if (m2) {
    return { url: m2[2].trim(), source: m2[1].trim(), title: null };
  }

  const titleUrl = /^(.+?)\s+(https?:\/\/\S+)$/;
  const m3 = raw.match(titleUrl);
  if (m3) {
    const titlePart = m3[1].trim().replace(/[.\s]+$/, '');
    if (!titlePart.match(/^https?:\/\//)) {
      return { url: m3[2].trim(), source: null, title: titlePart };
    }
  }

  const urlOnly = /^(https?:\/\/\S+)$/;
  const m4 = raw.match(urlOnly);
  if (m4) {
    return { url: m4[1], source: null, title: null };
  }

  const anyUrl = /(https?:\/\/\S+)/;
  const m5 = raw.match(anyUrl);
  if (m5) {
    const remaining = raw.replace(m5[1], '').trim().replace(/[.\s]+$/, '');
    return { url: m5[1], source: null, title: remaining || null };
  }

  return { url: raw, source: null, title: null };
}

/**
 * Launch a puppeteer browser instance (shared across multiple calls).
 */
async function launchBrowser() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());

  return await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors', '--disable-blink-features=AutomationControlled']
  });
}

/**
 * Fetch link preview metadata for a single URL.
 * If a browser instance is provided, reuses it (faster for batch).
 * Otherwise launches and closes its own.
 */
async function fetchLinkMetadata(url, existingBrowser) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  let browser = existingBrowser || null;
  let ownBrowser = false;

  try {
    if (!browser) {
      browser = await launchBrowser();
      ownBrowser = true;
    }

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const pageTitle = await page.title();
    if (pageTitle.includes('Checking') || pageTitle.includes('Just a moment') || pageTitle.includes('Attention Required')) {
      const resolved = await page.waitForFunction(
        () => !document.title.includes('Checking') && !document.title.includes('Just a moment') && !document.title.includes('Attention Required'),
        { timeout: 20000 }
      ).then(() => true).catch(() => false);
      if (resolved) {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
      }
    }

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
      var images = getAllMeta('og:image');
      var singleImage = getMeta('og:image') || getMeta('twitter:image') || null;
      if (images.length === 0 && singleImage) images = [singleImage];

      return {
        title: getMeta('og:title') || getMeta('twitter:title') || document.title || null,
        description: getMeta('og:description') || getMeta('twitter:description') || getMeta('description') || null,
        siteName: getMeta('og:site_name') || null,
        image: singleImage,
        images: images,
        author: getMeta('author') || getMeta('article:author') || null,
        publishedDate: getMeta('article:published_time') || getMeta('datePublished') || null,
        keywords: getMeta('keywords') || null,
        url: getMeta('og:url') || window.location.href
      };
    });

    await page.close();
    return data;
  } catch (err) {
    return { error: err.message || 'Failed to fetch' };
  } finally {
    if (ownBrowser && browser) await browser.close();
  }
}

module.exports = {
  initFirebase: initFirebase,
  parseUrlField: parseUrlField,
  launchBrowser: launchBrowser,
  fetchLinkMetadata: fetchLinkMetadata,
  admin: admin
};
