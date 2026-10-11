import type { Project } from "@gml/core";
import { ActionOrder as SharedActionOrder, BatchSim as SharedBatchSim, Section } from "@gml/ui";
import type { Updater } from "../../useProject";
import { EncounterBar } from "./common";

// Console layouts for the shared simulators: encounter picker on top, large batches allowed.

const encounter = (project: Project, update: Updater) => <Section title="戰鬥設定"><EncounterBar project={project} update={update} /></Section>;

export function ActionOrder({ project, update }: { project: Project; update: Updater }) {
  return <div className="tool-layout"><SharedActionOrder project={project} update={update} before={encounter(project, update)} /></div>;
}

export function BatchSim({ project, update }: { project: Project; update: Updater }) {
  return <div className="tool-layout"><SharedBatchSim project={project} update={update} maxRuns={20000} defaultRuns={300} chunk={8} before={encounter(project, update)} /></div>;
}
