import { useState } from 'react';
import {
  Button, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger,
  ToggleGroup, ToggleGroupItem,
} from '@starui/ui';
import type { Instrument, Quote } from '../data/types';

export interface TradeTicketProps {
  instrument: Instrument;
  quote: Quote;
}

export function TradeTicket({ instrument, quote }: TradeTicketProps) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qty, setQty] = useState('1000000');
  const [price, setPrice] = useState(quote.mid.toFixed(3));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button className="w-full" data-testid="open-ticket">Trade {instrument.ticker.split(' ')[0]}</Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>Trade ticket</SheetTitle>
          <SheetDescription>{instrument.description}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Side</Label>
            <ToggleGroup type="single" value={side} onValueChange={(v) => v && setSide(v as 'buy' | 'sell')} className="justify-start">
              <ToggleGroupItem value="buy" className="px-6">Buy</ToggleGroupItem>
              <ToggleGroupItem value="sell" className="px-6">Sell</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tt-qty">Quantity (face)</Label>
            <Input id="tt-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tt-price">Limit price</Label>
            <Input id="tt-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Settlement</Label>
            <Select defaultValue="t1">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="t1">T+1</SelectItem>
                <SelectItem value="t2">T+2</SelectItem>
                <SelectItem value="t3">T+3</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter>
          <Button
            className="w-full"
            variant={side === 'sell' ? 'destructive' : 'default'}
            onClick={() => setOpen(false)}
          >
            Submit {side === 'buy' ? 'Buy' : 'Sell'} {Number(qty).toLocaleString('en-US')} @ {price}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
