import React, { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Film, Image as ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '@/lib/apiErrors';
import {
  INPUT_CLASS, fileHref, fmtBytes, fmtDateTime, serviceApi,
} from '@/lib/serviceUtils';

const PROGRAM_CATEGORY = 'Program/Configuration File';

function extensionOf(name) {
  const idx = String(name || '').lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

/** Mirrors the server rules (the server stays the authority) so people see problems before uploading. */
export function checkFile(file, category, limits) {
  if (!limits) return null;
  const ext = extensionOf(file.name);
  if (!ext) return 'The file needs an extension';
  if (file.size === 0) return 'The file is empty';
  const images = new Set(limits.images);
  const videos = new Set(limits.videos);
  const docs = new Set(limits.documents);
  const programs = new Set(limits.program_files);
  const allowed = images.has(ext) || videos.has(ext) || docs.has(ext) || (category === PROGRAM_CATEGORY && programs.has(ext));
  if (!allowed) return `.${ext} files are not supported for ${category}`;
  const mb = file.size / (1024 * 1024);
  if (images.has(ext) && mb > limits.image_mb) return `Images must be at most ${limits.image_mb} MB`;
  if (videos.has(ext) && mb > limits.video_mb) return `Videos must be at most ${limits.video_mb} MB`;
  if (!images.has(ext) && !videos.has(ext) && mb > limits.document_mb) return `Documents must be at most ${limits.document_mb} MB`;
  return null;
}

function FileIcon({ type }) {
  const ext = String(type || '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'].includes(ext)) return <ImageIcon className="h-4 w-4 text-sky-600" />;
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp'].includes(ext)) return <Film className="h-4 w-4 text-purple-600" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

const IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

/**
 * Reusable attachment uploader + list, used for every attachment type in the module.
 * `categories` limits the choices (and the list) to the categories relevant to the place it is used.
 */
export function AttachmentPanel({
  serviceId, attachments = [], categories, limits, canEdit, canRemove, locked, onChanged, askReason,
  visitId, vendorRepairId, defaultCategory, title = 'Photos, videos and documents', showOnly,
}) {
  const [category, setCategory] = useState(defaultCategory || categories[0] || '');
  const [description, setDescription] = useState('');
  const [uploads, setUploads] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const visible = useMemo(() => {
    const filter = showOnly || categories;
    return attachments.filter((a) => filter.includes(a.category)
      && (!vendorRepairId || a.vendor_repair_id === vendorRepairId)
      && (!visitId || a.visit_id === visitId));
  }, [attachments, categories, showOnly, vendorRepairId, visitId]);

  const setUpload = (key, patch) => setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  const doUpload = async (files, reason) => {
    setBusy(true);
    const queue = files.map((file, index) => ({ key: `${Date.now()}-${index}`, file, progress: 0, error: '' }));
    setUploads(queue);
    let okCount = 0;
    for (const item of queue) {
      const problem = checkFile(item.file, category, limits);
      if (problem) {
        setUpload(item.key, { error: problem });
        continue;
      }
      const form = new FormData();
      form.append('file', item.file);
      form.append('category', category);
      form.append('description', description);
      if (visitId) form.append('visit_id', visitId);
      if (vendorRepairId) form.append('vendor_repair_id', vendorRepairId);
      if (reason) form.append('reason', reason);
      try {
        // eslint-disable-next-line no-await-in-loop
        await serviceApi.upload(`/service-requests/${serviceId}/attachments`, form, (pct) => setUpload(item.key, { progress: pct }));
        okCount += 1;
        setUpload(item.key, { progress: 100, done: true });
      } catch (err) {
        setUpload(item.key, { error: getApiErrorMessage(err, 'Upload failed') });
      }
    }
    setBusy(false);
    if (okCount > 0) {
      toast.success(okCount === 1 ? 'File uploaded' : `${okCount} files uploaded`);
      setDescription('');
      onChanged?.();
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const onPick = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    if (locked && askReason) {
      askReason({
        title: 'Reason for adding files',
        description: 'This request is locked. The change is recorded in its history.',
        confirmLabel: 'Upload',
        run: (reason) => doUpload(files, reason),
      });
    } else {
      doUpload(files);
    }
  };

  const remove = (attachment) => {
    const run = async (reason) => {
      try {
        await serviceApi.del(`/service-requests/${serviceId}/attachments/${attachment.id}`, reason ? { reason } : undefined);
        toast.success('File removed');
        onChanged?.();
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Could not remove the file'));
      }
    };
    if (locked && askReason) {
      askReason({ title: 'Reason for removing the file', confirmLabel: 'Remove', run });
    } else if (window.confirm(`Remove ${attachment.file_name}?`)) {
      run('');
    }
  };

  return (
    <div className="space-y-3" data-testid="service-attachments">
      <div className="flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">({visible.length})</span>
      </div>

      {canEdit && (
        <div className="grid grid-cols-1 items-end gap-2 rounded-lg border border-dashed border-input bg-muted p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`att-cat-${vendorRepairId || visitId || 'main'}`}>Category</label>
            <select
              id={`att-cat-${vendorRepairId || visitId || 'main'}`}
              className={INPUT_CLASS}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={busy}
            >
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="attachmentpanel-field-1" className="text-xs font-medium text-muted-foreground">Description (optional)</label>
            <Input id="attachmentpanel-field-1" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} disabled={busy} placeholder="What does this show?" />
          </div>
          <div>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={onPick} disabled={busy} />
            <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
              <Upload className="mr-1 h-4 w-4" />
              {busy ? 'Uploading…' : 'Choose files'}
            </Button>
          </div>
          {limits && (
            <p className="text-xs text-muted-foreground md:col-span-3">
              Images up to {limits.image_mb} MB, videos up to {limits.video_mb} MB, documents up to {limits.document_mb} MB.
              Programs and scripts are not accepted.
            </p>
          )}
        </div>
      )}

      {uploads.length > 0 && (
        <ul className="space-y-1 text-xs">
          {uploads.map((u) => (
            <li key={u.key} className={u.error ? 'text-rose-700' : 'text-muted-foreground'}>
              {u.file.name} — {u.error || (u.done ? 'uploaded' : `${u.progress}%`)}
            </li>
          ))}
        </ul>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-white">
          {visible.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              {IMAGE_TYPES.includes(a.file_type) ? (
                <a href={fileHref(a.file_url)} target="_blank" rel="noreferrer">
                  <img src={fileHref(a.file_url)} alt={a.file_name} className="h-10 w-10 rounded object-cover" loading="lazy" />
                </a>
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded bg-muted"><FileIcon type={a.file_type} /></span>
              )}
              <div className="min-w-0 flex-1">
                <a href={fileHref(a.file_url)} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-indigo-700 hover:underline">
                  {a.file_name}
                </a>
                <div className="truncate text-xs text-muted-foreground">
                  {a.category} · {fmtBytes(a.file_size)} · {a.uploaded_by_name || 'Unknown'} · {fmtDateTime(a.uploaded_at)}
                </div>
                {a.description && <div className="truncate text-xs text-muted-foreground">{a.description}</div>}
              </div>
              {canRemove && (
                <Button variant="ghost" size="icon" onClick={() => remove(a)} aria-label={`Remove ${a.file_name}`}>
                  <Trash2 className="h-4 w-4 text-rose-600" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AttachmentPanel;
