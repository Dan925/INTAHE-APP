process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] ??= 'postgres://postgres:postgres@localhost:5432/intahe_test';
process.env['JWT_SECRET'] ??= 'test-secret';
process.env['JWT_EXPIRES_IN'] ??= '1h';
process.env['PASSWORD_RESET_TOKEN_TTL_MINUTES'] ??= '30';
