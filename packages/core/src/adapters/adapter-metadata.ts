export interface AdapterMetadata {
  id: string;
  displayName: string;
  documentationUrl: string;
  fileExtensions: string[];
  pathDescription: string;
  prTitleTemplate: string;
  errorSuggestions: Partial<Record<string, string[]>>;
  noComponentHelpLines: string[];
  missingLinksHelpLines: string[];
}
