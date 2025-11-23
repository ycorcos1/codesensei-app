const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE = process.env.USERS_TABLE;

if (!USERS_TABLE) {
  console.warn('[dynamodb-client] USERS_TABLE environment variable is not set.');
}

const normalize = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

async function createUser(user) {
  const item = {
    ...user,
    email: normalize(user.email),
    username: normalize(user.username),
  };

  await documentClient.send(
    new PutCommand({
      TableName: USERS_TABLE,
      Item: item,
      ConditionExpression: 'attribute_not_exists(user_id)',
    })
  );

  return item;
}

async function getUserById(userId) {
  const result = await documentClient.send(
    new GetCommand({
      TableName: USERS_TABLE,
      Key: { user_id: userId },
    })
  );

  return result.Item;
}

async function queryUserByEmail(email) {
  const result = await documentClient.send(
    new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': normalize(email),
      },
      Limit: 1,
    })
  );

  return result.Items && result.Items.length ? result.Items[0] : null;
}

async function queryUserByUsername(username) {
  const result = await documentClient.send(
    new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'UsernameIndex',
      KeyConditionExpression: 'username = :username',
      ExpressionAttributeValues: {
        ':username': normalize(username),
      },
      Limit: 1,
    })
  );

  return result.Items && result.Items.length ? result.Items[0] : null;
}

module.exports = {
  createUser,
  getUserById,
  queryUserByEmail,
  queryUserByUsername,
};

