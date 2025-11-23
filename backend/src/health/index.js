/**
 * CodeSensei Health Check Lambda
 *
 * Returns basic service status and metadata.
 * Used for monitoring and verifying API Gateway + Lambda connectivity.
 */

exports.handler = async (event) => {
  console.log('Health check invoked', {
    timestamp: new Date().toISOString(),
    requestId: event.requestContext?.requestId,
  });

  const response = {
    status: 'ok',
    service: 'CodeSensei',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'dev',
    region: process.env.REGION || process.env.AWS_REGION,
  };

  const corsOrigin = process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:5173';
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With,Cookie',
    },
    body: JSON.stringify(response),
  };
};

