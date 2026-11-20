// TTC table offsets are relative to the collection. Rebuild the chosen face as a standalone sfnt.
function extractGulim(buffer) {
  const src = new DataView(buffer),
    bytes = new Uint8Array(buffer);
  const tag = at => String.fromCharCode(...bytes.subarray(at, at + 4));
  const offsets = tag(0) === 'ttcf' ? Array.from({
    length: Math.min(src.getUint32(8), 128)
  }, (_, i) => src.getUint32(12 + i * 4)) : [0];
  for (const base of offsets) {
    const count = src.getUint16(base + 4);
    const tables = Array.from({
      length: count
    }, (_, i) => {
      const pos = base + 12 + i * 16;
      return {
        name: tag(pos),
        pos,
        start: src.getUint32(pos + 8),
        length: src.getUint32(pos + 12)
      };
    });
    const names = tables.find(t => t.name === 'name');
    if (!names) continue;
    const n = names.start,
      data = n + src.getUint16(n + 4);
    let match = false;
    for (let i = 0; i < src.getUint16(n + 2); i++) {
      const pos = n + 6 + i * 12,
        id = src.getUint16(pos + 6);
      if (![1, 4, 6, 16].includes(id)) continue;
      const start = data + src.getUint16(pos + 10),
        end = start + src.getUint16(pos + 8);
      const name = new TextDecoder([0, 3].includes(src.getUint16(pos)) ? 'utf-16be' : 'latin1').decode(bytes.subarray(start, end));
      if (/^(Gulim|굴림)$/i.test(name)) {
        match = true;
        break
      }
    }
    if (!match) continue;
    if (tag(0) !== 'ttcf') return buffer;
    let at = 12 + count * 16;
    const size = at + tables.reduce((sum, t) => sum + Math.ceil(t.length / 4) * 4, 0);
    if (size > buffer.byteLength + at) throw Error();
    const out = new Uint8Array(size),
      view = new DataView(out.buffer);
    out.set(bytes.subarray(base, base + at));
    let head;
    tables.forEach((t, i) => {
      out.set(bytes.subarray(t.start, t.start + t.length), at);
      view.setUint32(12 + i * 16 + 8, at);
      if (t.name === 'head') {
        head = at;
        view.setUint32(at + 8, 0)
      }
      at += Math.ceil(t.length / 4) * 4;
    });
    let sum = 0;
    for (let i = 0; i < size; i += 4) sum = (sum + view.getUint32(i)) >>> 0;
    view.setUint32(head + 8, (0xb1b0afba - sum) >>> 0);
    return out.buffer;
  }
  throw Error('굴림을 찾을 수 없어요.');
}

function fontDatabase() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('scene-gulim', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('fonts');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}
async function fontCache(buffer) {
  const db = await fontDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('fonts', buffer ? 'readwrite' : 'readonly'),
        store = tx.objectStore('fonts');
      const req = buffer ? store.put(buffer, 'gulim') : store.get('gulim');
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = () => reject(tx.error);
    })
  } finally {
    db.close()
  }
}
async function registerGulim(source) {
  const font = new FontFace('MSSceneGulim', source);
  await font.load();
  document.fonts.add(font);
}
async function findGulim() {
  for (const name of ['Gulim', '굴림']) {
    try {
      await registerGulim('local("' + name + '")');
      return true
    } catch {}
  }
  try {
    const cached = await fontCache();
    if (cached) {
      await registerGulim(cached);
      return true
    }
  } catch {}
  return false;
}
