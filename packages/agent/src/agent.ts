import path from 'path';
import cron from 'node-cron';
import winston from 'winston';
import { AiChainAPI, getLogTail } from './api';
import { detectHardware } from './hardware';
import { executeJob } from './executeJob';
import { loadConfig, saveConfig, getConfigDir, Config } from './config';

export class ConfigError extends Error {}

function createLogger(level: Config['logLevel']): winston.Logger {
  const dir = getConfigDir();
  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message }) =>
        `${timestamp} [${level}] ${message}`
      )
    ),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: path.join(dir, 'agent.log') }),
    ],
  });
}

export async function runAgent(): Promise<void> {
  const config = loadConfig();
  if (!config.apiKey) {
    throw new ConfigError('API key required – handled by GUI');
  }

  const logger = createLogger(config.logLevel);
  const api = new AiChainAPI(config.apiKey);

  let nodeId = config.nodeId;
  if (!nodeId) {
    logger.info('Detecting hardware and registering node');
    const hw = await detectHardware();
    const res: any = await api.registerNode(hw as any);
    nodeId = res.nodeId || res.id;
    if (typeof nodeId === 'string') {
      saveConfig({ nodeId });
    } else {
      throw new Error('Invalid registerNode response');
    }
  }

  let status: 'idle' | 'busy' = 'idle';
  let shuttingDown = false;

  const sendHeartbeat = async (s: 'idle' | 'busy' | 'offline') => {
    try {
      await api.heartbeat(nodeId!, s);
    } catch (err) {
      logger.error(`Heartbeat failed: ${String(err)}`);
    }
  };

  const hb = cron.schedule('*/1 * * * *', () => sendHeartbeat(status), {
    scheduled: true,
  });

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    hb.stop();
    await sendHeartbeat('offline');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const pollLoop = async () => {
    while (!shuttingDown) {
      if (status === 'idle') {
        try {
          const job: any = await api.pollJob(nodeId!);
          if (job && Object.keys(job).length > 0) {
            status = 'busy';
            await sendHeartbeat(status);
            const result = await executeJob(job, logger);
            if (result === 'success') {
              await api.reportComplete(job.id, {});
            } else {
              const tail = await getLogTail(
                50,
                path.join(getConfigDir(), 'agent.log')
              );
              await api.reportFail(job.id, tail);
            }
            status = 'idle';
            await sendHeartbeat(status);
          }
        } catch (err) {
          logger.error(`Polling failed: ${String(err)}`);
        }
      }
      await new Promise((r) => setTimeout(r, 15000));
    }
  };

  await sendHeartbeat(status);
  await pollLoop();
}

if (require.main === module) {
  runAgent().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
