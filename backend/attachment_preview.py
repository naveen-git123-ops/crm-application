"""Parse PSD composites and Outlook .msg / .eml files for in-app preview."""
from __future__ import annotations

import email
import email.policy
import re
import struct
from datetime import datetime, timedelta, timezone
from email.header import decode_header
from io import BytesIO
from typing import Any, Optional


def decode_header_value(raw: Optional[str]) -> str:
    if not raw:
        return ''
    parts = []
    for text, charset in decode_header(raw):
        if isinstance(text, bytes):
            parts.append(text.decode(charset or 'utf-8', errors='replace'))
        else:
            parts.append(text)
    return ' '.join(parts).strip()


def _sanitize_html(html: str) -> str:
    text = str(html or '')
    text = re.sub(r'(?is)<script[^>]*>.*?</script>', '', text)
    text = re.sub(r'(?is)on\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)', '', text)
    text = re.sub(r'(?is)javascript:', '', text)
    return text


def parse_eml_bytes(data: bytes) -> dict[str, Any]:
    msg = email.message_from_bytes(data, policy=email.policy.default)
    text_body = ''
    html_body = ''
    attachments = []
    if msg.is_multipart():
        for part in msg.walk():
            disp = str(part.get_content_disposition() or '')
            filename = part.get_filename()
            ctype = part.get_content_type()
            if filename or disp == 'attachment':
                payload = part.get_payload(decode=True) or b''
                attachments.append({
                    'name': filename or 'attachment',
                    'size': len(payload),
                    'content_type': ctype,
                })
                continue
            if ctype == 'text/plain' and not text_body:
                text_body = part.get_content()
            elif ctype == 'text/html' and not html_body:
                html_body = part.get_content()
    else:
        ctype = msg.get_content_type()
        if ctype == 'text/html':
            html_body = msg.get_content()
        else:
            text_body = msg.get_content()
    return {
        'kind': 'email',
        'from': decode_header_value(msg.get('From')),
        'to': decode_header_value(msg.get('To')),
        'cc': decode_header_value(msg.get('Cc')),
        'subject': decode_header_value(msg.get('Subject')) or '(No subject)',
        'date': decode_header_value(msg.get('Date')),
        'body_text': (text_body or '').strip(),
        'body_html': _sanitize_html(html_body or ''),
        'attachments': attachments,
    }


