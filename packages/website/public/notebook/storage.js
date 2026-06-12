/**
 * Storage Module - Handles localStorage and IndexedDB operations
 */
window.NoteStorage = (function () {
  'use strict';

  const STORAGE_KEY = 'notebook_state';
  const IMAGE_DB_NAME = 'notebook_images';
  const IMAGE_STORE_NAME = 'images';
  const IMAGE_DB_VERSION = 1;

  let imageDb = null;

  function openImageDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
          db.createObjectStore(IMAGE_STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => {
        imageDb = e.target.result;
        resolve(imageDb);
      };
      request.onerror = (e) => {
        console.warn('Failed to open image DB:', e);
        reject(e);
      };
    });
  }

  function storeImage(id, blob, mimeType) {
    return new Promise((resolve, reject) => {
      if (!imageDb) { reject('DB not open'); return; }
      const tx = imageDb.transaction(IMAGE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IMAGE_STORE_NAME);
      store.put({ id: id, blob: blob, mimeType: mimeType, createdAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  function getImage(id) {
    return new Promise((resolve, reject) => {
      if (!imageDb) { reject('DB not open'); return; }
      const tx = imageDb.transaction(IMAGE_STORE_NAME, 'readonly');
      const store = tx.objectStore(IMAGE_STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e);
    });
  }

  function deleteImage(id) {
    return new Promise((resolve, reject) => {
      if (!imageDb) { reject('DB not open'); return; }
      const tx = imageDb.transaction(IMAGE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IMAGE_STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  function getAllImages() {
    return new Promise((resolve, reject) => {
      if (!imageDb) { resolve([]); return; }
      const tx = imageDb.transaction(IMAGE_STORE_NAME, 'readonly');
      const store = tx.objectStore(IMAGE_STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e);
    });
  }

  function clearAllImages() {
    return new Promise((resolve, reject) => {
      if (!imageDb) { resolve(); return; }
      const tx = imageDb.transaction(IMAGE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IMAGE_STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e);
    });
  }

  function compressImage(blob, maxWidth, quality) {
    maxWidth = maxWidth || 1200;
    quality = quality || 0.8;
    return new Promise((resolve) => {
      var img = new Image();
      var url = URL.createObjectURL(blob);
      img.onload = function () {
        var w = img.width;
        var h = img.height;
        if (w > maxWidth) {
          h = Math.round(h * (maxWidth / w));
          w = maxWidth;
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(function (result) {
          URL.revokeObjectURL(url);
          resolve(result);
        }, 'image/jpeg', quality);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(blob);
      };
      img.src = url;
    });
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to load state from localStorage:', e);
    }
    return null;
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save state:', e);
    }
  }

  function removeState() {
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    openImageDb: openImageDb,
    storeImage: storeImage,
    getImage: getImage,
    deleteImage: deleteImage,
    getAllImages: getAllImages,
    clearAllImages: clearAllImages,
    compressImage: compressImage,
    loadState: loadState,
    saveState: saveState,
    removeState: removeState
  };
})();
