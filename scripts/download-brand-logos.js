require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const winston = require('winston');

// Brandfetch API key from environment variables
const BRANDFETCH_API_KEY = process.env.BRANDFETCH_CLIENT_ID;
const PREFERRED_IMAGE_WIDTH = 992; // Image width
const PREFERRED_IMAGE_HEIGHT = 624; // Image height

// Check if API key exists
if (!BRANDFETCH_API_KEY) {
  console.error(
    'ERROR: Brandfetch API key is not set in environment variable BRANDFETCH_CLIENT_ID'
  );
  process.exit(1);
}

// Directories
const imagesDir = path.join(__dirname, 'brandImages');
const requiredImagesPath = path.join(
  __dirname,
  'outputCsv',
  'required-images.txt'
);
const logsDir = path.join(__dirname, 'logsJson');

// Create directories if they don't exist
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.printf(
      (info) => `${info.timestamp} ${info.level}: ${info.message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(__dirname, 'logsJson', 'brand-images-download.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(__dirname, 'logsJson', 'brand-images-errors.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Function for reading the list of required images
function readRequiredImages() {
  try {
    const content = fs.readFileSync(requiredImagesPath, 'utf8');
    // Split content into lines and remove comments and empty lines
    const brands = [];
    content
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('//'))
      .forEach((line) => {
        const originalName = line.trim();

        // For API requests we need the full name with .com
        const brandApiName = originalName;

        // For the file name we remove .com and .png extensions
        let fileBaseName = originalName;

        // If the name ends with .com or .png - remove it for the filename
        if (fileBaseName.endsWith('.com') || fileBaseName.endsWith('.png')) {
          fileBaseName = fileBaseName.slice(0, -4);
        }

        logger.info(
          `Prepared: ${originalName} → API: ${brandApiName}, file: ${fileBaseName}`
        );

        brands.push({
          originalName: fileBaseName, // Save name without .png/.com for file creation
          apiName: brandApiName, // Full name for API request (with .com)
        });
      });
    return brands;
  } catch (error) {
    logger.error(`Error reading required-images.txt file: ${error.message}`);
    return [];
  }
}

// Function for downloading an image
async function downloadImage(brand, originalName) {
  try {
    // Form the URL for the Brandfetch API request
    const brandUrl = brand.endsWith('.com')
      ? brand
      : brand.endsWith('.png')
      ? `${brand.slice(0, -4)}.com`
      : `${brand}.com`;

    // Create URL with the required size parameters
    const imageUrl = `https://cdn.brandfetch.io/${brandUrl}/w/${PREFERRED_IMAGE_WIDTH}/h/${PREFERRED_IMAGE_HEIGHT}/logo?c=${BRANDFETCH_API_KEY}`;

    logger.info(`Requesting image for brand ${brand}, URL: ${imageUrl}`);

    // Execute the request with a full set of browser-like headers
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer',
      timeout: 30000, // Увеличиваем таймаут до 30 секунд
      validateStatus: (status) => status === 200, // Только 200 OK считаем успехом
      headers: {
        Accept:
          'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        Pragma: 'no-cache',
        Referer: 'https://brandfetch.com/',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'same-site',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
      },
    });

    // Check the response for an image
    const contentType = response.headers['content-type'];
    logger.info(
      `For brand ${brand} received Content-Type: ${
        contentType || 'not specified'
      }, URL: ${imageUrl}`
    );

    // Always check the file signature regardless of Content-Type
    const buffer = Buffer.from(response.data);

    // Check minimum size (prevent empty files)
    if (buffer.length < 8) {
      logger.warn(
        `For brand ${brand} received empty or corrupted file, URL: ${imageUrl}`
      );
      return false;
    }

    // Check image format signatures
    const fileSignature = buffer.slice(0, 8).toString('hex').toLowerCase();
    let detectedFormat = null;

    // Check by file signatures
    if (fileSignature.startsWith('89504e47')) {
      // PNG signature
      detectedFormat = 'PNG';
    } else if (fileSignature.startsWith('ffd8ff')) {
      // JPEG signature
      detectedFormat = 'JPEG';
    } else if (fileSignature.startsWith('47494638')) {
      // GIF signature (GIF8)
      detectedFormat = 'GIF';
    } else if (
      fileSignature.startsWith('52494646') &&
      buffer.slice(8, 12).toString() === 'WEBP'
    ) {
      // WEBP signature (RIFF....WEBP)
      detectedFormat = 'WEBP';
    } else if (fileSignature.includes('3c737667')) {
      // SVG can start with different characters but contains '<svg'
      detectedFormat = 'SVG';
    }

    if (detectedFormat) {
      logger.info(
        `For brand ${brand} detected format ${detectedFormat} by file signature, URL: ${imageUrl}`
      );
    } else {
      // If signature is not defined, check Content-Type
      if (contentType && contentType.includes('image/')) {
        if (contentType.includes('png')) {
          detectedFormat = 'PNG';
        } else if (
          contentType.includes('jpeg') ||
          contentType.includes('jpg')
        ) {
          detectedFormat = 'JPEG';
        } else if (contentType.includes('webp')) {
          detectedFormat = 'WEBP';
        } else if (contentType.includes('gif')) {
          detectedFormat = 'GIF';
        } else if (contentType.includes('svg')) {
          detectedFormat = 'SVG';
        }

        if (detectedFormat) {
          logger.info(
            `For brand ${brand} detected format ${detectedFormat} by Content-Type, URL: ${imageUrl}`
          );
        }
      }

      // If format is still not detected
      if (!detectedFormat) {
        logger.warn(
          `For brand ${brand} could not determine image format, URL: ${imageUrl}`
        );
        return false;
      }
    }

    // We always save with .png extension as required for the project
    const imagePath = path.join(imagesDir, `${originalName}.png`);

    // Save the image
    fs.writeFileSync(imagePath, response.data);
    logger.info(
      `Successfully downloaded image for ${brand} (format ${detectedFormat}) and saved as ${originalName}.png, URL: ${imageUrl}`
    );
    return true;
  } catch (error) {
    // URL to include in all error logs
    const brandUrl = brand.endsWith('.com') ? brand : `${brand}.com`;
    const imageUrl = `https://cdn.brandfetch.io/${brandUrl}/w/${PREFERRED_IMAGE_WIDTH}/h/${PREFERRED_IMAGE_HEIGHT}/logo?c=${BRANDFETCH_API_KEY}`;

    // If this is an HTTP response error
    if (error.response) {
      if (error.response.status === 404) {
        logger.warn(
          `Image for brand ${brand} not found on Brandfetch (404), URL: ${imageUrl}`
        );
      } else {
        logger.error(
          `HTTP error while downloading image for ${brand}: code ${error.response.status}, message: ${error.message}, URL: ${imageUrl}`
        );

        // Try to log the response body for diagnostics
        if (error.response.data) {
          try {
            const responseText = Buffer.isBuffer(error.response.data)
              ? error.response.data.toString('utf8').slice(0, 200) // Take first 200 characters for binary data
              : JSON.stringify(error.response.data);
            logger.error(
              `Server response for ${brand}: ${responseText}, URL: ${imageUrl}`
            );
          } catch (parseError) {
            logger.error(
              `Unable to parse server response for ${brand}, URL: ${imageUrl}`
            );
          }
        }
      }
    } else if (error.request) {
      // Request was made but no response was received
      logger.error(
        `Network error while downloading image for ${brand}: ${error.message} (timeout or network issues), URL: ${imageUrl}`
      );
    } else {
      // Error setting up the request
      logger.error(
        `Error setting up request for ${brand}: ${error.message}, URL: ${imageUrl}`
      );
    }
    return false;
  }
}

