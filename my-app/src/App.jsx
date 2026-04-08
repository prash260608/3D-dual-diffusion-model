import { useState, useEffect, useRef, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { EffectComposer, SSAO } from "@react-three/postprocessing";
function Atom({ position, symbol }) {
  const colorMap = {
    C: "#404040",
    H: "#FFFFFF",
    N: "#3050F8",
    O: "#FF0D0D",
    S: "#FFFF30",
    P: "#FF8000",
    F: "#9be37a",
    Cl: "#1FF01F",
    Br: "#A62929",
    I: "#b36ad6",
  };
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);
  const radius = symbol === "H" ? 0.55 : 0.85;
  useFrame(() => {
    if (meshRef.current) {
      const scale = hovered ? 1.15 : 1;
      meshRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.1);
    }
  });
  return (
    <group position={position}>
      <mesh ref={meshRef} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        <sphereGeometry args={[radius, 48, 48]} />
        <meshStandardMaterial
          color={colorMap[symbol] || "#888"}
          roughness={0.25}
          metalness={0.15}
          emissive={hovered? colorMap[symbol] : "#000000"}
          emissiveIntensity={hovered? 0.25 : 0}
        />
      </mesh>

      {/* 🔥 LABEL */}
      {symbol !== "H" && (
        <Html center distanceFactor={12}>
          <div style={{
            color: "white",
            fontSize: "14px",
            fontWeight: "bold",
            textShadow: "0 0 6px black"
          }}>
            {symbol}
          </div>
        </Html>
      )}
    </group>
  );
}
function Bond({ start, end }) {
  const startVec = new THREE.Vector3(...start);
  const endVec = new THREE.Vector3(...end);
  const dir = new THREE.Vector3().subVectors(endVec, startVec);
  const atomRadius = 0.75;
  const direction = new THREE.Vector3().subVectors(endVec, startVec).normalize();
  const newStart = startVec.clone().add(direction.clone().multiplyScalar(atomRadius));
  const newEnd = endVec.clone().add(direction.clone().multiplyScalar(-atomRadius));
  const newDir = new THREE.Vector3().subVectors(newEnd, newStart);
  const length = newDir.length()*0.75;
  const mid = new THREE.Vector3().addVectors(newStart, newEnd).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

  return (
    <mesh position={mid} quaternion={quaternion}>
      <cylinderGeometry args={[0.03, 0.03, length, 16]} />
      <meshStandardMaterial color="#d0d7e2" roughness={0.4} metalness={0.1} />
    </mesh>
  );
}

function MoleculeScene({ mol, showH }) {
  if (!mol) return null;
  const atoms = mol.symbols.map((s, i) => ({
    symbol: s,
    position: mol.coords[i],
    index: i,
  }));

  const visibleAtoms = showH ? atoms : atoms.filter(a => a.symbol !== "H");
  const visibleSet = new Set(visibleAtoms.map(a => a.index));

  return (
    <group scale={0.6}>
      {/* 🔥 lighting (THIS gives the “cool website look”) */}
      <Environment preset="studio" />
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 6, 6]} intensity={1.2} />
      <directionalLight position={[-6, -6, -6]} intensity={0.3} />

      {/* 💎 environment reflections */}

      {/* bonds */}
      {mol.bonds.map(([a, b], i) => {
        if (!visibleSet.has(a) || !visibleSet.has(b)) return null;
        return <Bond key={i} start={mol.coords[a]} end={mol.coords[b]} />;
      })}

      {/* atoms */}
      {visibleAtoms.map((atom) => (
        <Atom key={atom.index} {...atom} />
      ))}

      <OrbitControls />
    </group>
  );
}

export function Mol3D({ mol, showH }) {
  return (
    <Canvas camera={{ position: [0, 0, 8], fov: 50 }}>
      <MoleculeScene mol={mol} showH={showH} />
      <EffectComposer>
        <SSAO
          samples={12}
          radius={0.01}
          intensity={3}
          luminanceInfluence={0.5}
        />
      </EffectComposer>
    </Canvas>
  );
}
const fl = document.createElement("link");
fl.rel = "stylesheet";
fl.href = "https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap";
document.head.appendChild(fl);

