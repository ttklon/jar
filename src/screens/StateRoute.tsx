import { useEffect, useState } from "react";
import { StateScreen } from "./State";
import { stateItems, riskyCount } from "../lib/stateItems";
import type { StateItem } from "../lib/state";
import { readinessStatus } from "../ipc";
import type { ReadinessStatus } from "../ipc/types";
import { registrySnapshot } from "../ipc";

/**
 * «Состояние» спрашивает сам, а не получает готовым (шаг 1).
 *
 * Почему так. Приложение не держит готовность в общем состоянии: её спрашивает
 * тот экран, которому она нужна (так делает `Models`), и это правильно —
 * готовность меняется от скачивания, и общий кэш пришлось бы инвалидировать из
 * трёх мест. Здесь тот же подход: спросили при открытии, показали.
 *
 * Что при ошибке. Не пустота и не бесконечное «загрузка»: список строится из
 * `null`-готовности, и каждый пункт честно говорит «не проверено». Врать в
 * сторону «всё хорошо» нельзя, врать в сторону «всё плохо» — тоже.
 */
export interface StateRouteProps {
  onGo: (screen: string) => void;
}

export function StateRoute({ onGo }: StateRouteProps) {
  const [readiness, setReadiness] = useState<ReadinessStatus | null>(null);
  const [actions, setActions] = useState<number | null>(null);
  const [risky, setRisky] = useState<number | null>(null);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [items, setItems] = useState<StateItem[]>(() =>
    stateItems({ readiness: null, actions: null, risky: null, autostart: null }),
  );

  useEffect(() => {
    let alive = true;
    // Запросы параллельно: ни один не нужен для другого, и последовательность
    // только удлинила бы пустой экран.
    void (async () => {
      try {
        const status = await readinessStatus();
        if (alive) setReadiness(status);
      } catch {
        // Оставляем `null`: «не проверено» честнее выдуманного «нет».
      }
      try {
        const snapshot = await registrySnapshot();
        if (alive) {
          setActions(snapshot.actions.length);
          setRisky(riskyCount(snapshot.actions));
        }
      } catch {
        // То же: сколько умею — не знаем, так и скажем.
      }
      try {
        const { autostartStatus } = await import("../ipc");
        const state = await autostartStatus();
        if (alive) setAutostart(Boolean(state?.enabled));
      } catch {
        if (alive) setAutostart(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setItems(stateItems({ readiness, actions, risky, autostart }));
  }, [readiness, actions, risky, autostart]);

  return <StateScreen items={items} onGo={onGo} />;
}