// Main function
async function downloadBrandImages() {
  const startTime = new Date();
  logger.info('Starting the download of brand images from Brandfetch...');

  // Get the list of brands
  const brands = readRequiredImages();
  logger.info(`Found ${brands.length} brands to download`);

  // Statistics
  let stats = {
    total: brands.length,
    success: 0,
    failed: 0,
  };

  // Limit the number of concurrent requests
  const concurrentLimit = 5;
  const chunks = [];

  // Split the array into parts for parallel processing
  for (let i = 0; i < brands.length; i += concurrentLimit) {
    chunks.push(brands.slice(i, i + concurrentLimit));
  }

  // Process each chunk sequentially, but within a chunk - in parallel
  for (const [index, chunk] of chunks.entries()) {
    logger.info(`Processing batch ${index + 1}/${chunks.length}...`);

    const promises = chunk.map((brand) =>
      downloadImage(brand.apiName, brand.originalName)
    );
    const results = await Promise.all(promises);

    // Update statistics
    stats.success += results.filter(Boolean).length;
    stats.failed += results.filter((result) => !result).length;

    // Small pause between chunks to avoid overloading the API
    if (index < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Calculate execution time
  const endTime = new Date();
  const processingTime = (endTime - startTime) / 1000; // in seconds

  // Log the results
  logger.info(`Image download completed.`);
  logger.info(`- Total brands: ${stats.total}`);
  logger.info(`- Successfully downloaded: ${stats.success}`);
  logger.info(`- Failed to download: ${stats.failed}`);
  logger.info(`- Execution time: ${processingTime.toFixed(2)} seconds`);
}

// Run the script
downloadBrandImages()
  .then(() => {
    logger.info('Script successfully completed');
  })
  .catch((error) => {
    logger.error(`Error executing script: ${error.message}`);
    process.exit(1);
  });
