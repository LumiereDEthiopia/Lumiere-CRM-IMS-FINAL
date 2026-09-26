# Employee Management

## Overview

Complete employee management system for the Lumière business management platform.

## Employee vs User

- **Employee**: A real business employee with employment records
- **User**: An application login account
- An employee does NOT need to have a login account
- Relationship: Employee → optional User (one-to-one)

## Employee Model

### Fields

- `employeeCode` - Unique code (EMP-0001, EMP-0002, etc.)
- `firstName`, `middleName`, `lastName`, `preferredName`
- `gender`, `dateOfBirth`
- `phone`, `alternativePhone`, `email`
- `address`, `city`, `country`
- `emergencyContactName`, `emergencyContactPhone`
- `jobTitle`
- `departmentId` - Department assignment
- `employmentType` - FULL_TIME, PART_TIME, CONTRACT, TEMPORARY, INTERN, FREELANCE
- `employmentStatus` - ACTIVE, ON_LEAVE, SUSPENDED, RESIGNED, TERMINATED, RETIRED
- `hireDate`, `terminationDate`
- `locationId` - Branch/location assignment
- `managerId` - Self-referencing hierarchy
- `salary`, `salaryCurrency` (sensitive - requires permission)
- `notes`
- `profileImageUrl`, `profileImageKey`
- `userId` - Optional linked user account

### Employee Code

- Format: EMP-0001, EMP-0002, etc.
- Auto-generated on creation
- Unique constraint
- Prevents duplicates even with concurrent requests

### Manager Hierarchy

- Self-referencing relationship
- Prevents self-management
- Prevents circular management relationships
- Unlimited depth

## API Endpoints

- `GET /api/employees` - List with search, filters, pagination
- `GET /api/employees/:id` - Get with full details
- `POST /api/employees` - Create new employee
- `PUT /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Deactivate (not delete)

### Search & Filters

- Search: employeeCode, firstName, lastName, email, phone, jobTitle
- Filters: department, location, employmentType, employmentStatus, manager
- Pagination: mandatory

## Permissions

- `employee:view` - View employee list
- `employee:create` - Create employees
- `employee:edit` - Edit employees
- `employee:delete` - Deactivate employees
- `employee:view_sensitive` - View salary and sensitive info
- `employee:manage_documents` - Upload/delete documents
- `employee:view_documents` - View employee documents

## Employee Documents

- Stored in Cloudflare R2
- Private access only (not public URLs)
- Authenticated backend access required
- Signed URLs with short expiration
- File validation: MIME type, extension, size, filename
- Server-side object key generation
- Path traversal prevention

## Profile Images

- Stored in R2: `employees/{employeeId}/profile.webp`
- SQLite stores: profileImageUrl, profileImageKey

## Departments

- Database records (not hard-coded)
- Examples: Management, Sales, Inventory, Purchasing, CRM, Finance, Marketing, IT, Administration, Human Resources
- Each has: name, code, description, isActive

## Locations

- Branches, stores, warehouses, offices
- Each has: name, code, description, address, phone, isActive

## Audit Logging

All employee actions are audited:
- Employee creation
- Employee update
- Employee deactivation
- Document upload/delete
- User linking/unlinking

## Data Safety

- Employees are never physically deleted
- Deactivation preserves historical records
- User accounts are deactivated (not deleted) when employee leaves
- Audit logs are preserved