import { useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { ChevronDownRegular, ChevronUpRegular } from "@fluentui/react-icons";
import type { ProfileView } from "../ipc";
import { apps } from "../i18n/ru";
import { RiskBadge } from "./RiskBadge";

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  head: { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" },
  title: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400 },
  meta: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  ops: { display: "flex", flexDirection: "column", gap: "4px", margin: 0, padding: 0 },
  op: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "10px",
    alignItems: "baseline",
    padding: "6px 8px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  opName: { fontSize: tokens.fontSizeBase300 },
  opMeta: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100 },
  hasTool: { color: tokens.colorPaletteGreenForeground2, fontSize: tokens.fontSizeBase100 },
  noTool: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100 },
});

export function ProfileCard({ profile }: { profile: ProfileView }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div>
          <div className={styles.title}>{profile.app}</div>
          {profile.exe.length > 0 ? (
            <Text className={styles.mono} block>
              {profile.exe.join(", ")}
            </Text>
          ) : null}
          <Text className={styles.meta} block>
            {apps.kind[profile.kind] ?? profile.kind} · {apps.stack}: {profile.ui_stack} ·{" "}
            {apps.anchors(profile.anchors)} · {apps.verified(profile.verified_at)}
          </Text>
        </div>
        <Text className={styles.meta}>
          {apps.operations(profile.operations.length)}
          {profile.executable > 0 ? ` · ${apps.executable(profile.executable)}` : ""}
        </Text>
      </div>

      <div>
        <Button
          appearance="subtle"
          size="small"
          icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? apps.hideOps : apps.showOps(profile.operations.length)}
        </Button>
      </div>

      {open ? (
        <div className={styles.ops}>
          {profile.operations.map((operation) => (
            <div key={`${operation.registry}-${operation.name}`} className={styles.op}>
              <span>
                <span className={styles.opName}>{operation.name}</span>
                <Text className={styles.opMeta} block>
                  {operation.registry}
                  {operation.resolved && operation.resolved !== operation.registry
                    ? ` → ${operation.resolved}`
                    : ""}
                </Text>
                <Text
                  className={operation.has_tool ? styles.hasTool : styles.noTool}
                  block
                >
                  {operation.has_tool ? apps.hasTool : apps.noTool} · {operation.decision_reason}
                </Text>
              </span>
              {operation.risk === "unknown" ? (
                <Text className={styles.noTool}>{apps.unknownRisk}</Text>
              ) : (
                <RiskBadge risk={operation.risk} />
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
