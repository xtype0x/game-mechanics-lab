export interface ExperimentManifest {
  id: string;
  title: string;
  category: string;
  status: 'preview' | 'planned';
  summary: string;
  route?: string;
}
