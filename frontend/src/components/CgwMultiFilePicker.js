import React, { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Eye, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

/** Coerce legacy single File or array into a stable File[]. */
export function normalizeFileList(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

function isImageFile(file) {
  if (!file) return false;
  if (typeof file.type === 'string' && file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(file.name || '');
}

function isPdfFile(file) {
  if (!file) return false;
  if (file.type === 'application/pdf') return true;
  return /\.pdf$/i.test(file.name || '');
}

function LocalFilePreviewDialog({ open, onOpenChange, file }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!open || !file) {
      setUrl('');
      return undefined;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [open, file]);

  const name = file?.name || 'File';
  const image = isImageFile(file);
  const pdf = isPdfFile(file);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 p-0 overflow-hidden max-w-[min(900px,96vw)] w-[min(900px,96vw)] max-h-[min(88vh,780px)] h-[min(88vh,780px)] bg-white rounded-lg border border-gray-200 shadow-xl">
        <div className="bg-slate-800 text-white px-4 py-3 pr-12 shrink-0">
          <DialogHeader className="space-y-0 text-left">
            <DialogTitle className="text-base font-semibold text-white truncate m-0" title={name}>
              Preview · {name}
            </DialogTitle>
            <p className="text-slate-300 text-xs mt-1">Selected file (not saved yet)</p>
          </DialogHeader>
        </div>
        <div className="relative flex-1 min-h-0 bg-neutral-900">
          {!url ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-sm text-gray-600">
              Loading preview…
            </div>
          ) : pdf ? (
            <iframe title={name} src={url} className="absolute inset-0 h-full w-full border-0 bg-white" />
          ) : image ? (
            <div className="absolute inset-0 overflow-auto bg-gray-100 flex items-center justify-center p-3">
              <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-100 text-sm text-gray-600 p-6 text-center">
              <p>Inline preview is not available for this file type.</p>
              <p className="text-xs text-gray-500">{name}</p>
            </div>
          )}
        </div>
        <div className="flex justify-end px-4 py-2.5 border-t border-gray-200 bg-white shrink-0">
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            <X className="h-3.5 w-3.5 mr-1" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LocalImagePreviews({ files }) {
  const list = normalizeFileList(files);
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    const imgs = list.filter((f) => isImageFile(f));
    const u = imgs.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => {
      u.forEach((x) => URL.revokeObjectURL(x));
    };
  }, [files]);
  if (!urls.length) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {urls.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={list.filter((f) => isImageFile(f))[i]?.name ? `Preview ${list.filter((f) => isImageFile(f))[i].name}` : `Preview ${i + 1}`}
          className="h-16 w-16 rounded border border-gray-200 object-cover bg-white"
        />
      ))}
    </div>
  );
}

