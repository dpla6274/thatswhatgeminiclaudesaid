'use strict';
// PNGs are already compressed. Store them as UTF-8 named ZIP entries.
function zipImages(files) {
  const encoder = new TextEncoder(),
    local = [],
    directory = [];
  const table = Uint32Array.from({
    length: 256
  }, (_, n) => {
    for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
    return n;
  });

  function header(length, signature) {
    const view = new DataView(new ArrayBuffer(length));
    view.setUint32(0, signature, true);
    return view;
  }
  let offset = 0,
    directorySize = 0;
  for (const {
      name,
      data
    }
    of files) {
    const filename = encoder.encode(name);
    let crc = 0xffffffff;
    for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
    const entry = header(30, 0x04034b50);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 0x800, true);
    entry.setUint16(12, 33, true);
    entry.setUint32(14, ~crc, true);
    entry.setUint32(18, data.length, true);
    entry.setUint32(22, data.length, true);
    entry.setUint16(26, filename.length, true);
    const central = header(46, 0x02014b50);
    central.setUint16(4, 20, true);
    new Uint8Array(central.buffer, 6, 26).set(new Uint8Array(entry.buffer, 4, 26));
    central.setUint32(42, offset, true);
    local.push(entry.buffer, filename, data);
    directory.push(central.buffer, filename);
    directorySize += 46 + filename.length;
    offset += 30 + filename.length + data.length;
  }
  const end = header(22, 0x06054b50);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([...local, ...directory, end.buffer], {
    type: 'application/zip'
  });
}
