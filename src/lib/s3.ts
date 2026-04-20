import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const getRequiredEnv = (key: string) => {
    const value = process.env[key];
    if (!value) throw new Error(`${key} is not set`);
    return value;
};

type S3Config = {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    publicBaseUrl?: string;
    endpoint?: string;
    forcePathStyle?: boolean;
};

const RETRYABLE_S3_ERROR_CODES = new Set([
    "EAI_AGAIN",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "TimeoutError",
]);

let cachedS3Client: S3Client | null = null;

const getCloudPeConfig = (): S3Config | null => {
    const accessKeyId = process.env.CLOUDPE_ACCESS_KEY;
    const secretAccessKey = process.env.CLOUDPE_SECRET_KEY;
    const bucket = process.env.CLOUDPE_BUCKET_NAME;
    const region = process.env.CLOUDPE_REGION || "auto";
    const endpoint = process.env.CLOUDPE_ENDPOINT;
    if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) return null;
    return {
        bucket,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint,
        publicBaseUrl: process.env.CLOUDPE_PUBLIC_BASE_URL,
        // CloudPe endpoints typically require path-style addressing
        forcePathStyle: true,
    };
};

const getAwsConfig = (): S3Config => {
    const bucket = getRequiredEnv("AWS_S3_BUCKET");
    const region = getRequiredEnv("AWS_REGION");
    const accessKeyId = getRequiredEnv("AWS_ACCESS_KEY_ID");
    const secretAccessKey = getRequiredEnv("AWS_SECRET_ACCESS_KEY");
    return {
        bucket,
        region,
        accessKeyId,
        secretAccessKey,
        publicBaseUrl: process.env.AWS_S3_PUBLIC_BASE_URL,
        endpoint: process.env.AWS_S3_ENDPOINT,
    };
};

export const getS3Config = () => {
    return getCloudPeConfig() ?? getAwsConfig();
};

export const getS3Client = () => {
    if (cachedS3Client) {
        return cachedS3Client;
    }

    const { region, accessKeyId, secretAccessKey, endpoint, forcePathStyle } = getS3Config();
    cachedS3Client = new S3Client({
        region,
        endpoint,
        forcePathStyle,
        credentials: { accessKeyId, secretAccessKey },
    });

    return cachedS3Client;
};

export const buildPublicUrl = (key: string) => {
    const { bucket, region, publicBaseUrl, endpoint } = getS3Config();
    if (publicBaseUrl) {
        return `${publicBaseUrl.replace(/\/$/, "")}/${key}`;
    }
    if (endpoint) {
        return `${endpoint.replace(/\/$/, "")}/${bucket}/${key}`;
    }
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

export const sanitizeFilename = (name: string) =>
    name.replace(/[^a-zA-Z0-9._-]/g, "_");

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableS3Error = (error: unknown) => {
    const candidate = error as { code?: string; name?: string };
    return RETRYABLE_S3_ERROR_CODES.has(String(candidate?.code || candidate?.name || ""));
};

export const uploadBufferToS3 = async ({
    key,
    buffer,
    contentType,
}: {
    key: string;
    buffer: Buffer;
    contentType: string;
}) => {
    const { bucket } = getS3Config();
    const client = getS3Client();

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
    });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            await client.send(command);
            return { key, url: buildPublicUrl(key) };
        } catch (error) {
            if (!isRetryableS3Error(error) || attempt === 3) {
                throw error;
            }

            await wait(attempt * 400);
        }
    }

    return { key, url: buildPublicUrl(key) };
};
