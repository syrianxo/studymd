// Single source of truth for theme identifiers, display metadata, and migration.
// All runtime code imports ThemeId / THEMES / migrateThemeId from here.

export const THEME_IDS = ['midnight', 'aurora', 'forest'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemeDef {
  id: ThemeId;
  label: string;
  swatch: string;
  glow: string;
}

export const THEMES: ThemeDef[] = [
  { id: 'midnight', label: 'Midnight', swatch: '#5b8dee', glow: '#5b8dee44' },
  { id: 'aurora',   label: 'Aurora',   swatch: '#f472b6', glow: '#f472b644' },
  { id: 'forest',   label: 'Forest',   swatch: '#10b981', glow: '#10b98144' },
];

export function isValidThemeId(value: unknown): value is ThemeId {
  return THEME_IDS.includes(value as ThemeId);
}

// Migrate legacy theme ids stored before the aurora rename (2026-04-19).
const LEGACY_THEME_ID_MAP: Record<string, ThemeId> = {
  pink: 'aurora',
};

export function migrateThemeId(raw: string): ThemeId | null {
  if (isValidThemeId(raw)) return raw;
  return LEGACY_THEME_ID_MAP[raw] ?? null;
}
