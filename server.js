const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { body, validationResult } = require('express-validator');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4242;

// In-memory storage (will reset on server restart)
let projectData = {
  totalClicks: 0,
  currentGoal: 1000000, // 10,000 in cents (R$ 100.00 or $100.00)
  totalRaised: 0,
  charityName: "Jocum"
};

// Admin configuration
let adminConfig = {
  username: 'admin',
  password: '1234',
  amount: 100, // Value per click in cents
  donationPercent: 50, // Percentage to donate
  charityPhone: '',
  charityWebsite: '',
  charityPix: '00020101021126580014br.gov.bcb.pix01366e42077e-6c9b-4a55-ba08-88660925fc9452040000530398654041.005802BR5923NICHOLAS RODRIGUES LEAL6009SAO PAULO622905251K3T2FRSJ124PDBG9EV21BG186304442A'
};

// Simple JWT-like token storage (in production, use proper JWT)
let adminTokens = new Set();

// Price IDs for different currencies
const PRICE_IDS = {
  'BRL': 'price_1RupyW7hbmQxAWthDISrdEUV',
  'USD': 'price_1RuveS7hbmQxAWthvgdy1PME',
  'EUR': 'price_1RuvfN7hbmQxAWthWkPgcVEs',
  'GBP': 'price_1RuvkX7hbmQxAWthaVVKQ5Vq',
  'JPY': 'price_1RuvmD7hbmQxAWthNkg0uyyU',
  'CAD': 'price_1RuvrY7hbmQxAWthdafnau9n',
  'AUD': 'price_1RuvsP7hbmQxAWthXJDYOvNA',
  'CHF': 'price_1Ruvsq7hbmQxAWthjt9hlR3v',
  'MXN': 'price_1RuvtH7hbmQxAWthKLMNpqrS'
};

// Currency amounts (in cents/smallest unit)
const CURRENCY_AMOUNTS = {
  'BRL': 100,    // R$ 1,00
  'USD': 100,    // $1.00
  'EUR': 100,    // €1.00
  'GBP': 100,    // £1.00
  'JPY': 150,    // ¥150
  'CAD': 100,    // CAD $1.00
  'AUD': 100,    // AUD $1.00
  'CHF': 100,    // CHF 1.00
  'MXN': 2000    // $20.00 MXN
};

// Country to currency mapping
const COUNTRY_CURRENCY_MAP = {
  'BR': 'BRL', 'US': 'USD', 'DE': 'EUR', 'FR': 'EUR', 'IT': 'EUR', 'ES': 'EUR',
  'NL': 'EUR', 'BE': 'EUR', 'AT': 'EUR', 'PT': 'EUR', 'IE': 'EUR', 'FI': 'EUR',
  'GR': 'EUR', 'LU': 'EUR', 'MT': 'EUR', 'CY': 'EUR', 'SK': 'EUR', 'SI': 'EUR',
  'EE': 'EUR', 'LV': 'EUR', 'LT': 'EUR', 'GB': 'GBP', 'JP': 'JPY', 'CA': 'CAD',
  'AU': 'AUD', 'CH': 'CHF', 'MX': 'MXN'
};

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
      frameSrc: ["https://js.stripe.com"],
      connectSrc: ["'self'", "https://api.stripe.com"]
    }
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:4242',
  credentials: true
}));

