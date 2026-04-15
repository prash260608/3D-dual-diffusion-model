export interface Molecule {
  id: string;
  protein: string;
  valid: boolean;
  qed: number;
  lipinski: boolean;
  mw: number;
  logp: number;
  hbd: number;
  hba: number;
  numAtoms: number;
  atoms: string[];
  coords: number[][];
  rotBonds: number;
  tpsa: number;
  fsp3: number;
  source: string;
}

export interface AppState {
  theme: 'light' | 'dark';
  source: 'upload' | 'default';
  file: File | null;
  running: boolean;
  runId: string | null;
  startTime: Date | null;
  molecules: Molecule[];
  filteredMolecules: Molecule[];
  currentPage: number;
  pageSize: number;
  sortField: string;
  sortDir: 'asc' | 'desc';
  selectedMolecule: Molecule | null;
}

const ATOM_TYPES = ['H', 'C', 'N', 'O', 'F', 'P', 'S', 'Cl', 'Br', 'I'];
const PROTEIN_IDS = ['2HNI', '3EML', '4QAC', '1LPG', '5TYK'];

function randGaussian(mean: number, std: number): number {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function generateMoleculeRecord(idx: number, proteinId: string, source: string): Molecule {
  const valid = Math.random() > 0.28;
  const mw = Math.max(100, randGaussian(320, 80));
  const logp = randGaussian(2.2, 1.4);
  const hbd = Math.max(0, Math.round(randGaussian(2.1, 1.2)));
  const hba = Math.max(0, Math.round(randGaussian(5.0, 2.0)));
  const qed = valid ? Math.min(1, Math.max(0.05, randGaussian(0.55, 0.18))) : Math.min(0.35, Math.max(0.01, randGaussian(0.18, 0.1)));
  const lipinskiPass = mw <= 500 && logp <= 5 && hbd <= 5 && hba <= 10;
  const numAtoms = Math.round(randGaussian(22, 6));
  const atoms = Array.from({ length: Math.max(5, numAtoms) }, () =>
    ATOM_TYPES[Math.floor(Math.random() * 6)]);
  const coords = atoms.map(() => [
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 10,
  ]);
  return {
    id: `CAND-${String(idx).padStart(4, '0')}`,
    protein: proteinId,
    valid,
    qed: parseFloat(qed.toFixed(4)),
    lipinski: lipinskiPass,
    mw: parseFloat(mw.toFixed(2)),
    logp: parseFloat(logp.toFixed(3)),
    hbd,
    hba,
    numAtoms: atoms.length,
    atoms,
    coords,
    rotBonds: Math.max(0, Math.round(randGaussian(4, 2))),
    tpsa: Math.max(0, randGaussian(85, 30)),
    fsp3: Math.min(1, Math.max(0, randGaussian(0.35, 0.18))),
    source,
  };
}

export const STAGES = [
  { id: 'upload', label: 'Uploading' },
  { id: 'parse', label: 'Parsing' },
  { id: 'pocket', label: 'Conditioning' },
  { id: 'sample', label: 'Sampling' },
  { id: 'validate', label: 'Validating' },
  { id: 'rank', label: 'Ranking' },
  { id: 'prepare', label: 'Preparing' },
];

export function getAtomComposition(atoms: string[]): [string, number][] {
  const counts: Record<string, number> = {};
  atoms.forEach(a => counts[a] = (counts[a] || 0) + 1);
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

export function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export const SETTING_TOOLTIPS: Record<string, string> = {
  'Top Validated Molecules to Preview': 'Subset of high-ranking results selected for visual preview in the results table.',
  'Samples per Protein': 'Total number of candidate molecules to generate for each protein target pocket.',
  'Sample Steps': 'Diffusion refinement cycles. Higher values = more structural stability but slower generation.',
  'Temperature': 'Diversity control parameter. Low = stable, conservative structures; High = experimental, diverse outputs.',
  'Batch Size': 'Number of molecules processed simultaneously. Higher = faster but more GPU memory.',
  'Target QED Threshold': 'Minimum drug-likeness score (0–1) for filtering. QED combines multiple desirability functions.',
  'Guidance Scale': 'Strength of protein-pocket geometric conditioning. Higher = more pocket-specific molecules.',
};
