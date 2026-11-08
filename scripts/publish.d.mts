export function assertSource(source: string, expected?: string): string;
export function listPlugins(source: string): { name: string; version: string; description: string; published: boolean }[];
export function writeReceipt(source: string, expected?: string): void;
export function receiptPath(source: string): string;
