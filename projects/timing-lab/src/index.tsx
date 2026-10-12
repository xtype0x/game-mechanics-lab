import type { MountProject } from "@gml/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Shell } from "./shell/Shell";
import "@gml/ui/timing.css";
import "./styles.css";

/** Package entry: the host page calls this with its root element (see ProjectHost in @gml/ui). */
export const mount: MountProject = (el, host) => {
  createRoot(el).render(
    <StrictMode>
      <Shell {...(host ? { host } : {})} />
    </StrictMode>,
  );
};