const css = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0c10;
  --sidebar:#0f1218;
  --surface:#161b24;
  --surface2:#1c2330;
  --border:rgba(255,255,255,0.07);
  --border2:rgba(255,255,255,0.12);
  --accent:#4d9fff;
  --accent2:#3d8fff;
  --green:#4caf82;
  --red:#e05c5c;
  --yellow:#e0b84d;
  --text:#e8edf5;
  --text2:#8a9ab5;
  --text3:#4a5568;
  --mono:'Space Mono',monospace;
  --sans:'DM Sans',sans-serif;
  --r:6px;
}
html,body{height:100%;background:var(--bg);overflow:hidden}
body{font-family:var(--sans);color:var(--text)}

.app{display:flex;height:100vh;overflow:hidden}

/* ── sidebars ── */
.sidebar{
  width:252px;flex-shrink:0;
  background:var(--sidebar);
  border-right:1px solid var(--border);
  display:flex;flex-direction:column;
  overflow-y:auto;overflow-x:hidden;
}
.sidebar::-webkit-scrollbar{width:3px}
.sidebar::-webkit-scrollbar-thumb{background:var(--surface2);border-radius:2px}
.sidebar.right{border-right:none;border-left:1px solid var(--border)}

/* ── sidebar header ── */
.sb-head{padding:16px 18px 14px;border-bottom:1px solid var(--border)}
.sb-logo{display:flex;align-items:center;gap:8px;margin-bottom:2px}
.sb-logo-icon{width:20px;height:20px;border-radius:5px;background:linear-gradient(135deg,var(--accent),#7b6fff);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sb-logo-icon svg{display:block}
.sb-logo h2{font-family:var(--mono);font-size:13px;font-weight:700;letter-spacing:.04em}
.sb-logo h2 span{color:var(--accent)}
.sb-subtitle{font-size:9.5px;color:var(--text3);letter-spacing:.12em;text-transform:uppercase;margin-left:28px}

/* ── sections ── */
.sb-section{padding:14px 16px;border-bottom:1px solid var(--border)}
.sb-label{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--text3);margin-bottom:9px;font-family:var(--mono)}

/* ── smiles input ── */
.smiles-inp{
  width:100%;background:var(--surface);border:1px solid var(--border2);border-radius:var(--r);
  padding:9px 11px;font-family:var(--mono);font-size:10px;color:var(--text);
  outline:none;resize:none;height:60px;transition:border-color .18s;line-height:1.5
}
.smiles-inp:focus{border-color:rgba(77,159,255,.45)}
.smiles-inp::placeholder{color:var(--text3)}

.btn-main{
  width:100%;margin-top:9px;padding:9px;
  background:var(--accent);border:none;border-radius:var(--r);
  color:#fff;font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  cursor:pointer;transition:all .18s
}
.btn-main:hover{background:var(--accent2);transform:translateY(-1px);box-shadow:0 4px 14px rgba(77,159,255,.3)}
.btn-main:active{transform:translateY(0)}
.btn-main:disabled{opacity:.38;cursor:not-allowed;transform:none;box-shadow:none}
.btn-main.busy{background:var(--yellow);color:#000}

/* ── quick examples ── */
.examples-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.ex-btn{
  padding:6px 8px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);
  color:var(--text2);font-family:var(--sans);font-size:10px;cursor:pointer;text-align:center;transition:all .13s
}
.ex-btn:hover{border-color:var(--accent);color:var(--accent);background:rgba(77,159,255,.05)}

/* ── toggles ── */
.toggle-row{display:flex;align-items:center;justify-content:space-between;padding:5px 0}
.toggle-label{font-size:11px;color:var(--text2)}
.toggle{position:relative;width:34px;height:19px;flex-shrink:0}
.toggle input{opacity:0;width:0;height:0;position:absolute}
.toggle-track{
  position:absolute;inset:0;border-radius:20px;
  background:var(--surface2);border:1px solid var(--border2);
  transition:all .2s;cursor:pointer
}
.toggle input:checked+.toggle-track{background:var(--accent);border-color:var(--accent)}
.toggle-thumb{
  position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;
  background:#fff;transition:transform .2s;pointer-events:none
}
.toggle input:checked~.toggle-thumb{transform:translateX(15px)}

/* ── molecule info ── */
.mol-info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px}
.mol-stat{
  background:var(--surface);border:1px solid var(--border);border-radius:var(--r);
  padding:8px 7px;text-align:center
}
.mol-stat .val{font-family:var(--mono);font-size:13px;font-weight:700;color:var(--accent);line-height:1}
.mol-stat .key{font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-top:4px}
.mol-formula{
  background:var(--surface);border:1px solid var(--border);border-radius:var(--r);
  padding:7px 10px;display:flex;align-items:center;justify-content:space-between;margin-bottom:6px
}
.mol-formula .formula{font-family:var(--mono);font-size:12px;color:var(--accent);font-weight:700}
.mol-formula .sub{font-size:9px;color:var(--text3)}

