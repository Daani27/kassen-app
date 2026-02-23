import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { registerAuthRoutes } from './routes/auth.js'
import { registerAppSettingsRoutes } from './routes/appSettings.js'
import { registerProfilesRoutes } from './routes/profiles.js'
import { registerProductsRoutes } from './routes/products.js'
import { registerTransactionsRoutes } from './routes/transactions.js'
import { registerMealsRoutes } from './routes/meals.js'
import { registerGlobalExpensesRoutes } from './routes/globalExpenses.js'
import { registerPushRoutes } from './routes/push.js'
import { registerGuestRoutes } from './routes/guest.js'
import { registerFruehstueckRoutes } from './routes/fruehstueck.js'
import { registerBrandingRoutes } from './routes/branding.js'

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

registerAuthRoutes(app)
registerAppSettingsRoutes(app)
registerProfilesRoutes(app)
registerProductsRoutes(app)
registerTransactionsRoutes(app)
registerMealsRoutes(app)
registerGlobalExpensesRoutes(app)
registerPushRoutes(app)
registerGuestRoutes(app)
registerFruehstueckRoutes(app)
registerBrandingRoutes(app)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Kassen App API läuft auf Port ${PORT}`)
})
