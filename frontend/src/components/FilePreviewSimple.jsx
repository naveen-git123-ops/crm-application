import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_ENDPOINT, BACKEND_BASE_URL } from '@/lib/apiConfig';

function resolveHref(url) {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${BACKEND_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function isStreamableRemote(full) {
  return (
    !!full &&
    /^https?:\/\//i.test(full) &&
    (full.includes('.amazonaws.com') || full.includes('.digitaloceanspaces.com'))
  );
}

function extFrom(url, fileName) {
  const source = fileName && String(fileName).includes('.') ? fileName : url;
  try {
    let path = String(source || '');
    if (path.includes('://')) path = new URL(path).pathname;
    const filename = path.split('/').pop() || '';
    return (filename.split('.').pop() || '').toLowerCase().split('?')[0] || '';
  } catch {
    return '';
  }
}

function mimeForExt(ext) {
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  return '';
}

function DownloadLink({ href, fileName, label }) {
  if (!href) return null;
  return (
    <a
      href={href}
      download={fileName}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
    >
      {label}
    </a>
  );
}

export function FilePreviewSimple({ fileUrl, fileName = 'File' }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const blobRef = useRef(null);

  const fullHref = resolveHref(fileUrl);
  const ext = extFrom(fileUrl, fileName);
  const shouldStream = isStreamableRemote(fullHref);
  const downloadName = fileName?.includes('.') ? fileName : `${fileName}${ext ? `.${ext}` : ''}`;

  useEffect(() => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
    setError('');
    setPreviewUrl('');

    if (!fullHref) {
      setError('No file URL provided');
      return undefined;
    }

    if (!shouldStream) {
      setPreviewUrl(fullHref);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_ENDPOINT}/files/stream`, {
          params: { file_url: fullHref },
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        });
        if (cancelled) return;
        const headerType = String(res.headers?.['content-type'] || '').split(';')[0].trim();
        const mime = mimeForExt(ext) || headerType || 'application/octet-stream';
        const blob = new Blob([res.data], { type: mime });
        const objectUrl = URL.createObjectURL(blob);
        blobRef.current = objectUrl;
        setPreviewUrl(objectUrl);
      } catch (_err) {
        if (!cancelled) setError('Could not load preview. You can still try downloading the file.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fullHref, shouldStream, ext]);

  useEffect(
    () => () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    },
    [],
  );

  if (!fileUrl) {
    return <p className="p-5 text-sm text-gray-500">No file URL provided</p>;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-sm text-gray-600">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        Loading preview…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700 mb-4">{error}</p>
        <DownloadLink
          href={shouldStream ? '' : fullHref}
          fileName={downloadName}
          label="Download file"
        />
      </div>
    );
  }

  if (!previewUrl) {
    return <p className="p-5 text-sm text-gray-500">Preparing preview…</p>;
  }

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
    return (
      <div className="flex justify-center p-4">
        <img
          src={previewUrl}
          alt={fileName}
          className="max-h-[70vh] max-w-full rounded-md shadow-sm"
        />
      </div>
    );
  }

  if (ext === 'pdf') {
    return (
      <iframe
        title="PDF preview"
        src={previewUrl}
        className="h-[70vh] w-full rounded-md border border-gray-200 bg-white"
      />
    );
  }

  if (['mp4', 'webm', 'ogg', 'avi', 'mov'].includes(ext)) {
    return (
      <div className="flex justify-center p-4">
        <video controls className="max-h-[70vh] max-w-full rounded-md">
          <source src={previewUrl} type={mimeForExt(ext) || undefined} />
        </video>
      </div>
    );
  }

  if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) {
    return (
      <div className="p-5">
        <audio controls className="w-full">
          <source src={previewUrl} type={mimeForExt(ext) || undefined} />
        </audio>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
      <p className="text-sm font-medium text-gray-900 mb-1">{downloadName}</p>
      <p className="text-xs text-gray-500 mb-4">Preview is not available for this file type</p>
      <DownloadLink href={previewUrl} fileName={downloadName} label={`Download ${ext ? ext.toUpperCase() : 'file'}`} />
    </div>
  );
}

export default FilePreviewSimple;
