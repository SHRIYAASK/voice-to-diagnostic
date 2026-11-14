import { Snowflake, Refrigerator, WashingMachine, Microwave, Utensils } from 'lucide-react';

export function ApplianceGlyph({ id, className = 'w-5 h-5' }: { id?: string; className?: string }) {
  const p = { className, strokeWidth: 1.75, 'aria-hidden': true } as const;
  switch (id) {
    case 'refrigerator':
      return <Refrigerator {...p} />;
    case 'washing-machine':
      return <WashingMachine {...p} />;
    case 'microwave':
      return <Microwave {...p} />;
    case 'dishwasher':
      return <Utensils {...p} />;
    default:
      return <Snowflake {...p} />;
  }
}
