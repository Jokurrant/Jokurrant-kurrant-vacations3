# Kurrant TimeOff - Secure Version

A secure team vacation management app for Hostinger Node.js hosting.

## Features

- ✅ **Secure Authentication** - Passwords hashed with bcrypt, JWT tokens
- ✅ **MySQL Database** - Data persists, included with Hostinger
- ✅ **Admin Controls** - Create users, set blackouts, manage team
- ✅ **Team Calendar** - Filterable by team member
- ✅ **Rate Limiting** - Protection against brute force attacks
- ✅ **Security Headers** - Helmet.js for XSS/CSRF protection

---

## 🚀 Deployment to Hostinger

### Step 1: Create MySQL Database

1. Go to **Hostinger Panel → Databases → MySQL Databases**
2. Create a new database (e.g., `kurrant_timeoff`)
3. Note down:
   - Database name
   - Username
   - Password
   - Host (usually `localhost` or shown in panel)

### Step 2: Run Database Setup

1. Go to **Hostinger Panel → Databases → phpMyAdmin**
2. Select your database
3. Click **SQL** tab
4. Paste contents of `config/database.sql`
5. Click **Go**

### Step 3: Upload Files

1. Go to **Hostinger Panel → Files → File Manager**
2. Navigate to your Node.js app folder (e.g., `public_html` or designated folder)
3. Upload ALL files from this project:
   ```
   config/
   public/
   src/
   package.json
   .env  (create this - see Step 4)
   ```

### Step 4: Create .env File

Create a file named `.env` in your app root with:

```env
# Database (from Hostinger MySQL panel)
DB_HOST=localhost
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=your_database_name
DB_PORT=3306

# Security (CHANGE THIS!)
JWT_SECRET=generate-a-random-64-character-string-here

# Server
PORT=3000
NODE_ENV=production
```

**Generate JWT_SECRET:** Go to https://randomkeygen.com/ and use a "CodeIgniter Encryption Key"

### Step 5: Configure Node.js App

1. Go to **Hostinger Panel → Advanced → Node.js**
2. Click **Create Application**
3. Settings:
   - **Node.js version:** 18.x or higher
   - **Application root:** Your app folder path
   - **Application startup file:** `src/server.js`
   - **Port:** 3000 (or as configured)
4. Click **Create**
5. Click **Run NPM Install**
6. Click **Restart**

### Step 6: Test Your App

Visit your domain - you should see the login page!

**Default login:**
- Email: `admin@kurrant.com`
- Password: `admin123`

⚠️ **IMPORTANT:** Change the admin password immediately after first login!

---

## 📁 Project Structure

```
kurrant-timeoff-secure/
├── config/
│   ├── database.js      # MySQL connection
│   └── database.sql     # Database schema
├── public/
│   ├── index.html       # Frontend HTML
│   ├── app.js           # Frontend JavaScript
│   └── favicon.svg      # App icon
├── src/
│   ├── server.js        # Express server
│   ├── middleware/
│   │   └── auth.js      # JWT authentication
│   └── routes/
│       ├── auth.js      # Login/logout/password
│       ├── users.js     # User management
│       ├── vacations.js # Vacation requests
│       └── blackouts.js # Blackout periods
├── .env.example         # Environment template
├── package.json
└── README.md
```

---

## 🔒 Security Features

| Feature | Implementation |
|---------|---------------|
| Password Hashing | bcrypt (10 rounds) |
| Authentication | JWT tokens (7-day expiry) |
| Session Storage | HTTP-only cookies |
| Rate Limiting | 100 req/15min, 10 login attempts/15min |
| Headers | Helmet.js (CSP, XSS, etc.) |
| SQL Injection | Prepared statements |

---

## 📋 API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password

### Users (Admin only for create/delete)
- `GET /api/users` - List all users
- `POST /api/users` - Create user
- `PATCH /api/users/:id/role` - Toggle admin role
- `DELETE /api/users/:id` - Delete user

### Vacations
- `GET /api/vacations` - List all vacations
- `GET /api/vacations/my` - My vacations
- `POST /api/vacations` - Request vacation
- `DELETE /api/vacations/:id` - Cancel vacation

### Blackouts (Admin only)
- `GET /api/blackouts` - List blackouts
- `POST /api/blackouts` - Create blackout
- `DELETE /api/blackouts/:id` - Delete blackout

---

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Create .env file (copy from .env.example)
cp .env.example .env
# Edit .env with your local MySQL credentials

# Run database setup
# Import config/database.sql into your local MySQL

# Start development server
npm run dev

# Open http://localhost:3000
```

---

## 🔧 Troubleshooting

### "Database connection failed"
- Check .env credentials match Hostinger MySQL panel
- Ensure database exists and tables are created

### "Cannot GET /"
- Check `src/server.js` is set as startup file
- Run `npm install` in Hostinger Node.js panel
- Restart the application

### "Invalid token" errors
- Clear browser cookies
- Check JWT_SECRET is set in .env

### App won't start
- Check Node.js version is 18+
- Check all files uploaded correctly
- Look at error logs in Hostinger panel

---

## 📧 Adding Email Notifications (Optional)

To enable Postmark emails, add to .env:

```env
POSTMARK_TOKEN=your-postmark-server-token
POSTMARK_FROM=notifications@yourdomain.com
```

Then update `src/routes/` files to use the email service.

---

## License

MIT - Built for Kurrant
