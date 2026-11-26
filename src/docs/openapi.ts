/**
 * OpenAPI 3 document. Each feature phase adds its paths and schemas here (or in files
 * imported from here) so Swagger stays in step with the API.
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Clothing Brand API',
    version: '1.0.0',
    description:
      'REST API for the clothing brand e-commerce platform. All prices are in PKR. ' +
      'Successful responses use `{ success: true, data, meta? }`; errors use ' +
      '`{ success: false, error: { code, message, details? }, requestId }`.',
  },
  servers: [{ url: '/api/v1', description: 'Version 1' }],
  tags: [{ name: 'Health', description: 'Liveness and readiness checks' }],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness check',
        responses: {
          '200': {
            description: 'The process is running',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'ok' },
                        uptime: { type: 'number', example: 123.4 },
                        timestamp: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness check (database connectivity)',
        responses: {
          '200': { description: 'All dependencies are reachable' },
          '503': { description: 'A dependency is unavailable' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'accessToken',
        description: 'HTTP-only access token cookie set on login',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Validation failed' },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    location: { type: 'string', enum: ['body', 'query', 'params'] },
                    path: { type: 'string', example: 'email' },
                    message: { type: 'string', example: 'Invalid email address' },
                  },
                },
              },
            },
          },
          requestId: { type: 'string', format: 'uuid' },
        },
      },
    },
  },
};
