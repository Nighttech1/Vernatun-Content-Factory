"use client";

import { useEffect, useState } from "react";
import {
  MESH_PIPELINE_LABELS,
  isMeshPipelineId,
} from "@/lib/mesh-roles";
import {
  DEFAULT_SCOUT_SEARCH,
  readScoutSearchForAgent,
  writeScoutSearchForAgent,
  type ScoutSearchConfig,
} from "@/lib/settings/scout-search-config";

type ScoutInspectorSettingsProps = {
  pipelineId: string;
  agentId: string;
};

export function ScoutInspectorSettings({
  pipelineId,
  agentId,
}: ScoutInspectorSettingsProps) {
  const [cfg, setCfg] = useState<ScoutSearchConfig>(DEFAULT_SCOUT_SEARCH);
  const [saved, setSaved] = useState(false);
  const moduleLabel = isMeshPipelineId(pipelineId)
    ? MESH_PIPELINE_LABELS[pipelineId]
    : pipelineId;

  useEffect(() => {
    const stored = readScoutSearchForAgent(pipelineId, agentId);
    setCfg({
      ...stored,
      contentTypes: [pipelineId],
    });
  }, [pipelineId, agentId]);

  function save() {
    writeScoutSearchForAgent(pipelineId, agentId, {
      ...cfg,
      contentTypes: [pipelineId],
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  const platformOptions = [
    { id: "instagram", label: "Instagram" },
    { id: "tiktok", label: "TikTok" },
    { id: "youtube", label: "YouTube" },
    { id: "telegram", label: "Telegram" },
  ] as const;

  function togglePlatform(id: string) {
    const has = cfg.platforms.includes(id);
    setCfg({
      ...cfg,
      platforms: has
        ? cfg.platforms.filter((p) => p !== id)
        : [...cfg.platforms, id],
    });
  }

  const domains: Record<string, string> = { instagram: "instagram.com", tiktok: "tiktok.com", youtube: "youtube.com", telegram: "t.me" };
  const sources = platformOptions.filter(({ id }) => cfg.platforms.includes(id)).map(({id}) => "site:" + domains[id]);
  const query = [cfg.defaultTopic.trim() || "армянский разговорный клуб", sources.length ? "(" + sources.join(" OR ") + ")" : ""].join(" ").trim();
  const searchUrl = "https://www.google.com/search?" + new URLSearchParams({ q: query });

  return (
    <section
      data-testid="scout-inspector-settings"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
          Параметры разведки
        </h3>
        <p className="text-[11px] text-[var(--text-muted)]">
          Открытые публикации по теме модуля «{moduleLabel}».
        </p>
      </div>

      <fieldset data-testid="scout-inspector-platforms">
        <legend className="mb-2 font-[family-name:var(--font-ui)] text-xs font-semibold text-[var(--accent-blue-bright)]">
          Площадки
        </legend>
        <ul className="flex flex-wrap gap-2">
          {platformOptions.map((p) => {
            const on = cfg.platforms.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  data-testid={`scout-inspector-platform-${p.id}`}
                  onClick={() => togglePlatform(p.id)}
                  className={
                    on
                      ? "rounded-lg border border-[color-mix(in_srgb,var(--accent-blue)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-blue)_16%,transparent)] px-2.5 py-1.5 text-xs font-medium text-[var(--accent-blue-bright)]"
                      : "rounded-lg border border-[var(--border-glass)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-muted)]"
                  }
                >
                  {p.label}
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="font-[family-name:var(--font-ui)] text-xs font-semibold text-[var(--accent-blue-bright)]">
          Тема / ниша
        </span>
        <input
          data-testid="scout-inspector-topic"
          value={cfg.defaultTopic}
          onChange={(e) => setCfg({ ...cfg, defaultTopic: e.target.value })}
          className="rounded-lg border border-[var(--border-glass)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
          placeholder="например: армянская кухня"
        />
      </label>

      <button
        type="button"
        data-testid="scout-inspector-save"
        onClick={save}
        className="self-start rounded-lg border border-[var(--border-glass)] bg-[color-mix(in_srgb,var(--accent-gold)_14%,transparent)] px-3 py-2 text-sm font-semibold text-[var(--accent-gold)]"
      >
        {saved ? "Сохранено" : "Сохранить параметры разведки"}
      </button>

      <a data-testid="scout-razvedat" href={searchUrl} target="_blank" rel="noreferrer"
        className="self-start rounded-xl bg-[var(--accent-blue)] px-4 py-3 text-sm font-bold text-white">
        Искать в браузере ↗
      </a>
    </section>
  );
}
