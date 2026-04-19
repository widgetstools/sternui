import { useState } from 'react';
import { RESEARCH_NOTES } from '@/data/tradingData';

const BD = '1px solid var(--bn-border)';
const ratingColor=(r:string)=>r==='Overweight'?{bg:'var(--bn-positive-soft)',color:'var(--bn-green)',border:'var(--bn-positive-ring)'}:r==='Underweight'?{bg:'var(--bn-negative-soft)',color:'var(--bn-red)',border:'var(--bn-negative-ring)'}:{bg:'var(--bn-warning-soft)',color:'var(--bn-amber)',border:'var(--bn-warning-ring)'};

export function ResearchTab() {
  const [selected,setSelected]=useState(RESEARCH_NOTES[0]);
  const [filter,setFilter]=useState('All');
  const SECTORS=['All','Government','Financials','Technology','Consumer','Cross-Asset'];
  const filtered=RESEARCH_NOTES.filter(n=>filter==='All'||n.sector===filter);

  return (
    <div style={{display:'flex',height:'100%',overflow:'hidden',background:'var(--bn-bg)'}}>
      {/* Left list */}
      <div style={{width:380,flexShrink:0,background:'var(--bn-bg1)',borderRight:BD,display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 14px',borderBottom:BD}}>
          <span style={{fontSize:11,fontWeight:600,color:'var(--bn-t0)'}}>Research Notes</span>
          <span style={{fontSize:11,color:'var(--bn-t2)',fontFamily:'JetBrains Mono,monospace'}}>{filtered.length} notes</span>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:4,padding:8,borderBottom:BD,background:'var(--bn-bg)',flexShrink:0}}>
          {SECTORS.map(s=>(
            <button key={s} onClick={()=>setFilter(s)} style={{fontSize:9,padding:'2px 8px',borderRadius:2,border:BD,background:filter===s?'var(--bn-border)':'transparent',color:filter===s?'var(--bn-t0)':'var(--bn-t1)',cursor:'pointer',fontFamily:'JetBrains Mono,monospace'}}>{s}</button>
          ))}
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

      {/* Right detail */}
      <div style={{flex:1,background:'var(--bn-bg1)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 14px',borderBottom:BD}}>
          <span style={{fontSize:11,fontWeight:600,color:'var(--bn-t0)'}}>Note Detail</span>
          <div style={{display:'flex',gap:4}}>
            {['↓ PDF','Share'].map(b=>(
              <button key={b} style={{fontSize:9,padding:'2px 8px',borderRadius:2,border:BD,background:'transparent',color:'var(--bn-t1)',cursor:'pointer',fontFamily:'JetBrains Mono,monospace'}}>{b}</button>
            ))}
          </div>
        </div>
        {selected && (
          <div style={{flex:1,overflowY:'auto',padding:24}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:6}}>
                  <span style={{fontSize:18,fontWeight:700,color:'var(--bn-cyan)',fontFamily:'JetBrains Mono,monospace'}}>{selected.ticker}</span>
                  {(()=>{const rc=ratingColor(selected.rating);return <span style={{fontSize:11,padding:'3px 8px',borderRadius:2,background:rc.bg,color:rc.color,border:`1px solid ${rc.border}`,fontFamily:'JetBrains Mono,monospace'}}>{selected.rating}</span>;})()}
                </div>
                <div style={{fontSize:13,color:'var(--bn-t0)',lineHeight:1.5,maxWidth:600,fontFamily:'JetBrains Mono,monospace'}}>{selected.title}</div>
              </div>
            </div>
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
            <div style={{marginTop:20,padding:16,borderRadius:3,border:BD,background:'var(--bn-bg2)'}}>
              <div style={{fontSize:9,color:'var(--bn-t1)',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.05em'}}>Key Risks</div>
              <ul style={{fontSize:11,color:'var(--bn-t2)',lineHeight:2,fontFamily:'JetBrains Mono,monospace'}}>
                <li>• Rate volatility above MOVE 110 could widen spreads 15–20bp</li>
                <li>• Fed policy divergence from dot plot guidance</li>
                <li>• Liquidity deterioration in off-the-run names</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
