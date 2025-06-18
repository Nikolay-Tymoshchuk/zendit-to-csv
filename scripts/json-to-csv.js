require('dotenv').config();
const path = require('path');
const fs = require('fs');
const winston = require('winston');

// Create the logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logsJson');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Настройка логгера
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
    // Вывод всех логов в консоль
    new winston.transports.Console(),
    // Запись логов в файл
    new winston.transports.File({
      filename: path.join(__dirname, 'logsJson', 'json-processing.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Отдельный файл для ошибок
    new winston.transports.File({
      filename: path.join(__dirname, 'logsJson', 'json-errors.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Debug the API key being loaded
logger.info(
  'ZENDIT_API_KEY available:',
  process.env.ZENDIT_API_KEY ? 'Yes (Loaded)' : 'No (Not loaded)'
);

logger.info(
  `Starting JSON processing with merchant: ${process.env.MERCHANT_NAME}`
);

// Set merchant name
const MERCHANT_NAME = process.env.MERCHANT_NAME;

// Import countries data
const countries = require('./countries.json');

// Import offer categories - direct import of the structure from the file
const categories = {
  esim: [
    {
      name: 'Faster',
      baseCategory: 'esim',
      productKind: 'esim',
    },
    {
      name: 'Fastest',
      baseCategory: 'esim',
      productKind: 'esim',
    },
    {
      name: 'Fast',
      baseCategory: 'esim',
      productKind: 'esim',
    },
    {
      name: 'Standard',
      baseCategory: 'esim',
      productKind: 'esim',
    },
  ],
  topup: [
    {
      name: 'Mobile Top Up',
      baseCategory: 'mobile-top-up',
      productKind: 'mobile_topup',
    },
    {
      name: 'Mobile Bundle',
      baseCategory: 'mobile-top-up',
      productKind: 'mobile_topup',
    },
    {
      name: 'Mobile Data',
      baseCategory: 'mobile-top-up',
      productKind: 'mobile_topup',
    },
  ],
  voucher: [
    {
      name: 'Gaming & Entertainment',
      baseCategory: 'entertainment-gift-cards',
      productKind: 'entertainment',
    },
    {
      name: 'Digital Apps',
      baseCategory: 'entertainment-gift-cards',
      productKind: 'entertainment',
    },
    {
      name: 'EGIFT',
      baseCategory: 'entertainment-gift-cards',
      productKind: 'entertainment',
    },
    {
      name: 'Shopping',
      baseCategory: 'shopping-gift-cards',
      productKind: 'shopping',
    },
    {
      name: 'Clothing & Accessories',
      baseCategory: 'shopping-gift-cards',
      productKind: 'shopping',
    },
    {
      name: 'Electronics',
      baseCategory: 'shopping-gift-cards',
      productKind: 'shopping',
    },
    {
      name: 'Home & Garden',
      baseCategory: 'shopping-gift-cards',
      productKind: 'shopping',
    },
    {
      name: 'Health & Beauty',
      baseCategory: 'shopping-gift-cards',
      productKind: 'shopping',
    },
    {
      name: 'General Merchandise',
      baseCategory: 'shopping-gift-cards',
      productKind: 'shopping',
    },
    {
      name: 'Online Shopping',
      baseCategory: 'shopping-gift-cards',
      productKind: 'shopping',
    },
    {
      name: 'Auto & Moto',
      baseCategory: 'shopping-gift-cards',
      productKind: 'shopping',
    },
    {
      name: 'IMTU Internet',
      baseCategory: 'payment-cards',
      productKind: 'payment',
    },
    {
      name: 'Utilities',
      baseCategory: 'payment-cards',
      productKind: 'payment',
    },
    {
      name: 'Fuel',
      baseCategory: 'payment-cards',
      productKind: 'payment',
    },
    {
      name: 'Sports & Outdoors',
      baseCategory: 'payment-cards',
      productKind: 'payment',
    },
    {
      name: 'Food & Beverage',
      baseCategory: 'food',
      productKind: 'food',
    },
    {
      name: 'Restaurant',
      baseCategory: 'food',
      productKind: 'food',
    },
    {
      name: 'Supermarket',
      baseCategory: 'food',
      productKind: 'food',
    },
    {
      name: 'Travel & Experience',
      baseCategory: 'travel',
      productKind: 'travel',
    },
  ],
};

// Directory containing offers JSON files
const dataDir = path.join(__dirname, 'dataJson');

// Directory to save the output CSV files
const outputDir = path.join(__dirname, 'outputJson');

// Create the output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Create a set to track unique productCardImages
const uniqueProductImages = new Set();

// CSV header
const csvHeader =
  'productName,productCardImage,variantName,variantDescription,metaTitle,metaDescription,nameInCategoryPage,slug,countries,baseCategory,brand,productType,offerId,productKind,nameInAboutSection,countriesName';

// Function to determine the type based on the type
function determineType(offer) {
  const type = offer.type;

  if (type === 'esim') {
    return 'esim';
  } else if (type === 'topup') {
    return 'topup';
  } else if (type === 'voucher') {
    return 'voucher';
  }

  // Default to 'voucher' if no specific type matches
  return 'voucher';
}

// Function to check if an item is a regional eSIM product
function isRegionalEsim(offer) {
  // Check if it's an eSIM product
  if (
    offer.type === 'esim' &&
    !offer.country &&
    offer.regions &&
    offer.regions.length > 0
  ) {
    return true;
  }

  return false;
}

// Function to format product name for image file
function formatProductNameForImage(productName) {
  if (!productName) return '';

  // 1. Split by "(" and take only the first part to remove text in parentheses
  const nameParts = productName.split('(');
  const nameWithoutParentheses = nameParts[0].trim();

  // 2. Keep only letters and numbers, remove all special characters
  // This will convert "Lyca Mobile" to "lycamobile"
  const cleanedName = nameWithoutParentheses
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, '');

  return cleanedName + '.png';
}

// Function to extract country codes from eSIM roaming details
function extractCountryCodesFromEsim(offer) {
  // Method 1: If the eSIM offer has a direct country property, use that and don't check roamingDetails
  if (offer.country && offer.country.code) {
    // Handle single country eSIM (direct country) - ensure code exists and isn't empty
    const countryCode = offer.country.code.trim();
    if (countryCode) {
      // Verify the country code exists in our countries.json
      const countryExists = countries.some((c) => c.value === countryCode);
      if (countryExists) {
        return [countryCode];
      } else {
        // logger.warn(
        //   `Country code ${countryCode} found in direct country property but not in countries.json for: ${offer.offerId}`
        // );
        // Continue to try other methods
      }
    }
  }

  // Method 2: For eSIM with country name but invalid or missing code, try to find the code by country name
  if (offer.country && offer.country.name) {
    const countryByName = countries.find((c) => c.label === offer.country.name);
    if (countryByName) {
      // logger.info(
      //   `Found country code ${countryByName.value} by name ${offer.country.name} for: ${offer.offerId}`
      // );
      return [countryByName.value];
    }
  }

  // Method 3: Only for eSIM without direct country, check for roamingDetails structure
  if (
    !offer.country &&
    offer.details &&
    offer.details.roamingDetails &&
    Array.isArray(offer.details.roamingDetails)
  ) {
    const codes = offer.details.roamingDetails
      .map((roaming) => {
        if (roaming && roaming.country && roaming.country.code) {
          const code = roaming.country.code.trim();
          return code || null;
        }
        return null;
      })
      .filter(Boolean); // Filter out null values

    if (codes.length > 0) {
      return codes;
    }
  }

  // If we reach here, the offer has no valid country code through any method
  if (!offer.country) {
    logger.warn(`No country codes found for eSIM product: ${offer.offerId}`);
  } else {
    logger.warn(`Invalid country code for eSIM product: ${offer.offerId}`);
  }
  return [];
}

// Helper function to create a CSV line for an item
function createCsvLine(offer, countryCode) {
  // Determine type based on offer type
  const type = determineType(offer);

  // 1. productName
  const productName = offer.brand ? offer.brand.name : '';

  // 2. productCardImage
  const productCardImage = formatProductNameForImage(productName);

  // Add to unique images set
  uniqueProductImages.add(productCardImage);

  // 3. variantName
  let variantName = productName;
  if (type === 'voucher') {
    const subTypes = offer.subTypes || [];
    if (subTypes.length > 0) {
      variantName = `${productName} ${subTypes.join(' ')}`;
    }
  }

  // 4. variantDescription
  let variantDescription = offer.notesShort || offer.notes;
  if (!variantDescription || variantDescription === '-') {
    variantDescription = `Buy ${productName} Digital product for use in ${
      offer.country ? offer.country.name : ''
    }. Buy now and receive your code instantly with no waiting or hassle. The process is simple - purchase, receive your code, and use or share in minutes. Digital delivery ensures your voucher reaches you instantly and free of charge.`;
  }

  // 5. metaTitle
  let metaTitle = productName;
  if (type === 'voucher') {
    const subTypes = offer.subTypes || [];
    if (subTypes.length > 0) {
      metaTitle = `${productName} ${subTypes.join(' ')}`;
    }
  }
  metaTitle += ` | ${MERCHANT_NAME}`;

  // 6. metaDescription
  let metaDescription = `Buy ${productName}`;
  if (type === 'voucher') {
    const subTypes = offer.subTypes || [];
    if (subTypes.length > 0) {
      metaDescription += ` ${subTypes.join(' ')}`;
    }
  }
  metaDescription += ` at ${MERCHANT_NAME}. Fast, safe and easy.`;

  // 7. nameInCategoryPage
  const nameInCategoryPage = variantName;

  // 8. slug
  const slug = productName
    .toLowerCase()
    .replace(/\s/g, '-')
    .replace(/&/g, '-and-')
    .replace(/\./g, '-')
    .replace(/--/g, '-');

  // 9. countries code
  const countryValue = countryCode || '';

  // 10. baseCategory
  let baseCategory = '';
  if (type === 'esim') {
    baseCategory = 'esim';
  } else if (type === 'topup') {
    baseCategory = 'mobile-top-up';
  } else if (
    type === 'voucher' &&
    offer.subTypes &&
    offer.subTypes.length > 0
  ) {
    const subType = offer.subTypes[0];

    if (categories && categories.voucher) {
      const category = categories.voucher.find((c) => c.name === subType);
      if (category) {
        baseCategory = category.baseCategory;
      } else {
        // Default for unknown voucher subtypes
        logger.warn(
          `Unknown voucher subtype "${subType}" for offer ${offer.offerId}. Using default.`
        );
        baseCategory = 'shopping-gift-cards';
      }
    } else {
      // Default if categories.voucher is missing
      logger.warn(
        `categories.voucher is undefined. Using default for offer ${offer.offerId}.`
      );
      baseCategory = 'shopping-gift-cards';
    }
  }

  // 11. brand
  const brand = offer.brand ? offer.brand.name : '';

  // 12. productType
  const productType = (type || '').toUpperCase();

  // 13. offerId
  const offerId = offer.offerId || '';

  // 14. productKind
  let productKind = '';
  if (type === 'esim') {
    productKind = 'esim';
  } else if (type === 'topup') {
    productKind = 'mobile_topup';
  } else if (
    type === 'voucher' &&
    offer.subTypes &&
    offer.subTypes.length > 0
  ) {
    const subType = offer.subTypes[0];

    if (categories && categories.voucher) {
      const category = categories.voucher.find((c) => c.name === subType);
      if (category) {
        productKind = category.productKind;
      } else {
        // Default for unknown voucher subtypes
        logger.warn(
          `Unknown voucher subtype "${subType}" for product kind calculation. Using default.`
        );
        productKind = 'shopping';
      }
    } else {
      // Default if categories.voucher is missing
      logger.warn(
        `categories.voucher is undefined for product kind calculation. Using default.`
      );
      productKind = 'shopping';
    }
  }

  // 15. nameInAboutSection
  let nameInAboutSection = productName;
  if (type === 'voucher') {
    const subTypes = offer.subTypes || [];
    if (subTypes.length > 0) {
      nameInAboutSection = `${productName} ${subTypes.join(' ')}`;
    }
  }

  // 16. countriesName
  const countriesName = offer.country ? offer.country.name : '';

  // Format all fields to handle special characters and ensure proper CSV formatting
  const formatForCsv = (value) => {
    if (value === null || value === undefined) return '';

    // Escape double quotes with another double quote and wrap in quotes if needed
    const stringValue = String(value);
    if (
      stringValue.includes(',') ||
      stringValue.includes('"') ||
      stringValue.includes('\n')
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  // Create CSV line
  return [
    formatForCsv(productName),
    formatForCsv(productCardImage),
    formatForCsv(variantName),
    formatForCsv(variantDescription),
    formatForCsv(metaTitle),
    formatForCsv(metaDescription),
    formatForCsv(nameInCategoryPage),
    formatForCsv(slug),
    formatForCsv(countryValue),
    formatForCsv(baseCategory),
    formatForCsv(brand),
    formatForCsv(productType),
    formatForCsv(offerId),
    formatForCsv(productKind),
    formatForCsv(nameInAboutSection),
    formatForCsv(countriesName),
  ].join(',');
}

// Function to create a CSV line specifically for regional products with multiple countries
function createRegionalCsvLine(offer, countriesStr, countriesNameStr) {
  // Determine type based on offer type
  const type = determineType(offer);

  // 1. productName
  const productName = offer.brand ? offer.brand.name : '';

  // 2. productCardImage
  const productCardImage = formatProductNameForImage(productName);

  // Add to unique images set
  uniqueProductImages.add(productCardImage);

  // 3. variantName
  let variantName = productName;
  if (type === 'voucher') {
    const subTypes = offer.subTypes || [];
    if (subTypes.length > 0) {
      variantName = `${productName} ${subTypes.join(' ')}`;
    }
  }

  // 4. variantDescription
  let variantDescription = offer.notesShort || offer.notes;
  if (!variantDescription || variantDescription === '-') {
    variantDescription = `Buy ${productName} eSIM for use in multiple countries. Buy now and receive your code instantly with no waiting or hassle. The process is simple - purchase, receive your code, and use or share in minutes.`;
  }

  // 5. metaTitle
  let metaTitle = productName;
  if (type === 'voucher') {
    const subTypes = offer.subTypes || [];
    if (subTypes.length > 0) {
      metaTitle = `${productName} ${subTypes.join(' ')}`;
    }
  }
  metaTitle += ` | ${MERCHANT_NAME}`;

  // 6. metaDescription
  let metaDescription = `Buy ${productName}`;
  if (type === 'voucher') {
    const subTypes = offer.subTypes || [];
    if (subTypes.length > 0) {
      metaDescription += ` ${subTypes.join(' ')}`;
    }
  }
  metaDescription += ` at ${MERCHANT_NAME}. Fast, safe and easy.`;

  // 7. nameInCategoryPage
  const nameInCategoryPage = variantName;

  // 8. slug
  const slug = productName
    .toLowerCase()
    .replace(/\s/g, '-')
    .replace(/&/g, '-and-')
    .replace(/\./g, '-')
    .replace(/--/g, '-');

  // 9. countries code - use the combined string
  const countryValue = countriesStr;

  // 10. baseCategory
  let baseCategory = '';
  if (type === 'esim') {
    const foundCategory = categories.esim.find(
      (cat) => cat.name === 'Standard'
    );
    if (foundCategory) {
      baseCategory = foundCategory.baseCategory;
    } else {
      baseCategory = 'esim';
    }
  } else if (type === 'topup') {
    baseCategory = 'mobile-top-up';
  } else if (
    type === 'voucher' &&
    offer.subTypes &&
    offer.subTypes.length > 0
  ) {
    const subType = offer.subTypes[0];
    if (categories && categories.voucher) {
      const category = categories.voucher.find((c) => c.name === subType);
      if (category) {
        baseCategory = category.baseCategory;
      } else {
        baseCategory = 'shopping-gift-cards';
      }
    } else {
      baseCategory = 'shopping-gift-cards';
    }
  }

  // 11. brand
  const brand = offer.brand ? offer.brand.name : '';

  // 12. productType
  const productType = (type || '').toUpperCase();

  // 13. offerId
  const offerId = offer.offerId || '';

  // 14. productKind
  let productKind = '';
  if (type === 'esim') {
    const foundCategory = categories.esim.find(
      (cat) => cat.name === 'Standard'
    );
    if (foundCategory) {
      productKind = foundCategory.productKind;
    } else {
      productKind = 'esim';
    }
  } else if (type === 'topup') {
    productKind = 'mobile_topup';
  } else if (
    type === 'voucher' &&
    offer.subTypes &&
    offer.subTypes.length > 0
  ) {
    const subType = offer.subTypes[0];
    if (categories && categories.voucher) {
      const category = categories.voucher.find((c) => c.name === subType);
      if (category) {
        productKind = category.productKind;
      } else {
        productKind = 'shopping';
      }
    } else {
      productKind = 'shopping';
    }
  }

  // 15. nameInAboutSection
  let nameInAboutSection = productName;
  if (type === 'voucher') {
    const subTypes = offer.subTypes || [];
    if (subTypes.length > 0) {
      nameInAboutSection = `${productName} ${subTypes.join(' ')}`;
    }
  }

  // 16. countriesName - use the combined string
  const countriesName = countriesNameStr;

  // Format all fields to handle special characters and ensure proper CSV formatting
  const formatForCsv = (value) => {
    if (value === null || value === undefined) return '';

    // Escape double quotes with another double quote and wrap in quotes if needed
    const stringValue = String(value);
    if (
      stringValue.includes(',') ||
      stringValue.includes('"') ||
      stringValue.includes('\n')
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  // Create CSV line
  return [
    formatForCsv(productName),
    formatForCsv(productCardImage),
    formatForCsv(variantName),
    formatForCsv(variantDescription),
    formatForCsv(metaTitle),
    formatForCsv(metaDescription),
    formatForCsv(nameInCategoryPage),
    formatForCsv(slug),
    formatForCsv(countryValue),
    formatForCsv(baseCategory),
    formatForCsv(brand),
    formatForCsv(productType),
    formatForCsv(offerId),
    formatForCsv(productKind),
    formatForCsv(nameInAboutSection),
    formatForCsv(countriesName),
  ].join(',');
}

// Function to process JSON data from the data directory
async function processJsonData() {
  const startTime = new Date();
  logger.info(`Processing JSON files from ${dataDir} directory...`);

  // Get all JSON files from the data directory
  const jsonFiles = fs
    .readdirSync(dataDir)
    .filter((file) => file.endsWith('.json') && file.startsWith('offers'))
    .sort((a, b) => {
      // Sort by numeric part of filename (offers1.json, offers2.json, etc.)
      const numA = parseInt(a.match(/\d+/)[0] || 0);
      const numB = parseInt(b.match(/\d+/)[0] || 0);
      return numA - numB;
    });

  if (jsonFiles.length === 0) {
    logger.error(
      `No JSON files found in the ${dataDir} directory. Run get-all-zendit-offers.js first.`
    );
    throw new Error(`No JSON files found in the ${dataDir} directory`);
  }

  logger.info(`Found ${jsonFiles.length} JSON files to process`);

  // Prepare CSV lines
  const csvLines = [csvHeader];

  // Статистика
  let stats = {
    total: 0,
    processed: 0,
    skipped: 0,
    missingData: 0,
    countryNotFound: 0,
    regionalRequests: 0,
    regionalSuccess: 0,
    regionalFailed: 0,
    regionalCountriesProcessed: 0,
  };

  // Отслеживаем отсутствующие страны
  const missingCountries = new Set();

  // Track which regional labels refer to which countries (for reference)
  const regionalMappings = new Map();

  // Process each JSON file
  for (const jsonFile of jsonFiles) {
    logger.info(`Processing file: ${jsonFile}`);

    const jsonFilePath = path.join(dataDir, jsonFile);
    const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

    // Check if the file contains valid data
    if (
      !jsonData ||
      !jsonData.data ||
      !jsonData.data.offers ||
      !jsonData.data.offers.list
    ) {
      logger.warn(
        `File ${jsonFile} does not contain valid offers data. Skipping.`
      );
      stats.skipped++;
      continue;
    }

    const offers = jsonData.data.offers.list;
    logger.info(`Found ${offers.length} offers in ${jsonFile}`);
    stats.total += offers.length;

    // Process each offer
    for (const offer of offers) {
      // Skip offers that don't have the necessary data
      if (!offer.offerId || !offer.brand) {
        logger.warn(
          `Offer is missing required data ${offer.offerId}. Skipping.`
        );
        stats.missingData++;
        stats.skipped++;
        continue;
      }

      // Special handling for different eSIM structures
      if (offer.type !== 'esim' && !offer.country) {
        logger.warn(
          `Non-eSIM offer ${offer.offerId} missing country data. Skipping.`
        );
        stats.missingData++;
        stats.skipped++;
        continue;
      }

      // Check if this is a regional eSIM product
      if (isRegionalEsim(offer)) {
        stats.regionalRequests++;

        // Extract country codes based on the offer structure
        // For all eSIM offers, use the extractCountryCodesFromEsim function to get valid codes
        const countryCodes = extractCountryCodesFromEsim(offer);

        // Only log extraction for non-direct-country eSIMs (regional eSIMs with roamingDetails)
        if (!offer.country && countryCodes.length > 0) {
          logger.info(
            `Extracted ${JSON.stringify(
              countryCodes
            )} country codes for regional eSIM product: ${offer.offerId}`
          );
        }

        if (!countryCodes || countryCodes.length === 0) {
          logger.warn(
            `No regional data found for eSIM product: ${offer.offerId}. Processing as normal product.`
          );
          stats.regionalFailed++;

          // Continue with normal (non-regional) product processing
        } else {
          logger.info(
            `Found ${countryCodes.length} countries for regional eSIM product: ${offer.offerId}`
          );
          stats.regionalSuccess++;

          // Store the mapping of regional label to country codes
          const regionName = offer.country
            ? offer.country.name
            : offer.regions
            ? offer.regions.join(', ')
            : 'Unknown Region';
          regionalMappings.set(regionName, countryCodes);

          // Get all valid country codes and corresponding labels
          const validCountries = [];
          const validCountryCodes = [];
          const validCountryNames = [];

          // For direct country eSIMs, verify the country exists in countries.json
          if (offer.country && countryCodes.length === 1) {
            const countryCode = countryCodes[0];
            if (!countryCode) {
              logger.warn(
                `Empty country code for eSIM with direct country: ${offer.offerId}`
              );

              // Try to extract from product ID as a fallback
              const productMatch = offer.offerId.match(/ESIM-([A-Z]{2})-/);
              if (productMatch && productMatch[1]) {
                const codeFromProductId = productMatch[1];
                const countryObjectFromId = countries.find(
                  (c) => c.value === codeFromProductId
                );

                if (countryObjectFromId) {
                  logger.info(
                    `Found country ${countryObjectFromId.label} (${countryObjectFromId.value}) from product ID as fallback: ${offer.offerId}`
                  );
                  validCountries.push(countryObjectFromId);
                  validCountryCodes.push(countryObjectFromId.value);
                  validCountryNames.push(countryObjectFromId.label);
                } else {
                  logger.warn(
                    `Failed to extract valid country from product ID: ${offer.offerId}`
                  );
                  continue;
                }
              } else {
                continue;
              }
            } else {
              // Find country by code
              const countryObject = countries.find(
                (c) => c.value === countryCode
              );
              if (!countryObject) {
                // Try to find by name as fallback
                const nameCountryObject = countries.find(
                  (c) => c.label === offer.country.name
                );
                if (nameCountryObject) {
                  // Use the correct code from countries.json
                  logger.info(
                    `Found country ${offer.country.name} by name instead of code for ${offer.offerId}`
                  );
                  validCountries.push(nameCountryObject);
                  validCountryCodes.push(nameCountryObject.value);
                  validCountryNames.push(nameCountryObject.label);
                } else {
                  // Last resort: try to extract from product ID
                  const productMatch = offer.offerId.match(/ESIM-([A-Z]{2})-/);
                  if (productMatch && productMatch[1]) {
                    const codeFromProductId = productMatch[1];
                    const countryObjectFromId = countries.find(
                      (c) => c.value === codeFromProductId
                    );

                    if (countryObjectFromId) {
                      logger.info(
                        `Found country ${countryObjectFromId.label} (${countryObjectFromId.value}) from product ID as last resort: ${offer.offerId}`
                      );
                      validCountries.push(countryObjectFromId);
                      validCountryCodes.push(countryObjectFromId.value);
                      validCountryNames.push(countryObjectFromId.label);
                    } else {
                      logger.warn(
                        `Country with code "${countryCode}" and name "${offer.country.name}" not found in countries.json for eSIM product: ${offer.offerId}`
                      );
                    }
                  } else {
                    logger.warn(
                      `Country with code "${countryCode}" and name "${offer.country.name}" not found in countries.json for eSIM product: ${offer.offerId}`
                    );
                  }
                }
              } else {
                validCountries.push(countryObject);
                validCountryCodes.push(countryCode);
                validCountryNames.push(countryObject.label);
              }
            }
          } else {
            // For multi-country eSIMs, validate each country code
            for (const countryCode of countryCodes) {
              const countryObject = countries.find(
                (c) => c.value === countryCode
              );
              if (!countryObject) {
                logger.warn(
                  `Country with code "${countryCode}" not found in countries.json for eSIM product: ${offer.offerId}`
                );
                continue;
              }
              validCountries.push(countryObject);
              validCountryCodes.push(countryCode);
              validCountryNames.push(countryObject.label);
            }
          }

          if (validCountries.length === 0) {
            logger.warn(
              `No valid countries found for regional eSIM product: ${offer.offerId}. Skipping.`
            );
            stats.skipped++;
            continue;
          }

          // Create single CSV line with all country codes and names joined by commas
          const countriesStr = validCountryCodes.join(',');
          const countriesNameStr = validCountryNames.join(',');

          // Create CSV line with all countries combined
          const csvLine = createRegionalCsvLine(
            offer,
            countriesStr,
            countriesNameStr
          );
          csvLines.push(csvLine);

          stats.processed++;
          stats.regionalCountriesProcessed += validCountries.length;
          logger.info(
            `Created single entry with ${validCountries.length} countries for regional eSIM product: ${offer.offerId}`
          );

          // Skip the regular processing for this item since we've created country-specific entries
          continue;
        }
      }

      // Regular processing path (for non-regional products or failed regional lookups)

      // First check that we do have a country - required for regular processing
      if (!offer.country) {
        logger.warn(
          `Offer ${offer.offerId} doesn't have country information for regular processing. Skipping.`
        );
        stats.missingData++;
        stats.skipped++;
        continue;
      }

      // Try to find the country in countries.json by both code and label
      let foundCountry = null;

      if (offer.type === 'esim') {
        // Use our extractCountryCodesFromEsim function which handles various ways to get country codes
        const countryCodes = extractCountryCodesFromEsim(offer);
        if (countryCodes && countryCodes.length > 0) {
          // Find the country object for the first code
          foundCountry = countries.find((c) => c.value === countryCodes[0]);

          if (!foundCountry) {
            logger.warn(
              `Extracted country code ${countryCodes[0]} from eSIM product ${offer.offerId}, but couldn't find it in countries.json`
            );
          }
        }

        // If no country code was found or the found code was invalid,
        // try to extract from the product ID as a fallback
        if (!foundCountry && offer.offerId) {
          const productMatch = offer.offerId.match(/ESIM-([A-Z]{2})-/);
          if (productMatch && productMatch[1]) {
            const codeFromProductId = productMatch[1];
            foundCountry = countries.find((c) => c.value === codeFromProductId);

            if (foundCountry) {
              logger.info(
                `As a fallback, found country ${foundCountry.label} (${foundCountry.value}) from product ID: ${offer.offerId}`
              );
            }
          }
        }
      } else {
        // For non-eSIM products, use the regular lookup process

        // First try by code if it exists and isn't empty
        if (offer.country.code && offer.country.code.trim()) {
          foundCountry = countries.find(
            (c) => c.value === offer.country.code.trim()
          );
        }

        // If not found by code, try by name
        if (!foundCountry) {
          foundCountry = countries.find((c) => c.label === offer.country.name);
        }
      }

      if (!foundCountry) {
        logger.warn(
          `Country "${offer.country.name}" with code "${
            offer.country.code || 'empty'
          }" not found in countries.json. Skipping offer ${offer.offerId}.`
        );
        missingCountries.add(offer.country.name);
        stats.countryNotFound++;
        stats.skipped++;
        continue;
      }

      // Create CSV line for the item
      const csvLine = createCsvLine(offer, foundCountry.value);
      csvLines.push(csvLine);
      stats.processed++;
    }
  }

  // Вычисляем время выполнения
  const endTime = new Date();
  const processingTime = (endTime - startTime) / 1000; // в секундах

  // Логируем статистику
  logger.info(`Processing statistics:`);
  logger.info(`- Total records found: ${stats.total}`);
  logger.info(`- Successfully processed: ${stats.processed}`);
  logger.info(`- Skipped: ${stats.skipped}`);
  logger.info(`  - Missing data: ${stats.missingData}`);
  logger.info(`  - Country not found: ${stats.countryNotFound}`);
  logger.info(`- Regional eSIM processing:`);
  logger.info(`  - Regional products requests: ${stats.regionalRequests}`);
  logger.info(
    `  - Regional products with successful API data: ${stats.regionalSuccess}`
  );
  logger.info(
    `  - Regional products with failed API data: ${stats.regionalFailed}`
  );
  logger.info(
    `  - Total countries covered by regional offers: ${stats.regionalCountriesProcessed}`
  );
  logger.info(`- Processing time: ${processingTime.toFixed(2)} seconds`);

  // Логируем отсутствующие страны
  if (missingCountries.size > 0) {
    logger.warn(`Missing countries (${missingCountries.size}):`);
    Array.from(missingCountries)
      .sort()
      .forEach((country) => {
        logger.warn(`- "${country}"`);
      });

    // Сохраняем отсутствующие страны в отдельный файл для удобства
    const missingCountriesContent = Array.from(missingCountries)
      .sort()
      .join('\n');
    fs.writeFileSync(
      path.join(outputDir, 'missing-countries.txt'),
      missingCountriesContent,
      'utf8'
    );
    logger.info(
      `Missing countries saved to ${outputDir}/missing-countries.txt`
    );
  }

  // Log regional mappings if any were found
  if (regionalMappings.size > 0) {
    logger.info(`Regional mappings found (${regionalMappings.size}):`);
    for (const [regionalLabel, countryList] of regionalMappings.entries()) {
      logger.info(
        `- "${regionalLabel}": ${countryList.length} roaming countries`
      );
    }

    // Save detailed regional mappings to a separate file for reference
    const regionalMappingContent = Array.from(regionalMappings.entries())
      .map(([label, codes]) => {
        // For each regional label, find the corresponding country names
        const countryNames = codes.map((code) => {
          const countryObj = countries.find((c) => c.value === code);
          return countryObj
            ? `  - ${code} (${countryObj.label})`
            : `  - ${code} (Unknown)`;
        });
        return `${label}:\n${countryNames.join('\n')}`;
      })
      .join('\n\n');

    fs.writeFileSync(
      path.join(outputDir, 'regional-mappings.txt'),
      regionalMappingContent,
      'utf8'
    );
    logger.info(
      `Regional mappings saved to ${outputDir}/regional-mappings.txt`
    );
  }

  return csvLines.join('\n');
}

// Main function to convert JSON to CSV
async function convertJsonToCsv() {
  const startTime = new Date();

  try {
    logger.info('Starting JSON to CSV conversion...');

    // Process the JSON data
    const csvContent = await processJsonData();

    // Save to CSV file
    const outputFilePath = path.join(outputDir, 'Offers.csv');
    fs.writeFileSync(outputFilePath, csvContent, 'utf8');

    logger.info(`Successfully created Offers.csv`);

    // Save unique product images list in alphabetical order
    const imagesList = Array.from(uniqueProductImages).sort().join('\n');
    fs.writeFileSync(
      path.join(outputDir, 'required-images.txt'),
      imagesList,
      'utf8'
    );

    // Вычисляем общее время выполнения
    const endTime = new Date();
    const totalProcessingTime = (endTime - startTime) / 1000; // в секундах

    logger.info(`Processing complete!`);
    logger.info(
      `Required images list saved to ${outputDir}/required-images.txt in alphabetical order`
    );
    logger.info(
      `Found ${uniqueProductImages.size} unique product images to prepare.`
    );
    logger.info(
      `Total execution time: ${totalProcessingTime.toFixed(2)} seconds`
    );
  } catch (error) {
    logger.error(`Error processing JSON files: ${error.message}`, { error });
    throw error; // Re-throw to be caught by the main wrapper
  }
}

// Run the conversion
logger.info(
  'Starting JSON to CSV conversion from dataJson to output directory...'
);
(async () => {
  try {
    await convertJsonToCsv();
    logger.info('JSON to CSV conversion script finished successfully');
  } catch (err) {
    logger.error(`JSON to CSV conversion script failed: ${err.message}`);
    process.exit(1);
  }
})();
