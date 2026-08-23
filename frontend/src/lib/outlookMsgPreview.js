function u16(view, offset) {
  return view.getUint16(offset, true);
}

function u32(view, offset) {
  return view.getUint32(offset, true);
}

function u64(view, offset) {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  return hi * 2 ** 32 + lo;
}

function decodeUtf16(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = view.getUint16(i, true);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out.trim();
}

function decodeLatin1(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 0) break;
    out += String.fromCharCode(bytes[i]);
  }
  return out.trim();
}

function unpackFat(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  for (let i = 0; i + 3 < bytes.length; i += 4) out.push(view.getUint32(i, true));
  return out;
}

function readCfbStreams(buffer) {
  const view = new DataView(buffer);
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (buffer.byteLength < 512 || sig.some((b, i) => view.getUint8(i) !== b)) {
    throw new Error('Not an Outlook .msg file');
  }
  const sectorSize = 1 << u16(view, 0x1e);
  const miniSectorSize = 1 << u16(view, 0x20);
  const fatCount = u32(view, 0x2c);
  const dirFirst = u32(view, 0x30);
  const miniCutoff = u32(view, 0x38);
  const miniFatFirst = u32(view, 0x3c);
  const bytes = new Uint8Array(buffer);

  const sector = (index) => {
    const start = 512 + index * sectorSize;
    return bytes.subarray(start, start + sectorSize);
  };

  const difat = [];
  for (let i = 0; i < 109; i += 1) difat.push(u32(view, 0x4c + i * 4));
  const fat = [];
  for (let i = 0; i < Math.max(fatCount, 109); i += 1) {
    const idx = difat[i];
    if (idx == null || idx >= 0xfffffffe) continue;
    fat.push(...unpackFat(sector(idx)));
  }

  const follow = (start, table) => {
    const out = [];
    const seen = new Set();
    let idx = start;
    while (idx < 0xfffffffe && !seen.has(idx) && idx < table.length) {
      seen.add(idx);
      out.push(idx);
      idx = table[idx];
    }
    return out;
  };

  const readChain = (start) => {
    const parts = follow(start, fat).map((i) => sector(i));
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    parts.forEach((part) => {
      out.set(part, offset);
      offset += part.length;
    });
    return out;
  };

  const miniFat = unpackFat(readChain(miniFatFirst));
  const directory = readChain(dirFirst);
  const entries = [];
  for (let i = 0; i + 128 <= directory.length; i += 128) {
    entries.push(directory.subarray(i, i + 128));
  }

  let miniStream = new Uint8Array(0);
  const readStream = (entry, forceNormal = false) => {
    const ev = new DataView(entry.buffer, entry.byteOffset, entry.byteLength);
    const start = ev.getUint32(0x74, true);
    const size = ev.getUint32(0x78, true);
    if (!size || start >= 0xfffffffe) return new Uint8Array(0);
    if (forceNormal || size >= miniCutoff) return readChain(start).subarray(0, size);
    const parts = follow(start, miniFat);
    const out = new Uint8Array(size);
    let offset = 0;
    parts.forEach((idx) => {
      const srcStart = idx * miniSectorSize;
      const chunk = miniStream.subarray(srcStart, srcStart + miniSectorSize);
      const take = Math.min(chunk.length, size - offset);
      out.set(chunk.subarray(0, take), offset);
      offset += take;
    });
    return out;
  };

  miniStream = entries[0] ? readStream(entries[0], true) : new Uint8Array(0);
  const streams = {};
  entries.forEach((entry) => {
    const name = decodeUtf16(entry.subarray(0, 64));
    if (entry[0x42] !== 2 || !name) return;
    streams[name] = readStream(entry);
  });
  return streams;
}

function filetimeToText(bytes) {
  if (!bytes || bytes.length < 8) return '';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const value = u64(view, 0);
  if (!value) return '';
  const ms = value / 10000 - 11644473600000;
  const dt = new Date(ms);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString();
}

export function parseOutlookMsg(buffer) {
  const streams = readCfbStreams(buffer);
  const props = {};
  Object.entries(streams).forEach(([name, raw]) => {
    if (name.startsWith('__substg1.0_')) props[name.slice(12).toUpperCase()] = raw;
  });

  const take = (...keys) => {
    for (const key of keys) {
      const blob = props[key];
      if (!blob || !blob.length) continue;
      if (key.endsWith('001F')) return decodeUtf16(blob);
      if (key.endsWith('001E')) return decodeLatin1(blob);
    }
    return '';
  };

  const attachments = Object.entries(streams)
    .filter(([name]) => name.toLowerCase().includes('__attach'))
    .map(([name, raw]) => ({ name: name.split('/').pop(), size: raw.length, content_type: '' }));

  const parsed = {
    kind: 'email',
    from: take('0C1A001F', '0C1A001E', '0042001F', '0065001F', '0076001F', '0C1F001F'),
    to: take('0E04001F', '0E04001E'),
    cc: take('0E03001F', '0E03001E'),
    subject: take('0037001F', '0037001E') || '(No subject)',
    date: filetimeToText(props['00390040'] || props['0E060040']),
    body_text: take('1000001F', '1000001E'),
    body_html: take('1013001F', '1013001E'),
    attachments,
  };
  if (!parsed.from && !parsed.to && !parsed.body_text && !parsed.body_html && parsed.subject === '(No subject)') {
    throw new Error('Could not read Outlook message fields');
  }
  return parsed;
}

export function parseEmlText(raw) {
  const text = String(raw || '');
  const split = text.split(/\r?\n\r?\n/);
  const headerText = split.shift() || '';
  const body = split.join('\n\n').trim();
  const headers = {};
  headerText.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (match) headers[match[1].toLowerCase()] = match[2];
  });
  return {
    subject: headers.subject || '(No subject)',
    from: headers.from || '',
    to: headers.to || '',
    cc: headers.cc || '',
    date: headers.date || '',
    body_text: body,
    body_html: '',
    attachments: [],
  };
}
