/**
 * S3-compatible storage client (Cloudflare R2 in prod, MinIO locally).
 * Streams files from local disk — never buffers the whole file in memory (section 4.4).
 */
import { createReadStream, statSync } from "node:fs";
import { Upload } from "@aws-sdk/lib-storage";
import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  publicBaseUrl: string;
}

export class Storage {
  private readonly client: S3Client;
  private readonly cfg: StorageConfig;

  constructor(cfg: StorageConfig) {
    this.cfg = cfg;
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }

  /** Streams a local file to object storage in multipart chunks. Returns byte size. */
  async uploadFile(
    localPath: string,
    key: string,
    contentType: string,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<number> {
    const total = statSync(localPath).size;
    const body = createReadStream(localPath);

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // 24-hour lifecycle is enforced by a bucket rule; tag for visibility.
        Tagging: "ttl=24h",
      },
      partSize: 8 * 1024 * 1024, // 8 MB chunks (section 4.4)
      queueSize: 4,
    });

    if (onProgress) {
      upload.on("httpUploadProgress", (p) => onProgress(p.loaded ?? 0, p.total ?? total));
    }

    await upload.done();
    return total;
  }

  /** Generates a presigned GET URL, rewritten to the public/CDN base if configured. */
  async presignDownload(key: string, ttlSeconds: number, filename?: string): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.cfg.bucket,
      Key: key,
      ...(filename
        ? { ResponseContentDisposition: `attachment; filename="${sanitizeForHeader(filename)}"` }
        : {}),
    });
    const signed = await getSignedUrl(this.client, cmd, { expiresIn: ttlSeconds });
    if (this.cfg.publicBaseUrl) {
      return rewriteHost(signed, this.cfg.endpoint, this.cfg.publicBaseUrl);
    }
    return signed;
  }

  /** Lists object keys under a prefix that were last modified before `before`. */
  async listExpired(prefix: string, before: Date): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.cfg.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key && obj.LastModified && obj.LastModified < before) keys.push(obj.Key);
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  async deleteKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    // DeleteObjects takes up to 1000 keys per request.
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.cfg.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })) },
        }),
      );
    }
  }
}

function sanitizeForHeader(name: string): string {
  return name.replace(/[\r\n"]/g, "").slice(0, 200);
}

function rewriteHost(url: string, fromBase: string, toBase: string): string {
  try {
    const u = new URL(url);
    const from = new URL(fromBase);
    const to = new URL(toBase);
    if (u.host === from.host) {
      u.protocol = to.protocol;
      u.host = to.host;
    }
    return u.toString();
  } catch {
    return url;
  }
}
