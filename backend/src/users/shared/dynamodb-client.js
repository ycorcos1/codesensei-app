const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');

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

async function updateUser(userId, updates) {
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  if (updates.name !== undefined) {
    updateExpressions.push('#name = :name');
    expressionAttributeNames['#name'] = 'name';
    expressionAttributeValues[':name'] = updates.name;
  }

  if (updates.email !== undefined) {
    updateExpressions.push('#email = :email');
    expressionAttributeNames['#email'] = 'email';
    expressionAttributeValues[':email'] = normalize(updates.email);
  }

  if (updates.username !== undefined) {
    updateExpressions.push('#username = :username');
    expressionAttributeNames['#username'] = 'username';
    expressionAttributeValues[':username'] = normalize(updates.username);
  }

  if (updates.password_hash !== undefined) {
    updateExpressions.push('#password_hash = :password_hash');
    expressionAttributeNames['#password_hash'] = 'password_hash';
    expressionAttributeValues[':password_hash'] = updates.password_hash;
  }

  if (updateExpressions.length === 0) {
    throw new Error('No updates provided');
  }

  const result = await documentClient.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { user_id: userId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    }),
  );

  return result.Attributes;
}

async function deleteUser(userId) {
  await documentClient.send(
    new DeleteCommand({
      TableName: USERS_TABLE,
      Key: { user_id: userId },
    }),
  );
}

module.exports = {
  createUser,
  getUserById,
  queryUserByEmail,
  queryUserByUsername,
  updateUser,
  deleteUser,
};

