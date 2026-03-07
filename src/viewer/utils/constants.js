export const CLUSTER_PALETTE = [
  '#7c6af7',
  '#3ecfcf',
  '#f77c6a',
  '#6af7a0',
  '#f7c76a',
  '#f76ac8',
  '#6aaff7',
  '#c8f76a',
  '#f7a06a',
  '#a0a0ff',
  '#ff6b9d',
  '#00d4aa',
  '#ffb347',
];

export const EXT_COLOR = {
  '.ts': '#4ecdc4',
  '.tsx': '#3ecfcf',
  '.js': '#f5c518',
  '.jsx': '#f5a018',
  '.css': '#a78bfa',
  '.html': '#fb923c',
  '.json': '#34d399',
  '.toml': '#f472b6',
  '.md': '#94a3b8',
  '.yml': '#60a5fa',
  '': '#64748b',
};

export const extColor = (ext) => EXT_COLOR[ext] || '#64748b';

export const ROLE_COLOR = {
  entry_layer:    '#4ade80',
  orchestrator:   '#7c6af7',
  core_utilities: '#f97316',
  api_layer:      '#3ecfcf',
  internal:       '#475569',
};

export const ROLE_LABEL = {
  entry_layer:    'entry layer',
  orchestrator:   'orchestrator',
  core_utilities: 'core utilities',
  api_layer:      'API layer',
  internal:       'internal',
};
