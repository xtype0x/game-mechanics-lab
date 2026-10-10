/** Future experiment contracts; no production persistence adapter is enabled yet. */
export interface ExperimentManifest {
  id: string;
  title: string;
  category: string;
  status: 'preview' | 'planned';
  summary: string;
  route?: string;
  ruleVersion?: string;
}

export interface SaveEnvelope<T = unknown> {
  schemaVersion: number;
  experimentId: string;
  engineVersion: string;
  ruleVersion: string;
  seed: string;
  updatedAt: string;
  payload: T;
}

/** Keep UI independent of browser storage / future HTTP API. Validate on load. */
export interface SaveRepository {
  load(experimentId: string, slotId: string): Promise<SaveEnvelope | null>;
  save(slotId: string, data: SaveEnvelope): Promise<void>;
  remove(experimentId: string, slotId: string): Promise<void>;
}
