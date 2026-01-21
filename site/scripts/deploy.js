const { readdirSync, readFileSync } = require("fs");
const path = require("path");
const mime = require("mime-types");
const awsSettings = require("../../common/aws-settings.json");

const distDir = "dist";

async function initClients() {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const { Upload } = await import("@aws-sdk/lib-storage");
    const { CloudFrontClient, CreateInvalidationCommand } = await import("@aws-sdk/client-cloudfront");
    return { S3Client, Upload, CloudFrontClient, CreateInvalidationCommand };
}

async function readDir(dirName, s3Client, Upload) {
    const files = readdirSync(dirName, { withFileTypes: true });
    const promises = [];
    files.forEach(f => {
        if (f.isFile()) {
            let key = path.join(dirName, f.name);
            key = key.substring(key.indexOf("/") + 1); // strip off the 'dist' directory
            promises.push(uploadFile(path.join(dirName, f.name), key, s3Client, Upload));
        } else if (f.isDirectory()) {
            promises.push(readDir(path.join(dirName, f.name), s3Client, Upload));
        } else {
            throw new Error(`${f.name}: Unsupported file type - only files and directories are supported.`);
        }
    });
    await Promise.all(promises);
}

async function uploadFile(fpath, key, s3Client, Upload) {
    console.log(`Uploading ${fpath}`);
    const contents = readFileSync(fpath);
    const contentType = mime.lookup(fpath);
    const upload = new Upload({
        client: s3Client,
        params: {
            Bucket: awsSettings.DeploymentBucket,
            Key: key,
            Body: contents,
            ContentType: contentType,
            Endpoint: `${awsSettings.DeploymentBucket}.s3-us-west-2.amazonaws.com`
        }
    });
    await upload.done();
    console.log(`${fpath} uploaded successfully.`);
}

async function invalidateCloudFrontDistribution(distId, CloudFrontClient, CreateInvalidationCommand) {
    // because all of the bundles are fingerprinted we only invalidate index.html
    const params = {
        DistributionId: distId,
        InvalidationBatch: {
            CallerReference: Date.now().toString(),
            Paths: {
                Quantity: 3,
                Items: [
                    '/login/*',
                    '/admin/*',
                    '/register/*'
                ]
            }
        }
    };
    const cfClient = new CloudFrontClient({ region: 'us-east-1' });
    const command = new CreateInvalidationCommand(params);
    await cfClient.send(command);
}

(async () => {
    const { S3Client, Upload, CloudFrontClient, CreateInvalidationCommand } = await initClients();
    const s3Client = new S3Client({ region: 'us-west-2' });
    await readDir(distDir, s3Client, Upload);
    await invalidateCloudFrontDistribution(awsSettings.CloudFrontDistributionId, CloudFrontClient, CreateInvalidationCommand);
})().catch(err => console.error('Error:', err));








