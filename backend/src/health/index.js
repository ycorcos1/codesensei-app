/**
 * CodeSensei Health Check Lambda
 *
 * Returns basic service status and metadata.
 * Used for monitoring and verifying API Gateway + Lambda connectivity.
 */

exports.handler = async (event) => {
  const httpMethod = event.requestContext?.httpMethod || event.httpMethod;
  
  console.log('Health check invoked', {
    timestamp: new Date().toISOString(),
    requestId: event.requestContext?.requestId,
    method: httpMethod,
  });

  const rawAllowedOrigins =
    process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:5173';
  const allowedOrigins = rawAllowedOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const requestOrigin =
    event.headers?.origin || event.headers?.Origin || undefined;

  const corsOrigin = (() => {
    if (!allowedOrigins.length) {
      return requestOrigin || 'http://localhost:5173';
    }
    if (allowedOrigins.includes('*')) {
      return requestOrigin || allowedOrigins[0] || '*';
    }
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      return requestOrigin;
    }
    return allowedOrigins[0];
  })();

  const corsHeaders = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With,Cookie',
    Vary: 'Origin',
  };

  // Handle OPTIONS preflight requests
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  const response = {
    status: 'ok',
    service: 'CodeSensei',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'dev',
    region: process.env.REGION || process.env.AWS_REGION,
  };
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
    body: JSON.stringify(response),
  };
};

