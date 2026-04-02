import { useState, useEffect, useRef, useCallback } from "react";

const fl = document.createElement("link");
fl.rel = "stylesheet";
fl.href = "https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Mono:wght@300;400;500&display=swap";
document.head.appendChild(fl);

const css = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --ink:#0e1117;--ink2:#111820;--ink3:#192030;
  --gold:#c8a84b;--gold2:#e8c86b;
  --teal:#3ab8a0;--teal2:#2a8878;
  --coral:#e06858;
  --text:#e8edf5;--text2:#8fa8c0;--text3:#4a6080;
  --mono:'IBM Plex Mono',monospace;
  --serif:'Libre Baskerville',serif;
  --r:5px;
}
html,body{height:100%;background:var(--ink);overflow:hidden}
body{font-family:var(--mono);color:var(--text)}
.shell{display:grid;grid-template-rows:54px 1fr;height:100vh}

.hdr{display:flex;align-items:center;justify-content:space-between;padding:0 1.75rem;border-bottom:1px solid rgba(200,168,75,.15);background:var(--ink);z-index:10}
.hdr-brand{display:flex;align-items:baseline;gap:11px}
.hdr-brand h1{font-family:var(--serif);font-size:17px;font-weight:400;letter-spacing:.02em;font-style:italic}
.hdr-brand sub{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);font-style:normal}
.api-row{display:flex;align-items:center;gap:8px}
.api-box{display:flex;align-items:center;gap:7px;padding:4px 10px;background:var(--ink2);border:1px solid rgba(200,168,75,.18);border-radius:var(--r)}
.api-box label{font-size:8px;color:var(--text3);letter-spacing:.12em;white-space:nowrap}
.api-box input{background:transparent;border:none;outline:none;font-family:var(--mono);font-size:10px;color:var(--gold);width:200px}
.api-box input::placeholder{color:var(--text3)}
.adot{width:6px;height:6px;border-radius:50%;flex-shrink:0;animation:blink 2.5s ease-in-out infinite}
.adot.ok{background:var(--teal);box-shadow:0 0 5px var(--teal)}
.adot.bad{background:var(--coral);box-shadow:0 0 5px var(--coral)}
.adot.unk{background:var(--gold);box-shadow:0 0 5px var(--gold)}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.28}}

.body{display:grid;grid-template-columns:1fr 1fr;height:calc(100vh - 54px)}
.pane{display:grid;grid-template-rows:auto 1fr 36px;border-right:1px solid rgba(200,168,75,.1);overflow:hidden}
.pane:last-child{border-right:none}

.phdr{padding:13px 18px 11px;border-bottom:1px solid rgba(200,168,75,.1);background:var(--ink2)}
.plabel{font-size:8px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);margin-bottom:5px}
.ptitle{font-family:var(--serif);font-size:14px;font-weight:400;font-style:italic;color:var(--text);margin-bottom:10px}

