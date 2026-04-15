import type { Molecule } from '@/lib/moleculeData';
import { downloadBlob } from '@/lib/moleculeData';

interface Props {
  visible: boolean;
  molecules: Molecule[];
  runId: string | null;
  runAlias: string;
}

export default function ExportSection({ visible, molecules, runId, runAlias }: Props) {
  if (!visible) return null;

  const valid = molecules.filter(m => m.valid).length;

  function downloadDataset(type: 'valid' | 'all') {
    const mols = type === 'valid' ? molecules.filter(m => m.valid) : molecules;
    const alias = runAlias || runId || 'export';

    // JSON
    const jsonData = mols.map(m => ({
      id: m.id, protein: m.protein, valid: m.valid, qed: m.qed,
      lipinski: m.lipinski, mw: m.mw, logp: m.logp, hbd: m.hbd,
      hba: m.hba, rotBonds: m.rotBonds, tpsa: m.tpsa, fsp3: m.fsp3,
      numAtoms: m.numAtoms, source: m.source, run_id: runId, model: 'MINI-PMDM-V1',
    }));
    downloadBlob(JSON.stringify({ run_id: runId, model: 'MINI-PMDM-V1', generated_at: new Date().toISOString(), total: mols.length, molecules: jsonData }, null, 2), `${alias}_${type}_molecules.json`, 'application/json');

    // SDF
    setTimeout(() => {
      const sdfContent = mols.map(m =>
        `CANDIDATE ${m.id}\nProtein: ${m.protein}\nQED: ${m.qed}\nMW: ${m.mw}\nLogP: ${m.logp}\nHBD: ${m.hbd}\nHBA: ${m.hba}\nValid: ${m.valid}\nLipinski: ${m.lipinski}\n\n$$$$`
      ).join('\n');
      downloadBlob(sdfContent, `${alias}_${type}_molecules.sdf`, 'text/plain');
    }, 300);
  }

  return (
    <section className="py-16 border-b border-pmdm-border" id="export">
      <div className="max-w-[1400px] mx-auto px-8">
        <div className="font-mono text-[10px] font-semibold tracking-[0.12em] uppercase text-pmdm-accent mb-1.5">05 / Export & Archive</div>
        <div className="text-xl font-semibold text-pmdm-text mb-1">Download Dataset</div>
        <p className="text-[13px] text-pmdm-text2 mb-8">Export as JSON and SDF formats. Metadata is shown below for verification.</p>

        <div className="max-w-[620px] border border-pmdm-border bg-pmdm-bg2 overflow-hidden">
          <div className="grid grid-cols-4 border-b border-pmdm-border">
            {[
              { label: 'Valid Molecules', value: String(valid), accent: true },
              { label: 'Total Generated', value: String(molecules.length) },
              { label: 'Run ID', value: runId || '—' },
              { label: 'Timestamp', value: new Date().toISOString().slice(0, 19).replace('T', ' ') },
            ].map(item => (
              <div key={item.label} className="px-4 py-3.5 border-r border-pmdm-border last:border-r-0">
                <div className="font-mono text-[9px] font-semibold tracking-[0.1em] uppercase text-pmdm-text3 mb-1.5">{item.label}</div>
                <div className={`font-mono text-[13px] font-semibold ${item.accent ? 'text-pmdm-accent' : 'text-pmdm-text'}`}>{item.value}</div>
              </div>
            ))}
          </div>

          <button
            onClick={() => downloadDataset('valid')}
            className="flex items-center justify-between w-full px-6 py-4 bg-pmdm-accent border-none text-pmdm-bg font-mono text-[13px] font-bold tracking-[0.06em] uppercase cursor-pointer hover:bg-transparent hover:text-pmdm-accent border-b border-pmdm-border transition-all duration-150"
          >
            <span>↓ Download Valid Molecules (JSON + SDF)</span>
            <span className="text-[11px] opacity-70">{valid} molecules</span>
          </button>
          <button
            onClick={() => downloadDataset('all')}
            className="flex items-center justify-between w-full px-6 py-3 bg-transparent text-pmdm-text2 font-mono text-xs font-medium tracking-[0.06em] uppercase cursor-pointer hover:text-pmdm-accent hover:bg-pmdm-accent-dim transition-all duration-150"
          >
            <span>↓ Download All Molecules (JSON + SDF)</span>
            <span className="text-[11px] opacity-70">{molecules.length} molecules</span>
          </button>
        </div>
      </div>
    </section>
  );
}
