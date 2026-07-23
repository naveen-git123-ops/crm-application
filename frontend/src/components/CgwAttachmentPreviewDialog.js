import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { API_ENDPOINT, BACKEND_BASE_URL } from '@/lib/apiConfig';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { ExternalLink, FileText, X } from 'lucide-react';

const API = API_ENDPOINT;

function resolveHref(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${BACKEND_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function isImage(nameOrUrl) {
  return /\.(jpg|jpeg|png|gif|webp|bmp)(\?|#|$)/i.test(nameOrUrl || '');
}

function isPdf(nameOrUrl) {
  return /\.pdf(\?|#|$)/i.test(nameOrUrl || '');
}

function isStreamableRemote(full) {
  return (
    !!full &&
    /^https?:\/\//i.test(full) &&
    (full.includes('.amazonaws.com') || full.includes('.digitaloceanspaces.com'))
  );
}

/**
 * Popup preview for a single saved CGW attachment (image / PDF via stream API).
 */
export function CgwAttachmentPreviewDialog({ open, onOpenChange, attachment, subtitle = '' }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const blobRef = useRef(null);

  const fileName = attachment?.file_name || 'Attachment';
  const rawHref = attachment?.url ? resolveHref(attachment.url) : '';
  const shouldStream = isStreamableRemote(rawHref);
  const effectivePdf = isPdf(fileName) || isPdf(rawHref) || (attachment?.mime_type || '').includes('pdf');
  const effectiveImage =
    isImage(fileName) ||
    isImage(rawHref) ||
    (attachment?.mime_type || '').startsWith('image/');

  useEffect(() => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
    setPreviewUrl('');
    setError('');

    if (!open || !attachment?.url) {
      setLoading(false);
      return undefined;
    }

    if (!rawHref) {
      setError('No file URL available.');
      setLoading(false);
      return undefined;
    }

    if (!shouldStream) {
      setPreviewUrl(rawHref);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API}/files/stream`, {
          params: { file_url: rawHref },
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        });
        if (cancelled) return;
        const contentType = res.headers?.['content-type'] || attachment?.mime_type || 'application/octet-stream';
        const blob = new Blob([res.data], { type: contentType });
        const u = URL.createObjectURL(blob);
        blobRef.current = u;
        setPreviewUrl(u);
      } catch (err) {
        if (!cancelled) {
          setError(getApiErrorMessage(err, 'Could not load file preview'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, attachment, rawHref, shouldStream]);

  useEffect(
    () => () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    },
    [],
  );

  const displaySrc = shouldStream ? previewUrl : rawHref;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 p-0 overflow-hidden max-w-[min(960px,96vw)] w-[min(960px,96vw)] max-h-[min(88vh,820px)] h-[min(88vh,820px)] bg-white rounded-lg border border-gray-200 shadow-xl">
        <div className="bg-slate-800 text-white px-4 py-3 pr-12 shrink-0">
          <DialogHeader className="space-y-0 text-left">
            <DialogTitle className="text-base font-semibold text-white flex items-center gap-2 m-0">
              <FileText className="h-5 w-5 shrink-0" />
              <span className="truncate" title={fileName}>
                {fileName}
              </span>
            </DialogTitle>
            {subtitle ? <p className="text-slate-300 text-xs mt-1 truncate">{subtitle}</p> : null}
          </DialogHeader>
        </div>

        <div className="relative flex-1 min-h-0 bg-neutral-900">
          {!attachment?.url ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-sm text-gray-600 p-6 text-center">
              No attachment selected.
            </div>
          ) : loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-sm text-gray-600">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-100 text-sm text-gray-600 p-6 text-center">
              <p>{error}</p>
              {rawHref ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={rawHref} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Open file in new tab
                  </a>
                </Button>
              ) : null}
            </div>
          ) : effectivePdf && displaySrc ? (
            <iframe title={fileName} src={displaySrc} className="absolute inset-0 h-full w-full border-0 bg-white" />
          ) : effectiveImage && displaySrc ? (
            <div className="absolute inset-0 overflow-auto bg-gray-100 flex items-center justify-center p-3">
              <img src={displaySrc} alt={fileName} className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-100 text-sm text-gray-600 p-6 text-center">
              <p>Inline preview is not available for this file type.</p>
              {displaySrc ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={displaySrc} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Open file in new tab
                  </a>
                </Button>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-gray-200 bg-white shrink-0">
          {displaySrc && !loading ? (
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" asChild>
              <a href={displaySrc} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Open in new tab
              </a>
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            <X className="h-3.5 w-3.5 mr-1" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CgwAttachmentPreviewDialog;
