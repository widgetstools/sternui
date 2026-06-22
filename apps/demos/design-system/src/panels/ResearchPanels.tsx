import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
  Badge, Card, CardContent, CardDescription, CardHeader, CardTitle,
  HoverCard, HoverCardContent, HoverCardTrigger,
  Separator, Tabs, TabsContent, TabsList, TabsTrigger,
} from '@starui/ui';

const NOTES = [
  { title: 'IG credit: spreads grind tighter', tag: 'Credit', body: 'Investment-grade spreads continue to compress into year-end as demand outpaces net supply. We favour 5–7y financials.' },
  { title: 'Duration: stay neutral', tag: 'Rates', body: 'With the curve steepening, we hold a neutral duration stance and add convexity selectively in the long end.' },
  { title: 'Energy: upgrade to overweight', tag: 'Sector', body: 'Improved free-cash-flow profiles support tighter spreads in select energy issuers.' },
];

export function ResearchPanels() {
  return (
    <div className="mx-auto flex max-w-[920px] flex-col gap-4 p-1">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {NOTES.map((n) => (
          <Card key={n.title} className="bg-[color:var(--ds-surface-primary)]">
            <CardHeader className="pb-2">
              <Badge variant="outline" className="w-fit text-[10px] text-[color:var(--ds-text-secondary)]">{n.tag}</Badge>
              <CardTitle className="text-[13px]">{n.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-[12px] text-[color:var(--ds-text-secondary)]">{n.body}</CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-[color:var(--ds-surface-primary)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-[14px]">Morning brief</CardTitle>
          <CardDescription>
            Coverage on{' '}
            <HoverCard>
              <HoverCardTrigger className="cursor-default underline underline-offset-2">AAPL</HoverCardTrigger>
              <HoverCardContent className="text-[12px]">Apple Inc — AA+ · Technology · 3.25% 2030 · OAS ~62bp</HoverCardContent>
            </HoverCard>{' '}
            and{' '}
            <HoverCard>
              <HoverCardTrigger className="cursor-default underline underline-offset-2">JPM</HoverCardTrigger>
              <HoverCardContent className="text-[12px]">JPMorgan — A- · Financials · 4.25% 2027</HoverCardContent>
            </HoverCard>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="summary">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="pt-2 text-[12px] text-[color:var(--ds-text-secondary)]">
              Risk sentiment is constructive; credit carries well into the close.
            </TabsContent>
            <TabsContent value="details" className="pt-2 text-[12px] text-[color:var(--ds-text-secondary)]">
              Primary issuance light; secondary liquidity healthy across IG. Watch month-end index extension.
            </TabsContent>
          </Tabs>
          <Separator className="my-3" />
          <Accordion type="single" collapsible>
            <AccordionItem value="t1"><AccordionTrigger>Credit themes</AccordionTrigger><AccordionContent className="text-[12px] text-[color:var(--ds-text-secondary)]">Dispersion compressing; quality bid persists.</AccordionContent></AccordionItem>
            <AccordionItem value="t2"><AccordionTrigger>Rates outlook</AccordionTrigger><AccordionContent className="text-[12px] text-[color:var(--ds-text-secondary)]">Bull steepener base case; data-dependent.</AccordionContent></AccordionItem>
            <AccordionItem value="t3"><AccordionTrigger>Supply pipeline</AccordionTrigger><AccordionContent className="text-[12px] text-[color:var(--ds-text-secondary)]">~$25bn IG expected next week, financials-led.</AccordionContent></AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
