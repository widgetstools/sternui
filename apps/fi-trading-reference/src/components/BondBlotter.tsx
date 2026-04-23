import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridApi, GridReadyEvent, ICellRendererParams, RowClassParams } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';
import { ModuleRegistry } from 'ag-grid-community';
import { BONDS, type Bond } from '@/data/tradingData';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { fiGridTheme } from '@/lib/agGridTheme';
import { TickerCellRenderer, RatingBadgeRenderer, SideCellRenderer, OasValueRenderer, SignedValueRenderer } from '@/lib/cell-renderers';

ModuleRegistry.registerModules([AllEnterpriseModule]);
LicenseManager.setLicenseKey('');

interface BondBlotterProps { onSelectBond: (b:Bond)=>void; }

export function BondBlotter({onSelectBond}:BondBlotterProps) {
  const gridApiRef = useRef<GridApi<Bond>|null>(null);
  const [rowData,setRowData]=useState<Bond[]>(BONDS.map(b=>({...b})));
  const [search,setSearch]=useState('');
  const [sectorFilter,setSectorFilter]=useState('All');

  const colDefs=useMemo(()=>[
    {field:'ticker',  headerName:'TICKER', width:68,  cellRenderer:TickerCellRenderer,  pinned:'left'},
    {field:'issuer',  headerName:'ISSUER', width:140, cellStyle:{color:'var(--bn-t1)',fontSize:11}, pinned:'left'},
    {field:'cpn',     headerName:'CPN',    width:62,  valueFormatter:p=>p.value?.toFixed(3), type:'numericColumn'},
    {field:'mat',     headerName:'MAT',    width:52,  cellStyle:{color:'var(--bn-t1)'}},
    {field:'cusip',   headerName:'CUSIP',  width:90,  cellStyle:{color:'var(--bn-t2)',fontSize:9}},
    {field:'rtg',     headerName:'RTG',    width:50,  cellRenderer:RatingBadgeRenderer},
    {field:'sector',  headerName:'SECTOR', width:90,  cellStyle:{color:'var(--bn-t1)',fontSize:9}},
    {field:'bid',     headerName:'BID',    width:80,  type:'numericColumn', valueFormatter:p=>p.value?.toFixed(3), cellStyle:{color:'var(--bn-blue)',fontWeight:600}},
    {field:'ask',     headerName:'ASK',    width:80,  type:'numericColumn', valueFormatter:p=>p.value?.toFixed(3), cellStyle:{color:'var(--bn-red)',fontWeight:600}},
    {colId:'mid',     headerName:'MID',    width:80,  type:'numericColumn', valueFormatter:p=>p.value?.toFixed(3), cellStyle:{color:'var(--bn-t1)'},
     valueGetter:p=>p.data?((p.data.bid+p.data.ask)/2):0},
    {field:'ytm',     headerName:'YTM',    width:60,  valueFormatter:p=>p.value?.toFixed(3), type:'numericColumn'},
    {field:'ytw',     headerName:'YTW',    width:60,  valueFormatter:p=>p.value?.toFixed(3), type:'numericColumn', cellStyle:{color:'var(--bn-t1)'}},
    {field:'oas',     headerName:'OAS',    width:56,  cellRenderer:OasValueRenderer, type:'numericColumn'},
    {field:'gSpd',    headerName:'G-SPD',  width:58,  cellRenderer:SignedValueRenderer, type:'numericColumn'},
    {field:'dur',     headerName:'DUR',    width:54,  valueFormatter:p=>p.value?.toFixed(2), type:'numericColumn'},
    {field:'dv01',    headerName:'DV01',   width:62,  valueFormatter:p=>p.value?.toLocaleString(), type:'numericColumn'},
    {field:'cvx',     headerName:'CVX',    width:50,  valueFormatter:p=>p.value?.toFixed(2), type:'numericColumn'},
    {field:'face',    headerName:'FACE',   width:58,  cellStyle:{color:'var(--bn-t1)'}},
    {field:'side',    headerName:'SIDE',   width:56,  cellRenderer:SideCellRenderer},
    {field:'axes',    headerName:'AXES',   width:62,  cellStyle:{color:'var(--bn-t2)',fontSize:9}},
  ] as ColDef<Bond>[],[]);

  const defaultColDef=useMemo<ColDef>(()=>({
    sortable:true,resizable:true,suppressMovable:false,
    cellStyle:{fontFamily:'JetBrains Mono,monospace',fontSize:11},
  }),[]);

  // Live ticking
  useEffect(()=>{
    const id=setInterval(()=>{
      setRowData(prev=>{
        const updates:Bond[]=[];
        const next=prev.map(b=>{
          if(Math.random()<0.22){
            const delta=(Math.random()-0.5)*0.05;
            const nb={...b,bid:+(b.bid+delta).toFixed(3),ask:+(b.ask+delta).toFixed(3)};
            updates.push(nb);
            return nb;
          }
          return b;
        });
        if(gridApiRef.current&&updates.length) gridApiRef.current.applyTransactionAsync({update:updates});
        return next;
      });
    },1200);
    return ()=>clearInterval(id);
  },[]);

  const getRowId=useCallback((p:{data:Bond})=>p.data.id,[]);

  const filteredData=useMemo(()=>rowData.filter(b=>{
    const ms=sectorFilter==='All'||b.sector===sectorFilter;
    const mq=!search||[b.ticker,b.issuer,b.cusip].some(v=>v.toLowerCase().includes(search.toLowerCase()));
    return ms&&mq;
  }),[rowData,sectorFilter,search]);

  const SECTORS=['All','Government','Financials','Technology','Healthcare','Consumer','Telecom'];

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar (no title — dock header has it) */}
      <div className="flex items-center justify-between px-3 h-7 border-b flex-shrink-0" style={{background:'var(--fi-bg1)',borderColor:'var(--fi-border)'}}>
        <div className="flex items-center gap-1.5">
          {['All','UST','Corp','Muni','Axes'].map(f=>(
            <button key={f} className="pact">{f}</button>
          ))}
          <div style={{width:1,height:14,background:'var(--fi-border2)'}}/>
          <button className="pact">↓ CSV</button>
          <button className="pact">Cols ▾</button>
        </div>
        <Badge variant="outline" className="font-mono-fi h-4 px-1.5" style={{fontSize:9,background:'var(--fi-bg3)',color:'var(--fi-t1)',borderColor:'var(--fi-border2)'}}>
          {filteredData.length}
        </Badge>
      </div>
      {/* Filters */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b flex-shrink-0" style={{background:'var(--fi-bg0)',borderColor:'var(--fi-border)'}}>
        {SECTORS.map(f=>(
          <button key={f} onClick={()=>setSectorFilter(f)}
            className="font-mono-fi px-2 py-0.5 rounded-sm border font-medium tracking-wider uppercase transition-colors"
            style={{fontSize:9,background:sectorFilter===f?'rgba(61,158,255,0.1)':'transparent',borderColor:sectorFilter===f?'var(--fi-blue)':'var(--fi-border2)',color:sectorFilter===f?'var(--fi-blue)':'var(--bn-t2)'}}>
            {f}
          </button>
        ))}
        <div className="ml-auto relative">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2" style={{color:'var(--fi-t3)'}}/>
          <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ticker / CUSIP / Issuer…"
            className="font-mono-fi h-6 pl-6 pr-2 w-44 rounded-sm" style={{background:'var(--fi-bg2)',color:'var(--fi-t0)',fontSize:11,border:'1px solid var(--fi-border2)'}}/>
        </div>
      </div>
      {/* Grid — parameter-based theming */}
      <div className="flex-1 overflow-hidden">
        <AgGridReact<Bond>
          theme={fiGridTheme}
          rowData={filteredData} columnDefs={colDefs} defaultColDef={defaultColDef}
          getRowId={getRowId} rowSelection={{mode:'singleRow'}} animateRows={true}
          onGridReady={(e:GridReadyEvent)=>{gridApiRef.current=e.api;}}
          onRowClicked={p=>p.data&&onSelectBond(p.data)}
          headerHeight={32} rowHeight={28}
        />
      </div>
    </div>
  );
}
