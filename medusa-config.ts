import { loadEnv, defineConfig } from '@medusajs/framework/utils';
import path from 'path';

const cwd = process.cwd()
const isCompiledServerDir = path.basename(cwd) === 'server' && path.basename(path.dirname(cwd)) === '.medusa';

const envDir = isCompiledServerDir ? path.resolve(cwd, '..', '..') : cwd;

loadEnv(process.env.NODE_ENV || 'development', envDir);

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http:{ 
    storeCors: process.env.STORE_CORS!,
    adminCors: process.env.ADMIN_CORS!,
    authCors: process.env.AUTH_CORS!,
    jwtSecret: process.env.JWT_SECRET || "supersecret",
    cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  
  modules: [
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
            options: {
              channels: ["email"],
            },
          },
        ]
      }
    }
  ],
  featureFlags: {
    translation: true,
  },
})

