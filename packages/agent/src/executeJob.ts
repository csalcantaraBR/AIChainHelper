import fs from 'fs';
import os from 'os';
import path from 'path';
import Docker from 'dockerode';
import axios from 'axios';
import tar from 'tar';
import FormData from 'form-data';
import { Logger } from 'winston';

export interface JobManifest {
  docker_image_url: string;
  entrypoint_command: string;
  input_data_url: string;
  upload_result_url: string;
  timeout_sec?: number;
}

function parseCommand(cmd: string): string[] {
  const regex = /"(?:\\"|[^"])*"|'(?:\\'|[^'])*'|\S+/g;
  const parts = cmd.match(regex) || [];
  return parts.map((p) => {
    if (
      (p.startsWith('"') && p.endsWith('"')) ||
      (p.startsWith("'") && p.endsWith("'"))
    ) {
      return p.slice(1, -1);
    }
    return p;
  });
}

async function pullImage(docker: Docker, image: string): Promise<void> {
  return new Promise((resolve, reject) => {
    docker.pull(image, (err: any, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err2: any) => {
        if (err2) return reject(err2);
        resolve();
      });
    });
  });
}

async function downloadInput(url: string, destDir: string): Promise<void> {
  await fs.promises.mkdir(destDir, { recursive: true });
  const resp = await axios.get(url, { responseType: 'stream' });
  const filePath = path.join(
    destDir,
    path.basename(new URL(url).pathname) || 'input',
  );
  await new Promise<void>((resolve, reject) => {
    const w = fs.createWriteStream(filePath);
    resp.data.pipe(w);
    w.on('finish', resolve);
    w.on('error', reject);
  });
}

async function uploadOutput(dir: string, target: string): Promise<void> {
  const method = target.startsWith('multipart+') ? 'multipart' : 'put';
  const url = target.replace(/^multipart\+|^put\+/, '');
  const tarPath = path.join(dir, '..', 'output.tar.gz');
  await tar.c({ gzip: true, file: tarPath, cwd: dir }, ['.']);
  if (method === 'put') {
    const stream = fs.createReadStream(tarPath);
    await axios.put(url, stream, {
      headers: { 'Content-Type': 'application/gzip' },
    });
  } else {
    const stream = fs.createReadStream(tarPath);
    const form = new FormData();
    form.append('file', stream, 'output.tar.gz');
    const headers = form.getHeaders();
    await axios.post(url, form, { headers });
  }
}

export async function executeJob(
  manifest: JobManifest,
  logger: Logger,
): Promise<'success' | 'fail'> {
  const docker = new Docker();
  await pullImage(docker, manifest.docker_image_url);

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'job-'));
  const inputDir = path.join(tempDir, 'input');
  const outputDir = path.join(tempDir, 'output');
  await fs.promises.mkdir(outputDir, { recursive: true });

  await downloadInput(manifest.input_data_url, inputDir);

  const cmd = parseCommand(manifest.entrypoint_command);
  const container = await docker.createContainer({
    Image: manifest.docker_image_url,
    Cmd: cmd,
    HostConfig: {
      Binds: [`${inputDir}:/job/input:ro`, `${outputDir}:/job/output`],
      AutoRemove: true,
    },
  });

  const stream = await container.attach({
    stream: true,
    stdout: true,
    stderr: true,
  });
  const logs: string[] = [];
  stream.on('data', (chunk: Buffer) => {
    chunk
      .toString()
      .split(/\r?\n/)
      .filter((l) => l.length > 0)
      .forEach((line) => {
        logger.info(line);
        logs.push(line);
        if (logs.length > 100) logs.shift();
      });
  });

  await container.start();

  const limit = manifest.timeout_sec ?? 14400;
  const killer = setTimeout(() => {
    container.kill().catch(() => undefined);
  }, limit * 1000);

  const result = await container.wait();
  clearTimeout(killer);

  const exitCode = result.StatusCode;
  if (exitCode === 0) {
    try {
      await uploadOutput(outputDir, manifest.upload_result_url);
      return 'success';
    } catch (err) {
      logger.error(`Upload failed: ${String(err)}`);
      return 'fail';
    }
  }
  return 'fail';
}
