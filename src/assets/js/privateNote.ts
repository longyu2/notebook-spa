/**
 * 私密笔记的加解密（只在前端跑，服务端永远只有密文）。
 *
 * 流程：
 *   设私密 → 用户输入口令 → PBKDF2-SHA256(31 万轮, 16 字节随机盐) 派生 256 位密钥
 *          → 标题 + 正文打包成 JSON，AES-256-GCM 加密（12 字节随机 IV，带认证标签）
 *          → 落库的是一个信封字符串：{"__nbx":1,...}
 *   解锁   → 同一个口令 + 信封里的盐重新派生密钥 → GCM 解开（标签不对 = 密码错）
 *
 * 口令不落库、不上传、不写 localStorage —— 只在这个标签页的内存里活到关页面为止。
 * 忘了口令就永久解不开，没有任何后门（这是设计目标，不是缺陷）。
 *
 * 为什么不用 window.crypto.subtle：
 *   它只在安全上下文（https 或 localhost）里存在，而这个站主要走
 *   http://192.168.1.3:9995，subtle 直接是 undefined。
 *   所以用 @noble/ciphers + @noble/hashes 的纯 JS 实现，任何环境都能算，
 *   代价是派生密钥要 0.3~1 秒（只发生在解锁和设私密这两个动作上）。
 */
import { gcm } from '@noble/ciphers/aes'
import { pbkdf2 } from '@noble/hashes/pbkdf2'
import { sha256 } from '@noble/hashes/sha256'

/** 密文信封的固定开头，服务端也按这个前缀校验「只收密文」 */
export const NBX_PREFIX = '{"__nbx"'
export const KDF_ITERATIONS = 310000
export const MIN_PASSWORD_LENGTH = 8

const SALT_BYTES = 16
const IV_BYTES = 12
const KEY_BYTES = 32
/** 信封里 iter 的上限：挡住伪造的超大轮数把浏览器卡死 */
const MAX_ITERATIONS = 5000000
const B64_CHUNK = 0x8000

/** 派生好、可以直接拿去反复加密的密钥（含盐，重新加密时盐不变） */
export interface PrivateKey {
  key: Uint8Array
  salt: string
  iter: number
}

export interface PrivatePayload {
  title: string
  content: string
}

interface Envelope {
  __nbx: 1
  alg: 'AES-256-GCM'
  kdf: 'PBKDF2-SHA256'
  iter: number
  salt: string
  iv: string
  ct: string
}

/** 口令不对（或密文被改过）：GCM 的认证标签过不去 */
export class WrongPasswordError extends Error {
  constructor(message = '密码错误') {
    super(message)
    this.name = 'WrongPasswordError'
  }
}

/* ===== base64 =====
   不用 btoa(JSON.stringify(bytes))：把几 MB 的正文拼成二进制字符串会爆栈/卡死，
   必须按块 String.fromCharCode。 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += B64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + B64_CHUNK))
  }
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function randomBytes(length: number): Uint8Array {
  // getRandomValues 在 http 页面里也能用（只有 subtle 受安全上下文限制）
  const out = new Uint8Array(length)
  globalThis.crypto.getRandomValues(out)
  return out
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/** 口令先做 NFKC 归一化：全角/半角、带不带组合字符都算同一个口令 */
function passwordBytes(password: string): Uint8Array {
  return utf8(password.normalize('NFKC'))
}

/** 是不是一封私密笔记的密文 */
export function isPrivateBlob(value: unknown): boolean {
  return typeof value === 'string' && value.trimStart().startsWith(NBX_PREFIX)
}

export function deriveKey(password: string, salt: Uint8Array, iter: number): Uint8Array {
  return pbkdf2(sha256, passwordBytes(password), salt, { c: iter, dkLen: KEY_BYTES })
}

