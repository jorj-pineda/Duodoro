// ─────────────────────────────────────────────────────────────────────────────
// Avatar Data — pixel art definitions for the SVG character renderer
// Character canvas: 16 × 24 "pixels" (SVG units)
// ─────────────────────────────────────────────────────────────────────────────

export type HairStyle = 'bob' | 'mohawk' | 'long' | 'spiky' | 'bald';
export type EyeStyle = 'normal' | 'anime' | 'sleepy';
export type WorldId = 'forest' | 'space' | 'beach' | 'city' | 'mountain' | 'library' | 'cafe' | 'lofi';

export type AvatarConfig = {
  skinColor: string;
  hairStyle: HairStyle;
  hairColor: string;
  eyeStyle: EyeStyle;
  outfitColor: string;
};

// ── Color Palettes ─────────────────────────────────────────────────────────

export const SKIN_COLORS = [
  { label: 'Fair',    hex: '#FDDBB4' },
  { label: 'Light',   hex: '#F3C08C' },
  { label: 'Medium',  hex: '#D4956A' },
  { label: 'Tan',     hex: '#B5714E' },
  { label: 'Deep',    hex: '#7A4B30' },
  { label: 'Rich',    hex: '#4A2518' },
];

export const HAIR_COLORS = [
  { label: 'Brown',   hex: '#5C3317' },
  { label: 'Black',   hex: '#1A1A1A' },
  { label: 'Blonde',  hex: '#D4A836' },
  { label: 'Auburn',  hex: '#8B3A1E' },
  { label: 'Pink',    hex: '#E06C8B' },
  { label: 'Blue',    hex: '#3A78C9' },
];

export const OUTFIT_COLORS = [
  { label: 'Blue',    hex: '#3B5BDB' },
  { label: 'Red',     hex: '#C92A2A' },
  { label: 'Green',   hex: '#2B7A4B' },
  { label: 'Purple',  hex: '#7048C9' },
  { label: 'Orange',  hex: '#D4580A' },
  { label: 'Pink',    hex: '#C9428B' },
];

export const HAIR_STYLE_LABELS: Record<HairStyle, string> = {
  bob:    'Bob',
  mohawk: 'Mohawk',
  long:   'Long',
  spiky:  'Spiky',
  bald:   'Bald',
};

export const EYE_STYLE_LABELS: Record<EyeStyle, string> = {
  normal:  'Normal',
  anime:   'Anime',
  sleepy:  'Sleepy',
};

export const HAIR_STYLES: HairStyle[] = ['bob', 'mohawk', 'long', 'spiky', 'bald'];
export const EYE_STYLES: EyeStyle[] = ['normal', 'anime', 'sleepy'];

export const DEFAULT_AVATAR: AvatarConfig = {
  skinColor:   '#FDDBB4',
  hairStyle:   'bob',
  hairColor:   '#5C3317',
  eyeStyle:    'normal',
  outfitColor: '#3B5BDB',
};

// ── World Configs ──────────────────────────────────────────────────────────

export type WorldConfig = {
  id: WorldId;
  label: string;
  emoji: string;
  skyGradient: string;
  groundColor: string;
  groundPatternColor: string;
};

export const WORLDS: WorldConfig[] = [
  {
    id: 'forest',
    label: 'Forest',
    emoji: '🌲',
    skyGradient: 'linear-gradient(180deg, #7EC8E3 0%, #AEE5D8 100%)',
    groundColor: '#4a7c59',
    groundPatternColor: '#3d6849',
  },
  {
    id: 'space',
    label: 'Space',
    emoji: '🚀',
    skyGradient: 'linear-gradient(180deg, #04001A 0%, #130840 100%)',
    groundColor: '#1e0f4a',
    groundPatternColor: '#2a1660',
  },
  {
    id: 'beach',
    label: 'Beach',
    emoji: '🏖️',
    skyGradient: 'linear-gradient(180deg, #FF8C42 0%, #FFD166 100%)',
    groundColor: '#C9A84C',
    groundPatternColor: '#B89238',
  },
  {
    id: 'city',
    label: 'City',
    emoji: '🏙️',
    skyGradient: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
    groundColor: '#3a3a4a',
    groundPatternColor: '#2d2d3d',
  },
  {
    id: 'mountain',
    label: 'Mountain',
    emoji: '🏔️',
    skyGradient: 'linear-gradient(180deg, #87CEEB 0%, #E0F0FF 100%)',
    groundColor: '#6b8e5e',
    groundPatternColor: '#5a7d4d',
  },
  {
    id: 'library',
    label: 'Library',
    emoji: '📚',
    skyGradient: 'linear-gradient(180deg, #3e2723 0%, #5d4037 100%)',
    groundColor: '#6d4c41',
    groundPatternColor: '#5d3f35',
  },
  {
    id: 'cafe',
    label: 'Café',
    emoji: '☕',
    skyGradient: 'linear-gradient(180deg, #f5e6d3 0%, #e8d5b7 100%)',
    groundColor: '#8d6e63',
    groundPatternColor: '#795548',
  },
  {
    id: 'lofi',
    label: 'Lo-fi',
    emoji: '🎧',
    skyGradient: 'linear-gradient(180deg, #2d1b69 0%, #1a0a3e 60%, #11063a 100%)',
    groundColor: '#1a1040',
    groundPatternColor: '#231550',
  },
];

export function getWorld(id: WorldId): WorldConfig {
  return WORLDS.find((w) => w.id === id) ?? WORLDS[0];
}
