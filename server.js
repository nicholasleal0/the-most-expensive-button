const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const Database = require('better-sqlite3');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4242;

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Database
const dbPath = process.env.DATABASE_FILE || './data/project.db';
const db = new Database(dbPath);

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS project_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    current_clicks INTEGER DEFAULT 0,
    click_goal INTEGER DEFAULT 10000,
    total_raised_usd REAL DEFAULT 0.0,
    charity_name TEXT DEFAULT 'Save the Children',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Insert initial data if table is empty
const count = db.prepare('SELECT COUNT(*) as count FROM project_data').get();
if (count.count === 0) {
  db.prepare(`
    INSERT INTO project_data (current_clicks, click_goal, total_raised_usd, charity_name)
    VALUES (0, 10000, 0.0, 'Save the Children')
  `).run();
}

// Price mapping with the user's actual Stripe price IDs
const priceMap = {
  // Default currency (USD)
  DEFAULT: 'price_1RuveS7hbmQxAWthvgdy1PME', // USD

  // Country to price mapping
  BR: 'price_1RupyW7hbmQxAWthDISrdEUV', // BRL - Real Brasileiro
  US: 'price_1RuveS7hbmQxAWthvgdy1PME', // USD - Dólar Americano
  PT: 'price_1RuvfN7hbmQxAWthWkPgcVEs', // EUR - Euro (Portugal)
  DE: 'price_1RuvfN7hbmQxAWthWkPgcVEs', // EUR - Euro (Germany)
  FR: 'price_1RuvfN7hbmQxAWthWkPgcVEs', // EUR - Euro (France)
  ES: 'price_1RuvfN7hbmQxAWthWkPgcVEs', // EUR - Euro (Spain)
  IT: 'price_1RuvfN7hbmQxAWthWkPgcVEs', // EUR - Euro (Italy)
  NL: 'price_1RuvfN7hbmQxAWthWkPgcVEs', // EUR - Euro (Netherlands)
  BE: 'price_1RuvfN7hbmQxAWthWkPgcVEs', // EUR - Euro (Belgium)
  AT: 'price_1RuvfN7hbmQxAWthWkPgcVEs', // EUR - Euro (Austria)
  GB: 'price_1RuvkX7hbmQxAWthaVVKQ5Vq', // GBP - Libra Esterlina
  JP: 'price_1RuvmD7hbmQxAWthNkg0uyyU', // JPY - Iene Japonês
  CA: 'price_1RuvrY7hbmQxAWthdafnau9n', // CAD - Dólar Canadense
  AU: 'price_1RuvsP7hbmQxAWthXJDYOvNA', // AUD - Dólar Australiano
  CH: 'price_1Ruvsq7hbmQxAWthjt9hlR3v', // CHF - Franco Suíço
};

// Currency to USD conversion rates (approximate - in production, use real-time rates)
const currencyRates = {
  BRL: 0.20,  // 1 BRL = ~0.20 USD
  USD: 1.00,  // 1 USD = 1 USD
  EUR: 1.10,  // 1 EUR = ~1.10 USD
  GBP: 1.25,  // 1 GBP = ~1.25 USD
  JPY: 0.0067, // 1 JPY = ~0.0067 USD (so 150 JPY = ~1 USD)
  CAD: 0.75,  // 1 CAD = ~0.75 USD
  AUD: 0.67,  // 1 AUD = ~0.67 USD
  CHF: 1.12,  // 1 CHF = ~1.12 USD
};

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https:"],
    },
  },
}));

app.use(morgan('combined'));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:4242',
  credentials: true
}));

// Webhook endpoint (must be before express.json())
app.post('/webhook', express.raw({type: 'application/json'}), (request, response) => {
  const sig = request.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log(`Webhook signature verification failed: ${err.message}`);
    return response.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('Payment successful for session:', session.id);

    // Get current data
    const currentData = db.prepare('SELECT * FROM project_data ORDER BY id DESC LIMIT 1').get();
    
    // Calculate USD equivalent
    const currency = session.currency.toUpperCase();
    const amountPaid = session.amount_total / 100; // Stripe amounts are in cents
    const usdEquivalent = amountPaid * (currencyRates[currency] || 1.0);

    // Update data in a transaction
    const updateData = db.transaction(() => {
      const newClicks = currentData.current_clicks + 1;
      const newTotalUSD = currentData.total_raised_usd + usdEquivalent;

      db.prepare(`
        UPDATE project_data 
        SET current_clicks = ?, total_raised_usd = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(newClicks, newTotalUSD, currentData.id);

      // Check if goal is reached
      if (newClicks >= currentData.click_goal) {
        console.log('🎉 GOAL REACHED!');
        const donationAmount = newTotalUSD * 0.5;
        console.log(`💰 DONATION TO BE MADE: $${donationAmount.toFixed(2)} USD to ${currentData.charity_name}`);
        
        // Double the goal and reset counters
        const newGoal = currentData.click_goal * 2;
        db.prepare(`
          UPDATE project_data 
          SET click_goal = ?, current_clicks = 0, total_raised_usd = 0.0, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(newGoal, currentData.id);
        
        console.log(`🎯 New goal set: ${newGoal} clicks`);
      }
    });

    updateData();
  }

  response.json({received: true});
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.get('/api/status', (req, res) => {
  try {
    const data = db.prepare('SELECT * FROM project_data ORDER BY id DESC LIMIT 1').get();
    res.json(data);
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

app.post('/api/create-checkout-session', [
  body('country').optional().isLength({ min: 2, max: 2 }).withMessage('Country must be 2 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Detect country from Vercel headers or request body
    const country = req.headers['x-vercel-ip-country'] || req.body.country || 'US';
    
    // Get the appropriate price ID
    const priceId = priceMap[country.toUpperCase()] || priceMap.DEFAULT;
    console.log(`Country detected: ${country}, using Price ID: ${priceId}`);

    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.PUBLIC_URL}?payment=success`,
      cancel_url: `${process.env.PUBLIC_URL}?payment=cancel`,
      metadata: {
        country: country,
        project: 'expensive-button'
      }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Admin route to update charity name (protected by basic auth in production)
app.post('/api/admin/update-charity', [
  body('charity_name').isLength({ min: 1, max: 100 }).withMessage('Charity name must be between 1 and 100 characters')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { charity_name } = req.body;
    db.prepare(`
      UPDATE project_data 
      SET charity_name = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = (SELECT MAX(id) FROM project_data)
    `).run(charity_name);
    
    res.json({ success: true, message: 'Charity name updated successfully' });
  } catch (error) {
    console.error('Error updating charity name:', error);
    res.status(500).json({ error: 'Failed to update charity name' });
  }
});

// Serve the main page
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  db.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

