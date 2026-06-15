/**
 * upload-images-to-s3.ts
 *
 * Uploads all product images from frontend/public/images/products/
 * to an S3 bucket and outputs the CloudFront URL for each.
 *
 * Usage:
 *   S3_BUCKET=amazon-now-images CLOUDFRONT_URL=https://xxxx.cloudfront.net tsx scripts/upload-images-to-s3.ts
 *
 * Prerequisites:
 *   - AWS credentials set (env vars or ~/.aws/credentials)
 *   - S3 bucket already created
 *   - CloudFront distribution pointing to the bucket
 */

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";

const BUCKET =
  process.env.S3_MEDIA_BUCKET || process.env.S3_BUCKET || "amazon-now-images";
const CLOUDFRONT_URL = (
  process.env.CLOUDFRONT_URL || "https://YOUR_CLOUDFRONT_DOMAIN.cloudfront.net"
).replace(/\/$/, "");
const REGION = process.env.AWS_REGION || "ap-south-1";
const PREFIX = "products/"; // S3 key prefix

const IMAGES_DIR = path.resolve(
  __dirname,
  "../../frontend/public/images/products",
);
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif"];

const s3 = new S3Client({ region: REGION });

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".avif": "image/avif",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

async function fileExistsInS3(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function uploadFile(
  filePath: string,
  key: string,
  mimeType: string,
): Promise<void> {
  const body = fs.readFileSync(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: mimeType,
      CacheControl: "public, max-age=31536000, immutable", // 1 year CDN cache
    }),
  );
}

async function main() {
  console.log(`\n🚀 Uploading images to S3 bucket: ${BUCKET}`);
  console.log(`📁 Source: ${IMAGES_DIR}`);
  console.log(`🌐 CloudFront: ${CLOUDFRONT_URL}\n`);

  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`❌ Images directory not found: ${IMAGES_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(IMAGES_DIR).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext) && !f.startsWith(".");
  });

  console.log(`Found ${files.length} image files to process.\n`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const urlMap: Record<string, string> = {};

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(IMAGES_DIR, file);
    const ext = path.extname(file).toLowerCase();
    const key = `${PREFIX}${file}`;
    const cfUrl = `${CLOUDFRONT_URL}/${key}`;
    const mimeType = getMimeType(ext);

    process.stdout.write(`[${i + 1}/${files.length}] ${file} ... `);

    try {
      const exists = await fileExistsInS3(key);
      if (exists) {
        console.log("⏭ skipped (already exists)");
        skipped++;
      } else {
        await uploadFile(filePath, key, mimeType);
        console.log("✅ uploaded");
        uploaded++;
      }
      urlMap[file] = cfUrl;
    } catch (err: any) {
      console.log(`❌ FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log("\n─────────────────────────────────────────");
  console.log(`✅ Uploaded : ${uploaded}`);
  console.log(`⏭ Skipped  : ${skipped}`);
  console.log(`❌ Failed   : ${failed}`);
  console.log("─────────────────────────────────────────\n");

  // Write URL map to file for reference
  const mapPath = path.resolve(__dirname, "s3-url-map.json");
  fs.writeFileSync(mapPath, JSON.stringify(urlMap, null, 2));
  console.log(`📄 URL map saved to: ${mapPath}`);
  console.log("\nSet this in your frontend .env:");
  console.log(`VITE_CDN_URL=${CLOUDFRONT_URL}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