function parseEnvelope(blob: string): Envelope {
  let env: any
  try {
    env = JSON.parse(blob)
  } catch {
    throw new Error('密文格式不对（不是 JSON）')
  }
  if (!env || env.__nbx !== 1) throw new Error('密文版本不认识')
  if (env.alg !== 'AES-256-GCM' || env.kdf !== 'PBKDF2-SHA256') {
    throw new Error('密文算法不认识')
  }
  const iter = Number(env.iter)
  if (!Number.isFinite(iter) || iter < 1000 || iter > MAX_ITERATIONS) {
    throw new Error('密文的密钥派生参数不合法')
  }
  for (const field of ['salt', 'iv', 'ct']) {
    if (typeof env[field] !== 'string' || env[field] === '') {
      throw new Error('密文缺字段：' + field)
    }
  }
  return env as Envelope
}

function seal(key: Uint8Array, payload: PrivatePayload): { iv: string; ct: string } {
  const iv = randomBytes(IV_BYTES)
  const plain = utf8(JSON.stringify({ t: payload.title, c: payload.content }))
  const ct = gcm(key, iv).encrypt(plain)
  return { iv: bytesToBase64(iv), ct: bytesToBase64(ct) }
}

function open(key: Uint8Array, env: Envelope): PrivatePayload {
  let plain: Uint8Array
  try {
    plain = gcm(key, base64ToBytes(env.iv)).decrypt(base64ToBytes(env.ct))
  } catch {
    // GCM 解密抛错只有一种原因：标签对不上 = 口令错，或密文被改过
    throw new WrongPasswordError()
  }
  let obj: any
  try {
    obj = JSON.parse(new TextDecoder().decode(plain))
  } catch {
    throw new Error('密文内容损坏')
  }
  return {
    title: obj && typeof obj.t === 'string' ? obj.t : '',
    content: obj && typeof obj.c === 'string' ? obj.c : ''
  }
}

/** 用口令新建一封密文；返回信封字符串和派生好的密钥（同一个口令不用再算一遍） */
export function createPrivateBlob(
  password: string,
  payload: PrivatePayload
): { blob: string; key: PrivateKey } {
  const saltBytes = randomBytes(SALT_BYTES)
  const key = deriveKey(password, saltBytes, KDF_ITERATIONS)
  const { iv, ct } = seal(key, payload)
  const env: Envelope = {
    __nbx: 1,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iter: KDF_ITERATIONS,
    salt: bytesToBase64(saltBytes),
    iv,
    ct
  }
  return {
    blob: JSON.stringify(env),
    key: { key, salt: env.salt, iter: env.iter }
  }
}

/** 用已经派生好的密钥重新加密（改一个字就存一次，不必再跑 31 万轮 PBKDF2） */
export function encryptWithKey(key: PrivateKey, payload: PrivatePayload): string {
  const { iv, ct } = seal(key.key, payload)
  const env: Envelope = {
    __nbx: 1,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iter: key.iter,
    salt: key.salt,
    iv,
    ct
  }
  return JSON.stringify(env)
}

/** 用已缓存密钥解密（切回一篇本次会话解锁过的笔记时用，不用再问口令） */
export function decryptWithKey(key: PrivateKey, blob: string): PrivatePayload {
  const env = parseEnvelope(blob)
  return open(key.key, env)
}

/** 用口令解密；返回明文和派生好的密钥（解锁后就能一直用） */
export function decryptPrivateBlob(
  password: string,
  blob: string
): { payload: PrivatePayload; key: PrivateKey } {
  const env = parseEnvelope(blob)
  const key = deriveKey(password, base64ToBytes(env.salt), env.iter)
  return {
    payload: open(key, env),
    key: { key, salt: env.salt, iter: env.iter }
  }
}

/** 口令规则；返回空串表示通过 */
export function passwordProblem(password: string): string {
  const normalized = (password || '').normalize('NFKC')
  if (normalized.length === 0) return '请输入密码'
  if (normalized.length < MIN_PASSWORD_LENGTH) {
    return `密码至少 ${MIN_PASSWORD_LENGTH} 位`
  }
  if (normalized.length > 256) return '密码太长了（最多 256 位）'
  return ''
}
