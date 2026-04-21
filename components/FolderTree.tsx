// components/FolderTree.tsx
// Collapsible sidebar folder tree.  Shows All Lectures at the top,
// then the user's folder hierarchy.  Selecting a node fires onSelect(id | null).
'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { FolderNode } from '@/hooks/useFolders';
import type { Theme } from '@/types';

interface FolderTreeProps {
  tree: FolderNode[];
  selectedId: string | null;  // null = "All Lectures"
  activeTheme: Theme;
  onSelect: (folderId: string | null) => void;
  /** Optional: show count badge on each node */
  lectureCounts?: Record<string, number>; // folderId → count of lectures directly in it
  onCreateFolder?: (parentId: string | null) => void;
}

export default function FolderTree({
  tree,
  selectedId,
  activeTheme: _activeTheme,
  onSelect,
  lectureCounts = {},
  onCreateFolder,
}: FolderTreeProps) {
  return (
    <nav className="ftree-nav" aria-label="Folder navigation">
      {/* All Lectures root */}
      <button
        className={`ftree-row ftree-root ${selectedId === null ? 'ftree-selected' : ''}`}
        onClick={() => onSelect(null)}
      >
        <span className="ftree-icon">📚</span>
        <span className="ftree-label">All Lectures</span>
      </button>

      <div className="ftree-separator" />

      {/* Folder hierarchy */}
      {tree.map(node => (
        <FolderTreeNode
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          lectureCounts={lectureCounts}
          onCreateFolder={onCreateFolder}
        />
      ))}

      {/* New top-level folder button */}
      {onCreateFolder && (
        <button
          className="ftree-new"
          onClick={() => onCreateFolder(null)}
          title="New top-level folder"
        >
          <span className="ftree-new-icon">＋</span>
          <span>New folder</span>
        </button>
      )}

      <style>{`
        .ftree-nav {
          display: flex;
          flex-direction: column;
          gap: 1px;
          padding: 4px 0;
          user-select: none;
        }
        .ftree-separator {
          height: 1px;
          background: var(--border);
          margin: 4px 8px;
        }
        .ftree-row {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          background: none;
          border: none;
          border-radius: 8px;
          padding: 7px 10px;
          cursor: pointer;
          text-align: left;
          font-size: 14px;
          color: var(--text);
          transition: background .1s;
        }
        .ftree-row:hover { background: var(--surface2); }
        .ftree-selected { background: var(--surface2) !important; font-weight: 600; }
        .ftree-root { font-size: 14px; }
        .ftree-icon { font-size: 16px; flex-shrink: 0; }
        .ftree-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ftree-count {
          font-size: 11px;
          color: var(--text-muted);
          background: var(--surface2);
          border-radius: 10px;
          padding: 1px 6px;
          flex-shrink: 0;
        }
        .ftree-chevron {
          font-size: 10px;
          color: var(--text-muted);
          flex-shrink: 0;
          transition: transform .15s;
        }
        .ftree-chevron.open { transform: rotate(90deg); }
        .ftree-children { overflow: hidden; }
        .ftree-new {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          background: none;
          border: none;
          border-radius: 8px;
          padding: 7px 10px;
          cursor: pointer;
          text-align: left;
          font-size: 13px;
          color: var(--text-muted);
          margin-top: 4px;
          transition: background .1s, color .1s;
        }
        .ftree-new:hover { background: var(--surface2); color: var(--text); }
        .ftree-new-icon { font-size: 16px; line-height: 1; }
      `}</style>
    </nav>
  );
}

// ─── Recursive node ───────────────────────────────────────────────────────────

interface FolderTreeNodeProps {
  node: FolderNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  lectureCounts: Record<string, number>;
  onCreateFolder?: (parentId: string | null) => void;
}

function FolderTreeNode({ node, depth, selectedId, onSelect, lectureCounts, onCreateFolder }: FolderTreeNodeProps) {
  const [open, setOpen] = useState(
    // Auto-expand if selected node is a descendant
    false
  );
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;
  const count = lectureCounts[node.id];
  const indentPx = 12 + depth * 16;
  const accentStyle = node.color ? { borderLeft: `3px solid ${node.color}`, paddingLeft: indentPx - 3 } : {};

  return (
    <>
      <button
        className={`ftree-row ${isSelected ? 'ftree-selected' : ''}`}
        style={{ paddingLeft: indentPx, ...accentStyle }}
        onClick={() => {
          onSelect(node.id);
          if (hasChildren) setOpen(p => !p);
        }}
      >
        {hasChildren ? (
          <span className={`ftree-chevron ${open ? 'open' : ''}`}>▶</span>
        ) : (
          <span style={{ width: 14, flexShrink: 0 }} />
        )}
        <span className="ftree-icon">{node.icon}</span>
        <span className="ftree-label">{node.name}</span>
        {count != null && count > 0 && (
          <span className="ftree-count">{count}</span>
        )}
      </button>

      {hasChildren && open && (
        <div className="ftree-children">
          {node.children.map(child => (
            <FolderTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              lectureCounts={lectureCounts}
              onCreateFolder={onCreateFolder}
            />
          ))}
          {onCreateFolder && (
            <button
              className="ftree-new"
              style={{ paddingLeft: indentPx + 16 }}
              onClick={() => onCreateFolder(node.id)}
            >
              <span className="ftree-new-icon">＋</span>
              <span>New subfolder</span>
            </button>
          )}
        </div>
      )}
    </>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

interface BreadcrumbProps {
  ancestors: Array<{ id: string; name: string; icon: string }>;
  current: { name: string; icon: string } | null; // null = All Lectures
  onNavigate: (folderId: string | null) => void;
}

export function FolderBreadcrumb({ ancestors, current, onNavigate }: BreadcrumbProps) {
  if (!current && ancestors.length === 0) return null;

  return (
    <nav className="fb-nav" aria-label="Folder breadcrumb">
      <button className="fb-crumb fb-root" onClick={() => onNavigate(null)}>
        📚 All Lectures
      </button>
      {ancestors.map(a => (
        <React.Fragment key={a.id}>
          <span className="fb-sep">›</span>
          <button className="fb-crumb" onClick={() => onNavigate(a.id)}>
            {a.icon} {a.name}
          </button>
        </React.Fragment>
      ))}
      {current && (
        <>
          <span className="fb-sep">›</span>
          <span className="fb-crumb fb-current">{current.icon} {current.name}</span>
        </>
      )}

      <style>{`
        .fb-nav {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 2px;
          font-size: 13px;
          color: var(--text-muted);
        }
        .fb-sep { margin: 0 2px; color: var(--text-muted); }
        .fb-crumb {
          background: none;
          border: none;
          padding: 2px 4px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          color: var(--text-muted);
          transition: background .1s, color .1s;
        }
        .fb-crumb:hover { background: var(--surface2); color: var(--text); }
        .fb-current {
          color: var(--text);
          font-weight: 600;
          cursor: default;
        }
        .fb-current:hover { background: none; }
        .fb-root { }
      `}</style>
    </nav>
  );
}
