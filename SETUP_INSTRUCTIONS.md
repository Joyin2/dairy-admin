# Dairy Management System - Setup Instructions

## 🚀 Quick Start Guide

### 1. Database Setup (IMPORTANT - Do this first!)

1. Go to your Supabase project: https://supabase.com/dashboard/project/pyrkflpatgtaaisbkfzb

2. Click on "SQL Editor" in the left sidebar

3. Open the file `supabase-schema.sql` in this project

4. Copy ALL the SQL content and paste it into the Supabase SQL Editor

5. Click "Run" to execute the schema

6. Wait for all tables, indexes, policies, and triggers to be created

### 2. Create Initial Admin User

After running the schema, you need to create your first admin user:

1. Go to "Authentication" → "Users" in Supabase Dashboard

2. Click "Add user" → "Create new user"

3. Enter:
   - Email: `admin@dairy.com`
   - Password: `password123`
   - Confirm password: `password123`

4. Click "Create user"

5. Go back to "SQL Editor" and run this query to link the user to app_users table:

```sql
-- Replace 'YOUR_USER_ID' with the actual UUID from Authentication → Users
INSERT INTO app_users (auth_uid, email, name, role, status)
VALUES (
  'YOUR_USER_ID', -- Get this from Authentication → Users page
  'admin@dairy.com',
  'Admin User',
  'company_admin',
  'active'
);
```

### 3. Enable Realtime (Optional but Recommended)

1. Go to "Database" → "Replication" in Supabase

2. Enable replication for these tables:
   - milk_collections
   - deliveries
   - batches
   - inventory_items

### 4. Run the Application

```bash
npm run dev
```

Visit: http://localhost:3000

Login with:
- Email: `admin@dairy.com`
- Password: `password123`

## 📁 Project Structure

```
dairy-proj/
├── app/
│   ├── login/page.tsx          # Login page
│   ├── dashboard/              # Admin dashboard
│   │   ├── layout.tsx         # Dashboard layout
│   │   ├── page.tsx           # Dashboard home
│   │   ├── users/             # User management
│   │   ├── suppliers/         # Supplier management
│   │   ├── collections/       # Milk collection
│   │   ├── batches/           # Production batches
│   │   └── ...                # Other modules
│   └── page.tsx               # Landing page
├── components/
│   └── dashboard/
│       └── DashboardNav.tsx   # Navigation component
├── lib/
│   └── supabase/
│       ├── client.ts          # Browser client
│       ├── server.ts          # Server client
│       └── middleware.ts      # Auth middleware
├── middleware.ts               # Next.js middleware
├── .env.local                 # Environment variables
└── supabase-schema.sql        # Database schema
```

## 🔐 Authentication Flow

1. User visits any protected route
2. Middleware checks authentication
3. If not authenticated → redirect to /login
4. After login → redirect to /dashboard
5. RLS policies enforce role-based access

## 🎯 Next Steps

### Already Complete:
- ✅ Supabase configuration
- ✅ Authentication system
- ✅ Dashboard layout & navigation
- ✅ Main dashboard with stats

### To Implement:
- [ ] User & Role Management (CRUD)
- [ ] Suppliers Management
- [ ] Shops Management
- [ ] Products Management
- [ ] Milk Collections (with QC approval)
- [ ] Batch Production (with stored procedure)
- [ ] Inventory Management
- [ ] Routes & Deliveries
- [ ] Payments/Ledger
- [ ] Reports & Analytics
- [ ] Real-time updates (Supabase Realtime)

## 📝 Key Features

### Security:
- Row Level Security (RLS) enabled on all tables
- JWT-based authentication
- Role-based access control (company_admin, manufacturer, delivery_agent)

### Performance:
- Optimized indexes on all tables
- Materialized views for reports
- Stored procedures for complex transactions
- PostGIS for geospatial queries

### Real-time:
- Live updates for collections
- Live delivery tracking
- Instant dashboard metrics

## 🐛 Troubleshooting

### Can't login?
- Check that you created the user in Supabase Auth
- Verify you linked auth_uid to app_users table
- Check browser console for errors

### Tables not found?
- Make sure you ran the entire supabase-schema.sql file
- Check Supabase SQL Editor for errors
- Verify all tables exist in "Table Editor"

### Permission errors?
- Check RLS policies are enabled
- Verify user role in app_users table
- Check JWT tokens in browser dev tools

## 📚 Technologies Used

- **Frontend**: Next.js 16 + React 19 + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **Auth**: Supabase Auth with JWT
- **Database**: PostgreSQL with PostGIS
- **Deployment**: Vercel (recommended)

## 🔗 Useful Links

- Supabase Dashboard: https://supabase.com/dashboard/project/pyrkflpatgtaaisbkfzb
- Supabase Docs: https://supabase.com/docs
- Next.js Docs: https://nextjs.org/docs

## 🎉 You're All Set!

The foundation is ready. The admin panel structure is complete with:
- Authentication system
- Dashboard with statistics
- Navigation for all modules
- Database schema with RLS

Next, we'll implement each module (Users, Suppliers, Collections, etc.) incrementally.
