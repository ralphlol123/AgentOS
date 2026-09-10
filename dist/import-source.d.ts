export interface ImportSource {
    source: string;
    content: string;
    sha256: string;
}
export interface FetchLimits {
    timeoutMs?: number;
    maxRedirects?: number;
    maxBytes?: number;
}
export declare function fetchTemplateText(source: string, limits?: FetchLimits): Promise<string>;
export declare function readImportSource(source: string): Promise<ImportSource>;
