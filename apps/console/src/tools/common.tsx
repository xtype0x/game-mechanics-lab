import { DAMAGE_COMPONENTS, DAMAGE_TEMPLATES, checkCompat, composeRules, type Project } from "@gml/core";
import { Badge } from "@gml/ui";
import { useMemo } from "react";

export function useDamageRules(project: Project) {
  const config = project.damage.config;
  return useMemo(
    () => ({ rules: composeRules(config, DAMAGE_COMPONENTS), compat: checkCompat(config, DAMAGE_COMPONENTS, DAMAGE_TEMPLATES) }),
    [config],
  );
}

export function CompatBadge({ status }: { status: "verified" | "experimental" | "incompatible" }) {
  if (status === "verified") return <Badge tone="ok">✓ 已驗證組合</Badge>;
  if (status === "experimental") return <Badge tone="warn">◐ 實驗組合</Badge>;
  return <Badge tone="err">✕ 不相容</Badge>;
}

