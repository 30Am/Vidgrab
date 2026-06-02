/**
 * Read-only S3 client for the API. The worker writes finished files to object
 * storage; the API streams them back to the browser so storage stays internal
 * and behind the same auth (no public presigned URLs for internal hosting).
 */
import { Readable } from "node:stream";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

export interface StorageReadConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export interface ObjectStream {
  body: Readable;
  contentType?: string;
  contentLength?: number;
}

export class StorageReader {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(cfg: StorageReadConfig) {
    this.bucket = cfg.bucket;
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async getObject(key: string): Promise<ObjectStream> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return {
      body: res.Body as Readable,
      contentType: res.ContentType,
      contentLength: res.ContentLength,
    };
  }
}