app.use(morgan('combined'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to get country from IP (simplified)
function getCountryFromIP(ip) {
  // In a real implementation, you would use a GeoIP service
  // For now, we'll default to BR for Brazilian users
  return 'BR';
}

// Helper function to get currency for country
function getCurrencyForCountry(country) {
  return COUNTRY_CURRENCY_MAP[country] || 'USD';
}

// API Routes
app.get('/api/status', (req, res) => {
  const country = getCountryFromIP(req.ip);
  const currency = getCurrencyForCountry(country);
  const amount = adminConfig.amount; // Use admin configured amount
  
  res.json({
    ...projectData,
    currency,
    amount,
    country,
    donationPercent: adminConfig.donationPercent,
    charityPhone: adminConfig.charityPhone,
    charityWebsite: adminConfig.charityWebsite,
    charityPix: adminConfig.charityPix
  });
});

app.post('/api/create-checkout-session', [
  body('currency').isIn(Object.keys(PRICE_IDS)).withMessage('Invalid currency')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid request data' });
    }

    const { currency } = req.body;
    const priceId = PRICE_IDS[currency];

    if (!priceId) {
      return res.status(400).json({ error: 'Currency not supported' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'link'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `https://the-most-expensive-button.vercel.app?success=true`,
      cancel_url: `https://the-most-expensive-button.vercel.app?canceled=true`,
      metadata: {
        currency: currency,
        amount: CURRENCY_AMOUNTS[currency].toString()
      },
      locale: currency === 'BRL' ? 'pt-BR' : 'auto'
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Webhook endpoint for Stripe
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // Update project data
    projectData.totalClicks += 1;
    projectData.totalRaised += parseInt(session.metadata.amount || '100');
    
    // Check if goal is reached and double it
    if (projectData.totalRaised >= projectData.currentGoal) {
      projectData.currentGoal *= 2; // Double the goal when reached
    }
    
    console.log('Payment successful:', {
      clicks: projectData.totalClicks,
      goal: projectData.currentGoal,
      raised: projectData.totalRaised
    });
  }

  res.json({ received: true });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin authentication middleware
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const token = authHeader.substring(7);
  if (!adminTokens.has(token)) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  next();
}

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === adminConfig.username && password === adminConfig.password) {
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    adminTokens.add(token);
    
    // Clean up old tokens (keep only last 5)
    if (adminTokens.size > 5) {
      const tokensArray = Array.from(adminTokens);
      adminTokens.clear();
      tokensArray.slice(-5).forEach(t => adminTokens.add(t));
    }
    
    res.json({ token, message: 'Login successful' });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Get admin settings
app.get('/api/admin/settings', authenticateAdmin, (req, res) => {
  res.json({
    ...projectData,
    ...adminConfig,
    password: undefined // Don't send password
  });
});

// Update admin settings
app.post('/api/admin/settings', authenticateAdmin, (req, res) => {
  const {
    amount,
    currentGoal,
    donationPercent,
    charityName,
    charityPhone,
    charityWebsite,
    charityPix,
    newUsername,
    newPassword
  } = req.body;
  
  // Update admin config
  if (amount !== undefined) adminConfig.amount = parseInt(amount);
  if (currentGoal !== undefined) projectData.currentGoal = parseInt(currentGoal);
  if (donationPercent !== undefined) adminConfig.donationPercent = parseInt(donationPercent);
  if (charityName !== undefined) projectData.charityName = charityName;
  if (charityPhone !== undefined) adminConfig.charityPhone = charityPhone;
  if (charityWebsite !== undefined) adminConfig.charityWebsite = charityWebsite;
  if (charityPix !== undefined) adminConfig.charityPix = charityPix;
  
  // Update credentials if provided
  if (newUsername && newPassword) {
    adminConfig.username = newUsername;
    adminConfig.password = newPassword;
    
    // Invalidate all existing tokens
    adminTokens.clear();
  }
  
  res.json({ message: 'Settings updated successfully' });
});

// Reset to defaults
app.post('/api/admin/reset', authenticateAdmin, (req, res) => {
  // Reset project data (keep clicks and raised amount)
  projectData.currentGoal = 1000000;
  projectData.charityName = "Jocum";
  
  // Reset admin config
  adminConfig.amount = 100;
  adminConfig.donationPercent = 50;
  adminConfig.charityPhone = '';
  adminConfig.charityWebsite = '';
  adminConfig.charityPix = '00020101021126580014br.gov.bcb.pix01366e42077e-6c9b-4a55-ba08-88660925fc9452040000530398654041.005802BR5923NICHOLAS RODRIGUES LEAL6009SAO PAULO622905251K3T2FRSJ124PDBG9EV21BG186304442A';
  
  res.json({ message: 'Settings reset to defaults' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

