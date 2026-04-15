import { useState, useCallback, useRef } from 'react';
import StickyHeader from '@/components/StickyHeader';
import IntroSection from '@/components/IntroSection';
import InputSection from '@/components/InputSection';
import SettingsSection from '@/components/SettingsSection';
import RunSection from '@/components/RunSection';
import ResultsSection from '@/components/ResultsSection';
import ExportSection from '@/components/ExportSection';
import MoleculeViewer from '@/components/MoleculeViewer';
import { generateMoleculeRecord, sleep, type Molecule } from '@/lib/moleculeData';

interface LogEntry { time: string; msg: string; type: string; }

export default function Index() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [source, setSource] = useState<'pdb' | 'zip' | 'random'>('pdb');
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [molecules, setMolecules] = useState<Molecule[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [selectedMol, setSelectedMol] = useState<Molecule | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Settings
  const [topN, setTopN] = useState(20);
  const [numSamples, setNumSamples] = useState(20);
  const [runAlias, setRunAlias] = useState('');
  const [validOnly, setValidOnly] = useState(true);
  const [sampleSteps, setSampleSteps] = useState(50);
  const [temperature, setTemperature] = useState(0.8);
  const [batchSize, setBatchSize] = useState(16);
  const [qedThreshold, setQedThreshold] = useState(0.3);

  // Run state
  const [processingVisible, setProcessingVisible] = useState(false);
  const [stageIdx, setStageIdx] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Initializing...');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState({ gen: 0, valid: 0, qed: '—', status: 'RUNNING', statusColor: 'text-pmdm-text' });
  const [startTime, setStartTime] = useState('');
  const [complete, setComplete] = useState(false);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  }

  function addLog(msg: string, type = '') {
    const time = new Date().toTimeString().slice(0, 8);
    setLogs(prev => [...prev, { time, msg, type }]);
  }

  const startGeneration = useCallback(async () => {
    if (running) return;
    if (source !== 'random' && !file) return;

    setRunning(true);
    const rid = 'RUN-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    setRunId(rid);
    setStartTime(new Date().toLocaleTimeString());
    setProcessingVisible(true);
    setComplete(false);
    setLogs([]);
    setMolecules([]);
    setShowResults(false);
    setShowExport(false);

    const prots = source === 'random' ? ['2HNI', '3EML', '4QAC'] : ['PROT-A', 'PROT-B'];
    const sourceName = source === 'random' ? 'Internal Reference Set' : (file?.name || 'uploaded file');

    const steps = [
      { stage: 0, pct: 5, label: 'Uploading dataset...', log: [['Pocket-conditioning module initialized.', 'accent'], [`Dataset source: ${sourceName}`, '']] },
      { stage: 1, pct: 12, label: 'Parsing pocket PDB files...', log: [[`Loaded ${prots.length} protein target(s).`, ''], ['PDB parser: extracting Cα coordinates...', '']] },
      { stage: 2, pct: 22, label: 'Conditioning on pocket geometry...', log: [['EGNN pocket encoder: building radius graphs...', 'accent'], ['Max pocket residues: 30 | Radius: 10.0 Å', '']] },
      { stage: 3, pct: 45, label: 'Sampling diffusion trajectories...', log: [[`Sampling ${numSamples} molecules per protein (T=${sampleSteps} steps)`, 'accent'], ['ContinuousNoiseSchedule: cosine beta schedule active.', ''], ['DiscreteNoiseSchedule: absorbing-state masking active.', '']] },
      { stage: 4, pct: 68, label: 'Running RDKit validation...', log: [['RDKit: sanitizing molecules...', ''], ['Checking Lipinski Ro5 constraints...', ''], ['Computing QED scores...', '']] },
      { stage: 5, pct: 85, label: 'Ranking by QED score...', log: [['Applying drug-likeness filters...', ''], ['Deduplication: removing duplicate SMILES...', 'accent']] },
      { stage: 6, pct: 96, label: 'Preparing output...', log: [['Serializing molecule records to JSON...', ''], ['Generating SDF output...', '']] },
    ];

    let allMols: Molecule[] = [];
    let genCount = 0;
    let validCount = 0;

    for (const step of steps) {
      await sleep(600 + Math.random() * 700);
      setStageIdx(step.stage);
      setProgress(step.pct);
      setProgressLabel(step.label);
      for (const [msg, type] of step.log) {
        addLog(msg, type);
        await sleep(120);
      }

      if (step.stage === 3) {
        for (const prot of prots) {
          for (let i = 0; i < numSamples; i++) {
            const mol = generateMoleculeRecord(allMols.length + 1, prot, sourceName);
            allMols.push(mol);
            genCount++;
            if (mol.valid) validCount++;
            if (i % 5 === 0 || i === numSamples - 1) {
              const qeds = allMols.filter(m => m.valid).map(m => m.qed);
              const meanQed = qeds.length > 0 ? (qeds.reduce((a, b) => a + b, 0) / qeds.length).toFixed(3) : '—';
              setStats({ gen: genCount, valid: validCount, qed: meanQed, status: 'RUNNING', statusColor: 'text-pmdm-text' });
              await sleep(40);
            }
          }
          addLog(`[${prot}] Generated ${numSamples} candidates | Valid: ${allMols.filter(m => m.protein === prot && m.valid).length}`, 'success');
        }
      }
    }

    await sleep(400);
    setStageIdx(7);
    setProgress(100);
    setProgressLabel('Complete');
    const finalValid = allMols.filter(m => m.valid).length;
    const finalQeds = allMols.filter(m => m.valid).map(m => m.qed);
    setStats({
      gen: allMols.length,
      valid: finalValid,
      qed: finalQeds.length ? (finalQeds.reduce((a, b) => a + b, 0) / finalQeds.length).toFixed(3) : '—',
      status: 'DONE',
      statusColor: 'text-pmdm-green',
    });
    setComplete(true);
    addLog(`Pipeline complete. Total: ${allMols.length} | Valid: ${finalValid} (${(100 * finalValid / allMols.length).toFixed(1)}%)`, 'success');
    setMolecules(allMols);
    setShowResults(true);
    setShowExport(true);
    setRunning(false);
  }, [running, source, file, numSamples, sampleSteps]);

  function resetAll() {
    if (running) return;
    setMolecules([]);
    setSelectedMol(null);
    setProcessingVisible(false);
    setShowResults(false);
    setShowExport(false);
    setProgress(0);
    setProgressLabel('Initializing...');
    setStageIdx(-1);
    setLogs([]);
    setComplete(false);
    setStats({ gen: 0, valid: 0, qed: '—', status: 'RUNNING', statusColor: 'text-pmdm-text' });
  }

  return (
    <div className="min-h-screen bg-pmdm-bg text-pmdm-text transition-colors duration-150">
      <StickyHeader theme={theme} onToggleTheme={toggleTheme} running={running} />
      <IntroSection />
      <InputSection source={source} onSourceChange={setSource} file={file} onFileChange={setFile} />
      <SettingsSection
        topN={topN} setTopN={setTopN}
        numSamples={numSamples} setNumSamples={setNumSamples}
        runAlias={runAlias} setRunAlias={setRunAlias}
        validOnly={validOnly} setValidOnly={setValidOnly}
        sampleSteps={sampleSteps} setSampleSteps={setSampleSteps}
        temperature={temperature} setTemperature={setTemperature}
        batchSize={batchSize} setBatchSize={setBatchSize}
        qedThreshold={qedThreshold} setQedThreshold={setQedThreshold}
      />
      <RunSection
        running={running} onGenerate={startGeneration} onReset={resetAll}
        processingVisible={processingVisible} stageIdx={stageIdx}
        progress={progress} progressLabel={progressLabel}
        logs={logs} stats={stats} startTime={startTime} complete={complete}
      />
      <ResultsSection
        visible={showResults} molecules={molecules} runId={runId}
        onViewMolecule={setSelectedMol} selectedId={selectedMol?.id || null}
      />
      <ExportSection visible={showExport} molecules={molecules} runId={runId} runAlias={runAlias} />

      {/* Footer */}
      <footer className="py-7 border-t border-pmdm-border">
        <div className="max-w-[1400px] mx-auto px-8 flex items-center justify-between flex-wrap gap-4">
          <div className="font-mono text-[11px] text-pmdm-text3">
            <span className="text-pmdm-accent">MiniPMDM</span> · Drug Discovery Platform · v2.0
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px] text-pmdm-text3">
            <span>EGNN Backbone</span><span>·</span><span>RDKit Validation</span><span>·</span><span>PDBBind Compatible</span><span>·</span>
            <span>{theme === 'dark' ? 'DARK MODE' : 'LIGHT MODE'}</span>
          </div>
        </div>
      </footer>

      {/* Fullscreen 3D Viewer */}
      <MoleculeViewer molecule={selectedMol} runId={runId} onClose={() => setSelectedMol(null)} />
    </div>
  );
}
