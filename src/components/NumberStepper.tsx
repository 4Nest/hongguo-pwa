import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 数字步进器：- [值] + ，值允许为空（表示不设置） */
export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 999,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const step = (d: number) => onChange(String(clamp((Number(value) || 0) + d)));
  return (
    <div className="flex h-9 items-center rounded-md border border-input bg-transparent">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-full w-8 rounded-r-none"
        onClick={() => step(-1)}
        tabIndex={-1}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          if (e.target.value === "") return onChange("");
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(String(clamp(n)));
        }}
        className="h-full w-14 border-x border-input bg-transparent text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-full w-8 rounded-l-none"
        onClick={() => step(1)}
        tabIndex={-1}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
