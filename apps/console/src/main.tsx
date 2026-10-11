import { loadProject } from "@gml/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Demo } from "./demo/Demo";
import "./styles.css";
import "./battle.css";
import "./editors.css";

/** Set by an exported demo file: play-only mode with the embedded project, no console. */
const embedded = (window as { __GGT_DEMO__?: unknown }).__GGT_DEMO__;

createRoot(document.getElementById("root")!).render(
  <StrictMode>{embedded ? <Demo project={loadProject(embedded)} /> : <App />}</StrictMode>,
);
