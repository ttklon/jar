import { useCallback, useEffect, useState } from "react";
import { Button, makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { isTauri, listModels, verifyModel } from "../ipc";
import type { HashCheck, ModelsView } from "../ipc";
import { models as text } from "../i18n/ru";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px" },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "78ch" },
  note: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    maxWidth: "78ch",
  },
  bar: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" },
  dir: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    overflowWrap: "anywhere",
  },
  center: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    color: tokens.colorNeutralForeground2,
  },
  error: { color: tokens.colorPaletteRedForeground2, maxWidth: "78ch" },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: tokens.fontSizeBase200,
    maxWidth: "110ch",
  },
  head: {
    textAlign: "left",
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "6px 10px 6px 0",
  },
  cell: {
    padding: "8px 10px 8px 0",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    verticalAlign: "top",
  },
  name: { fontFamily: tokens.fontFamilyMonospace, overflowWrap: "anywhere" },
  mono: { fontFamily: tokens.fontFamilyMonospace },
  ok: { color: tokens.colorPaletteGreenForeground2 },
  broken: { color: tokens.colorPaletteRedForeground2 },
  changed: { color: tokens.colorPaletteDarkOrangeForeground2 },
  action: { marginTop: "4px" },
});

/** Вердикт сверки человеческим языком. Неизвестный вердикт не выдумываем. */
function verdictText(verdict: string): string {
  const known = text.verdict as Record<string, string>;
  return known[verdict] ?? verdict;
}

/** Размер в гигабайтах: модели измеряются ими, а не байтами. */
function size(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
}

export function Models() {
  const styles = useStyles();
  const [view, setView] = useState<ModelsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Результат сверки — по имени файла: у каждой строки свой ответ.
  const [checks, setChecks] = useState<Record<string, HashCheck | { error: string }>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const verify = useCallback((name: string) => {
    setBusy((current) => ({ ...current, [name]: true }));
    verifyModel(name)
      .then((check) => setChecks((current) => ({ ...current, [name]: check })))
      .catch((reason: unknown) =>
        setChecks((current) => ({
          ...current,
          [name]: { error: reason instanceof Error ? reason.message : String(reason) },
        })),
      )
      .finally(() => setBusy((current) => ({ ...current, [name]: false })));
  }, []);

  const load = useCallback(() => {
    setError(null);
    listModels()
      .then(setView)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, []);

  useEffect(load, [load]);

  return (
    <div className={styles.root}>
      <Text as="h1" size={700}>
        {text.title}
      </Text>
      <Text className={styles.lead}>{text.lead}</Text>

      {error ? (
        <Text className={styles.error}>
          {text.loadError}: {error}
        </Text>
      ) : view === null ? (
        <div className={styles.center}>
          <Spinner size="tiny" />
        </div>
      ) : (
        <>
          <div className={styles.bar}>
            <Button icon={<ArrowClockwiseRegular />} onClick={load}>
              {text.reload}
            </Button>
            {view.items.length > 0 ? (
              <Text className={styles.note}>{text.count(view.items.length)}</Text>
            ) : null}
          </div>

          {view.dir ? (
            <Text className={styles.dir}>
              {text.dir}: {view.dir}
            </Text>
          ) : null}

          {!isTauri() ? <Text className={styles.note}>{text.browserNote}</Text> : null}

          {view.error ? (
            <Text className={styles.error}>{view.error}</Text>
          ) : view.items.length === 0 ? (
            !isTauri() ? null : <Text className={styles.note}>{text.empty}</Text>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.head}>{text.columns.name}</th>
                  <th className={styles.head}>{text.columns.size}</th>
                  <th className={styles.head}>{text.columns.arch}</th>
                  <th className={styles.head}>{text.columns.quant}</th>
                  <th className={styles.head}>{text.columns.version}</th>
                  <th className={styles.head}>{text.columns.tensors}</th>
                  <th className={styles.head}>{text.columns.hash}</th>
                  <th className={styles.head}>{text.columns.state}</th>
                </tr>
              </thead>
              <tbody>
                {view.items.map((file) => {
                  const check = checks[file.name];
                  const hash = check && "actual" in check ? check.actual : file.hash;
                  return (
                    <tr key={file.name}>
                      <td className={`${styles.cell} ${styles.name}`}>{file.name}</td>
                      <td className={`${styles.cell} ${styles.mono}`}>{size(file.size_bytes)}</td>
                      <td className={`${styles.cell} ${styles.mono}`}>
                        {file.architecture ?? "—"}
                      </td>
                      <td className={`${styles.cell} ${styles.mono}`}>{file.quant ?? "—"}</td>
                      <td className={`${styles.cell} ${styles.mono}`}>{file.version ?? "—"}</td>
                      <td className={`${styles.cell} ${styles.mono}`}>{file.tensors ?? "—"}</td>
                      <td className={`${styles.cell} ${styles.mono}`} title={hash ?? undefined}>
                        {hash ? hash.slice(0, 12) : text.neverHashed}
                      </td>
                      <td className={styles.cell}>
                        {file.ok ? (
                          <span className={styles.ok}>{text.ok}</span>
                        ) : (
                          <span className={styles.broken}>
                            {text.broken}: {file.note}
                          </span>
                        )}
                        {file.ok ? (
                          <div className={styles.action}>
                            <Button
                              size="small"
                              disabled={busy[file.name] === true}
                              onClick={() => verify(file.name)}
                            >
                              {busy[file.name] ? text.verifying : text.verify}
                            </Button>
                          </div>
                        ) : null}
                        {check ? (
                          <div className={styles.action}>
                            {"error" in check ? (
                              <span className={styles.broken}>
                                {text.hashError}: {check.error}
                              </span>
                            ) : (
                              <span
                                className={
                                  check.verdict === "changed" ? styles.changed : styles.ok
                                }
                              >
                                {verdictText(check.verdict)}
                              </span>
                            )}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <Text className={styles.note}>{text.hashNote}</Text>
          <Text className={styles.note}>{text.envHint}</Text>
        </>
      )}
    </div>
  );
}