/* ── legend ── */
.legend-list{display:flex;flex-direction:column;gap:4px}
.leg-item{display:flex;align-items:center;gap:8px}
.leg-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.leg-name{font-size:11px;color:var(--text2);font-family:var(--mono)}
.leg-count{font-size:10px;color:var(--text3);margin-left:auto;font-family:var(--mono)}

/* ── params (output sidebar) ── */
.param-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.param-row label{font-size:10px;color:var(--text2);min-width:40px}
.param-row input[type=range]{flex:1;accent-color:var(--accent);cursor:pointer}
.param-row .pval{font-family:var(--mono);font-size:10px;color:var(--accent);min-width:28px;text-align:right}

/* ── metrics ── */
.metrics-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.metric{
  background:var(--surface);border:1px solid var(--border);border-radius:var(--r);
  padding:7px 9px
}
.metric .mk{font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:3px}
.metric .mv{font-family:var(--mono);font-size:12px;font-weight:700}
.mv.g{color:var(--green)}.mv.w{color:var(--yellow)}.mv.r{color:var(--red)}
.smiles-out{
  background:var(--surface);border:1px solid var(--border);border-radius:var(--r);
  padding:8px 10px;margin-top:6px;word-break:break-all;
  font-family:var(--mono);font-size:9px;color:var(--green);line-height:1.6
}

/* ── api row ── */
.api-wrap{display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border2);border-radius:var(--r);padding:6px 10px}
.api-wrap input{flex:1;background:transparent;border:none;outline:none;font-family:var(--mono);font-size:9px;color:var(--text);min-width:0}
.api-wrap input::placeholder{color:var(--text3)}
.adot{width:7px;height:7px;border-radius:50%;flex-shrink:0;animation:pulse 2s ease-in-out infinite}
.adot.ok{background:var(--green);box-shadow:0 0 6px var(--green)}
.adot.bad{background:var(--red);box-shadow:0 0 6px var(--red)}
.adot.unk{background:var(--yellow);box-shadow:0 0 6px var(--yellow)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}

/* ── canvas area ── */
.canvas-area{flex:1;position:relative;background:var(--bg);overflow:hidden;display:flex;flex-direction:column}
.canvas-split{display:flex;flex:1;overflow:hidden}
.canvas-half{flex:1;position:relative;overflow:hidden;border-right:1px solid var(--border)}
.canvas-half:last-child{border-right:none}
.canvas-half-label{
  position:absolute;top:14px;left:14px;z-index:5;
  font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:var(--text3);
  background:rgba(10,12,16,.7);border:1px solid var(--border);border-radius:20px;padding:3px 10px;
  font-family:var(--mono);backdrop-filter:blur(4px)
}

.cvwrap{position:absolute;inset:0}
canvas{width:100%!important;height:100%!important;display:block;cursor:grab}
canvas:active{cursor:grabbing}

