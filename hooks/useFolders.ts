// hooks/useFolders.ts
// Fetches the current user's folders from /api/folders and exposes helpers
// for building a nested tree and resolving folder paths (breadcrumbs).
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Folder } from '@/types';

export type { Folder };

// A folder node with its children resolved (for rendering the sidebar tree).
export interface FolderNode extends Folder {
  children: FolderNode[];
}

interface UseFoldersReturn {
  folders: Folder[];       // flat list, ordered by display_order then name
  tree: FolderNode[];      // root-level nodes with children nested
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** Returns ancestors from root → folder, not including the folder itself */
  ancestorsOf: (folderId: string) => Folder[];
  /** Returns the folder with the given id, or undefined */
  byId: (folderId: string) => Folder | undefined;
  /** Create a folder; optimistically inserts and re-fetches on success */
  createFolder: (name: string, parentId?: string | null, icon?: string, color?: string | null) => Promise<Folder>;
  /** Rename / recolor / reparent a folder */
  updateFolder: (id: string, patch: Partial<Pick<Folder, 'name' | 'icon' | 'color' | 'parent_id' | 'display_order'>>) => Promise<void>;
  /** Delete a folder (subtree is cascade-deleted server-side) */
  deleteFolder: (id: string) => Promise<void>;
}

export function useFolders(): UseFoldersReturn {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFolders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/folders');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { folders: Folder[] };
      setFolders(json.folders ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load folders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFolders(); }, [fetchFolders]);

  // Build a nested tree from the flat list
  const tree: FolderNode[] = buildTree(folders);

  const byId = useCallback(
    (folderId: string) => folders.find(f => f.id === folderId),
    [folders]
  );

  const ancestorsOf = useCallback(
    (folderId: string): Folder[] => {
      const map = new Map(folders.map(f => [f.id, f]));
      const result: Folder[] = [];
      let current = map.get(folderId);
      while (current?.parent_id) {
        const parent = map.get(current.parent_id);
        if (!parent) break;
        result.unshift(parent);
        current = parent;
      }
      return result;
    },
    [folders]
  );

  const createFolder = useCallback(
    async (name: string, parentId?: string | null, icon?: string, color?: string | null): Promise<Folder> => {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId: parentId ?? null, icon: icon ?? '📁', color: color ?? null }),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        throw new Error(json.error ?? 'Failed to create folder');
      }
      const json = await res.json() as { folder: Folder };
      setFolders(prev => [...prev, json.folder]);
      return json.folder;
    },
    []
  );

  const updateFolder = useCallback(
    async (id: string, patch: Partial<Pick<Folder, 'name' | 'icon' | 'color' | 'parent_id' | 'display_order'>>) => {
      // Map snake_case field names to camelCase for the API
      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.icon !== undefined) body.icon = patch.icon;
      if ('color' in patch) body.color = patch.color;
      if ('parent_id' in patch) body.parentId = patch.parent_id;
      if (patch.display_order !== undefined) body.displayOrder = patch.display_order;

      const res = await fetch(`/api/folders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        throw new Error(json.error ?? 'Failed to update folder');
      }
      const json = await res.json() as { folder: Folder };
      setFolders(prev => prev.map(f => (f.id === id ? json.folder : f)));
    },
    []
  );

  const deleteFolder = useCallback(async (id: string) => {
    const res = await fetch(`/api/folders/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json() as { error?: string };
      throw new Error(json.error ?? 'Failed to delete folder');
    }
    // Remove deleted folder AND any descendants from local state
    setFolders(prev => {
      const deleted = collectSubtree(id, prev);
      return prev.filter(f => !deleted.has(f.id));
    });
  }, []);

  return {
    folders,
    tree,
    loading,
    error,
    refetch: fetchFolders,
    ancestorsOf,
    byId,
    createFolder,
    updateFolder,
    deleteFolder,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildTree(folders: Folder[]): FolderNode[] {
  const map = new Map<string, FolderNode>(
    folders.map(f => [f.id, { ...f, children: [] }])
  );
  const roots: FolderNode[] = [];
  for (const node of map.values()) {
    if (node.parent_id) {
      const parent = map.get(node.parent_id);
      if (parent) parent.children.push(node);
      else roots.push(node); // orphan — parent deleted? show at root.
    } else {
      roots.push(node);
    }
  }
  // Sort each level by display_order, then name
  const sortNodes = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
    nodes.forEach(n => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

/** Returns the ids of folderId and all its descendants (for cascade-remove from local state). */
function collectSubtree(rootId: string, folders: Folder[]): Set<string> {
  const result = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of folders) {
      if (f.parent_id && result.has(f.parent_id) && !result.has(f.id)) {
        result.add(f.id);
        changed = true;
      }
    }
  }
  return result;
}