.sinp-row{display:flex;gap:7px;align-items:stretch}
.sinp-wrap{flex:1;display:flex;align-items:center;gap:7px;background:var(--ink3);border:1px solid rgba(200,168,75,.18);border-radius:var(--r);padding:0 11px;transition:border-color .2s}
.sinp-wrap:focus-within{border-color:rgba(200,168,75,.6)}
.sinp-ico{font-size:11px;color:var(--text3);flex-shrink:0;font-style:italic;font-family:var(--serif)}
.sinp{flex:1;background:transparent;border:none;outline:none;font-family:var(--mono);font-size:10px;color:var(--text);padding:8px 0;letter-spacing:.02em}
.sinp::placeholder{color:var(--text3)}
.btn-vis{padding:0 13px;background:transparent;border:1px solid rgba(200,168,75,.3);border-radius:var(--r);color:var(--gold);font-family:var(--mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;transition:all .18s;white-space:nowrap}
.btn-vis:hover{background:rgba(200,168,75,.07);border-color:var(--gold)}
.btn-vis:disabled{opacity:.35;cursor:not-allowed}

.presets{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
.pchip{font-size:9px;padding:3px 8px;border-radius:20px;cursor:pointer;border:1px solid rgba(200,168,75,.18);color:var(--text3);background:transparent;font-family:var(--mono);transition:all .13s}
.pchip:hover{border-color:var(--gold);color:var(--gold)}

.gctrl{display:flex;align-items:center;gap:10px;margin-top:9px;flex-wrap:wrap}
.gparam{display:flex;align-items:center;gap:5px}
.gparam label{font-size:8px;color:var(--text3);letter-spacing:.08em;white-space:nowrap}
.gparam input[type=range]{width:65px;accent-color:var(--teal);cursor:pointer}
.gparam span{font-size:9px;color:var(--teal);min-width:24px;font-weight:500}
.btn-gen{margin-left:auto;padding:6px 16px;background:transparent;border:1px solid var(--teal2);border-radius:var(--r);color:var(--teal);font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;transition:all .18s;position:relative;overflow:hidden}
.btn-gen::before{content:'';position:absolute;inset:0;background:rgba(58,184,160,.09);opacity:0;transition:opacity .2s}
.btn-gen:hover::before{opacity:1}
.btn-gen:disabled{opacity:.32;cursor:not-allowed}
.btn-gen.busy{border-color:var(--gold);color:var(--gold)}

.cvwrap{position:relative;overflow:hidden;background:var(--ink);width:100%;height:100%}
canvas{width:100%!important;height:100%!important;display:block;cursor:grab}
canvas:active{cursor:grabbing}

.cv-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;pointer-events:none}
.cv-empty-t{font-size:10px;color:var(--text3);letter-spacing:.1em}
.cv-empty-s{font-size:9px;color:var(--text3);opacity:.45}
.cv-leg{position:absolute;top:10px;left:10px;display:flex;flex-wrap:wrap;gap:4px}
.cv-chip{display:flex;align-items:center;gap:3px;font-size:8px;color:var(--text2);padding:2px 6px;background:rgba(14,17,23,.82);border:1px solid rgba(200,168,75,.1);border-radius:20px}
.cv-dot{width:5px;height:5px;border-radius:50%}
.cv-info{position:absolute;bottom:10px;right:10px;font-size:9px;color:var(--text3);letter-spacing:.06em;line-height:1.9;text-align:right}
.cv-info span{color:var(--text2)}
.cvctrl{position:absolute;top:10px;right:10px;display:flex;flex-direction:column;gap:4px}
.cvbtn{width:24px;height:24px;background:rgba(14,17,23,.88);border:1px solid rgba(200,168,75,.15);border-radius:4px;color:var(--text3);font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .13s;font-family:var(--mono)}
.cvbtn:hover{border-color:var(--gold);color:var(--gold)}

.prog{height:2px;background:rgba(58,184,160,.1);overflow:hidden;flex-shrink:0}
.prog-f{height:100%;background:var(--teal);transition:width .2s;box-shadow:0 0 5px var(--teal)}

.bbar{border-top:1px solid rgba(200,168,75,.1);padding:0 14px;background:var(--ink2);display:flex;align-items:center;gap:8px;height:36px;overflow:hidden}
.blabel{font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--text3);flex-shrink:0}
.bval{font-size:9px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bcopy{font-size:8px;color:var(--text3);background:transparent;border:1px solid rgba(200,168,75,.15);border-radius:3px;padding:2px 7px;cursor:pointer;letter-spacing:.08em;transition:all .13s;flex-shrink:0;font-family:var(--mono)}
.bcopy:hover{border-color:var(--gold);color:var(--gold)}
.mrow{display:flex;gap:12px;align-items:center}
.mc{display:flex;flex-direction:column}
.mk{font-size:7px;letter-spacing:.12em;text-transform:uppercase;color:var(--text3)}
.mv{font-size:10px;font-weight:500}
.mv.g{color:var(--teal)}.mv.w{color:var(--gold)}.mv.b{color:var(--coral)}

.err{padding:6px 9px;background:rgba(224,104,88,.07);border:1px solid rgba(224,104,88,.2);border-radius:4px;font-size:9px;color:var(--coral);line-height:1.5;margin-top:7px}
.hint{padding:5px 9px;background:rgba(200,168,75,.06);border:1px solid rgba(200,168,75,.15);border-radius:4px;font-size:9px;color:var(--gold);line-height:1.5;margin-top:5px}

.scan{position:absolute;left:0;right:0;height:1px;pointer-events:none;background:linear-gradient(90deg,transparent,var(--teal),transparent);opacity:.28;animation:scan 3s linear infinite}
@keyframes scan{from{top:0}to{top:100%}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
`;
const sel = document.createElement("style");
sel.textContent = css;
document.head.appendChild(sel);

// ── atom colours ──────────────────────────────────────────────────────────────
const ACLR = {C:"#9ab8d0",H:"#dde8f4",N:"#4fc3a1",O:"#e06858",F:"#d4537e",S:"#e8c84b",P:"#9b7fd4",Cl:"#4fb8b8",Br:"#c97b3c",I:"#7b7bcc"};

// ── tiny SMILES → 3D layout ───────────────────────────────────────────────────
function smilesTo3D(raw) {
  if (!raw?.trim()) return null;
  const atoms = [];
  const bonds = [];
  // parse atom symbols
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
  // chain bonds
  for (let i=0;i<N-1;i++) bonds.push([i,i+1]);
  // close rings
  const ringOpen = {};
  for (let ci=0; ci<raw.length; ci++) {
    const c = raw[ci];
    if (c>='1'&&c<='9') {
      const ai = Math.min(Math.floor(ci * N / raw.length), N-1);
      if (ringOpen[c]!==undefined) { bonds.push([ringOpen[c], ai]); delete ringOpen[c]; }
      else ringOpen[c]=ai;
    }
  }
  // 3D layout via spring
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

// ── 3D renderer ───────────────────────────────────────────────────────────────
function Mol3D({ mol, placeholder, accent="#c8a84b", busy=false }) {
  const cvRef   = useRef(null);
  const wrapRef = useRef(null);
  const rotRef  = useRef({x:.35,y:.6});
  const dragRef = useRef(null);
  const frameRef= useRef(null);
  const autoRef = useRef(true);
  const [sz, setSz] = useState({w:600,h:400});

  useEffect(()=>{
    const obs=new ResizeObserver(en=>{ for(const e of en) setSz({w:Math.round(e.contentRect.width),h:Math.round(e.contentRect.height)}); });
    if(wrapRef.current) obs.observe(wrapRef.current);
    return ()=>obs.disconnect();
  },[]);

  const draw = useCallback(()=>{
    const cv=cvRef.current; if(!cv||!mol) return;
    const ctx=cv.getContext("2d");
    const W=cv.width,H=cv.height,cx=W/2,cy=H/2,zoom=Math.min(W,H)*.062;
    ctx.clearRect(0,0,W,H);
    const {x:rx,y:ry}=rotRef.current;
    const crx=Math.cos(rx),srx=Math.sin(rx),cry=Math.cos(ry),sry=Math.sin(ry);
    const pr=mol.coords.map(([x,y,z])=>{
      const y1=y*crx-z*srx,z1=y*srx+z*crx,x2=x*cry+z1*sry,z2=-x*sry+z1*cry;
      return{sx:cx+x2*zoom,sy:cy+y1*zoom,depth:(z2+5)/10};
    });
    (mol.bonds||[]).forEach(([a,b])=>{
      if(a>=pr.length||b>=pr.length)return;
      const al=0.07+(pr[a].depth+pr[b].depth)/2*.3;
      ctx.beginPath();ctx.moveTo(pr[a].sx,pr[a].sy);ctx.lineTo(pr[b].sx,pr[b].sy);
      ctx.strokeStyle=`rgba(170,195,220,${al})`;ctx.lineWidth=.7+(pr[a].depth+pr[b].depth)/2*1.1;ctx.stroke();
    });
    [...pr.map((p,i)=>({...p,i}))].sort((a,b)=>a.depth-b.depth).forEach(({sx,sy,depth,i})=>{
      const sym=mol.symbols?.[i]||"C",col=ACLR[sym]||"#9ab8d0";
      const r=2.8+depth*5.5,alp=.48+depth*.52;
      if(depth>.5){const g=ctx.createRadialGradient(sx,sy,0,sx,sy,r*2.8);g.addColorStop(0,col+"26");g.addColorStop(1,"transparent");ctx.beginPath();ctx.arc(sx,sy,r*2.8,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();}
      ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);
      ctx.fillStyle=col+Math.round(alp*255).toString(16).padStart(2,"0");ctx.fill();
      if(r>5&&sym!=="C"&&sym!=="H"){ctx.fillStyle=`rgba(255,255,255,${alp*.9})`;ctx.font=`${Math.round(r*.84)}px 'IBM Plex Mono',monospace`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(sym,sx,sy);}
    });
  },[mol]);

  useEffect(()=>{
    const loop=()=>{if(autoRef.current)rotRef.current.y+=.0042;draw();frameRef.current=requestAnimationFrame(loop);};
    frameRef.current=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(frameRef.current);
  },[draw]);

  useEffect(()=>{
    const el=cvRef.current;if(!el)return;
    const dn=e=>{autoRef.current=false;const p=e.touches?e.touches[0]:e;dragRef.current={x:p.clientX,y:p.clientY,...rotRef.current};};
    const mv=e=>{if(!dragRef.current)return;const p=e.touches?e.touches[0]:e;rotRef.current.y=dragRef.current.y+(p.clientX-dragRef.current.x)*.009;rotRef.current.x=dragRef.current.x+(p.clientY-dragRef.current.y)*.009;};
    const up=()=>dragRef.current=null;
    el.addEventListener("mousedown",dn);el.addEventListener("mousemove",mv);el.addEventListener("mouseup",up);
    el.addEventListener("touchstart",dn,{passive:true});el.addEventListener("touchmove",mv,{passive:true});el.addEventListener("touchend",up);
    return()=>{el.removeEventListener("mousedown",dn);el.removeEventListener("mousemove",mv);el.removeEventListener("mouseup",up);el.removeEventListener("touchstart",dn);el.removeEventListener("touchmove",mv);el.removeEventListener("touchend",up);};
  },[]);

  const symMap={};(mol?.symbols||[]).forEach(s=>{symMap[s]=(symMap[s]||0)+1;});
  const legend=Object.entries(symMap).slice(0,7);

  return (
    <div ref={wrapRef} className="cvwrap">
      <canvas ref={cvRef} width={sz.w} height={sz.h}/>
      {busy&&<div className="scan"/>}
      {mol ? (
        <>
          <div className="cv-leg">
            {legend.map(([sym,cnt])=>(
              <div className="cv-chip" key={sym}>
                <div className="cv-dot" style={{background:ACLR[sym]||"#888"}}/>
                {sym} {cnt}
              </div>
            ))}
          </div>
          <div className="cvctrl">
            <button className="cvbtn" title="Reset"
              onClick={()=>{rotRef.current={x:.35,y:.6};autoRef.current=true;}}>↺</button>
          </div>
          <div className="cv-info">atoms <span>{mol.coords.length}</span></div>
        </>
      ) : (
        <div className="cv-empty">
          {busy ? (
            <>
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" style={{opacity:.28}}>
                <circle cx="15" cy="15" r="12" stroke={accent} strokeWidth=".8" strokeDasharray="4 3"
                  style={{animation:"spin 6s linear infinite",transformOrigin:"center"}}/>
                <circle cx="15" cy="15" r="5" stroke={accent} strokeWidth=".5"/>
                <circle cx="15" cy="15" r="2" fill={accent} opacity=".5"/>
              </svg>
              <span className="cv-empty-t">computing…</span>
            </>
          ) : (
            <>
              <svg width="34" height="34" viewBox="0 0 34 34" fill="none" style={{opacity:.1}}>
                <circle cx="17" cy="9"  r="3.2" stroke="currentColor" strokeWidth=".8"/>
                <circle cx="26" cy="25" r="3.2" stroke="currentColor" strokeWidth=".8"/>
                <circle cx="8"  cy="25" r="3.2" stroke="currentColor" strokeWidth=".8"/>
                <line x1="17" y1="12" x2="25" y2="22.5" stroke="currentColor" strokeWidth=".8"/>
                <line x1="17" y1="12" x2="9"  y2="22.5" stroke="currentColor" strokeWidth=".8"/>
                <line x1="9"  y1="25" x2="25" y2="25"   stroke="currentColor" strokeWidth=".8"/>
              </svg>
              <span className="cv-empty-t">{placeholder}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── API ───────────────────────────────────────────────────────────────────────
async function apiHealth(u){const r=await fetch(`${u.replace(/\/$/,"")}/health`,{signal:AbortSignal.timeout(4000)});return r.ok;}
async function apiGen(u,smiles,p){
  const r=await fetch(`${u.replace(/\/$/,"")}/generate_from_smiles`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({smiles,...p})});
  if(!r.ok){const e=await r.json().catch(()=>({detail:r.statusText}));throw new Error(e.detail||`HTTP ${r.status}`);}
  return r.json();
}

const PRESETS=[
  {n:"aspirin",   s:"CC(=O)Oc1ccccc1C(=O)O"},
  {n:"caffeine",  s:"Cn1cnc2c1c(=O)n(C)c(=O)n2C"},
  {n:"ibuprofen", s:"CC(C)Cc1ccc(cc1)C(C)C(=O)O"},
  {n:"dopamine",  s:"NCCc1ccc(O)c(O)c1"},
  {n:"paracetamol",s:"CC(=O)Nc1ccc(O)cc1"},
];

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [apiUrl,   setApiUrl]   = useState(()=>localStorage.getItem("pmdm3_url")||"");
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
  const hRef = useRef(null);

  useEffect(()=>{
    clearInterval(hRef.current);
    if(!apiUrl){setApiSt("unk");return;}
    localStorage.setItem("pmdm3_url",apiUrl);
    const chk=async()=>{try{setApiSt(await apiHealth(apiUrl)?"ok":"bad");}catch{setApiSt("bad");}};
    chk(); hRef.current=setInterval(chk,15000);
    return()=>clearInterval(hRef.current);
  },[apiUrl]);

  const visualise=(val)=>{
    const s=(val||smiles).trim();
    if(!s)return;
    setPerr(null);
    const mol=smilesTo3D(s);
    if(!mol||!mol.coords.length){setPerr("Cannot parse SMILES — check your notation.");setInMol(null);}
    else{setInMol(mol);}
  };

  const generate=async()=>{
    if(!inMol)return;
    setBusy(true);setProgress(0);setErr(null);setOutMol(null);setOutSmi("");setMetrics(null);
    const steps=[10,26,42,60,76,90,96];
    let ti=0;const tk=setInterval(()=>{if(ti<steps.length)setProgress(steps[ti++]);},480);
    try{
      const data=await apiGen(apiUrl,smiles.trim(),{num_atoms:nAtoms,prior_strength:prior,T:100});
      clearInterval(tk);setProgress(100);
      if(data.coords&&data.symbols){setOutMol({coords:data.coords,symbols:data.symbols,bonds:data.bonds||[]});}
      else if(data.smiles){setOutMol(smilesTo3D(data.smiles));}
      setOutSmi(data.smiles||"");
      setMetrics(data.metrics||null);
    }catch(e){
      clearInterval(tk);setErr(`Generation failed: ${e.message}`);setProgress(0);
    }finally{setBusy(false);}
  };

  // demo (no api)
  const demo=()=>{
    if(!inMol)return;
    setBusy(true);setProgress(0);setOutMol(null);setErr(null);
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

  const dotCls=apiSt==="ok"?"ok":apiSt==="bad"?"bad":"unk";

  return (
    <div className="shell">
      <header className="hdr">
        <div className="hdr-brand">
          <h1>PMDM</h1>
          <sub>3D molecule generator</sub>
        </div>
        <div className="api-row">
          <div className="api-box">
            <label>API</label>
            <input type="text" placeholder="https://xxxx.ngrok-free.app"
              value={apiUrl} onChange={e=>setApiUrl(e.target.value.trim())} spellCheck={false}/>
            <div className={`adot ${dotCls}`}/>
          </div>
        </div>
      </header>

      <div className="body">
        {/* ── LEFT — input ── */}
        <div className="pane">
          <div className="phdr">
            <div className="plabel">input</div>
            <div className="ptitle">Query molecule</div>
            <div className="sinp-row">
              <div className="sinp-wrap">
                <span className="sinp-ico">Σ</span>
                <input className="sinp" placeholder="CC(=O)Oc1ccccc1C(=O)O"
                  value={smiles}
                  onChange={e=>{setSmiles(e.target.value);setPerr(null);}}
                  onKeyDown={e=>{if(e.key==="Enter")visualise();}}
                  spellCheck={false}/>
              </div>
              <button className="btn-vis" onClick={()=>visualise()} disabled={!smiles.trim()}>
                visualise
              </button>
            </div>
            {perr && <div className="err">{perr}</div>}
            <div className="presets">
              {PRESETS.map(p=>(
                <button key={p.n} className="pchip"
                  onClick={()=>{setSmiles(p.s);setPerr(null);visualise(p.s);}}>
                  {p.n}
                </button>
              ))}
            </div>
          </div>

          <Mol3D mol={inMol} placeholder="enter smiles above" accent="#c8a84b"/>

          <div className="bbar">
            <span className="blabel">SMILES</span>
            <span className="bval" style={{color:"var(--gold)"}}>{smiles||"—"}</span>
            {smiles&&<button className="bcopy"
              onClick={()=>{navigator.clipboard.writeText(smiles);setCopied(true);setTimeout(()=>setCopied(false),1600);}}>
              {copied?"copied":"copy"}
            </button>}
          </div>
        </div>

        {/* ── RIGHT — output ── */}
        <div className="pane">
          <div className="phdr">
            <div className="plabel">output</div>
            <div className="ptitle">Generated molecule</div>
            <div className="gctrl">
              <div className="gparam">
                <label>atoms</label>
                <input type="range" min={10} max={40} step={1}
                  value={nAtoms} disabled={busy}
                  onChange={e=>setNAtoms(+e.target.value)}/>
                <span>{nAtoms}</span>
              </div>
              <div className="gparam">
                <label>prior</label>
                <input type="range" min={1} max={4} step={.1}
                  value={prior} disabled={busy}
                  onChange={e=>setPrior(parseFloat(e.target.value))}/>
                <span>{prior.toFixed(1)}</span>
              </div>
              <button className={`btn-gen ${busy?"busy":""}`}
                onClick={apiUrl?generate:demo}
                disabled={!inMol||busy}>
                {busy?"generating…":apiUrl?"generate →":"demo →"}
              </button>
            </div>
            {err&&<div className="err">{err}</div>}
            {!apiUrl&&<div className="hint">No API connected — click "demo →" to preview with a mock output.</div>}
          </div>

          <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
            <div className="prog"><div className="prog-f" style={{width:`${progress}%`}}/></div>
            <div style={{flex:1,overflow:"hidden"}}>
              <Mol3D mol={outMol} placeholder="generate to see output" accent="#3ab8a0" busy={busy}/>
            </div>
          </div>

          <div className="bbar">
            {metrics?(
              <div className="mrow">
                <div className="mc"><span className="mk">QED</span><span className={`mv ${metrics.qed>=.5?"g":metrics.qed>=.3?"w":"b"}`}>{metrics.qed?.toFixed(3)}</span></div>
                <div className="mc"><span className="mk">MW</span><span className={`mv ${metrics.mw<=500?"g":"w"}`}>{metrics.mw?.toFixed(1)} Da</span></div>
                <div className="mc"><span className="mk">LogP</span><span className={`mv ${metrics.logp<=5?"g":"w"}`}>{metrics.logp?.toFixed(2)}</span></div>
                <div className="mc"><span className="mk">Lipinski</span><span className={`mv ${metrics.lipinski?"g":"b"}`}>{metrics.lipinski?"pass ✓":"fail"}</span></div>
                <div className="mc" style={{marginLeft:"auto",maxWidth:180,overflow:"hidden"}}>
                  <span className="mk">SMILES</span>
                  <span className="mv" style={{fontSize:8,color:"var(--teal)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block"}}>{outSmi||"—"}</span>
                </div>
              </div>
            ):(
              <><span className="blabel">SMILES</span><span className="bval" style={{color:"var(--teal)"}}>{outSmi||"—"}</span></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
