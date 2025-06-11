#!/usr/bin/env node

/**
 * Script to fetch all offers from Zendit API with pagination
 * JavaScript version of get-all-zendit-offers.sh using axios
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const util = require('util');
const winston = require('winston');
const mkdir = util.promisify(fs.mkdir);
const writeFile = util.promisify(fs.writeFile);

// Base path for saving files
const BASE_PATH = path.join(__dirname, 'dataJson');

// Directory for logs
const LOGS_PATH = path.join(__dirname, 'logsJson');

// Maximum limit per request
const LIMIT = 1024;

// Debug mode (0 = all pages, otherwise limits to specified number)
const DEBUG_MODE = parseInt(process.argv[2] || 0);

// Counters for tracking successful/failed requests
let SUCCESSFUL = 0;
let FAILED = 0;

// Start time
const START_TIME = Date.now();

// Format date for log filenames
function formatDateForFilename() {
  const date = new Date();
  return date
    .toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '')
    .replace(/\..+/, '');
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
      filename: path.join(
        LOGS_PATH,
        `fetch_log_${formatDateForFilename()}.log`
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Отдельный файл для ошибок
    new winston.transports.File({
      filename: path.join(LOGS_PATH, 'fetch-errors.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Headers for the API request
const headers = {
  accept: '*/*',
  'accept-language': 'uk,ru-RU;q=0.9,ru;q=0.8,en-US;q=0.7,en;q=0.6',
  'cache-control': 'no-cache',
  'content-type': 'application/json',
  pragma: 'no-cache',
  priority: 'u=1, i',
  'sec-ch-ua':
    '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  Referer: 'https://console.zendit.io/',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// Cookies for authentication
const cookies =
  '_ga=GA1.1.1479908863.1732524881; hubspotutk=93cd6f14f95eed15f930a0b153fed7c2; ajs_anonymous_id=%2259ac0c24-8e86-4068-b941-23075937b008%22; __hssrc=1; __hstc=259197717.93cd6f14f95eed15f930a0b153fed7c2.1732524881131.1749639714105.1749644083490.28; csrf_token_354a484577109d0f82ac637adeb157082bc4c7188137525d0ac3acd796a3a92c=kan2vUqDBbbWtLV52mJdEd6OCpTQNxoIUQXo16DOGXE=; _gcl_au=1.1.348742045.1749119544.1140989966.1749646604.1749646604; fuji_session=MTc0OTY0NjYwN3w4V0lLYnNPd094MVRzTWVrbl91TVlvSmxhb3JvRmpReGxjLTJNUnI4cGkyUDNoUUlGaUxnNGpqQjlQZk5kNW84dUNIb25IN244bGRRVTdiNHFXc2ptXzEzOFVPX0g2MGxVWE1kcDl5eHl2X1kydWFINF9SRlV2aUZXU1IzcGdubER4NkZHYmVMNmpPVjZIUkVha05zdkV5ODNIVEVKVGFmUFdScmhCaEJCMGtVUFRmamJzQkNnT1RfMkRFMDVHeGFfR1BweXJNZC13WEp4YlpWbE94ZUxWbF9QaVVWc0RZWEtFdmlUNUZwS0hMa0JzRVNUSjc3MTk4V0w0Vk5rLW5nTzZnR1VHQUN3Y2l5Unh0SmZuQnJ8QnNl-y86d5bgE-pFAA-spulnmy_tqIHuw4ABo_bjvf0=; _ga_DKTMF05D9H=GS2.1.s1749646604$o40$g1$t1749646760$j46$l0$h0; SL_C_23361dd035530_SID={"0c492169d898b7e2eee8afad115a460c106c6655":{"sessionId":"rAi2E7cVorpiuKkCR3CiB","visitorId":"h-6HauHEFMjlAVLdLXXJc"},"a0eae5e9aa3e741cc22eb6b6d101041001d6eb3d":{"sessionId":"Tk1-T1IFzbWOKesGIBcCy","visitorId":"5h6hqr5sW8L300tpx2OsY"}}';

