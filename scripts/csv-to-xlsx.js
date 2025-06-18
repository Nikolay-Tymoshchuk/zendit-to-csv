require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const winston = require('winston');
const axios = require('axios');
const util = require('util');
const sleep = util.promisify(setTimeout);
const Excel = require('exceljs');

// Debug the API key being loaded
console.log(
  'ZENDIT_API_KEY available:',
  process.env.ZENDIT_API_KEY ? 'Yes (Loaded)' : 'No (Not loaded)'
);

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
      filename: path.join(__dirname, 'logsCsv', 'csv-processing.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Отдельный файл для ошибок
    new winston.transports.File({
      filename: path.join(__dirname, 'logsCsv', 'csv-errors.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Создание директории для логов, если она не существует
const logsDir = path.join(__dirname, 'logsCsv');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

logger.info(
  `Starting CSV processing with merchant: ${process.env.MERCHANT_NAME}`
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

// Directory containing Products CSV file
const dataDir = path.join(__dirname, 'dataCsv');

// Directory to save the output XLSX files
const outputDir = path.join(__dirname, 'outputCsv');

// Create the output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Create a set to track unique productCardImages
const uniqueProductImages = new Set();

// Excel column headers
const excelHeaders = [
  'productName',
  'productCardImage',
  'variantName',
  'variantDescription',
  'metaTitle',
  'metaDescription',
  'nameInCategoryPage',
  'slug',
  'countries',
  'baseCategory',
  'brand',
  'productType',
  'offerId',
  'productKind',
  'nameInAboutSection',
];

// Function to determine the type based on the ID prefix or Subtype
function determineType(subtype) {
  if (categories.esim.some((c) => c.name === subtype)) {
    return 'esim';
  }
  if (categories.topup.some((c) => c.name === subtype)) {
    return 'topup';
  }
  if (categories.voucher.some((c) => c.name === subtype)) {
    return 'voucher';
  }
  // Default to 'voucher' if no specific subtype matches
  return 'voucher';
}

// Function to check if an item is a regional eSIM product
function isRegionalEsim(item) {
  // Check if it's an eSIM product
  if (determineType(item.Subtype) !== 'esim') {
    return false;
  }

  // Check if it's a regional product (World or Multi-Region)
  return item.Country.includes('Region');
}

// Function to fetch available countries for a regional eSIM product from Zendit API
async function fetchRegionalEsimData(offerId) {
  try {
    logger.info(`Fetching regional data for eSIM product: ${offerId}`);

    const zenditApiKey =
      process.env.ZENDIT_API_KEY ||
      'sand_d8f5d83a-5104-466d-a5e9-01c66091350b6777f72b36cc922c5d5bfbfa';
    if (!zenditApiKey) {
      logger.error('ZENDIT_API_KEY not found in environment variables');
      return null;
    }

    // Correct Zendit API endpoint for esim offers
    const response = await axios.get(
      `https://api.zendit.io/v1/esim/offers/${offerId}`,
      {
        headers: {
          Authorization: `Bearer ${zenditApiKey}`,
          'Content-Type': 'application/json',
        },
        validateStatus: (status) => status < 500, // Accept any response < 500 to handle 404s gracefully
      }
    );

    // Add delay to avoid API rate limits
    await sleep(300);

    if (response.status === 200 && response.data) {
      logger.info(`Successfully retrieved data for eSIM product: ${offerId}`);

      // Log the structure of the response for debugging
      logger.debug(
        `API response structure for ${offerId}: ${JSON.stringify(
          Object.keys(response.data)
        )}`
      );

      // Check for roaming data availability
      if (response.data.roaming && response.data.roaming.length > 0) {
        logger.info(
          `Found ${response.data.roaming.length} roaming countries in response for ${offerId}`
        );
      } else {
        logger.warn(`No roaming data found in response for ${offerId}`);
      }

      return response.data;
    } else if (response.status === 404) {
      logger.warn(`eSIM product not found: ${offerId}`);
      return null;
    } else {
      logger.warn(
        `Unexpected response for eSIM product ${offerId}: ${response.status}`
      );
      return null;
    }
  } catch (error) {
    logger.error(
      `Error fetching regional eSIM data for ${offerId}: ${error.message}`,
      { error }
    );
    return null;
  }
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

// Helper function to create a row of data for Excel for an item
function createExcelRow(item, countryCode) {
  // Determine type based on item ID prefix
  const type = determineType(item.Subtype);

  // Ensure subTypes is an array if present
  let subTypes = [];
  if (item.Subtype && item.Subtype !== '-') {
    subTypes = [item.Subtype];
  } else if (type === 'voucher') {
    logger.warn(`Voucher ${item.ID} has no Subtype. Setting default.`);
    subTypes = ['Shopping']; // Default subType for vouchers
  }

  // 1. productName
  const productName = item.Brand || '';

  // 2. productCardImage
  const productCardImage = formatProductNameForImage(productName);

  // Add to unique images set
  uniqueProductImages.add(productCardImage);

  // 3. variantName
  let variantName = productName;
  if (type === 'voucher') {
    variantName += ' Gift Card';
  }

  // 4. variantDescription
  let variantDescription = item['Product Notes Short'] || item['Product Notes'];
  if (!variantDescription || variantDescription === '-') {
    variantDescription = `Buy ${productName} Gift Card for use in ${item.Country}. Buy now and receive your code instantly with no waiting or hassle. The process is simple - purchase, receive your code, and use or share in minutes. Digital delivery ensures your voucher reaches you instantly and free of charge.`;
  }

  // 5. metaTitle
  let metaTitle = productName;
  if (type === 'voucher') {
    metaTitle += ' Gift Card';
  }
  metaTitle += ` | ${MERCHANT_NAME}`;

  // 6. metaDescription
  let metaDescription = `Buy ${productName}`;
  if (type === 'voucher') {
    metaDescription += ' Gift Card';
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
  } else if (type === 'voucher' && subTypes && subTypes.length > 0) {
    const subType = subTypes[0];
    // Use safe access pattern to avoid errors if categories.voucher is undefined
    if (categories && categories.voucher) {
      const category = categories.voucher.find((c) => c.name === subType);
      if (category) {
        baseCategory = category.baseCategory;
      } else {
        // Default for unknown voucher subtypes
        logger.warn(
          `Unknown voucher subtype "${subType}" for offer ${item.ID}. Using default.`
        );
        baseCategory = 'shopping-gift-cards';
      }
    } else {
      // Default if categories.voucher is missing
      logger.warn(
        `categories.voucher is undefined. Using default for offer ${item.ID}.`
      );
      baseCategory = 'shopping-gift-cards';
    }
  }

  // 11. brand
  const brand = item.Brand || '';

  // 12. productType
  const productType = (type || '').toUpperCase();

  // 13. offerId
  const offerId = item.ID || '';

  // 14. productKind
  let productKind = '';
  if (type === 'esim') {
    productKind = 'esim';
  } else if (type === 'topup') {
    productKind = 'mobile_topup';
  } else if (type === 'voucher' && subTypes && subTypes.length > 0) {
    const subType = subTypes[0];
    // Use safe access pattern to avoid errors if categories.voucher is undefined
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
    nameInAboutSection += ' Gift Card';
  }

  // Return as array for Excel row
  return [
    productName,
    productCardImage,
    variantName,
    variantDescription,
    metaTitle,
    metaDescription,
    nameInCategoryPage,
    slug,
    countryValue,
    baseCategory,
    brand,
    productType,
    offerId,
    productKind,
    nameInAboutSection,
  ];
}

// Function to create a row of data for Excel specifically for regional products with multiple countries
function createRegionalExcelRow(item, countriesStr) {
  // Determine type based on item ID prefix
  const type = determineType(item.Subtype);

  // Ensure subTypes is an array if present
  let subTypes = [];
  if (item.Subtype && item.Subtype !== '-') {
    subTypes = [item.Subtype];
  } else if (type === 'voucher') {
    logger.warn(`Voucher ${item.ID} has no Subtype. Setting default.`);
    subTypes = ['Shopping']; // Default subType for vouchers
  }

  // 1. productName
  const productName = item.Brand || '';

  // 2. productCardImage
  const productCardImage = formatProductNameForImage(productName);

  // Add to unique images set
  uniqueProductImages.add(productCardImage);

  // 3. variantName
  let variantName = productName;
  if (type === 'voucher') {
    variantName += ' Gift Card';
  }

  // 4. variantDescription
  let variantDescription = item['Product Notes Short'] || item['Product Notes'];
  if (!variantDescription || variantDescription === '-') {
    variantDescription = `Buy ${productName} eSIM for use in multiple countries. Buy now and receive your code instantly with no waiting or hassle. The process is simple - purchase, receive your code, and use or share in minutes.`;
  }

  // 5. metaTitle
  let metaTitle = productName;
  if (type === 'voucher') {
    metaTitle += ' Gift Card';
  }
  metaTitle += ` | ${MERCHANT_NAME}`;

  // 6. metaDescription
  let metaDescription = `Buy ${productName}`;
  if (type === 'voucher') {
    metaDescription += ' Gift Card';
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
    baseCategory = 'esim';
  } else if (type === 'topup') {
    baseCategory = 'mobile-top-up';
  } else if (type === 'voucher' && subTypes && subTypes.length > 0) {
    const subType = subTypes[0];
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
  const brand = item.Brand || '';

  // 12. productType
  const productType = (type || '').toUpperCase();

  // 13. offerId
  const offerId = item.ID || '';

  // 14. productKind
  let productKind = '';
  if (type === 'esim') {
    productKind = 'esim';
  } else if (type === 'topup') {
    productKind = 'mobile_topup';
  } else if (type === 'voucher' && subTypes && subTypes.length > 0) {
    const subType = subTypes[0];
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
    nameInAboutSection += ' Gift Card';
  }

  // Return as array for Excel row
  return [
    productName,
    productCardImage,
    variantName,
    variantDescription,
    metaTitle,
    metaDescription,
    nameInCategoryPage,
    slug,
    countryValue,
    baseCategory,
    brand,
    productType,
    offerId,
    productKind,
    nameInAboutSection,
  ];
}

// Function to process CSV data and create Excel workbook
async function processCsvToExcel(csvData) {
  const startTime = new Date();
  logger.info('Processing Products.csv...');

  // Parse CSV data
  // Skip the first row which contains 'sep=;'
  const records = parse(csvData.slice(csvData.indexOf('\n') + 1), {
    columns: true,
    delimiter: ';',
    skip_empty_lines: true,
    trim: true,
  });

  // Create a new workbook
  const workbook = new Excel.Workbook();
  const worksheet = workbook.addWorksheet('Offers');

  // Add column headers
  worksheet.addRow(excelHeaders);

  // Style the header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }, // Light gray
  };

  // Статистика
  let stats = {
    total: records.length,
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

  logger.info(`Found ${records.length} total records in Products.csv`);

  // Process records asynchronously
  for (const item of records) {
    // Skip items that don't have the necessary data
    if (!item.ID || !item.Country || !item.Brand) {
      logger.warn(`Item is missing required data. Skipping.`);
      stats.missingData++;
      stats.skipped++;
      continue;
    }

    // Check if this is a regional eSIM product
    if (isRegionalEsim(item)) {
      logger.info(
        `Processing regional eSIM product: ${item.ID} for ${item.Country}`
      );
      stats.regionalRequests++;

      // Fetch regional data from Zendit API
      const regionalData = await fetchRegionalEsimData(item.ID);

      // Extract country codes from roaming array in the API response
      const countryCodes =
        regionalData && regionalData.roaming
          ? regionalData.roaming.map((item) => item.country)
          : [];

      if (!regionalData || !countryCodes.length) {
        logger.warn(
          `No regional data found for eSIM product: ${item.ID}. Processing as normal product.`
        );
        stats.regionalFailed++;

        // Process as normal (non-regional) product - continue with normal flow below
      } else {
        logger.info(
          `Found ${countryCodes.length} countries for regional eSIM product: ${item.ID}`
        );
        stats.regionalSuccess++;

        // Store the mapping of regional label to country codes
        regionalMappings.set(item.Country, countryCodes);

        // Get all valid country codes and corresponding labels
        const validCountries = [];
        const validCountryCodes = [];
        const validCountryNames = [];

        for (const countryCode of countryCodes) {
          const countryObject = countries.find((c) => c.value === countryCode);
          if (!countryObject) {
            logger.warn(
              `Country with code "${countryCode}" not found in countries.json for eSIM product: ${item.ID}`
            );
            continue;
          }
          validCountries.push(countryObject);
          validCountryCodes.push(countryCode);
          validCountryNames.push(countryObject.label);
        }

        if (validCountries.length === 0) {
          logger.warn(
            `No valid countries found for regional eSIM product: ${item.ID}. Skipping.`
          );
          stats.skipped++;
          continue;
        }

        // Create single entry with all country codes joined by commas
        const countriesStr = validCountryCodes.join(',');

        // Create Excel row with all countries combined
        const excelRow = createRegionalExcelRow(item, countriesStr);
        worksheet.addRow(excelRow);

        stats.processed++;
        stats.regionalCountriesProcessed += validCountries.length;
        logger.info(
          `Created single entry with ${validCountries.length} countries for regional eSIM product: ${item.ID}`
        );

        // Skip the regular processing for this item since we've created country-specific entries
        continue;
      }
    }

    // Regular processing path (for non-regional products or failed regional lookups)

    // Skip items for countries that are not in the countries.json file
    const foundCountry = countries.find((c) => c.label === item.Country);
    if (!foundCountry) {
      logger.warn(
        `Country "${item.Country}" not found in countries.json. Skipping offer ${item.ID}.`
      );
      missingCountries.add(item.Country);
      stats.countryNotFound++;
      stats.skipped++;
      continue;
    }

    // Create Excel row for the item
    const excelRow = createExcelRow(item, foundCountry.value);
    worksheet.addRow(excelRow);
    stats.processed++;
  }

  // Auto-size columns for better readability
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const columnLength = cell.value ? cell.value.toString().length : 10;
      if (columnLength > maxLength) {
        maxLength = columnLength;
      }
    });
    column.width = Math.min(maxLength + 2, 100); // Cap at 100 characters width
  });

  // Calculate processing time
  const endTime = new Date();
  const processingTime = (endTime - startTime) / 1000; // in seconds

  // Logging stats
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

  // Logging missing countries
  if (missingCountries.size > 0) {
    logger.warn(`Missing countries (${missingCountries.size}):`);
    Array.from(missingCountries)
      .sort()
      .forEach((country) => {
        logger.warn(`- "${country}"`);
      });

    // Save missing countries to a file
    const missingCountriesContent = Array.from(missingCountries)
      .sort()
      .join('\n');
    fs.writeFileSync(
      path.join(outputDir, 'missing-countries.txt'),
      missingCountriesContent,
      'utf8'
    );
    logger.info(`Missing countries saved to outputCsv/missing-countries.txt`);
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
    logger.info(`Regional mappings saved to outputCsv/regional-mappings.txt`);
  }

  return workbook;
}

// Main function to process the CSV file and create an Excel file
async function convertCsvToXlsx() {
  const csvFilePath = path.join(dataDir, 'Products.csv');
  const startTime = new Date();

  try {
    logger.info(`Starting to read file: ${csvFilePath}`);
    // Read the CSV file
    const fileContent = fs.readFileSync(csvFilePath, 'utf8');

    // Process the CSV data and create Excel workbook
    const workbook = await processCsvToExcel(fileContent);

    // Save to XLSX file
    const outputFilePath = path.join(outputDir, 'Offers.xlsx');
    await workbook.xlsx.writeFile(outputFilePath);

    logger.info(`Successfully created Offers.xlsx`);

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
      `Required images list saved to outputCsv/required-images.txt in alphabetical order`
    );
    logger.info(
      `Found ${uniqueProductImages.size} unique product images to prepare.`
    );
    logger.info(
      `Total execution time: ${totalProcessingTime.toFixed(2)} seconds`
    );
  } catch (error) {
    logger.error(`Error processing CSV file: ${error.message}`, { error });
    throw error; // Re-throw to be caught by the main wrapper
  }
}

// Run the conversion
logger.info('Starting CSV to XLSX conversion...');
(async () => {
  try {
    await convertCsvToXlsx();
    logger.info('CSV to XLSX conversion script finished successfully');
  } catch (err) {
    logger.error(`CSV to XLSX conversion script failed: ${err.message}`);
    process.exit(1);
  }
})();
