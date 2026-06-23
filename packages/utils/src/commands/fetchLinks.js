const { initFirebase, parseUrlField, fetchLinkMetadata } = require('./firebaseHelper');

module.exports = {
  description: 'Fetch pending URLs from Firebase (incoming_urls collection)',
  async run(args) {
    let mode = 'all';
    let withPreview = false;

    args.forEach((arg) => {
      if (arg === '--preview' || arg === '-p') {
        withPreview = true;
      } else if (['all', 'pending', 'processed'].includes(arg)) {
        mode = arg;
      }
    });

    try {
      const firestore = initFirebase();
      console.log('Connected to Firebase (project: link-receiver)');
      console.log('---');

      let query = firestore.collection('incoming_urls');

      if (mode === 'pending') {
        query = query.where('status', '==', 'pending');
        console.log('Filter: pending only');
      } else if (mode === 'processed') {
        query = query.where('status', '==', 'processed');
        console.log('Filter: processed only');
      } else {
        console.log('Filter: all records');
      }

      if (withPreview) {
        console.log('Mode:   with link preview (fetching metadata for each URL)');
      }

      console.log('---');

      const snapshot = await query.get();

      if (snapshot.empty) {
        console.log('No records found.');
        process.exit(0);
      }

      console.log('Found ' + snapshot.size + ' record(s):\n');

      const docs = [];
      snapshot.forEach((doc) => docs.push(doc));

      let index = 1;
      for (const doc of docs) {
        const data = doc.data();
        const parsed = parseUrlField(data.url);

        console.log('═══════════════════════════════════════════════════════');
        console.log('[' + index + '] ID: ' + doc.id);
        console.log('    URL:       ' + (parsed.url || '(none)'));
        console.log('    Source:    ' + (parsed.source || '(none)'));
        console.log('    Title:     ' + (parsed.title || '(none)'));
        console.log('    Status:    ' + (data.status || '(none)'));
        if (data.timestamp) {
          const ts = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
          console.log('    Timestamp: ' + ts.toISOString());
        }

        const knownFields = ['url', 'status', 'title', 'timestamp', 'source'];
        Object.keys(data).forEach((key) => {
          if (!knownFields.includes(key)) {
            console.log('    ' + key + ': ' + JSON.stringify(data[key]));
          }
        });

        if (withPreview && parsed.url && parsed.url.startsWith('http')) {
          console.log('    --- Link Preview ---');
          const meta = await fetchLinkMetadata(parsed.url);
          if (meta.error) {
            console.log('    [Preview Error]: ' + meta.error);
          } else {
            if (meta.title) console.log('    Page Title:   ' + meta.title);
            if (meta.description) console.log('    Description:  ' + meta.description);
            if (meta.siteName) console.log('    Site Name:    ' + meta.siteName);
            if (meta.author) console.log('    Author:       ' + meta.author);
            if (meta.publishedDate) console.log('    Published:    ' + meta.publishedDate);
            if (meta.image) console.log('    Image:        ' + meta.image);
            if (meta.url) console.log('    Final URL:    ' + meta.url);
            if (!meta.title && !meta.description) console.log('    (no metadata available)');
          }
        }

        console.log('');
        index++;
      }

      process.exit(0);
    } catch (err) {
      console.error('Error:', err.message || err);
      process.exit(1);
    }
  },
};
