const AWS = require('aws-sdk');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Initialize S3
const s3 = new AWS.S3();
const BUCKET_NAME = 'pawnhourlyroutine'; 

// Fill placeholders in SVG
function fillSvgPlaceholders(svgContent, replacements) {
  return svgContent.replace(/\{\{(.*?)\}\}/g, (_, key) => {
    const trimmedKey = key.trim();

    if (trimmedKey in replacements) {
      let value = replacements[trimmedKey];

      if (trimmedKey === "TX_HASH" && typeof value === "string" && value.length > 40) {
        value = `${value.slice(0, 20)} ... ${value.slice(-20)}`;
      }

      return value;
    } else {
      return `{{${trimmedKey}}}`;
    }
  });
}

// Lambda Handler
exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { platforms, ...replacements } = body;

    if (!Array.isArray(platforms) || platforms.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid platforms array' }) };
    }

    for (const platform of platforms) {
      const platformName = platform.name;
      const svgPath = path.join(__dirname, 'svgs', `Pawn${platformName}.svg`);

      if (!fs.existsSync(svgPath)) {
        console.warn(`SVG not found for ${platformName}`);
        platform.url = null;
        continue;
      }

      const rawSvg = fs.readFileSync(svgPath, 'utf8');
      const filledSvg = fillSvgPlaceholders(rawSvg, replacements);
      const buffer = await sharp(Buffer.from(filledSvg)).jpeg({ quality: 90 }).toBuffer();

      const fileKey = `generated/${uuidv4()}-${platformName}.jpeg`;

      await s3.putObject({
        Bucket: BUCKET_NAME,
        Key: fileKey,
        Body: buffer,
        ContentType: 'image/jpeg',
        ACL: 'public-read' 
      }).promise();

      platform.url = `https://${BUCKET_NAME}.s3.amazonaws.com/${fileKey}`;
    }

    return {
      statusCode: 200,
      body: JSON.stringify(body),
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process request' }),
    };
  }
};