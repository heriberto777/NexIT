import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Abstracción de almacenamiento de archivos (fotos de evidencia, firmas, reportes).
 * `upload` devuelve una `key` estable — eso es lo que se persiste en BD (columnas
 * urlArchivo/urlFirmaImagen), NUNCA una URL ya resuelta: una URL firmada de S3 expira,
 * así que guardarla directamente dejaría el dato roto a las pocas horas. `getPublicUrl`
 * resuelve esa key a algo mostrable en <img src> cada vez que se necesita (en Local es
 * un passthrough estático; en S3 es la URL pública del bucket o una firmada al vuelo).
 */
export interface StorageProvider {
  upload(params: { buffer: Buffer; contentType: string; pathPrefix: string }): Promise<{ key: string }>;
  getPublicUrl(key: string): Promise<string>;
  getBuffer(key: string): Promise<Buffer>;
}

const EXTENSIONES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function extensionPara(contentType: string): string {
  return EXTENSIONES[contentType] ?? "." + (contentType.split("/")[1] ?? "bin");
}

// Guarda en public/uploads (servido como estático por Next) — despliegue ligero en
// Docker/VPS sin depender de un proveedor cloud. En Docker, public/uploads se monta
// como volumen (ver docker-compose.yml) para que las evidencias sobrevivan a un
// restart del contenedor.
class LocalStorageProvider implements StorageProvider {
  private readonly root = path.join(process.cwd(), "public", "uploads");

  async upload({ buffer, contentType, pathPrefix }: { buffer: Buffer; contentType: string; pathPrefix: string }) {
    const key = `${pathPrefix}/${randomUUID()}${extensionPara(contentType)}`;
    const destino = path.join(this.root, key);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, buffer);
    return { key };
  }

  async getPublicUrl(key: string): Promise<string> {
    // No es "/uploads/${key}" directo (servido por Next.js desde public/) a propósito:
    // ver el comentario en src/app/api/uploads/[...path]/route.ts.
    return `/api/uploads/${key}`;
  }

  async getBuffer(key: string): Promise<Buffer> {
    return readFile(path.join(this.root, key));
  }
}

// AWS S3, Cloudflare R2 o MinIO — cualquiera que hable la API S3. `S3_ENDPOINT` +
// `S3_FORCE_PATH_STYLE=true` apuntan a R2/MinIO en vez de AWS real.
class S3StorageProvider implements StorageProvider {
  private clientPromise: ReturnType<typeof this.crearCliente> | null = null;

  private get bucket(): string {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error("STORAGE_PROVIDER=s3 requiere S3_BUCKET configurado");
    return bucket;
  }

  private async crearCliente() {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  private cliente() {
    if (!this.clientPromise) this.clientPromise = this.crearCliente();
    return this.clientPromise;
  }

  async upload({ buffer, contentType, pathPrefix }: { buffer: Buffer; contentType: string; pathPrefix: string }) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const key = `${pathPrefix}/${randomUUID()}${extensionPara(contentType)}`;
    const s3 = await this.cliente();
    await s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: contentType }));
    return { key };
  }

  async getPublicUrl(key: string): Promise<string> {
    const base = process.env.S3_PUBLIC_BASE_URL;
    if (base) return `${base.replace(/\/$/, "")}/${key}`;

    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const s3 = await this.cliente();
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 3600 });
  }

  async getBuffer(key: string): Promise<Buffer> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = await this.cliente();
    const respuesta = await s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await respuesta.Body?.transformToByteArray();
    if (!bytes) throw new Error(`No se pudo leer el objeto S3: ${key}`);
    return Buffer.from(bytes);
  }
}

function crearProvider(): StorageProvider {
  return process.env.STORAGE_PROVIDER === "s3" ? new S3StorageProvider() : new LocalStorageProvider();
}

const provider = crearProvider();

export const storageService = {
  async upload(params: { buffer: Buffer; contentType: string; pathPrefix: string }): Promise<{ key: string; url: string }> {
    const { key } = await provider.upload(params);
    return { key, url: await provider.getPublicUrl(key) };
  },
  getPublicUrl: (key: string) => provider.getPublicUrl(key),
  getBuffer: (key: string) => provider.getBuffer(key),
};
