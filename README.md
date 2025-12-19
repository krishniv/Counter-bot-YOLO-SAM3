
**Prerequisites:**  Node.js

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   - Copy `.env.example` to `.env.local`
   - Add your `GEMINI_API_KEY` for AI vision services
   - Add your `VITE_CLERK_PUBLISHABLE_KEY` from [Clerk Dashboard](https://dashboard.clerk.com)
     - Sign up for a free account at https://clerk.com
     - Create a new application
     - Copy the publishable key from your application settings

3. Run the app:
   ```bash
   npm run dev
   ```

## Authentication

This app uses Clerk for authentication. Users must sign in to access the quality monitoring dashboard. The authentication UI is automatically handled by Clerk components.
