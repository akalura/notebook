const { initFirebase, parseUrlField, fetchLinkMetadata, launchBrowser, admin } = require('./firebaseHelper');
const path = require('path');

/**
 * Format a date as "Mon DD, YYYY"
 */
function formatDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
}

/**
 * Build the markdown content for a batch of links.
 */
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

    if (link.source) {
      lines.push('**Source:** ' + link.source);
    }

    lines.push('**URL:** [' + link.url + '](' + link.url + ')');

    if (link.finalUrl && link.finalUrl !== link.url) {
      lines.push('**Resolved URL:** [' + link.finalUrl + '](' + link.finalUrl + ')');
    }

    if (link.description) {
      lines.push('**Description:** ' + link.description);
    }

    if (link.publishedDate) {
      lines.push('**Published:** ' + link.publishedDate);
    }

    if (link.author) {
      lines.push('**Author:** ' + link.author);
    }

    if (link.keywords) {
      lines.push('**Keywords:** ' + link.keywords);
    }

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

/**
 * Load the sync config.
 */
function loadConfig() {
  const configPath = path.resolve(__dirname, '../../../website/link-sync-config.json');
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

module.exports = {
  description: 'Sync pending Firebase links: fetch, preview, stage to notebook server, mark processed',
  async run(args) {
    const skipPreview = args.includes('--no-preview');
    const includeProcessed = args.includes('--include-processed');
    const dryRun = args.includes('--dry-run');
    const debug = args.includes('--debug');

    try {
      // 1. Load config
      const config = loadConfig();
      console.log('Config loaded:');
      console.log('  Target Notebook: ' + config.targetNotebook);
      console.log('  Target Tab:      ' + config.targetTab);
      console.log('  Target Folder:   ' + (config.targetFolder || '(root)'));
      console.log('  Link Preview:    ' + (skipPreview ? 'DISABLED' : 'enabled'));
      console.log('  Include Processed: ' + (includeProcessed ? 'YES' : 'no'));
      console.log('  Dry Run:         ' + (dryRun ? 'YES (no Firebase update, no server post)' : 'no'));
      console.log('  Debug:           ' + (debug ? 'YES' : 'no'));
      console.log('---');

      // 2. Fetch links from Firebase
      const firestore = initFirebase();

      let query = firestore.collection('incoming_urls');
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

      // 3. Parse and run link preview on each
      //    Reuse a single browser instance for all URLs (faster)
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

      // Close shared browser
      if (browser) {
        await browser.close();
        console.log('Browser closed.');
      }

      console.log('---');
      console.log('All links processed. Building page content...');

      // 4. Build the page content
      const batchDate = new Date();
      const dateStr = formatDate(batchDate);
      const pageName = config.pageNameFormat.replace('{date}', dateStr);
      const content = buildPageContent(links, batchDate);

      // Debug: print the generated markdown
      if (debug) {
        console.log('');
        console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 GENERATED PAGE CONTENT \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
        console.log('Page Name: ' + pageName);
        console.log('Content Type: ' + (config.contentType || 'markdown'));
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

      // 5. Stage to server
      const batchId = 'batch-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const batch = {
        id: batchId,
        stagedAt: batchDate.toISOString(),
        pageName: pageName,
        contentType: config.contentType || 'markdown',
        content: content,
        targetNotebook: config.targetNotebook,
        targetFolder: config.targetFolder || null,
        targetTab: config.targetTab,
        autoCreateTab: config.autoCreateTab !== false,
        linkCount: links.length
      };

      console.log('Staging to server...');
      const fetch = (await import('node-fetch')).default;
      const response = await fetch('http://localhost:4000/notebook/api/staged-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch)
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error('Server rejected staging: ' + response.status + ' ' + errBody);
      }

      console.log('Staged successfully (batch: ' + batchId + ')');

      // 6. Mark Firebase records as processed
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
