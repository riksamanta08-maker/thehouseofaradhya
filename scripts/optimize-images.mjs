import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = process.cwd();
const imageDir = path.join(projectRoot, 'public', 'images');

const encoders = {
  jpeg: (image, quality) => image.jpeg({ quality, mozjpeg: true }),
  webp: (image, quality) => image.webp({ quality, effort: 4 }),
  avif: (image, quality) => image.avif({ quality, effort: 4 }),
};

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function collectImageTasks() {
  const files = await fs.readdir(imageDir);
  const tasks = files
    .filter((file) => /\.(png|jpe?g)$/i.test(file))
    .map((file) => {
      const input = path.join('public', 'images', file);
      const output = path.join('public', 'images', file.replace(/\.(png|jpe?g)$/i, '.webp'));
      const isToneImage = file.startsWith('skintone-');
      const isOccasionImage = file.startsWith('occasion-');

      return {
        input,
        output,
        width: isToneImage ? 960 : isOccasionImage ? 720 : 1280,
        quality: isToneImage ? 76 : 72,
        format: 'webp',
      };
    });

  tasks.push(
    {
      input: path.join('public', 'images', 'p1.jpg'),
      output: path.join('public', 'images', 'hero-poster.jpg'),
      width: 1280,
      quality: 78,
      format: 'jpeg',
    },
    {
      input: path.join('public', 'images', 'p1.jpg'),
      output: path.join('public', 'images', 'hero-poster.webp'),
      width: 1280,
      quality: 72,
      format: 'webp',
    },
  );

  return tasks;
}

async function runTask(task) {
  const inputPath = path.join(projectRoot, task.input);
  const outputPath = path.join(projectRoot, task.output);

  await ensureDir(outputPath);

  const image = sharp(inputPath, { failOn: 'none' }).rotate().resize({
    width: task.width,
    withoutEnlargement: true,
  });

  const encoder = encoders[task.format];
  if (!encoder) {
    throw new Error(`Unsupported format "${task.format}"`);
  }

  await encoder(image, task.quality).toFile(outputPath);
  const file = await fs.stat(outputPath);
  console.log(`[images] ${task.output} (${Math.round(file.size / 1024)} KiB)`);
}

async function main() {
  const tasks = await collectImageTasks();
  for (const task of tasks) {
    await runTask(task);
  }
}

main().catch((error) => {
  console.error('[images] Failed to optimize images', error);
  process.exitCode = 1;
});
