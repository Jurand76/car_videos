"use client";

type CenteredRangeSliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  leftHint?: string;
  rightHint?: string;
  onChange: (value: number) => void;
};

const SNAP_THRESHOLD = 0.012;

function snapNearZero(value: number): number {
  return Math.abs(value) < SNAP_THRESHOLD ? 0 : value;
}

export function CenteredRangeSlider({
  label,
  value,
  min,
  max,
  step = 0.01,
  disabled,
  leftHint,
  rightHint,
  onChange,
}: CenteredRangeSliderProps) {
  const isZero = Math.abs(value) < SNAP_THRESHOLD;

  function setValue(next: number) {
    onChange(snapNearZero(next));
  }

  return (
    <div className="text-sm font-medium text-slate-800">
      <span>
        {label} ({value.toFixed(2)})
      </span>

      <div className="relative mt-2 h-8">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(Number(e.target.value))}
          className="absolute inset-x-0 top-1/2 z-10 w-full -translate-y-1/2 accent-brand-600"
        />
        <button
          type="button"
          disabled={disabled}
          title="Wyzeruj (0)"
          aria-label={`Wyzeruj ${label.toLowerCase()}`}
          onClick={() => setValue(0)}
          className={`absolute left-1/2 top-1/2 z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-md transition ${
            isZero
              ? "border-brand-600 bg-brand-600 ring-2 ring-brand-300"
              : "border-slate-500 bg-white hover:scale-110 hover:border-brand-600 hover:bg-brand-100"
          } disabled:cursor-not-allowed disabled:opacity-40`}
        />
      </div>

      {(leftHint || rightHint) && (
        <span className="mt-1 flex justify-between text-xs font-normal text-slate-500">
          <span>{leftHint}</span>
          <span>{rightHint}</span>
        </span>
      )}
    </div>
  );
}
