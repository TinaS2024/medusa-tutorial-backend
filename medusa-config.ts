import { loadEnv, defineConfig } from '@medusajs/framework/utils';
import path from 'path';

const cwd = process.cwd()
const isCompiledServerDir = path.basename(cwd) === 'server' && path.basename(path.dirname(cwd)) === '.medusa';

const envDir = isCompiledServerDir ? path.resolve(cwd, '..', '..') : cwd;

loadEnv(process.env.NODE_ENV || 'development', envDir);

// Aufsplittung der CORS-Strings sicher in echte Arrays
const storeCorsString = process.env.STORE_CORS || "http://localhost:8000,http://localhost:3000";
const adminCorsString = process.env.ADMIN_CORS || "http://localhost:5173,http://localhost:9000";
const authCorsString = process.env.AUTH_CORS || "http://localhost:5173,http://localhost:9000,http://localhost:8000";

const modules: any[] = [
  {
    resolve: "./src/modules/bundled-product",
  },
  {
    resolve: "@medusajs/translation",
  },
  {
    resolve: "@medusajs/medusa/notification",
    options: {
      providers: [
        {
          resolve: "@medusajs/medusa/notification-local",
          id: "local",
          options: { channels: ["email"] },
        },
      ],
    },
  },
];

// Stripe nur registrieren, wenn ein Key gesetzt ist (sonst inaktiv – keine echte Zahlung)
if (process.env.STRIPE_API_KEY) {
  modules.push({
    resolve: "@medusajs/medusa/payment",
    options: {
      providers: [
        {
          resolve: "@medusajs/payment-stripe",
          id: "stripe",
          options: {
            apiKey: process.env.STRIPE_API_KEY,
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
            capture: true,
          },
        },
      ],
    },
  });
}

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http:{ 
    storeCors: storeCorsString,
    adminCors: adminCorsString,
    authCors: authCorsString,
    jwtSecret: process.env.JWT_SECRET || "supersecret",
    cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  modules,
  featureFlags: {
    translation: true,
  },
})