/** Saved server-side attachments (preview + optional delete/replace). */
export function CgwExistingAttachments({
  attachments,
  onPreview,
  onRemove,
  label = 'Saved files',
  disabled = false,
}) {
  const list = Array.isArray(attachments) ? attachments : [];
  if (!list.length) return null;
  return (
    <div className="mb-2 space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <ul className="space-y-1">
        {list.map((att) => (
          <li
            key={att.id || att.url || att.file_name}
            className="flex items-center gap-1 rounded border border-blue-100 bg-blue-50/50 px-2 py-1.5 text-xs text-blue-800"
          >
            <button
              type="button"
              onClick={() => onPreview?.(att)}
              className="flex flex-1 min-w-0 items-center gap-2 text-left hover:text-blue-950 transition-colors"
              title={`Preview: ${att.file_name || 'File'}`}
            >
              <span className="flex-1 truncate font-medium">{att.file_name || 'File'}</span>
              <Eye className="h-3.5 w-3.5 shrink-0 opacity-70" />
            </button>
            {onRemove ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                className="h-7 w-7 p-0 shrink-0 text-gray-500 hover:text-red-600"
                aria-label={`Delete ${att.file_name || 'file'}`}
                title="Delete and upload again"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(att);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {onRemove ? (
        <p className="text-[10px] text-gray-500">Delete a saved file, then use Add to upload a replacement.</p>
      ) : null}
    </div>
  );
}

/**
 * Attachments via + button: each click opens file picker and appends to the list.
 * Supports immediate local preview and delete/re-upload for saved files.
 */
export function CgwMultiFilePicker({
  label,
  accept,
  files,
  onChange,
  imageOnly = false,
  hint = 'Click + to add files. You can add as many attachments as needed.',
  className = '',
  addLabel = 'Add',
  existingAttachments = null,
  onPreviewExisting = null,
  onRemoveExisting = null,
  disabled = false,
}) {
  const inputId = useId();
  const inputRef = useRef(null);
  const list = normalizeFileList(files);
  const [localPreviewFile, setLocalPreviewFile] = useState(null);
  const [localPreviewOpen, setLocalPreviewOpen] = useState(false);

  const openPicker = () => {
    if (disabled) return;
    const input = inputRef.current;
    if (!input) return;
    // Defer so Radix dialog focus trap does not block the native file picker.
    window.setTimeout(() => {
      try {
        input.click();
      } catch {
        toast.error('Could not open file picker');
      }
    }, 0);
  };

  const handlePick = (e) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (!picked.length) return;
    let next = picked;
    if (imageOnly) {
      next = picked.filter((f) => isImageFile(f));
      if (next.length < picked.length) {
        toast.error('Only image files are allowed for this field');
      }
    }
    if (!next.length) return;
    onChange([...list, ...next]);
  };

  const openLocalPreview = (file) => {
    setLocalPreviewFile(file);
    setLocalPreviewOpen(true);
  };

  return (
    <div className={`space-y-2 ${className}`} data-cgw-file-picker>
      <div className="flex items-start justify-between gap-2">
        {label ? (
          <Label htmlFor={inputId} className="text-sm font-medium text-gray-700 leading-snug pt-1 cursor-pointer">
            {label}
          </Label>
        ) : (
          <span className="text-sm font-medium text-gray-700">{addLabel}</span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="h-8 shrink-0 border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
          onClick={openPicker}
          aria-label={label ? `Add file for ${label}` : 'Add file'}
        >
          <Plus className="h-4 w-4 mr-1" />
          {addLabel}
        </Button>
      </div>

      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        disabled={disabled}
        className="sr-only"
        onChange={handlePick}
        tabIndex={-1}
      />

      <div
        onClick={(e) => {
          if (disabled) return;
          if (e.target.closest('button')) return;
          openPicker();
        }}
        className={`rounded-md border border-dashed border-gray-200 bg-white px-3 py-2.5 ${
          disabled ? '' : 'cursor-pointer hover:border-blue-300 hover:bg-blue-50/30'
        }`}
      >
        <CgwExistingAttachments
          attachments={existingAttachments}
          onPreview={onPreviewExisting}
          onRemove={onRemoveExisting}
          disabled={disabled}
        />
        <LocalImagePreviews files={list} />
        {list.length > 0 ? (
          <ul className="space-y-1.5">
            {list.map((f, i) => (
              <li
                key={`${f.name}-${f.size}-${f.lastModified}-${i}`}
                className="flex items-center gap-1 rounded border border-gray-100 bg-white px-2 py-1.5 text-xs text-gray-700"
              >
                <span className="flex-1 truncate" title={f.name}>
                  {f.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 shrink-0 text-blue-700 hover:text-blue-900 hover:bg-blue-50"
                  aria-label={`Preview ${f.name}`}
                  title="Preview"
                  onClick={(e) => {
                    e.stopPropagation();
                    openLocalPreview(f);
                  }}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Preview
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  className="h-7 w-7 p-0 shrink-0 text-gray-500 hover:text-red-600"
                  aria-label={`Remove ${f.name}`}
                  title="Remove and pick another"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(list.filter((_, j) => j !== i));
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-400">{hint}</p>
        )}

        {list.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-gray-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="h-7 text-xs border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
              onClick={openPicker}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add another
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="h-7 text-xs text-gray-500"
              onClick={() => onChange([])}
            >
              Clear all ({list.length})
            </Button>
          </div>
        ) : null}
      </div>

      <LocalFilePreviewDialog
        open={localPreviewOpen}
        onOpenChange={setLocalPreviewOpen}
        file={localPreviewFile}
      />
    </div>
  );
}
