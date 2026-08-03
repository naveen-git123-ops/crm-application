import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, Pencil } from 'lucide-react';
import { API_ENDPOINT } from '@/lib/apiConfig';
import { useLeadCategories } from '@/hooks/useLeadCategories';
import { useRegisterPageHeader } from '@/contexts/PageHeaderContext';

const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

export const AdminConsole = () => {
  const { categories, loading, refreshCategories } = useLeadCategories();
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editSubcategories, setEditSubcategories] = useState([]);
  const [newSubcategory, setNewSubcategory] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState(null);
  const [deletingSubId, setDeletingSubId] = useState(null);

  const editingCategory = categories.find((c) => c.id === editingCategoryId) || null;

  const openEditDialog = (categoryId, e) => {
    e?.stopPropagation();
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    setEditingCategoryId(categoryId);
    setEditCategoryName(cat.name);
    setEditSubcategories((cat.subcategories || []).map((sub) => ({ id: sub.id, name: sub.name })));
    setNewSubcategory('');
    setEditDialogOpen(true);
  };

  const updateSubcategoryField = (subId, name) => {
    setEditSubcategories((prev) => prev.map((sub) => (sub.id === subId ? { ...sub, name } : sub)));
  };

  const addCategory = async (e) => {
    e.preventDefault();
    const name = newCategory.trim();
    if (!name) {
      toast.error('Category name is required');
      return;
    }
    setSavingCategory(true);
    try {
      const { data } = await axios.post(`${API_ENDPOINT}/lead-categories`, { name }, authHeaders());
      toast.success('Category added');
      setNewCategory('');
      setCategoryDialogOpen(false);
      await refreshCategories();
      if (data?.id) {
        setEditingCategoryId(data.id);
        setEditCategoryName(data.name);
        setEditSubcategories([]);
        setNewSubcategory('');
        setEditDialogOpen(true);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add category');
    } finally {
      setSavingCategory(false);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editingCategory) return;

    const trimmedCategoryName = editCategoryName.trim();
    if (!trimmedCategoryName) {
      toast.error('Category name is required');
      return;
    }

    const trimmedSubs = editSubcategories.map((sub) => ({
      ...sub,
      name: sub.name.trim(),
    }));
    if (trimmedSubs.some((sub) => !sub.name)) {
      toast.error('Subcategory names cannot be empty');
      return;
    }

    const trimmedNewSub = newSubcategory.trim();
    const originalSubs = editingCategory.subcategories || [];

    setSavingEdit(true);
    try {
      if (trimmedCategoryName !== editingCategory.name) {
        await axios.put(
          `${API_ENDPOINT}/lead-categories/${editingCategory.id}`,
          { name: trimmedCategoryName },
          authHeaders(),
        );
      }

      for (const sub of trimmedSubs) {
        if (sub.pending || String(sub.id).startsWith('pending-')) {
          await axios.post(
            `${API_ENDPOINT}/lead-categories/${editingCategory.id}/subcategories`,
            { name: sub.name },
            authHeaders(),
          );
          continue;
        }
        const original = originalSubs.find((item) => item.id === sub.id);
        if (original && original.name !== sub.name) {
          await axios.put(
            `${API_ENDPOINT}/lead-categories/${editingCategory.id}/subcategories/${sub.id}`,
            { name: sub.name },
            authHeaders(),
          );
        }
      }

      if (trimmedNewSub) {
        await axios.post(
          `${API_ENDPOINT}/lead-categories/${editingCategory.id}/subcategories`,
          { name: trimmedNewSub },
          authHeaders(),
        );
      }

      toast.success('Category updated');
      await refreshCategories();
      setEditDialogOpen(false);
      setEditingCategoryId('');
      setEditCategoryName('');
      setEditSubcategories([]);
      setNewSubcategory('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update category');
    } finally {
      setSavingEdit(false);
    }
  };

  const removeCategory = async (categoryId, e) => {
    e?.stopPropagation();
    if (!window.confirm('Delete this category and all its subcategories?')) return;
    setDeletingCategoryId(categoryId);
    try {
      await axios.delete(`${API_ENDPOINT}/lead-categories/${categoryId}`, authHeaders());
      toast.success('Category deleted');
      if (editingCategoryId === categoryId) {
        setEditDialogOpen(false);
        setEditingCategoryId('');
      }
      refreshCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete category');
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const removeSubcategory = async (subcategoryId) => {
    if (!editingCategory) return;
    if (String(subcategoryId).startsWith('pending-')) {
      setEditSubcategories((prev) => prev.filter((sub) => sub.id !== subcategoryId));
      return;
    }
    setDeletingSubId(subcategoryId);
    try {
      await axios.delete(
        `${API_ENDPOINT}/lead-categories/${editingCategory.id}/subcategories/${subcategoryId}`,
        authHeaders(),
      );
      toast.success('Subcategory removed');
      setEditSubcategories((prev) => prev.filter((sub) => sub.id !== subcategoryId));
      refreshCategories();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete subcategory');
    } finally {
      setDeletingSubId(null);
    }
  };

  const pageHeaderActions = useMemo(
    () => (
      <Button
        className="bg-blue-600 text-white hover:bg-blue-700 h-9 sm:h-10 text-sm"
        data-testid="add-category-button"
        onClick={() => setCategoryDialogOpen(true)}
      >
        <Plus className="h-4 w-4 mr-2" />
        Add category
      </Button>
    ),
    [],
  );

  useRegisterPageHeader({
    subtitle: `${categories.length} categories · manage lead category options`,
    actions: pageHeaderActions,
    enabled: !loading,
  });

  if (loading && categories.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-console-page">
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-md bg-white rounded-lg border border-gray-200 shadow-xl p-0">
          <div className="bg-blue-600 text-white p-6 rounded-t-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white">Add category</DialogTitle>
              <p className="text-blue-100 text-sm mt-1">Creates a new lead category</p>
            </DialogHeader>
          </div>
          <form onSubmit={addCategory} className="space-y-4 p-6">
            <div className="space-y-2">
              <Label htmlFor="new-category" className="text-sm font-semibold text-gray-900">
                Category name *
              </Label>
              <Input
                id="new-category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="e.g. Project, Automation"
                required
                className="h-11 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex gap-3 pt-2 justify-end border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                className="border-gray-300"
                onClick={() => setCategoryDialogOpen(false)}
                disabled={savingCategory}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={savingCategory}>
                {savingCategory ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setEditingCategoryId('');
            setEditCategoryName('');
            setEditSubcategories([]);
            setNewSubcategory('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg bg-white rounded-lg border border-gray-200 shadow-xl p-0 max-h-[90vh] overflow-y-auto">
          <div className="bg-blue-600 text-white p-6 rounded-t-lg">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white">Edit category</DialogTitle>
              <p className="text-blue-100 text-sm mt-1">Update category name and subcategories</p>
            </DialogHeader>
          </div>
          <form onSubmit={saveEdit} className="p-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="edit-category" className="text-sm font-semibold text-gray-900">
                Category name *
              </Label>
              <Input
                id="edit-category"
                value={editCategoryName}
                onChange={(e) => setEditCategoryName(e.target.value)}
                placeholder="e.g. Project, Automation"
                required
                className="h-11 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold text-gray-900">Subcategories</Label>
              {editSubcategories.length === 0 ? (
                <p className="text-sm text-gray-500">No subcategories yet. Add one below.</p>
              ) : (
                <div className="space-y-2">
                  {editSubcategories.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-2">
                      <Input
                        value={sub.name}
                        onChange={(e) => updateSubcategoryField(sub.id, e.target.value)}
                        placeholder="Subcategory name"
                        className="h-10 border border-gray-300 rounded-lg"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-10 w-10 shrink-0 border-red-300 text-red-700 hover:bg-red-50"
                        disabled={deletingSubId === sub.id}
                        onClick={() => removeSubcategory(sub.id)}
                      >
                        {deletingSubId === sub.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Input
                  id="new-subcategory-edit"
                  value={newSubcategory}
                  onChange={(e) => setNewSubcategory(e.target.value)}
                  placeholder="Add new subcategory"
                  className="h-10 border border-gray-300 rounded-lg"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 shrink-0 border-gray-300"
                  onClick={() => {
                    const name = newSubcategory.trim();
                    if (!name) {
                      toast.error('Enter a subcategory name');
                      return;
                    }
                    if (editSubcategories.some((sub) => sub.name.trim().toLowerCase() === name.toLowerCase())) {
                      toast.error('Subcategory already listed');
                      return;
                    }
                    setEditSubcategories((prev) => [...prev, { id: `pending-${Date.now()}`, name, pending: true }]);
                    setNewSubcategory('');
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex gap-3 pt-2 justify-end border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                className="border-gray-300"
                onClick={() => setEditDialogOpen(false)}
                disabled={savingEdit}
              >
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={savingEdit}>
                {savingEdit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Categories</h2>
          <p className="text-sm text-gray-500">{categories.length} total · use edit to manage subcategories</p>
        </div>

        {categories.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No categories yet.</p>
            <p className="text-sm mt-1">Use &quot;Add category&quot; to create one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 w-[22%]">Category</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Subcategories</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id} className="border-b border-gray-100 hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4 font-medium text-gray-900 align-top">{cat.name}</td>
                    <td className="py-3 px-4 align-top">
                      {(cat.subcategories || []).length === 0 ? (
                        <span className="text-gray-400 italic">None</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {cat.subcategories.map((sub) => (
                            <span
                              key={sub.id}
                              className="inline-flex px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 text-xs font-medium border border-blue-100"
                            >
                              {sub.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 border-gray-300 text-gray-700 hover:bg-gray-50"
                          onClick={(e) => openEditDialog(cat.id, e)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 border-red-300 text-red-700 hover:bg-red-50"
                          disabled={deletingCategoryId === cat.id}
                          onClick={(e) => removeCategory(cat.id, e)}
                        >
                          {deletingCategoryId === cat.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