.cv-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;pointer-events:none}
.cv-empty-icon{opacity:.08}
.cv-empty-t{font-size:11px;color:var(--text3);letter-spacing:.1em;font-family:var(--mono)}

.scan{position:absolute;left:0;right:0;height:1px;pointer-events:none;background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:.22;animation:scan 2.8s linear infinite}
@keyframes scan{from{top:0}to{top:100%}}

.hint-bar{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);font-size:9px;color:var(--text3);white-space:nowrap;pointer-events:none;font-family:var(--mono);letter-spacing:.06em}

.prog-bar{position:absolute;bottom:0;left:0;right:0;height:2px;background:transparent;overflow:hidden;z-index:10}
.prog-fill{height:100%;background:var(--accent);transition:width .22s;box-shadow:0 0 8px var(--accent)}

.err-bar{padding:7px 10px;background:rgba(224,92,92,.08);border:1px solid rgba(224,92,92,.22);border-radius:var(--r);font-size:9px;color:var(--red);margin-top:7px;line-height:1.5;font-family:var(--mono)}
.hint-box{padding:6px 10px;background:rgba(77,159,255,.06);border:1px solid rgba(77,159,255,.18);border-radius:var(--r);font-size:9px;color:var(--accent);margin-top:7px;line-height:1.5;font-family:var(--mono)}

.copy-btn{background:transparent;border:1px solid var(--border2);border-radius:3px;padding:2px 7px;color:var(--text3);font-family:var(--mono);font-size:8px;cursor:pointer;transition:all .13s;margin-top:5px}
.copy-btn:hover{border-color:var(--accent);color:var(--accent)}

