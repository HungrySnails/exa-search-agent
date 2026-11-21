// マイク音量のバー(マイクが実際に音を拾えているかを目で確かめるため)。

import { ACCENT_CLASSES, type Accent } from "./accent";

export function MicLevelMeter({ accent, level }: { accent: Accent; level: number }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-[11px] text-neutral-500">マイク音量</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full ${ACCENT_CLASSES[accent].meter} transition-[width] duration-75`}
          style={{ width: `${Math.min(100, (level / 0.1) * 100)}%` }}
        />
      </div>
    </div>
  );
}
