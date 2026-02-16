-- Employee & Expense Management System Migration
-- Run this in Supabase SQL Editor

-- ==================== EMPLOYEES ====================
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code VARCHAR(20) UNIQUE,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100) NOT NULL DEFAULT 'General',
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  joining_date DATE,
  salary_type VARCHAR(30) DEFAULT 'fixed_monthly'
    CHECK (salary_type IN ('fixed_monthly', 'daily_wage', 'commission_based')),
  basic_salary NUMERIC(12,2) DEFAULT 0,
  incentive_structure TEXT,
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-generate employee_code (EMP-001, EMP-002, ...)
CREATE OR REPLACE FUNCTION generate_employee_code()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(employee_code FROM 5) AS INTEGER)), 0) + 1
  INTO next_num
  FROM employees
  WHERE employee_code ~ '^EMP-[0-9]+$';
  
  NEW.employee_code := 'EMP-' || LPAD(next_num::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_employee_code ON employees;
CREATE TRIGGER trg_employee_code
  BEFORE INSERT ON employees
  FOR EACH ROW
  WHEN (NEW.employee_code IS NULL)
  EXECUTE FUNCTION generate_employee_code();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_employee_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_employee_updated ON employees;
CREATE TRIGGER trg_employee_updated
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION update_employee_timestamp();

CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_role ON employees(role);

-- ==================== SALARY PAYMENTS ====================
CREATE TABLE IF NOT EXISTS salary_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL, -- YYYY-MM format
  basic_amount NUMERIC(12,2) DEFAULT 0,
  incentive_amount NUMERIC(12,2) DEFAULT 0,
  overtime_amount NUMERIC(12,2) DEFAULT 0,
  deduction_advance NUMERIC(12,2) DEFAULT 0,
  deduction_penalty NUMERIC(12,2) DEFAULT 0,
  deduction_leave NUMERIC(12,2) DEFAULT 0,
  net_payable NUMERIC(12,2) DEFAULT 0,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  payment_date DATE,
  payment_mode VARCHAR(30) DEFAULT 'cash'
    CHECK (payment_mode IN ('cash', 'bank', 'upi')),
  notes TEXT,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('paid', 'partial', 'pending')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_employee ON salary_payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_month ON salary_payments(month);
CREATE INDEX IF NOT EXISTS idx_salary_status ON salary_payments(status);

-- ==================== MISCELLANEOUS EXPENSES ====================
CREATE TABLE IF NOT EXISTS misc_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL
    CHECK (category IN ('electricity', 'fuel', 'internet', 'rent', 'maintenance', 'office_supplies', 'travel', 'others')),
  description TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_to VARCHAR(255),
  payment_mode VARCHAR(30) DEFAULT 'cash'
    CHECK (payment_mode IN ('cash', 'bank', 'upi')),
  notes TEXT,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_misc_expenses_category ON misc_expenses(category);
CREATE INDEX IF NOT EXISTS idx_misc_expenses_date ON misc_expenses(expense_date);

-- ==================== PROFESSIONALS ====================
CREATE TABLE IF NOT EXISTS professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  service_type VARCHAR(100) NOT NULL, -- CA, Engineer, Legal Advisor, etc.
  contract_type VARCHAR(30) DEFAULT 'monthly'
    CHECK (contract_type IN ('monthly', 'per_project')),
  agreed_fee NUMERIC(12,2) DEFAULT 0,
  contact_phone VARCHAR(20),
  contact_email VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_professionals_status ON professionals(status);

-- ==================== PROFESSIONAL PAYMENTS ====================
CREATE TABLE IF NOT EXISTS professional_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  service_description TEXT,
  invoice_number VARCHAR(100),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tds_deduction NUMERIC(12,2) DEFAULT 0,
  net_amount NUMERIC(12,2) DEFAULT 0,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_mode VARCHAR(30) DEFAULT 'bank'
    CHECK (payment_mode IN ('cash', 'bank', 'upi')),
  notes TEXT,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prof_payments_professional ON professional_payments(professional_id);
CREATE INDEX IF NOT EXISTS idx_prof_payments_date ON professional_payments(payment_date);

-- ==================== RLS POLICIES ====================
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE misc_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_payments ENABLE ROW LEVEL SECURITY;

-- Permissive policies for authenticated users
CREATE POLICY "employees_all" ON employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "salary_payments_all" ON salary_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "misc_expenses_all" ON misc_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "professionals_all" ON professionals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "professional_payments_all" ON professional_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ==================== VERIFICATION ====================
SELECT 'employees table created' AS status;
SELECT 'salary_payments table created' AS status;
SELECT 'misc_expenses table created' AS status;
SELECT 'professionals table created' AS status;
SELECT 'professional_payments table created' AS status;
