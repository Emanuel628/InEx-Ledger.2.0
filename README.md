# InEx Ledger

Simple accounting for 1099 workers and independent contractors.

Track income and expenses, upload receipts, and export clean records for tax time without complex accounting software.

## Live App

[inexledger.com](https://inexledger.com)

## Stack

- **Backend:** Node.js, Express, PostgreSQL
- **Frontend:** Vanilla HTML, CSS, JavaScript
- **Email:** Resend
- **Deployment:** Railway

## Project Structure

- `In-Ex-Ledger-API/` - Backend API server and live frontend bundle under `public/`
- `pdf-worker/` - PDF export microservice

## Features (V1)

- Account creation and secure sign-in
- Income and expense tracking
- Receipt uploads
- CSV and PDF exports for tax prep
- Stripe-backed subscription management
- Multi-factor authentication and session controls
- Multi-language support (English, Spanish, French)
- US and Canada support

## Environment

Use `In-Ex-Ledger-API/.env.example` as the baseline for local or production configuration.
Stripe billing requires `STRIPE_SECRET_KEY`, `STRIPE_PRICE_V1_MONTHLY`, and `STRIPE_WEBHOOK_SECRET`.

## License

PRIVATE - All rights reserved. 
