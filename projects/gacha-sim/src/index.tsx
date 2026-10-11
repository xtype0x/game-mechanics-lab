import type { MountProject } from "@gml/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./stage.css";

/** Package entry: the host page calls this with its root element (see ProjectHost in @gml/ui). */
export const mount: MountProject = (el, host) => {
  createRoot(el).render(
    <StrictMode>
      <App {...(host ? { host } : {})} />
    </StrictMode>,
  );
};
