const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonBody = (schemaName: string) => ({
  required: true,
  content: { 'application/json': { schema: ref(schemaName) } },
});
const ok = (description: string, data?: Record<string, unknown>) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          ...(data && { data }),
        },
      },
    },
  },
});
const userData = { type: 'object', properties: { user: ref('User') } };
const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: ref('ErrorResponse') } },
});
const secured = [{ cookieAuth: [] }];

export const authTag = {
  name: 'Auth',
  description:
    'Registration, sessions and account recovery. Tokens are set as HTTP-only cookies: a short-lived ' +
    '`accessToken` and a rotating `refreshToken` (sent only to /auth). `Authorization: Bearer` is also accepted.',
};

export const authPaths = {
  '/auth/register': {
    post: {
      tags: ['Auth'],
      summary: 'Create a customer account',
      description: 'Signs the user in and sends a verification email.',
      requestBody: jsonBody('RegisterRequest'),
      responses: {
        '201': ok('Account created', userData),
        '400': error('Validation failed'),
        '409': error('Email already registered'),
        '429': error('Too many attempts'),
      },
    },
  },
  '/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Sign in',
      description:
        'Five failed attempts lock the account for 15 minutes. Errors never reveal whether the email exists.',
      requestBody: jsonBody('LoginRequest'),
      responses: {
        '200': ok('Signed in', userData),
        '401': error('Invalid email or password'),
        '403': error('Account disabled'),
        '423': error('Account temporarily locked'),
        '429': error('Too many attempts'),
      },
    },
  },
  '/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Rotate the refresh token and issue new tokens',
      description:
        'Reusing an already-rotated refresh token revokes the whole session family (theft detection).',
      responses: {
        '200': ok('Tokens refreshed', userData),
        '401': error('Invalid or expired refresh token'),
      },
    },
  },
  '/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Sign out of this device',
      responses: { '200': ok('Signed out') },
    },
  },
  '/auth/logout-all': {
    post: {
      tags: ['Auth'],
      summary: 'Sign out of every device',
      security: secured,
      responses: { '200': ok('Signed out everywhere'), '401': error('Not authenticated') },
    },
  },
  '/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'Current user, role and permissions',
      security: secured,
      responses: { '200': ok('Current user', userData), '401': error('Not authenticated') },
    },
  },
  '/auth/verify-email': {
    post: {
      tags: ['Auth'],
      summary: 'Confirm an email address with the emailed token',
      requestBody: jsonBody('TokenRequest'),
      responses: { '200': ok('Email verified'), '400': error('Invalid or expired link') },
    },
  },
  '/auth/resend-verification': {
    post: {
      tags: ['Auth'],
      summary: 'Send a new verification email',
      security: secured,
      responses: { '200': ok('Email sent'), '401': error('Not authenticated') },
    },
  },
  '/auth/forgot-password': {
    post: {
      tags: ['Auth'],
      summary: 'Request a password reset email',
      description: 'Always answers 200, whether or not the email is registered.',
      requestBody: jsonBody('ForgotPasswordRequest'),
      responses: { '200': ok('Request accepted'), '429': error('Too many attempts') },
    },
  },
  '/auth/reset-password': {
    post: {
      tags: ['Auth'],
      summary: 'Set a new password using the emailed token',
      description: 'The token is single use. Signs out every device.',
      requestBody: jsonBody('ResetPasswordRequest'),
      responses: { '200': ok('Password updated'), '400': error('Invalid or expired link') },
    },
  },
  '/auth/change-password': {
    post: {
      tags: ['Auth'],
      summary: 'Change password while signed in',
      description: 'Signs out every other device and returns a fresh session.',
      security: secured,
      requestBody: jsonBody('ChangePasswordRequest'),
      responses: {
        '200': ok('Password changed', userData),
        '400': error('Wrong current password or invalid new password'),
        '401': error('Not authenticated'),
      },
    },
  },
};

const str = (extra: Record<string, unknown> = {}) => ({ type: 'string', ...extra });
const password = str({
  minLength: 8,
  maxLength: 128,
  description: 'At least one letter and one number',
});

export const authSchemas = {
  User: {
    type: 'object',
    properties: {
      id: str(),
      name: str(),
      email: str({ format: 'email' }),
      phone: str({ example: '+923001234567' }),
      role: str({ example: 'customer' }),
      permissions: { type: 'array', items: str({ example: 'order:read_own' }) },
      isEmailVerified: { type: 'boolean' },
      createdAt: str({ format: 'date-time' }),
    },
  },
  RegisterRequest: {
    type: 'object',
    required: ['name', 'email', 'password'],
    properties: {
      name: str({ minLength: 2, maxLength: 80 }),
      email: str({ format: 'email' }),
      password,
      phone: str({ example: '03001234567', description: 'Pakistani mobile number' }),
    },
  },
  LoginRequest: {
    type: 'object',
    required: ['email', 'password'],
    properties: { email: str({ format: 'email' }), password: str() },
  },
  TokenRequest: { type: 'object', required: ['token'], properties: { token: str() } },
  ForgotPasswordRequest: {
    type: 'object',
    required: ['email'],
    properties: { email: str({ format: 'email' }) },
  },
  ResetPasswordRequest: {
    type: 'object',
    required: ['token', 'password'],
    properties: { token: str(), password },
  },
  ChangePasswordRequest: {
    type: 'object',
    required: ['currentPassword', 'newPassword'],
    properties: { currentPassword: str(), newPassword: password },
  },
};
