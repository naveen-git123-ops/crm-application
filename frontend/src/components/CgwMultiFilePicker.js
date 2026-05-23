import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
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
          className="h-20 w-20 rounded border border-gray-200 object-cover bg-gray-100"
        />
      ))}
    </div>
  );
}

/**
 * Multi-file picker: append on each selection, list with per-file remove.
 */
export function CgwMultiFilePicker({
  label,
  accept,
  files,
  onChange,
  imageOnly = false,
  hint = 'You can select multiple files. Each pick adds to the list.',
  className = '',
}) {
  const list = normalizeFileList(files);

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
      {label ? <Label className="text-sm font-medium text-gray-700">{label}</Label> : null}
      <Input type="file" multiple accept={accept} onChange={handlePick} className="h-11 text-sm" />
      <LocalImagePreviews files={list} />
      {list.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-gray-200 bg-gray-50/80 p-2 max-h-36 overflow-y-auto">
          {list.map((f, i) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`} className="flex items-center gap-2 text-xs text-gray-700">
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
        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-gray-600" onClick={() => onChange([])}>
          Clear all ({list.length})
        </Button>
      ) : null}
    </div>
  );
}
