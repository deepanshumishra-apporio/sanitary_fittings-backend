import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { SignatureV4 } from "@smithy/signature-v4";
import { HttpRequest } from "@smithy/protocol-http";
import { Hash } from "@smithy/hash-node";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 5_000,
    requestTimeout: 25_000,
  }),
});

export async function uploadToR2(
  file: Express.Multer.File,
  productId: string
): Promise<{ key: string; url: string }> {
  const ext = file.originalname.split(".").pop();
  const baseName = file.originalname.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const key = `product/${productId}/image/${baseName}${Date.now()}.${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return { key, url: `${process.env.R2_PUBLIC_URL}/${key}` };
}

export async function getPresignedPutUrl(
  filename: string
): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const bucket = process.env.R2_BUCKET_NAME!;
  const hostname = `${accountId}.r2.cloudflarestorage.com`;

  const dotIndex = filename.lastIndexOf(".");
  const ext = dotIndex !== -1 ? filename.slice(dotIndex + 1).toLowerCase() : "jpg";
  const baseName = (dotIndex !== -1 ? filename.slice(0, dotIndex) : filename)
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  const key = `uploads/${randomUUID()}/${baseName}.${ext}`;

  const signer = new SignatureV4({
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    region: "auto",
    service: "s3",
    sha256: Hash.bind(null, "sha256") as never,
  });

  const request = new HttpRequest({
    method: "PUT",
    protocol: "https:",
    hostname,
    path: `/${bucket}/${key}`,
    headers: {
      host: hostname,
      // Tell getPayloadHash to use UNSIGNED-PAYLOAD instead of SHA256("").
      // Must be unhoistable (stay as a header) so moveHeadersToQuery doesn't
      // push it into the query string, and unsignable so the mobile upload
      // request is not required to include it.
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    },
    query: {},
  });

  const signed = await signer.presign(request, {
    expiresIn: 300,
    unsignableHeaders: new Set(["content-type", "content-length", "x-amz-content-sha256"]),
    unhoistableHeaders: new Set(["x-amz-content-sha256"]),
  });

  const qs = Object.entries(signed.query as Record<string, string | string[]>)
    .flatMap(([k, v]) =>
      Array.isArray(v)
        ? v.map((val) => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`)
        : [`${encodeURIComponent(k)}=${encodeURIComponent(v)}`]
    )
    .join("&");

  return {
    uploadUrl: `https://${hostname}/${bucket}/${key}?${qs}`,
    publicUrl: `${process.env.R2_PUBLIC_URL}/${key}`,
    key,
  };
}

export async function deleteFromR2(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await Promise.all(
    keys.map((key) =>
      r2.send(
        new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key })
      )
    )
  );
}
