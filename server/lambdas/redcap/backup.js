'use strict';

const https = require('https');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3  = new S3Client({});

const httpsAgent = new https.Agent();

const rcApiUrl = process.env.RC_API_URL;
if (!rcApiUrl) throw new Error('Missing env var: RC_API_URL');
const rcToken = process.env.RC_TOKEN;
if (!rcToken) throw new Error('Missing env var: RC_TOKEN');

const bucket = process.env.OUTPUT_BUCKET;
if (!bucket) throw new Error('Missing env var: OUTPUT_BUCKET');

exports.handler = async function handler() {
  const { data, contentType } = await fetchWithQuery(rcApiUrl, rcToken);

  // Save response to S3
  const dateTag = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `${dateTag}.csv`;

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: data,
    ContentType: contentType || 'application/octet-stream'
  }));

  return {
    statusCode: 200,
    message: `Saved ${data.length} bytes to s3://${bucket}/${key}`,
    contentType
  };
};

// ---- Helpers ----

function fetchWithQuery(baseUrl, token) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(baseUrl);
    const params = new URLSearchParams();
    params.append('token', token);
    params.append('content', 'record');
    params.append('action', 'export');
    params.append('format', 'csv');
    params.append('type', 'flat');
    params.append('csvDelimiter', '');
    params.append('rawOrLabel', 'raw');
    params.append('rawOrLabelHeaders', 'raw');
    params.append('exportCheckboxLabel', 'false');
    params.append('exportSurveyFields', 'true');
    params.append('exportDataAccessGroups', 'false');
    params.append('returnFormat', 'json');
    const paramStr = params.toString();

    const req = https.request(
      {
        method: 'POST',
        timeout: 30_000,
        agent: httpsAgent,
        enableTrace: true,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': paramStr.length,
        },
        ...pickHttpsOptions(urlObj)
      },
      (res) => {
        const { statusCode } = res;
        const contentType = res.headers['content-type'] || 'application/octet-stream';

        if (statusCode < 200 || statusCode >= 300) {
          res.resume();
          return reject(new Error(`HTTP ${statusCode} fetching ${urlObj.toString()}`));
        }

        const chunks = [];
        res.on('data', (chunk) => {
            chunks.push(chunk)
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          return resolve({ data: body, contentType });
        });
      }
    );

    req.write(paramStr);
    req.end();
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
  });
}

/** Convert a URL object to https.request options safely. */
function pickHttpsOptions(urlObj) {
  return {
    protocol: urlObj.protocol,
    hostname: urlObj.hostname,
    port: urlObj.port,
    path: urlObj.pathname + (urlObj.search || '')
  };
}