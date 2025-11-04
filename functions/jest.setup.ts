// Load environment variables from .env for testing
import dotenv from 'dotenv';

// Load .env file relative to this file's directory
dotenv.config({ path: './.env' });

console.log('Jest setup: Loaded environment variables from .env');
