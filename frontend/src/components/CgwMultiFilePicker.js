import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Eye, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

/** Coerce legacy single File or array into a stable File[]. */
export function normalizeFileList(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

function LocalImagePreviews({ files }) {
  const list = normalizeFileList(files);
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    const imgs = list.filter((f) => f && typeof f.type === 'string' && f.type.startsWith('image/'));
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
          alt={list[i]?.name ? `Preview ${list[i].name}` : `Preview ${i + 1}`}
          className="h-16 w-16 rounded border border-gray-200 object-cover bg-white"
        />
      ))}
    </div>
  );
}

/** Saved server-side attachments (preview in edit / after submit). */
export function CgwExistingAttachments({ attachments, onPreview, label = 'Saved files' }) {
  const list = Array.isArray(attachments) ? attachments : [];
  if (!list.length) return null;
  return (
    <div className="mb-2 space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <ul className="space-y-1">
        {list.map((att) => (
          <li key={att.id}>
            <button
              type="button"
              onClick={() => onPreview?.(att)}
              className="flex w-full items-center gap-2 rounded border border-blue-100 bg-blue-50/50 px-2 py-1.5 text-xs text-blue-800 hover:bg-blue-100 hover:border-blue-200 text-left transition-colors"
              title={`Preview: ${att.file_name || 'File'}`}
            >
              <span className="flex-1 truncate font-medium">{att.file_name || 'File'}</span>
              <Eye className="h-3.5 w-3.5 shrink-0 opacity-70" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Attachments via + button: each click opens file picker and appends to the list.
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
}) {
  const inputRef = useRef(null);
  const list = normalizeFileList(files);

  const openPicker = () => {
    inputRef.current?.click();
  };

  const handlePick = (e) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (!picked.length) return;
    let next = picked;
    if (imageOnly) {
      next = picked.filter(
        (f) => f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(f.name),
      );
      if (next.length < picked.length) {
        toast.error('Only image files are allowed for this field');
      }
    }
    if (!next.length) return;
    onChange([...list, ...next]);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        {label ? (
          <Label className="text-sm font-medium text-gray-700 leading-snug pt-1">{label}</Label>
        ) : (
          <span className="text-sm font-medium text-gray-700">{addLabel}</span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
          onClick={openPicker}
          aria-label={label ? `Add file for ${label}` : 'Add file'}
        >
          <Plus className="h-4 w-4 mr-1" />
          {addLabel}
        </Button>
      </div>

      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handlePick} />

      <div className="rounded-md border border-dashed border-gray-200 bg-white px-3 py-2.5">
        <CgwExistingAttachments
          attachments={existingAttachments}
          onPreview={onPreviewExisting}
        />
        <LocalImagePreviews files={list} />
        {list.length > 0 ? (
          <ul className="space-y-1.5">
            {list.map((f, i) => (
              <li
                key={`${f.name}-${f.size}-${f.lastModified}-${i}`}
                className="flex items-center gap-2 rounded border border-gray-100 bg-white px-2 py-1.5 text-xs text-gray-700"
              >
                <span className="flex-1 truncate" title={f.name}>
                  {f.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0 text-gray-500 hover:text-red-600"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => onChange(list.filter((_, j) => j !== i))}
                >
                  <X className="h-3.5 w-3.5" />
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
              className="h-7 text-xs text-gray-500"
              onClick={() => onChange([])}
            >
              Clear all ({list.length})
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
