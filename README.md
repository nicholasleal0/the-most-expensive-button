# The Most Expensive Button in the World

A fun interactive project where users pay to click a button that does absolutely nothing - except help charity!

## 🎯 Concept

- Users pay a small amount (equivalent to $1 USD in their local currency) to click a button
- The button literally does nothing except increment a counter
- When the click goal is reached, half of all funds raised are donated to charity
- The goal then doubles and the process repeats

## 🌍 Multi-Currency Support

The project automatically detects the user's country and charges in their local currency:
- 🇧🇷 Brazil: R$ 1,00
- 🇺🇸 United States: $1.00
- 🇪🇺 Europe: €1.00
- 🇬🇧 United Kingdom: £1.00
- 🇯🇵 Japan: ¥150
- 🇨🇦 Canada: CAD $1.00
- 🇦🇺 Australia: AUD $1.00
- 🇨🇭 Switzerland: CHF 1.00

## 🛠 Technology Stack

- **Frontend**: HTML, CSS (Tailwind), Vanilla JavaScript
- **Backend**: Node.js, Express.js
- **Database**: SQLite (better-sqlite3)
- **Payments**: Stripe
- **Hosting**: Vercel

## 🚀 Features

- Real-time click counter
- Multi-language support (English/Portuguese)
- Responsive design
- Secure payment processing
- Automatic currency detection
- Progress tracking with visual indicators
- Alert mode when goal is almost reached

## 📦 Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in your Stripe keys
4. Run the development server: `npm run dev`

## 🔧 Environment Variables

```
PORT=4242
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
PUBLIC_URL=https://your-domain.com
ALLOWED_ORIGIN=https://your-domain.com
DATABASE_FILE=./data/project.db
```

## 🎨 Design Philosophy

The project embraces "useless" functionality as an art form while contributing to meaningful causes. It's a commentary on digital consumption and the gamification of charitable giving.

## 📄 License

MIT License - Feel free to fork and create your own version!

---

*"The most expensive button that does absolutely nothing... but everything at the same time."*
