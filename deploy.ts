import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import FormData from 'form-data';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DIST_DIR = path.resolve(__dirname, 'dist');
const ZIP_PATH = path.resolve(__dirname, 'dist.zip');
const KEY_PATH = path.resolve(__dirname, 'deploy.key');

const SERVER_URL = 'http://b.misaka-mikoto.cn:9999/v1';
// const SERVER_URL = 'http://localhost:9999/v1';

function readDeployKey(): string {
  // 优先读环境变量，CI 里用
  if (process.env.DEPLOY_SECRET) {
    return process.env.DEPLOY_SECRET.trim();
  }
  // 本地读 deploy.key
  if (fs.existsSync(KEY_PATH)) {
    return fs.readFileSync(KEY_PATH, 'utf-8').trim();
  }
  throw new Error(`找不到部署密钥：请设置 DEPLOY_SECRET 或创建 ${KEY_PATH}`);
}

async function zipDist() {
  const output = fs.createWriteStream(ZIP_PATH);
  const archive = archiver('zip', { zlib: { level: 9 } });

  await new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(DIST_DIR, false); // dist 内容放到 zip 根
    archive.finalize();
  });
}

async function upload() {
  const deployKey = readDeployKey();

  const form = new FormData();
  form.append('file', fs.createReadStream(ZIP_PATH));

  const res = await axios.post(`${SERVER_URL}/deploy`, form, {
    headers: {
      ...form.getHeaders(),
      'x-deploy-secret': deployKey,
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  console.log(res.data);
}

async function main() {
  await zipDist();
  await upload();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});