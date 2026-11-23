import { useEffect, useState } from "react";
import { StateScreen } from "./State";
import { stateItems, riskyCount } from "../lib/stateItems";
import type { StateItem } from "../lib/state";
import { readinessStatus } from "../ipc";
import { decide, readFacts, type PlatformVerdict } from "../lib/platform";
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
  // Система спрашивается у неё самой, а не предполагается (шаг 17).
  const [platform, setPlatform] = useState<PlatformVerdict | null>(null);
  const [items, setItems] = useState<StateItem[]>(() =>
    stateItems({ readiness: null, actions: null, risky: null, autostart: null, platform: null }),
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
        // Факты читаются из движка, а не из наших догадок: `readFacts` смотрит
        // `navigator`, `decide` применяет пороги. Ошибка чтения — `unknown`, а не
        // «всё плохо»: незнание не приговор.
        setPlatform(decide(readFacts(globalThis.navigator)));
      } catch {
        if (alive) setPlatform(null);
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
    setItems(stateItems({ readiness, actions, risky, autostart, platform }));
  }, [readiness, actions, risky, autostart, platform]);

  return <StateScreen items={items} onGo={onGo} />;
}
