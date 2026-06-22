import { useState } from 'react';
import {
  Button, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@starui/ui';
import type { TerminalState } from '../data/types';
import { fmtPrice } from '../data/formatters';

interface DealerQuote { dealer: string; bid: number; ask: number }

const DEALERS = ['GS', 'JPM', 'MS', 'BARC'];

export interface RfqSimulatorProps {
  state: TerminalState;
}

export function RfqSimulator({ state }: RfqSimulatorProps) {
  const [instrumentId, setInstrumentId] = useState(state.instruments[0]?.id ?? '');
  const [size, setSize] = useState('5000000');
  const [quotes, setQuotes] = useState<DealerQuote[]>([]);

  const request = () => {
    const q = state.quotes[instrumentId];
    if (!q) return;
    setQuotes(
      DEALERS.map((dealer, i) => {
        const skew = (i - 1.5) * 0.012;
        return { dealer, bid: q.bid - 0.02 + skew, ask: q.ask + 0.02 + skew };
      }),
    );
  };

  const best = quotes.length ? Math.max(...quotes.map((q) => q.bid)) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        RFQ simulator
      </div>
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-col gap-1.5">
          <Label>Instrument</Label>
          <Select value={instrumentId} onValueChange={setInstrumentId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {state.instruments.map((i) => <SelectItem key={i.id} value={i.id}>{i.ticker}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rfq-size">Size</Label>
          <Input id="rfq-size" inputMode="numeric" value={size} onChange={(e) => setSize(e.target.value)} />
        </div>
        <Button variant="outline" onClick={request}>Request quotes</Button>

        {quotes.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Dealer</TableHead><TableHead className="text-right">Bid</TableHead><TableHead className="text-right">Ask</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((q) => (
                <TableRow key={q.dealer}>
                  <TableCell>{q.dealer}</TableCell>
                  <TableCell className="text-right font-[var(--ds-font-mono)]" style={{ color: q.bid === best ? 'var(--ds-accent-positive)' : undefined }}>{fmtPrice(q.bid)}</TableCell>
                  <TableCell className="text-right font-[var(--ds-font-mono)]">{fmtPrice(q.ask)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
