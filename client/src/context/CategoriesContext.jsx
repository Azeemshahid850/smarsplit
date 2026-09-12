import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as categoriesApi from '../api/categories.js';

const CategoriesContext = createContext(null);

/**
 * One source of truth for category names. Loaded once after sign-in, so every
 * picker in the app offers the same list — defaults plus whatever the user added.
 */
export function CategoriesProvider({ children }) {
  const [state, setState] = useState({ defaults: [], custom: [], all: [] });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(
    () =>
      categoriesApi
        .listCategories()
        .then(setState)
        .catch(() => {})
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo(
    () => ({
      ...state,
      loading,
      reload,
      add: async (name) => {
        const result = await categoriesApi.createCategory(name);
        await reload();
        return result.category;
      },
      remove: async (id) => {
        const result = await categoriesApi.deleteCategory(id);
        await reload();
        return result;
      },
      usage: categoriesApi.categoryUsage,
    }),
    [state, loading, reload],
  );

  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export const useCategories = () => {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error('useCategories must be used inside <CategoriesProvider>');
  return ctx;
};
