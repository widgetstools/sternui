import { useState, createContext, useContext } from 'react';
import { RESEARCH_NOTES } from '@/data/tradingData';

const BD = '1px solid var(--bn-border)';
type Note = typeof RESEARCH_NOTES[0];
const ratingColor=(r:string)=>r==='Overweight'?{bg:'var(--bn-positive-soft)',color:'var(--bn-green)',border:'var(--bn-positive-ring)'}:r==='Underweight'?{bg:'var(--bn-negative-soft)',color:'var(--bn-red)',border:'var(--bn-negative-ring)'}:{bg:'var(--bn-warning-soft)',color:'var(--bn-amber)',border:'var(--bn-warning-ring)'};

interface ResearchCtx { selected: Note; setSelected: (n:Note)=>void; filter: string; setFilter: (f:string)=>void; }
const ResearchContext = createContext<ResearchCtx>({ selected:RESEARCH_NOTES[0], setSelected:()=>{}, filter:'All', setFilter:()=>{} });

export function ResearchProvider({ children }: { children: React.ReactNode }) {
  const [selected,setSelected]=useState(RESEARCH_NOTES[0]);
  const [filter,setFilter]=useState('All');
  return <ResearchContext.Provider value={{selected,setSelected,filter,setFilter}}>{children}</ResearchContext.Provider>;
}

export function ResearchList() {
  const {selected,setSelected,filter,setFilter}=useContext(ResearchContext);
  const SECTORS=['All','Government','Financials','Technology','Consumer','Cross-Asset'];
  const filtered=RESEARCH_NOTES.filter(n=>filter==='All'||n.sector===filter);
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'var(--bn-bg1)',overflow:'hidden'}}>
      {/* Filter toolbar + count (no title — dock header has it) */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 10px',flexShrink:0}}>
        <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
          {SECTORS.map(s=>(
            <button key={s} onClick={()=>setFilter(s)} style={{fontSize:9,padding:'2px 8px',borderRadius:2,border:BD,background:filter===s?'var(--bn-border)':'transparent',color:filter===s?'var(--bn-t0)':'var(--bn-t1)',cursor:'pointer',fontFamily:'JetBrains Mono,monospace'}}>{s}</button>
          ))}
        </div>
        <span style={{fontSize:11,color:'var(--bn-t2)',fontFamily:'JetBrains Mono,monospace',flexShrink:0,marginLeft:8}}>{filtered.length} notes</span>
      </div>
      <div style={{flex:1,overflowY:'auto'}}>
        {filtered.map(note=>{
          const rc=ratingColor(note.rating);
          return (
            <div key={note.id} onClick={()=>setSelected(note)} style={{margin:'6px 8px',padding:12,borderRadius:3,cursor:'pointer',background:selected.id===note.id?'var(--bn-bg2)':'var(--bn-bg1)',border:`1px solid ${selected.id===note.id?'var(--bn-blue)':'var(--bn-border)'}`,transition:'border-color .15s'}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,marginBottom:5}}>
                <div>
                  <span style={{fontSize:11,fontWeight:700,color:'var(--bn-cyan)',fontFamily:'JetBrains Mono,monospace'}}>{note.ticker}</span>
                  <span style={{fontSize:9,color:'var(--bn-t2)',fontFamily:'JetBrains Mono,monospace',marginLeft:8}}>{note.date}</span>
                </div>
                <span style={{fontSize:9,padding:'1px 5px',borderRadius:2,background:rc.bg,color:rc.color,border:`1px solid ${rc.border}`,flexShrink:0,fontFamily:'JetBrains Mono,monospace'}}>{note.rating}</span>
              </div>
              <div style={{fontSize:11,color:'var(--bn-t0)',lineHeight:1.4,marginBottom:5,fontFamily:'JetBrains Mono,monospace'}}>{note.title}</div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <span style={{fontSize:9,color:'var(--bn-t2)',fontFamily:'JetBrains Mono,monospace'}}>{note.author}</span>
                <span style={{fontSize:9,padding:'0 4px',borderRadius:2,background:'var(--bn-bg2)',color:'var(--bn-t1)',border:BD,fontFamily:'JetBrains Mono,monospace'}}>{note.sector}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function NoteDetail() {
  const {selected}=useContext(ResearchContext);
  const rc=ratingColor(selected.rating);
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'var(--bn-bg1)',overflow:'hidden'}}>
      {/* Action toolbar (no title — dock header has it) */}
      <div style={{display:'flex',justifyContent:'flex-end',padding:'4px 10px',flexShrink:0}}>
        {['↓ PDF','Share'].map(b=>(
          <button key={b} style={{fontSize:9,padding:'2px 8px',marginLeft:3,borderRadius:2,border:BD,background:'transparent',color:'var(--bn-t1)',cursor:'pointer',fontFamily:'JetBrains Mono,monospace'}}>{b}</button>
        ))}
      </div>
      <div style={{flex:1,overflowY:'auto',padding:24}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:6}}>
          <span style={{fontSize:18,fontWeight:700,color:'var(--bn-cyan)',fontFamily:'JetBrains Mono,monospace'}}>{selected.ticker}</span>
          <span style={{fontSize:11,padding:'3px 8px',borderRadius:2,background:rc.bg,color:rc.color,border:`1px solid ${rc.border}`,fontFamily:'JetBrains Mono,monospace'}}>{selected.rating}</span>
        </div>
        <div style={{fontSize:13,color:'var(--bn-t0)',lineHeight:1.5,maxWidth:600,fontFamily:'JetBrains Mono,monospace',marginBottom:16}}>{selected.title}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
          {[{l:'Author',v:selected.author},{l:'Sector',v:selected.sector},{l:'Published',v:selected.date+' 2026'}].map(f=>(
            <div key={f.l} style={{padding:12,borderRadius:3,border:BD,background:'var(--bn-bg2)'}}>
              <div style={{fontSize:9,color:'var(--bn-t1)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.05em'}}>{f.l}</div>
              <div style={{fontSize:11,color:'var(--bn-t0)',fontFamily:'JetBrains Mono,monospace'}}>{f.v}</div>
            </div>
          ))}
        </div>
        {selected.target && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
            <div style={{padding:12,borderRadius:3,border:BD,background:'var(--bn-bg2)'}}>
              <div style={{fontSize:9,color:'var(--bn-t1)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.05em'}}>OAS Target (12M)</div>
              <div style={{fontSize:18,fontWeight:700,color:'var(--bn-green)',fontFamily:'JetBrains Mono,monospace'}}>+{selected.target}bp</div>
            </div>
            <div style={{padding:12,borderRadius:3,border:BD,background:'var(--bn-bg2)'}}>
              <div style={{fontSize:9,color:'var(--bn-t1)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.05em'}}>Current OAS</div>
              <div style={{fontSize:18,fontWeight:700,color:'var(--bn-amber)',fontFamily:'JetBrains Mono,monospace'}}>+{selected.prev}bp</div>
            </div>
          </div>
        )}
        <div style={{borderTop:BD,paddingTop:16}}>
          <div style={{fontSize:9,color:'var(--bn-t1)',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.05em'}}>Summary</div>
          <p style={{fontSize:11,color:'var(--bn-t1)',lineHeight:1.8,fontFamily:'JetBrains Mono,monospace'}}>{selected.body}</p>
        </div>
      </div>
    </div>
  );
}
