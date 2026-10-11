/** Core v2 contracts. Canonical schema 10 payloads retain unknown fields and opaque ciphertext. */
export type BusinessStore = 'beans' | 'beanSummaries' | 'brewSessions' | 'sensoryRecords' |
  'inventoryEvents' | 'settings' | 'customCodes' | 'codebookCache' | 'syncMetadata' |
  'shareDrafts' | 'historyRevisions' | 'recycleBin' | 'syncOutbox';
export type NativeLocalStore = BusinessStore | 'migrationSnapshots' | 'beanThumbnails' | 'platformPreferences';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface RecordPayload { id?: string; code?: string; [key: string]: Json | undefined; }
export interface StoreChanges {
  clearStores: NativeLocalStore[];
  deletes: Array<{ store: NativeLocalStore; key: string }>;
  puts: Array<{ store: NativeLocalStore; value: RecordPayload }>;
}
export interface NativeStore {
  get(store: NativeLocalStore, key: string): Promise<RecordPayload | null>;
  all(store: NativeLocalStore): Promise<RecordPayload[]>;
  allByBean(store: NativeLocalStore, beanId: string): Promise<RecordPayload[]>;
  put(store: NativeLocalStore, value: RecordPayload): Promise<void>;
  bulkPut(store: NativeLocalStore, values: RecordPayload[]): Promise<void>;
  remove(store: NativeLocalStore, key: string): Promise<void>;
  clear(store: NativeLocalStore): Promise<void>;
  applyChanges(changes: StoreChanges): Promise<void>; // all-or-nothing; rejects on any invalid row
  replaceStores(stores: Partial<Record<NativeLocalStore, RecordPayload[]>>): Promise<void>;
}
export interface Platform {
  isNetworkAvailable(): Promise<boolean> | boolean;
  bindImageSource(imageId: string, includePreview: boolean): Promise<string> | string;
  recognizeImage(requestId: string, imageId: string, role: string, dataUrl: string): void;
  saveFile(base64: string, filename: string, mimeType: string): void;
  prepareBrewExecution(payload: string): void;
  startBrewExecution(payload: string): void;
  pauseBrewExecution(): void;
  resumeBrewExecution(): void;
  cancelBrewExecution(): void;
  announceBrewPreparation(text: string): void;
  setBrewScreenAwake(enabled: boolean): void;
  switchEngine(engine: 'webview' | 'gecko'): void;
  exitApp(): void;
}
