import React from 'react';
import { Label } from '@/components/ui/label';
import { subcategoriesForCategory } from '@/hooks/useLeadCategories';

const selectClass =
  'flex h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900';

const labelClass = 'text-sm font-semibold text-gray-700';

export function LeadCategoryFields({
  form,
  setForm,
  categories,
  loading,
  categoryId = 'lead-category',
  subCategoryId = 'lead-sub-category',
}) {
  const subOptions = subcategoriesForCategory(categories, form.category);
  const categoryNames = (categories || []).map((c) => c.name);
  const showLegacyCategory = form.category && !categoryNames.includes(form.category);
  const showLegacySub = form.sub_category && !subOptions.some((s) => s.name === form.sub_category);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor={categoryId} className={labelClass}>Category</Label>
        <select
          id={categoryId}
          value={form.category}
          disabled={loading}
          onChange={(e) => setForm({ ...form, category: e.target.value, sub_category: '' })}
          className={selectClass}
        >
          <option value="">{loading ? 'Loading…' : 'Select category'}</option>
          {showLegacyCategory && (
            <option value={form.category}>{form.category}</option>
          )}
          {(categories || []).map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={subCategoryId} className={labelClass}>Subcategory</Label>
        <select
          id={subCategoryId}
          value={form.sub_category}
          disabled={loading || !form.category}
          onChange={(e) => setForm({ ...form, sub_category: e.target.value })}
          className={selectClass}
        >
          <option value="">
            {!form.category ? 'Select category first' : subOptions.length ? 'Select subcategory' : 'No subcategories'}
          </option>
          {showLegacySub && (
            <option value={form.sub_category}>{form.sub_category}</option>
          )}
          {subOptions.map((s) => (
            <option key={s.id} value={s.name}>{s.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