@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
`;
const sel = document.createElement("style");
sel.textContent = css;
document.head.appendChild(sel);

// ── atom colours ──────────────────────────────────────────────────────────────
const ACLR = {
  C:"#1c2130",H:"#c8d4e8",N:"#2a70d4",O:"#cc3333",
  F:"#c039aa",S:"#d4a820",P:"#8855cc",Cl:"#2aaa88",Br:"#aa5522",I:"#6655bb"
};
const ACLR_LIGHT = {
  C:"#363d52",H:"#eaf0fa",N:"#5a96ee",O:"#e86060",
  F:"#e060cc",S:"#eac040",P:"#aa77ee",Cl:"#55ccaa",Br:"#cc7744",I:"#8877dd"
};
const ANAME = {C:"Carbon",H:"Hydrogen",N:"Nitrogen",O:"Oxygen",F:"Fluorine",S:"Sulfur",P:"Phosphorus",Cl:"Chlorine",Br:"Bromine",I:"Iodine"};

// ── SMILES → 3D ──────────────────────────────────────────────────────────────
function smilesTo3D(raw) {
  if (!raw?.trim()) return null;
  const atoms = [];
  const bonds = [];
  const re = /Cl|Br|Si|Se|[BCNOFPSIHK]/g;
  let m;
  const stripped = raw.replace(/\[.*?\]/g, s => {
    const inner = s.replace(/[\[\]@+\-]/g,"").replace(/H\d*/,"");
    return inner || "C";
  });
  while ((m = re.exec(stripped)) !== null) {
    let sym = m[0];
    atoms.push({ sym: sym.charAt(0).toUpperCase()+sym.slice(1).toLowerCase() });
  }
  if (!atoms.length) return null;
  const N = atoms.length;
  for (let i=0;i<N-1;i++) bonds.push([i,i+1]);
  const ringOpen = {};
  for (let ci=0; ci<raw.length; ci++) {
    const c = raw[ci];
    if (c>='1'&&c<='9') {
      const ai = Math.min(Math.floor(ci * N / raw.length), N-1);
      if (ringOpen[c]!==undefined) { bonds.push([ringOpen[c], ai]); delete ringOpen[c]; }
      else ringOpen[c]=ai;
    }
  }
  const pos = atoms.map((_,i) => {
    const a=(i/N)*2*Math.PI, r=1.6+Math.random()*.3;
    return [r*Math.cos(a)+(Math.random()-.5)*.25, r*Math.sin(a)+(Math.random()-.5)*.25, (Math.random()-.5)*1.1];
  });
  for (let it=0;it<100;it++) {
    const f=pos.map(()=>[0,0,0]);
    for (const [a,b] of bonds) {
      const dx=pos[b][0]-pos[a][0],dy=pos[b][1]-pos[a][1],dz=pos[b][2]-pos[a][2];
      const d=Math.sqrt(dx*dx+dy*dy+dz*dz)||.01;
      const k=(d-1.5)*.28/d;
      f[a][0]+=k*dx;f[a][1]+=k*dy;f[a][2]+=k*dz;
      f[b][0]-=k*dx;f[b][1]-=k*dy;f[b][2]-=k*dz;
    }
    for (let i=0;i<N;i++) for (let j=i+1;j<N;j++) {
      const dx=pos[j][0]-pos[i][0],dy=pos[j][1]-pos[i][1],dz=pos[j][2]-pos[i][2];
      const d2=dx*dx+dy*dy+dz*dz||.01,d=Math.sqrt(d2),k=.35/d2/d;
      f[i][0]-=k*dx;f[i][1]-=k*dy;f[i][2]-=k*dz;
      f[j][0]+=k*dx;f[j][1]+=k*dy;f[j][2]+=k*dz;
    }
    for (let i=0;i<N;i++){pos[i][0]+=f[i][0]*.1;pos[i][1]+=f[i][1]*.1;pos[i][2]+=f[i][2]*.1;}
  }
  const cx=pos.reduce((s,p)=>s+p[0],0)/N, cy=pos.reduce((s,p)=>s+p[1],0)/N, cz=pos.reduce((s,p)=>s+p[2],0)/N;
  for (const p of pos){p[0]-=cx;p[1]-=cy;p[2]-=cz;}
  return { coords:pos, symbols:atoms.map(a=>a.sym), bonds };
}

function getMoleculeInfo(mol) {
  if (!mol) return null;
  const symMap = {};
  (mol.symbols||[]).forEach(s => { symMap[s] = (symMap[s]||0)+1; });
  const heavy = mol.symbols?.filter(s => s !== "H").length || 0;
  let formula = Object.entries(symMap).map(([s,c]) => c>1?`${s}${c}`:s).join("");
  return { symMap, heavy, bonds: mol.bonds?.length || 0, formula };
}

// ── 3D Renderer ───────────────────────────────────────────────────────────────


// ── Toggle component ──────────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/>
      <div className="toggle-track"/>
      <div className="toggle-thumb"/>
    </label>
  );
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiHealth(u){const r=await fetch(`${u.replace(/\/$/,"")}/health`,{signal:AbortSignal.timeout(4000)});return r.ok;}
async function apiGen(u,smiles,p){
  const r=await fetch(`${u.replace(/\/$/,"")}/generate_from_smiles`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({smiles,...p})});
  if(!r.ok){const e=await r.json().catch(()=>({detail:r.statusText}));throw new Error(e.detail||`HTTP ${r.status}`);}
  return r.json();
}

const PRESETS=[
  {n:"Water",     s:"O"},
  {n:"Ethanol",   s:"CCO"},
  {n:"Benzene",   s:"c1ccccc1"},
  {n:"Caffeine",  s:"Cn1cnc2c1c(=O)n(C)c(=O)n2C"},
  {n:"Aspirin",   s:"CC(=O)Oc1ccccc1C(=O)O"},
  {n:"Glucose",   s:"OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O"},
  {n:"Penicillin G",s:"CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)Cc3ccccc3)C(=O)O)C"},
  {n:"ATP",       s:"Nc1ncnc2c1ncn2[C@@H]1O[C@H](COP(=O)(O)OP(=O)(O)OP(=O)(O)O)[C@@H](O)[C@H]1O"},
];

// ── Legend Section ────────────────────────────────────────────────────────────
function LegendSection({ mol }) {
  const info = getMoleculeInfo(mol);
  if (!info) return null;
  return (
    <div className="sb-section">
      <div className="sb-label">Element Legend</div>
      <div className="legend-list">
        {Object.entries(info.symMap).slice(0,8).map(([sym,cnt])=>(
          <div className="leg-item" key={sym}>
            <div className="leg-dot" style={{background: "#0a0a12"}}/>
            <span className="leg-name">{sym}</span>
            <span className="leg-count" style={{color:"var(--text3)",fontSize:9}}>{ANAME[sym]||""}</span>
            <span className="leg-count">{cnt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [apiUrl,   setApiUrl]   = useState(()=>{ try{return localStorage.getItem("pmdm_url")||"";}catch{return "";} });
  const [apiSt,    setApiSt]    = useState("unk");
  const [smiles,   setSmiles]   = useState("");
  const [inMol,    setInMol]    = useState(null);
  const [outMol,   setOutMol]   = useState(null);
  const [outSmi,   setOutSmi]   = useState("");
  const [metrics,  setMetrics]  = useState(null);
  const [busy,     setBusy]     = useState(false);
  const [progress, setProgress] = useState(0);
  const [err,      setErr]      = useState(null);
  const [perr,     setPerr]     = useState(null);
  const [copied,   setCopied]   = useState(false);
  const [nAtoms,   setNAtoms]   = useState(20);
  const [prior,    setPrior]    = useState(2.0);
  const [showH,    setShowH]    = useState(true);
  const [showLabels,setShowLabels]=useState(true);
  const hRef = useRef(null);

  useEffect(()=>{
    clearInterval(hRef.current);
    if(!apiUrl){setApiSt("unk");return;}
    try{localStorage.setItem("pmdm_url",apiUrl);}catch{}
    const chk=async()=>{try{setApiSt(await apiHealth(apiUrl)?"ok":"bad");}catch{setApiSt("bad");}};
    chk(); hRef.current=setInterval(chk,15000);
    return()=>clearInterval(hRef.current);
  },[apiUrl]);

  const visualise=(val)=>{
    const s=(val||smiles).trim();
    if(!s)return;
    setPerr(null);
    const mol=smilesTo3D(s);
    if(!mol||!mol.coords.length){setPerr("Cannot parse SMILES — check notation.");setInMol(null);}
    else setInMol(mol);
  };

  const generate=async()=>{
    if(!inMol)return;
    setBusy(true);setProgress(0);setErr(null);setOutMol(null);setOutSmi("");setMetrics(null);
    const steps=[10,26,42,60,76,90,96];let ti=0;
    const tk=setInterval(()=>{if(ti<steps.length)setProgress(steps[ti++]);},480);
    try{
      const data=await apiGen(apiUrl,smiles.trim(),{num_atoms:nAtoms,prior_strength:prior,T:100});
      clearInterval(tk);setProgress(100);
      if(data.coords&&data.symbols) setOutMol({coords:data.coords,symbols:data.symbols,bonds:data.bonds||[]});
      else if(data.smiles) setOutMol(smilesTo3D(data.smiles));
      setOutSmi(data.smiles||"");
      setMetrics(data.metrics||null);
    }catch(e){clearInterval(tk);setErr(`Generation failed: ${e.message}`);setProgress(0);}
    finally{setBusy(false);}
  };

  const demo=()=>{
    if(!inMol)return;
    setBusy(true);setProgress(0);setOutMol(null);setErr(null);setMetrics(null);
    const steps=[10,28,46,62,78,92,97];let ti=0;
    const tk=setInterval(()=>{if(ti<steps.length)setProgress(steps[ti++]);},380);
    setTimeout(()=>{
      clearInterval(tk);setProgress(100);
      const ds="CC1=C(C(=O)Nc2ccc(F)cc2)C(C)(C)N=N1";
      setOutMol(smilesTo3D(ds));setOutSmi(ds);
      setMetrics({qed:.534,mw:261.3,logp:2.44,lipinski:true});
      setBusy(false);
    },steps.length*380+280);
  };

  const inInfo  = getMoleculeInfo(inMol);
  const outInfo = getMoleculeInfo(outMol);

  return (
    <div className="app">

      {/* ── LEFT SIDEBAR (Input) ── */}
      <div className="sidebar">
        <div className="sb-head">
          <div className="sb-logo">
            <div className="sb-logo-icon">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="white" strokeWidth=".8"/>
                <circle cx="6" cy="2" r="1.2" fill="white"/>
                <circle cx="9.5" cy="8.5" r="1.2" fill="white"/>
                <circle cx="2.5" cy="8.5" r="1.2" fill="white"/>
              </svg>
            </div>
            <h2>Mol<span>3D</span></h2>
          </div>
          <div className="sb-subtitle">SMILES → 3D Structure Viewer</div>
        </div>

        <div className="sb-section">
          <div className="sb-label">SMILES Notation</div>
          <textarea
            className="smiles-inp"
            placeholder="Cn1cnc2c1c(=O)n(C)c(=O)n2C"
            value={smiles}
            onChange={e=>{setSmiles(e.target.value);setPerr(null);}}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();visualise();}}}
            spellCheck={false}
          />
          {perr && <div className="err-bar">{perr}</div>}
          <button className="btn-main" onClick={()=>visualise()} disabled={!smiles.trim()}>
            Generate 3D Structure
          </button>
        </div>

        <div className="sb-section">
          <div className="sb-label">Quick Examples</div>
          <div className="examples-grid">
            {PRESETS.map(p=>(
              <button key={p.n} className="ex-btn" onClick={()=>{setSmiles(p.s);setPerr(null);setTimeout(()=>visualise(p.s),0);}}>
                {p.n}
              </button>
            ))}
          </div>
        </div>

        <div className="sb-section">
          <div className="sb-label">Display Options</div>
          <div className="toggle-row">
            <span className="toggle-label">Hydrogens</span>
            <Toggle checked={showH} onChange={setShowH}/>
          </div>
          <div className="toggle-row">
            <span className="toggle-label">Atom Labels</span>
            <Toggle checked={showLabels} onChange={setShowLabels}/>
          </div>
        </div>

        {inInfo && (
          <div className="sb-section">
            <div className="sb-label">Molecule Info</div>
            <div className="mol-formula">
              <span className="formula">{inInfo.formula}</span>
              <span className="sub">Input</span>
            </div>
            <div className="mol-info-grid">
              <div className="mol-stat"><div className="val">{inInfo.coords?.length ?? inMol?.coords?.length ?? "—"}</div><div className="key">Atoms</div></div>
              <div className="mol-stat"><div className="val">{inInfo.heavy}</div><div className="key">Heavy Atoms</div></div>
              <div className="mol-stat"><div className="val">{inInfo.bonds}</div><div className="key">Bonds</div></div>
            </div>
          </div>
        )}

        <LegendSection mol={inMol}/>
      </div>

      {/* ── CENTER — dual canvas ── */}
      <div className="canvas-area">
        <div className="canvas-split">
          <div className="canvas-half">
            <div className="canvas-half-label">INPUT</div>
            <Mol3D mol={inMol} placeholder="enter SMILES above" accentColor="#c8a84b" showH={showH} showLabels={showLabels}/>
            <div className="hint-bar">Drag to rotate · Scroll to zoom</div>
          </div>
          <div className="canvas-half">
            <div className="canvas-half-label">OUTPUT</div>
            <Mol3D mol={outMol} placeholder="generate to see output" accentColor="#4d9fff" busy={busy} showH={showH} showLabels={showLabels}/>
            <div className="prog-bar"><div className="prog-fill" style={{width:`${progress}%`}}/></div>
            {!busy && <div className="hint-bar">Drag to rotate · Scroll to zoom</div>}
          </div>
        </div>
      </div>

      {/* ── RIGHT SIDEBAR (Output) ── */}
      <div className="sidebar right">
        <div className="sb-head">
          <div className="sb-logo">
            <div className="sb-logo-icon" style={{background:"linear-gradient(135deg,#4d9fff,#3ab8a0)"}}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6h8M6 2l4 4-4 4" stroke="white" strokeWidth=".9" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2>PMDM<span style={{color:"var(--green)"}}></span></h2>
          </div>
          <div className="sb-subtitle">3D Molecule Generator</div>
        </div>

        <div className="sb-section">
          <div className="sb-label">API Endpoint</div>
          <div className="api-wrap">
            <div className={`adot ${apiSt==="ok"?"ok":apiSt==="bad"?"bad":"unk"}`}/>
            <input type="text" placeholder="https://xxxx.ngrok-free.app"
              value={apiUrl} onChange={e=>setApiUrl(e.target.value.trim())} spellCheck={false}/>
          </div>
        </div>

        <div className="sb-section">
          <div className="sb-label">Generation Parameters</div>
          <div className="param-row">
            <label>Atoms</label>
            <input type="range" min={10} max={40} step={1} value={nAtoms} disabled={busy}
              onChange={e=>setNAtoms(+e.target.value)}/>
            <span className="pval">{nAtoms}</span>
          </div>
          <div className="param-row">
            <label>Prior</label>
            <input type="range" min={1} max={4} step={.1} value={prior} disabled={busy}
              onChange={e=>setPrior(parseFloat(e.target.value))}/>
            <span className="pval">{prior.toFixed(1)}</span>
          </div>
          {err && <div className="err-bar">{err}</div>}
          {!apiUrl && <div className="hint-box">No API — click Demo to preview with mock output.</div>}
          <button
            className={`btn-main ${busy?"busy":""}`}
            style={apiUrl?{}:{background:"var(--green)"}}
            onClick={apiUrl?generate:demo}
            disabled={!inMol||busy}>
            {busy?"Generating…":apiUrl?"Generate →":"Demo →"}
          </button>
        </div>

        {outInfo && (
          <div className="sb-section">
            <div className="sb-label">Output Info</div>
            <div className="mol-formula">
              <span className="formula" style={{color:"var(--green)"}}>{outInfo.formula}</span>
              <span className="sub">Generated</span>
            </div>
            <div className="mol-info-grid">
              <div className="mol-stat"><div className="val" style={{color:"var(--green)"}}>{outMol?.coords?.length ?? "—"}</div><div className="key">Atoms</div></div>
              <div className="mol-stat"><div className="val" style={{color:"var(--green)"}}>{outInfo.heavy}</div><div className="key">Heavy Atoms</div></div>
              <div className="mol-stat"><div className="val" style={{color:"var(--green)"}}>{outInfo.bonds}</div><div className="key">Bonds</div></div>
            </div>
          </div>
        )}

        {metrics && (
          <div className="sb-section">
            <div className="sb-label">Drug-likeness Metrics</div>
            <div className="metrics-grid">
              <div className="metric">
                <div className="mk">QED</div>
                <div className={`mv ${metrics.qed>=.5?"g":metrics.qed>=.3?"w":"r"}`}>{metrics.qed?.toFixed(3)}</div>
              </div>
              <div className="metric">
                <div className="mk">MW (Da)</div>
                <div className={`mv ${metrics.mw<=500?"g":"w"}`}>{metrics.mw?.toFixed(1)}</div>
              </div>
              <div className="metric">
                <div className="mk">LogP</div>
                <div className={`mv ${metrics.logp<=5?"g":"w"}`}>{metrics.logp?.toFixed(2)}</div>
              </div>
              <div className="metric">
                <div className="mk">Lipinski</div>
                <div className={`mv ${metrics.lipinski?"g":"r"}`}>{metrics.lipinski?"Pass ✓":"Fail"}</div>
              </div>
            </div>
            {outSmi && (
              <div className="smiles-out">
                {outSmi}
                <br/>
                <button className="copy-btn" onClick={()=>{navigator.clipboard.writeText(outSmi);setCopied(true);setTimeout(()=>setCopied(false),1600);}}>
                  {copied?"copied ✓":"copy SMILES"}
                </button>
              </div>
            )}
          </div>
        )}

        <LegendSection mol={outMol}/>
      </div>

    </div>
  );
}
