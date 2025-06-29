export interface AichainAPI {
  writeConfig(data: any): Promise<void>;
  readConfig(): Promise<any>;
}

declare global {
  interface Window {
    aichain: AichainAPI;
  }
}

export {};
