import { loadEnv, defineConfig } from '@medusajs/framework/utils'
import { resolve } from 'path'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

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
  plugins: [
  {
    resolve: "medusa-storage-supabase",
    options: {
      referenceID: process.env.STORAGE_BUCKET_REF,
      serviceKey: process.env.STORAGE_SERVICE_KEY,
      bucketName: process.env.STORAGE_BUCKET_NAME,
    },
  },
]
})

