const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(client);

const RATE_LIMITS_TABLE = process.env.RATE_LIMITS_TABLE;
const AUTH_RATE_LIMIT = Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE || 5);

if (!RATE_LIMITS_TABLE) {
  console.warn(
    '[rate-limiter] RATE_LIMITS_TABLE environment variable is not set.',
  );
}

function getCallerIp(event) {
  const forwardedFor =
    event.headers?.['X-Forwarded-For'] || event.headers?.['x-forwarded-for'];
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  return (
    event.requestContext?.identity?.sourceIp ||
    event.requestContext?.http?.sourceIp ||
    'unknown'
  );
}

async function assertWithinRateLimit(event, endpointKey, limitOverride) {
  if (!RATE_LIMITS_TABLE) {
    return true;
  }

  const limit = limitOverride || AUTH_RATE_LIMIT;
  const ip = getCallerIp(event);
  const now = Date.now();
  const window = Math.floor(now / 60000);
  const rateKey = `${endpointKey}#${ip}#${window}`;
  const ttlSeconds = Math.floor(now / 1000) + 120;

  try {
    await documentClient.send(
      new PutCommand({
        TableName: RATE_LIMITS_TABLE,
        Item: {
          rate_key: rateKey,
          count: 1,
          ip,
          endpoint: endpointKey,
          window,
          ttl: ttlSeconds,
        },
        ConditionExpression: 'attribute_not_exists(rate_key)',
      }),
    );

    return true;
  } catch (putError) {
    if (putError.name !== 'ConditionalCheckFailedException') {
      throw putError;
    }
  }

  try {
    await documentClient.send(
      new UpdateCommand({
        TableName: RATE_LIMITS_TABLE,
        Key: { rate_key: `${endpointKey}#${ip}#${window}` },
        UpdateExpression: 'SET #count = #count + :inc',
        ConditionExpression: '#count < :limit',
        ExpressionAttributeNames: {
          '#count': 'count',
        },
        ExpressionAttributeValues: {
          ':inc': 1,
          ':limit': limit,
        },
      }),
    );

    return true;
  } catch (updateError) {
    if (updateError.name === 'ConditionalCheckFailedException') {
      return false;
    }
    throw updateError;
  }
}

module.exports = {
  assertWithinRateLimit,
};

