const express = require('express');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cors=require('cors');
const app = express();
app.use(cors());
const PORT = 3000;

// Ensure the uploads directory exists
const OUTPUT_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// Parse JSON body
app.use(express.json());

/**
 * Replace placeholders in the SVG string.
 */
function fillSvgPlaceholders(svgContent, replacements) {
  return svgContent.replace(/\{\{(.*?)\}\}/g, (_, key) => {
    const trimmedKey = key.trim();

    if (trimmedKey in replacements) {
      let value = replacements[trimmedKey];

      if (trimmedKey === "TX_HASH" && typeof value === "string") {
        // If the string is long enough, truncate with first 20 + "..." + last 20
        if (value.length > 40) {
          value = `${value.slice(0, 20)} ... ${value.slice(-20)}`;
        }
      }

      return value;
    } else {
      console.warn(`⚠️ No replacement found for placeholder: {{${trimmedKey}}}`);
      return `{{${trimmedKey}}}`; // Leave placeholder untouched
    }
  });
}

// Basic route to check server status
app.get('/', (req, res) => {
  res.send('Welcome to the SVG to JPEG conversion service!');
});

// Main Endpoint
// Main Endpoint
app.post('/svg-to-jpeg', async (req, res) => {
  try {
    console.log('📥 Received request to /svg-to-jpeg');
    const originalPayload = { ...req.body };
    const { platforms, ...replacements } = originalPayload;

    if (!Array.isArray(platforms) || platforms.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid platforms array' });
    }

    // Process each platform
    for (const platform of platforms) {
      const platformName = platform.name;
      const svgPath = path.join(__dirname, `svgs/Pawn${platformName}.svg`);

      if (!fs.existsSync(svgPath)) {
        console.warn(`⚠️ SVG not found for platform: ${platformName}`);
        platform.url = null; // Mark missing image
        continue;
      }

      const rawSvgTemplate = fs.readFileSync(svgPath, 'utf8');
      const filledSvg = fillSvgPlaceholders(rawSvgTemplate, replacements);

      const filename = `${uuidv4()}-${platformName}.jpeg`;
      const filepath = path.join(OUTPUT_DIR, filename);

      await sharp(Buffer.from(filledSvg))
        .jpeg({ quality: 90 })
        .toFile(filepath);

      const fileUrl = `https://image-to-jpeg-vl1x.onrender.com/uploads/${filename}`;
      console.log(`✅ Created JPEG for ${platformName}: ${fileUrl}`);

      // Add URL to the current platform object
      platform.url = fileUrl;
    }

    // Respond with updated payload
    res.json(originalPayload);

  } catch (err) {
    console.error('❌ Conversion error:', err);
    res.status(500).json({ error: 'Failed to convert SVGs to JPEGs' });
  }
});


// Static file serving
app.use('/uploads', express.static(OUTPUT_DIR));

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

app.listen(PORT, () => {
  const localIp = getLocalIp();
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Accessible locally at http://${localIp}:${PORT}`);
});