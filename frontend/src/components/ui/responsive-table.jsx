import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Copies each column header's text onto the matching body cells as `data-label`
 * so CSS (`.rt-cards` in index.css) can render every row as a labelled card on phones.
 * Header cells named "Actions"/"View"/empty get no label (the cell spans the full card width).
 */
function labelTableCells(root) {
  root.querySelectorAll('table').forEach((table) => {
    const headRows = table.querySelectorAll('thead tr');
    const headRow = headRows[headRows.length - 1];
    if (!headRow) return;
    const labels = [];
    headRow.querySelectorAll('th').forEach((th) => {
      const span = th.colSpan || 1;
      const text = (th.textContent || '').replace(/\s+/g, ' ').trim();
      for (let i = 0; i < span; i += 1) labels.push(text);
    });
    table.querySelectorAll('tbody tr').forEach((tr) => {
      let col = 0;
      Array.from(tr.children).forEach((td) => {
        if (td.tagName !== 'TD') return;
        const span = td.colSpan || 1;
        const raw = span > 1 ? '' : labels[col] || '';
        const label = /^(actions?|view|edit)?$/i.test(raw) ? '' : raw;
        if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label);
        col += span;
      });
    });
  });
}

/**
 * Drop-in replacement for `<div className="overflow-x-auto">` around a `<table>`.
 * Desktop/tablet: unchanged scrolling table. Phones (<768px): one card per row.
 */
export function ResponsiveTable({ className, children, ...props }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => labelTableCells(el));
    };
    run();
    const observer = new MutationObserver(run);
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className={cn('rt-cards overflow-x-auto', className)} {...props}>
      {children}
    </div>
  );
}

export default ResponsiveTable;
