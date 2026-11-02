-- Properties & Rentals Module — PostgreSQL Migration for RM Holdings
-- Matches existing Supabase schema conventions (uuid PK, business_unit_id FK, timestamps)

CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id UUID NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
  property_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  property_type VARCHAR(50) NOT NULL DEFAULT 'Residential',
  description TEXT,
  country VARCHAR(100) DEFAULT 'Tanzania',
  region VARCHAR(100),
  district VARCHAR(100),
  ward VARCHAR(100),
  street_address VARCHAR(255),
  status VARCHAR(50) DEFAULT 'Active',
  total_units INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_business ON properties(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_properties_code ON properties(property_code);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);

CREATE TABLE IF NOT EXISTS property_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id UUID NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_code VARCHAR(50) NOT NULL,
  unit_name VARCHAR(100),
  floor INTEGER,
  unit_type VARCHAR(50) DEFAULT 'Apartment',
  monthly_rent DECIMAL(12,2) DEFAULT 0,
  occupancy_status VARCHAR(50) DEFAULT 'Vacant',
  operational_status VARCHAR(50) DEFAULT 'Active',
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(property_id, unit_code)
);

CREATE INDEX IF NOT EXISTS idx_units_property ON property_units(property_id);
CREATE INDEX IF NOT EXISTS idx_units_occupancy ON property_units(occupancy_status);

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id UUID NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
  tenant_code VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50),
  alternative_phone VARCHAR(50),
  email VARCHAR(255),
  identification_type VARCHAR(50),
  identification_number VARCHAR(50),
  address TEXT,
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(50),
  notes TEXT,
  status VARCHAR(50) DEFAULT 'Active',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_business ON tenants(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_tenants_name ON tenants(full_name);

CREATE TABLE IF NOT EXISTS rental_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id UUID NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_number VARCHAR(50) NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  rent_amount DECIMAL(12,2) DEFAULT 0,
  billing_frequency VARCHAR(50) DEFAULT 'Monthly',
  deposit_amount DECIMAL(12,2) DEFAULT 0,
  payment_due_day INTEGER DEFAULT 1,
  grace_period_days INTEGER DEFAULT 5,
  contract_terms TEXT,
  status VARCHAR(50) DEFAULT 'Draft',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_unit ON rental_contracts(unit_id);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON rental_contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON rental_contracts(status);

CREATE TABLE IF NOT EXISTS rent_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id UUID NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES rental_contracts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  billing_period_start DATE,
  billing_period_end DATE,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  rent_amount DECIMAL(12,2) DEFAULT 0,
  additional_charges DECIMAL(12,2) DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) GENERATED ALWAYS AS (rent_amount + additional_charges - discount) STORED,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  balance DECIMAL(12,2) GENERATED ALWAYS AS (rent_amount + additional_charges - discount - amount_paid) STORED,
  status VARCHAR(50) DEFAULT 'Unpaid',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_contract ON rent_invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON rent_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON rent_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON rent_invoices(due_date);

CREATE TABLE IF NOT EXISTS rent_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id UUID NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES rent_invoices(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES rental_contracts(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method VARCHAR(50) DEFAULT 'Cash',
  transaction_reference VARCHAR(100),
  received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  status VARCHAR(50) DEFAULT 'Completed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON rent_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON rent_payments(tenant_id);

CREATE TABLE IF NOT EXISTS hall_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id UUID NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  booking_number VARCHAR(50) NOT NULL UNIQUE,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  customer_email VARCHAR(255),
  event_type VARCHAR(50),
  event_description TEXT,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  expected_guests INTEGER DEFAULT 0,
  booking_amount DECIMAL(12,2) DEFAULT 0,
  deposit_required DECIMAL(12,2) DEFAULT 0,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  balance DECIMAL(12,2) GENERATED ALWAYS AS (booking_amount - amount_paid) STORED,
  booking_status VARCHAR(50) DEFAULT 'Pending',
  payment_status VARCHAR(50) DEFAULT 'Unpaid',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_property ON hall_bookings(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON hall_bookings(booking_status);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON hall_bookings(event_date);

CREATE TABLE IF NOT EXISTS property_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id UUID NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES property_units(id) ON DELETE SET NULL,
  expense_category VARCHAR(50) NOT NULL,
  description TEXT,
  amount DECIMAL(12,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method VARCHAR(50) DEFAULT 'Cash',
  vendor_name VARCHAR(255),
  receipt_reference VARCHAR(100),
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_property ON property_expenses(property_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON property_expenses(expense_date);
