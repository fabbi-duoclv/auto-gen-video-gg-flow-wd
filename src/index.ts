import { program } from 'commander';
import { AutomationEngine } from './engine.js';
import { log } from './logger.js';

program
  .option('--headless', 'Run in headless mode', false)
  .option('--resume', 'Resume from last progress', false)
  .option('--scene <number>', 'Process only a specific scene')
  .option('--start-from <number>', 'Start from a specific scene number')
  .option('--end-at <number>', 'End at a specific scene number')
  .option('--image-only', 'Only generate images', false)
  .option('--video-only', 'Only generate videos', false)
  .parse();

const opts = program.opts<{
  headless: boolean;
  resume: boolean;
  scene?: string;
  startFrom?: string;
  endAt?: string;
  imageOnly: boolean;
  videoOnly: boolean;
}>();

async function main() {
  // Legacy CLI mode: no FlowConfig → engine launches its own browser
  const engine = new AutomationEngine();
  await engine.start({
    scenes: opts.scene ? [opts.scene] : undefined,
    startFrom: opts.startFrom ? parseInt(opts.startFrom) : undefined,
    endAt: opts.endAt ? parseInt(opts.endAt) : undefined,
    imageOnly: opts.imageOnly,
    videoOnly: opts.videoOnly,
    resume: opts.resume,
    headless: opts.headless,
  });
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
