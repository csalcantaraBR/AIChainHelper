import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import fs from 'fs';

export interface HardwareInfo {
  gpuModel: string;
  vram: number;
  ram: number;
  location: string;
}

export class AiChainAPI {
  private client: AxiosInstance;

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: 'https://api.aichain.io',
      headers: {
        'X-API-Key': apiKey,
      },
    });
  }

  private async requestWithBackoff<T>(fn: () => Promise<AxiosResponse<T>>): Promise<T> {
    const maxAttempts = 5;
    let delay = 1000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fn();
        return res.data;
      } catch (err) {
        const axiosErr = err as AxiosError;
        const status = axiosErr.response?.status;
        const isNetworkErr = !axiosErr.response || (axiosErr.code && axiosErr.code.startsWith('ECONN'));
        const shouldRetry = attempt < maxAttempts && (isNetworkErr || (status !== undefined && status >= 500));
        if (!shouldRetry) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 32000);
      }
    }
    throw new Error('Max retry attempts reached');
  }

  registerNode(hw: HardwareInfo) {
    return this.requestWithBackoff(() => this.client.post('/api/v1/nodes', hw));
  }

  heartbeat(nodeId: string, status: 'idle' | 'busy') {
    return this.requestWithBackoff(() =>
      this.client.post(`/api/v1/nodes/${encodeURIComponent(nodeId)}/heartbeat`, { status })
    );
  }

  pollJob(nodeId: string) {
    return this.requestWithBackoff(() =>
      this.client.get('/api/v1/jobs/assigned', { params: { node_id: nodeId } })
    );
  }

  reportComplete(jobId: string, payload: any) {
    return this.requestWithBackoff(() =>
      this.client.post(`/api/v1/jobs/${encodeURIComponent(jobId)}/complete`, payload)
    );
  }

  reportFail(jobId: string, logTail: string) {
    return this.requestWithBackoff(() =>
      this.client.post(`/api/v1/jobs/${encodeURIComponent(jobId)}/fail`, { logTail })
    );
  }
}

export async function getLogTail(lines: number, filePath: string): Promise<string> {
  const data = await fs.promises.readFile(filePath, 'utf8');
  const parts = data.split(/\r?\n/).filter((p) => p.length > 0);
  return parts.slice(-lines).join('\n');
}
