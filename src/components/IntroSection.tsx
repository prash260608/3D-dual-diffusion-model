export default function IntroSection() {
  return (
    <section className="py-16 border-b border-pmdm-border relative overflow-hidden" id="intro">
      <div className="absolute -top-20 -right-[200px] w-[600px] h-[600px] bg-[radial-gradient(circle,hsl(var(--accent-dim))_0%,transparent_70%)] pointer-events-none" />
      <div className="max-w-[1400px] mx-auto px-8 relative">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-pmdm-accent-border bg-pmdm-accent-dim font-mono text-[10px] font-semibold text-pmdm-accent tracking-[0.1em] uppercase mb-5">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="4" /></svg>
          Drug Discovery Platform · v2.0
        </div>
        <h1 className="text-4xl font-bold leading-tight mb-4 max-w-[640px] text-pmdm-text">
          Protein-Conditioned<br />
          <em className="not-italic text-pmdm-accent">3D Molecule Generation</em>
        </h1>
        <p className="text-[15px] text-pmdm-text2 max-w-[520px] mb-7 leading-relaxed">
          Accelerated molecular generation via dual diffusion modeling. Jointly samples
          3D coordinates, atom types, and bond types conditioned on protein pocket geometry.
          Optimized for lead-like molecule discovery using PDBBind-style data.
        </p>
        <div className="flex items-center gap-5 flex-wrap">
          {['EGNN-BASED BACKBONE', 'RDKIT VALIDATION', 'DESKTOP OPTIMIZED'].map(tag => (
            <div key={tag} className="flex items-center gap-1.5 font-mono text-[11px] text-pmdm-text3">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="text-pmdm-accent">
                <path d="M8 1a.5.5 0 01.5.5v1a.5.5 0 01-1 0V1.5A.5.5 0 018 1zm0 5a2 2 0 100 4 2 2 0 000-4zM4.5 8a3.5 3.5 0 117 0 3.5 3.5 0 01-7 0z" />
              </svg>
              {tag}
            </div>
          ))}
          <a href="#input" className="inline-flex items-center gap-2 px-4 py-2 border border-pmdm-border text-pmdm-text2 font-mono text-[11px] font-medium tracking-[0.06em] uppercase hover:border-pmdm-accent-border hover:text-pmdm-accent hover:bg-pmdm-accent-dim transition-all duration-150">
            Start Workflow
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.5.5 0 01.5.5v5.793l2.146-2.147a.5.5 0 01.708.708l-3 3a.5.5 0 01-.708 0l-3-3a.5.5 0 11.708-.708L7.5 10.293V4.5A.5.5 0 018 4z" /></svg>
          </a>
        </div>
      </div>
    </section>
  );
}