// Main execution function
async function main() {
  try {
    // Create the base directory if it doesn't exist
    await mkdir(BASE_PATH, { recursive: true });

    // Create the logs directory if it doesn't exist
    await mkdir(LOGS_PATH, { recursive: true });

    // Log start message
    logger.info('Starting Zendit offers fetch');

    if (DEBUG_MODE > 0) {
      logger.info(`DEBUG MODE: Will execute only ${DEBUG_MODE} requests`);
    } else {
      logger.info(
        `Will execute requests until all offers are fetched (dynamic mode)`
      );
    }

    let continueRequests = true;
    let i = 0;

    // Process requests in a loop
    while (continueRequests) {
      const offset = i * LIMIT;
      const fileNum = i + 1;
      const outputFile = path.join(BASE_PATH, `offers${fileNum}.json`);

      logger.info(
        `Executing request #${fileNum} (offset: ${offset}, limit: ${LIMIT})`
      );

      try {
        // Create request payload
        const requestData = {
          operationName: 'offers',
          variables: {
            query: {
              clientId: '6777f72b36cc922c5d5bfbfa',
              pagination: { limit: LIMIT, offset },
              filter: {
                countryCode: {
                  in: [],
                },
                regions: { in: [] },
                brand: { in: [] },
                subtype: { in: [] },
              },
            },
          },
          query: `query offers($query: OffersQuery!) {
  offers(query: $query) {
    total
    list {
      offerId
      priceType
      type
      enabled
      details {
        __typename
        ... on TopupOfferDetails {
          durationDays
          data {
            gb
            type
            __typename
          }
          sms {
            number
            type
            __typename
          }
          voice {
            minutes
            type
            __typename
          }
          __typename
        }
        ... on ESimOfferDetails {
          durationDays
          data {
            gb
            type
            __typename
          }
          sms {
            number
            type
            __typename
          }
          voice {
            minutes
            type
            __typename
          }
          dataSpeeds
          roamingDetails {
            dataSpeeds
            country {
              code
              name
              __typename
            }
            __typename
          }
          __typename
        }
        ... on VoucherOfferDetails {
          requiredFields
          deliveryType
          __typename
        }
      }
      brand {
        name
        __typename
      }
      country {
        name
        __typename
      }
      regions
      notes
      subTypes
      notesShort: title
      cost {
        currency {
          code
          denomination
          __typename
        }
        fixed
        fx
        max
        min
        __typename
      }
      price {
        currency {
          code
          denomination
          __typename
        }
        fixed
        fx
        margin
        max
        min
        overrideType
        suggestedFixed
        suggestedFx
        __typename
      }
      zend {
        fx
        currency {
          code
          denomination
          __typename
        }
        fixed
        max
        min
        __typename
      }
      __typename
    }
    __typename
  }
}`,
        };

        // Execute the request with axios
        const response = await axios({
          method: 'post',
          url: 'https://console-grql.api.zendit.io/graphql',
          headers: {
            ...headers,
            Cookie: cookies,
          },
          data: requestData,
          timeout: 30000, // 30 seconds timeout
        });

        // Save the response data to the output file
        await writeFile(outputFile, JSON.stringify(response.data, null, 2));

        // Check if the response contains offers data
        if (
          response.data &&
          response.data.data &&
          response.data.data.offers &&
          response.data.data.offers.list &&
          response.data.data.offers.list.length > 0
        ) {
          const offerCount = response.data.data.offers.list.length;
          logger.info(
            `✅ Request ${fileNum} successful - ${offerCount} offers found - Data saved to ${outputFile}`
          );
          SUCCESSFUL++;

          // Check if we've reached the end of available offers
          if (offerCount < LIMIT) {
            logger.info(
              `Received ${offerCount} offers which is less than LIMIT (${LIMIT}) - All offers fetched!`
            );
            continueRequests = false;
          }

          // If in debug mode and we've reached the specified number of requests, stop
          if (DEBUG_MODE > 0 && fileNum >= DEBUG_MODE) {
            logger.info(
              `Debug mode: Reached specified ${DEBUG_MODE} requests limit`
            );
            continueRequests = false;
          }
        } else {
          logger.warn(
            `❌ Request ${fileNum} failed - Response doesn't contain offers data`
          );
          FAILED++;
          continueRequests = false;
        }
      } catch (error) {
        logger.error(`❌ Request ${fileNum} failed - Error: ${error.message}`);
        FAILED++;

        // On error, don't immediately stop - wait and try again in the next iteration
        if (error.response && error.response.status === 429) {
          // Rate limiting error, wait longer
          logger.warn(`Rate limited. Waiting 5 seconds before next request...`);
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      // Increment counter for next iteration
      i++;

      // Add a small delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // End time and calculate duration
    const END_TIME = Date.now();
    const DURATION = (END_TIME - START_TIME) / 1000; // in seconds

    // Total number of requests actually executed
    const totalRequests = SUCCESSFUL + FAILED;

    // Log summary
    const summary = [
      '-------------------------------------',
      '📊 Summary:',
      `Total requests executed: ${totalRequests}`,
      `Successful requests: ${SUCCESSFUL}`,
      `Failed requests: ${FAILED}`,
      `Time taken: ${DURATION} seconds`,
      '-------------------------------------',
    ].join('\n');

    logger.info(summary);
  } catch (error) {
    logger.error(`Script execution failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();
