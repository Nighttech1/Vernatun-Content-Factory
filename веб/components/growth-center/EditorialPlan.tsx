"use client";

import { useState } from "react";
import type { EditorialView } from "@/lib/growth-center/editorial-model";
import { nextWeekKey } from "@/lib/growth-center/workspace-model";
import styles from "./editorial.module.css";

const formatDay = (value: string) => new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "short", weekday: "short", timeZone: "Europe/Moscow",
}).format(new Date(value + "T12:00:00Z"));

export function EditorialPlan({ editorial, weekKey }: { editorial: EditorialView; weekKey: string }) {
  const [period, setPeriod] = useState("week");
  const { plan } = editorial;
  const units = plan.units.map(unit => ({
    key: unit.id, date: unit.date, title: unit.title, format: unit.format_name,
    channel: unit.channels.join(", "), owner: unit.owner, action: unit.outline.join(" "),
  }));
  const announcements = (plan.announcements ?? []).map(row => ({ ...row, key: row.date + row.title }));
  const rows = [...units, ...announcements].filter(row =>
    period === "all" || row.date >= weekKey && (period === "upcoming" || row.date < nextWeekKey(weekKey))
  ).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "ru"));
  return <section className={styles.calendar} aria-label="Календарь выпусков" data-testid="growth-publication-calendar">
    <header><h2>Календарь выпусков</h2><label>Период <select value={period} onChange={event => setPeriod(event.target.value)}>
      <option value="week">Текущая неделя</option><option value="upcoming">С этой недели до конца плана</option>
      <option value="all">Весь план</option>
    </select></label></header>
    <p className={styles.status}>{period === "week" ? "Неделя с " + formatDay(weekKey) + " · " : ""}{rows.length} выпусков · редакция {plan.sequence} · МСК</p>
    {editorial.status === "stale" && <p role="status">{editorial.message}</p>}
    {editorial.conflicts.length > 0 && <p role="status">Есть локальные правки к карточкам: {editorial.conflicts.join(", ")}.</p>}
    {rows.length === 0 && <p>На этот период выпусков пока нет.</p>}
    {rows.map(row => <details key={row.key} className={styles.entry}><summary>
      <time dateTime={row.date}>{formatDay(row.date)}</time><span><b>{row.title}</b><small>{row.format} · {row.channel}</small></span>
    </summary><p>{row.action}</p><p>Ответственный — {row.owner}.</p></details>)}
  </section>;
}
