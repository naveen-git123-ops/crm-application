import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_ENDPOINT } from '@/lib/apiConfig';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export function useLeadCategories({ enabled = true } = {}) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchCategories = useCallback(async () => {
    if (!enabled) return [];
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_ENDPOINT}/lead-categories`, { headers: authHeader() });
      setCategories(Array.isArray(data) ? data : []);
      return data;
    } catch {
      setCategories([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) fetchCategories();
  }, [enabled, fetchCategories]);

  return { categories, loading, refreshCategories: fetchCategories };
}

export function subcategoriesForCategory(categories, categoryName) {
  if (!categoryName) return [];
  const cat = (categories || []).find((c) => c.name === categoryName);
  return cat?.subcategories || [];
}
