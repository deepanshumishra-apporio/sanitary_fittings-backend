import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
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
