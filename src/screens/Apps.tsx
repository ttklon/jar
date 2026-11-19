import { useEffect, useMemo, useState } from "react";
import { Field, Input, makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { listProfiles } from "../ipc";
import type { ProfileView } from "../ipc";
import { apps } from "../i18n/ru";
import { ProfileCard } from "../components/ProfileCard";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px" },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "78ch" },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  list: { display: "flex", flexDirection: "column", gap: "12px" },
  center: { display: "flex", gap: "10px", alignItems: "center", color: tokens.colorNeutralForeground2 },
  error: { color: tokens.colorPaletteRedForeground2 },
  search: { maxWidth: "420px" },
});

export function Apps() {
  const styles = useStyles();
  const [profiles, setProfiles] = useState<ProfileView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    listProfiles()
      .then((data) => {
        if (alive) setProfiles(data);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => {
    const list = profiles ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (profile) =>
        profile.app.toLowerCase().includes(needle) ||
        profile.exe.some((name) => name.toLowerCase().includes(needle)) ||
        profile.slug.includes(needle),
    );
  }, [profiles, query]);

  const totals = useMemo(() => {
    const list = profiles ?? [];
    return {
      apps: list.length,
      ops: list.reduce((sum, profile) => sum + profile.operations.length, 0),
      executable: list.reduce((sum, profile) => sum + profile.executable, 0),
    };
  }, [profiles]);

  return (
    <div className={styles.root}>
      <div>
        <Text as="h2" size={700} weight="semibold">
          {apps.title}
        </Text>
        <Text className={styles.lead} block>
          {apps.lead}
        </Text>
      </div>

      {error ? <Text className={styles.error}>{`${apps.loadError}: ${error}`}</Text> : null}

      {profiles === null && !error ? (
        <div className={styles.center}>
          <Spinner size="tiny" />
          <Text>{apps.count(0)}</Text>
        </div>
      ) : null}

      {profiles ? (
        <>
          <Text className={styles.note} block>
            {apps.count(totals.apps)} · {apps.operations(totals.ops)} ·{" "}
            {apps.executable(totals.executable)}
          </Text>

          <Field className={styles.search} label={apps.search}>
            <Input value={query} onChange={(_, data) => setQuery(data.value)} />
          </Field>

          <Text className={styles.note} block>
            {apps.found(shown.length, profiles.length)}
          </Text>

          {shown.length === 0 ? (
            <Text className={styles.note} block>
              {apps.empty}
            </Text>
          ) : (
            <div className={styles.list}>
              {shown.map((profile) => (
                <ProfileCard key={profile.slug} profile={profile} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