class _CfbReader:
    def __init__(self, data: bytes):
        if len(data) < 512 or data[:8] != b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
            raise ValueError('Not an Outlook .msg file')
        self.data = data
        self.sector_size = 1 << struct.unpack_from('<H', data, 0x1E)[0]
        self.mini_sector_size = 1 << struct.unpack_from('<H', data, 0x20)[0]
        self.fat_count = struct.unpack_from('<I', data, 0x2C)[0]
        self.dir_first = struct.unpack_from('<I', data, 0x30)[0]
        self.mini_cutoff = struct.unpack_from('<I', data, 0x38)[0]
        self.mini_fat_first = struct.unpack_from('<I', data, 0x3C)[0]
        self.difat = list(struct.unpack_from('<' + 'I' * 109, data, 0x4C))
        self.fat = self._read_fat()
        self.mini_fat = self._unpack_fat(self._read_chain(self.mini_fat_first))
        directory = self._read_chain(self.dir_first)
        self.entries = [directory[i:i + 128] for i in range(0, len(directory), 128) if len(directory[i:i + 128]) == 128]
        root = self.entries[0] if self.entries else b'\x00' * 128
        self.mini_stream = self._read_stream_from_entry(root, force_normal=True)

    def _sector(self, index: int) -> bytes:
        start = 512 + index * self.sector_size
        return self.data[start:start + self.sector_size]

    def _unpack_fat(self, raw: bytes) -> list[int]:
        if not raw:
            return []
        return list(struct.unpack('<' + 'I' * (len(raw) // 4), raw[: len(raw) - (len(raw) % 4)]))

    def _read_fat(self) -> list[int]:
        values = []
        for idx in self.difat[: max(self.fat_count, 109)]:
            if idx >= 0xFFFFFFFE:
                continue
            raw = self._sector(idx)
            values.extend(self._unpack_fat(raw))
        return values

    def _follow(self, start: int, table: list[int]) -> list[int]:
        out = []
        seen = set()
        idx = start
        while idx < 0xFFFFFFFE and idx not in seen:
            seen.add(idx)
            out.append(idx)
            if idx >= len(table):
                break
            idx = table[idx]
        return out

    def _read_chain(self, start: int) -> bytes:
        return b''.join(self._sector(i) for i in self._follow(start, self.fat))

    def _read_mini_chain(self, start: int) -> bytes:
        chunks = []
        for idx in self._follow(start, self.mini_fat):
            off = idx * self.mini_sector_size
            chunks.append(self.mini_stream[off:off + self.mini_sector_size])
        return b''.join(chunks)

    def _read_stream_from_entry(self, entry: bytes, force_normal: bool = False) -> bytes:
        start = struct.unpack_from('<I', entry, 0x74)[0]
        size = struct.unpack_from('<I', entry, 0x78)[0]
        if size == 0 or start >= 0xFFFFFFFE:
            return b''
        raw = self._read_chain(start) if force_normal or size >= self.mini_cutoff else self._read_mini_chain(start)
        return raw[:size]

    def streams(self) -> dict[str, bytes]:
        found = {}
        for entry in self.entries:
            name = entry[0:64].decode('utf-16le', errors='ignore').split('\x00', 1)[0]
            typ = entry[0x42]
            if typ != 2 or not name:
                continue
            found[name] = self._read_stream_from_entry(entry)
        return found


def _filetime_to_text(raw: bytes) -> str:
    if len(raw) < 8:
        return ''
    value = struct.unpack('<Q', raw[:8])[0]
    if not value:
        return ''
    epoch = datetime(1601, 1, 1, tzinfo=timezone.utc) + timedelta(microseconds=value / 10)
    return epoch.astimezone().strftime('%Y-%m-%d %H:%M')


def parse_msg_bytes(data: bytes) -> dict[str, Any]:
    try:
        import extract_msg  # type: ignore
        message = extract_msg.Message(BytesIO(data))
        attachments = []
        for att in getattr(message, 'attachments', []) or []:
            attachments.append({
                'name': getattr(att, 'longFilename', None) or getattr(att, 'shortFilename', None) or 'attachment',
                'size': len(getattr(att, 'data', b'') or b''),
                'content_type': '',
            })
        html = str(getattr(message, 'htmlBody', None) or getattr(message, 'htmlBodyPrepared', None) or '')
        return {
            'kind': 'email',
            'from': str(getattr(message, 'sender', None) or getattr(message, 'senderEmail', None) or ''),
            'to': str(getattr(message, 'to', None) or ''),
            'cc': str(getattr(message, 'cc', None) or ''),
            'subject': str(getattr(message, 'subject', None) or '(No subject)'),
            'date': str(getattr(message, 'date', None) or ''),
            'body_text': str(getattr(message, 'body', None) or '').strip(),
            'body_html': _sanitize_html(html),
            'attachments': attachments,
        }
    except Exception:
        pass

    streams = _CfbReader(data).streams()
    props: dict[str, bytes] = {}
    for name, raw in streams.items():
        if name.startswith('__substg1.0_'):
            props[name[12:].upper()] = raw

    def take(*keys: str) -> str:
        for key in keys:
            blob = props.get(key)
            if not blob:
                continue
            if key.endswith('001F'):
                return blob.decode('utf-16le', errors='replace').rstrip('\x00').strip()
            if key.endswith('001E'):
                return blob.decode('latin-1', errors='replace').rstrip('\x00').strip()
        return ''

    date_raw = props.get('00390040') or props.get('0E060040') or b''
    attachments = [
        {'name': name.split('/')[-1], 'size': len(raw), 'content_type': ''}
        for name, raw in streams.items()
        if '__attach' in name.lower()
    ]
    return {
        'kind': 'email',
        'from': take('0C1A001F', '0C1A001E', '0042001F', '0065001F', '0076001F', '0C1F001F'),
        'to': take('0E04001F', '0E04001E'),
        'cc': take('0E03001F', '0E03001E'),
        'subject': take('0037001F', '0037001E') or '(No subject)',
        'date': _filetime_to_text(date_raw),
        'body_text': take('1000001F', '1000001E'),
        'body_html': _sanitize_html(take('1013001F', '1013001E')),
        'attachments': attachments,
    }


def psd_to_png_bytes(data: bytes) -> bytes:
    from PIL import Image
    image = Image.open(BytesIO(data))
    image = image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
    out = BytesIO()
    image.save(out, format='PNG')
    return out.getvalue()


def parse_email_bytes(data: bytes, filename: str = '') -> dict[str, Any]:
    name = (filename or '').lower()
    if name.endswith('.eml') or data.lstrip().startswith((b'From:', b'Received:', b'MIME-Version:', b'Return-Path:')):
        return parse_eml_bytes(data)
    return parse_msg_bytes(data)
