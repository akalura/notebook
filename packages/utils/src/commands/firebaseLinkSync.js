const admin = require('firebase-admin');
const path = require('path');
const config = require('../../../shared/loadConfig');

const COLLECTION = config.firebase.collection;

// ===== Firebase =====
let db = null;
let firebaseInitialized = false;

function initFirebase() {
  if (db) return db;
  if (!firebaseInitialized) {
    var keyPath = path.resolve(__dirname, '../../../../', config.firebase.serviceAccountKey);
    const serviceAccount = require(keyPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
  }
  db = admin.firestore();
  return db;
}

// ===== URL Parsing =====
function parseUrlField(rawUrl) {
  if (!rawUrl) return { url: null, source: null, title: null };
  const raw = rawUrl.trim();

  const sourceMultiline = /^Source:\s*(.+?)[\n\r]+\s*(https?:\/\/\S+)$/i;
  const m1 = raw.match(sourceMultiline);
  if (m1) return { url: m1[2].trim(), source: m1[1].trim(), title: null };

  const sourceInline = /^Source:\s*(.+?)\s+(https?:\/\/\S+)$/i;
  const m2 = raw.match(sourceInline);
  if (m2) return { url: m2[2].trim(), source: m2[1].trim(), title: null };

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
  if (m4) return { url: m4[1], source: null, title: null };

  const anyUrl = /(https?:\/\/\S+)/;
  const m5 = raw.match(anyUrl);
  if (m5) {
    const remaining = raw.replace(m5[1], '').trim().replace(/[.\s]+$/, '');
    return { url: m5[1], source: null, title: remaining || null };
  }

  return { url: raw, source: null, title: null };
}

// ===== Link Preview (Puppeteer) =====
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
      return {
        title: getMeta('og:title') || getMeta('twitter:title') || document.title || null,
        description: getMeta('og:description') || getMeta('twitter:description') || getMeta('description') || null,
        siteName: getMeta('og:site_name') || null,
        image: getMeta('og:image') || getMeta('twitter:image') || null,
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

// ===== Page Content Builder =====
function formatDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
}

function buildPageContent(links, batchDate) {
  const dateStr = formatDate(batchDate);
  const lines = [];

  lines.push('# \ud83d\udce5 Links Import \u2014 ' + dateStr);
  lines.push('');

  links.forEach((link, i) => {
    lines.push('---');
    lines.push('');
    const title = link.previewTitle || link.parsedTitle || '[Untitled Link]';
    lines.push('## ' + (i + 1) + '. ' + title);
    if (link.source) lines.push('**Source:** ' + link.source);
    lines.push('**URL:** [' + link.url + '](' + link.url + ')');
    if (link.finalUrl && link.finalUrl !== link.url) lines.push('**Resolved URL:** [' + link.finalUrl + '](' + link.finalUrl + ')');
    if (link.description) lines.push('**Description:** ' + link.description);
    if (link.publishedDate) lines.push('**Published:** ' + link.publishedDate);
    if (link.author) lines.push('**Author:** ' + link.author);
    if (link.keywords) lines.push('**Keywords:** ' + link.keywords);
    if (link.image && link.image.startsWith('http')) {
      lines.push('');
      lines.push('![Preview](' + link.image + ')');
    }
    lines.push('');
  });

  lines.push('---');
  lines.push('');
  lines.push('*' + links.length + ' link(s) imported \u00b7 Staged at ' + batchDate.toISOString() + '*');
  return lines.join('\n');
}

// ===== Sync Config =====
function loadSyncConfig() {
  const configPath = path.join(config.paths.firebaseLinkSyncCache, 'link-sync-config.json');
  try {
    delete require.cache[require.resolve(configPath)];
    return require(configPath);
  } catch (err) {
    return {
      targetNotebook: 'Reading List',
      targetFolder: null,
      targetTab: 'Incoming Links',
      autoCreateTab: true,
      pageNameFormat: '\ud83d\udce5 Links Import \u2014 {date}',
      contentType: 'markdown'
    };
  }
}

// ===== Command =====
module.exports = {
  description: 'Sync pending Firebase links: fetch, preview, stage to notebook server, mark processed',
  async run(args) {
    const skipPreview = args.includes('--no-preview');
    const includeProcessed = args.includes('--include-processed');
    const dryRun = args.includes('--dry-run');
    const debug = args.includes('--debug');

    try {
      const syncConfig = loadSyncConfig();
      console.log('Config loaded:');
      console.log('  Target Notebook: ' + syncConfig.targetNotebook);
      console.log('  Target Tab:      ' + syncConfig.targetTab);
      console.log('  Target Folder:   ' + (syncConfig.targetFolder || '(root)'));
      console.log('  Link Preview:    ' + (skipPreview ? 'DISABLED' : 'enabled'));
      console.log('  Include Processed: ' + (includeProcessed ? 'YES' : 'no'));
      console.log('  Dry Run:         ' + (dryRun ? 'YES (no Firebase update, no server post)' : 'no'));
      console.log('  Debug:           ' + (debug ? 'YES' : 'no'));
      console.log('---');

      const firestore = initFirebase();

      let query = firestore.collection(COLLECTION);
      if (!includeProcessed) {
        query = query.where('status', '==', 'pending');
        console.log('Fetching pending links from Firebase...');
      } else {
        console.log('Fetching ALL links from Firebase (including processed)...');
      }

      const snapshot = await query.get();

      if (snapshot.empty) {
        console.log('No links found. Nothing to sync.');
        process.exit(0);
      }

      const docs = [];
      snapshot.forEach((doc) => docs.push(doc));
      console.log('Found ' + docs.length + ' link(s).');
      console.log('---');

      let browser = null;
      if (!skipPreview) {
        console.log('Launching browser for link previews...');
        browser = await launchBrowser();
      }

      const links = [];
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const data = doc.data();
        const parsed = parseUrlField(data.url);

        console.log('[' + (i + 1) + '/' + docs.length + '] ' + (parsed.url || '(no url)'));

        let meta = {};
        if (!skipPreview && parsed.url && parsed.url.startsWith('http')) {
          console.log('    Fetching preview...');
          meta = await fetchLinkMetadata(parsed.url, browser);
          if (meta.error) {
            console.log('    Preview failed: ' + meta.error);
            meta = {};
          } else {
            if (meta.title) console.log('    Title: ' + meta.title);
            if (meta.description) console.log('    Desc:  ' + (meta.description || '').substring(0, 80) + '...');
            if (meta.image) console.log('    Image: ' + meta.image);
          }
        }

        links.push({
          firebaseDocId: doc.id,
          url: parsed.url,
          finalUrl: meta.url || null,
          source: parsed.source || meta.siteName || null,
          parsedTitle: parsed.title || null,
          previewTitle: meta.title || null,
          description: meta.description || null,
          image: meta.image || null,
          author: meta.author || null,
          publishedDate: meta.publishedDate || null,
          keywords: meta.keywords || null
        });
      }

      if (browser) {
        await browser.close();
        console.log('Browser closed.');
      }

      console.log('---');
      console.log('All links processed. Building page content...');

      const batchDate = new Date();
      const dateStr = formatDate(batchDate);
      const pageName = syncConfig.pageNameFormat.replace('{date}', dateStr);
      const content = buildPageContent(links, batchDate);

      if (debug) {
        console.log('');
        console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 GENERATED PAGE CONTENT \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
        console.log('Page Name: ' + pageName);
        console.log('Content Type: ' + (syncConfig.contentType || 'markdown'));
        console.log('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
        console.log(content);
        console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 END OF CONTENT \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
        console.log('');
      }

      if (dryRun) {
        console.log('[DRY RUN] Would stage ' + links.length + ' link(s) to server. Skipping.');
        console.log('[DRY RUN] Would mark ' + docs.length + ' Firebase record(s) as processed. Skipping.');
        console.log('---');
        console.log('Dry run complete. No changes made.');
        process.exit(0);
      }

      const batchId = 'batch-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const batch = {
        id: batchId,
        stagedAt: batchDate.toISOString(),
        pageName: pageName,
        contentType: syncConfig.contentType || 'markdown',
        content: content,
        targetNotebook: syncConfig.targetNotebook,
        targetFolder: syncConfig.targetFolder || null,
        targetTab: syncConfig.targetTab,
        autoCreateTab: syncConfig.autoCreateTab !== false,
        linkCount: links.length
      };

      console.log('Staging to server...');
      const fetch = (await import('node-fetch')).default;
      const serverUrl = 'http://localhost:' + config.server.port;
      const response = await fetch(serverUrl + '/notebook/api/staged-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch)
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error('Server rejected staging: ' + response.status + ' ' + errBody);
      }

      console.log('Staged successfully (batch: ' + batchId + ')');

      console.log('Marking ' + docs.length + ' Firebase record(s) as processed...');
      for (const doc of docs) {
        await doc.ref.update({
          status: 'processed',
          processedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      console.log('---');
      console.log('Done! ' + links.length + ' link(s) staged.');
      console.log('Open the notebook app and click "Import Links" to create the page.');
      process.exit(0);

    } catch (err) {
      console.error('Error:', err.message || err);
      process.exit(1);
    }
  },
};
