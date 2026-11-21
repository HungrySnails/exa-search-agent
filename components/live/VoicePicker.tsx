"use client";

// 声の選択(性別のボタン2つと、その性別の声の一覧)。

import { useState } from "react";
import {
  VOICE_CATALOG,
  VOICE_NAME as DEFAULT_VOICE_NAME,
  DEFAULT_VOICE_BY_GENDER,
} from "@/lib/live-setup";
import { ACCENT_CLASSES, type Accent } from "./accent";

type Gender = "male" | "female";

// 選んでいる性別と声の状態。性別を切り替えると、その性別の既定の声に戻す。
export function useVoiceSelection() {
  const defaultVoice =
    VOICE_CATALOG.find((v) => v.name === DEFAULT_VOICE_NAME) ?? VOICE_CATALOG[0];
  const [gender, setGender] = useState<Gender>(defaultVoice.gender);
  const [voiceName, setVoiceName] = useState(defaultVoice.name);

  function changeGender(next: Gender) {
    setGender(next);
    setVoiceName(DEFAULT_VOICE_BY_GENDER[next]);
  }

  return { gender, voiceName, changeGender, setVoiceName };
}

export function VoicePicker({
  accent,
  gender,
  voiceName,
  onGenderChange,
  onVoiceChange,
}: {
  accent: Accent;
  gender: Gender;
  voiceName: string;
  onGenderChange: (next: Gender) => void;
  onVoiceChange: (name: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex gap-2">
        {(["female", "male"] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => onGenderChange(g)}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${
              gender === g ? ACCENT_CLASSES[accent].selected : "border-neutral-700 text-neutral-400"
            }`}
          >
            {g === "female" ? "女性の声" : "男性の声"}
          </button>
        ))}
      </div>
      <select
        value={voiceName}
        onChange={(e) => onVoiceChange(e.target.value)}
        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200"
      >
        {VOICE_CATALOG.filter((v) => v.gender === gender).map((v) => (
          <option key={v.name} value={v.name}>
            {v.name} — {v.label}（{v.labelJa}）
          </option>
        ))}
      </select>
    </div>
  );
}
