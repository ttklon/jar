import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  makeStyles,
  Spinner,
  Text,
  tokens,
} from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { downloadModel, isTauri, listModels, removeModel, verifyModel } from "../ipc";
import type { Downloaded, HashCheck, ModelFile, ModelsView } from "../ipc";
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
  download: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    maxWidth: "110ch",
  },
  form: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  summary: {
    display: "flex",
    gap: "14px",
    alignItems: "center",
    flexWrap: "wrap",
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
  },
  rowActions: { display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" },
  remove: { color: tokens.colorPaletteRedForeground2 },
  wide: { flex: "3 1 340px", minWidth: "220px" },
  mid: { flex: "1 1 200px", minWidth: "160px" },
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
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [sha, setSha] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState<Downloaded | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ModelFile | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

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

  const confirmRemove = useCallback(() => {
    const file = removing;
    if (file === null) return;

    setRemoveError(null);
    removeModel(file.name)
      .then(() => {
        setRemoving(null);
        load();
      })
      .catch((reason: unknown) =>
        setRemoveError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, [removing, load]);


  const startDownload = useCallback(() => {
    const trimmedUrl = url.trim();
    const trimmedName = name.trim();

    if (trimmedUrl.length === 0) {
      setDownloadError(text.download.missingUrl);
      return;
    }
    if (!trimmedName.toLowerCase().endsWith(".gguf")) {
      setDownloadError(text.download.missingName);
      return;
    }

    setDownloading(true);
    setDownloadError(null);
    setDone(null);
    downloadModel(trimmedUrl, trimmedName, sha.trim() || undefined)
      .then((result) => {
        setDone(result);
        // Список перечитывается: хеш пришёл из памяти, и таблица должна его показать.
        load();
      })
      .catch((reason: unknown) =>
        setDownloadError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setDownloading(false));
  }, [url, name, sha, load]);

  return (
    <div className={styles.root}>
      <Text as="h1" size={700}>
        {text.title}
      </Text>
      <Text className={styles.lead}>{text.lead}</Text>

      <section className={styles.download}>
        <Text as="h2" size={500}>
          {text.download.title}
        </Text>
        <Text className={styles.note}>{text.download.lead}</Text>
        <div className={styles.form}>
          <Input
            className={styles.wide}
            value={url}
            placeholder={text.download.urlPlaceholder}
            aria-label={text.download.url}
            onChange={(_, data) => setUrl(data.value)}
          />
          <Input
            className={styles.mid}
            value={name}
            placeholder={text.download.namePlaceholder}
            aria-label={text.download.name}
            onChange={(_, data) => setName(data.value)}
          />
          <Input
            className={styles.mid}
            value={sha}
            placeholder={text.download.shaPlaceholder}
            aria-label={text.download.sha}
            onChange={(_, data) => setSha(data.value)}
          />
          <Button appearance="primary" disabled={downloading} onClick={startDownload}>
            {downloading ? text.download.running : text.download.start}
          </Button>
        </div>
        {downloadError ? (
          <Text className={styles.error}>
            {text.download.error}: {downloadError}
          </Text>
        ) : null}
        {done ? (
          <Text className={styles.ok}>
            {done.verified
              ? text.download.doneVerified(size(done.bytes))
              : text.download.doneUnverified(size(done.bytes))}
            {" · "}
            <span className={styles.mono}>{done.sha256.slice(0, 12)}</span>
          </Text>
        ) : null}
      </section>

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
              <>
                <Text className={styles.note}>{text.count(view.items.length)}</Text>
                <Text className={styles.note}>{text.used(size(view.total_bytes))}</Text>
                <Text className={styles.note}>
                  {view.free_bytes === null
                    ? text.freeUnknown
                    : text.free(size(view.free_bytes))}
                </Text>
              </>
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
                        <div className={styles.action}>
                          <div className={styles.rowActions}>
                            {file.ok ? (
                              <Button
                                size="small"
                                disabled={busy[file.name] === true}
                                onClick={() => verify(file.name)}
                              >
                                {busy[file.name] ? text.verifying : text.verify}
                              </Button>
                            ) : null}
                            <Button
                              size="small"
                              appearance="subtle"
                              className={styles.remove}
                              onClick={() => {
                                setRemoveError(null);
                                setRemoving(file);
                              }}
                            >
                              {text.remove}
                            </Button>
                          </div>
                        </div>
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

      <Dialog
        open={removing !== null}
        onOpenChange={(_, data) => {
          if (!data.open) setRemoving(null);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{text.removeTitle}</DialogTitle>
            <DialogContent>
              <Text block>{text.removeLead}</Text>
              <Text block weight="semibold">
                {removing?.name} · {size(removing?.size_bytes ?? 0)}
              </Text>
              {removeError ? (
                <Text block className={styles.error}>
                  {text.removeError}: {removeError}
                </Text>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setRemoving(null)}>
                {text.removeCancel}
              </Button>
              <Button appearance="primary" onClick={confirmRemove}>
                {text.removeConfirm}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
