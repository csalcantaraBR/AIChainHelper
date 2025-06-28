import { promisify } from 'util';
import { exec as execCb } from 'child_process';
import si from 'systeminformation';
import axios from 'axios';

const exec = promisify(execCb);

export interface HardwareInfo {
  gpuModel: string;
  vram: number; // GB
  ram: number; // GB
  location: string;
}

export async function detectHardware(): Promise<HardwareInfo> {
  let gpuModel = 'CPU-only';
  let vram = 0;

  try {
    const { stdout } = await exec(
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader'
    );
    const line = stdout.trim().split(/\r?\n/)[0];
    if (line) {
      const [name, mem] = line.split(',').map((p) => p.trim());
      gpuModel = name;
      const match = mem.match(/(\d+(?:\.\d+)?)\s*MiB/i);
      if (match) {
        vram = Math.round(parseFloat(match[1]) / 1024);
      }
    }
  } catch (_) {
    try {
      const graphics = await si.graphics();
      if (graphics.controllers.length > 0) {
        const controller = graphics.controllers[0];
        gpuModel = controller.model || 'CPU-only';
        if (controller.vram) {
          vram = Math.round(controller.vram / 1024);
        } else if (controller.memoryTotal) {
          vram = Math.round(controller.memoryTotal / 1024);
        }
      }
    } catch (_) {
      // ignore errors and keep defaults
    }
  }

  if (!gpuModel) {
    gpuModel = 'CPU-only';
    vram = 0;
  }

  try {
    const mem = await si.mem();
    const ramBytes = mem.total || 0;
    // convert bytes to GB
    const ramGb = Math.round(ramBytes / (1024 ** 3));
    const ram = ramGb;

    let location = 'Unknown';
    try {
      const resp = await axios.get('https://ipapi.co/json/');
      if (resp.data && typeof resp.data.country_name === 'string') {
        location = resp.data.country_name;
      }
    } catch (_) {
      // ignore
    }

    return { gpuModel, vram, ram, location };
  } catch (_) {
    // if mem retrieval fails
    const ram = 0;
    let location = 'Unknown';
    try {
      const resp = await axios.get('https://ipapi.co/json/');
      if (resp.data && typeof resp.data.country_name === 'string') {
        location = resp.data.country_name;
      }
    } catch (_) {
      // ignore
    }
    return { gpuModel, vram, ram, location };
  }
}
